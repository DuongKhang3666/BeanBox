import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import type { CartContextValue } from "../CartProvider";
import { makeCart, makeCartItem } from "../testing";
import { CartView } from "./CartView";

let value: CartContextValue;
vi.mock("../CartProvider", () => ({ useCart: () => value }));

function base(over: Partial<CartContextValue> = {}): CartContextValue {
  return {
    cart: makeCart(),
    status: "ready",
    error: null,
    notice: null,
    pending: { adding: false, clearing: false, coupon: false, itemIds: new Set() },
    addItem: vi.fn(),
    updateItem: vi.fn(),
    removeItem: vi.fn(),
    clearCart: vi.fn(),
    applyCoupon: vi.fn(),
    removeCoupon: vi.fn(),
    reload: vi.fn(),
    dismissNotice: vi.fn(),
    miniCartOpen: false,
    openMiniCart: vi.fn(),
    closeMiniCart: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  value = base();
});

describe("CartView", () => {
  it("loading -> skeleton", () => {
    value = base({ status: "loading", cart: null });
    render(<CartView />);
    expect(screen.getByLabelText("Đang tải giỏ hàng")).toBeInTheDocument();
  });

  it("giỏ trống -> EmptyState và link tiếp tục mua sắm", () => {
    value = base({ cart: makeCart({ items: [] }) });
    render(<CartView />);
    expect(screen.getByText("Giỏ hàng của bạn đang trống")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tiếp tục mua sắm" })).toHaveAttribute("href", "/");
  });

  it("lỗi -> ErrorState, nút thử lại gọi reload", async () => {
    value = base({ status: "error", cart: null, error: new ApiError(0, "NETWORK_ERROR", "x") });
    render(<CartView />);
    expect(screen.getByRole("alert")).toHaveTextContent("Không thể kết nối");
    await userEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(value.reload).toHaveBeenCalled();
  });

  it("dòng bình thường: link sản phẩm, giá, tổng, thanh toán là link", () => {
    value = base({
      cart: makeCart({
        items: [makeCartItem({ listPrice: 175000, unitPrice: 165000, lineTotal: 330000 })],
        discountTotal: 33000,
      }),
    });
    render(<CartView />);
    expect(screen.getByRole("link", { name: "Robusta Buôn Ma Thuột" })).toHaveAttribute(
      "href",
      "/san-pham/robusta-buon-ma-thuot",
    );
    expect(document.querySelector("del")).toHaveTextContent("175.000₫");
    expect(screen.getByText("-33.000₫")).toBeInTheDocument();
    expect(screen.getByText("Từ 20.000₫")).toBeInTheDocument();
    expect(screen.getByText("297.000₫")).toBeInTheDocument(); // tổng tạm tính
    expect(screen.getByText(/Mua thêm 170.000₫ để được miễn phí/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tiến hành thanh toán" })).toHaveAttribute(
      "href",
      "/thanh-toan",
    );
  });

  it("freeship: phí vận chuyển Miễn phí", () => {
    const cart = makeCart();
    cart.shippingEstimate = {
      standardFrom: 0,
      freeShippingThreshold: 300000,
      freeShippingRemaining: 0,
    };
    value = base({ cart });
    render(<CartView />);
    expect(screen.getByText("Miễn phí")).toBeInTheDocument();
    expect(screen.queryByText(/Mua thêm/)).not.toBeInTheDocument();
  });

  it("cảnh báo PRICE_CHANGED hiển thị tại dòng", () => {
    value = base({
      cart: makeCart({
        items: [makeCartItem({ warnings: ["PRICE_CHANGED"], unitPriceAtAdd: 175000 })],
      }),
    });
    render(<CartView />);
    expect(screen.getByText("Giá đã thay đổi từ 175.000₫ thành 165.000₫")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tiến hành thanh toán" })).toBeInTheDocument();
  });

  it("stepper gọi updateItem; lỗi OUT_OF_STOCK hiện tại dòng", async () => {
    const updateItem = vi
      .fn()
      .mockRejectedValue(
        new ApiError(409, "OUT_OF_STOCK", "x", { items: [{ variantId: "v1", available: 2 }] }),
      );
    value = base({ updateItem });
    render(<CartView />);
    await userEvent.click(screen.getByRole("button", { name: "Tăng số lượng" }));
    expect(updateItem).toHaveBeenCalledWith("ci1", 3);
    expect(await screen.findByText("Chỉ còn 2 sản phẩm")).toBeInTheDocument();
  });

  it("dòng đang chờ -> stepper disabled", () => {
    value = base({
      pending: { adding: false, clearing: false, coupon: false, itemIds: new Set(["ci1"]) },
    });
    render(<CartView />);
    expect(screen.getByRole("button", { name: "Tăng số lượng" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Giảm số lượng" })).toBeDisabled();
  });

  it("dòng hết hàng: chỉ còn nút xóa, nút thanh toán disabled kèm lý do", () => {
    value = base({
      cart: makeCart({
        items: [makeCartItem({ warnings: ["OUT_OF_STOCK"], stockStatus: "OUT_OF_STOCK" })],
      }),
    });
    render(<CartView />);
    expect(screen.queryByRole("button", { name: "Tăng số lượng" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Xóa Robusta/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tiến hành thanh toán" })).toBeDisabled();
    expect(screen.getByText(/trước khi thanh toán/)).toBeInTheDocument();
  });

  it("áp mã lỗi MIN_ORDER hiện số tiền tối thiểu", async () => {
    const applyCoupon = vi
      .fn()
      .mockRejectedValue(
        new ApiError(409, "COUPON_INVALID", "x", { reason: "MIN_ORDER", minOrder: 500000 }),
      );
    value = base({ applyCoupon });
    render(<CartView />);
    await userEvent.type(screen.getByRole("textbox", { name: "Mã giảm giá" }), "big50");
    await userEvent.click(screen.getByRole("button", { name: "Áp dụng" }));
    expect(applyCoupon).toHaveBeenCalledWith("big50");
    expect(await screen.findByText(/tối thiểu 500.000₫/)).toBeInTheDocument();
  });

  it("mã đã áp nhưng không còn hợp lệ -> hiện lý do và nút Bỏ mã", async () => {
    const removeCoupon = vi.fn().mockResolvedValue(makeCart());
    value = base({
      removeCoupon,
      cart: makeCart({
        coupon: {
          code: "OLD",
          type: "PERCENT",
          discount: 0,
          valid: false,
          invalidReason: "EXPIRED",
        },
      }),
    });
    render(<CartView />);
    expect(screen.getByText("OLD")).toBeInTheDocument();
    expect(screen.getByText("Mã giảm giá đã hết hạn.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Bỏ mã" }));
    expect(removeCoupon).toHaveBeenCalled();
  });

  it("mã đã áp, không hợp lệ MIN_ORDER có minOrder -> hiện số tiền tối thiểu", () => {
    value = base({
      cart: makeCart({
        coupon: {
          code: "BIG20",
          type: "PERCENT",
          discount: 0,
          valid: false,
          invalidReason: "MIN_ORDER",
          minOrder: 200000,
        },
      }),
    });
    render(<CartView />);
    expect(
      screen.getByText("Đơn hàng cần đạt tối thiểu 200.000₫ để dùng mã này."),
    ).toBeInTheDocument();
  });

  it("áp mã bị RATE_LIMITED -> báo số giây chờ", async () => {
    const applyCoupon = vi
      .fn()
      .mockRejectedValue(new ApiError(429, "RATE_LIMITED", "x", { retryAfterSec: 42 }));
    value = base({ applyCoupon });
    render(<CartView />);
    await userEvent.type(screen.getByRole("textbox", { name: "Mã giảm giá" }), "abc");
    await userEvent.click(screen.getByRole("button", { name: "Áp dụng" }));
    expect(await screen.findByText(/thử lại sau 42 giây/)).toBeInTheDocument();
  });

  it("xóa toàn bộ giỏ cần xác nhận", async () => {
    const clearCart = vi.fn().mockResolvedValue(makeCart({ items: [] }));
    value = base({ clearCart });
    render(<CartView />);
    await userEvent.click(screen.getByRole("button", { name: "Xóa toàn bộ giỏ" }));
    expect(clearCart).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Xóa toàn bộ" }));
    expect(clearCart).toHaveBeenCalled();
  });

  it("notice sau merge hiển thị và đóng được", async () => {
    value = base({ notice: "Một số sản phẩm đã được điều chỉnh" });
    render(<CartView />);
    expect(screen.getByText("Một số sản phẩm đã được điều chỉnh")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Đóng thông báo" }));
    expect(value.dismissNotice).toHaveBeenCalled();
  });
});
