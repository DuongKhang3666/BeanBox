import argon2 from 'argon2';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CATEGORIES } from '../prisma/seed-data/catalog.js';
import { RICH_BRANDS, RICH_CATEGORIES } from '../prisma/seed-data/rich/catalog.js';
import { buildRichCoupons } from '../prisma/seed-data/rich/coupons.js';
import { buildRichProducts } from '../prisma/seed-data/rich/products.js';
import { seedRich, type RichSeedSummary } from '../prisma/seed-data/rich/seed-rich.js';
import { roastAgeDays, roastStatusOf } from '../src/lib/freshness.js';
import { prisma } from '../src/lib/prisma.js';
import { ORDER_CODE_REGEX } from '../src/lib/orderCode.js';
import { normalizePhone } from '../src/lib/phone.js';

/*
 * Chạy seedRich hai lần trên DB test (beanbox_test): lần 2 không tạo thêm bản ghi nào và dữ liệu hợp lệ.
 * Không assertion trên giá trị ngẫu nhiên (PRNG tất định, nhưng chỉ kiểm bất biến). Dọn sạch mọi thứ đã tạo.
 */
const PASSWORD = 'Customer12345';
const productSlugs = buildRichProducts().map((p) => p.slug);
const couponCodes = buildRichCoupons(new Date()).map((c) => c.code);
const STAFF_EMAIL = 'seedrich-staff@example.com';

const createdParents: string[] = [];
const createdChildren: string[] = [];
let createdStaff = false;
let first: RichSeedSummary;
let second: RichSeedSummary;
let hash: string;

async function cleanup() {
  await prisma.review.deleteMany({ where: { id: { startsWith: 'richr' } } });
  await prisma.couponRedemption.deleteMany({ where: { id: { startsWith: 'richcr' } } });
  await prisma.orderNote.deleteMany({ where: { id: { startsWith: 'richn' } } });
  await prisma.payment.deleteMany({ where: { id: { startsWith: 'richp' } } });
  await prisma.order.deleteMany({ where: { id: { startsWith: 'richo' } } }); // cascade: dòng hàng, lịch sử
  await prisma.contactMessage.deleteMany({ where: { id: { startsWith: 'richcm' } } });
  await prisma.user.deleteMany({ where: { id: { startsWith: 'richu' } } }); // cascade: địa chỉ, wishlist
  await prisma.coupon.deleteMany({ where: { code: { in: couponCodes } } });
  await prisma.product.deleteMany({ where: { slug: { in: productSlugs } } });
  await prisma.category.deleteMany({ where: { slug: { in: RICH_CATEGORIES.map((c) => c.slug) } } });
  await prisma.brand.deleteMany({ where: { slug: { in: RICH_BRANDS.map((b) => b.slug) } } });
  if (createdChildren.length > 0) {
    await prisma.category.deleteMany({ where: { slug: { in: createdChildren } } });
  }
  if (createdParents.length > 0) {
    await prisma.category.deleteMany({ where: { slug: { in: createdParents } } });
  }
  if (createdStaff) await prisma.user.deleteMany({ where: { email: STAFF_EMAIL } });
}

beforeAll(async () => {
  await cleanup();
  // Điều kiện tiên quyết giống sau `prisma:seed`: danh mục gốc và một tài khoản nhân viên.
  for (const c of CATEGORIES) {
    let parent = await prisma.category.findUnique({ where: { slug: c.slug } });
    if (!parent) {
      parent = await prisma.category.create({ data: { slug: c.slug, name: c.name } });
      createdParents.push(c.slug);
    }
    for (const ch of c.children ?? []) {
      if (await prisma.category.findUnique({ where: { slug: ch.slug } })) continue;
      await prisma.category.create({ data: { slug: ch.slug, name: ch.name, parentId: parent.id } });
      createdChildren.push(ch.slug);
    }
  }
  const staff = await prisma.user.findFirst({ where: { role: { in: ['STAFF', 'ADMIN'] } } });
  if (!staff) {
    await prisma.user.create({
      data: { email: STAFF_EMAIL, passwordHash: '!x', fullName: 'Nhân viên thử', role: 'STAFF' },
    });
    createdStaff = true;
  }
  hash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
  first = await seedRich(prisma, { passwordHash: hash });
  second = await seedRich(prisma, { passwordHash: hash });
}, 180_000);

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
}, 60_000);

describe('seedRich (DB test)', () => {
  it('số lượng đúng đặc tả', () => {
    expect(first.products).toBe(120);
    expect(first.categories).toBe(9);
    expect(first.brands).toBe(20);
    expect(first.coupons).toBe(30);
    expect(first.customers).toBe(150);
    expect(first.orders).toBe(300);
    expect(first.reviews).toBeGreaterThanOrEqual(300);
    expect(first.contacts).toBe(40);
    expect(first.orderNotes).toBeGreaterThanOrEqual(24);
    expect(first.inserted).toBeGreaterThan(0);
  });

  it('chạy lần 2 không nhân bản: số bản ghi không đổi, không có bản ghi mới', async () => {
    expect(second.inserted).toBe(0);
    expect(second).toEqual({ ...first, inserted: 0 });
    expect(await prisma.product.count({ where: { slug: { in: productSlugs } } })).toBe(120);
    expect(
      await prisma.productVariant.count({ where: { product: { slug: { in: productSlugs } } } }),
    ).toBe(buildRichProducts().reduce((s, p) => s + p.variants.length, 0));
  });

  it('đánh giá chỉ của người đã mua đơn DELIVERED, 1 đánh giá/người/sản phẩm', async () => {
    const bad = await prisma.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM "Review" r
      JOIN "OrderItem" i ON i."id" = r."orderItemId"
      JOIN "Order" o ON o."id" = i."orderId"
      WHERE r."id" LIKE 'richr%'
        AND (o."status" <> 'DELIVERED' OR o."userId" IS DISTINCT FROM r."userId" OR i."productId" <> r."productId")`;
    expect(bad[0]?.n).toBe(0);
    const dup = await prisma.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM (SELECT 1 FROM "Review" WHERE "id" LIKE 'richr%'
        GROUP BY "userId", "productId" HAVING count(*) > 1) x`;
    expect(dup[0]?.n).toBe(0);
    const ratings = await prisma.review.groupBy({
      by: ['rating'],
      where: { id: { startsWith: 'richr' } },
      _count: { _all: true },
    });
    const total = ratings.reduce((s, r) => s + r._count._all, 0);
    const high = ratings.filter((r) => r.rating >= 4).reduce((s, r) => s + r._count._all, 0);
    expect(high / total).toBeGreaterThan(0.6);
    expect(
      await prisma.review.count({ where: { id: { startsWith: 'richr' }, status: 'HIDDEN' } }),
    ).toBeGreaterThan(0);
    expect(
      await prisma.review.count({ where: { id: { startsWith: 'richr' }, reply: { not: null } } }),
    ).toBeGreaterThan(0);
  });

  it('denorm đánh giá của sản phẩm khớp đánh giá PUBLISHED', async () => {
    const products = await prisma.product.findMany({
      where: { slug: { in: productSlugs } },
      select: { id: true, ratingAvg: true, ratingCount: true },
    });
    for (const p of products) {
      const agg = await prisma.review.aggregate({
        where: { productId: p.id, status: 'PUBLISHED' },
        _avg: { rating: true },
        _count: { _all: true },
      });
      expect(p.ratingCount).toBe(agg._count._all);
      expect(p.ratingAvg).toBeCloseTo(agg._avg.rating ?? 0, 5);
    }
  });

  it('tổng đơn khớp dòng hàng, mã đơn hợp lệ, idempotency key cố định', async () => {
    const orders = await prisma.order.findMany({
      where: { id: { startsWith: 'richo' } },
      include: { items: true, history: { orderBy: { createdAt: 'asc' } } },
    });
    expect(orders).toHaveLength(300);
    const now = Date.now();
    for (const o of orders) {
      expect(o.code).toMatch(ORDER_CODE_REGEX);
      expect(o.idempotencyKey).toMatch(/^rich-order-\d{4}$/);
      expect(o.subtotal).toBe(o.items.reduce((s, i) => s + i.lineTotal, 0));
      expect(o.grandTotal).toBe(o.subtotal - o.discountTotal + o.shippingFee - o.shippingDiscount);
      for (const i of o.items) expect(i.lineTotal).toBe(i.unitPrice * i.quantity);
      expect(o.createdAt.getTime()).toBeLessThan(now);
      expect(o.history.at(-1)?.toStatus).toBe(o.status);
      expect(o.history[0]?.fromStatus).toBeNull();
      expect(normalizePhone(o.contactPhone)).toBe(o.contactPhone);
      if (o.status === 'CANCELLED') expect(o.cancelledAt).not.toBeNull();
    }
    expect(orders.filter((o) => o.status === 'DELIVERED').length).toBeGreaterThan(
      orders.length / 2,
    );
    expect(orders.some((o) => o.status === 'CANCELLED')).toBe(true);
    expect(orders.some((o) => o.status === 'RETURNED')).toBe(true);
    expect(new Set(orders.map((o) => o.paymentMethod))).toEqual(
      new Set(['COD', 'VNPAY', 'MOMO', 'BANK_TRANSFER']),
    );
    expect(orders.some((o) => o.userId === null)).toBe(true);
    expect(orders.some((o) => o.couponCode != null)).toBe(true);
    const costed = await prisma.orderItem.count({
      where: { id: { startsWith: 'richi' }, unitCost: null },
    });
    expect(costed).toBe(0);
  });

  it('đơn lịch sử không trừ tồn kho và không tạo InventoryMovement', async () => {
    expect(
      await prisma.inventoryMovement.count({ where: { orderId: { startsWith: 'richo' } } }),
    ).toBe(0);
  });

  it('ngày rang hợp lệ (D-082): lô cà phê còn tươi; giá vốn 55-70% giá niêm yết; sale hợp lệ', async () => {
    const now = new Date();
    const variants = await prisma.productVariant.findMany({
      where: { product: { slug: { in: productSlugs } } },
      select: {
        price: true,
        avgCost: true,
        roastDate: true,
        salePrice: true,
        saleStart: true,
        saleEnd: true,
      },
    });
    const beans = variants.filter((v) => v.roastDate != null);
    expect(beans.length).toBeGreaterThan(80);
    for (const v of beans) {
      const age = roastAgeDays(v.roastDate, now);
      expect(age).not.toBeNull();
      expect(age as number).toBeGreaterThanOrEqual(1);
      expect(age as number).toBeLessThanOrEqual(29);
      expect(roastStatusOf(v.roastDate, now)).toBe('FRESH');
    }
    for (const v of variants) {
      const ratio = (v.avgCost ?? 0) / v.price;
      expect(ratio).toBeGreaterThanOrEqual(0.55);
      expect(ratio).toBeLessThanOrEqual(0.7);
      if (v.salePrice != null) {
        expect(v.salePrice).toBeLessThan(v.price);
        if (v.saleStart && v.saleEnd)
          expect(v.saleStart.getTime()).toBeLessThan(v.saleEnd.getTime());
      }
    }
    expect(variants.some((v) => v.salePrice != null)).toBe(true);
  });

  it('mã giảm giá hợp lệ, đủ trạng thái; usedCount mã không giới hạn >= lượt dùng của đơn', async () => {
    const now = new Date();
    const coupons = await prisma.coupon.findMany({ where: { code: { in: couponCodes } } });
    expect(coupons).toHaveLength(30);
    for (const c of coupons) {
      expect(c.code).toMatch(/^[A-Z0-9_-]{3,30}$/);
      expect(c.code.startsWith('-')).toBe(false);
    }
    expect(coupons.some((c) => c.endsAt && c.endsAt < now)).toBe(true);
    expect(coupons.some((c) => c.startsAt && c.startsAt > now)).toBe(true);
    expect(coupons.some((c) => c.usageLimit != null && c.usedCount >= c.usageLimit)).toBe(true);
    expect(coupons.some((c) => !c.isActive)).toBe(true);
    const used = await prisma.couponRedemption.groupBy({
      by: ['couponId'],
      where: { id: { startsWith: 'richcr' }, releasedAt: null },
      _count: { _all: true },
    });
    for (const u of used) {
      const c = coupons.find((x) => x.id === u.couponId);
      expect(c?.usedCount ?? 0).toBeGreaterThanOrEqual(u._count._all);
    }
  });

  it('khách: 150 tài khoản CUSTOMER mật khẩu chung, SĐT và địa chỉ hợp lệ', async () => {
    const users = await prisma.user.findMany({
      where: { id: { startsWith: 'richu' } },
      include: { addresses: true },
    });
    expect(users).toHaveLength(150);
    expect(new Set(users.map((u) => u.passwordHash)).size).toBe(1);
    expect(await argon2.verify(users[0]?.passwordHash ?? '', PASSWORD)).toBe(true);
    for (const u of users) {
      expect(u.role).toBe('CUSTOMER');
      expect(u.email).toMatch(/@example\.com$/);
      expect(normalizePhone(u.phone ?? '')).toBe(u.phone);
      expect(u.addresses.length).toBeLessThanOrEqual(2);
      expect(u.addresses.filter((a) => a.isDefault).length).toBe(u.addresses.length > 0 ? 1 : 0);
      for (const a of u.addresses) {
        expect(normalizePhone(a.phone)).toBe(a.phone);
        expect(a.provinceName.length).toBeGreaterThan(0);
        expect(a.wardName.length).toBeGreaterThan(0);
      }
    }
    expect(users.some((u) => u.addresses.length === 0)).toBe(true);
    expect(users.some((u) => u.addresses.length === 2)).toBe(true);
  });

  it('chạy lại vào ngày khác (3 ngày sau) vẫn không thêm bản ghi nào', async () => {
    // Đặt CUỐI CÙNG: lần chạy này dời ngày rang/sale sang mốc tương lai.
    const later = new Date(Date.now() + 3 * 24 * 3600 * 1000);
    const third = await seedRich(prisma, { passwordHash: hash, now: later });
    expect(third).toEqual({ ...first, inserted: 0 });
  }, 120_000);

  it('tài khoản gốc của seed cơ bản không bị đổi (không đụng email beanbox.local)', async () => {
    expect(
      await prisma.user.count({
        where: { email: { endsWith: '@beanbox.local' }, id: { startsWith: 'rich' } },
      }),
    ).toBe(0);
  });
});
