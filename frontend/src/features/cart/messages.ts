import { ApiError } from "@/lib/api/errors";
import { formatVND } from "@/lib/format";
import type { CartItem, CartWarning, CouponInvalidReason } from "@/types/cart";

export const MAX_LINE_QUANTITY = 20;

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
}

function availableOf(details: unknown): number | null {
  const items = asRecord(details)?.items;
  if (!Array.isArray(items)) return null;
  const available = asRecord(items[0])?.available;
  return typeof available === "number" ? available : null;
}

export function couponReasonMessage(
  reason: CouponInvalidReason | string | null | undefined,
  minOrder?: number | null,
): string {
  switch (reason) {
    case "NOT_FOUND":
      return "Mã giảm giá không tồn tại.";
    case "INACTIVE":
      return "Mã giảm giá hiện không được áp dụng.";
    case "NOT_STARTED":
      return "Mã giảm giá chưa đến thời gian sử dụng.";
    case "EXPIRED":
      return "Mã giảm giá đã hết hạn.";
    case "USAGE_LIMIT":
      return "Mã giảm giá đã hết lượt sử dụng.";
    case "PER_USER_LIMIT":
      return "Bạn đã dùng hết số lượt của mã giảm giá này.";
    case "MIN_ORDER":
      return typeof minOrder === "number"
        ? `Đơn hàng cần đạt tối thiểu ${formatVND(minOrder)} để dùng mã này.`
        : "Đơn hàng chưa đạt giá trị tối thiểu để dùng mã này.";
    case "NOT_APPLICABLE":
      return "Giỏ hàng chưa có sản phẩm nào đủ điều kiện dùng mã này.";
    default:
      return "Mã giảm giá không hợp lệ.";
  }
}

/** Lỗi API/mạng -> câu tiếng Việt hiển thị cho người dùng. Dùng chung giỏ hàng và thanh toán. */
export function cartErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return "Đã có lỗi xảy ra. Vui lòng thử lại.";
  switch (err.code) {
    case "OUT_OF_STOCK": {
      const available = availableOf(err.details);
      if (available === null) return "Sản phẩm không đủ số lượng trong kho.";
      return available > 0 ? `Chỉ còn ${available} sản phẩm` : "Sản phẩm đã hết hàng";
    }
    case "QUANTITY_LIMIT_EXCEEDED":
      return `Mỗi sản phẩm tối đa ${MAX_LINE_QUANTITY} trong giỏ`;
    case "ITEM_UNAVAILABLE":
      return "Sản phẩm này hiện ngừng bán.";
    case "NOT_FOUND":
      return "Sản phẩm không còn trong giỏ hàng.";
    case "CART_EMPTY":
      return "Giỏ hàng của bạn đang trống.";
    case "COUPON_INVALID": {
      const d = asRecord(err.details);
      const minOrder = typeof d?.minOrder === "number" ? d.minOrder : null;
      return couponReasonMessage(typeof d?.reason === "string" ? d.reason : null, minOrder);
    }
    case "RATE_LIMITED": {
      const sec = Number(asRecord(err.details)?.retryAfterSec);
      return Number.isFinite(sec) && sec > 0
        ? `Bạn thao tác quá nhanh, thử lại sau ${Math.ceil(sec)} giây.`
        : "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.";
    }
    case "NETWORK_ERROR":
      return "Không thể kết nối tới máy chủ. Vui lòng thử lại.";
    default:
      return "Đã có lỗi xảy ra. Vui lòng thử lại.";
  }
}

export function cartWarningMessage(warning: CartWarning, item: CartItem): string {
  switch (warning) {
    case "PRICE_CHANGED":
      return `Giá đã thay đổi từ ${formatVND(item.unitPriceAtAdd)} thành ${formatVND(item.unitPrice)}`;
    case "INSUFFICIENT_STOCK":
      return `Chỉ còn ${item.maxQuantity} sản phẩm, vui lòng giảm số lượng`;
    case "OUT_OF_STOCK":
      return "Sản phẩm đã hết hàng";
    case "UNAVAILABLE":
      return "Sản phẩm hiện ngừng bán";
  }
}

/** Cảnh báo chặn thanh toán. */
export const BLOCKING_WARNINGS: readonly CartWarning[] = [
  "OUT_OF_STOCK",
  "UNAVAILABLE",
  "INSUFFICIENT_STOCK",
];

export function isLineUnavailable(item: CartItem): boolean {
  return item.warnings.includes("OUT_OF_STOCK") || item.warnings.includes("UNAVAILABLE");
}

export function hasBlockingIssue(items: CartItem[]): boolean {
  return items.some((i) => i.warnings.some((w) => BLOCKING_WARNINGS.includes(w)));
}

export const MERGE_ADJUSTED_NOTICE =
  "Một số sản phẩm trong giỏ đã được điều chỉnh số lượng theo tồn kho.";
