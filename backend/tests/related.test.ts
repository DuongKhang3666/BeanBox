import { describe, expect, it } from 'vitest';
import { rankRelated, scoreRelated, type RelatedProfile } from '../src/lib/related.js';

const mk = (over: Partial<RelatedProfile> & { id: string }): RelatedProfile => ({
  categoryId: `c-${over.id}`,
  parentCategoryId: null,
  brandId: null,
  tags: [],
  inStock: true,
  soldCount: 0,
  minPrice: 0,
  coffee: null,
  ...over,
});

const base = mk({
  id: 'base',
  categoryId: 'c1',
  parentCategoryId: 'root',
  brandId: 'b1',
  tags: ['Specialty', 'hoa'],
  minPrice: 100_000,
  coffee: {
    roastLevel: 'LIGHT',
    originCountry: 'Ethiopia',
    process: 'WASHED',
    brewMethods: ['POUR_OVER', 'AEROPRESS'],
  },
});

describe('scoreRelated', () => {
  it('cùng danh mục +4; khác danh mục cùng cha +2; khác hẳn 0', () => {
    expect(scoreRelated(base, mk({ id: 'x', categoryId: 'c1' }))).toBe(4);
    expect(scoreRelated(base, mk({ id: 'x', categoryId: 'c2', parentCategoryId: 'root' }))).toBe(2);
    expect(scoreRelated(base, mk({ id: 'x', categoryId: 'c2', parentCategoryId: 'other' }))).toBe(
      0,
    );
  });

  it('cha null ở cả hai không tính là cùng cha', () => {
    const b = mk({ id: 'b', categoryId: 'c1', parentCategoryId: null });
    expect(scoreRelated(b, mk({ id: 'x', categoryId: 'c2', parentCategoryId: null }))).toBe(0);
  });

  it('cùng brand +2, brand null không tính', () => {
    expect(scoreRelated(base, mk({ id: 'x', brandId: 'b1' }))).toBe(2);
    const noBrand = mk({ id: 'n', brandId: null });
    expect(scoreRelated(noBrand, mk({ id: 'x', brandId: null }))).toBe(0);
  });

  it('tag trùng không phân biệt hoa thường, tối đa +3', () => {
    expect(scoreRelated(base, mk({ id: 'x', tags: ['SPECIALTY'] }))).toBe(1);
    expect(scoreRelated(base, mk({ id: 'x', tags: ['specialty', 'HOA'] }))).toBe(2);
    const many = mk({ id: 'm', tags: ['a', 'b', 'c', 'd', 'e'] });
    const cand = mk({ id: 'x', tags: ['A', 'B', 'C', 'D', 'E'] });
    expect(scoreRelated(many, cand)).toBe(3);
  });

  it('thuộc tính cà phê chỉ tính khi cả hai có coffee', () => {
    const same = mk({
      id: 'x',
      coffee: {
        roastLevel: 'LIGHT',
        originCountry: 'ethiopia',
        process: 'WASHED',
        brewMethods: ['AEROPRESS', 'MOKA'],
      },
    });
    expect(scoreRelated(base, same)).toBe(4);
    const diff = mk({
      id: 'y',
      coffee: {
        roastLevel: 'DARK',
        originCountry: 'Brazil',
        process: 'NATURAL',
        brewMethods: ['PHIN'],
      },
    });
    expect(scoreRelated(base, diff)).toBe(0);
    const tool = mk({ id: 'z', coffee: null });
    expect(scoreRelated(base, tool)).toBe(0);
  });

  it('giá trong ±30% giá gốc +1 (biên gồm cả hai đầu), giá gốc 0 thì bỏ qua', () => {
    expect(scoreRelated(base, mk({ id: 'x', minPrice: 130_000 }))).toBe(1);
    expect(scoreRelated(base, mk({ id: 'x', minPrice: 70_000 }))).toBe(1);
    expect(scoreRelated(base, mk({ id: 'x', minPrice: 131_000 }))).toBe(0);
    expect(scoreRelated(mk({ id: 'z', minPrice: 0 }), mk({ id: 'x', minPrice: 0 }))).toBe(0);
  });
});

describe('rankRelated', () => {
  it('còn hàng trước, rồi điểm, rồi soldCount, rồi id; loại điểm 0 và chính nó', () => {
    const list = [
      mk({ id: 'd', categoryId: 'c1', inStock: false, soldCount: 999 }),
      mk({ id: 'c', categoryId: 'c1', soldCount: 5 }),
      mk({ id: 'b', categoryId: 'c1', soldCount: 5 }),
      mk({ id: 'a', categoryId: 'c1', brandId: 'b1', soldCount: 0 }),
      mk({ id: 'zero', categoryId: 'other' }),
      mk({ id: 'base', categoryId: 'c1' }),
    ];
    expect(rankRelated(base, list, 8).map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('giới hạn số phần tử', () => {
    const list = Array.from({ length: 12 }, (_, i) => mk({ id: `p${i}`, categoryId: 'c1' }));
    expect(rankRelated(base, list, 8)).toHaveLength(8);
  });
});
