import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { refreshProductDenorm } from '../src/modules/catalog/catalog.denorm.js';

// Fixture riêng (tiền tố tcmp-). `GET /products/compare` (§4.7).
const app = createApp({ generalRateLimit: 100_000 });
const API = '/api/v1';
const PREFIX = 'tcmp-';
const HOUR = 60 * 60 * 1000;

let seq = 0;
let catId = '';

interface VariantFx {
  name: string;
  price: number;
  salePrice?: number;
  saleStart?: Date;
  saleEnd?: Date;
  stock?: number;
  sortOrder?: number;
  isActive?: boolean;
  deletedAt?: Date;
  weightGram?: number;
}

async function mkProduct(
  slug: string,
  opts: {
    status?: 'ACTIVE' | 'DRAFT';
    deletedAt?: Date;
    variants?: VariantFx[];
    coffee?: boolean;
  } = {},
) {
  const variants = opts.variants ?? [{ name: 'Mặc định', price: 100_000, stock: 50 }];
  const p = await prisma.product.create({
    data: {
      slug,
      name: `Sản phẩm ${slug}`,
      categoryId: catId,
      status: opts.status ?? 'ACTIVE',
      deletedAt: opts.deletedAt ?? null,
      description: 'Mô tả dài không được lộ trong so sánh',
      tags: ['phin'],
      variants: {
        create: variants.map((v) => ({
          sku: `TCMP-${++seq}-${slug}`.toUpperCase(),
          name: v.name,
          attributes: { weight: `${v.weightGram ?? 250}g` },
          price: v.price,
          salePrice: v.salePrice ?? null,
          saleStart: v.saleStart ?? null,
          saleEnd: v.saleEnd ?? null,
          stock: v.stock ?? 10,
          sortOrder: v.sortOrder ?? 0,
          isActive: v.isActive ?? true,
          deletedAt: v.deletedAt ?? null,
          weightGram: v.weightGram ?? 250,
        })),
      },
      ...(opts.coffee
        ? {
            coffee: {
              create: {
                originCountry: 'Việt Nam',
                originRegion: 'Cầu Đất',
                variety: 'Arabica',
                process: 'WASHED' as const,
                roastLevel: 'MEDIUM' as const,
                altitude: 1500,
                tastingNotes: ['cacao', 'caramel'],
                brewMethods: ['PHIN' as const, 'POUR_OVER' as const],
              },
            },
          }
        : {}),
    },
  });
  await refreshProductDenorm(prisma, p.id);
}

async function cleanup() {
  await prisma.product.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await prisma.category.deleteMany({ where: { slug: { startsWith: PREFIX } } });
}

const cmp = (q: string) => request(app).get(`${API}/products/compare${q}`);
const slugsOf = (res: request.Response) =>
  (res.body.data.items as { slug: string }[]).map((i) => i.slug);

beforeAll(async () => {
  await cleanup();
  catId = (await prisma.category.create({ data: { slug: 'tcmp-cat', name: 'TCMP Cat' } })).id;
  const now = Date.now();
  await mkProduct('tcmp-a', { coffee: true });
  await mkProduct('tcmp-b', {
    variants: [
      { name: 'Lớn', price: 300_000, stock: 0, sortOrder: 2, weightGram: 1000 },
      { name: 'Nhỏ', price: 100_000, stock: 3, sortOrder: 1, weightGram: 250 },
      { name: 'Ẩn', price: 1, isActive: false, sortOrder: 0 },
      { name: 'Đã xóa', price: 2, deletedAt: new Date(), sortOrder: 0 },
    ],
  });
  await mkProduct('tcmp-c', {
    variants: [
      {
        name: 'Sale đang chạy',
        price: 200_000,
        salePrice: 150_000,
        saleStart: new Date(now - HOUR),
        saleEnd: new Date(now + HOUR),
      },
    ],
  });
  await mkProduct('tcmp-future', {
    variants: [
      {
        name: 'Sale sắp tới',
        price: 200_000,
        salePrice: 99_000,
        saleStart: new Date(now + HOUR),
        saleEnd: new Date(now + 2 * HOUR),
      },
    ],
  });
  await mkProduct('tcmp-draft', { status: 'DRAFT' });
  await mkProduct('tcmp-deleted', { deletedAt: new Date() });
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('GET /products/compare', () => {
  it('giữ đúng thứ tự yêu cầu, trả coffee đầy đủ và tags', async () => {
    const res = await cmp('?slugs=tcmp-c,tcmp-a,tcmp-b');
    expect(res.status).toBe(200);
    expect(slugsOf(res)).toEqual(['tcmp-c', 'tcmp-a', 'tcmp-b']);
    expect(res.body.data.missing).toEqual([]);
    const a = res.body.data.items[1];
    expect(a.tags).toEqual(['phin']);
    expect(a.coffee).toEqual({
      originCountry: 'Việt Nam',
      originRegion: 'Cầu Đất',
      variety: 'Arabica',
      process: 'WASHED',
      roastLevel: 'MEDIUM',
      altitude: 1500,
      tastingNotes: ['cacao', 'caramel'],
      brewMethods: ['PHIN', 'POUR_OVER'],
    });
    expect(res.body.data.items[0].coffee).toBeNull();
    expect(a.category).toMatchObject({ slug: 'tcmp-cat' });
    expect(a.minPrice).toBe(100_000);
  });

  it('bỏ slug trùng nhưng giữ thứ tự lần đầu', async () => {
    const res = await cmp('?slugs=tcmp-b,tcmp-a,tcmp-b,tcmp-a');
    expect(res.status).toBe(200);
    expect(slugsOf(res)).toEqual(['tcmp-b', 'tcmp-a']);
  });

  it('chỉ biến thể đang bán, sắp theo sortOrder, priceRange đúng, không lộ stock', async () => {
    const res = await cmp('?slugs=tcmp-a,tcmp-b');
    const b = res.body.data.items[1];
    expect(b.variants.map((v: { name: string }) => v.name)).toEqual(['Nhỏ', 'Lớn']);
    expect(b.priceRange).toEqual({ min: 100_000, max: 300_000 });
    expect(b.variants[0]).toEqual({
      name: 'Nhỏ',
      attributes: { weight: '250g' },
      price: 100_000,
      effectivePrice: 100_000,
      isOnSale: false,
      stockStatus: 'LOW_STOCK',
      weightGram: 250,
    });
    expect(b.variants[1].stockStatus).toBe('OUT_OF_STOCK');
    expect(JSON.stringify(res.body)).not.toMatch(/"stock"/);
  });

  it('không trả description', async () => {
    const res = await cmp('?slugs=tcmp-a,tcmp-b');
    for (const item of res.body.data.items) expect(item).not.toHaveProperty('description');
    expect(JSON.stringify(res.body)).not.toContain('không được lộ');
  });

  it('sale đang chạy: effectivePrice là giá sale; sale chưa bắt đầu không lộ giá sale', async () => {
    const res = await cmp('?slugs=tcmp-c,tcmp-future');
    const [c, f] = res.body.data.items;
    expect(c.variants[0]).toMatchObject({
      price: 200_000,
      effectivePrice: 150_000,
      isOnSale: true,
    });
    expect(c.priceRange).toEqual({ min: 150_000, max: 150_000 });
    expect(c.compareAtPrice).toBe(200_000);
    expect(f.variants[0]).toMatchObject({
      price: 200_000,
      effectivePrice: 200_000,
      isOnSale: false,
    });
    expect(f.priceRange).toEqual({ min: 200_000, max: 200_000 });
    expect(f.compareAtPrice).toBeNull();
    expect(f.variants[0]).not.toHaveProperty('salePrice');
    expect(JSON.stringify(f)).not.toContain('99000');
  });

  it('DRAFT, xóa mềm, không tồn tại -> missing (200), items giữ thứ tự', async () => {
    const res = await cmp('?slugs=tcmp-draft,tcmp-a,tcmp-deleted,tcmp-b');
    expect(res.status).toBe(200);
    expect(slugsOf(res)).toEqual(['tcmp-a', 'tcmp-b']);
    expect(res.body.data.missing).toEqual(['tcmp-draft', 'tcmp-deleted']);
  });

  it('slug không tồn tại -> missing', async () => {
    const res = await cmp('?slugs=tcmp-khong-co,tcmp-a');
    expect(slugsOf(res)).toEqual(['tcmp-a']);
    expect(res.body.data.missing).toEqual(['tcmp-khong-co']);
  });

  it('tất cả đều không tồn tại -> 200 với items rỗng', async () => {
    const res = await cmp('?slugs=tcmp-x1,tcmp-x2');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ items: [], missing: ['tcmp-x1', 'tcmp-x2'] });
  });

  it('chấp nhận đúng 4 slug', async () => {
    const res = await cmp('?slugs=tcmp-a,tcmp-b,tcmp-c,tcmp-future');
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(4);
  });

  it.each([
    ['thiếu param', ''],
    ['rỗng', '?slugs='],
    ['1 slug', '?slugs=tcmp-a'],
    ['2 slug trùng nhau (còn 1)', '?slugs=tcmp-a,tcmp-a'],
    ['5 slug', '?slugs=a1,a2,a3,a4,a5'],
    ['slug sai định dạng', '?slugs=tcmp-a,Sai%20Dinh%20Dang'],
    ['slug viết hoa', '?slugs=tcmp-a,TCMP-B'],
  ])('400 VALIDATION_ERROR: %s', async (_name, q) => {
    const res = await cmp(q);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details[0].field).toBe('slugs');
  });

  it('không bị route /products/:slug che và không bị ép no-store', async () => {
    const res = await cmp('?slugs=tcmp-a,tcmp-b');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBeUndefined();
  });
});
