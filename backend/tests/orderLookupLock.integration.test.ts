import type { Express } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { PaymentConfig } from '../src/config/payments.js';
import { prisma } from '../src/lib/prisma.js';
import { createFixtures, dataOf, errOf } from './checkoutHelpers.js';
import { placeGuestOrder, placeUserOrder } from './orderTestHelpers.js';

/** D-076: khóa tạm theo mã đơn cho mọi endpoint khách vãng lai xác thực bằng mã đơn + SĐT. */

const PREFIX = 'tm76-';
const BIG = 100_000;
const GOOD = '0901234567'; // placeGuestOrder đặt với '+84 90 123 4567'
const BAD = '0911111111';
const CONFIG = {
  vnpay: null,
  stripe: null,
  bankTransfer: { holdHours: 24 },
} as unknown as PaymentConfig;

let clock = Date.parse('2026-11-24T00:00:00Z');
let app: Express;
const fx = createFixtures(() => app, PREFIX);

interface Endpoint {
  name: string;
  call: (code: string, phone: string) => ReturnType<typeof fx.call>;
}
const ENDPOINTS: Endpoint[] = [
  {
    name: 'GET /orders/track',
    call: (code, phone) => fx.call('get', `/orders/track?${new URLSearchParams({ code, phone })}`),
  },
  {
    name: 'POST /orders/:code/cancel',
    call: (c, phone) => fx.call('post', `/orders/${c}/cancel`, {}, { phone }),
  },
  {
    name: 'GET /orders/:code/bank-transfer',
    call: (c, phone) =>
      fx.call('get', `/orders/${c}/bank-transfer?${new URLSearchParams({ phone })}`),
  },
  {
    name: 'POST /orders/:code/bank-transfer/claim',
    call: (c, phone) => fx.call('post', `/orders/${c}/bank-transfer/claim`, {}, { phone }),
  },
  {
    name: 'POST /payments/vnpay/create',
    call: (code, phone) => fx.call('post', '/payments/vnpay/create', {}, { code, phone }),
  },
  {
    name: 'POST /payments/stripe/create-session',
    call: (code, phone) => fx.call('post', '/payments/stripe/create-session', {}, { code, phone }),
  },
  {
    name: 'POST /payments/momo/create',
    call: (code, phone) => fx.call('post', '/payments/momo/create', {}, { code, phone }),
  },
];
const [TRACK, CANCEL, BT_GET, BT_CLAIM, PAY_VNPAY] = ENDPOINTS as [
  Endpoint,
  Endpoint,
  Endpoint,
  Endpoint,
  Endpoint,
];

beforeAll(async () => {
  app = createApp({
    generalRateLimit: BIG,
    authRateLimit: BIG,
    couponRateLimit: BIG,
    quoteRateLimit: BIG,
    orderRateLimit: BIG,
    trackRateLimit: BIG,
    guestCancelRateLimit: BIG,
    bankTransferRateLimit: BIG,
    paymentCreateRateLimit: BIG,
    paymentConfig: CONFIG,
    orderLookupNow: () => clock,
  });
  await fx.setup();
});
afterAll(async () => {
  await fx.restoreSettings();
  await fx.clean();
  await prisma.$disconnect();
});
beforeEach(() => {
  clock += 3_600_000; // mọi khóa của test trước đã hết hạn
});

describe.each(ENDPOINTS)('$name', (ep) => {
  it('5 lần sai SĐT -> 429 ORDER_LOOKUP_LOCKED kể cả khi SĐT đúng; mở khóa đúng sau 15 phút', async () => {
    const v = await fx.mkVariant('lk', { stock: 50 });
    const { order } = await placeGuestOrder(fx, [[v.id, 1]]);
    const code = order.code as string;
    for (let i = 0; i < 5; i++) {
      const r = await ep.call(code, BAD);
      expect(r.status, `lần ${i + 1}`).toBe(404);
    }
    const locked = await ep.call(code, GOOD);
    expect(locked.status).toBe(429);
    expect(errOf(locked).code).toBe('ORDER_LOOKUP_LOCKED');
    const wait = (errOf(locked).details as { retryAfterSec: number }).retryAfterSec;
    expect(wait).toBe(900);
    expect(locked.headers['retry-after']).toBe('900');
    expect(locked.headers['cache-control']).toBe('no-store');
    expect(errOf(locked).message).toMatch(/thử lại/i);

    clock += 15 * 60_000 - 1;
    expect((await ep.call(code, GOOD)).status).toBe(429);
    clock += 1;
    const after = await ep.call(code, GOOD);
    expect([404, 429]).not.toContain(after.status);
  });

  it('mã không tồn tại: cùng hành vi (404 x5 rồi 429), không lộ đơn có hay không', async () => {
    const code = `BB-9${String(clock % 100000).padStart(5, '0')}-ZZZZ`;
    for (let i = 0; i < 5; i++) expect((await ep.call(code, BAD)).status).toBe(404);
    const locked = await ep.call(code, BAD);
    expect(locked.status).toBe(429);
    expect(errOf(locked).code).toBe('ORDER_LOOKUP_LOCKED');
  });
});

describe('hành vi chung của khóa', () => {
  it('đúng SĐT trước khi khóa xóa bộ đếm (4 sai + 1 đúng + 4 sai chưa khóa)', async () => {
    const v = await fx.mkVariant('reset', { stock: 50 });
    const { order } = await placeGuestOrder(fx, [[v.id, 1]]);
    const code = order.code as string;
    for (let i = 0; i < 4; i++) expect((await TRACK.call(code, BAD)).status).toBe(404);
    expect((await TRACK.call(code, GOOD)).status).toBe(200);
    for (let i = 0; i < 4; i++) expect((await TRACK.call(code, BAD)).status).toBe(404);
    expect((await TRACK.call(code, GOOD)).status).toBe(200);
  });

  it('lần sai trên các endpoint khác nhau cộng dồn theo cùng mã đơn (kể cả chữ thường)', async () => {
    const v = await fx.mkVariant('mix', { stock: 50 });
    const { order } = await placeGuestOrder(fx, [[v.id, 1]]);
    const code = order.code as string;
    await TRACK.call(code, BAD);
    await CANCEL.call(code.toLowerCase(), BAD);
    await BT_GET.call(code, BAD);
    await BT_CLAIM.call(code, BAD);
    await PAY_VNPAY.call(code, BAD);
    expect((await TRACK.call(code, GOOD)).status).toBe(429);
  });

  it('khóa một mã không ảnh hưởng đơn khác', async () => {
    const v = await fx.mkVariant('iso', { stock: 50 });
    const a = (await placeGuestOrder(fx, [[v.id, 1]])).order.code as string;
    const b = (await placeGuestOrder(fx, [[v.id, 1]])).order.code as string;
    for (let i = 0; i < 5; i++) await TRACK.call(a, BAD);
    expect((await TRACK.call(a, GOOD)).status).toBe(429);
    expect((await TRACK.call(b, GOOD)).status).toBe(200);
  });

  it('SĐT sai định dạng (400) không bị tính là lần dò', async () => {
    const v = await fx.mkVariant('fmt', { stock: 50 });
    const { order } = await placeGuestOrder(fx, [[v.id, 1]]);
    const code = order.code as string;
    for (let i = 0; i < 8; i++) expect((await CANCEL.call(code, 'abc')).status).toBe(400);
    expect((await TRACK.call(code, GOOD)).status).toBe(200);
  });

  it('người dùng đăng nhập xem đơn của mình bằng token, không bị khóa theo mã', async () => {
    const u = await fx.mkUser('own');
    const v = await fx.mkVariant('own', { stock: 50 });
    const placed = await placeUserOrder(fx, u, [[v.id, 1]]);
    const code = placed.code as string;
    for (let i = 0; i < 5; i++) await TRACK.call(code, BAD); // ai đó dò mã này như khách
    expect((await TRACK.call(code, BAD)).status).toBe(429);
    const mine = await fx.call('get', `/orders/${code}`, u.who);
    expect(mine.status).toBe(200);
    expect(dataOf(mine).code).toBe(code);
  });
});
