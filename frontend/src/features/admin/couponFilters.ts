import type { AdminCouponQuery, CouponState, CouponType } from "@/types/admin";
import { ALL_COUPON_STATES, ALL_COUPON_TYPES } from "./labels";

export const COUPONS_BASE = "/admin/ma-giam-gia";

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  return value !== null && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

/** Bộ lọc từ URL; giá trị lạ bị bỏ qua. */
export function parseCouponFilters(params: URLSearchParams): AdminCouponQuery {
  const q = (params.get("q") ?? "").trim().slice(0, 50);
  const pageNum = Number(params.get("page"));
  const out: AdminCouponQuery = {
    q: q || undefined,
    type: oneOf<CouponType>(params.get("type"), ALL_COUPON_TYPES),
    state: oneOf<CouponState>(params.get("state"), ALL_COUPON_STATES),
    page: Number.isInteger(pageNum) && pageNum >= 1 && pageNum <= 10000 ? pageNum : undefined,
  };
  return Object.fromEntries(
    Object.entries(out).filter(([, v]) => v !== undefined),
  ) as AdminCouponQuery;
}

export function couponsHref(f: AdminCouponQuery): string {
  const qs = new URLSearchParams();
  if (f.q) qs.set("q", f.q);
  if (f.type) qs.set("type", f.type);
  if (f.state) qs.set("state", f.state);
  if (f.page && f.page > 1) qs.set("page", String(f.page));
  const s = qs.toString();
  return s ? `${COUPONS_BASE}?${s}` : COUPONS_BASE;
}
