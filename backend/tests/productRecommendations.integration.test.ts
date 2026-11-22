import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { refreshProductDenorm } from '../src/modules/catalog/catalog.denorm.js';

// Fixture riêng (tiền tố t9-), đơn tạo thẳng bằng Prisma để kiểm soát status/createdAt/khách.
const app = createApp({ generalRateLimit: 100_000 });
const API = '/api/v1';
const PREFIX = 't9-';
const DAY = 24 * 60 * 60 * 1000;

let seq = 0;

interface ProdFx {
  slug: string;
  category: string;
  brand?: string;
  tags?: string[];
  price?: number;
  stock?: number;
  soldCount?: number;
  status?: 'ACTIVE' | 'DRAFT';
  deletedAt?: Date;
}

async function cleanup() {
  await prisma.order.deleteMany({
    where: { contactEmail: { startsWith: PREFIX, mode: 'insensitive' } },
  });
  await prisma.product.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await prisma.category.deleteMany({
    where: { slug: { startsWith: PREFIX }, NOT: { parentId: null } },
  });
  await prisma.category.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await prisma.brand.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
}

const cats = new Map<string, string>();
const brands = new Map<string, string>();

async function mkProduct(fx: ProdFx) {
  const p = await prisma.product.create({
    data: {
      slug: fx.slug,
      name: `Sản phẩm ${fx.slug}`,
      categoryId: cats.get(fx.category)!,
      brandId: fx.brand ? brands.get(fx.brand)! : null,
      status: fx.status ?? 'ACTIVE',
      deletedAt: fx.deletedAt ?? null,
      tags: fx.tags ?? [],
      soldCount: fx.soldCount ?? 0,
      variants: {
        create: [
          {
            sku: `T9SKU-${++seq}-${randomUUID().slice(0, 4)}`.toUpperCase(),
            name: 'Mặc định',
            attributes: {},
            price: fx.price ?? 100_000,
            stock: fx.stock ?? 10,
            weightGram: 250,
          },
        ],
      },
    },
  });
  await refreshProductDenorm(prisma, p.id);
}

interface OrderFx {
  items: string[]; // slug
  email?: string;
  userId?: string;
  status?: 'PENDING' | 'DELIVERED' | 'CANCELLED' | 'PENDING_PAYMENT';
  daysAgo?: number;
}

async function mkOrder(fx: OrderFx) {
  const items = await Promise.all(
    fx.items.map(async (slug) => {
      const p = await prisma.product.findUniqueOrThrow({
        where: { slug },
        select: { id: true, variants: { select: { id: true }, take: 1 } },
      });
      return { productId: p.id, variantId: p.variants[0]!.id };
    }),
  );
  return prisma.order.create({
    data: {
      code: `BB-T9${++seq}-${randomUUID().slice(0, 6)}`,
      userId: fx.userId ?? null,
      contactEmail: fx.email ?? `${PREFIX}${randomUUID().slice(0, 8)}@example.test`,
      contactPhone: '0912345678',
      status: fx.status ?? 'DELIVERED',
      paymentMethod: 'COD',
      shippingMethod: 'STANDARD',
      shippingAddress: {},
      subtotal: 100_000,
      shippingFee: 0,
      grandTotal: 100_000,
      idempotencyKey: randomUUID(),
      requestFingerprint: 'x',
      createdAt: new Date(Date.now() - (fx.daysAgo ?? 1) * DAY),
      items: {
        create: items.map((i) => ({
          ...i,
          productName: 'SP',
          variantName: 'BT',
          sku: 'SKU',
          unitPrice: 100_000,
          quantity: 1,
          lineTotal: 100_000,
        })),
      },
    },
  });
}

const slugsOf = (res: request.Response): string[] =>
  (res.body.data as { slug: string }[]).map((p) => p.slug);
const bt = (slug: string, q = '') =>
  request(app).get(`${API}/products/${slug}/bought-together${q}`);

beforeAll(async () => {
  await cleanup();
  const root = await prisma.category.create({ data: { slug: 't9-root', name: 'T9 Gốc' } });
  const a = await prisma.category.create({
    data: { slug: 't9-a', name: 'T9 A', parentId: root.id },
  });
  const b = await prisma.category.create({
    data: { slug: 't9-b', name: 'T9 B', parentId: root.id },
  });
  const far = await prisma.category.create({ data: { slug: 't9-far', name: 'T9 Xa' } });
  cats.set('t9-a', a.id).set('t9-b', b.id).set('t9-far', far.id);
  const br1 = await prisma.brand.create({ data: { slug: 't9-br1', name: 'T9 Br1' } });
  brands.set('t9-br1', br1.id);
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('related: chấm điểm nội dung', () => {
  beforeAll(async () => {
    await mkProduct({ slug: 't9-base', category: 't9-a', brand: 't9-br1', tags: ['phin'] });
    // 5 điểm: cùng danh mục (4) + giá gần (1)
    await mkProduct({ slug: 't9-rel-cat', category: 't9-a', soldCount: 1 });
    // 7 điểm: cùng danh mục + brand + giá gần
    await mkProduct({ slug: 't9-rel-brand', category: 't9-a', brand: 't9-br1', soldCount: 0 });
    // cùng danh mục cha (2) + tag (1) + giá gần (1) = 4
    await mkProduct({ slug: 't9-rel-sib', category: 't9-b', tags: ['PHIN'], soldCount: 50 });
    // điểm cao nhất nhưng hết hàng -> xuống cuối
    await mkProduct({
      slug: 't9-rel-oos',
      category: 't9-a',
      brand: 't9-br1',
      tags: ['phin'],
      stock: 0,
      soldCount: 999,
    });
    // không có điểm: danh mục xa, không brand/tag
    await mkProduct({ slug: 't9-rel-none', category: 't9-far', price: 900_000 });
    // loại: DRAFT và xóa mềm
    await mkProduct({ slug: 't9-rel-draft', category: 't9-a', status: 'DRAFT' });
    await mkProduct({ slug: 't9-rel-del', category: 't9-a', deletedAt: new Date() });
  });

  it('ưu tiên còn hàng, rồi điểm giảm dần; loại điểm 0, DRAFT, xóa mềm', async () => {
    const res = await request(app).get(`${API}/products/t9-base`);
    expect(res.status).toBe(200);
    const related = res.body.data.related as { slug: string; inStock: boolean }[];
    expect(related.map((r) => r.slug)).toEqual([
      't9-rel-brand', // 7
      't9-rel-cat', // 5
      't9-rel-sib', // 4
      't9-rel-oos', // hết hàng xuống cuối dù điểm cao
    ]);
    expect(related[3]!.inStock).toBe(false);
  });

  it('giữ nguyên shape ProductListItem (không lộ trường nội bộ)', async () => {
    const res = await request(app).get(`${API}/products/t9-base`);
    const item = res.body.data.related[0] as Record<string, unknown>;
    expect(Object.keys(item).sort()).toEqual(
      [
        'id',
        'slug',
        'name',
        'shortDesc',
        'brand',
        'category',
        'primaryImage',
        'minPrice',
        'compareAtPrice',
        'inStock',
        'isFeatured',
        'updatedAt',
        'ratingAvg',
        'ratingCount',
        'coffee',
      ].sort(),
    );
    expect(Object.keys(item.category as object).sort()).toEqual(['id', 'name', 'slug']);
  });
});

describe('GET /products/:slug/bought-together', () => {
  beforeAll(async () => {
    await mkProduct({ slug: 't9-x', category: 't9-far' });
    await mkProduct({ slug: 't9-y', category: 't9-far', soldCount: 5 });
    await mkProduct({ slug: 't9-z', category: 't9-far', soldCount: 9 });
    await mkProduct({ slug: 't9-solo', category: 't9-far' }); // chỉ 1 khách
    await mkProduct({ slug: 't9-twice', category: 't9-far' }); // 1 khách, 2 đơn
    await mkProduct({ slug: 't9-canc', category: 't9-far' });
    await mkProduct({ slug: 't9-pend', category: 't9-far' });
    await mkProduct({ slug: 't9-old', category: 't9-far' });
    await mkProduct({ slug: 't9-oos2', category: 't9-far', stock: 0 });
    await mkProduct({ slug: 't9-draft2', category: 't9-far' });
    await mkProduct({ slug: 't9-del2', category: 't9-far' });

    // y: 3 khách; z: 2 khách; solo: 1 khách
    await mkOrder({ items: ['t9-x', 't9-y'], email: 't9-k1@example.test' });
    await mkOrder({ items: ['t9-x', 't9-y', 't9-z'], email: 't9-k2@example.test' });
    await mkOrder({ items: ['t9-x', 't9-y', 't9-z'], email: 't9-k3@example.test' });
    await mkOrder({ items: ['t9-x', 't9-solo'], email: 't9-k1@example.test' });
    // 1 khách mua 2 đơn x + twice (email khác hoa thường) -> chỉ 1 khách
    await mkOrder({ items: ['t9-x', 't9-twice'], email: 't9-dup@example.test' });
    await mkOrder({ items: ['t9-x', 't9-twice'], email: 'T9-DUP@example.test' });
    // đơn bị loại/sản phẩm bị loại: mỗi cái 2 khách nhưng không được trả
    for (const slug of ['t9-canc', 't9-pend', 't9-old', 't9-oos2', 't9-draft2', 't9-del2']) {
      const status =
        slug === 't9-canc' ? 'CANCELLED' : slug === 't9-pend' ? 'PENDING_PAYMENT' : 'DELIVERED';
      const daysAgo = slug === 't9-old' ? 400 : 2;
      for (const n of [1, 2]) {
        await mkOrder({
          items: ['t9-x', slug],
          email: `t9-${slug}-${n}@example.test`,
          status,
          daysAgo,
        });
      }
    }
    await prisma.product.update({ where: { slug: 't9-draft2' }, data: { status: 'DRAFT' } });
    await prisma.product.update({ where: { slug: 't9-del2' }, data: { deletedAt: new Date() } });
  });

  it('chỉ trả sản phẩm đạt ngưỡng >= 2 khách, sắp theo số khách rồi soldCount', async () => {
    const res = await bt('t9-x');
    expect(res.status).toBe(200);
    expect(slugsOf(res)).toEqual(['t9-y', 't9-z']);
    expect(res.headers['cache-control']).toBeUndefined();
    const item = res.body.data[0] as Record<string, unknown>;
    expect(item).toHaveProperty('minPrice');
    expect(item).not.toHaveProperty('stock');
  });

  it('hai khách khác nhau mua A+B -> B xuất hiện khi xem A (và ngược lại)', async () => {
    expect(slugsOf(await bt('t9-y'))).toEqual(['t9-x', 't9-z']);
  });

  it('1 khách mua 2 đơn (kể cả email khác hoa thường) không đạt ngưỡng', async () => {
    const got = slugsOf(await bt('t9-x'));
    expect(got).not.toContain('t9-twice');
    expect(got).not.toContain('t9-solo');
  });

  it('đơn CANCELLED, PENDING_PAYMENT, quá 365 ngày không được tính', async () => {
    const got = slugsOf(await bt('t9-x'));
    for (const s of ['t9-canc', 't9-pend', 't9-old']) expect(got).not.toContain(s);
  });

  it('loại sản phẩm hết hàng, DRAFT, xóa mềm', async () => {
    const got = slugsOf(await bt('t9-x'));
    for (const s of ['t9-oos2', 't9-draft2', 't9-del2']) expect(got).not.toContain(s);
  });

  it('khách đăng nhập tính theo userId (hai email khác nhau cùng user = 1 khách)', async () => {
    await mkProduct({ slug: 't9-u1', category: 't9-far' });
    await mkProduct({ slug: 't9-u2', category: 't9-far' });
    const user = await prisma.user.create({
      data: { email: 't9-user@example.test', passwordHash: 'x', fullName: 'T9 User' },
    });
    await mkOrder({ items: ['t9-u1', 't9-u2'], email: 't9-ua@example.test', userId: user.id });
    await mkOrder({ items: ['t9-u1', 't9-u2'], email: 't9-ub@example.test', userId: user.id });
    expect(slugsOf(await bt('t9-u1'))).toEqual([]);
    await mkOrder({ items: ['t9-u1', 't9-u2'], email: 't9-uc@example.test' });
    expect(slugsOf(await bt('t9-u1'))).toEqual(['t9-u2']);
  });

  it('limit hợp lệ cắt kết quả; sai -> 400 VALIDATION_ERROR', async () => {
    expect(slugsOf(await bt('t9-x', '?limit=1'))).toEqual(['t9-y']);
    for (const q of ['?limit=0', '?limit=9', '?limit=abc', '?limit=-1', '?limit=1.5']) {
      const res = await bt('t9-x', q);
      expect(res.status, q).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('sản phẩm không có đơn -> 200 data rỗng', async () => {
    const res = await bt('t9-rel-cat');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('slug không tồn tại / sai định dạng / DRAFT / xóa mềm -> 404 NOT_FOUND', async () => {
    for (const slug of ['t9-khong-co', 'T9_SAI', 't9-draft2', 't9-del2']) {
      const res = await bt(slug);
      expect(res.status, slug).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    }
  });
});
