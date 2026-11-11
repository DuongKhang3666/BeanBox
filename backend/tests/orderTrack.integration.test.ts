import type { Express } from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { API, ORIGIN } from './authHelpers.js';
import { createFixtures, dataOf, errOf } from './checkoutHelpers.js';
import { placeGuestOrder, placeUserOrder } from './orderTestHelpers.js';

const PREFIX = 'tm3t-';
let app: Express;
const fx = createFixtures(() => app, PREFIX);
const BIG = {
  generalRateLimit: 100_000,
  authRateLimit: 100_000,
  guestCancelRateLimit: 100_000,
  couponRateLimit: 100_000,
  quoteRateLimit: 100_000,
  orderRateLimit: 100_000,
};

const track = (query: Record<string, string>) =>
  fx.call('get', `/orders/track?${new URLSearchParams(query)}`);

beforeAll(async () => {
  app = createApp({ ...BIG, trackRateLimit: 100_000 });
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

describe('GET /orders/track', () => {
  it('đúng code + SĐT (nhiều dạng) -> 200, chỉ các trường §9.5, không lộ dữ liệu cá nhân', async () => {
    const v = await fx.mkVariant('t1', { price: 100000 });
    const email = fx.nextEmail();
    const { order } = await placeGuestOrder(fx, [[v.id, 2]], {
      contact: { email, phone: '0901234567' },
      note: 'ghi chú riêng tư',
    });
    for (const [code, phone] of [
      [order.code, '0901234567'],
      [(order.code as string).toLowerCase(), '+84 901 234 567'],
      [`  ${order.code}  `, '090-123-4567'],
    ] as const) {
      const res = await track({ code, phone });
      expect(res.status).toBe(200);
      const d = dataOf(res);
      expect(Object.keys(d).sort()).toEqual(
        [
          'canCancel',
          'canPay',
          'cancelReason',
          'carrier',
          'code',
          'createdAt',
          'discountTotal',
          'expiresAt',
          'grandTotal',
          'history',
          'items',
          'paymentMethod',
          'paymentStatus',
          'shippingAddress',
          'shippingDiscount',
          'shippingFee',
          'shippingMethod',
          'status',
          'subtotal',
          'trackingNumber',
        ].sort(),
      );
      expect(d).toMatchObject({
        code: order.code,
        status: 'PENDING',
        subtotal: 200000,
        grandTotal: order.grandTotal,
        canCancel: true,
        canPay: false,
        expiresAt: null,
        shippingAddress: { provinceName: 'Thành phố Hồ Chí Minh', wardName: expect.any(String) },
      });
      expect(Object.keys(d.shippingAddress)).toEqual(['provinceName', 'wardName']);
      expect(d.items[0]).toEqual({
        productName: expect.any(String),
        variantName: expect.any(String),
        imageUrl: '/uploads/t1.jpg',
        unitPrice: 100000,
        quantity: 2,
        lineTotal: 200000,
      });
      expect(Object.keys(d.history[0]).sort()).toEqual(['createdAt', 'fromStatus', 'toStatus']);

      const json = JSON.stringify(res.body);
      for (const secret of [
        email,
        '0901234567',
        'Nguyễn Văn An',
        '12 Lê Lợi',
        'ghi chú riêng tư',
        'userId',
        order.items[0].id,
        order.items[0].sku,
      ]) {
        expect(json).not.toContain(secret);
      }
    }
  });

  it('sai SĐT và code không tồn tại -> cùng 404, cùng message', async () => {
    const v = await fx.mkVariant('t2');
    const { order } = await placeGuestOrder(fx, [[v.id, 1]]);
    const wrong = await track({ code: order.code, phone: '0912345678' });
    const missing = await track({ code: 'BB-261111-ZZZZ', phone: '0901234567' });
    expect(wrong.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(errOf(wrong)).toEqual(errOf(missing));
  });

  it('code sai định dạng -> 404; phone sai định dạng hoặc thiếu -> 400', async () => {
    const bad = await track({ code: 'abc', phone: '0901234567' });
    expect(bad.status).toBe(404);
    const badPhone = await track({ code: 'BB-261111-ZZZZ', phone: '12345' });
    expect(badPhone.status).toBe(400);
    expect(errOf(badPhone).code).toBe('VALIDATION_ERROR');
    expect(errOf(badPhone).details).toEqual([{ field: 'phone', message: expect.any(String) }]);
    const noPhone = await track({ code: 'BB-261111-ZZZZ' });
    expect(noPhone.status).toBe(400);
    const noCode = await track({ phone: '0901234567' });
    expect(noCode.status).toBe(400);
  });

  it('đơn của user tra cứu được bằng SĐT, canCancel false; đơn guest PENDING true', async () => {
    const u = await fx.mkUser('t3');
    const v = await fx.mkVariant('t3', { stock: 10 });
    const userOrder = await placeUserOrder(fx, u, [[v.id, 1]]);
    const res = await track({ code: userOrder.code, phone: '0912345678' });
    expect(res.status).toBe(200);
    expect(dataOf(res).canCancel).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain(u.email);

    const { order: guest } = await placeGuestOrder(fx, [[v.id, 1]]);
    expect(dataOf(await track({ code: guest.code, phone: '0901234567' })).canCancel).toBe(true);

    await prisma.order.update({ where: { code: guest.code }, data: { status: 'PROCESSING' } });
    expect(dataOf(await track({ code: guest.code, phone: '0901234567' })).canCancel).toBe(false);
  });

  it('đơn đã hủy: có cancelReason và history, canCancel false', async () => {
    const v = await fx.mkVariant('t4');
    const { order } = await placeGuestOrder(fx, [[v.id, 1]]);
    const c = await fx.call(
      'post',
      `/orders/${order.code}/cancel`,
      {},
      {
        phone: '0901234567',
        reason: 'Đổi ý',
      },
    );
    expect(c.status).toBe(200);
    const d = dataOf(await track({ code: order.code, phone: '0901234567' }));
    expect(d).toMatchObject({ status: 'CANCELLED', cancelReason: 'Đổi ý', canCancel: false });
    expect(d.history).toHaveLength(2);
  });

  it('không bị route /orders/:code nuốt (không cần đăng nhập)', async () => {
    const res = await track({ code: 'BB-261111-ZZZZ', phone: '0901234567' });
    expect(res.status).toBe(404); // không phải 401
  });

  it('rate limit riêng -> 429 có Retry-After', async () => {
    const limited = createApp({ ...BIG, trackRateLimit: 2 });
    const get = () =>
      request(limited)
        .get(`${API}/orders/track?code=BB-261111-ZZZZ&phone=0901234567`)
        .set('Origin', ORIGIN);
    expect((await get()).status).toBe(404);
    expect((await get()).status).toBe(404);
    const blocked = await get();
    expect(blocked.status).toBe(429);
    expect(errOf(blocked).code).toBe('RATE_LIMITED');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });
});
