import { describe, expect, it } from 'vitest';
import {
  effectivePrice,
  isOnSale,
  summarizePrices,
  type PricedVariant,
} from '../src/lib/pricing.js';

const now = new Date('2026-11-10T08:00:00.000Z');
const at = (iso: string) => new Date(iso);

const v = (over: Partial<PricedVariant> = {}): PricedVariant => ({
  price: 200000,
  salePrice: 150000,
  saleStart: at('2026-11-01T00:00:00.000Z'),
  saleEnd: at('2026-11-30T00:00:00.000Z'),
  ...over,
});

describe('effectivePrice / isOnSale', () => {
  it('trong khung sale -> salePrice', () => {
    expect(isOnSale(v(), now)).toBe(true);
    expect(effectivePrice(v(), now)).toBe(150000);
  });

  it('chưa bắt đầu -> giá niêm yết', () => {
    const x = v({ saleStart: at('2026-11-11T00:00:00.000Z') });
    expect(isOnSale(x, now)).toBe(false);
    expect(effectivePrice(x, now)).toBe(200000);
  });

  it('đã hết hạn -> giá niêm yết', () => {
    const x = v({ saleEnd: at('2026-11-09T00:00:00.000Z') });
    expect(effectivePrice(x, now)).toBe(200000);
  });

  it('đúng biên saleStart và saleEnd đều tính là đang sale', () => {
    expect(effectivePrice(v({ saleStart: now }), now)).toBe(150000);
    expect(effectivePrice(v({ saleEnd: now }), now)).toBe(150000);
    expect(effectivePrice(v({ saleStart: new Date(now.getTime() + 1) }), now)).toBe(200000);
    expect(effectivePrice(v({ saleEnd: new Date(now.getTime() - 1) }), now)).toBe(200000);
  });

  it('bound null = mở', () => {
    expect(effectivePrice(v({ saleStart: null }), now)).toBe(150000);
    expect(effectivePrice(v({ saleEnd: null }), now)).toBe(150000);
    expect(effectivePrice(v({ saleStart: null, saleEnd: null }), now)).toBe(150000);
  });

  it('không có salePrice -> giá niêm yết', () => {
    expect(effectivePrice(v({ salePrice: null }), now)).toBe(200000);
    expect(isOnSale(v({ salePrice: null }), now)).toBe(false);
  });
});

describe('summarizePrices', () => {
  it('không có variant -> 0 và null', () => {
    expect(summarizePrices([], now)).toEqual({ minPrice: 0, compareAtPrice: null });
  });

  it('variant sale thấp nhất -> compareAtPrice là giá niêm yết của nó', () => {
    const list = [v({ price: 400000, salePrice: null }), v()];
    expect(summarizePrices(list, now)).toEqual({ minPrice: 150000, compareAtPrice: 200000 });
  });

  it('variant rẻ nhất không sale -> compareAtPrice null', () => {
    const list = [v({ price: 90000, salePrice: null }), v()];
    expect(summarizePrices(list, now)).toEqual({ minPrice: 90000, compareAtPrice: null });
  });

  it('sale hết hạn không ảnh hưởng', () => {
    const list = [v({ saleEnd: at('2026-11-09T00:00:00.000Z') })];
    expect(summarizePrices(list, now)).toEqual({ minPrice: 200000, compareAtPrice: null });
  });
});
