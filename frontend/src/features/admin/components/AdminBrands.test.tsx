import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bodyOf, errRes, jsonRes, makeUser } from "@/features/account/testing";
import { tokenStore } from "@/lib/api/client";
import type { UserRole } from "@/types/auth";
import { makeBrand } from "../testing";
import { AdminBrands } from "./AdminBrands";

let role: UserRole = "ADMIN";
vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({ status: "authenticated", user: makeUser({ role }) }),
}));

type Handler = (path: string, init: RequestInit) => Response;
function stubFetch(handler: Handler) {
  const mock = vi.fn(async (input: string, init: RequestInit = {}) =>
    handler(input.replace("/api/v1", ""), init),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

const BRANDS = [
  makeBrand(),
  makeBrand({ id: "b2", name: "Timemore", slug: "timemore", productCount: 0 }),
];
const method = (init: RequestInit) => init.method ?? "GET";
const writeIndex = (mock: ReturnType<typeof stubFetch>) =>
  mock.mock.calls.findIndex(([, init]) => method(init as RequestInit) !== "GET");
const withWrite =
  (onWrite: Handler): Handler =>
  (path, init) =>
    method(init) === "GET" ? jsonRes(200, { data: BRANDS }) : onWrite(path, init);

beforeEach(() => {
  role = "ADMIN";
  tokenStore.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe("AdminBrands", () => {
  it("render danh sách thương hiệu với slug và số sản phẩm; lỗi tải có Thử lại", async () => {
    let n = 0;
    stubFetch(() => (++n === 1 ? errRes(500, "INTERNAL_ERROR") : jsonRes(200, { data: BRANDS })));
    render(<AdminBrands />);
    const alert = await screen.findByRole("alert");
    await userEvent.click(within(alert).getByRole("button", { name: "Thử lại" }));
    expect((await screen.findAllByText("Hario")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("timemore").length).toBeGreaterThan(0);
  });

  it("rỗng -> EmptyState", async () => {
    stubFetch(() => jsonRes(200, { data: [] }));
    render(<AdminBrands />);
    expect(await screen.findByText("Chưa có thương hiệu nào")).toBeInTheDocument();
  });

  it("tạo thương hiệu gửi đúng body; SLUG_TAKEN hiện dưới ô slug", async () => {
    let taken = true;
    const mock = stubFetch(
      withWrite(() =>
        taken
          ? errRes(409, "SLUG_TAKEN", "Slug đã tồn tại", { field: "slug" })
          : jsonRes(201, { data: makeBrand({ id: "b3", name: "Kalita" }) }),
      ),
    );
    render(<AdminBrands />);
    await screen.findAllByText("Hario");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Thêm thương hiệu" }));
    const dialog = screen.getByRole("dialog", { name: "Thêm thương hiệu" });
    await user.type(within(dialog).getByLabelText("Tên thương hiệu"), "Kalita");
    await user.type(within(dialog).getByLabelText(/^Slug/), "hario");
    await user.click(within(dialog).getByRole("button", { name: "Tạo thương hiệu" }));
    expect(await within(dialog).findByText(/Slug này đã được dùng/)).toBeInTheDocument();

    taken = false;
    await user.clear(within(dialog).getByLabelText(/^Slug/));
    await user.click(within(dialog).getByRole("button", { name: "Tạo thương hiệu" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const i = mock.mock.calls.findLastIndex(([, init]) => method(init as RequestInit) === "POST");
    expect(mock.mock.calls[i]![0]).toBe("/api/v1/admin/brands");
    expect(bodyOf(mock, i)).toEqual({ name: "Kalita" });
    expect(await screen.findByText("Đã tạo thương hiệu Kalita.")).toBeInTheDocument();
  });

  it("sửa: PATCH chỉ gửi trường thay đổi", async () => {
    const mock = stubFetch(
      withWrite(() => jsonRes(200, { data: makeBrand({ name: "Hario Japan" }) })),
    );
    render(<AdminBrands />);
    await screen.findAllByText("Hario");
    const user = userEvent.setup();
    await user.click(screen.getAllByRole("button", { name: "Sửa Hario" })[0]!);
    const dialog = screen.getByRole("dialog", { name: "Sửa thương hiệu" });
    const name = within(dialog).getByLabelText("Tên thương hiệu");
    await user.clear(name);
    await user.type(name, "Hario Japan");
    await user.click(within(dialog).getByRole("button", { name: "Lưu thay đổi" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const i = writeIndex(mock);
    expect(mock.mock.calls[i]![0]).toBe("/api/v1/admin/brands/b1");
    expect((mock.mock.calls[i]![1] as RequestInit).method).toBe("PATCH");
    expect(bodyOf(mock, i)).toEqual({ name: "Hario Japan" });
  });

  it("validate client: tên trống, slug sai, logo http -> không gọi API", async () => {
    const mock = stubFetch(withWrite(() => jsonRes(201, { data: makeBrand() })));
    render(<AdminBrands />);
    await screen.findAllByText("Hario");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Thêm thương hiệu" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText(/^Slug/), "Sai_Slug");
    await user.type(within(dialog).getByLabelText(/URL logo/), "http://x.vn/a.png");
    await user.click(within(dialog).getByRole("button", { name: "Tạo thương hiệu" }));
    expect(await within(dialog).findByText("Vui lòng nhập tên.")).toBeInTheDocument();
    expect(within(dialog).getByText(/Slug chỉ gồm chữ thường/)).toBeInTheDocument();
    expect(within(dialog).getByText(/URL ảnh phải bắt đầu bằng https/)).toBeInTheDocument();
    expect(writeIndex(mock)).toBe(-1);
  });

  it("nút Xóa chỉ hiện với ADMIN", async () => {
    role = "STAFF";
    stubFetch(() => jsonRes(200, { data: BRANDS }));
    const { unmount } = render(<AdminBrands />);
    await screen.findAllByText("Hario");
    expect(screen.queryByRole("button", { name: /^Xóa/ })).not.toBeInTheDocument();
    unmount();
    role = "ADMIN";
    render(<AdminBrands />);
    expect((await screen.findAllByRole("button", { name: "Xóa Hario" })).length).toBeGreaterThan(0);
  });

  it("xóa: 409 CONFLICT báo số sản phẩm; xóa được thì thông báo", async () => {
    let conflict = true;
    const mock = stubFetch(
      withWrite(() =>
        conflict ? errRes(409, "CONFLICT", "Còn sản phẩm", { productCount: 4 }) : jsonRes(204),
      ),
    );
    render(<AdminBrands />);
    await screen.findAllByText("Hario");
    const user = userEvent.setup();
    await user.click(screen.getAllByRole("button", { name: "Xóa Hario" })[0]!);
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Xóa thương hiệu" }),
    );
    expect(await screen.findByText(/Thương hiệu còn 4 sản phẩm/)).toBeInTheDocument();

    conflict = false;
    await user.click(screen.getAllByRole("button", { name: "Xóa Timemore" })[0]!);
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Xóa thương hiệu" }),
    );
    expect(await screen.findByText("Đã xóa thương hiệu Timemore.")).toBeInTheDocument();
    expect(
      mock.mock.calls.filter(([, init]) => method(init as RequestInit) === "DELETE").length,
    ).toBe(2);
  });
});
