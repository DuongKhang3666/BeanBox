import { describe, expect, it } from 'vitest';
import {
  computeProductDenorm,
  type DenormVariantInput,
} from '../src/modules/catalog/catalog.denorm.js';

const now = new Date('2026-11-10T08:00:00.000Z');
const product = { name: 'Cà phê Đà Lạt', tags: ['Hoa Nhài', 'Cam chanh'], shortDesc: 'Thơm  dịu' };

const variant = (over: Partial<DenormVariantInput> = {}): DenormVariantInput => ({
  price: 100000,
  salePrice: null,
  saleStart: null,
  saleEnd: null,
  stock: 10,
  isActive: true,
  deletedAt: null,
  ...over,
});

describe('computeProductDenorm', () => {
  it('searchText = normalize(name + tags + shortDesc)', () => {
    expect(computeProductDenorm(product, [variant()], now).searchText).toBe(
      'ca phe da lat hoa nhai cam chanh thom diu',
    );
  });

  it('minPrice là giá hiệu lực thấp nhất, kể cả variant hết hàng', () => {
    const d = computeProductDenorm(
      product,
      [variant({ price: 300000 }), variant({ price: 120000, stock: 0 })],
      now,
    );
    expect(d.minPrice).toBe(120000);
    expect(d.inStock).toBe(true);
  });

  it('dùng giá sale khi đang hiệu lực', () => {
    const d = computeProductDenorm(
      product,
      [
        variant({
          price: 200000,
          salePrice: 150000,
          saleStart: new Date('2026-11-01T00:00:00.000Z'),
          saleEnd: new Date('2026-11-30T00:00:00.000Z'),
        }),
      ],
      now,
    );
    expect(d.minPrice).toBe(150000);
  });

  it('bỏ qua variant không active hoặc đã xóa mềm', () => {
    const d = computeProductDenorm(
      product,
      [
        variant({ price: 50000, isActive: false, stock: 99 }),
        variant({ price: 60000, deletedAt: new Date(), stock: 99 }),
        variant({ price: 180000, stock: 0 }),
      ],
      now,
    );
    expect(d.minPrice).toBe(180000);
    expect(d.inStock).toBe(false);
  });

  it('không có variant -> minPrice 0, inStock false', () => {
    const d = computeProductDenorm(product, [], now);
    expect(d.minPrice).toBe(0);
    expect(d.inStock).toBe(false);
  });

  it('chỉ có variant bị loại -> 0/false', () => {
    const d = computeProductDenorm(product, [variant({ isActive: false })], now);
    expect(d).toMatchObject({ minPrice: 0, inStock: false });
  });
});
