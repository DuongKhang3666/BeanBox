import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '../prisma/seed-data/catalog.js';
import { SEED_PRODUCTS } from '../prisma/seed-data/products.js';
import { RICH_BRANDS, RICH_CATEGORIES } from '../prisma/seed-data/rich/catalog.js';
import { buildRichCoupons } from '../prisma/seed-data/rich/coupons.js';
import { checkRichSeedAllowed } from '../prisma/seed-data/rich/guard.js';
import {
  buildLocationPool,
  fakePhone,
  planContacts,
  planCustomers,
  planOrders,
  planReviews,
  planWishlists,
  type PlanCoupon,
  type PlanVariant,
} from '../prisma/seed-data/rich/plan.js';
import { buildRichProducts, RICH_PRODUCT_COUNT } from '../prisma/seed-data/rich/products.js';
import { hashString, mulberry32, shuffled } from '../prisma/seed-data/rich/prng.js';
import { ORDER_CODE_REGEX } from '../src/lib/orderCode.js';
import { normalizePhone } from '../src/lib/phone.js';

describe('seed nhiều: PRNG', () => {
  it('mulberry32 tất định theo seed và nằm trong [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const xs = Array.from({ length: 1000 }, () => a());
    expect(xs).toEqual(Array.from({ length: 1000 }, () => b()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(mulberry32(43)()).not.toBe(xs[0]);
  });

  it('hashString ổn định, shuffled giữ nguyên phần tử và không đổi mảng gốc', () => {
    expect(hashString('rich:x')).toBe(hashString('rich:x'));
    const src = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = shuffled(mulberry32(1), src);
    expect(out).toEqual(shuffled(mulberry32(1), src));
    expect([...out].sort()).toEqual(src);
    expect(src).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe('seed nhiều: guard', () => {
  const ok = { NODE_ENV: 'development', SEED_CUSTOMER_PASSWORD: 'Customer12345' };
  it('cho chạy ngoài production', () => {
    expect(checkRichSeedAllowed(ok)).toEqual([]);
    expect(checkRichSeedAllowed({ SEED_CUSTOMER_PASSWORD: 'Customer12345' })).toEqual([]);
  });
  it('từ chối khi NODE_ENV=production, kể cả có SEED_ALLOW_PRODUCTION', () => {
    expect(checkRichSeedAllowed({ ...ok, NODE_ENV: 'production' })).toHaveLength(1);
    expect(
      checkRichSeedAllowed({ ...ok, NODE_ENV: 'production', SEED_ALLOW_PRODUCTION: 'true' }),
    ).toHaveLength(1);
  });
  it('đòi mật khẩu khách hợp lệ và không in mật khẩu', () => {
    expect(checkRichSeedAllowed({ NODE_ENV: 'test' })[0]).toMatch(/SEED_CUSTOMER_PASSWORD/);
    const errs = checkRichSeedAllowed({ NODE_ENV: 'test', SEED_CUSTOMER_PASSWORD: 'abc' });
    expect(errs[0]).toMatch(/8-72/);
    expect(errs.join()).not.toContain('abc');
  });
});

describe('seed nhiều: sản phẩm', () => {
  const products = buildRichProducts();

  it('đủ 120 sản phẩm, tất định', () => {
    expect(products).toHaveLength(120);
    expect(RICH_PRODUCT_COUNT).toBe(120);
    expect(buildRichProducts()).toEqual(products);
  });

  it('slug và SKU duy nhất, không đụng seed cơ bản', () => {
    const slugs = products.map((p) => p.slug);
    const skus = products.flatMap((p) => p.variants.map((v) => v.sku));
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(skus).size).toBe(skus.length);
    const baseSlugs = new Set(SEED_PRODUCTS.map((p) => p.slug));
    const baseSkus = new Set(SEED_PRODUCTS.flatMap((p) => p.variants.map((v) => v.sku)));
    expect(slugs.filter((s) => baseSlugs.has(s))).toEqual([]);
    expect(skus.filter((s) => baseSkus.has(s))).toEqual([]);
  });

  it('danh mục tồn tại, 1-4 biến thể, giá hợp lệ, sale hợp lệ', () => {
    const valid = new Set([
      ...CATEGORIES.flatMap((c) => [c.slug, ...(c.children ?? []).map((x) => x.slug)]),
      ...RICH_CATEGORIES.map((c) => c.slug),
    ]);
    const brands = new Set([...RICH_BRANDS.map((b) => b.slug), 'beanbox-roastery']);
    for (const p of products) {
      expect(valid.has(p.categorySlug), p.slug).toBe(true);
      if (p.brandSlug) expect(brands.has(p.brandSlug), p.slug).toBe(true);
      expect(p.variants.length).toBeGreaterThanOrEqual(1);
      expect(p.variants.length).toBeLessThanOrEqual(4);
      expect(p.status).toBe('ACTIVE');
      for (const v of p.variants) {
        expect(v.price).toBeGreaterThan(0);
        expect(Number.isInteger(v.price)).toBe(true);
        expect(v.stock).toBeGreaterThanOrEqual(0);
        if (v.sale) expect(v.sale.price).toBeLessThan(v.price);
        if (v.sale) expect(v.sale.price).toBeGreaterThan(0);
      }
    }
  });

  it('cà phê có CoffeeProfile, ngày rang 2-28 ngày; dụng cụ thì không', () => {
    const coffee = products.filter((p) => p.categorySlug && p.coffee);
    expect(coffee).toHaveLength(43);
    for (const p of coffee) {
      expect(p.coffee?.roastDaysAgo).toBeGreaterThanOrEqual(2);
      expect(p.coffee?.roastDaysAgo).toBeLessThanOrEqual(28);
      expect(p.coffee?.altitude).toBeNull();
    }
    expect(products.filter((p) => !p.coffee)).toHaveLength(77);
  });

  it('tồn kho đa dạng: có hết hàng, sắp hết và còn nhiều; có sale', () => {
    const vs = products.flatMap((p) => p.variants);
    expect(vs.some((v) => v.stock === 0)).toBe(true);
    expect(vs.some((v) => v.stock > 0 && v.stock <= (v.lowStockThreshold ?? 5))).toBe(true);
    expect(vs.some((v) => v.stock > 50)).toBe(true);
    expect(vs.some((v) => v.sale?.window === 'ACTIVE')).toBe(true);
  });

  it('thương hiệu minh họa: 20, slug duy nhất; danh mục con 9', () => {
    expect(RICH_BRANDS).toHaveLength(20);
    expect(new Set(RICH_BRANDS.map((b) => b.slug)).size).toBe(20);
    expect(RICH_CATEGORIES).toHaveLength(9);
  });
});

describe('seed nhiều: mã giảm giá', () => {
  const now = new Date('2026-11-24T05:00:00Z');
  const coupons = buildRichCoupons(now);

  it('30 mã hợp lệ, đủ trạng thái', () => {
    expect(coupons).toHaveLength(30);
    expect(new Set(coupons.map((c) => c.code)).size).toBe(30);
    for (const c of coupons) {
      expect(c.code).toMatch(/^[A-Z0-9_-]{3,30}$/);
      expect(c.code.startsWith('-')).toBe(false);
      if (c.type === 'PERCENT') expect(c.value).toBeGreaterThanOrEqual(1);
      if (c.type === 'PERCENT') expect(c.value).toBeLessThanOrEqual(100);
      if (c.type === 'FIXED') expect(c.value).toBeGreaterThan(0);
      if (c.type === 'FREESHIP') expect(c.value).toBe(0);
      if (c.startsAt && c.endsAt) expect(c.startsAt.getTime()).toBeLessThan(c.endsAt.getTime());
    }
    const t = now.getTime();
    expect(coupons.some((c) => c.endsAt && c.endsAt.getTime() < t)).toBe(true);
    expect(coupons.some((c) => c.startsAt && c.startsAt.getTime() > t)).toBe(true);
    expect(coupons.some((c) => c.usageLimit != null && c.usedCount >= c.usageLimit)).toBe(true);
    expect(coupons.some((c) => !c.isActive)).toBe(true);
    expect(new Set(coupons.map((c) => c.type))).toEqual(new Set(['PERCENT', 'FIXED', 'FREESHIP']));
  });
});

describe('seed nhiều: kế hoạch khách và đơn', () => {
  const now = new Date('2026-11-24T05:00:00Z');
  const pool = buildLocationPool(
    new Map([
      [
        '79',
        {
          code: '79',
          name: 'TP. Hồ Chí Minh',
          wards: new Map([
            ['00001', { code: '00001', name: 'P1' }],
            ['00002', { code: '00002', name: 'P2' }],
          ]),
        },
      ],
      [
        '01',
        { code: '01', name: 'Hà Nội', wards: new Map([['00070', { code: '00070', name: 'P3' }]]) },
      ],
      [
        '48',
        { code: '48', name: 'Đà Nẵng', wards: new Map([['00090', { code: '00090', name: 'P4' }]]) },
      ],
      [
        '92',
        { code: '92', name: 'Cần Thơ', wards: new Map([['00110', { code: '00110', name: 'P5' }]]) },
      ],
    ]),
  );
  const variants: PlanVariant[] = Array.from({ length: 60 }, (_, i) => ({
    variantId: `v${i}`,
    productId: `p${Math.floor(i / 2)}`,
    categoryId: 'c1',
    parentCategoryId: 'c0',
    productName: `Sản phẩm ${i}`,
    variantName: 'Mặc định',
    sku: `SKU-${i}`,
    imageUrl: '/uploads/seed/ca-phe-hat.svg',
    weightGram: 100 + i,
    price: 50000 + i * 7000,
    avgCost: 30000,
  }));
  const coupons: PlanCoupon[] = buildRichCoupons(now)
    .filter((c) => c.isActive && c.usageLimit == null)
    .map((c, i) => ({ ...c, id: `cp${i}`, scope: null }));
  const customers = planCustomers(40, pool);
  const input = {
    now,
    count: 120,
    days: 120,
    customers,
    guestCount: 10,
    variants,
    coupons,
    staffIds: ['staff1', 'admin1'],
    pool,
    usedCodes: new Set<string>(),
  };

  it('tất định: cùng đầu vào ra cùng kết quả', () => {
    expect(planOrders(input)).toEqual(planOrders(input));
    expect(planCustomers(40, pool)).toEqual(customers);
  });

  it('SĐT giả hợp lệ theo regex hệ thống; khách có email example.com', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 200; i++) {
      const p = fakePhone(r);
      expect(normalizePhone(p)).toBe(p);
    }
    for (const c of customers) {
      expect(normalizePhone(c.phone)).toBe(c.phone);
      expect(c.email).toMatch(/^rich\.khach\d{3}@example\.com$/);
      expect(c.addresses.length).toBeLessThanOrEqual(2);
      expect(c.addresses.filter((a) => a.isDefault).length).toBe(c.addresses.length > 0 ? 1 : 0);
    }
  });

  it('đơn: mã hợp lệ và duy nhất, tổng khớp công thức, mốc thời gian hợp lý', () => {
    const orders = planOrders(input);
    expect(new Set(orders.map((o) => o.code)).size).toBe(orders.length);
    expect(new Set(orders.map((o) => o.idempotencyKey)).size).toBe(orders.length);
    for (const o of orders) {
      expect(o.code).toMatch(ORDER_CODE_REGEX);
      const sub = o.lines.reduce((s, l) => s + l.lineTotal, 0);
      expect(o.subtotal).toBe(sub);
      expect(o.grandTotal).toBe(o.subtotal - o.discountTotal + o.shippingFee - o.shippingDiscount);
      expect(o.discountTotal).toBeLessThanOrEqual(o.subtotal);
      expect(o.shippingDiscount).toBeLessThanOrEqual(o.shippingFee);
      for (const l of o.lines) expect(l.lineTotal).toBe(l.unitPrice * l.quantity);
      expect(o.createdAt.getTime()).toBeLessThan(now.getTime());
      expect(o.createdAt.getTime()).toBeGreaterThan(now.getTime() - 121 * 24 * 3600 * 1000);
      expect(o.updatedAt.getTime()).toBeGreaterThanOrEqual(o.createdAt.getTime());
      expect(o.updatedAt.getTime()).toBeLessThanOrEqual(now.getTime());
      expect(normalizePhone(o.contactPhone)).toBe(o.contactPhone);
      if (o.status === 'DELIVERED') {
        expect(o.deliveredAt).not.toBeNull();
        expect(o.trackingNumber).not.toBeNull();
      }
      if (o.status === 'CANCELLED') expect(o.cancelledAt).not.toBeNull();
      if (o.couponCode == null) expect(o.discountTotal).toBe(0);
    }
    const statuses = new Set(orders.map((o) => o.status));
    expect(statuses.has('DELIVERED')).toBe(true);
    expect(statuses.has('CANCELLED')).toBe(true);
    expect(new Set(orders.map((o) => o.paymentMethod)).size).toBeGreaterThanOrEqual(3);
  });

  it('chuỗi lịch sử liền mạch và kết thúc đúng trạng thái hiện tại', () => {
    for (const o of planOrders(input)) {
      expect(o.history.length).toBeGreaterThan(0);
      expect(o.history[0]?.fromStatus).toBeNull();
      for (let i = 1; i < o.history.length; i++) {
        expect(o.history[i]?.fromStatus).toBe(o.history[i - 1]?.toStatus);
        expect(o.history[i]?.createdAt.getTime()).toBeGreaterThanOrEqual(
          o.history[i - 1]?.createdAt.getTime() ?? 0,
        );
      }
      expect(o.history.at(-1)?.toStatus).toBe(o.status);
    }
  });

  it('đánh giá: chỉ đơn DELIVERED của người mua, 1/người/sản phẩm, điểm 1-5 nghiêng về 4-5', () => {
    const orders = planOrders({ ...input, count: 300 });
    const groups = new Map(variants.map((v) => [v.productId, 'tool' as const]));
    const reviews = planReviews(orders, groups, now);
    expect(reviews.length).toBeGreaterThan(50);
    const byItem = new Map(orders.flatMap((o) => o.lines.map((l) => [l.id, { o, l }] as const)));
    const seen = new Set<string>();
    for (const r of reviews) {
      const src = byItem.get(r.orderItemId);
      expect(src).toBeDefined();
      expect(src?.o.status).toBe('DELIVERED');
      expect(src?.o.userId).toBe(r.userId);
      expect(src?.l.productId).toBe(r.productId);
      expect(r.rating).toBeGreaterThanOrEqual(1);
      expect(r.rating).toBeLessThanOrEqual(5);
      expect(r.createdAt.getTime()).toBeGreaterThan(src?.o.deliveredAt?.getTime() ?? Infinity);
      expect(r.createdAt.getTime()).toBeLessThanOrEqual(now.getTime());
      const key = `${r.userId}|${r.productId}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      if (r.reply) expect(r.repliedAt).not.toBeNull();
    }
    const high = reviews.filter((r) => r.rating >= 4).length;
    expect(high / reviews.length).toBeGreaterThan(0.6);
    expect(reviews.some((r) => r.status === 'HIDDEN' || r.reply != null)).toBe(true);
  });

  it('liên hệ và wishlist tất định, hợp lệ', () => {
    const staff = ['staff1', 'admin1'];
    const contacts = planContacts(40, customers, staff, now);
    expect(contacts).toHaveLength(40);
    expect(planContacts(40, customers, staff, now)).toEqual(contacts);
    for (const c of contacts) {
      expect(c.createdAt.getTime()).toBeLessThan(now.getTime());
      if (c.status === 'NEW') expect(c.handledById).toBeNull();
      if (c.phone) expect(normalizePhone(c.phone)).toBe(c.phone);
    }
    const wl = planWishlists(customers, ['a', 'b', 'c', 'd', 'e'], now);
    expect(wl.length).toBeGreaterThan(0);
    expect(new Set(wl.map((w) => `${w.userId}|${w.productId}`)).size).toBe(wl.length);
  });
});
