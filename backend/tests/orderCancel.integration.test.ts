import type { Express } from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { API, ORIGIN } from './authHelpers.js';
import { createFixtures, dataOf, errOf } from './checkoutHelpers.js';
import { placeGuestOrder, placeUserOrder } from './orderTestHelpers.js';

const PREFIX = 'tm3c-';
let app: Express;
const fx = createFixtures(() => app, PREFIX);
const BIG = {
  generalRateLimit: 100_000,
  authRateLimit: 100_000,
  trackRateLimit: 100_000,
  couponRateLimit: 100_000,
  quoteRateLimit: 100_000,
  orderRateLimit: 100_000,
};

const stockOf = async (id: string) =>
  (await prisma.productVariant.findUniqueOrThrow({ where: { id } })).stock;
const usedCountOf = async (id: string) =>
  (await prisma.coupon.findUniqueOrThrow({ where: { id } })).usedCount;
const cancel = (
  code: string,
  body: Record<string, unknown> | undefined,
  who: { auth?: Record<string, string> } = {},
) => fx.call('post', `/orders/${code}/cancel`, who, body);
const COD = { shippingMethod: 'STANDARD', paymentMethod: 'COD', acceptTerms: true };

beforeAll(async () => {
  app = createApp({ ...BIG, guestCancelRateLimit: 100_000 });
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
  await fx.setSetting('shipping.freeShippingThreshold', 500000);
});
afterEach(async () => {
  await fx.restoreSettings();
});

describe('POST /orders/:code/cancel - user', () => {
  it('hủy đơn PENDING của mình: hoàn kho, movement, inStock bật lại, history, canCancel false', async () => {
    const u = await fx.mkUser('a1');
    const v = await fx.mkVariant('a1', { stock: 2 });
    await prisma.product.update({ where: { id: v.productId }, data: { inStock: true } });
    const order = await placeUserOrder(fx, u, [[v.id, 2]]);
    expect(await stockOf(v.id)).toBe(0);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: v.productId } })).inStock).toBe(
      false,
    );

    const res = await cancel(order.code, { reason: '  Đặt nhầm  ' }, u.who);
    expect(res.status).toBe(200);
    const o = dataOf(res);
    expect(o).toMatchObject({
      code: order.code,
      status: 'CANCELLED',
      cancelReason: 'Đặt nhầm',
      canCancel: false,
    });
    // Chủ đơn vẫn nhận Order đầy đủ
    expect(o.contact.email).toBeTruthy();
    expect(o.shippingAddress.fullName).toBeTruthy();
    expect(o.shippingAddress.line1).toBeTruthy();
    expect(o.history.at(-1)).toMatchObject({
      fromStatus: 'PENDING',
      toStatus: 'CANCELLED',
      note: 'Đặt nhầm',
    });

    expect(await stockOf(v.id)).toBe(2);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: v.productId } })).inStock).toBe(
      true,
    );
    const row = await prisma.order.findUniqueOrThrow({
      where: { code: order.code },
      include: { movements: true, history: true },
    });
    expect(row.cancelledAt).not.toBeNull();
    const release = row.movements.find((m) => m.reason === 'ORDER_RELEASE')!;
    expect(release).toMatchObject({ variantId: v.id, change: 2, stockAfter: 2, actorId: u.id });
    expect(row.history.find((h) => h.toStatus === 'CANCELLED')!.actorId).toBe(u.id);
  });

  it('không gửi body / reason rỗng -> cancelReason null', async () => {
    const u = await fx.mkUser('a2');
    const v = await fx.mkVariant('a2');
    const order = await placeUserOrder(fx, u, [[v.id, 1]]);
    const res = await cancel(order.code, undefined, u.who);
    expect(res.status).toBe(200);
    expect(dataOf(res).cancelReason).toBeNull();
  });

  it('reason > 255 ký tự -> 400', async () => {
    const u = await fx.mkUser('a3');
    const v = await fx.mkVariant('a3');
    const order = await placeUserOrder(fx, u, [[v.id, 1]]);
    const res = await cancel(order.code, { reason: 'x'.repeat(256) }, u.who);
    expect(res.status).toBe(400);
    expect(errOf(res).code).toBe('VALIDATION_ERROR');
  });

  it('đơn có mã: hoàn lượt (releasedAt, usedCount -1), mã dùng lại được khi usageLimit 1', async () => {
    const coupon = await fx.mkCoupon('c1', { usageLimit: 1 });
    const u = await fx.mkUser('a4');
    const v = await fx.mkVariant('a4', { stock: 10 });
    const addr = await fx.mkAddress(u.id);
    await fx.add(u.who, v.id, 1);
    expect((await fx.call('post', '/cart/apply-coupon', u.who, { code: coupon.code })).status).toBe(
      200,
    );
    const placed = await fx.postOrder(u.who, { addressId: addr.id, ...COD });
    expect(placed.status).toBe(201);
    const code = dataOf(placed).code as string;
    expect(await usedCountOf(coupon.id)).toBe(1);

    expect((await cancel(code, {}, u.who)).status).toBe(200);
    expect(await usedCountOf(coupon.id)).toBe(0);
    const red = await prisma.couponRedemption.findFirstOrThrow({ where: { couponId: coupon.id } });
    expect(red.releasedAt).not.toBeNull();

    // Dùng lại mã cho đơn mới
    await fx.add(u.who, v.id, 1);
    expect((await fx.call('post', '/cart/apply-coupon', u.who, { code: coupon.code })).status).toBe(
      200,
    );
    const again = await fx.postOrder(u.who, { addressId: addr.id, ...COD });
    expect(again.status).toBe(201);
    expect(await usedCountOf(coupon.id)).toBe(1);
  });

  it('hủy lần 2 -> 409, kho và usedCount không đổi thêm', async () => {
    const coupon = await fx.mkCoupon('c2', { usageLimit: 5 });
    const u = await fx.mkUser('a5');
    const v = await fx.mkVariant('a5', { stock: 5 });
    const addr = await fx.mkAddress(u.id);
    await fx.add(u.who, v.id, 2);
    await fx.call('post', '/cart/apply-coupon', u.who, { code: coupon.code });
    const placed = await fx.postOrder(u.who, { addressId: addr.id, ...COD });
    const code = dataOf(placed).code as string;
    expect((await cancel(code, {}, u.who)).status).toBe(200);
    expect(await stockOf(v.id)).toBe(5);

    const second = await cancel(code, {}, u.who);
    expect(second.status).toBe(409);
    expect(errOf(second)).toMatchObject({
      code: 'INVALID_STATUS_TRANSITION',
      details: { from: 'CANCELLED', to: 'CANCELLED', allowed: [] },
    });
    expect(await stockOf(v.id)).toBe(5);
    expect(await usedCountOf(coupon.id)).toBe(0);
    expect(
      await prisma.inventoryMovement.count({ where: { variantId: v.id, reason: 'ORDER_RELEASE' } }),
    ).toBe(1);
  });

  it('2 request hủy song song -> 1 thành công, 1 409, kho hoàn đúng 1 lần', async () => {
    const u = await fx.mkUser('a6');
    const v = await fx.mkVariant('a6', { stock: 4 });
    const order = await placeUserOrder(fx, u, [[v.id, 3]]);
    expect(await stockOf(v.id)).toBe(1);
    const [r1, r2] = await Promise.all([
      cancel(order.code, {}, u.who),
      cancel(order.code, {}, u.who),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    expect(await stockOf(v.id)).toBe(4);
    expect(
      await prisma.inventoryMovement.count({ where: { variantId: v.id, reason: 'ORDER_RELEASE' } }),
    ).toBe(1);
  });

  it('CONFIRMED hủy được; PROCESSING/SHIPPING -> 409 kèm details.allowed', async () => {
    const u = await fx.mkUser('a7');
    const v = await fx.mkVariant('a7', { stock: 20 });
    const o1 = await placeUserOrder(fx, u, [[v.id, 1]]);
    await prisma.order.update({ where: { code: o1.code }, data: { status: 'CONFIRMED' } });
    const ok = await cancel(o1.code, {}, u.who);
    expect(ok.status).toBe(200);
    expect(dataOf(ok).history.at(-1).fromStatus).toBe('CONFIRMED');

    for (const status of ['PROCESSING', 'SHIPPING'] as const) {
      const o = await placeUserOrder(fx, u, [[v.id, 1]]);
      await prisma.order.update({ where: { code: o.code }, data: { status } });
      const stockBefore = await stockOf(v.id);
      const res = await cancel(o.code, {}, u.who);
      expect(res.status).toBe(409);
      expect(errOf(res)).toMatchObject({
        code: 'INVALID_STATUS_TRANSITION',
        details: { from: status, to: 'CANCELLED', allowed: [] },
      });
      expect(await stockOf(v.id)).toBe(stockBefore);
    }
  });

  it('IDOR: user khác / STAFF -> 404; user đăng nhập hủy đơn guest -> 404', async () => {
    const owner = await fx.mkUser('b1');
    const other = await fx.mkUser('b2');
    const staff = await fx.mkUser('b3');
    await prisma.user.update({ where: { id: staff.id }, data: { role: 'STAFF' } });
    const v = await fx.mkVariant('b1', { stock: 10 });
    const order = await placeUserOrder(fx, owner, [[v.id, 1]]);

    for (const who of [other.who, staff.who]) {
      const res = await cancel(order.code, { phone: '0912345678' }, who);
      expect(res.status).toBe(404);
      expect(errOf(res).code).toBe('NOT_FOUND');
    }
    const guest = await placeGuestOrder(fx, [[v.id, 1]]);
    const res = await cancel(guest.order.code, { phone: '0901234567' }, other.who);
    expect(res.status).toBe(404);

    expect((await prisma.order.findUniqueOrThrow({ where: { code: order.code } })).status).toBe(
      'PENDING',
    );
  });

  it('mã sai định dạng hoặc không tồn tại -> 404', async () => {
    const u = await fx.mkUser('b4');
    expect((await cancel('khong-hop-le', {}, u.who)).status).toBe(404);
    expect((await cancel('BB-261111-ZZZZ', {}, u.who)).status).toBe(404);
  });
});

describe('POST /orders/:code/cancel - guest', () => {
  it('đúng SĐT (định dạng 090 123 4567) -> 200, hoàn kho, actorId null', async () => {
    const v = await fx.mkVariant('g1', { stock: 3 });
    const { order } = await placeGuestOrder(fx, [[v.id, 2]]);
    expect(await stockOf(v.id)).toBe(1);
    const res = await cancel(order.code, { phone: '090 123 4567', reason: 'Không cần nữa' });
    expect(res.status).toBe(200);
    expect(dataOf(res)).toMatchObject({ status: 'CANCELLED', canCancel: false });
    // Không lộ dữ liệu cá nhân (response rút gọn như /orders/track)
    const raw = JSON.stringify(res.body);
    expect(order.contact.email).toBeTruthy();
    expect(raw).not.toContain(order.contact.email);
    expect(raw).not.toContain('901234567');
    expect(raw).not.toContain(order.shippingAddress.fullName);
    expect(raw).not.toContain(order.shippingAddress.line1);
    expect(await stockOf(v.id)).toBe(3);
    const mv = await prisma.inventoryMovement.findFirstOrThrow({
      where: { variantId: v.id, reason: 'ORDER_RELEASE' },
    });
    expect(mv.actorId).toBeNull();
  });

  it('mã đơn viết thường và SĐT +84 vẫn khớp', async () => {
    const v = await fx.mkVariant('g2');
    const { order } = await placeGuestOrder(fx, [[v.id, 1]]);
    const res = await cancel((order.code as string).toLowerCase(), { phone: '+84901234567' });
    expect(res.status).toBe(200);
  });

  it('sai SĐT -> 404 (cùng message với không tồn tại), đơn không đổi', async () => {
    const v = await fx.mkVariant('g3');
    const { order } = await placeGuestOrder(fx, [[v.id, 1]]);
    const wrong = await cancel(order.code, { phone: '0912345678' });
    const missing = await cancel('BB-261111-ZZZZ', { phone: '0901234567' });
    expect(wrong.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(errOf(wrong).message).toBe(errOf(missing).message);
    expect((await prisma.order.findUniqueOrThrow({ where: { code: order.code } })).status).toBe(
      'PENDING',
    );
  });

  it('thiếu hoặc sai định dạng phone -> 400 field phone', async () => {
    const v = await fx.mkVariant('g4');
    const { order } = await placeGuestOrder(fx, [[v.id, 1]]);
    for (const body of [{}, { phone: '123' }]) {
      const res = await cancel(order.code, body);
      expect(res.status).toBe(400);
      expect(errOf(res).code).toBe('VALIDATION_ERROR');
      expect(errOf(res).details).toEqual([{ field: 'phone', message: expect.any(String) }]);
    }
  });

  it('không đăng nhập hủy đơn của user dù đúng SĐT -> 404', async () => {
    const u = await fx.mkUser('g5');
    const v = await fx.mkVariant('g5');
    const order = await placeUserOrder(fx, u, [[v.id, 1]]);
    const res = await cancel(order.code, { phone: '0912345678' });
    expect(res.status).toBe(404);
  });
});

describe('POST /orders/:code/cancel - rate limit', () => {
  it('guest bị 429 + Retry-After; request có Bearer không bị tính', async () => {
    const limited = createApp({ ...BIG, guestCancelRateLimit: 2 });
    const u = await fx.mkUser('r1');
    const post = (auth?: Record<string, string>) => {
      let r = request(limited).post(`${API}/orders/BB-261111-ZZZZ/cancel`).set('Origin', ORIGIN);
      if (auth) r = r.set(auth);
      return r.send({ phone: '0901234567' });
    };
    expect((await post()).status).toBe(404);
    expect((await post()).status).toBe(404);
    const blocked = await post();
    expect(blocked.status).toBe(429);
    expect(errOf(blocked).code).toBe('RATE_LIMITED');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    for (let i = 0; i < 5; i++) expect((await post(u.who.auth)).status).toBe(404);
  });
});
