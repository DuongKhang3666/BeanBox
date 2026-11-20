import type { AuditLogQuery } from "@/types/admin";

export const AUDIT_BASE = "/admin/nhat-ky";

/** Nhóm action (actionPrefix, §14.4) -> nhãn tiếng Việt. */
export const AUDIT_GROUPS: { prefix: string; label: string }[] = [
  { prefix: "order.", label: "Đơn hàng" },
  { prefix: "inventory.", label: "Tồn kho" },
  { prefix: "product.", label: "Sản phẩm" },
  { prefix: "variant.", label: "Biến thể" },
  { prefix: "image.", label: "Ảnh" },
  { prefix: "category.", label: "Danh mục" },
  { prefix: "brand.", label: "Thương hiệu" },
  { prefix: "coupon.", label: "Mã giảm giá" },
  { prefix: "payment.", label: "Thanh toán" },
  { prefix: "review.", label: "Đánh giá" },
  { prefix: "analytics.", label: "Phân tích kinh doanh" },
];

/** Gợi ý cho ô lọc đối tượng (tên entity do server ghi; vẫn cho nhập tự do). */
export const AUDIT_ENTITY_SUGGESTIONS = [
  "Order",
  "Product",
  "ProductVariant",
  "ProductImage",
  "Category",
  "Brand",
  "Coupon",
  "Review",
  "Payment",
  "analytics",
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[a-z0-9]{1,50}$/;
const ENTITY_RE = /^[A-Za-z]{1,40}$/;
const ENTITY_ID_RE = /^[A-Za-z0-9_-]{1,50}$/;

/** Bộ lọc từ URL; giá trị lạ bị bỏ qua. */
export function parseAuditFilters(params: URLSearchParams): AuditLogQuery {
  const prefix = params.get("actionPrefix");
  const entity = params.get("entity");
  const entityId = params.get("entityId");
  const actorId = params.get("actorId");
  const from = params.get("from");
  const to = params.get("to");
  const pageNum = Number(params.get("page"));
  const out: AuditLogQuery = {
    actionPrefix: AUDIT_GROUPS.some((g) => g.prefix === prefix) ? (prefix as string) : undefined,
    entity: entity && ENTITY_RE.test(entity) ? entity : undefined,
    entityId: entityId && ENTITY_ID_RE.test(entityId) ? entityId : undefined,
    actorId: actorId && ID_RE.test(actorId) ? actorId : undefined,
    from: from && DATE_RE.test(from) ? from : undefined,
    to: to && DATE_RE.test(to) ? to : undefined,
    page: Number.isInteger(pageNum) && pageNum >= 1 && pageNum <= 10000 ? pageNum : undefined,
  };
  if (out.from && out.to && out.from > out.to) {
    out.from = undefined;
    out.to = undefined;
  }
  return Object.fromEntries(
    Object.entries(out).filter(([, v]) => v !== undefined),
  ) as AuditLogQuery;
}

export function auditHref(f: AuditLogQuery): string {
  const qs = new URLSearchParams();
  for (const key of ["actionPrefix", "entity", "entityId", "actorId", "from", "to"] as const) {
    const v = f[key];
    if (v) qs.set(key, v);
  }
  if (f.page && f.page > 1) qs.set("page", String(f.page));
  const s = qs.toString();
  return s ? `${AUDIT_BASE}?${s}` : AUDIT_BASE;
}
