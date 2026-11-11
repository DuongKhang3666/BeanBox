import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errRes, jsonRes } from "@/features/account/testing";
import { tokenStore } from "@/lib/api/client";
import { makeOrder, makeOrderListItem } from "../testing";
import { AccountOrderDetail } from "./AccountOrderDetail";
import { OrderHistory } from "./OrderHistory";

let search = "";
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
}));

function stubFetch(handler: (path: string, init: RequestInit) => Response) {
  const mock = vi.fn(async (input: string, init: RequestInit = {}) =>
    handler(input.replace("/api/v1", ""), init),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

const META = { page: 1, pageSize: 10, total: 1, totalPages: 1 };

beforeEach(() => {
  search = "";
  tokenStore.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe("OrderHistory", () => {
  it("loading -> danh sách thẻ đơn: mã, badge, tối đa 3 sản phẩm, +N, tổng, link chi tiết", async () => {
    const item = (n: number) => ({
      productName: `Sản phẩm ${n}`,
      variantName: "250 g",
      imageUrl: null,
      quantity: 1,
    });
    const mock = stubFetch(() =>
      jsonRes(200, {
        data: [makeOrderListItem({ items: [item(1), item(2), item(3)], itemCount: 5 })],
        meta: META,
      }),
    );
    render(<OrderHistory />);
    expect(screen.getByLabelText("Đang tải đơn hàng")).toBeInTheDocument();
    const link = await screen.findByRole("link", { name: /BB-261110-K7QP/ });
    expect(link).toHaveAttribute("href", "/tai-khoan/don-hang/BB-261110-K7QP");
    expect(link).toHaveTextContent("Chờ xác nhận");
    expect(link).toHaveTextContent("Sản phẩm 3");
    expect(link).toHaveTextContent("+2 sản phẩm");
    expect(link).toHaveTextContent("350.000₫");
    expect(mock).toHaveBeenCalledWith("/api/v1/me/orders?page=1&pageSize=10", expect.anything());
  });

  it("rỗng -> 'Bạn chưa có đơn hàng nào' + link mua sắm", async () => {
    stubFetch(() => jsonRes(200, { data: [], meta: { ...META, total: 0, totalPages: 0 } }));
    render(<OrderHistory />);
    expect(await screen.findByText("Bạn chưa có đơn hàng nào")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Bắt đầu mua sắm" })).toHaveAttribute("href", "/");
  });

  it("lỗi -> ErrorState, thử lại tải được", async () => {
    let n = 0;
    stubFetch(() =>
      ++n === 1
        ? errRes(500, "INTERNAL_ERROR")
        : jsonRes(200, { data: [makeOrderListItem()], meta: META }),
    );
    render(<OrderHistory />);
    await userEvent.click(await screen.findByRole("button", { name: "Thử lại" }));
    expect(await screen.findByRole("link", { name: /BB-261110-K7QP/ })).toBeInTheDocument();
  });

  it("filter theo query: tab 'Đang giao' gọi status=SHIPPING,FAILED_DELIVERY, đánh dấu tab và phân trang", async () => {
    search = "status=SHIPPING,FAILED_DELIVERY&page=2";
    const mock = stubFetch(() =>
      jsonRes(200, {
        data: [makeOrderListItem({ status: "SHIPPING" })],
        meta: { page: 2, pageSize: 10, total: 25, totalPages: 3 },
      }),
    );
    render(<OrderHistory />);
    await screen.findByRole("link", { name: /BB-261110-K7QP/ });
    const url = String(mock.mock.calls[0]![0]);
    expect(url).toContain("status=SHIPPING%2CFAILED_DELIVERY");
    expect(url).toContain("page=2");
    expect(screen.getByRole("link", { name: "Đang giao" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Tất cả" })).toHaveAttribute(
      "href",
      "/tai-khoan/don-hang",
    );
    expect(screen.getByRole("link", { name: "Đã hủy" })).toHaveAttribute(
      "href",
      "/tai-khoan/don-hang?status=CANCELLED",
    );
    expect(screen.getByRole("link", { name: "Trang 3" })).toHaveAttribute(
      "href",
      "/tai-khoan/don-hang?status=SHIPPING,FAILED_DELIVERY&page=3",
    );
  });
});

describe("AccountOrderDetail", () => {
  const CODE = "BB-261110-K7QP";

  it("hiển thị đủ thông tin và hủy đơn khi canCancel", async () => {
    const mock = stubFetch((path, init) => {
      if (init.method === "POST") {
        return jsonRes(200, {
          data: makeOrder({ status: "CANCELLED", canCancel: false, cancelReason: "Đặt nhầm" }),
        });
      }
      return jsonRes(200, { data: makeOrder() });
    });
    const u = userEvent.setup();
    render(<AccountOrderDetail code={CODE} />);
    expect(await screen.findByRole("heading", { name: `Đơn hàng ${CODE}` })).toBeInTheDocument();
    expect(
      screen.getByText("12 Lê Lợi, Phường Sài Gòn, Thành phố Hồ Chí Minh"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Robusta Buôn Ma Thuột").length).toBeGreaterThan(0);

    await u.click(screen.getByRole("button", { name: "Hủy đơn" }));
    await u.type(screen.getByLabelText(/Lý do hủy/), "Đặt nhầm");
    await u.click(screen.getByRole("button", { name: "Xác nhận hủy đơn" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("Đã hủy đơn hàng thành công.")).toBeInTheDocument();
    expect(screen.getAllByText("Đã hủy").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Hủy đơn" })).not.toBeInTheDocument();
    const post = mock.mock.calls.find(([, i]) => (i as RequestInit).method === "POST")!;
    expect(String(post[0])).toBe(`/api/v1/orders/${CODE}/cancel`);
    expect(JSON.parse((post[1] as RequestInit).body as string)).toEqual({ reason: "Đặt nhầm" });
  });

  it("không có nút Hủy đơn khi canCancel=false", async () => {
    stubFetch(() => jsonRes(200, { data: makeOrder({ status: "SHIPPING", canCancel: false }) }));
    render(<AccountOrderDetail code={CODE} />);
    await screen.findByRole("heading", { name: `Đơn hàng ${CODE}` });
    expect(screen.queryByRole("button", { name: "Hủy đơn" })).not.toBeInTheDocument();
  });

  it("404 -> 'Không tìm thấy đơn hàng' + link danh sách", async () => {
    stubFetch(() => errRes(404, "NOT_FOUND"));
    render(<AccountOrderDetail code={CODE} />);
    expect(await screen.findByText("Không tìm thấy đơn hàng")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xem danh sách đơn hàng" })).toHaveAttribute(
      "href",
      "/tai-khoan/don-hang",
    );
  });

  it("hủy thất bại (409) -> lỗi trong hộp thoại, đơn không đổi", async () => {
    stubFetch((_p, init) =>
      init.method === "POST"
        ? errRes(409, "INVALID_STATUS_TRANSITION")
        : jsonRes(200, { data: makeOrder() }),
    );
    const u = userEvent.setup();
    render(<AccountOrderDetail code={CODE} />);
    await u.click(await screen.findByRole("button", { name: "Hủy đơn" }));
    await u.click(screen.getByRole("button", { name: "Xác nhận hủy đơn" }));
    expect(
      await screen.findByText("Đơn hàng không thể hủy ở trạng thái hiện tại"),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
