import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errRes, jsonRes } from "@/features/account/testing";
import { tokenStore } from "@/lib/api/client";
import { makeMovement } from "../testing";
import { AdminMovements } from "./AdminMovements";

let search = "";
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
  useRouter: () => ({ replace, push: vi.fn() }),
}));

function stubFetch(handler: (path: string) => Response) {
  const mock = vi.fn(async (input: string) => handler(input.replace("/api/v1", "")));
  vi.stubGlobal("fetch", mock);
  return mock;
}

const META = { page: 1, pageSize: 20, total: 3, totalPages: 1 };

beforeEach(() => {
  search = "";
  replace.mockReset();
  tokenStore.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe("AdminMovements", () => {
  it("nhãn lý do tiếng Việt, dấu +/- và màu, link mã đơn, người thao tác/Hệ thống, ghi chú", async () => {
    const data = [
      makeMovement({ id: "m1" }),
      makeMovement({
        id: "m2",
        change: 10,
        stockAfter: 20,
        reason: "RESTOCK",
        orderCode: null,
        actor: { id: "u1", fullName: "Trần Thu" },
        note: "Nhập lô mới",
      }),
      makeMovement({ id: "m3", change: 2, reason: "ORDER_RELEASE" }),
    ];
    const mock = stubFetch(() => jsonRes(200, { data, meta: META }));
    render(<AdminMovements />);
    expect(screen.getByLabelText("Đang tải lịch sử tồn kho")).toBeInTheDocument();

    expect((await screen.findAllByText("Giữ hàng cho đơn")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Nhập hàng").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Hoàn kho từ đơn").length).toBeGreaterThan(0);

    const minus = screen.getAllByText("-2")[0]!;
    expect(minus).toHaveClass("text-danger-600");
    const plus = screen.getAllByText("+10")[0]!;
    expect(plus).toHaveClass("text-moss-800");

    expect(screen.getAllByRole("link", { name: "BB-261110-A2B3" })[0]).toHaveAttribute(
      "href",
      "/admin/don-hang/BB-261110-A2B3",
    );
    expect(screen.getAllByText("Trần Thu").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Hệ thống").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Nhập lô mới").length).toBeGreaterThan(0);
    expect(mock).toHaveBeenCalledWith(
      "/api/v1/admin/inventory/movements?pageSize=20",
      expect.anything(),
    );
  });

  it("lọc theo query: variantId, reason, from/to gửi lên API; đổi lý do cập nhật URL", async () => {
    search = "variantId=v1&reason=RESTOCK,DAMAGE&from=2026-11-01&to=2026-11-10";
    const mock = stubFetch(() => jsonRes(200, { data: [makeMovement()], meta: META }));
    render(<AdminMovements />);
    await screen.findAllByText("Giữ hàng cho đơn");
    const url = new URL(mock.mock.calls[0]![0] as string, "http://x");
    expect(url.searchParams.get("variantId")).toBe("v1");
    expect(url.searchParams.get("reason")).toBe("RESTOCK,DAMAGE");
    expect(url.searchParams.get("from")).toBe("2026-11-01");
    expect(url.searchParams.get("to")).toBe("2026-11-10");
    expect(screen.getByRole("checkbox", { name: "Hư hỏng" })).toBeChecked();
    expect(screen.getByText("Đang lọc theo một biến thể")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: "Kiểm kê" }));
    expect(replace).toHaveBeenLastCalledWith(
      "/admin/ton-kho/lich-su?variantId=v1&reason=RESTOCK%2CDAMAGE%2CSTOCKTAKE&from=2026-11-01&to=2026-11-10",
    );
  });

  it("rỗng -> EmptyState; lỗi -> ErrorState có Thử lại", async () => {
    stubFetch(() => jsonRes(200, { data: [], meta: { ...META, total: 0, totalPages: 0 } }));
    const { unmount } = render(<AdminMovements />);
    expect(await screen.findByText("Chưa có biến động nào")).toBeInTheDocument();
    unmount();

    let n = 0;
    stubFetch(() =>
      ++n === 1
        ? errRes(500, "INTERNAL_ERROR")
        : jsonRes(200, { data: [makeMovement()], meta: META }),
    );
    render(<AdminMovements />);
    const alert = await screen.findByRole("alert");
    await userEvent.click(within(alert).getByRole("button", { name: "Thử lại" }));
    expect((await screen.findAllByText("Giữ hàng cho đơn")).length).toBeGreaterThan(0);
  });

  it("phân trang giữ bộ lọc", async () => {
    search = "variantId=v1&page=2";
    stubFetch(() =>
      jsonRes(200, {
        data: [makeMovement()],
        meta: { page: 2, pageSize: 20, total: 45, totalPages: 3 },
      }),
    );
    render(<AdminMovements />);
    await screen.findAllByText("Giữ hàng cho đơn");
    expect(screen.getByRole("link", { name: "Trang 3" })).toHaveAttribute(
      "href",
      "/admin/ton-kho/lich-su?variantId=v1&page=3",
    );
  });
});
