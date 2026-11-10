import { describe, expect, it } from 'vitest';
import {
  productListQuerySchema,
  slugSchema,
  suggestQuerySchema,
} from '../src/modules/catalog/catalog.schema.js';

const parse = (q: Record<string, unknown>) => productListQuerySchema.safeParse(q);

describe('productListQuerySchema', () => {
  it('mặc định: page 1, pageSize 20, sort newest khi không có q', () => {
    const r = parse({});
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ page: 1, pageSize: 20, sort: 'newest' });
  });

  it('có q mà không gửi sort -> relevance', () => {
    expect(parse({ q: 'ca phe' }).data?.sort).toBe('relevance');
    expect(parse({ q: 'ca phe', sort: 'price_asc' }).data?.sort).toBe('price_asc');
  });

  it('danh sách phân tách dấu phẩy: trim, bỏ rỗng, bỏ trùng', () => {
    const r = parse({ brand: ' hario , kalita,, hario ', roast: 'LIGHT, MEDIUM', brew: 'PHIN,MOKA' });
    expect(r.data?.brand).toEqual(['hario', 'kalita']);
    expect(r.data?.roast).toEqual(['LIGHT', 'MEDIUM']);
    expect(r.data?.brew).toEqual(['PHIN', 'MOKA']);
  });

  it('tham số lặp (brand=a&brand=b) được gộp như dấu phẩy', () => {
    expect(parse({ brand: ['a', 'b'] }).data?.brand).toEqual(['a', 'b']);
  });

  it('danh sách rỗng coi như không lọc', () => {
    expect(parse({ origin: ' , ' }).data?.origin).toBeUndefined();
  });

  it('enum sai -> lỗi', () => {
    expect(parse({ roast: 'LIGHT,XYZ' }).success).toBe(false);
    expect(parse({ process: 'washed' }).success).toBe(false);
    expect(parse({ brew: 'KETTLE' }).success).toBe(false);
    expect(parse({ sort: 'cheapest' }).success).toBe(false);
  });

  it('minPrice > maxPrice -> lỗi; bằng nhau thì hợp lệ', () => {
    const bad = parse({ minPrice: '200', maxPrice: '100' });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0]?.path).toEqual(['minPrice']);
    expect(parse({ minPrice: '100', maxPrice: '100' }).success).toBe(true);
  });

  it('giá không phải số nguyên không âm -> lỗi', () => {
    expect(parse({ minPrice: '-1' }).success).toBe(false);
    expect(parse({ minPrice: '1.5' }).success).toBe(false);
    expect(parse({ maxPrice: 'abc' }).success).toBe(false);
    expect(parse({ maxPrice: '99999999999' }).success).toBe(false);
  });

  it('page, pageSize ngoài khoảng -> lỗi', () => {
    expect(parse({ page: '0' }).success).toBe(false);
    expect(parse({ pageSize: '0' }).success).toBe(false);
    expect(parse({ pageSize: '101' }).success).toBe(false);
    expect(parse({ pageSize: '100', page: '3' }).data).toMatchObject({ pageSize: 100, page: 3 });
  });

  it('sort=relevance không có q -> lỗi', () => {
    const r = parse({ sort: 'relevance' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['sort']);
    expect(parse({ sort: 'relevance', q: 'ca phe' }).success).toBe(true);
  });

  it('q rỗng hoặc quá 100 ký tự -> lỗi', () => {
    expect(parse({ q: '   ' }).success).toBe(false);
    expect(parse({ q: 'a'.repeat(101) }).success).toBe(false);
    expect(parse({ q: 'a'.repeat(100) }).success).toBe(true);
  });

  it('inStock/featured chỉ nhận true', () => {
    expect(parse({ inStock: 'true', featured: 'true' }).data).toMatchObject({
      inStock: true,
      featured: true,
    });
    expect(parse({ inStock: 'false' }).success).toBe(false);
    expect(parse({ featured: '1' }).success).toBe(false);
  });

  it('giá trị không phải chuỗi (object từ qs) -> lỗi', () => {
    expect(parse({ q: { a: 'b' } }).success).toBe(false);
    expect(parse({ page: ['1', '2'] }).success).toBe(false);
  });
});

describe('suggestQuerySchema', () => {
  it('q 2-50, limit 1-10 mặc định 6', () => {
    expect(suggestQuerySchema.safeParse({ q: 'ca' }).data).toEqual({ q: 'ca', limit: 6 });
    expect(suggestQuerySchema.safeParse({ q: 'c' }).success).toBe(false);
    expect(suggestQuerySchema.safeParse({ q: 'a'.repeat(51) }).success).toBe(false);
    expect(suggestQuerySchema.safeParse({ q: 'ca', limit: '0' }).success).toBe(false);
    expect(suggestQuerySchema.safeParse({ q: 'ca', limit: '11' }).success).toBe(false);
    expect(suggestQuerySchema.safeParse({ q: 'ca', limit: '10' }).data?.limit).toBe(10);
  });
});

describe('slugSchema', () => {
  it('chỉ nhận slug đúng định dạng và <= 200 ký tự', () => {
    expect(slugSchema.safeParse('ethiopia-yirgacheffe-washed').success).toBe(true);
    expect(slugSchema.safeParse('Bad_Slug').success).toBe(false);
    expect(slugSchema.safeParse('-a').success).toBe(false);
    expect(slugSchema.safeParse('a--b').success).toBe(false);
    expect(slugSchema.safeParse('a'.repeat(201)).success).toBe(false);
  });
});
