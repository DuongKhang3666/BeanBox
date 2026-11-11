import { formatVND } from "@/lib/format";
import type {
  AdjustReason,
  AdminCoupon,
  AdminPaymentProvider,
  AdminPaymentStatus,
  AdminProductStatus,
  AdminStockStatus,
  CouponState,
  CouponType,
  InventoryReason,
} from "@/types/admin";

export const INVENTORY_REASON_LABEL: Record<InventoryReason, string> = {
  ORDER_RESERVE: "Giữ hàng cho đơn",
  ORDER_RELEASE: "Hoàn kho từ đơn",
  RESTOCK: "Nhập hàng",
  DAMAGE: "Hư hỏng",
  STOCKTAKE: "Kiểm kê",
  ADJUSTMENT: "Điều chỉnh",
};

export const ALL_INVENTORY_REASONS: InventoryReason[] = [
  "ORDER_RESERVE",
  "ORDER_RELEASE",
  "RESTOCK",
  "DAMAGE",
  "STOCKTAKE",
  "ADJUSTMENT",
];

export const ADJUST_REASONS: AdjustReason[] = ["RESTOCK", "DAMAGE", "ADJUSTMENT", "STOCKTAKE"];

export const STOCK_STATUS_LABEL: Record<AdminStockStatus, string> = {
  OUT_OF_STOCK: "Hết hàng",
  LOW_STOCK: "Sắp hết",
  IN_STOCK: "Còn hàng",
};

export const ALL_STOCK_STATUSES: AdminStockStatus[] = ["OUT_OF_STOCK", "LOW_STOCK", "IN_STOCK"];

export const PRODUCT_STATUS_LABEL: Record<AdminProductStatus, string> = {
  DRAFT: "Nháp",
  ACTIVE: "Đang bán",
  ARCHIVED: "Lưu trữ",
};

/** Cùng quy tắc server (§12.2) để cập nhật dòng tại chỗ khi biết tồn mới. */
export function stockStatusOf(stock: number, threshold: number): AdminStockStatus {
  if (stock <= 0) return "OUT_OF_STOCK";
  return stock <= threshold ? "LOW_STOCK" : "IN_STOCK";
}

export const COUPON_TYPE_LABEL: Record<CouponType, string> = {
  PERCENT: "Giảm theo %",
  FIXED: "Giảm số tiền",
  FREESHIP: "Miễn phí ship",
};

export const ALL_COUPON_TYPES: CouponType[] = ["PERCENT", "FIXED", "FREESHIP"];

export const COUPON_STATE_LABEL: Record<CouponState, string> = {
  ACTIVE: "Đang chạy",
  SCHEDULED: "Sắp diễn ra",
  EXPIRED: "Hết hạn",
  INACTIVE: "Đã tắt",
  EXHAUSTED: "Hết lượt",
};

export const ALL_COUPON_STATES: CouponState[] = [
  "ACTIVE",
  "SCHEDULED",
  "EXPIRED",
  "INACTIVE",
  "EXHAUSTED",
];

/** "10% tối đa 50.000₫" / "50.000₫" / "Miễn phí ship tối đa 30.000₫". */
export function couponValueText(c: Pick<AdminCoupon, "type" | "value" | "maxDiscount">): string {
  const cap = c.maxDiscount ? ` tối đa ${formatVND(c.maxDiscount)}` : "";
  if (c.type === "PERCENT") return `${c.value}%${cap}`;
  if (c.type === "FIXED") return formatVND(c.value);
  return `Miễn phí ship${cap}`;
}

export const PAYMENT_RECORD_STATUS_LABEL: Record<AdminPaymentStatus, string> = {
  PENDING: "Đang chờ",
  SUCCEEDED: "Thành công",
  FAILED: "Thất bại",
  REFUNDED: "Đã hoàn tiền",
};

export const PAYMENT_PROVIDER_LABEL: Record<AdminPaymentProvider, string> = {
  VNPAY: "VNPay",
  STRIPE: "Stripe",
};
