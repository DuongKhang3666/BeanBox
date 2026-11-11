import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/errors";
import {
  cartErrorMessage,
  cartWarningMessage,
  couponReasonMessage,
  hasBlockingIssue,
} from "./messages";
import { makeCartItem } from "./testing";

const err = (code: string, details?: unknown) => new ApiError(409, code, "x", details);

describe("cartErrorMessage", () => {
  it("OUT_OF_STOCK dùng available", () => {
    expect(
      cartErrorMessage(
        err("OUT_OF_STOCK", { items: [{ variantId: "v", requested: 5, available: 3 }] }),
      ),
    ).toBe("Chỉ còn 3 sản phẩm");
    expect(
      cartErrorMessage(
        err("OUT_OF_STOCK", { items: [{ variantId: "v", requested: 5, available: 0 }] }),
      ),
    ).toBe("Sản phẩm đã hết hàng");
  });

  it("các mã lỗi khác", () => {
    expect(cartErrorMessage(err("QUANTITY_LIMIT_EXCEEDED"))).toBe(
      "Mỗi sản phẩm tối đa 20 trong giỏ",
    );
    expect(cartErrorMessage(err("ITEM_UNAVAILABLE"))).toMatch(/ngừng bán/);
    expect(cartErrorMessage(err("NOT_FOUND"))).toMatch(/không còn trong giỏ/);
    expect(cartErrorMessage(err("CART_EMPTY"))).toMatch(/trống/);
    expect(cartErrorMessage(err("RATE_LIMITED"))).toMatch(/quá nhanh/);
    expect(cartErrorMessage(new ApiError(0, "NETWORK_ERROR", "x"))).toMatch(/kết nối/);
    expect(cartErrorMessage(err("WHATEVER"))).toMatch(/Đã có lỗi/);
    expect(cartErrorMessage(new Error("boom"))).toMatch(/Đã có lỗi/);
  });

  it("RATE_LIMITED kèm số giây khi có retryAfterSec", () => {
    expect(cartErrorMessage(err("RATE_LIMITED", { retryAfterSec: 30 }))).toBe(
      "Bạn thao tác quá nhanh, thử lại sau 30 giây.",
    );
  });

  it("COUPON_INVALID theo reason, MIN_ORDER kèm số tiền", () => {
    expect(cartErrorMessage(err("COUPON_INVALID", { reason: "EXPIRED" }))).toMatch(/hết hạn/);
    expect(cartErrorMessage(err("COUPON_INVALID", { reason: "MIN_ORDER", minOrder: 300000 }))).toBe(
      "Đơn hàng cần đạt tối thiểu 300.000₫ để dùng mã này.",
    );
    expect(cartErrorMessage(err("COUPON_INVALID"))).toBe("Mã giảm giá không hợp lệ.");
  });
});

describe("couponReasonMessage", () => {
  it("mọi reason đều có câu tiếng Việt riêng", () => {
    const reasons = [
      "NOT_FOUND",
      "INACTIVE",
      "NOT_STARTED",
      "EXPIRED",
      "USAGE_LIMIT",
      "PER_USER_LIMIT",
      "MIN_ORDER",
      "NOT_APPLICABLE",
    ];
    const msgs = new Set(reasons.map((r) => couponReasonMessage(r)));
    expect(msgs.size).toBe(reasons.length);
    expect(msgs.has("Mã giảm giá không hợp lệ.")).toBe(false);
  });
});

describe("cartWarningMessage", () => {
  it("PRICE_CHANGED và INSUFFICIENT_STOCK có số liệu", () => {
    const item = makeCartItem({ unitPriceAtAdd: 175000, unitPrice: 165000, maxQuantity: 2 });
    expect(cartWarningMessage("PRICE_CHANGED", item)).toBe(
      "Giá đã thay đổi từ 175.000₫ thành 165.000₫",
    );
    expect(cartWarningMessage("INSUFFICIENT_STOCK", item)).toBe(
      "Chỉ còn 2 sản phẩm, vui lòng giảm số lượng",
    );
    expect(cartWarningMessage("OUT_OF_STOCK", item)).toMatch(/hết hàng/);
    expect(cartWarningMessage("UNAVAILABLE", item)).toMatch(/ngừng bán/);
  });
});

describe("hasBlockingIssue", () => {
  it("PRICE_CHANGED không chặn, các cảnh báo tồn kho thì chặn", () => {
    expect(hasBlockingIssue([makeCartItem({ warnings: ["PRICE_CHANGED"] })])).toBe(false);
    expect(hasBlockingIssue([makeCartItem({ warnings: ["INSUFFICIENT_STOCK"] })])).toBe(true);
    expect(hasBlockingIssue([makeCartItem({ warnings: ["UNAVAILABLE"] })])).toBe(true);
  });
});
