import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errRes, jsonRes } from "@/features/account/testing";
import { LAST_ORDER_KEY } from "@/features/checkout/components/CheckoutForm";
import { makeOrder } from "../testing";
import { OrderSuccess } from "./OrderSuccess";

let auth: { status: string };
vi.mock("@/features/auth/AuthProvider", () => ({ useAuth: () => auth }));

const CODE = "BB-261110-K7QP";

function stubFetch(handler: (path: string) => Response) {
  const mock = vi.fn(async (input: string) => handler(input.replace("/api/v1", "")));
  vi.stubGlobal("fetch", mock);
  return mock;
}

beforeEach(() => {
  sessionStorage.clear();
  auth = { status: "anonymous" };
});
afterEach(() => vi.unstubAllGlobals());

describe("OrderSuccess", () => {
  it("guest có sessionStorage khớp mã: hiện mã đơn, COD, email, link tra cứu", () => {
    sessionStorage.setItem(LAST_ORDER_KEY, JSON.stringify(makeOrder()));
    const mock = stubFetch(() => jsonRes(500, {}));
    render(<OrderSuccess code={CODE} />);
    expect(screen.getByTestId("order-code")).toHaveTextContent(CODE);
    expect(screen.getAllByText("Chờ xác nhận").length).toBeGreaterThan(0);
    expect(screen.getByText("Vui lòng chuẩn bị 350.000₫ khi nhận hàng.")).toBeInTheDocument();
    expect(screen.getByText(/Email xác nhận đã được gửi tới an@example.com/)).toBeInTheDocument();
    expect(screen.getAllByText("Robusta Buôn Ma Thuột").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Tra cứu đơn hàng" })).toHaveAttribute(
      "href",
      `/tra-cuu-don-hang?code=${CODE}`,
    );
    expect(screen.getByRole("link", { name: "Tiếp tục mua sắm" })).toHaveAttribute("href", "/");
    expect(mock).not.toHaveBeenCalled();
  });

  it("guest không có sessionStorage (hoặc khác mã): thông báo + link tra cứu kèm mã", () => {
    sessionStorage.setItem(LAST_ORDER_KEY, JSON.stringify(makeOrder({ code: "BB-261110-AAAA" })));
    render(<OrderSuccess code={CODE} />);
    expect(
      screen.getByText("Không thể hiển thị lại chi tiết đơn trên thiết bị này"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tra cứu đơn hàng" })).toHaveAttribute(
      "href",
      `/tra-cuu-don-hang?code=${CODE}`,
    );
  });

  it("user có sessionStorage: nút Xem chi tiết đơn", () => {
    auth = { status: "authenticated" };
    sessionStorage.setItem(LAST_ORDER_KEY, JSON.stringify(makeOrder()));
    render(<OrderSuccess code={CODE} />);
    expect(screen.getByRole("link", { name: "Xem chi tiết đơn" })).toHaveAttribute(
      "href",
      `/tai-khoan/don-hang/${CODE}`,
    );
  });

  it("user không có sessionStorage: tải GET /orders/:code", async () => {
    auth = { status: "authenticated" };
    const mock = stubFetch(() => jsonRes(200, { data: makeOrder() }));
    render(<OrderSuccess code={CODE} />);
    expect(screen.getByLabelText("Đang tải đơn hàng")).toBeInTheDocument();
    expect(await screen.findByTestId("order-code")).toHaveTextContent(CODE);
    expect(mock).toHaveBeenCalledWith(`/api/v1/orders/${CODE}`, expect.anything());
  });

  it("user: 404 -> không tìm thấy; lỗi khác -> thử lại", async () => {
    auth = { status: "authenticated" };
    stubFetch(() => errRes(404, "NOT_FOUND"));
    const { unmount } = render(<OrderSuccess code={CODE} />);
    expect(await screen.findByText("Không tìm thấy đơn hàng")).toBeInTheDocument();
    unmount();

    let n = 0;
    stubFetch(() =>
      ++n === 1 ? errRes(500, "INTERNAL_ERROR") : jsonRes(200, { data: makeOrder() }),
    );
    render(<OrderSuccess code={CODE} />);
    await userEvent.click(await screen.findByRole("button", { name: "Thử lại" }));
    expect(await screen.findByTestId("order-code")).toBeInTheDocument();
  });
});
