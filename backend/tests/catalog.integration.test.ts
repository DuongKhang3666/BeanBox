import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { refreshProductDenorm } from '../src/modules/catalog/catalog.denorm.js';

// Fixture riêng (tiền tố t2-), không phụ thuộc seed. Mỗi test file có app riêng với rate limit nới lỏng.
const app = createApp({ generalRateLimit: 100_000 });
const API = '/api/v1';
const PREFIX = 't2-';

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const ago = (days: number) => new Date(now - days * DAY);
const later = (days: number) => new Date(now + days * DAY);

interface VariantFx {
  sku: string;
  name?: string;
  price: number;
  stock: number;
  salePrice?: number;
  saleStart?: Date;
  saleEnd?: Date;
  lowStockThreshold?: number;
  isActive?: boolean;
  deletedAt?: Date;
  sortOrder?: number;
  roastDate?: Date;
}

interface ProductFx {
  slug: string;
  name: string;
  category: string;
  brand?: string;
  status?: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
  deletedAt?: Date;
  isFeatured?: boolean;
  shortDesc?: string;
  tags?: string[];
  createdAt: Date;
  soldCount?: number;
  ratingAvg?: number;
  ratingCount?: number;
  coffee?: {
    originCountry: string;
    roastLevel: 'LIGHT' | 'MEDIUM' | 'MEDIUM_DARK' | 'DARK';
    process: 'WASHED' | 'NATURAL' | 'HONEY' | 'ANAEROBIC' | 'OTHER';
    brewMethods: ('PHIN' | 'ESPRESSO' | 'POUR_OVER' | 'AEROPRESS')[];
  };
  variants: VariantFx[];
  withImages?: boolean;
}

const ids = new Map<string, string>(); // slug -> id

async function cleanup() {
  await prisma.product.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await prisma.category.deleteMany({
    where: { slug: { startsWith: PREFIX }, NOT: { parentId: null } },
  });
  await prisma.category.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await prisma.brand.deleteMany({ where: { slug: { startsWith: PREFIX } } });
}

async function createProduct(
  fx: ProductFx,
  categoryIds: Map<string, string>,
  brandIds: Map<string, string>,
) {
  const product = await prisma.product.create({
    data: {
      slug: fx.slug,
      name: fx.name,
      categoryId: categoryIds.get(fx.category)!,
      brandId: fx.brand ? brandIds.get(fx.brand)! : null,
      status: fx.status ?? 'ACTIVE',
      deletedAt: fx.deletedAt ?? null,
      isFeatured: fx.isFeatured ?? false,
      shortDesc: fx.shortDesc ?? '',
      description: `Mô tả ${fx.name}`,
      tags: fx.tags ?? [],
      createdAt: fx.createdAt,
      soldCount: fx.soldCount ?? 0,
      ratingAvg: fx.ratingAvg ?? 0,
      ratingCount: fx.ratingCount ?? 0,
      coffee: fx.coffee ? { create: fx.coffee } : undefined,
      images:
        fx.withImages === false
          ? undefined
          : {
              create: [
                { url: `/uploads/seed/phu.svg`, alt: 'Ảnh phụ', sortOrder: 0, isPrimary: false },
                {
                  url: `/uploads/seed/chinh.svg`,
                  alt: `Ảnh chính ${fx.name}`,
                  sortOrder: 1,
                  isPrimary: true,
                },
              ],
            },
      variants: {
        create: fx.variants.map((v, i) => ({
          sku: v.sku,
          name: v.name ?? `Biến thể ${i + 1}`,
          attributes: { weight: '250g' },
          price: v.price,
          stock: v.stock,
          salePrice: v.salePrice ?? null,
          saleStart: v.saleStart ?? null,
          saleEnd: v.saleEnd ?? null,
          lowStockThreshold: v.lowStockThreshold ?? 5,
          isActive: v.isActive ?? true,
          deletedAt: v.deletedAt ?? null,
          sortOrder: v.sortOrder ?? i,
          roastDate: v.roastDate ?? null,
          weightGram: 250,
        })),
      },
    },
  });
  ids.set(fx.slug, product.id);
  await refreshProductDenorm(prisma, product.id, new Date(now));
}

const slugsOf = (res: request.Response): string[] =>
  (res.body.data as { slug: string }[]).map((p) => p.slug);

beforeAll(async () => {
  await cleanup();

  const root = await prisma.category.create({
    data: { slug: 't2-cf', name: 'T2 Cà phê', sortOrder: 9001 },
  });
  const tool = await prisma.category.create({
    data: { slug: 't2-tool', name: 'T2 Dụng cụ', sortOrder: 9002 },
  });
  const bulk = await prisma.category.create({
    data: { slug: 't2-bulk', name: 'T2 Hàng loạt', sortOrder: 9003 },
  });
  await prisma.category.create({
    data: { slug: 't2-off', name: 'T2 Gốc ẩn', sortOrder: 9004, isActive: false },
  });
  const a = await prisma.category.create({
    data: { slug: 't2-cf-a', name: 'T2 Chuyên Biệt', parentId: root.id, sortOrder: 1 },
  });
  const b = await prisma.category.create({
    data: { slug: 't2-cf-b', name: 'T2 Pha Trộn', parentId: root.id, sortOrder: 2 },
  });
  const cfOff = await prisma.category.create({
    data: {
      slug: 't2-cf-off',
      name: 'T2 Chuyên Ẩn',
      parentId: root.id,
      sortOrder: 3,
      isActive: false,
    },
  });
  const offParent = await prisma.category.findUniqueOrThrow({ where: { slug: 't2-off' } });
  await prisma.category.create({
    data: { slug: 't2-off-child', name: 'T2 Con của gốc ẩn', parentId: offParent.id },
  });

  const categoryIds = new Map([
    ['t2-cf', root.id],
    ['t2-tool', tool.id],
    ['t2-bulk', bulk.id],
    ['t2-cf-a', a.id],
    ['t2-cf-b', b.id],
    ['t2-cf-off', cfOff.id],
  ]);

  const brandA = await prisma.brand.create({ data: { slug: 't2-brand-a', name: 'T2 Alpha' } });
  const brandB = await prisma.brand.create({ data: { slug: 't2-brand-b', name: 'T2 Beta' } });
  await prisma.brand.create({ data: { slug: 't2-brand-empty', name: 'T2 Empty' } });
  const brandIds = new Map([
    ['t2-brand-a', brandA.id],
    ['t2-brand-b', brandB.id],
  ]);

  const fixtures: ProductFx[] = [
    {
      slug: 't2-p1',
      name: 'Zorro Ethiopia Yirgacheffe',
      category: 't2-cf-a',
      brand: 't2-brand-a',
      isFeatured: true,
      createdAt: ago(3),
      soldCount: 10,
      ratingAvg: 4.57,
      ratingCount: 18,
      coffee: {
        originCountry: 'Ethiopia',
        roastLevel: 'LIGHT',
        process: 'WASHED',
        brewMethods: ['POUR_OVER', 'AEROPRESS'],
      },
      variants: [
        {
          sku: 'T2-P1-A',
          name: '250 g - Nguyên hạt',
          price: 200000,
          salePrice: 150000,
          saleStart: ago(2),
          saleEnd: later(10),
          stock: 50,
          sortOrder: 2,
          roastDate: new Date('2026-11-01T00:00:00.000Z'),
        },
        { sku: 'T2-P1-B', name: '500 g - Hết hàng', price: 400000, stock: 0, sortOrder: 1 },
        { sku: 'T2-P1-INACTIVE', price: 1000, stock: 99, isActive: false, sortOrder: 0 },
        { sku: 'T2-P1-DELETED', price: 500, stock: 5, deletedAt: ago(1), sortOrder: 0 },
      ],
    },
    {
      slug: 't2-p2',
      name: 'Cà phê Đà Lạt Zorro Medium',
      category: 't2-cf-a',
      brand: 't2-brand-b',
      createdAt: ago(1),
      soldCount: 30,
      ratingAvg: 4.9,
      ratingCount: 12,
      coffee: {
        originCountry: 'Việt Nam',
        roastLevel: 'MEDIUM',
        process: 'NATURAL',
        brewMethods: ['PHIN', 'ESPRESSO'],
      },
      variants: [{ sku: 'T2-P2-A', price: 120000, stock: 3 }],
    },
    {
      slug: 't2-p3',
      name: 'Blend Phin Zorro Đậm',
      category: 't2-cf-b',
      brand: 't2-brand-b',
      createdAt: ago(4),
      soldCount: 50,
      ratingAvg: 4.5,
      ratingCount: 30,
      tags: ['t2tagzz'],
      shortDesc: 'Đậm đà, hậu vị béo',
      coffee: {
        originCountry: 'Việt Nam',
        roastLevel: 'DARK',
        process: 'OTHER',
        brewMethods: ['PHIN'],
      },
      variants: [
        {
          sku: 'T2-P3-A',
          price: 90000,
          stock: 100,
          salePrice: 70000,
          saleStart: ago(30),
          saleEnd: ago(5), // hết hạn
        },
      ],
    },
    {
      slug: 't2-p4',
      name: 'Phễu V60 Zorro',
      category: 't2-tool',
      brand: 't2-brand-a',
      isFeatured: true,
      createdAt: ago(6),
      variants: [
        {
          sku: 'T2-P4-A',
          price: 250000,
          stock: 10,
          salePrice: 200000,
          saleStart: later(3),
          saleEnd: later(9),
        },
      ],
    },
    {
      slug: 't2-p5',
      name: 'Zorro Bản nháp',
      category: 't2-cf-a',
      brand: 't2-brand-a',
      status: 'DRAFT',
      createdAt: ago(7),
      variants: [{ sku: 'T2-P5-A', price: 10000, stock: 5 }],
    },
    {
      slug: 't2-p6',
      name: 'Zorro Đã lưu trữ',
      category: 't2-cf-a',
      brand: 't2-brand-b',
      status: 'ARCHIVED',
      createdAt: ago(7),
      variants: [{ sku: 'T2-P6-A', price: 10000, stock: 5 }],
    },
    {
      slug: 't2-p7',
      name: 'Zorro Đã xóa',
      category: 't2-cf-a',
      deletedAt: ago(1),
      createdAt: ago(7),
      variants: [{ sku: 'T2-P7-A', price: 10000, stock: 5 }],
    },
    {
      slug: 't2-p8',
      name: 'Hộp Zorro Mini',
      category: 't2-cf', // gắn trực tiếp vào danh mục cha
      createdAt: ago(2),
      withImages: false,
      variants: [{ sku: 'T2-P8-A', price: 50000, stock: 5 }], // đúng ngưỡng -> LOW_STOCK
    },
    {
      slug: 't2-p9',
      name: 'Hộp Zorro Danh mục ẩn',
      category: 't2-cf-off',
      createdAt: ago(2),
      variants: [{ sku: 'T2-P9-A', price: 60000, stock: 20 }],
    },
    {
      slug: 't2-p10',
      name: 'Hết Hàng Zorro',
      category: 't2-cf-b',
      createdAt: ago(5),
      variants: [{ sku: 'T2-P10-A', price: 70000, stock: 0 }],
    },
    // Để kiểm tra xếp hạng relevance khác với thứ tự thời gian
    {
      slug: 't2-rel-exact',
      name: 'Kili Zorro',
      category: 't2-tool',
      createdAt: ago(20),
      variants: [{ sku: 'T2-REL-A', price: 30000, stock: 20 }],
    },
    {
      slug: 't2-rel-prefix',
      name: 'Kilimanjaro Zorro',
      category: 't2-tool',
      createdAt: ago(10),
      variants: [{ sku: 'T2-REL-B', price: 31000, stock: 20 }],
    },
  ];
  for (const fx of fixtures) await createProduct(fx, categoryIds, brandIds);

  // 10 sản phẩm cùng danh mục để kiểm tra related tối đa 8
  for (let i = 1; i <= 10; i++) {
    await createProduct(
      {
        slug: `t2-bulk-${i}`,
        name: `Hàng loạt ${i}`,
        category: 't2-bulk',
        createdAt: ago(40 + i),
        soldCount: i,
        variants: [{ sku: `T2-BULK-${i}`, price: 10000 * i, stock: 20 }],
      },
      categoryIds,
      brandIds,
    );
  }
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('GET /categories', () => {
  it('trả cây 2 cấp, sắp theo sortOrder, chỉ active, productCount đúng', async () => {
    const res = await request(app).get(`${API}/categories`);
    expect(res.status).toBe(200);
    const tree = res.body.data as {
      slug: string;
      imageUrl: string | null;
      productCount: number;
      children: { slug: string; productCount: number }[];
    }[];
    const ours = tree.filter((c) => c.slug.startsWith(PREFIX)).map((c) => c.slug);
    expect(ours).toEqual(['t2-cf', 't2-tool', 't2-bulk']); // t2-off ẩn, đúng sortOrder

    const cf = tree.find((c) => c.slug === 't2-cf')!;
    expect(cf.children.map((c) => c.slug)).toEqual(['t2-cf-a', 't2-cf-b']); // t2-cf-off ẩn
    expect(cf.children.find((c) => c.slug === 't2-cf-a')!.productCount).toBe(2); // p1,p2 (loại draft/archived/xóa)
    expect(cf.children.find((c) => c.slug === 't2-cf-b')!.productCount).toBe(2); // p3,p10
    // cha = 1 gắn trực tiếp (p8) + 4 của con; p9 ở danh mục con ẩn không tính
    expect(cf.productCount).toBe(5);
    expect(cf.imageUrl).toBeNull();
    expect(tree.find((c) => c.slug === 't2-tool')!.productCount).toBe(3);
    expect(JSON.stringify(res.body)).not.toContain('t2-off');
  });
});

describe('GET /brands', () => {
  it('kèm productCount (chỉ ACTIVE chưa xóa), sắp theo tên', async () => {
    const res = await request(app).get(`${API}/brands`);
    expect(res.status).toBe(200);
    const brands = (
      res.body.data as { slug: string; name: string; productCount: number; logoUrl: null }[]
    ).filter((b) => b.slug.startsWith(PREFIX));
    expect(brands.map((b) => b.slug)).toEqual(['t2-brand-a', 't2-brand-b', 't2-brand-empty']);
    const count = (s: string) => brands.find((b) => b.slug === s)!.productCount;
    expect(count('t2-brand-a')).toBe(2); // p1, p4 (p5 DRAFT loại)
    expect(count('t2-brand-b')).toBe(2); // p2, p3 (p6 ARCHIVED loại)
    expect(count('t2-brand-empty')).toBe(0);
  });
});

describe('GET /products – bộ lọc', () => {
  const list = (query: string) => request(app).get(`${API}/products?${query}`);

  it('trả đúng shape ProductListItem và không lộ stock', async () => {
    const res = await list('category=t2-cf-a&sort=price_desc');
    expect(res.status).toBe(200);
    const p1 = (res.body.data as Record<string, unknown>[]).find((p) => p.slug === 't2-p1')!;
    expect(p1).toEqual({
      id: ids.get('t2-p1'),
      slug: 't2-p1',
      name: 'Zorro Ethiopia Yirgacheffe',
      shortDesc: '',
      brand: { id: expect.any(String), name: 'T2 Alpha', slug: 't2-brand-a' },
      category: { id: expect.any(String), name: 'T2 Chuyên Biệt', slug: 't2-cf-a' },
      primaryImage: { url: '/uploads/seed/chinh.svg', alt: 'Ảnh chính Zorro Ethiopia Yirgacheffe' },
      minPrice: 150000,
      compareAtPrice: 200000,
      inStock: true,
      isFeatured: true,
      ratingAvg: 4.6,
      ratingCount: 18,
      coffee: { originCountry: 'Ethiopia', roastLevel: 'LIGHT', process: 'WASHED' },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/"stock"\s*:/);
    expect(res.body.meta).toEqual({ page: 1, pageSize: 20, total: 2, totalPages: 1 });
  });

  it('coffee null, brand null, primaryImage null, compareAtPrice null khi không có', async () => {
    const res = await list('category=t2-cf');
    const p8 = (res.body.data as Record<string, unknown>[]).find((p) => p.slug === 't2-p8')!;
    expect(p8).toMatchObject({
      coffee: null,
      brand: null,
      primaryImage: null,
      compareAtPrice: null,
      minPrice: 50000,
    });
  });

  it('giá sale chưa bắt đầu / đã hết hạn không làm giảm minPrice, compareAtPrice null', async () => {
    const res = await list('category=t2-tool&q=zorro');
    const p4 = (res.body.data as Record<string, unknown>[]).find((p) => p.slug === 't2-p4')!;
    expect(p4).toMatchObject({ minPrice: 250000, compareAtPrice: null });
    const res3 = await list('category=t2-cf-b');
    const p3 = (res3.body.data as Record<string, unknown>[]).find((p) => p.slug === 't2-p3')!;
    expect(p3).toMatchObject({ minPrice: 90000, compareAtPrice: null });
  });

  it('chỉ trả ACTIVE chưa xóa (không có DRAFT/ARCHIVED/xóa mềm)', async () => {
    const res = await list('q=zorro&pageSize=100');
    const slugs = slugsOf(res);
    expect(slugs).toEqual(expect.arrayContaining(['t2-p1', 't2-p2', 't2-p3', 't2-p4', 't2-p8']));
    for (const hidden of ['t2-p5', 't2-p6', 't2-p7']) expect(slugs).not.toContain(hidden);
  });

  it('category cha gồm con + sản phẩm gắn trực tiếp; không gồm con không active', async () => {
    const res = await list('category=t2-cf&sort=price_asc');
    expect(slugsOf(res)).toEqual(['t2-p8', 't2-p10', 't2-p3', 't2-p2', 't2-p1']);
    expect(res.body.meta.total).toBe(5);
    expect(slugsOf(await list('category=t2-cf-a&sort=price_asc'))).toEqual(['t2-p2', 't2-p1']);
  });

  it('category không tồn tại hoặc không active -> data rỗng, meta total 0', async () => {
    for (const slug of ['khong-ton-tai', 't2-off', 't2-cf-off']) {
      const res = await list(`category=${slug}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.meta).toEqual({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
    }
  });

  it('brand (nhiều giá trị = OR)', async () => {
    expect((await list('brand=t2-brand-a&category=t2-cf')).body.meta.total).toBe(1);
    expect(slugsOf(await list('brand=t2-brand-a&sort=newest&pageSize=100'))).toEqual([
      't2-p1',
      't2-p4',
    ]);
    const both = await list('brand=t2-brand-a,%20t2-brand-b&pageSize=100&sort=price_asc');
    expect(slugsOf(both)).toEqual(['t2-p3', 't2-p2', 't2-p1', 't2-p4']);
  });

  it('minPrice/maxPrice (biên bao gồm hai đầu)', async () => {
    expect(slugsOf(await list('category=t2-cf&minPrice=100000&sort=price_asc'))).toEqual([
      't2-p2',
      't2-p1',
    ]);
    expect(slugsOf(await list('category=t2-cf&maxPrice=70000&sort=price_asc'))).toEqual([
      't2-p8',
      't2-p10',
    ]);
    expect(
      slugsOf(await list('category=t2-cf&minPrice=90000&maxPrice=120000&sort=price_asc')),
    ).toEqual(['t2-p3', 't2-p2']);
  });

  it('inStock=true loại sản phẩm hết hàng', async () => {
    const res = await list('category=t2-cf&inStock=true');
    const slugs = slugsOf(res);
    expect(slugs).not.toContain('t2-p10');
    expect(slugs).toHaveLength(4);
  });

  it('featured=true', async () => {
    expect(slugsOf(await list('category=t2-cf&featured=true'))).toEqual(['t2-p1']);
    expect(slugsOf(await list('q=zorro&featured=true&sort=price_asc'))).toEqual(['t2-p1', 't2-p4']);
  });

  it('origin: khớp chính xác, không phân biệt hoa thường, nhiều giá trị = OR', async () => {
    expect(slugsOf(await list('origin=ETHIOPIA&category=t2-cf'))).toEqual(['t2-p1']);
    expect(
      slugsOf(await list(`origin=${encodeURIComponent('việt nam')}&category=t2-cf&sort=price_asc`)),
    ).toEqual(['t2-p3', 't2-p2']);
    expect(
      (await list(`origin=${encodeURIComponent('Ethiopia,Việt Nam')}&category=t2-cf`)).body.meta
        .total,
    ).toBe(3);
    expect((await list('origin=Ethiop&category=t2-cf')).body.meta.total).toBe(0); // không khớp một phần
    expect((await list('origin=%25&category=t2-cf')).body.meta.total).toBe(0); // % không phải ký tự đại diện
  });

  it('roast / process / brew', async () => {
    expect(slugsOf(await list('roast=LIGHT&category=t2-cf'))).toEqual(['t2-p1']);
    expect((await list('roast=MEDIUM,DARK&category=t2-cf')).body.meta.total).toBe(2);
    expect(slugsOf(await list('process=NATURAL&category=t2-cf'))).toEqual(['t2-p2']);
    expect(slugsOf(await list('brew=POUR_OVER&category=t2-cf'))).toEqual(['t2-p1']);
    expect((await list('brew=PHIN&category=t2-cf')).body.meta.total).toBe(2);
    expect((await list('brew=ESPRESSO,AEROPRESS&category=t2-cf')).body.meta.total).toBe(2); // p1 (AEROPRESS), p2 (ESPRESSO)
    expect((await list('brew=COLD_BREW&category=t2-cf')).body.meta.total).toBe(0);
    // Kết hợp: AND giữa các trường
    expect(
      slugsOf(await list('roast=LIGHT,MEDIUM&origin=Ethiopia&brew=POUR_OVER&category=t2-cf')),
    ).toEqual(['t2-p1']);
  });
});

describe('GET /products – tìm kiếm', () => {
  const list = (query: string) => request(app).get(`${API}/products?${query}`);

  it('"ca phe" khớp "Cà phê", không phân biệt dấu/hoa thường', async () => {
    expect(slugsOf(await list('q=ca%20phe&category=t2-cf'))).toEqual(['t2-p2']);
    expect(slugsOf(await list('q=C%C3%80%20PH%C3%8A&category=t2-cf'))).toEqual(['t2-p2']);
    expect(slugsOf(await list('q=da%20lat&category=t2-cf'))).toEqual(['t2-p2']); // Đà Lạt
  });

  it('nhiều token là AND', async () => {
    expect(slugsOf(await list('q=ca%20phe%20zorro&category=t2-cf'))).toEqual(['t2-p2']);
    expect((await list('q=ca%20phe%20ethiopia&category=t2-cf')).body.meta.total).toBe(0);
    expect(slugsOf(await list('q=ethiopia%20zorro&category=t2-cf'))).toEqual(['t2-p1']);
  });

  it('tìm được theo tag và mô tả ngắn', async () => {
    expect(slugsOf(await list('q=t2tagzz'))).toEqual(['t2-p3']);
    expect(slugsOf(await list('q=hau%20vi%20beo&category=t2-cf'))).toEqual(['t2-p3']);
  });

  it('ký tự đại diện LIKE (% _) trong q được coi là ký tự thường', async () => {
    expect((await list('q=%25')).body.meta.total).toBe(0);
    expect((await list('q=z_rro&category=t2-cf')).body.meta.total).toBe(0);
  });

  it('input kiểu SQL injection không phá truy vấn relevance', async () => {
    const res = await list(`q=${encodeURIComponent('zorro\'; DROP TABLE "Product"; --')}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect((await list('q=zorro&category=t2-cf')).status).toBe(200);
    expect(await prisma.product.count({ where: { slug: { startsWith: PREFIX } } })).toBeGreaterThan(
      0,
    );
  });

  it('relevance là mặc định khi có q, xếp theo word_similarity rồi createdAt DESC', async () => {
    // "kili" đúng nguyên từ (Kili Zorro, cũ hơn) phải đứng trước "Kilimanjaro" (mới hơn)
    const byDefault = await list('q=kili');
    expect(slugsOf(byDefault)).toEqual(['t2-rel-exact', 't2-rel-prefix']);
    expect(slugsOf(await list('q=kili&sort=relevance'))).toEqual(['t2-rel-exact', 't2-rel-prefix']);
    // Sắp theo thời gian thì ngược lại
    expect(slugsOf(await list('q=kili&sort=newest'))).toEqual(['t2-rel-prefix', 't2-rel-exact']);
    expect(byDefault.body.meta).toEqual({ page: 1, pageSize: 20, total: 2, totalPages: 1 });
  });

  it('relevance đồng hạng -> createdAt DESC; total và phân trang đúng khi có q', async () => {
    const all = await list('q=zorro&category=t2-cf'); // p1,p2,p3,p8,p10 đều có từ "zorro"
    expect(all.body.meta.total).toBe(5);
    expect(slugsOf(all)).toEqual(['t2-p2', 't2-p8', 't2-p1', 't2-p3', 't2-p10']); // theo createdAt giảm dần
    const p1 = await list('q=zorro&category=t2-cf&pageSize=2&page=1');
    const p2 = await list('q=zorro&category=t2-cf&pageSize=2&page=2');
    const p3 = await list('q=zorro&category=t2-cf&pageSize=2&page=3');
    expect(slugsOf(p1)).toEqual(['t2-p2', 't2-p8']);
    expect(slugsOf(p2)).toEqual(['t2-p1', 't2-p3']);
    expect(slugsOf(p3)).toEqual(['t2-p10']);
    expect(p1.body.meta).toEqual({ page: 1, pageSize: 2, total: 5, totalPages: 3 });
    const beyond = await list('q=zorro&category=t2-cf&pageSize=2&page=4');
    expect(beyond.body.data).toEqual([]);
    expect(beyond.body.meta.total).toBe(5);
  });

  it('q kết hợp bộ lọc khác', async () => {
    expect(slugsOf(await list('q=zorro&category=t2-cf&inStock=true&maxPrice=100000'))).toEqual([
      't2-p8',
      't2-p3',
    ]);
  });
});

describe('GET /products – sắp xếp & phân trang', () => {
  const list = (query: string) => request(app).get(`${API}/products?${query}`);
  const base = 'category=t2-cf';

  it('newest (mặc định)', async () => {
    expect(slugsOf(await list(base))).toEqual(['t2-p2', 't2-p8', 't2-p1', 't2-p3', 't2-p10']);
    expect(slugsOf(await list(`${base}&sort=newest`))).toEqual([
      't2-p2',
      't2-p8',
      't2-p1',
      't2-p3',
      't2-p10',
    ]);
  });
  it('price_asc / price_desc', async () => {
    expect(slugsOf(await list(`${base}&sort=price_asc`))).toEqual([
      't2-p8',
      't2-p10',
      't2-p3',
      't2-p2',
      't2-p1',
    ]);
    expect(slugsOf(await list(`${base}&sort=price_desc`))).toEqual([
      't2-p1',
      't2-p2',
      't2-p3',
      't2-p10',
      't2-p8',
    ]);
  });
  it('bestseller (đồng hạng -> mới hơn trước)', async () => {
    expect(slugsOf(await list(`${base}&sort=bestseller`))).toEqual([
      't2-p3',
      't2-p2',
      't2-p1',
      't2-p8',
      't2-p10',
    ]);
  });
  it('rating', async () => {
    expect(slugsOf(await list(`${base}&sort=rating`))).toEqual([
      't2-p2',
      't2-p1',
      't2-p3',
      't2-p8',
      't2-p10',
    ]);
  });

  it('phân trang + meta; page vượt tổng -> data rỗng', async () => {
    const r1 = await list(`${base}&pageSize=2&page=1`);
    expect(r1.body.meta).toEqual({ page: 1, pageSize: 2, total: 5, totalPages: 3 });
    expect(slugsOf(r1)).toEqual(['t2-p2', 't2-p8']);
    expect(slugsOf(await list(`${base}&pageSize=2&page=3`))).toEqual(['t2-p10']);
    const beyond = await list(`${base}&pageSize=2&page=99`);
    expect(beyond.status).toBe(200);
    expect(beyond.body.data).toEqual([]);
    expect(beyond.body.meta).toEqual({ page: 99, pageSize: 2, total: 5, totalPages: 3 });
  });
});

describe('GET /products – input không hợp lệ', () => {
  it.each([
    ['roast=XYZ'],
    ['roast=LIGHT,XYZ'],
    ['process=washed'],
    ['brew=KETTLE'],
    ['minPrice=200&maxPrice=100'],
    ['minPrice=-5'],
    ['maxPrice=abc'],
    ['page=0'],
    ['page=abc'],
    ['pageSize=0'],
    ['pageSize=101'],
    ['sort=relevance'],
    ['sort=cheapest'],
    ['inStock=false'],
    ['featured=yes'],
    ['q='],
    [`q=${'a'.repeat(101)}`],
    ['q[a]=b'],
  ])('%s -> 400 VALIDATION_ERROR', async (query) => {
    const res = await request(app).get(`${API}/products?${query}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.length).toBeGreaterThan(0);
  });
});

describe('GET /products/:slug', () => {
  it('trả đúng shape chi tiết, variants hợp lệ và không lộ stock', async () => {
    const res = await request(app).get(`${API}/products/t2-p1`);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d).toMatchObject({
      id: ids.get('t2-p1'),
      slug: 't2-p1',
      name: 'Zorro Ethiopia Yirgacheffe',
      description: 'Mô tả Zorro Ethiopia Yirgacheffe',
      tags: [],
      brand: { name: 'T2 Alpha', slug: 't2-brand-a' },
      category: { name: 'T2 Chuyên Biệt', slug: 't2-cf-a' },
      breadcrumbs: [
        { name: 'T2 Cà phê', slug: 't2-cf' },
        { name: 'T2 Chuyên Biệt', slug: 't2-cf-a' },
      ],
      minPrice: 150000,
      inStock: true,
      ratingAvg: 4.6,
      ratingCount: 18,
      coffee: {
        originCountry: 'Ethiopia',
        originRegion: null,
        variety: null,
        process: 'WASHED',
        roastLevel: 'LIGHT',
        altitude: null,
        tastingNotes: [],
        brewMethods: ['POUR_OVER', 'AEROPRESS'],
      },
      seo: { title: 'Zorro Ethiopia Yirgacheffe', description: '' },
    });
    expect(new Date(d.createdAt).toISOString()).toBe(d.createdAt);
    // Ảnh primary đứng đầu dù sortOrder lớn hơn
    expect(d.images.map((i: { isPrimary: boolean }) => i.isPrimary)).toEqual([true, false]);
    expect(d.images[0]).toMatchObject({ url: '/uploads/seed/chinh.svg' });
    expect(JSON.stringify(res.body)).not.toMatch(/"stock"\s*:/);
  });

  it('variants: bỏ inactive/đã xóa, sắp sortOrder, đủ trường tính toán', async () => {
    const res = await request(app).get(`${API}/products/t2-p1`);
    const variants = res.body.data.variants as Record<string, unknown>[];
    expect(variants.map((v) => v.sku)).toEqual(['T2-P1-B', 'T2-P1-A']);
    const [oos, sale] = variants;
    expect(oos).toMatchObject({
      stockStatus: 'OUT_OF_STOCK',
      maxQuantity: 0,
      isOnSale: false,
      salePrice: null,
      saleEndsAt: null,
      effectivePrice: 400000,
      roastDate: null,
    });
    expect(sale).toMatchObject({
      sku: 'T2-P1-A',
      name: '250 g - Nguyên hạt',
      attributes: { weight: '250g' },
      price: 200000,
      salePrice: 150000,
      effectivePrice: 150000,
      isOnSale: true,
      stockStatus: 'IN_STOCK',
      maxQuantity: 20, // min(50, 20)
      weightGram: 250,
      roastDate: '2026-11-01',
    });
    expect(typeof sale!.saleEndsAt).toBe('string');
    expect(new Date(sale!.saleEndsAt as string).getTime()).toBeGreaterThan(Date.now());
  });

  it('stockStatus LOW_STOCK và maxQuantity = stock khi stock nhỏ', async () => {
    const p2 = (await request(app).get(`${API}/products/t2-p2`)).body.data;
    expect(p2.variants[0]).toMatchObject({ stockStatus: 'LOW_STOCK', maxQuantity: 3 });
    const p8 = (await request(app).get(`${API}/products/t2-p8`)).body.data; // stock đúng ngưỡng
    expect(p8.variants[0]).toMatchObject({ stockStatus: 'LOW_STOCK', maxQuantity: 5 });
    expect(p8.images).toEqual([]);
    expect(p8.coffee).toBeNull();
    expect(p8.brand).toBeNull();
    expect(p8.breadcrumbs).toEqual([{ name: 'T2 Cà phê', slug: 't2-cf' }]); // danh mục gốc: 1 mục
  });

  it('sale hết hạn / chưa bắt đầu: giá hiệu lực = giá niêm yết, ẩn salePrice', async () => {
    const expired = (await request(app).get(`${API}/products/t2-p3`)).body.data.variants[0];
    expect(expired).toMatchObject({
      price: 90000,
      salePrice: null,
      effectivePrice: 90000,
      isOnSale: false,
      saleEndsAt: null,
    });
    const upcoming = (await request(app).get(`${API}/products/t2-p4`)).body.data.variants[0];
    expect(upcoming).toMatchObject({
      price: 250000,
      salePrice: null,
      effectivePrice: 250000,
      isOnSale: false,
    });
    expect(expired.stockStatus).toBe('IN_STOCK');
  });

  it('related: cùng danh mục, ACTIVE, loại chính nó', async () => {
    const d = (await request(app).get(`${API}/products/t2-p1`)).body.data;
    expect(d.related.map((r: { slug: string }) => r.slug)).toEqual(['t2-p2']); // p5/p6/p7 không active, p3 khác danh mục
    expect(d.related[0]).toHaveProperty('minPrice', 120000);
    expect(JSON.stringify(d.related)).not.toMatch(/"stock"\s*:/);
  });

  it('related tối đa 8', async () => {
    const d = (await request(app).get(`${API}/products/t2-bulk-1`)).body.data;
    expect(d.related).toHaveLength(8);
    expect(d.related.map((r: { slug: string }) => r.slug)).not.toContain('t2-bulk-1');
  });

  it.each([
    ['t2-p5'],
    ['t2-p6'],
    ['t2-p7'],
    ['khong-ton-tai'],
    ['Bad_Slug'],
    ['a--b'],
    ['%20'],
    ['a'.repeat(201)],
  ])('%s -> 404 NOT_FOUND', async (slug) => {
    const res = await request(app).get(`${API}/products/${slug}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('GET /search/suggest', () => {
  const suggest = (query: string) => request(app).get(`${API}/search/suggest?${query}`);

  it.each([
    ['q=a'],
    ['q='],
    [''],
    [`q=${'a'.repeat(51)}`],
    ['q=ca&limit=0'],
    ['q=ca&limit=11'],
    ['q=ca&limit=abc'],
  ])('%s -> 400', async (query) => {
    const res = await suggest(query);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('ưu tiên tên bắt đầu bằng query, rồi mới tới chứa query; đúng shape', async () => {
    const res = await suggest('q=Zorro&limit=10');
    expect(res.status).toBe(200);
    const products = res.body.data.products as { slug: string }[];
    const slugs = products.map((p) => p.slug);
    expect(slugs[0]).toBe('t2-p1'); // "Zorro Ethiopia..." bắt đầu bằng query
    const prefixSet = ['t2-p1'];
    const containsSet = ['t2-p2', 't2-p3', 't2-p4', 't2-p8', 't2-p10', 't2-rel-exact'];
    const lastPrefix = Math.max(...prefixSet.map((s) => slugs.indexOf(s)));
    for (const s of containsSet) {
      const i = slugs.indexOf(s);
      if (i >= 0) expect(i).toBeGreaterThan(lastPrefix);
    }
    expect(products[0]).toEqual({
      slug: expect.any(String),
      name: expect.any(String),
      imageUrl: expect.anything(),
      minPrice: expect.any(Number),
    });
    expect(slugs).not.toContain('t2-p5');
    expect(slugs).not.toContain('t2-p7');
    expect(JSON.stringify(res.body)).not.toMatch(/"stock"\s*:/);
  });

  it('khớp không dấu và tôn trọng limit mặc định', async () => {
    const res = await suggest('q=ca%20phe%20da');
    expect(res.body.data.products.map((p: { slug: string }) => p.slug)).toEqual(['t2-p2']);
    expect(res.body.data.products[0]).toMatchObject({
      minPrice: 120000,
      imageUrl: '/uploads/seed/chinh.svg',
    });
    const many = await suggest('q=hang');
    expect(many.body.data.products.length).toBeLessThanOrEqual(6);
    expect(many.body.data.products.length).toBeGreaterThan(0);
    const two = await suggest('q=hang&limit=2');
    expect(two.body.data.products).toHaveLength(2);
  });

  it('categories: chỉ danh mục active khớp tên chuẩn hóa', async () => {
    const res = await suggest('q=T2%20chuyen');
    expect(res.body.data.categories).toEqual([{ slug: 't2-cf-a', name: 'T2 Chuyên Biệt' }]); // t2-cf-off ẩn
  });

  it('không có kết quả -> mảng rỗng', async () => {
    const res = await suggest('q=zzzkhongco');
    expect(res.body.data).toEqual({ products: [], categories: [] });
  });
});

describe('/uploads (ảnh tĩnh)', () => {
  it('phục vụ SVG seed với content-type đúng', async () => {
    const res = await request(app).get('/uploads/seed/ca-phe-hat.svg');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^image\/svg\+xml/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    const svg = Buffer.from(res.body as Buffer).toString('utf8');
    expect(svg).toContain('<svg');
    expect(svg).not.toMatch(/<script|href=|xlink:/i);
  });

  it('cả 4 ảnh nhóm gốc đều có', async () => {
    for (const f of ['ca-phe-hat', 'dung-cu-pha-che', 'phu-kien', 'qua-tang-combo']) {
      const res = await request(app).get(`/uploads/seed/${f}.svg`);
      expect(res.status, f).toBe(200);
    }
  });

  it('file không tồn tại -> 404 JSON chuẩn', async () => {
    const res = await request(app).get('/uploads/seed/khong-co.svg');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('thư mục không liệt kê (index: false)', async () => {
    for (const url of ['/uploads/seed/', '/uploads/seed', '/uploads/', '/uploads']) {
      const res = await request(app).get(url);
      expect(res.status, url).toBe(404);
    }
  });

  it('đường dẫn thoát khỏi thư mục không trả file ngoài uploads', async () => {
    const attempts = [
      '/uploads/../.env',
      '/uploads/%2e%2e/.env',
      '/uploads/seed/..%2f..%2f.env',
      '/uploads/seed/%2e%2e%2f%2e%2e%2fpackage.json',
      '/uploads/seed/..%5c..%5cpackage.json',
      '/uploads/%2e%2e%2f%2e%2e%2fsrc%2fapp.ts',
      '/uploads/seed/ca-phe-hat.svg%00.png',
    ];
    for (const url of attempts) {
      const res = await request(app).get(url);
      expect(res.status, url).not.toBe(200);
      expect(res.text ?? '', url).not.toContain('DATABASE_URL');
      expect(res.text ?? '', url).not.toContain('beanbox-backend');
      expect(res.text ?? '', url).not.toContain('createApp');
    }
  });

  it('dotfile bị từ chối -> 404', async () => {
    const res = await request(app).get('/uploads/.gitkeep');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('chỉ GET/HEAD: POST vào file tĩnh -> 404', async () => {
    const res = await request(app).post('/uploads/seed/ca-phe-hat.svg');
    expect(res.status).toBe(404);
  });
});
