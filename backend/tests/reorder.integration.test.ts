import type { Express } from 'express';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { createFixtures, dataOf, errOf, type Who } from './checkoutHelpers.js';
import { placeUserOrder } from './orderTestHelpers.js';

/** D-077: POST /me/orders/:code/reorder. */

const PREFIX = 'tm77-';
let app: Express;
const fx = createFixtures(() => app, PREFIX);

const reorder = (who: Who, code: string) => fx.call('post', `/me/orders/${code}/reorder`, who);
const cartOf = async (who: Who) => dataOf(await fx.call('get', '/cart', who));
const qtyIn = (
  cart: { items: Array<{ variantId: string; quantity: number }> },
  variantId: string,
) => cart.items.find((i) => i.variantId === variantId)?.quantity ?? 0;

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

describe('POST /me/orders/:code/reorder', () => {
  it('đủ hàng: thêm đủ số lượng, giá hiện hành (không dùng giá cũ), cart trả về', async () => {
    const u = await fx.mkUser('full');
    const a = await fx.mkVariant('fa', { price: 100000, stock: 50 });
    const b = await fx.mkVariant('fb', { price: 50000, stock: 50 });
    const order = await placeUserOrder(fx, u, [
      [a.id, 2],
      [b.id, 3],
    ]);
    await prisma.productVariant.update({ where: { id: a.id }, data: { price: 120000 } });

    const res = await reorder(u.who, order.code);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const d = dataOf(res);
    expect(d.skipped).toEqual([]);
    expect(d.adjusted).toEqual([]);
    expect(d.added).toHaveLength(2);
    expect(d.added.find((x: { variantId: string }) => x.variantId === a.id)).toMatchObject({
      quantity: 2,
      productName: expect.any(String),
      variantName: expect.any(String),
    });
    expect(qtyIn(d.cart, a.id)).toBe(2);
    expect(qtyIn(d.cart, b.id)).toBe(3);
    const lineA = d.cart.items.find((i: { variantId: string }) => i.variantId === a.id);
    expect(lineA.unitPrice).toBe(120000);
    expect(d.cart.subtotal).toBe(2 * 120000 + 3 * 50000);
    // Giỏ lưu thật
    expect(qtyIn(await cartOf(u.who), a.id)).toBe(2);
  });

  it('thiếu hàng: thêm phần có thể, báo adjusted với số yêu cầu và số đã thêm', async () => {
    const u = await fx.mkUser('adj');
    const v = await fx.mkVariant('adj', { stock: 50 });
    const order = await placeUserOrder(fx, u, [[v.id, 4]]);
    await prisma.productVariant.update({ where: { id: v.id }, data: { stock: 3 } });
    const d = dataOf(await reorder(u.who, order.code));
    expect(d.added).toEqual([]);
    expect(d.skipped).toEqual([]);
    expect(d.adjusted).toEqual([
      expect.objectContaining({ variantId: v.id, requested: 4, added: 3 }),
    ]);
    expect(qtyIn(d.cart, v.id)).toBe(3);
  });

  it('bỏ qua: hết hàng, biến thể ngừng bán, sản phẩm không còn bán, đã xóa; dòng còn lại vẫn thêm', async () => {
    const u = await fx.mkUser('skip');
    const ok = await fx.mkVariant('ok', { stock: 50 });
    const oos = await fx.mkVariant('oos', { stock: 50 });
    const inactive = await fx.mkVariant('inact', { stock: 50 });
    const draft = await fx.mkVariant('draft', { stock: 50 });
    const deleted = await fx.mkVariant('del', { stock: 50 });
    const order = await placeUserOrder(fx, u, [
      [ok.id, 1],
      [oos.id, 2],
      [inactive.id, 1],
      [draft.id, 1],
      [deleted.id, 1],
    ]);
    await prisma.productVariant.update({ where: { id: oos.id }, data: { stock: 0 } });
    await prisma.productVariant.update({ where: { id: inactive.id }, data: { isActive: false } });
    await prisma.product.update({ where: { id: draft.productId }, data: { status: 'DRAFT' } });
    await prisma.productVariant.update({
      where: { id: deleted.id },
      data: { deletedAt: new Date() },
    });

    const res = await reorder(u.who, order.code);
    expect(res.status).toBe(200);
    const d = dataOf(res);
    expect(d.added.map((x: { variantId: string }) => x.variantId)).toEqual([ok.id]);
    const reasons = Object.fromEntries(
      d.skipped.map((x: { variantId: string; reason: string }) => [x.variantId, x.reason]),
    );
    expect(reasons).toEqual({
      [oos.id]: 'OUT_OF_STOCK',
      [inactive.id]: 'DISCONTINUED',
      [draft.id]: 'DISCONTINUED',
      [deleted.id]: 'DISCONTINUED',
    });
    expect(d.skipped.find((x: { variantId: string }) => x.variantId === oos.id)).toMatchObject({
      quantity: 2,
      productName: expect.any(String),
    });
    expect(d.cart.items).toHaveLength(1);
  });

  it('cộng dồn với giỏ hiện có, không vượt tồn kho và tối đa 20/dòng', async () => {
    const u = await fx.mkUser('acc');
    const v = await fx.mkVariant('acc', { stock: 100 });
    const order = await placeUserOrder(fx, u, [[v.id, 15]]);
    expect((await fx.add(u.who, v.id, 10)).status).toBe(201);
    const d = dataOf(await reorder(u.who, order.code));
    // Muốn thêm 15, giỏ đã có 10, trần 20 -> chỉ thêm 10
    expect(d.adjusted).toEqual([
      expect.objectContaining({ variantId: v.id, requested: 15, added: 10 }),
    ]);
    expect(qtyIn(d.cart, v.id)).toBe(20);

    // Cộng dồn trong giới hạn
    const u2 = await fx.mkUser('acc2');
    const w = await fx.mkVariant('acc2', { stock: 100 });
    const o2 = await placeUserOrder(fx, u2, [[w.id, 3]]);
    expect((await fx.add(u2.who, w.id, 2)).status).toBe(201);
    const d2 = dataOf(await reorder(u2.who, o2.code));
    expect(d2.added).toEqual([expect.objectContaining({ variantId: w.id, quantity: 3 })]);
    expect(qtyIn(d2.cart, w.id)).toBe(5);
  });

  it('gọi lặp không vượt tồn kho/giới hạn: lần cuối bị bỏ qua, giỏ giữ nguyên', async () => {
    const u = await fx.mkUser('rep');
    const v = await fx.mkVariant('rep', { stock: 50 });
    const order = await placeUserOrder(fx, u, [[v.id, 3]]);
    await prisma.productVariant.update({ where: { id: v.id }, data: { stock: 4 } });

    const r1 = dataOf(await reorder(u.who, order.code));
    expect(qtyIn(r1.cart, v.id)).toBe(3);
    const r2 = dataOf(await reorder(u.who, order.code));
    expect(r2.adjusted).toEqual([expect.objectContaining({ requested: 3, added: 1 })]);
    expect(qtyIn(r2.cart, v.id)).toBe(4);
    const r3 = dataOf(await reorder(u.who, order.code));
    expect(r3.added).toEqual([]);
    expect(r3.adjusted).toEqual([]);
    expect(r3.skipped).toEqual([
      expect.objectContaining({ variantId: v.id, reason: 'UNAVAILABLE' }),
    ]);
    expect(qtyIn(r3.cart, v.id)).toBe(4);
  });

  it('gọi đồng thời không vượt tồn kho (giỏ bị khóa tuần tự)', async () => {
    const u = await fx.mkUser('conc');
    const v = await fx.mkVariant('conc', { stock: 50 });
    const order = await placeUserOrder(fx, u, [[v.id, 3]]);
    await prisma.productVariant.update({ where: { id: v.id }, data: { stock: 5 } });
    const results = await Promise.all([1, 2, 3].map(() => reorder(u.who, order.code)));
    for (const r of results) expect(r.status).toBe(200);
    expect(qtyIn(await cartOf(u.who), v.id)).toBe(5);
  });

  it('đơn đã hủy vẫn mua lại được', async () => {
    const u = await fx.mkUser('canc');
    const v = await fx.mkVariant('canc', { stock: 50 });
    const order = await placeUserOrder(fx, u, [[v.id, 2]]);
    const c = await fx.call('post', `/orders/${order.code}/cancel`, u.who, {});
    expect(c.status).toBe(200);
    const d = dataOf(await reorder(u.who, order.code));
    expect(qtyIn(d.cart, v.id)).toBe(2);
  });

  it('mã chữ thường vẫn hợp lệ', async () => {
    const u = await fx.mkUser('low');
    const v = await fx.mkVariant('low', { stock: 50 });
    const order = await placeUserOrder(fx, u, [[v.id, 1]]);
    const res = await reorder(u.who, (order.code as string).toLowerCase());
    expect(res.status).toBe(200);
  });

  it('đơn của người khác hoặc không tồn tại -> 404 cùng thông báo, giỏ không đổi', async () => {
    const owner = await fx.mkUser('own');
    const other = await fx.mkUser('oth');
    const v = await fx.mkVariant('own', { stock: 50 });
    const order = await placeUserOrder(fx, owner, [[v.id, 1]]);
    const a = await reorder(other.who, order.code);
    const b = await reorder(other.who, 'BB-991231-AAAA');
    expect(a.status).toBe(404);
    expect(b.status).toBe(404);
    expect(errOf(a).message).toBe(errOf(b).message);
    expect((await cartOf(other.who)).items).toEqual([]);
  });

  it('401 khi không đăng nhập (kể cả có X-Cart-Token)', async () => {
    const res = await reorder({}, 'BB-991231-AAAA');
    expect(res.status).toBe(401);
  });
});
