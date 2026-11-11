import { z } from 'zod';

/** Đánh giá mã giảm giá (api-contract §8.7, §10 mục 2). Hàm thuần; tiền là số nguyên VND. */

export type CouponType = 'PERCENT' | 'FIXED' | 'FREESHIP';

export type CouponReason =
  | 'NOT_FOUND'
  | 'INACTIVE'
  | 'NOT_STARTED'
  | 'EXPIRED'
  | 'USAGE_LIMIT'
  | 'PER_USER_LIMIT'
  | 'MIN_ORDER'
  | 'NOT_APPLICABLE';

export interface CouponLike {
  code: string;
  type: CouponType;
  value: number;
  maxDiscount: number | null;
  minOrder: number;
  startsAt: Date | null;
  endsAt: Date | null;
  usageLimit: number | null;
  perUserLimit: number | null;
  usedCount: number;
  scope: unknown;
  isActive: boolean;
}

/** Dòng tính tiền được (đã loại OUT_OF_STOCK/UNAVAILABLE). */
export interface CouponLine {
  productId: string;
  categoryId: string;
  parentCategoryId: string | null;
  lineTotal: number;
}

export interface CouponContext {
  now: Date;
  /** Số lượt đã dùng (chưa hoàn) của người này; null/undefined = chưa biết, bỏ qua kiểm tra. */
  redemptionCount?: number | null;
}

export interface CouponEvaluation {
  valid: boolean;
  reason: CouponReason | null;
  minOrder?: number;
  type: CouponType | null;
  /** Chỉ giảm trên hàng; FREESHIP luôn 0. */
  discount: number;
  freeship: { maxDiscount: number | null } | null;
}

export function normalizeCouponCode(s: string): string {
  return s.trim().toUpperCase();
}

const scopeSchema = z.object({
  categoryIds: z.array(z.string()).optional(),
  productIds: z.array(z.string()).optional(),
});

type ScopeParse =
  | { kind: 'all' }
  | { kind: 'sets'; categoryIds: Set<string>; productIds: Set<string> }
  | { kind: 'none' };

function parseScope(raw: unknown): ScopeParse {
  if (raw == null) return { kind: 'all' };
  const parsed = scopeSchema.safeParse(raw);
  if (!parsed.success) return { kind: 'none' };
  const categoryIds = new Set(parsed.data.categoryIds ?? []);
  const productIds = new Set(parsed.data.productIds ?? []);
  if (categoryIds.size === 0 && productIds.size === 0) return { kind: 'all' };
  return { kind: 'sets', categoryIds, productIds };
}

function eligibleTotal(scopeRaw: unknown, lines: readonly CouponLine[]): number {
  const scope = parseScope(scopeRaw);
  if (scope.kind === 'none') return 0;
  return lines.reduce((sum, l) => {
    if (scope.kind === 'all') return sum + l.lineTotal;
    const ok =
      scope.productIds.has(l.productId) ||
      scope.categoryIds.has(l.categoryId) ||
      (l.parentCategoryId != null && scope.categoryIds.has(l.parentCategoryId));
    return ok ? sum + l.lineTotal : sum;
  }, 0);
}

export function evaluateCoupon(
  coupon: CouponLike | null,
  lines: readonly CouponLine[],
  ctx: CouponContext,
): CouponEvaluation {
  const fail = (
    reason: CouponReason,
    type: CouponType | null,
    minOrder?: number,
  ): CouponEvaluation => ({
    valid: false,
    reason,
    type,
    discount: 0,
    freeship: null,
    ...(minOrder !== undefined ? { minOrder } : {}),
  });

  if (coupon == null) return fail('NOT_FOUND', null);
  const t = ctx.now.getTime();
  if (!coupon.isActive) return fail('INACTIVE', coupon.type);
  if (coupon.startsAt != null && t < coupon.startsAt.getTime())
    return fail('NOT_STARTED', coupon.type);
  if (coupon.endsAt != null && t > coupon.endsAt.getTime()) return fail('EXPIRED', coupon.type);
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) {
    return fail('USAGE_LIMIT', coupon.type);
  }
  if (
    coupon.perUserLimit != null &&
    ctx.redemptionCount != null &&
    ctx.redemptionCount >= coupon.perUserLimit
  ) {
    return fail('PER_USER_LIMIT', coupon.type);
  }
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  if (subtotal < coupon.minOrder) return fail('MIN_ORDER', coupon.type, coupon.minOrder);

  const eligible = eligibleTotal(coupon.scope, lines);
  if (eligible <= 0) return fail('NOT_APPLICABLE', coupon.type);

  if (coupon.type === 'FREESHIP') {
    return {
      valid: true,
      reason: null,
      type: coupon.type,
      discount: 0,
      freeship: { maxDiscount: coupon.maxDiscount },
    };
  }
  const raw =
    coupon.type === 'PERCENT'
      ? Math.min(Math.floor((eligible * coupon.value) / 100), coupon.maxDiscount ?? Infinity)
      : Math.min(coupon.value, eligible);
  return {
    valid: true,
    reason: null,
    type: coupon.type,
    discount: Math.max(0, Math.min(raw, subtotal)),
    freeship: null,
  };
}
