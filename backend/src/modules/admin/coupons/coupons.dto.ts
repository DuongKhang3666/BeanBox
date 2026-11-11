import type { Coupon } from '@prisma/client';
import type { CouponStateName } from './coupons.schema.js';

/** AdminCoupon (api-contract §13.8): mọi trường Coupon + `state` tính tại thời điểm gọi. */
export interface AdminCouponDto {
  id: string;
  code: string;
  description: string | null;
  type: string;
  value: number;
  maxDiscount: number | null;
  minOrder: number;
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  perUserLimit: number | null;
  usedCount: number;
  scope: { categoryIds: string[]; productIds: string[] } | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  state: CouponStateName;
}

/** INACTIVE > EXHAUSTED > EXPIRED > SCHEDULED > ACTIVE. */
export function couponState(
  c: Pick<Coupon, 'isActive' | 'usageLimit' | 'usedCount' | 'startsAt' | 'endsAt'>,
  now: Date,
): CouponStateName {
  if (!c.isActive) return 'INACTIVE';
  if (c.usageLimit !== null && c.usedCount >= c.usageLimit) return 'EXHAUSTED';
  if (c.endsAt && c.endsAt.getTime() < now.getTime()) return 'EXPIRED';
  if (c.startsAt && c.startsAt.getTime() > now.getTime()) return 'SCHEDULED';
  return 'ACTIVE';
}

function toScope(raw: unknown): AdminCouponDto['scope'] {
  if (raw === null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const ids = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  return { categoryIds: ids(o.categoryIds), productIds: ids(o.productIds) };
}

export function toAdminCoupon(c: Coupon, now: Date = new Date()): AdminCouponDto {
  return {
    id: c.id,
    code: c.code,
    description: c.description,
    type: c.type,
    value: c.value,
    maxDiscount: c.maxDiscount,
    minOrder: c.minOrder,
    startsAt: c.startsAt ? c.startsAt.toISOString() : null,
    endsAt: c.endsAt ? c.endsAt.toISOString() : null,
    usageLimit: c.usageLimit,
    perUserLimit: c.perUserLimit,
    usedCount: c.usedCount,
    scope: toScope(c.scope),
    isActive: c.isActive,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    state: couponState(c, now),
  };
}
