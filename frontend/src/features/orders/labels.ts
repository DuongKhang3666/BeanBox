import { couponReasonMessage } from "@/features/cart/messages";
import { ApiError } from "@/lib/api/errors";
import type { OrderStatus, PaymentMethod, PaymentStatus, ShippingMethod } from "@/types/order";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Chờ thanh toán",
  PENDING: "Chờ xác nhận",
  CONFIRMED: "Đã xác nhận",
  PROCESSING: "Đang chuẩn bị hàng",
  SHIPPING: "Đang giao",
  DELIVERED: "Đã giao",
  FAILED_DELIVERY: "Giao không thành công",
  CANCELLED: "Đã hủy",
  RETURN_REQUESTED: "Yêu cầu đổi trả",
  RETURNED: "Đã đổi trả",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  UNPAID: "Chưa thanh toán",
  PAID: "Đã thanh toán",
  FAILED: "Thanh toán thất bại",
  REFUNDED: "Đã hoàn tiền",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  COD: "Thanh toán khi nhận hàng (COD)",
  VNPAY: "VNPay (ATM/QR/thẻ)",
  STRIPE: "Thẻ quốc tế (Stripe)",
};

export const SHIPPING_METHOD_LABEL: Record<ShippingMethod, string> = {
  STANDARD: "Tiêu chuẩn",
  EXPRESS: "Nhanh",
};

export function orderStatusLabel(s: string): string {
  return ORDER_STATUS_LABEL[s as OrderStatus] ?? s;
}
export function paymentStatusLabel(s: string): string {
  return PAYMENT_STATUS_LABEL[s as PaymentStatus] ?? s;
}
export function paymentMethodLabel(s: string): string {
  return PAYMENT_METHOD_LABEL[s as PaymentMethod] ?? s;
}
export function shippingMethodLabel(s: string): string {
  return SHIPPING_METHOD_LABEL[s as ShippingMethod] ?? s;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/** Số giây chờ từ lỗi 429 (details.retryAfterSec), hoặc null. */
export function retryAfterSec(err: unknown): number | null {
  if (!(err instanceof ApiError)) return null;
  const sec = Number(asRecord(err.details)?.retryAfterSec);
  return Number.isFinite(sec) && sec > 0 ? Math.ceil(sec) : null;
}

export function rateLimitedMessage(err: unknown): string {
  const sec = retryAfterSec(err);
  return sec
    ? `Bạn thao tác quá nhanh, thử lại sau ${sec} giây.`
    : "Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.";
}

/** 409 PAYMENT_NOT_ALLOWED: câu theo details.reason (§13.2). */
function paymentNotAllowedMessage(err: ApiError): string {
  switch (asRecord(err.details)?.reason) {
    case "EXPIRED":
      return "Đơn hàng đã quá hạn thanh toán";
    case "STATUS":
      return "Đơn hàng không còn ở trạng thái chờ thanh toán";
    case "METHOD_MISMATCH":
      return "Phương thức thanh toán không khớp với đơn hàng";
    case "UNAVAILABLE":
      return "Phương thức thanh toán này hiện chưa khả dụng";
    default:
      return "Không thể thanh toán đơn hàng này";
  }
}

/** Lỗi API đơn hàng/thanh toán -> câu tiếng Việt cho người dùng. */
export function orderErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return "Đã có lỗi xảy ra. Vui lòng thử lại.";
  switch (err.code) {
    case "PRICE_CHANGED":
      return "Tổng tiền đơn hàng đã thay đổi. Vui lòng kiểm tra lại và đặt hàng lần nữa.";
    case "OUT_OF_STOCK":
      return "Một số sản phẩm không đủ số lượng trong kho. Vui lòng kiểm tra lại giỏ hàng.";
    case "ITEM_UNAVAILABLE":
      return "Một số sản phẩm hiện đã ngừng bán. Vui lòng kiểm tra lại giỏ hàng.";
    case "COUPON_INVALID": {
      const d = asRecord(err.details);
      const minOrder = typeof d?.minOrder === "number" ? d.minOrder : null;
      return couponReasonMessage(typeof d?.reason === "string" ? d.reason : null, minOrder);
    }
    case "CART_EMPTY":
      return "Giỏ hàng của bạn đang trống.";
    case "IDEMPOTENCY_CONFLICT":
      return "Yêu cầu đặt hàng bị trùng lặp. Vui lòng kiểm tra lại thông tin rồi bấm Đặt hàng lần nữa.";
    case "PAYMENT_METHOD_UNAVAILABLE":
      return "Phương thức thanh toán này chưa khả dụng. Vui lòng chọn phương thức khác.";
    case "PAYMENT_NOT_ALLOWED":
      return paymentNotAllowedMessage(err);
    case "PAYMENT_SIGNATURE_INVALID":
      return "Không xác minh được kết quả thanh toán.";
    case "SERVICE_UNAVAILABLE":
      return "Cổng thanh toán đang tạm gián đoạn. Vui lòng thử lại sau ít phút.";
    case "INVALID_STATUS_TRANSITION":
      return "Đơn hàng không thể hủy ở trạng thái hiện tại";
    case "NOT_FOUND":
      return "Không tìm thấy đơn hàng.";
    case "RATE_LIMITED":
      return rateLimitedMessage(err);
    case "NETWORK_ERROR":
      return "Không thể kết nối tới máy chủ. Vui lòng kiểm tra mạng và thử lại.";
    default:
      return "Đã có lỗi xảy ra. Vui lòng thử lại.";
  }
}

/** Mã đơn: `BB-yymmdd-XXXX` (bảng chữ không có 0,1,I,L,O,U). */
export const ORDER_CODE_RE = /^BB-\d{6}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/;

export function normalizeOrderCode(value: string): string {
  return value.trim().toUpperCase();
}
