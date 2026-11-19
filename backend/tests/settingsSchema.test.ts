import { describe, expect, it } from 'vitest';
import { AppError } from '../src/lib/errors.js';
import { parseSettingsPatch } from '../src/modules/admin/settings/settings.schema.js';

const ok = (patch: Record<string, unknown>) => parseSettingsPatch(patch);
function fields(patch: unknown): string[] {
  try {
    parseSettingsPatch(patch);
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    const err = e as AppError;
    expect(err.status).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    return (err.details as Array<{ field: string }>).map((d) => d.field);
  }
  return [];
}
const bad = (key: string, value: unknown) => expect(fields({ [key]: value })).not.toEqual([]);

const rates = (n: unknown) => ({
  inner: { STANDARD: n, EXPRESS: 1 },
  other: { STANDARD: 1, EXPRESS: 1 },
});

describe('body PUT', () => {
  it('không phải object / rỗng / key lạ', () => {
    for (const b of [null, [], 'x', 5, {}]) expect(fields(b)).not.toEqual([]);
    expect(fields({ 'shipping.foo': 1 })).toEqual(['shipping.foo']);
  });
});

describe('shipping.rates', () => {
  it('biên 0..1_000_000', () => {
    expect(ok({ 'shipping.rates': rates(0) })).toBeTruthy();
    expect(ok({ 'shipping.rates': rates(1_000_000) })).toBeTruthy();
    for (const n of [1_000_001, -1, 1.5, '1']) bad('shipping.rates', rates(n));
    expect(fields({ 'shipping.rates': rates(-1) })).toEqual(['shipping.rates.inner.STANDARD']);
  });
});

describe('shipping.innerCityProvinceCodes / WardCodes', () => {
  it('hợp lệ, bỏ trùng, được rỗng', () => {
    expect(ok({ 'shipping.innerCityProvinceCodes': ['79', '01', '79'] })).toEqual({
      'shipping.innerCityProvinceCodes': ['79', '01'],
    });
    expect(ok({ 'shipping.innerCityProvinceCodes': [] })).toBeTruthy();
    expect(ok({ 'shipping.innerCityWardCodes': ['25747', '25747'] })).toEqual({
      'shipping.innerCityWardCodes': ['25747'],
    });
  });
  it('mã sai', () => {
    bad('shipping.innerCityProvinceCodes', ['99']);
    bad('shipping.innerCityProvinceCodes', ['1']);
    bad('shipping.innerCityProvinceCodes', [79]);
    bad('shipping.innerCityWardCodes', ['00000']);
    bad('shipping.innerCityWardCodes', ['2574']);
    expect(fields({ 'shipping.innerCityProvinceCodes': ['01', '99'] })).toEqual([
      'shipping.innerCityProvinceCodes.1',
    ]);
  });
});

describe('số nguyên đơn', () => {
  it('freeShippingThreshold', () => {
    ok({ 'shipping.freeShippingThreshold': 0 });
    ok({ 'shipping.freeShippingThreshold': 100_000_000 });
    for (const n of [100_000_001, -1, 0.5]) bad('shipping.freeShippingThreshold', n);
  });
  it('paymentExpiryMinutes 5..120', () => {
    ok({ 'order.paymentExpiryMinutes': 5 });
    ok({ 'order.paymentExpiryMinutes': 120 });
    for (const n of [4, 121, 10.5]) bad('order.paymentExpiryMinutes', n);
  });
  it('weightSurcharge', () => {
    ok({ 'shipping.weightSurcharge': { freeGram: 0, stepGram: 1, feePerStep: 0 } });
    bad('shipping.weightSurcharge', { freeGram: 0, stepGram: 0, feePerStep: 0 });
    bad('shipping.weightSurcharge', { freeGram: 100_001, stepGram: 1, feePerStep: 0 });
    bad('shipping.weightSurcharge', { freeGram: 0, stepGram: 1, feePerStep: 1_000_001 });
  });
});

describe('store.contact', () => {
  const base = { name: ' BeanBox ', email: 'Hello@BeanBox.VN', phone: '0901 234 567', address: '' };
  it('chuẩn hóa', () => {
    expect(ok({ 'store.contact': base })['store.contact']).toEqual({
      name: 'BeanBox',
      email: 'hello@beanbox.vn',
      phone: '0901234567',
      address: '',
    });
    expect(ok({ 'store.contact': { ...base, phone: '' } })).toBeTruthy();
  });
  it('lỗi', () => {
    bad('store.contact', { ...base, phone: '12345' });
    bad('store.contact', { ...base, email: 'khong-hop-le' });
    bad('store.contact', { ...base, name: 'a\nb' });
    bad('store.contact', { ...base, name: '  ' });
    bad('store.contact', { ...base, address: 'x\u0007y' });
    bad('store.contact', { ...base, address: 'x'.repeat(301) });
    expect(fields({ 'store.contact': { ...base, phone: 'abc' } })).toEqual(['store.contact.phone']);
  });
});

describe('home.banners', () => {
  const b = (over: Record<string, unknown> = {}) => ({
    imageUrl: '/uploads/a.jpg',
    alt: 'Ảnh',
    isActive: true,
    ...over,
  });
  it('hợp lệ + mặc định', () => {
    const out = ok({ 'home.banners': [b({ href: '/san-pham/abc' }), b({ href: null })] });
    expect(out['home.banners']).toEqual([
      {
        imageUrl: '/uploads/a.jpg',
        alt: 'Ảnh',
        title: '',
        subtitle: '',
        href: '/san-pham/abc',
        isActive: true,
      },
      {
        imageUrl: '/uploads/a.jpg',
        alt: 'Ảnh',
        title: '',
        subtitle: '',
        href: null,
        isActive: true,
      },
    ]);
    ok({ 'home.banners': [] });
  });
  it('imageUrl không an toàn', () => {
    for (const u of [
      'javascript:alert(1)',
      'https://x.com/a.jpg',
      '//evil.com/a.jpg',
      '/uploads/../x',
      '/uploads/%2e%2e/x',
      '/static/a.jpg',
      '/uploads/a b.jpg',
    ]) {
      expect(fields({ 'home.banners': [b({ imageUrl: u })] }), u).toEqual([
        'home.banners.0.imageUrl',
      ]);
    }
  });
  it('href không an toàn', () => {
    for (const h of ['//evil.com', 'https://evil.com', '/\\evil', 'javascript:alert(1)', '/a b']) {
      expect(fields({ 'home.banners': [b({ href: h })] }), h).toEqual(['home.banners.0.href']);
    }
  });
  it('giới hạn số lượng và độ dài', () => {
    ok({ 'home.banners': Array.from({ length: 5 }, () => b()) });
    bad(
      'home.banners',
      Array.from({ length: 6 }, () => b()),
    );
    bad('home.banners', [b({ alt: '' })]);
    bad('home.banners', [b({ title: 'x'.repeat(101) })]);
    bad('home.banners', [b({ isActive: 'yes' })]);
  });
});
