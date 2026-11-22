import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SHOP_SETTINGS,
  parseShopSettings,
} from '../src/modules/settings/settings.service.js';

const full = [
  {
    key: 'shipping.rates',
    value: { inner: { STANDARD: 1, EXPRESS: 2 }, other: { STANDARD: 3, EXPRESS: 4 } },
  },
  { key: 'shipping.innerCityProvinceCodes', value: ['48'] },
  { key: 'shipping.innerCityWardCodes', value: ['26740'] },
  { key: 'shipping.freeShippingThreshold', value: 300000 },
  { key: 'shipping.weightSurcharge', value: { freeGram: 1000, stepGram: 500, feePerStep: 2000 } },
  { key: 'order.paymentExpiryMinutes', value: 30 },
];

describe('parseShopSettings', () => {
  it('shipping.eta: đọc giá trị hợp lệ; min > max hoặc ngoài 0..30 -> mặc định', () => {
    const eta = {
      inner: { STANDARD: { minDays: 2, maxDays: 4 }, EXPRESS: { minDays: 0, maxDays: 0 } },
      other: { STANDARD: { minDays: 5, maxDays: 9 }, EXPRESS: { minDays: 1, maxDays: 30 } },
    };
    expect(parseShopSettings([{ key: 'shipping.eta', value: eta }]).shippingEta).toEqual(eta);
    for (const bad of [
      { ...eta, inner: { ...eta.inner, STANDARD: { minDays: 5, maxDays: 2 } } },
      { ...eta, other: { ...eta.other, EXPRESS: { minDays: 0, maxDays: 31 } } },
    ]) {
      expect(parseShopSettings([{ key: 'shipping.eta', value: bad }]).shippingEta).toEqual(
        DEFAULT_SHOP_SETTINGS.shippingEta,
      );
    }
  });

  it('đọc đủ các key hợp lệ', () => {
    expect(parseShopSettings(full)).toEqual({
      shippingRates: { inner: { STANDARD: 1, EXPRESS: 2 }, other: { STANDARD: 3, EXPRESS: 4 } },
      shippingEta: DEFAULT_SHOP_SETTINGS.shippingEta,
      innerCityProvinceCodes: ['48'],
      innerCityWardCodes: ['26740'],
      freeShippingThreshold: 300000,
      weightSurcharge: { freeGram: 1000, stepGram: 500, feePerStep: 2000 },
      paymentExpiryMinutes: 30,
    });
  });

  it('không có dòng nào -> toàn bộ mặc định (khớp seed)', () => {
    expect(parseShopSettings([])).toEqual(DEFAULT_SHOP_SETTINGS);
    expect(DEFAULT_SHOP_SETTINGS.innerCityWardCodes).toEqual([]);
    expect(DEFAULT_SHOP_SETTINGS.innerCityProvinceCodes).toEqual(['01', '79']);
  });

  it('key sai kiểu/giá trị -> mặc định cho key đó, key khác giữ nguyên', () => {
    const rows = full.map((r) => {
      if (r.key === 'shipping.freeShippingThreshold') return { ...r, value: '500000' };
      if (r.key === 'shipping.innerCityWardCodes') return { ...r, value: ['abc'] };
      if (r.key === 'shipping.weightSurcharge')
        return { ...r, value: { freeGram: 1, stepGram: 0, feePerStep: 1 } };
      if (r.key === 'shipping.rates')
        return { ...r, value: { inner: { STANDARD: 1.5, EXPRESS: 2 } } };
      return r;
    });
    const s = parseShopSettings(rows);
    expect(s.freeShippingThreshold).toBe(500000);
    expect(s.innerCityWardCodes).toEqual([]);
    expect(s.weightSurcharge).toEqual(DEFAULT_SHOP_SETTINGS.weightSurcharge);
    expect(s.shippingRates).toEqual(DEFAULT_SHOP_SETTINGS.shippingRates);
    expect(s.innerCityProvinceCodes).toEqual(['48']);
    expect(s.paymentExpiryMinutes).toBe(30);
  });

  it('thiếu một key -> mặc định cho key đó; kết quả không dùng chung tham chiếu với mặc định', () => {
    const s = parseShopSettings(full.filter((r) => r.key !== 'order.paymentExpiryMinutes'));
    expect(s.paymentExpiryMinutes).toBe(15);
    const d = parseShopSettings([]);
    d.innerCityProvinceCodes.push('99');
    expect(DEFAULT_SHOP_SETTINGS.innerCityProvinceCodes).toEqual(['01', '79']);
  });

  it('bỏ qua key lạ', () => {
    expect(parseShopSettings([{ key: 'home.banners', value: [] }])).toEqual(DEFAULT_SHOP_SETTINGS);
  });
});
