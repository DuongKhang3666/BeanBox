import type { Express } from 'express';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { createFixtures, dataOf, errOf } from './checkoutHelpers.js';
import { placeGuestOrder, placeUserOrder } from './orderTestHelpers.js';

const PREFIX = 'tm3m-';
let app: Express;
const fx = createFixtures(() => app, PREFIX);

const list = (u: { who: { auth?: Record<string, string> } }, qs = '') =>
  fx.call('get', `/me/orders${qs}`, u.who);

beforeAll(async () => {
  app = createApp({
    generalRateLimit: 100_000,
    authRateLimit: 100_000,
    couponRateLimit: 100_000,
    quoteRateLimit: 100_000,
    orderRateLimit: 100_000,
  });
  await fx.setup();
});
afterAll(async () => {
  await fx.restoreSettings();
  await fx.clean();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await fx.setSetting('shipping.rates', {
    inner: { STANDARD: 20000, EXPRESS: 35000 },
    other: { STANDARD: 35000, EXPRESS: 55000 },
  });
  await fx.setSetting('shipping.innerCityProvinceCodes', ['01', '79']);
  await fx.setSetting('shipping.innerCityWardCodes', []);
});
afterEach(async () => {
  await fx.restoreSettings();
});

describe('GET /me/orders', () => {
  it('401 khi không có token', async () => {
    const res = await fx.call('get', '/me/orders');
    expect(res.status).toBe(401);
  });

  it('chỉ đơn của mình, mới nhất trước, itemCount = tổng quantity, items tối đa 3', async () => {
    const u = await fx.mkUser('l1');
    const other = await fx.mkUser('l1b');
    const vs = await Promise.all(
      ['a', 'b', 'c', 'd'].map((k) => fx.mkVariant(`l1${k}`, { stock: 50 })),
    );
    const o1 = await placeUserOrder(fx, u, [[vs[0]!.id, 2]]);
    const o2 = await placeUserOrder(fx, u, [
      [vs[0]!.id, 2],
      [vs[1]!.id, 1],
      [vs[2]!.id, 4],
      [vs[3]!.id, 3],
    ]);
    await placeUserOrder(fx, other, [[vs[0]!.id, 1]]);
    await placeGuestOrder(fx, [[vs[0]!.id, 1]]);

    const res = await list(u);
    expect(res.status).toBe(200);
    const rows = dataOf(res) as Array<Record<string, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(rows.map((r) => r.code)).toEqual([o2.code, o1.code]);
    expect(res.body.meta).toEqual({ page: 1, pageSize: 20, total: 2, totalPages: 1 });

    expect(rows[0]).toMatchObject({
      code: o2.code,
      status: 'PENDING',
      paymentStatus: 'UNPAID',
      paymentMethod: 'COD',
      grandTotal: o2.grandTotal,
      itemCount: 10,
      createdAt: o2.createdAt,
    });
    expect(rows[0]!.items).toHaveLength(3);
    expect(Object.keys(rows[0]!.items[0]).sort()).toEqual([
      'imageUrl',
      'productName',
      'quantity',
      'variantName',
    ]);
    // 3 dòng đầu theo id OrderItem
    const dbItems = await prisma.orderItem.findMany({
      where: { order: { code: o2.code } },
      orderBy: { id: 'asc' },
      take: 3,
    });
    expect(rows[0]!.items.map((i: { variantName: string }) => i.variantName)).toEqual(
      dbItems.map((i) => i.variantName),
    );
    expect(rows[1]).toMatchObject({ itemCount: 2 });
    expect(rows[1]!.items).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toContain('"userId"');
  });

  it('lọc status nhiều giá trị; status sai -> 400', async () => {
    const u = await fx.mkUser('l2');
    const v = await fx.mkVariant('l2', { stock: 50 });
    const a = await placeUserOrder(fx, u, [[v.id, 1]]);
    const b = await placeUserOrder(fx, u, [[v.id, 1]]);
    const c = await placeUserOrder(fx, u, [[v.id, 1]]);
    await prisma.order.update({ where: { code: b.code }, data: { status: 'CONFIRMED' } });
    await prisma.order.update({ where: { code: c.code }, data: { status: 'DELIVERED' } });

    const pending = await list(u, '?status=PENDING');
    expect(dataOf(pending).map((r: { code: string }) => r.code)).toEqual([a.code]);
    const multi = await list(u, '?status=PENDING,CONFIRMED');
    expect(dataOf(multi).map((r: { code: string }) => r.code)).toEqual([b.code, a.code]);
    expect(multi.body.meta.total).toBe(2);

    const bad = await list(u, '?status=PENDING,NOPE');
    expect(bad.status).toBe(400);
    expect(errOf(bad).code).toBe('VALIDATION_ERROR');
  });

  it('phân trang và meta; page vượt tổng -> data rỗng; tham số ngoài khoảng -> 400', async () => {
    const u = await fx.mkUser('l3');
    const v = await fx.mkVariant('l3', { stock: 50 });
    const codes: string[] = [];
    for (let i = 0; i < 3; i++) codes.unshift((await placeUserOrder(fx, u, [[v.id, 1]])).code);

    const p1 = await list(u, '?pageSize=2');
    expect(dataOf(p1).map((r: { code: string }) => r.code)).toEqual(codes.slice(0, 2));
    expect(p1.body.meta).toEqual({ page: 1, pageSize: 2, total: 3, totalPages: 2 });
    const p2 = await list(u, '?pageSize=2&page=2');
    expect(dataOf(p2).map((r: { code: string }) => r.code)).toEqual(codes.slice(2));
    const p9 = await list(u, '?pageSize=2&page=9');
    expect(p9.status).toBe(200);
    expect(dataOf(p9)).toEqual([]);
    expect(p9.body.meta.total).toBe(3);

    for (const qs of ['?page=0', '?pageSize=0', '?pageSize=101', '?page=abc']) {
      expect((await list(u, qs)).status).toBe(400);
    }
  });

  it('user chưa có đơn -> data rỗng, totalPages 0', async () => {
    const u = await fx.mkUser('l4');
    const res = await list(u);
    expect(res.status).toBe(200);
    expect(dataOf(res)).toEqual([]);
    expect(res.body.meta).toEqual({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  });
});
