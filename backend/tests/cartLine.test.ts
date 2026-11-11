import { describe, expect, it } from 'vitest';
import { priceCartLine, type CartLineInput } from '../src/lib/cartLine.js';

const now = new Date('2026-11-11T08:00:00.000Z');
const at = (iso: string) => new Date(iso);

const make = (
  over: {
    quantity?: number;
    unitPriceAtAdd?: number;
    variant?: Partial<CartLineInput['variant']>;
    product?: Partial<CartLineInput['product']>;
  } = {},
): CartLineInput => ({
  quantity: over.quantity ?? 2,
  unitPriceAtAdd: over.unitPriceAtAdd ?? 165000,
  variant: {
    price: 165000,
    salePrice: null,
    saleStart: null,
    saleEnd: null,
    stock: 50,
    lowStockThreshold: 5,
    isActive: true,
    deletedAt: null,
    weightGram: 500,
    ...over.variant,
  },
  product: { status: 'ACTIVE', deletedAt: null, ...over.product },
});

describe('priceCartLine', () => {
  it('giá thường, đủ hàng', () => {
    expect(priceCartLine(make(), now)).toEqual({
      unitPrice: 165000,
      listPrice: 165000,
      lineTotal: 330000,
      maxQuantity: 20,
      stockStatus: 'IN_STOCK',
      warnings: [],
      countable: true,
      weightGram: 1000,
    });
  });

  it('sale đang hiệu lực dùng salePrice; listPrice vẫn là giá niêm yết', () => {
    const r = priceCartLine(
      make({
        unitPriceAtAdd: 150000,
        variant: {
          salePrice: 150000,
          saleStart: at('2026-11-01T00:00:00Z'),
          saleEnd: at('2026-11-30T00:00:00Z'),
        },
      }),
      now,
    );
    expect(r).toMatchObject({
      unitPrice: 150000,
      listPrice: 165000,
      lineTotal: 300000,
      warnings: [],
    });
  });

  it('sale hết hạn -> giá thường và PRICE_CHANGED so với lúc thêm', () => {
    const r = priceCartLine(
      make({
        unitPriceAtAdd: 150000,
        variant: { salePrice: 150000, saleEnd: at('2026-11-10T00:00:00Z') },
      }),
      now,
    );
    expect(r.unitPrice).toBe(165000);
    expect(r.warnings).toEqual(['PRICE_CHANGED']);
  });

  it('giá đổi -> PRICE_CHANGED nhưng vẫn countable', () => {
    const r = priceCartLine(make({ unitPriceAtAdd: 175000 }), now);
    expect(r.warnings).toEqual(['PRICE_CHANGED']);
    expect(r.countable).toBe(true);
  });

  it('tồn 0 -> OUT_OF_STOCK, không countable, maxQuantity 0', () => {
    const r = priceCartLine(make({ variant: { stock: 0 } }), now);
    expect(r).toMatchObject({
      warnings: ['OUT_OF_STOCK'],
      countable: false,
      maxQuantity: 0,
      stockStatus: 'OUT_OF_STOCK',
    });
  });

  it('tồn thiếu -> INSUFFICIENT_STOCK, vẫn countable', () => {
    const r = priceCartLine(make({ quantity: 4, variant: { stock: 3 } }), now);
    expect(r).toMatchObject({
      warnings: ['INSUFFICIENT_STOCK'],
      countable: true,
      maxQuantity: 3,
      stockStatus: 'LOW_STOCK',
    });
  });

  it('tồn đúng bằng số lượng -> không cảnh báo', () => {
    const r = priceCartLine(make({ quantity: 3, variant: { stock: 3 } }), now);
    expect(r.warnings).toEqual([]);
  });

  it('LOW_STOCK theo ngưỡng; maxQuantity tối đa 20', () => {
    expect(priceCartLine(make({ variant: { stock: 5 } }), now).stockStatus).toBe('LOW_STOCK');
    expect(priceCartLine(make({ variant: { stock: 6 } }), now).stockStatus).toBe('IN_STOCK');
    expect(priceCartLine(make({ variant: { stock: 999 } }), now).maxQuantity).toBe(20);
  });

  it.each([
    ['variant ngừng bán', { variant: { isActive: false } }],
    ['variant đã xóa', { variant: { deletedAt: at('2026-11-01T00:00:00Z') } }],
    ['sản phẩm DRAFT', { product: { status: 'DRAFT' } }],
    ['sản phẩm ARCHIVED', { product: { status: 'ARCHIVED' } }],
    ['sản phẩm đã xóa', { product: { deletedAt: at('2026-11-01T00:00:00Z') } }],
  ])('%s -> UNAVAILABLE, không thêm cảnh báo tồn kho', (_n, over) => {
    const r = priceCartLine(
      make({ ...over, variant: { stock: 0, ...('variant' in over ? over.variant : {}) } }),
      now,
    );
    expect(r.warnings).toEqual(['UNAVAILABLE']);
    expect(r.countable).toBe(false);
  });
});
