import type { OrderStatus } from "@/types/order";

export interface StatusActionConfig {
  to: OrderStatus;
  /** Nhãn nút và tiêu đề hộp thoại. */
  label: string;
  /** Ô mã vận đơn/đơn vị vận chuyển. */
  showTracking: boolean;
  trackingRequired: boolean;
  noteRequired: boolean;
  danger: boolean;
}

/** Thứ tự hiển thị nút; Hủy luôn ở cuối. */
const ORDER: OrderStatus[] = [
  "CONFIRMED",
  "PROCESSING",
  "SHIPPING",
  "DELIVERED",
  "FAILED_DELIVERY",
  "CANCELLED",
];

/**
 * Cấu hình hành động cho chuyển `from -> to` (docs/api-contract.md §11, §12.1).
 * null = FE không cung cấp nút (đích v2 hoặc không dành cho Staff).
 */
export function statusAction(from: OrderStatus, to: OrderStatus): StatusActionConfig | null {
  switch (to) {
    case "CONFIRMED":
      return {
        to,
        label: "Xác nhận đơn",
        showTracking: false,
        trackingRequired: false,
        noteRequired: false,
        danger: false,
      };
    case "PROCESSING":
      return {
        to,
        label: "Bắt đầu đóng gói",
        showTracking: false,
        trackingRequired: false,
        noteRequired: false,
        danger: false,
      };
    case "SHIPPING":
      return from === "FAILED_DELIVERY"
        ? {
            to,
            label: "Giao lại",
            showTracking: true,
            trackingRequired: false,
            noteRequired: false,
            danger: false,
          }
        : {
            to,
            label: "Giao cho vận chuyển",
            showTracking: true,
            trackingRequired: true,
            noteRequired: false,
            danger: false,
          };
    case "DELIVERED":
      return {
        to,
        label: "Đã giao",
        showTracking: false,
        trackingRequired: false,
        noteRequired: false,
        danger: false,
      };
    case "FAILED_DELIVERY":
      return {
        to,
        label: "Giao thất bại",
        showTracking: false,
        trackingRequired: false,
        noteRequired: true,
        danger: true,
      };
    case "CANCELLED":
      return {
        to,
        label: "Hủy đơn",
        showTracking: false,
        trackingRequired: false,
        noteRequired: from === "PROCESSING",
        danger: true,
      };
    default:
      return null;
  }
}

/** Danh sách hành động từ `allowedTransitions` của server (chỉ những đích FE hỗ trợ). */
export function actionsFor(from: OrderStatus, allowed: OrderStatus[]): StatusActionConfig[] {
  return ORDER.filter((s) => allowed.includes(s))
    .map((s) => statusAction(from, s))
    .filter((a): a is StatusActionConfig => a !== null);
}

export const TRACKING_RE = /^[A-Za-z0-9-]+$/;
