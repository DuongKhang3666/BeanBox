import { describe, expect, it } from 'vitest';
import {
  evaluateCoupon,
  normalizeCouponCode,
  type CouponLike,
  type CouponLine,
} from '../src/lib/coupon.js';

const now = new Date('2026-11-11T08:00:00.000Z');
const ctx = { now };

const coupon = (over: Partial<CouponLike> = {}): CouponLike => ({
  code: 'WELCOME10',
  type: 'PERCENT',
  value: 10,
  maxDiscount: 50000,
  minOrder: 0,
  startsAt: null,
  endsAt: null,
  usageLimit: null,
  perUserLimit: null,
  usedCount: 0,
  scope: null,
  isActive: true,
  ...over,
});

const line = (over: Partial<CouponLine> = {}): CouponLine => ({
  productId: 'p1',
  categoryId: 'c1',
  parentCategoryId: 'c0',
  lineTotal: 330000,
  ...over,
});

describe('normalizeCouponCode', () => {
  it('trim + uppercase', () => expect(normalizeCouponCode('  welcome10 ')).toBe('WELCOME10'));
});

describe('evaluateCoupon - reason', () => {
  const L = [line()];
  it('null -> NOT_FOUND', () => {
    expect(evaluateCoupon(null, L, ctx)).toMatchObject({
      valid: false,
      reason: 'NOT_FOUND',
      discount: 0,
      freeship: null,
    });
  });
  it('INACTIVE', () => {
    expect(evaluateCoupon(coupon({ isActive: false }), L, ctx).reason).toBe('INACTIVE');
  });
  it('NOT_STARTED', () => {
    const c = coupon({ startsAt: new Date(now.getTime() + 1) });
    expect(evaluateCoupon(c, L, ctx).reason).toBe('NOT_STARTED');
  });
  it('EXPIRED (biên endsAt/startsAt vẫn hợp lệ)', () => {
    const c = coupon({ endsAt: new Date(now.getTime() - 1) });
    expect(evaluateCoupon(c, L, ctx).reason).toBe('EXPIRED');
    expect(evaluateCoupon(coupon({ endsAt: now }), L, ctx).valid).toBe(true);
    expect(evaluateCoupon(coupon({ startsAt: now }), L, ctx).valid).toBe(true);
  });
  it('USAGE_LIMIT', () => {
    expect(evaluateCoupon(coupon({ usageLimit: 5, usedCount: 5 }), L, ctx).reason).toBe(
      'USAGE_LIMIT',
    );
    expect(evaluateCoupon(coupon({ usageLimit: 5, usedCount: 4 }), L, ctx).valid).toBe(true);
  });
  it('PER_USER_LIMIT chỉ khi biết redemptionCount', () => {
    const c = coupon({ perUserLimit: 1 });
    expect(evaluateCoupon(c, L, { now, redemptionCount: 1 }).reason).toBe('PER_USER_LIMIT');
    expect(evaluateCoupon(c, L, { now, redemptionCount: 0 }).valid).toBe(true);
    expect(evaluateCoupon(c, L, { now, redemptionCount: null }).valid).toBe(true);
    expect(evaluateCoupon(c, L, ctx).valid).toBe(true);
  });
  it('MIN_ORDER kèm minOrder', () => {
    const r = evaluateCoupon(coupon({ minOrder: 400000 }), L, ctx);
    expect(r).toMatchObject({ valid: false, reason: 'MIN_ORDER', minOrder: 400000, discount: 0 });
    expect(evaluateCoupon(coupon({ minOrder: 330000 }), L, ctx).valid).toBe(true);
  });
  it('MIN_ORDER so với subtotal toàn giỏ, không phải phần đủ điều kiện', () => {
    const lines = [
      line({ productId: 'p1', lineTotal: 100000 }),
      line({ productId: 'p2', lineTotal: 200000 }),
    ];
    const c = coupon({ minOrder: 300000, scope: { productIds: ['p1'] } });
    const r = evaluateCoupon(c, lines, ctx);
    expect(r.valid).toBe(true);
    expect(r.discount).toBe(10000);
  });
  it('NOT_APPLICABLE khi không dòng nào thuộc scope', () => {
    const c = coupon({ scope: { productIds: ['zzz'] } });
    expect(evaluateCoupon(c, L, ctx).reason).toBe('NOT_APPLICABLE');
  });
  it('giỏ rỗng -> NOT_APPLICABLE', () => {
    expect(evaluateCoupon(coupon(), [], ctx).reason).toBe('NOT_APPLICABLE');
  });
  it('thứ tự kiểm: INACTIVE trước EXPIRED, USAGE_LIMIT trước MIN_ORDER', () => {
    expect(evaluateCoupon(coupon({ isActive: false, endsAt: new Date(0) }), L, ctx).reason).toBe(
      'INACTIVE',
    );
    const c = coupon({ usageLimit: 1, usedCount: 1, minOrder: 9e9 });
    expect(evaluateCoupon(c, L, ctx).reason).toBe('USAGE_LIMIT');
  });
});

describe('evaluateCoupon - discount', () => {
  it('PERCENT floor', () => {
    const c = coupon({ value: 15, maxDiscount: null });
    expect(evaluateCoupon(c, [line({ lineTotal: 99999 })], ctx).discount).toBe(14999);
  });
  it('PERCENT bị chặn bởi maxDiscount (ví dụ §10 và trần)', () => {
    expect(evaluateCoupon(coupon(), [line()], ctx).discount).toBe(33000);
    expect(evaluateCoupon(coupon(), [line({ lineTotal: 900000 })], ctx).discount).toBe(50000);
  });
  it('FIXED lớn hơn eligible -> bằng eligible', () => {
    const c = coupon({ type: 'FIXED', value: 50000, maxDiscount: null });
    expect(evaluateCoupon(c, [line({ lineTotal: 30000 })], ctx).discount).toBe(30000);
  });
  it('FIXED thường', () => {
    const c = coupon({ type: 'FIXED', value: 50000, maxDiscount: null });
    expect(evaluateCoupon(c, [line()], ctx)).toMatchObject({
      valid: true,
      discount: 50000,
      freeship: null,
    });
  });
  it('FREESHIP: discount 0, freeship mang maxDiscount', () => {
    const c = coupon({ type: 'FREESHIP', value: 0, maxDiscount: 30000 });
    expect(evaluateCoupon(c, [line()], ctx)).toMatchObject({
      valid: true,
      discount: 0,
      freeship: { maxDiscount: 30000 },
    });
    const c2 = coupon({ type: 'FREESHIP', value: 0, maxDiscount: null });
    expect(evaluateCoupon(c2, [line()], ctx).freeship).toEqual({ maxDiscount: null });
  });
});

describe('evaluateCoupon - scope', () => {
  const lines = [
    line({ productId: 'p1', categoryId: 'c1', parentCategoryId: 'c0', lineTotal: 100000 }),
    line({ productId: 'p2', categoryId: 'c2', parentCategoryId: 'c9', lineTotal: 200000 }),
    line({ productId: 'p3', categoryId: 'c3', parentCategoryId: null, lineTotal: 400000 }),
  ];
  const pct = (scope: unknown) =>
    evaluateCoupon(coupon({ value: 10, maxDiscount: null, scope }), lines, ctx);

  it('null / {} / mảng rỗng = mọi dòng', () => {
    expect(pct(null).discount).toBe(70000);
    expect(pct({}).discount).toBe(70000);
    expect(pct({ categoryIds: [], productIds: [] }).discount).toBe(70000);
  });
  it('theo danh mục cha của dòng', () => {
    expect(pct({ categoryIds: ['c0'] }).discount).toBe(10000);
  });
  it('theo danh mục trực tiếp', () => {
    expect(pct({ categoryIds: ['c3'] }).discount).toBe(40000);
  });
  it('theo productIds, hợp (OR) với categoryIds', () => {
    expect(pct({ productIds: ['p2'] }).discount).toBe(20000);
    expect(pct({ productIds: ['p2'], categoryIds: ['c0'] }).discount).toBe(30000);
  });
  it('JSON sai -> NOT_APPLICABLE', () => {
    expect(pct('bậy').reason).toBe('NOT_APPLICABLE');
    expect(pct({ categoryIds: 'c1' }).reason).toBe('NOT_APPLICABLE');
    expect(pct([1, 2]).reason).toBe('NOT_APPLICABLE');
  });
  it('discount không vượt subtotal', () => {
    const c = coupon({ type: 'FIXED', value: 9e9, maxDiscount: null });
    expect(evaluateCoupon(c, lines, ctx).discount).toBe(700000);
  });
});
