import { ORDER_CODE_RE } from "@/features/orders/labels";
import type { AuditLogItem } from "@/types/admin";
import { COUPONS_BASE } from "./couponFilters";
import { ADMIN_ORDERS_BASE } from "./orderFilters";
import { PRODUCTS_BASE } from "./productFilters";

/** Nhãn action đã biết (§12.0, §13, §14). Action lạ hiện nguyên. */
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  "order.status": "Đổi trạng thái đơn",
  "inventory.adjust": "Điều chỉnh tồn kho",
  "product.create": "Tạo sản phẩm",
  "product.update": "Sửa sản phẩm",
  "product.delete": "Xóa sản phẩm",
  "product.restore": "Khôi phục sản phẩm",
  "variant.create": "Tạo biến thể",
  "variant.update": "Sửa biến thể",
  "variant.delete": "Xóa biến thể",
  "image.create": "Thêm ảnh",
  "image.update": "Sửa ảnh",
  "image.delete": "Xóa ảnh",
  "image.reorder": "Sắp xếp ảnh",
  "category.create": "Tạo danh mục",
  "category.update": "Sửa danh mục",
  "category.delete": "Xóa danh mục",
  "brand.create": "Tạo thương hiệu",
  "brand.update": "Sửa thương hiệu",
  "brand.delete": "Xóa thương hiệu",
  "upload.create": "Tải ảnh lên",
  "coupon.create": "Tạo mã giảm giá",
  "coupon.update": "Sửa mã giảm giá",
  "coupon.delete": "Xóa mã giảm giá",
  "payment.refund": "Ghi nhận hoàn tiền",
  "payment.late": "Thanh toán muộn",
  "review.hide": "Ẩn đánh giá",
  "review.show": "Hiện đánh giá",
  "review.reply": "Trả lời đánh giá",
  "review.reply_delete": "Xóa trả lời đánh giá",
  "analytics.export": "Xuất CSV phân tích",
};

export const auditActionLabel = (action: string) => AUDIT_ACTION_LABEL[action] ?? action;

export const AUDIT_ENTITY_LABEL: Record<string, string> = {
  Order: "Đơn hàng",
  Product: "Sản phẩm",
  ProductVariant: "Biến thể",
  ProductImage: "Ảnh sản phẩm",
  Category: "Danh mục",
  Brand: "Thương hiệu",
  Coupon: "Mã giảm giá",
  Review: "Đánh giá",
  Payment: "Thanh toán",
  analytics: "Phân tích kinh doanh",
};

export const auditEntityLabel = (entity: string) => AUDIT_ENTITY_LABEL[entity] ?? entity;

export const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Quản trị viên",
  STAFF: "Nhân viên",
  CUSTOMER: "Khách hàng",
};

/**
 * Link tới trang admin của đối tượng, hoặc null nếu không xác định được.
 * Đơn hàng chỉ có trang theo mã đơn: chỉ link khi entityId (hoặc diff.code) đúng dạng mã đơn.
 */
export function auditEntityHref(item: Pick<AuditLogItem, "entity" | "entityId" | "diff">) {
  const id = item.entityId;
  switch (item.entity) {
    case "Order": {
      const fromDiff = item.diff?.["code"];
      const code =
        id && ORDER_CODE_RE.test(id) ? id : typeof fromDiff === "string" ? fromDiff : null;
      return code && ORDER_CODE_RE.test(code)
        ? `${ADMIN_ORDERS_BASE}/${encodeURIComponent(code)}`
        : null;
    }
    case "Product":
      return id ? `${PRODUCTS_BASE}/${encodeURIComponent(id)}` : null;
    case "Coupon":
      return id ? `${COUPONS_BASE}/${encodeURIComponent(id)}` : null;
    case "Category":
      return "/admin/danh-muc";
    case "Brand":
      return "/admin/thuong-hieu";
    default:
      return null;
  }
}

/** Giá trị trong diff -> chuỗi hiển thị (React tự escape khi render dạng text). */
export function formatDiffValue(v: unknown): string {
  if (v === null || v === undefined) return "(trống)";
  if (typeof v === "string") return v === "" ? "(chuỗi rỗng)" : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/** `{ field: [trước, sau] }` -> các dòng bảng; giá trị không phải cặp thì coi là "sau". */
export function diffRows(
  diff: AuditLogItem["diff"],
): { field: string; before: string; after: string }[] {
  if (!diff || typeof diff !== "object") return [];
  return Object.entries(diff).map(([field, value]) => {
    if (Array.isArray(value) && value.length === 2) {
      return { field, before: formatDiffValue(value[0]), after: formatDiffValue(value[1]) };
    }
    return { field, before: "—", after: formatDiffValue(value) };
  });
}
