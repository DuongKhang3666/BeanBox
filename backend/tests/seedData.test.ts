import { describe, expect, it } from 'vitest';
import { BRANDS, CATEGORIES, rootCategorySlug } from '../prisma/seed-data/catalog.js';
import { SEED_PRODUCTS } from '../prisma/seed-data/products.js';
import { dateOnlyDaysAgo, saleWindowDates } from '../prisma/seed-data/seed-products.js';
import { SLUG_REGEX } from '../src/modules/catalog/catalog.schema.js';

const variants = SEED_PRODUCTS.flatMap((p) => p.variants.map((v) => ({ p, v })));
const beanProducts = SEED_PRODUCTS.filter((p) => rootCategorySlug(p.categorySlug) === 'ca-phe-hat');
const visible = SEED_PRODUCTS.filter((p) => p.status === 'ACTIVE' && !p.deleted);

describe('dữ liệu seed sản phẩm', () => {
  it('có ít nhất 38 sản phẩm hiển thị được', () => {
    expect(SEED_PRODUCTS.length).toBeGreaterThanOrEqual(38);
    expect(visible.length).toBeGreaterThanOrEqual(38);
  });

  it('slug và sku là duy nhất, slug đúng định dạng', () => {
    const slugs = SEED_PRODUCTS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(SLUG_REGEX);
    const skus = variants.map(({ v }) => v.sku);
    expect(new Set(skus).size).toBe(skus.length);
  });

  it('danh mục và thương hiệu tồn tại trong dữ liệu dùng chung', () => {
    const categorySlugs = new Set(
      CATEGORIES.flatMap((c) => [c.slug, ...(c.children ?? []).map((x) => x.slug)]),
    );
    const brandSlugs = new Set(BRANDS.map((b) => b.slug));
    for (const p of SEED_PRODUCTS) {
      expect(categorySlugs.has(p.categorySlug), p.slug).toBe(true);
      if (p.brandSlug) expect(brandSlugs.has(p.brandSlug), p.slug).toBe(true);
    }
  });

  it('mỗi sản phẩm có ít nhất 1 biến thể, giá là số nguyên VND bội 1.000', () => {
    for (const { p, v } of variants) {
      expect(p.variants.length, p.slug).toBeGreaterThan(0);
      expect(Number.isInteger(v.price), v.sku).toBe(true);
      expect(v.price % 1000, v.sku).toBe(0);
      expect(v.weightGram, v.sku).toBeGreaterThan(0);
    }
  });

  it('salePrice < price (và bội 1.000)', () => {
    const sales = variants.filter(({ v }) => v.sale);
    expect(sales.length).toBeGreaterThan(0);
    for (const { v } of sales) {
      expect(v.sale!.price, v.sku).toBeLessThan(v.price);
      expect(v.sale!.price % 1000, v.sku).toBe(0);
    }
  });

  it('tồn kho: >= 3 hết hàng, >= 3 sắp hết, còn lại 10-80', () => {
    const threshold = (v: { lowStockThreshold?: number }) => v.lowStockThreshold ?? 5;
    const zero = variants.filter(({ v }) => v.stock === 0);
    const low = variants.filter(({ v }) => v.stock >= 1 && v.stock <= threshold(v));
    const rest = variants.filter(({ v }) => v.stock > threshold(v));
    expect(zero.length).toBeGreaterThanOrEqual(3);
    expect(low.length).toBeGreaterThanOrEqual(3);
    for (const { v } of rest) {
      expect(v.stock, v.sku).toBeGreaterThanOrEqual(10);
      expect(v.stock, v.sku).toBeLessThanOrEqual(80);
    }
  });

  it('sale: đúng 2 đang hiệu lực, 1 hết hạn, 1 chưa bắt đầu', () => {
    const count = (w: string) => variants.filter(({ v }) => v.sale?.window === w).length;
    expect(count('ACTIVE')).toBe(2);
    expect(count('EXPIRED')).toBe(1);
    expect(count('UPCOMING')).toBe(1);
  });

  it('cửa sổ sale tính từ thời điểm chạy seed', () => {
    const now = new Date('2026-11-10T08:00:00.000Z');
    const active = saleWindowDates('ACTIVE', now);
    expect(active.saleStart.getTime()).toBeLessThan(now.getTime());
    expect(active.saleEnd.getTime()).toBeGreaterThan(now.getTime());
    expect(saleWindowDates('EXPIRED', now).saleEnd.getTime()).toBeLessThan(now.getTime());
    expect(saleWindowDates('UPCOMING', now).saleStart.getTime()).toBeGreaterThan(now.getTime());
    for (const w of ['ACTIVE', 'EXPIRED', 'UPCOMING'] as const) {
      const d = saleWindowDates(w, now);
      expect(d.saleStart.getTime()).toBeLessThan(d.saleEnd.getTime());
    }
  });

  it('trạng thái: 1 DRAFT, 1 ARCHIVED, 1 xóa mềm; 6 nổi bật', () => {
    expect(SEED_PRODUCTS.filter((p) => p.status === 'DRAFT')).toHaveLength(1);
    expect(SEED_PRODUCTS.filter((p) => p.status === 'ARCHIVED')).toHaveLength(1);
    expect(SEED_PRODUCTS.filter((p) => p.deleted)).toHaveLength(1);
    expect(SEED_PRODUCTS.filter((p) => p.isFeatured)).toHaveLength(6);
    expect(SEED_PRODUCTS.filter((p) => p.isFeatured && p.status !== 'ACTIVE')).toHaveLength(0);
  });

  it('mọi cà phê hạt có hồ sơ đủ và ngày rang trong 30 ngày gần nhất', () => {
    expect(beanProducts.length).toBeGreaterThanOrEqual(15);
    for (const p of beanProducts) {
      const c = p.coffee;
      expect(c, p.slug).toBeDefined();
      expect(c!.originCountry, p.slug).toBeTruthy();
      expect(c!.originRegion, p.slug).toBeTruthy();
      expect(c!.variety, p.slug).toBeTruthy();
      expect(c!.process, p.slug).toBeTruthy();
      expect(c!.roastLevel, p.slug).toBeTruthy();
      expect(c!.tastingNotes.length, p.slug).toBeGreaterThan(0);
      expect(c!.brewMethods.length, p.slug).toBeGreaterThan(0);
      expect(c!.roastDaysAgo, p.slug).toBeGreaterThanOrEqual(0);
      expect(c!.roastDaysAgo, p.slug).toBeLessThanOrEqual(29);
    }
  });

  it('sản phẩm không phải cà phê hạt không có hồ sơ cà phê', () => {
    for (const p of SEED_PRODUCTS.filter((x) => !beanProducts.includes(x))) {
      expect(p.coffee, p.slug).toBeUndefined();
    }
  });

  it('đủ 4 mức rang và >= 2 nước xuất xứ khác Việt Nam', () => {
    const coffees = beanProducts.map((p) => p.coffee!);
    expect(new Set(coffees.map((c) => c.roastLevel))).toEqual(
      new Set(['LIGHT', 'MEDIUM', 'MEDIUM_DARK', 'DARK']),
    );
    const foreign = new Set(coffees.map((c) => c.originCountry).filter((o) => o !== 'Việt Nam'));
    expect(foreign.size).toBeGreaterThanOrEqual(2);
  });

  it('chỉ số bán hàng/đánh giá mẫu khác nhau để sắp xếp có kết quả', () => {
    const sold = new Set(visible.map((p) => p.stats[0]));
    const rating = new Set(visible.map((p) => p.stats[1]));
    expect(sold.size).toBeGreaterThan(visible.length * 0.8);
    expect(rating.size).toBeGreaterThan(8);
    for (const p of SEED_PRODUCTS) {
      expect(p.stats[1], p.slug).toBeGreaterThanOrEqual(0);
      expect(p.stats[1], p.slug).toBeLessThanOrEqual(5);
    }
  });

  it('ngày rang là ngày thuần UTC, tương đối từ ngày chạy seed', () => {
    const now = new Date('2026-11-10T20:30:00.000Z');
    expect(dateOnlyDaysAgo(now, 0).toISOString()).toBe('2026-11-10T00:00:00.000Z');
    expect(dateOnlyDaysAgo(now, 12).toISOString()).toBe('2026-10-29T00:00:00.000Z');
  });
});
