import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errRes, jsonRes, makeUser } from "@/features/account/testing";
import { tokenStore } from "@/lib/api/client";
import { stubProductApi, writes } from "../productTesting";
import { makeAdminProduct, makeProductListItem } from "../testing";
import { AdminProductEditor } from "./AdminProductEditor";
import { AdminProducts } from "./AdminProducts";

let role: "ADMIN" | "STAFF" = "ADMIN";
let search = "";
vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({ status: "authenticated", user: makeUser({ role }) }),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

const META = { page: 1, pageSize: 20, total: 1, totalPages: 1 };
const DELETED_AT = "2026-11-09T03:00:00.000Z";

beforeEach(() => {
  role = "ADMIN";
  search = "";
  tokenStore.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe("Khôi phục sản phẩm - danh sách", () => {
  function stubList(onRestore: () => Response) {
    let restored = false;
    const mock = vi.fn(async (input: string, init: RequestInit = {}) => {
      const path = input.replace("/api/v1", "");
      if ((init.method ?? "GET") === "POST") {
        const res = onRestore();
        if (res.ok) restored = true;
        return res;
      }
      if (path.startsWith("/admin/categories") || path.startsWith("/admin/brands")) {
        return jsonRes(200, { data: [] });
      }
      return jsonRes(200, {
        data: restored ? [] : [makeProductListItem({ deletedAt: DELETED_AT })],
        meta: restored ? { ...META, total: 0 } : META,
      });
    });
    vi.stubGlobal("fetch", mock);
    return mock;
  }

  it("ADMIN + lọc Đã xóa: Khôi phục -> xác nhận -> POST restore -> tải lại danh sách", async () => {
    search = "deleted=true";
    const mock = stubList(() => jsonRes(200, { data: makeAdminProduct() }));
    render(<AdminProducts />);
    const btn = (
      await screen.findAllByRole("button", { name: "Khôi phục sản phẩm Ethiopia Yirgacheffe" })
    )[0]!;
    await userEvent.click(btn);
    const dialog = screen.getByRole("dialog", { name: "Khôi phục sản phẩm" });
    expect(dialog).toHaveTextContent("Sản phẩm sẽ về trạng thái Nháp");
    await userEvent.click(within(dialog).getByRole("button", { name: "Khôi phục" }));
    expect(await screen.findByText("Không có sản phẩm đã xóa")).toBeInTheDocument();
    const posts = mock.mock.calls.filter(
      ([, i]) => (i as RequestInit | undefined)?.method === "POST",
    );
    expect(posts).toHaveLength(1);
    expect(posts[0]![0]).toBe("/api/v1/admin/products/p1/restore");
  });

  it("STAFF không thấy nút Khôi phục", async () => {
    role = "STAFF";
    search = "deleted=true";
    stubList(() => jsonRes(200, { data: makeAdminProduct() }));
    render(<AdminProducts />);
    await screen.findAllByText("Ethiopia Yirgacheffe");
    expect(screen.queryByRole("button", { name: /Khôi phục/ })).not.toBeInTheDocument();
  });

  it("không lọc Đã xóa: không có nút Khôi phục", async () => {
    stubList(() => jsonRes(200, { data: makeAdminProduct() }));
    render(<AdminProducts />);
    await screen.findAllByText("Ethiopia Yirgacheffe");
    expect(screen.queryByRole("button", { name: /Khôi phục/ })).not.toBeInTheDocument();
  });

  it("409 hiện message của server và không tải lại", async () => {
    search = "deleted=true";
    stubList(() => errRes(409, "CONFLICT", "Sản phẩm chưa bị xóa."));
    render(<AdminProducts />);
    await userEvent.click(
      (await screen.findAllByRole("button", { name: /^Khôi phục sản phẩm/ }))[0]!,
    );
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Khôi phục" }),
    );
    expect((await screen.findAllByText("Sản phẩm chưa bị xóa."))[0]).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("Khôi phục sản phẩm - trang sửa", () => {
  const deleted = () => makeAdminProduct({ deletedAt: DELETED_AT });

  it("banner sản phẩm đã xóa có nút Khôi phục; thành công thì banner mất, form sửa được", async () => {
    const mock = stubProductApi({
      product: deleted(),
      onWrite: () => jsonRes(200, { data: makeAdminProduct({ status: "DRAFT" }) }),
    });
    render(<AdminProductEditor id="p1" />);
    await screen.findByText("Sản phẩm đã bị xóa");
    await userEvent.click(screen.getByRole("button", { name: /^Khôi phục sản phẩm/ }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Khôi phục" }),
    );
    await waitFor(() => expect(screen.queryByText("Sản phẩm đã bị xóa")).not.toBeInTheDocument());
    const w = writes(mock);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ method: "POST", path: "/admin/products/p1/restore" });
  });

  it("STAFF không thấy nút Khôi phục ở banner", async () => {
    role = "STAFF";
    stubProductApi({ product: deleted() });
    render(<AdminProductEditor id="p1" />);
    await screen.findByText("Sản phẩm đã bị xóa");
    expect(screen.queryByRole("button", { name: /Khôi phục/ })).not.toBeInTheDocument();
  });

  it("409 hiện message server trong banner", async () => {
    stubProductApi({
      product: deleted(),
      onWrite: () => errRes(409, "CONFLICT", "Sản phẩm không ở trạng thái đã xóa."),
    });
    render(<AdminProductEditor id="p1" />);
    await screen.findByText("Sản phẩm đã bị xóa");
    await userEvent.click(screen.getByRole("button", { name: /^Khôi phục sản phẩm/ }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Khôi phục" }),
    );
    expect(await screen.findByText("Sản phẩm không ở trạng thái đã xóa.")).toBeInTheDocument();
    expect(screen.getByText("Sản phẩm đã bị xóa")).toBeInTheDocument();
  });
});
