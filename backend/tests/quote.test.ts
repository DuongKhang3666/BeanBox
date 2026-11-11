import { describe, expect, it } from 'vitest';
import type { CouponLike } from '../src/lib/coupon.js';
import { computeTotals, type QuoteLine } from '../src/lib/quote.js';
import {
  DEFAULT_SHOP_SETTINGS,
  type ShopSettings,
} from '../src/modules/settings/settings.service.js';

const settings = DEFAULT_SHOP_SETTINGS as ShopSettings;
const now = new Date('2026-11-11T08:00:00.000Z');

const line = (over: Partial<QuoteLine> = {}): QuoteLine => ({
  quantity: 2,
  lineTotal: 330000,
  weightGram: 1000,
  countable: true,
  productId: 'p1',
  categoryId: 'c1',
  parentCategoryId: null,
  ...over,
});

const welcome: CouponLike = {
  code: 'WELCOME10',
  type: 'PERCENT',
  value: 10,
  maxDiscount: 50000,
  minOrder: 200000,
  startsAt: null,
  endsAt: null,
  usageLimit: null,
  perUserLimit: null,
  usedCount: 0,
  scope: null,
  isActive: true,
};
const freeship: CouponLike = {
  ...welcome,
  code: 'FREESHIP30',
  type: 'FREESHIP',
  value: 0,
  maxDiscount: 30000,
  minOrder: 0,
};

describe('computeTotals', () => {
  it('ví dụ §10 = 317.000', () => {
    const t = computeTotals({
      lines: [line()],
      coupon: { code: 'WELCOME10', coupon: welcome },
      zone: 'INNER',
      settings,
      now,
    });
    expect(t).toMatchObject({
      subtotal: 330000,
      itemCount: 2,
      totalWeightGram: 1000,
      discountTotal: 33000,
    });
    expect(t.coupon).toEqual({
      code: 'WELCOME10',
      type: 'PERCENT',
      discount: 33000,
      valid: true,
      invalidReason: null,
    });
    const std = t.shippingOptions!.find((o) => o.method === 'STANDARD')!;
    expect(std).toMatchObject({ fee: 20000, shippingDiscount: 0, grandTotal: 317000 });
    expect(t.shippingEstimate).toEqual({
      standardFrom: 20000,
      freeShippingThreshold: 500000,
      freeShippingRemaining: 203000,
    });
  });

  it('chỉ cộng dòng countable', () => {
    const t = computeTotals({
      lines: [line(), line({ countable: false, lineTotal: 999999, quantity: 5, weightGram: 5000 })],
      coupon: null,
      zone: null,
      settings,
      now,
    });
    expect(t).toMatchObject({
      subtotal: 330000,
      itemCount: 2,
      totalWeightGram: 1000,
      discountTotal: 0,
      coupon: null,
    });
    expect(t.shippingOptions).toBeNull();
  });

  it('mã không tồn tại/không hợp lệ -> valid false, discount 0, không làm hỏng tổng', () => {
    const t = computeTotals({
      lines: [line()],
      coupon: { code: 'XYZ', coupon: null },
      zone: 'INNER',
      settings,
      now,
    });
    expect(t.coupon).toEqual({
      code: 'XYZ',
      type: null,
      discount: 0,
      valid: false,
      invalidReason: 'NOT_FOUND',
    });
    expect(t.discountTotal).toBe(0);
    const t2 = computeTotals({
      lines: [line({ lineTotal: 100000 })],
      coupon: { code: 'WELCOME10', coupon: welcome },
      zone: null,
      settings,
      now,
    });
    expect(t2.coupon).toMatchObject({ valid: false, invalidReason: 'MIN_ORDER', minOrder: 200000 });
  });

  it('FREESHIP: discountTotal 0 ở giỏ, giảm nằm ở shippingOptions', () => {
    const t = computeTotals({
      lines: [line()],
      coupon: { code: 'FREESHIP30', coupon: freeship },
      zone: 'OTHER',
      settings,
      now,
    });
    expect(t.coupon).toMatchObject({ discount: 0, valid: true });
    const std = t.shippingOptions!.find((o) => o.method === 'STANDARD')!;
    expect(std).toMatchObject({ fee: 35000, shippingDiscount: 30000, payableFee: 5000 });
  });

  it('shippingEstimate: đủ ngưỡng -> standardFrom 0, remaining 0', () => {
    const t = computeTotals({
      lines: [line({ lineTotal: 600000 })],
      coupon: null,
      zone: null,
      settings,
      now,
    });
    expect(t.shippingEstimate).toEqual({
      standardFrom: 0,
      freeShippingThreshold: 500000,
      freeShippingRemaining: 0,
    });
  });

  it('giỏ không có dòng countable: mọi số = 0 (kể cả freeShippingRemaining)', () => {
    for (const lines of [[], [line({ countable: false })]]) {
      const t = computeTotals({ lines, coupon: null, zone: null, settings, now });
      expect(t.subtotal).toBe(0);
      expect(t.shippingEstimate).toEqual({
        standardFrom: 0,
        freeShippingThreshold: 500000,
        freeShippingRemaining: 0,
      });
    }
  });

  it('shippingEstimate: gồm phụ phí khối lượng', () => {
    const t = computeTotals({
      lines: [line({ weightGram: 3500 })],
      coupon: null,
      zone: null,
      settings,
      now,
    });
    expect(t.shippingEstimate.standardFrom).toBe(30000);
  });

  it('giỏ rỗng: các số 0, standardFrom 0', () => {
    const t = computeTotals({ lines: [], coupon: null, zone: null, settings, now });
    expect(t).toMatchObject({ subtotal: 0, itemCount: 0, totalWeightGram: 0, discountTotal: 0 });
    expect(t.shippingEstimate.standardFrom).toBe(0);
  });
});
