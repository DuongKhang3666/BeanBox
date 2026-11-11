import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errRes, jsonRes } from "@/features/account/testing";
import { tokenStore } from "@/lib/api/client";
import { makeAdminListItem, makeStatusCounts } from "../testing";
import { AdminOrders } from "./AdminOrders";

let search = "";
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
  useRouter: () => ({ replace, push: vi.fn() }),
}));

function stubFetch(handler: (path: string, init: RequestInit) => Response) {
  const mock = vi.fn(async (input: string, init: RequestInit = {}) =>
    handler(input.replace("/api/v1", ""), init),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

const META = {
  page: 1,
  pageSize: 20,
  total: 1,
  totalPages: 1,
  statusCounts: makeStatusCounts({ PENDING: 3, SHIPPING: 2 }),
};

beforeEach(() => {
  search = "";
  replace.mockReset();
  tokenStore.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe("AdminOrders", () => {
  it("skeleton -> bảng/thẻ đơn, tab có số lượng từ statusCounts, gọi API đúng", async () => {
    const mock = stubFetch(() =>
      jsonRes(200, {
        data: [makeAdminListItem(), makeAdminListItem({ code: "BB-261110-A2B3", isGuest: true })],
        meta: META,
      }),
    );
    render(<AdminOrders />);
    expect(screen.getByLabelText("Đang tải đơn hàng")).toBeInTheDocument();

    const links = await screen.findAllByRole("link", { name: /BB-261110-K7QP/ });
    expect(links[0]).toHaveAttribute("href", "/admin/don-hang/BB-261110-K7QP");
    expect(screen.getAllByText(/350\.000₫/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\(khách\)/).length).toBeGreaterThan(0);

    expect(screen.getByRole("link", { name: /Tất cả \(5\)/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: /Chờ xác nhận \(3\)/ })).toBeInTheDocument();
    expect(mock).toHaveBeenCalledWith("/api/v1/admin/orders?pageSize=20", expect.anything());
  });

  it("đổi tab -> href chứa status; query trên URL được gửi lên API và đánh dấu tab", async () => {
    search = "status=SHIPPING&paymentStatus=PAID&sort=oldest&q=0901";
    const mock = stubFetch(() =>
      jsonRes(200, { data: [makeAdminListItem({ status: "SHIPPING" })], meta: META }),
    );
    render(<AdminOrders />);
    await screen.findAllByRole("link", { name: /BB-261110-K7QP/ });

    const url = new URL(mock.mock.calls[0]![0] as string, "http://x");
    expect(url.searchParams.get("status")).toBe("SHIPPING");
    expect(url.searchParams.get("paymentStatus")).toBe("PAID");
    expect(url.searchParams.get("sort")).toBe("oldest");
    expect(url.searchParams.get("q")).toBe("0901");

    expect(screen.getByRole("link", { name: /^Đang giao [(]/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    const href = screen.getByRole("link", { name: /^Chờ xác nhận [(]/ }).getAttribute("href")!;
    expect(href).toContain("status=PENDING");
    expect(href).toContain("paymentStatus=PAID");
    expect(href).not.toContain("page=");
  });

  it("đổi bộ lọc thanh toán cập nhật query qua router.replace", async () => {
    stubFetch(() => jsonRes(200, { data: [makeAdminListItem()], meta: META }));
    render(<AdminOrders />);
    await screen.findAllByRole("link", { name: /BB-261110-K7QP/ });
    await userEvent.setup().selectOptions(screen.getByLabelText("Thanh toán"), "PAID");
    expect(replace).toHaveBeenCalledWith("/admin/don-hang?paymentStatus=PAID");
  });

  it("ô tìm: debounce, chỉ cập nhật URL khi >= 2 ký tự", async () => {
    stubFetch(() => jsonRes(200, { data: [makeAdminListItem()], meta: META }));
    render(<AdminOrders />);
    await screen.findAllByRole("link", { name: /BB-261110-K7QP/ });
    const box = screen.getByLabelText(/Tìm theo mã đơn/);
    const user = userEvent.setup();
    await user.type(box, "a");
    await new Promise((r) => setTimeout(r, 600));
    expect(replace).not.toHaveBeenCalled();
    await user.type(box, "b");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/admin/don-hang?q=ab"), {
      timeout: 2000,
    });
  });

  it("rỗng -> EmptyState", async () => {
    stubFetch(() => jsonRes(200, { data: [], meta: { ...META, total: 0, totalPages: 0 } }));
    render(<AdminOrders />);
    expect(await screen.findByText("Không có đơn hàng nào")).toBeInTheDocument();
  });

  it("lỗi -> ErrorState, Thử lại tải được", async () => {
    let n = 0;
    stubFetch(() =>
      ++n === 1
        ? errRes(500, "INTERNAL_ERROR")
        : jsonRes(200, { data: [makeAdminListItem()], meta: META }),
    );
    render(<AdminOrders />);
    const alert = await screen.findByRole("alert");
    await userEvent.click(within(alert).getByRole("button", { name: "Thử lại" }));
    expect(await screen.findAllByRole("link", { name: /BB-261110-K7QP/ })).not.toHaveLength(0);
  });

  it("phân trang giữ bộ lọc", async () => {
    search = "paymentMethod=COD&page=2";
    stubFetch(() =>
      jsonRes(200, {
        data: [makeAdminListItem()],
        meta: { ...META, page: 2, total: 45, totalPages: 3 },
      }),
    );
    render(<AdminOrders />);
    await screen.findAllByRole("link", { name: /BB-261110-K7QP/ });
    expect(screen.getByRole("link", { name: "Trang 3" })).toHaveAttribute(
      "href",
      "/admin/don-hang?paymentMethod=COD&page=3",
    );
    expect(screen.getByRole("link", { name: "Trang 2" })).toHaveAttribute("aria-current", "page");
  });
});
