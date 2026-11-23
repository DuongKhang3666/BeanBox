import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import {
  findStaleMinPriceProducts,
  runSaleRefreshOnce,
  SALE_REFRESH_LOCK_KEY,
} from '../src/jobs/saleRefresh.js';
import { prisma } from '../src/lib/prisma.js';
import {
  computeProductDenorm,
  refreshProductDenorm,
} from '../src/modules/catalog/catalog.denorm.js';

const PREFIX = 'tr17-';
const HOUR = 60 * 60 * 1000;
/** Đồng hồ tiêm: không dùng thời gian thật. */
const T0 = new Date('2030-03-10T03:00:00.000Z');
const at = (h: number) => new Date(T0.getTime() + h * HOUR);

let app: Express;
let categoryId = '';
const ids: Record<string, string> = {};

async function clean() {
  await prisma.product.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await prisma.category.deleteMany({ where: { slug: { startsWith: PREFIX } } });
}

interface V {
  price: number;
  salePrice?: number | null;
  saleStart?: Date | null;
  saleEnd?: Date | null;
  isActive?: boolean;
  deletedAt?: Date | null;
}

/** Tạo sản phẩm rồi chốt denorm tại `T0` bằng đúng refreshProductDenorm. */
async function mk(key: string, variants: V[]) {
  const p = await prisma.product.create({
    data: {
      categoryId,
      name: `Sale ${key}`,
      slug: `${PREFIX}${key}`,
      status: 'ACTIVE',
      variants: {
        create: variants.map((v, i) => ({
          sku: `${PREFIX}${key}-${i}`.toUpperCase(),
          name: `v${i}`,
          attributes: {},
          stock: 5,
          price: v.price,
          salePrice: v.salePrice ?? null,
          saleStart: v.saleStart ?? null,
          saleEnd: v.saleEnd ?? null,
          isActive: v.isActive ?? true,
          deletedAt: v.deletedAt ?? null,
        })),
      },
    },
  });
  ids[key] = p.id;
  await prisma.$transaction((tx) => refreshProductDenorm(tx, p.id, T0));
  return p.id;
}

const minPriceOf = async (key: string) =>
  (await prisma.product.findUniqueOrThrow({ where: { id: ids[key]! } })).minPrice;
const updatedAtOf = async (key: string) =>
  (await prisma.product.findUniqueOrThrow({ where: { id: ids[key]! } })).updatedAt.getTime();

beforeAll(async () => {
  await clean();
  app = createApp();
  categoryId = (await prisma.category.create({ data: { name: 'R17', slug: `${PREFIX}cat` } })).id;
  // A: sale bắt đầu sau T0 + 1h, kết thúc T0 + 2h; B: giá thường 90.000 để kiểm sắp xếp.
  await mk('a', [
    { price: 100_000, salePrice: 80_000, saleStart: at(1), saleEnd: at(2) },
    { price: 150_000 },
  ]);
  await mk('b', [{ price: 90_000 }]);
});
afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});

describe('job làm mới minPrice theo mốc sale (D-080)', () => {
  it('trước mốc: giá thường, không lệch nên job không ghi sản phẩm', async () => {
    expect(await minPriceOf('a')).toBe(100_000);
    const before = await updatedAtOf('a');
    const r = await runSaleRefreshOnce(T0);
    expect(r.skipped).toBe(false);
    if (r.skipped) return;
    expect(r.ids).not.toContain(ids.a);
    expect(r.ids).not.toContain(ids.b);
    expect(await updatedAtOf('a')).toBe(before);
    expect(await minPriceOf('a')).toBe(100_000);
  });

  it('sau mốc saleStart: job đưa minPrice về giá sale; /products?sort=price_asc phản ánh đúng', async () => {
    const list = async () => {
      const res = await request(app)
        .get('/api/v1/products')
        .query({ category: `${PREFIX}cat`, sort: 'price_asc' });
      expect(res.status).toBe(200);
      return (res.body.data as Array<{ slug: string }>).map((i) => i.slug);
    };
    expect(await list()).toEqual([`${PREFIX}b`, `${PREFIX}a`]); // A còn 100.000 > B 90.000

    const r = await runSaleRefreshOnce(at(1.5));
    expect(r.skipped).toBe(false);
    if (r.skipped) return;
    expect(r.ids).toContain(ids.a);
    expect(r.ids).not.toContain(ids.b);
    expect(await minPriceOf('a')).toBe(80_000);
    expect(await list()).toEqual([`${PREFIX}a`, `${PREFIX}b`]);

    const byRange = await request(app)
      .get('/api/v1/products')
      .query({ category: `${PREFIX}cat`, maxPrice: 85_000 });
    expect((byRange.body.data as Array<{ slug: string }>).map((i) => i.slug)).toEqual([
      `${PREFIX}a`,
    ]);
  });

  it('idempotent: chạy lại cùng thời điểm không làm mới và không ghi lại', async () => {
    const before = await updatedAtOf('a');
    const r = await runSaleRefreshOnce(at(1.5));
    expect(r.skipped).toBe(false);
    if (r.skipped) return;
    expect(r.ids).not.toContain(ids.a);
    expect(await updatedAtOf('a')).toBe(before);
  });

  it('sau saleEnd: minPrice về giá thường', async () => {
    const r = await runSaleRefreshOnce(at(3));
    expect(r.skipped).toBe(false);
    if (r.skipped) return;
    expect(r.ids).toContain(ids.a);
    expect(await minPriceOf('a')).toBe(100_000);
  });

  it('biên: đúng saleStart và đúng saleEnd vẫn là đang sale (khớp isOnSale)', async () => {
    expect((await runSaleRefreshOnce(at(1))).skipped).toBe(false);
    expect(await minPriceOf('a')).toBe(80_000);
    expect((await runSaleRefreshOnce(at(2))).skipped).toBe(false);
    expect(await minPriceOf('a')).toBe(80_000);
    expect((await runSaleRefreshOnce(at(2.001))).skipped).toBe(false);
    expect(await minPriceOf('a')).toBe(100_000);
  });

  it('giới hạn số sản phẩm mỗi lượt', async () => {
    const x = await mk('lim1', [{ price: 50_000, salePrice: 40_000, saleEnd: at(10) }]);
    const y = await mk('lim2', [{ price: 50_000, salePrice: 40_000, saleEnd: at(10) }]);
    // Tại T0 cả hai đang sale nên minPrice đã đúng (40.000); làm lệch thủ công để kiểm giới hạn.
    await prisma.product.updateMany({ where: { id: { in: [x, y] } }, data: { minPrice: 1 } });
    const stale = await findStaleMinPriceProducts(prisma, T0, 1_000);
    expect(stale).toEqual(expect.arrayContaining([x, y]));
    const one = await findStaleMinPriceProducts(prisma, T0, 1);
    expect(one).toHaveLength(1);
    const r = await runSaleRefreshOnce(T0, 1);
    expect(r.skipped).toBe(false);
    if (r.skipped) return;
    expect(r.refreshed).toBe(1);
    await runSaleRefreshOnce(T0, 1_000); // dọn phần còn lại cho các test sau
    expect(await minPriceOf('lim1')).toBe(40_000);
    expect(await minPriceOf('lim2')).toBe(40_000);
  });

  it('instance khác đang giữ khóa advisory thì bỏ qua', async () => {
    await prisma.$transaction(async (tx) => {
      const held = await tx.$queryRaw<Array<{ locked: boolean }>>`
        SELECT pg_try_advisory_xact_lock(${SALE_REFRESH_LOCK_KEY}::bigint) AS locked`;
      expect(held[0]?.locked).toBe(true);
      // Giữ khóa ở kết nối này; lượt chạy ở kết nối khác của pool phải bỏ qua.
      const r = await runSaleRefreshOnce(T0);
      expect(r).toEqual({ skipped: true });
    });
  });
});

describe('SQL đối soát khớp refreshProductDenorm (D-080)', () => {
  it('cùng kết luận "lệch hay không" như computeProductDenorm trên nhiều ca và nhiều mốc', async () => {
    await mk('e1', [{ price: 200_000, salePrice: 150_000, saleStart: at(1), saleEnd: null }]);
    await mk('e2', [{ price: 200_000, salePrice: 150_000, saleStart: null, saleEnd: at(1) }]);
    await mk('e3', [{ price: 200_000, salePrice: 150_000 }]);
    await mk('e4', [
      { price: 200_000, salePrice: 120_000, saleStart: at(1), saleEnd: at(2), isActive: false },
      { price: 210_000 },
    ]);
    await mk('e5', [{ price: 200_000, deletedAt: at(-1) }]);
    await mk('e6', []);
    await mk('e7', [
      { price: 300_000, salePrice: 100_000, saleStart: at(4), saleEnd: at(5) },
      { price: 120_000, salePrice: 110_000, saleStart: at(2), saleEnd: at(3) },
    ]);
    const keys = ['a', 'b', 'e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7'];
    for (const h of [-1, 0, 1, 1.5, 2, 2.5, 3, 4, 4.5, 5, 6]) {
      const now = at(h);
      const sqlStale = new Set(await findStaleMinPriceProducts(prisma, now, 10_000));
      for (const key of keys) {
        const p = await prisma.product.findUniqueOrThrow({
          where: { id: ids[key]! },
          include: { variants: true },
        });
        const expected = computeProductDenorm(p, p.variants, now).minPrice;
        expect(sqlStale.has(p.id), `${key} @${h}h`).toBe(p.minPrice !== expected);
      }
      // Chạy job rồi: không còn lệch (một nguồn logic) và minPrice bằng computeProductDenorm.
      await runSaleRefreshOnce(now, 10_000);
      for (const key of keys) {
        const p = await prisma.product.findUniqueOrThrow({
          where: { id: ids[key]! },
          include: { variants: true },
        });
        expect(p.minPrice, `${key} sau job @${h}h`).toBe(
          computeProductDenorm(p, p.variants, now).minPrice,
        );
      }
    }
  });
});
