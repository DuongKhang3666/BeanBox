import { describe, expect, it } from 'vitest';
import { buildShippingOptions, shippingZone, weightSurcharge } from '../src/lib/shipping.js';
import {
  DEFAULT_SHOP_SETTINGS,
  type ShopSettings,
} from '../src/modules/settings/settings.service.js';

const settings: ShopSettings = structuredClone(DEFAULT_SHOP_SETTINGS) as ShopSettings;

describe('weightSurcharge (D-003)', () => {
  it.each([
    [0, 0],
    [1999, 0],
    [2000, 0],
    [2001, 5000],
    [3000, 5000],
    [3001, 10000],
    [5000, 15000],
  ])('%i g -> %i', (g, fee) => {
    expect(weightSurcharge(g, settings)).toBe(fee);
  });
});

describe('shippingZone', () => {
  const cfg = { innerCityProvinceCodes: ['01', '79'], innerCityWardCodes: ['12345'] };
  it('tỉnh trong danh sách -> INNER, bất kể phường', () => {
    expect(shippingZone('79', null, cfg)).toBe('INNER');
    expect(shippingZone('01', '99999', cfg)).toBe('INNER');
  });
  it('tỉnh ngoài danh sách nhưng phường trong danh sách -> INNER', () => {
    expect(shippingZone('48', '12345', cfg)).toBe('INNER');
  });
  it('phường ngoài danh sách hoặc wardCode null -> OTHER', () => {
    expect(shippingZone('48', '54321', cfg)).toBe('OTHER');
    expect(shippingZone('48', null, cfg)).toBe('OTHER');
    expect(shippingZone('48', undefined, cfg)).toBe('OTHER');
  });
  it('thu hẹp bằng setting: bỏ 79, liệt kê phường', () => {
    const narrow = { innerCityProvinceCodes: ['01'], innerCityWardCodes: ['26740'] };
    expect(shippingZone('79', '26740', narrow)).toBe('INNER');
    expect(shippingZone('79', '26000', narrow)).toBe('OTHER');
    expect(shippingZone('79', null, narrow)).toBe('OTHER');
  });
});

describe('buildShippingOptions', () => {
  type Opts = ReturnType<typeof buildShippingOptions>;
  const base = {
    subtotal: 330000,
    discountTotal: 0,
    totalWeightGram: 1000,
    zone: 'INNER' as const,
    settings,
    freeshipCoupon: null,
  };
  const std = (o: Opts) => o.find((x) => x.method === 'STANDARD')!;
  const exp = (o: Opts) => o.find((x) => x.method === 'EXPRESS')!;

  it('trả 2 phương thức với nhãn và thời gian', () => {
    const o = buildShippingOptions(base);
    expect(o.map((x) => [x.method, x.label, x.estimatedDays])).toEqual([
      ['STANDARD', 'Tiêu chuẩn', '3-5'],
      ['EXPRESS', 'Nhanh', '1-2'],
    ]);
    expect(std(o)).toMatchObject({
      baseFee: 20000,
      fee: 20000,
      payableFee: 20000,
      grandTotal: 350000,
    });
    expect(exp(o)).toMatchObject({ baseFee: 35000, fee: 35000 });
  });

  it('vùng OTHER dùng phí khác và phụ phí cộng vào fee', () => {
    const o = buildShippingOptions({ ...base, zone: 'OTHER', totalWeightGram: 3500 });
    expect(std(o)).toMatchObject({ baseFee: 35000, weightSurcharge: 10000, fee: 45000 });
    expect(exp(o)).toMatchObject({ baseFee: 55000, fee: 65000 });
  });

  it('freeship ngưỡng: đúng 500.000 sau giảm -> miễn cả phụ phí (STANDARD)', () => {
    const o = buildShippingOptions({
      ...base,
      subtotal: 550000,
      discountTotal: 50000,
      totalWeightGram: 3500,
    });
    expect(std(o)).toMatchObject({
      freeShippingApplied: true,
      fee: 30000,
      shippingDiscount: 30000,
      payableFee: 0,
      grandTotal: 500000,
    });
  });

  it('499.999 sau giảm -> không freeship', () => {
    const o = buildShippingOptions({ ...base, subtotal: 549999, discountTotal: 50000 });
    expect(std(o).freeShippingApplied).toBe(false);
    expect(std(o).payableFee).toBe(20000);
  });

  it('EXPRESS không được freeship ngưỡng', () => {
    const o = buildShippingOptions({ ...base, subtotal: 800000 });
    expect(std(o).payableFee).toBe(0);
    expect(exp(o)).toMatchObject({
      freeShippingApplied: false,
      shippingDiscount: 0,
      payableFee: 35000,
      grandTotal: 835000,
    });
  });

  it('FREESHIP30 với fee 20.000 -> giảm hết 20.000', () => {
    const o = buildShippingOptions({ ...base, freeshipCoupon: { maxDiscount: 30000 } });
    expect(std(o)).toMatchObject({ shippingDiscount: 20000, payableFee: 0 });
    expect(exp(o)).toMatchObject({ shippingDiscount: 30000, payableFee: 5000 });
  });

  it('FREESHIP30 với fee 55.000 -> trần 30.000', () => {
    const o = buildShippingOptions({
      ...base,
      zone: 'OTHER',
      freeshipCoupon: { maxDiscount: 30000 },
    });
    expect(exp(o)).toMatchObject({ fee: 55000, shippingDiscount: 30000, payableFee: 25000 });
  });

  it('FREESHIP không trần (maxDiscount null) miễn toàn bộ, kể cả EXPRESS', () => {
    const o = buildShippingOptions({
      ...base,
      zone: 'OTHER',
      freeshipCoupon: { maxDiscount: null },
    });
    expect(exp(o)).toMatchObject({ shippingDiscount: 55000, payableFee: 0 });
  });

  it('đã freeship ngưỡng thì mã FREESHIP không cộng dồn (STANDARD)', () => {
    const o = buildShippingOptions({
      ...base,
      subtotal: 600000,
      totalWeightGram: 3500,
      freeshipCoupon: { maxDiscount: 30000 },
    });
    expect(std(o)).toMatchObject({
      freeShippingApplied: true,
      fee: 30000,
      shippingDiscount: 30000,
      payableFee: 0,
    });
    // EXPRESS vẫn dùng mã
    expect(exp(o)).toMatchObject({ fee: 45000, shippingDiscount: 30000, payableFee: 15000 });
  });

  it('grandTotal không âm', () => {
    const o = buildShippingOptions({ ...base, subtotal: 100000, discountTotal: 150000 });
    expect(std(o).grandTotal).toBeGreaterThanOrEqual(0);
  });
});
