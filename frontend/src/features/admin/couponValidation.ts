import type { AdminCoupon, CouponInput, CouponScope, CouponType } from "@/types/admin";
import { isoToVnLocal, vnLocalToIso } from "./productValidation";

/** Theo docs/api-contract.md §13.8. */
export const COUPON_CODE_RE = /^[A-Z0-9_-]{3,30}$/;
export const MAX_SCOPE_ITEMS = 50;
export const MAX_FIXED_VALUE = 100_000_000;
const MAX_INT = 2_147_483_647;

export interface CouponFormState {
  code: string;
  type: CouponType;
  value: string;
  maxDiscount: string;
  minOrder: string;
  startsAt: string;
  endsAt: string;
  usageLimit: string;
  perUserLimit: string;
  categoryIds: string[];
  productIds: string[];
  description: string;
  isActive: boolean;
}

export function initialCouponState(c?: AdminCoupon): CouponFormState {
  return {
    code: c?.code ?? "",
    type: c?.type ?? "PERCENT",
    value: c ? String(c.value) : "",
    maxDiscount: c?.maxDiscount != null ? String(c.maxDiscount) : "",
    minOrder: c ? String(c.minOrder) : "0",
    startsAt: isoToVnLocal(c?.startsAt),
    endsAt: isoToVnLocal(c?.endsAt),
    usageLimit: c?.usageLimit != null ? String(c.usageLimit) : "",
    perUserLimit: c?.perUserLimit != null ? String(c.perUserLimit) : "",
    categoryIds: [...(c?.scope?.categoryIds ?? [])],
    productIds: [...(c?.scope?.productIds ?? [])],
    description: c?.description ?? "",
    isActive: c?.isActive ?? true,
  };
}

const fmt = (n: number) => n.toLocaleString("vi-VN");

function intIn(raw: string, min: number, max: number, label: string): string | undefined {
  const t = raw.trim();
  if (!/^\d+$/.test(t) || Number(t) < min || Number(t) > max) {
    return `${label} phải là số nguyên từ ${fmt(min)} đến ${fmt(max)}.`;
  }
  return undefined;
}

export function codeError(code: string): string | undefined {
  const c = code.trim();
  if (!c) return "Vui lòng nhập mã giảm giá.";
  if (!COUPON_CODE_RE.test(c)) {
    return "Mã gồm 3-30 ký tự: chữ in hoa không dấu, số, dấu gạch ngang hoặc gạch dưới.";
  }
  return undefined;
}

/** Trả map field -> lỗi (rỗng = hợp lệ). `usedCount` chỉ có ý nghĩa khi sửa. */
export function validateCoupon(s: CouponFormState, usedCount = 0): Record<string, string> {
  const e: Record<string, string> = {};
  const put = (k: string, v: string | undefined) => {
    if (v) e[k] = v;
  };
  put("code", codeError(s.code));
  if (s.type === "PERCENT") put("value", intIn(s.value, 1, 100, "Phần trăm giảm"));
  if (s.type === "FIXED") put("value", intIn(s.value, 1, MAX_FIXED_VALUE, "Số tiền giảm"));
  if (s.type !== "FIXED" && s.maxDiscount.trim()) {
    put("maxDiscount", intIn(s.maxDiscount, 1, MAX_INT, "Mức giảm tối đa"));
  }
  put("minOrder", intIn(s.minOrder.trim() === "" ? "0" : s.minOrder, 0, MAX_INT, "Đơn tối thiểu"));
  if (s.startsAt && !vnLocalToIso(s.startsAt)) e.startsAt = "Thời gian bắt đầu không hợp lệ.";
  if (s.endsAt && !vnLocalToIso(s.endsAt)) e.endsAt = "Thời gian kết thúc không hợp lệ.";
  if (!e.startsAt && !e.endsAt && s.startsAt && s.endsAt) {
    if (vnLocalToIso(s.startsAt)! >= vnLocalToIso(s.endsAt)!) {
      e.endsAt = "Thời gian kết thúc phải sau thời gian bắt đầu.";
    }
  }
  if (s.usageLimit.trim()) {
    put("usageLimit", intIn(s.usageLimit, 1, MAX_INT, "Tổng lượt dùng"));
    if (!e.usageLimit && Number(s.usageLimit) < usedCount) {
      e.usageLimit = `Tổng lượt dùng không được nhỏ hơn số lượt đã dùng (${fmt(usedCount)}).`;
    }
  }
  if (s.perUserLimit.trim()) {
    put("perUserLimit", intIn(s.perUserLimit, 1, MAX_INT, "Lượt mỗi khách"));
  }
  if (s.categoryIds.length > MAX_SCOPE_ITEMS) {
    e["scope.categoryIds"] = `Tối đa ${MAX_SCOPE_ITEMS} danh mục.`;
  }
  if (s.productIds.length > MAX_SCOPE_ITEMS) {
    e["scope.productIds"] = `Tối đa ${MAX_SCOPE_ITEMS} sản phẩm.`;
  }
  if (s.description.trim().length > 200) e.description = "Mô tả tối đa 200 ký tự.";
  return e;
}

const num = (raw: string) => Number(raw.trim());

function scopeOf(s: CouponFormState): CouponScope | null {
  const scope: CouponScope = {};
  if (s.categoryIds.length) scope.categoryIds = s.categoryIds;
  if (s.productIds.length) scope.productIds = s.productIds;
  return scope.categoryIds || scope.productIds ? scope : null;
}

/** Body POST. FREESHIP value = 0; FIXED không gửi maxDiscount; scope rỗng thì bỏ. */
export function buildCreateBody(s: CouponFormState): CouponInput {
  const body: CouponInput = {
    code: s.code.trim().toUpperCase(),
    type: s.type,
    value: s.type === "FREESHIP" ? 0 : num(s.value),
    minOrder: s.minOrder.trim() === "" ? 0 : num(s.minOrder),
    isActive: s.isActive,
  };
  if (s.type !== "FIXED" && s.maxDiscount.trim()) body.maxDiscount = num(s.maxDiscount);
  if (s.startsAt) body.startsAt = vnLocalToIso(s.startsAt);
  if (s.endsAt) body.endsAt = vnLocalToIso(s.endsAt);
  if (s.usageLimit.trim()) body.usageLimit = num(s.usageLimit);
  if (s.perUserLimit.trim()) body.perUserLimit = num(s.perUserLimit);
  const scope = scopeOf(s);
  if (scope) body.scope = scope;
  if (s.description.trim()) body.description = s.description.trim();
  return body;
}

const sameList = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);
const isoOrNull = (iso: string | null) => (iso ? new Date(iso).toISOString() : null);

/** Body PATCH: chỉ trường đã đổi; không bao giờ có code/type. */
export function buildUpdateBody(s: CouponFormState, c: AdminCoupon): CouponInput {
  const body: CouponInput = {};
  if (c.type !== "FREESHIP" && num(s.value) !== c.value) body.value = num(s.value);
  if (c.type !== "FIXED") {
    const max = s.maxDiscount.trim() ? num(s.maxDiscount) : null;
    if (max !== c.maxDiscount) body.maxDiscount = max;
  }
  const minOrder = s.minOrder.trim() === "" ? 0 : num(s.minOrder);
  if (minOrder !== c.minOrder) body.minOrder = minOrder;
  const startsAt = s.startsAt ? vnLocalToIso(s.startsAt) : null;
  if (startsAt !== isoOrNull(c.startsAt)) body.startsAt = startsAt;
  const endsAt = s.endsAt ? vnLocalToIso(s.endsAt) : null;
  if (endsAt !== isoOrNull(c.endsAt)) body.endsAt = endsAt;
  const usageLimit = s.usageLimit.trim() ? num(s.usageLimit) : null;
  if (usageLimit !== c.usageLimit) body.usageLimit = usageLimit;
  const perUser = s.perUserLimit.trim() ? num(s.perUserLimit) : null;
  if (perUser !== c.perUserLimit) body.perUserLimit = perUser;
  if (
    !sameList(s.categoryIds, c.scope?.categoryIds ?? []) ||
    !sameList(s.productIds, c.scope?.productIds ?? [])
  ) {
    // Rỗng -> server lưu null (§13.8).
    body.scope = { categoryIds: s.categoryIds, productIds: s.productIds };
  }
  if (s.isActive !== c.isActive) body.isActive = s.isActive;
  const desc = s.description.trim();
  if (desc !== (c.description ?? "")) body.description = desc || null;
  return body;
}
