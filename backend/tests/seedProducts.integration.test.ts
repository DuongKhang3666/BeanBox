import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BRANDS, CATEGORIES } from '../prisma/seed-data/catalog.js';
import { SEED_PRODUCTS } from '../prisma/seed-data/products.js';
import { seedProducts } from '../prisma/seed-data/seed-products.js';
import { prisma } from '../src/lib/prisma.js';
import { effectivePrice } from '../src/lib/pricing.js';

// Chạy seedProducts trên DB test (beanbox_test) để bắt lỗi ràng buộc/CHECK; dọn sạch sau khi xong.
const slugs = SEED_PRODUCTS.map((p) => p.slug);
const categorySlugs = CATEGORIES.flatMap((c) => [c.slug, ...(c.children ?? []).map((x) => x.slug)]);

async function cleanup() {
  await prisma.product.deleteMany({ where: { slug: { in: slugs } } });
  await prisma.category.deleteMany({
    where: { slug: { in: categorySlugs }, NOT: { parentId: null } },
  });
  await prisma.category.deleteMany({ where: { slug: { in: categorySlugs } } });
  await prisma.brand.deleteMany({ where: { slug: { in: BRANDS.map((b) => b.slug) } } });
}

beforeAll(async () => {
  await cleanup();
  for (const [order, c] of CATEGORIES.entries()) {
    const parent = await prisma.category.create({
      data: { slug: c.slug, name: c.name, sortOrder: order },
    });
    for (const [i, ch] of (c.children ?? []).entries()) {
      await prisma.category.create({
        data: { slug: ch.slug, name: ch.name, sortOrder: i, parentId: parent.id },
      });
    }
  }
  await prisma.brand.createMany({ data: BRANDS });
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('seedProducts (DB test)', () => {
  const now = new Date();

  it('ghi đủ sản phẩm và idempotent khi chạy lại', async () => {
    expect(await seedProducts(prisma, now)).toBe(SEED_PRODUCTS.length);
    const countProducts = () => prisma.product.count({ where: { slug: { in: slugs } } });
    const countVariants = () =>
      prisma.productVariant.count({ where: { product: { slug: { in: slugs } } } });
    const [p1, v1] = [await countProducts(), await countVariants()];
    expect(p1).toBe(SEED_PRODUCTS.length);

    await seedProducts(prisma, now);
    expect(await countProducts()).toBe(p1);
    expect(await countVariants()).toBe(v1);
    // Mỗi sản phẩm đúng 1 ảnh primary, chỉ cà phê hạt có CoffeeProfile
    const images = await prisma.productImage.count({
      where: { product: { slug: { in: slugs } }, isPrimary: true },
    });
    expect(images).toBe(SEED_PRODUCTS.length);
    const profiles = await prisma.coffeeProfile.count({ where: { product: { slug: { in: slugs } } } });
    expect(profiles).toBe(SEED_PRODUCTS.filter((p) => p.coffee).length);
  });

  it('denormalize khớp công thức: minPrice, inStock, searchText', async () => {
    const rows = await prisma.product.findMany({
      where: { slug: { in: slugs } },
      include: { variants: true },
    });
    for (const p of rows) {
      const min = Math.min(...p.variants.map((v) => effectivePrice(v, now)));
      expect(p.minPrice, p.slug).toBe(min);
      expect(p.inStock, p.slug).toBe(p.variants.some((v) => v.stock > 0));
      expect(p.searchText, p.slug).toMatch(/^[a-z0-9 ,.()+&-]+$/);
    }
    const eth = rows.find((p) => p.slug === 'ethiopia-yirgacheffe-washed')!;
    expect(eth.minPrice).toBe(185000); // sale đang hiệu lực
    expect(rows.find((p) => p.slug === 'decaf-brazil')!.inStock).toBe(false);
    expect(rows.find((p) => p.slug === 'aeropress-original')!.minPrice).toBe(950000); // sale chưa bắt đầu
  });

  it('trạng thái ẩn và ngày rang trong 30 ngày', async () => {
    const hidden = await prisma.product.findMany({
      where: { slug: { in: slugs }, OR: [{ status: { not: 'ACTIVE' } }, { deletedAt: { not: null } }] },
    });
    expect(hidden).toHaveLength(3);
    const beans = await prisma.productVariant.findMany({
      where: { sku: { startsWith: 'ETH-' } },
      select: { roastDate: true },
    });
    for (const b of beans) {
      const age = (now.getTime() - b.roastDate!.getTime()) / 86_400_000;
      expect(age).toBeGreaterThanOrEqual(0);
      expect(age).toBeLessThanOrEqual(30);
    }
  });
});
