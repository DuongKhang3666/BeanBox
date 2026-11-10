/* Ghi sản phẩm mẫu vào DB (dev). Dữ liệu ở products.ts; denormalize dùng chung hàm của service. */
import type { Prisma, PrismaClient } from '@prisma/client';
import { refreshProductDenorm } from '../../src/modules/catalog/catalog.denorm.js';
import { rootCategorySlug } from './catalog.js';
import { SEED_PRODUCTS, type ProductSeed, type SaleWindow } from './products.js';

const DAY = 24 * 60 * 60 * 1000;

/** Cửa sổ sale tương đối từ thời điểm chạy seed. */
export function saleWindowDates(window: SaleWindow, now: Date): { saleStart: Date; saleEnd: Date } {
  const t = now.getTime();
  switch (window) {
    case 'ACTIVE':
      return { saleStart: new Date(t - 3 * DAY), saleEnd: new Date(t + 14 * DAY) };
    case 'EXPIRED':
      return { saleStart: new Date(t - 30 * DAY), saleEnd: new Date(t - 5 * DAY) };
    case 'UPCOMING':
      return { saleStart: new Date(t + 5 * DAY), saleEnd: new Date(t + 20 * DAY) };
  }
}

/** Ngày thuần (UTC 00:00) cách `now` đúng `daysAgo` ngày, cho cột @db.Date. */
export function dateOnlyDaysAgo(now: Date, daysAgo: number): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d;
}

const ALT_BY_ROOT: Record<string, (name: string) => string> = {
  'ca-phe-hat': (name) => `Túi cà phê hạt ${name}`,
  'dung-cu-pha-che': (name) => `${name} - dụng cụ pha chế cà phê`,
  'phu-kien': (name) => `${name} - phụ kiện cà phê`,
  'qua-tang-combo': (name) => `${name} - quà tặng và combo cà phê`,
};

async function seedOne(
  prisma: PrismaClient,
  p: ProductSeed,
  index: number,
  now: Date,
  categoryIds: Map<string, string>,
  brandIds: Map<string, string>,
): Promise<void> {
  const categoryId = categoryIds.get(p.categorySlug);
  if (!categoryId) throw new Error(`Không tìm thấy danh mục ${p.categorySlug} cho ${p.slug}`);
  const brandId = p.brandSlug ? (brandIds.get(p.brandSlug) ?? null) : null;
  if (p.brandSlug && !brandId) throw new Error(`Không tìm thấy thương hiệu ${p.brandSlug}`);
  const root = rootCategorySlug(p.categorySlug);
  if (!root) throw new Error(`Danh mục ${p.categorySlug} không nằm trong CATEGORIES`);

  const [soldCount, ratingAvg, ratingCount] = p.stats;
  const fields = {
    categoryId,
    brandId,
    name: p.name,
    shortDesc: p.shortDesc,
    description: p.description,
    status: p.status,
    isFeatured: p.isFeatured,
    tags: p.tags,
    seoTitle: null,
    seoDesc: null,
    soldCount,
    ratingAvg,
    ratingCount,
    deletedAt: p.deleted ? now : null,
    // Rải thời điểm tạo (cách nhau 6 giờ) để sắp xếp "mới nhất" có thứ tự ổn định
    createdAt: new Date(now.getTime() - index * 6 * 60 * 60 * 1000),
  } satisfies Prisma.ProductUncheckedUpdateInput;

  await prisma.$transaction(async (tx) => {
    const product = await tx.product.upsert({
      where: { slug: p.slug },
      update: fields,
      create: { slug: p.slug, ...fields },
    });

    const roastDate = p.coffee ? dateOnlyDaysAgo(now, p.coffee.roastDaysAgo) : null;
    for (const [order, v] of p.variants.entries()) {
      const sale = v.sale
        ? { salePrice: v.sale.price, ...saleWindowDates(v.sale.window, now) }
        : { salePrice: null, saleStart: null, saleEnd: null };
      const data = {
        productId: product.id,
        name: v.name,
        attributes: v.attributes,
        price: v.price,
        ...sale,
        stock: v.stock,
        lowStockThreshold: v.lowStockThreshold ?? 5,
        weightGram: v.weightGram,
        roastDate,
        sortOrder: order,
        isActive: true,
        deletedAt: null,
      } satisfies Prisma.ProductVariantUncheckedUpdateInput;
      await tx.productVariant.upsert({
        where: { sku: v.sku },
        update: data,
        create: { sku: v.sku, ...data },
      });
    }

    // Ảnh và hồ sơ cà phê: làm sạch rồi tạo lại theo sản phẩm
    await tx.productImage.deleteMany({ where: { productId: product.id } });
    await tx.productImage.create({
      data: {
        productId: product.id,
        url: `/uploads/seed/${root}.svg`,
        alt: (ALT_BY_ROOT[root] ?? ((n: string) => n))(p.name),
        sortOrder: 0,
        isPrimary: true,
      },
    });
    await tx.coffeeProfile.deleteMany({ where: { productId: product.id } });
    if (p.coffee) {
      const c = p.coffee;
      await tx.coffeeProfile.create({
        data: {
          productId: product.id,
          originCountry: c.originCountry,
          originRegion: c.originRegion,
          variety: c.variety,
          process: c.process,
          roastLevel: c.roastLevel,
          altitude: c.altitude,
          tastingNotes: c.tastingNotes,
          brewMethods: c.brewMethods,
        },
      });
    }

    await refreshProductDenorm(tx, product.id, now);
  });
}

/** Seed idempotent: upsert theo slug/sku. Trả về số sản phẩm đã ghi (gồm DRAFT/ARCHIVED/xóa mềm). */
export async function seedProducts(prisma: PrismaClient, now: Date = new Date()): Promise<number> {
  const [categories, brands] = await Promise.all([
    prisma.category.findMany({ select: { id: true, slug: true } }),
    prisma.brand.findMany({ select: { id: true, slug: true } }),
  ]);
  const categoryIds = new Map(categories.map((c) => [c.slug, c.id]));
  const brandIds = new Map(brands.map((b) => [b.slug, b.id]));

  for (const [index, p] of SEED_PRODUCTS.entries()) {
    await seedOne(prisma, p, index, now, categoryIds, brandIds);
  }
  return SEED_PRODUCTS.length;
}
