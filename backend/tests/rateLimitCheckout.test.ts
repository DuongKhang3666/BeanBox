import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

// D-011: limiter chạy trước optionalAuth/validate nên không cần DB; body rỗng/Bearer giả vẫn bị tính.
const P = '/api/v1';
const COUPON = `${P}/cart/apply-coupon`;
const QUOTE = `${P}/checkout/quote`;
const ORDERS = `${P}/orders`;
const SECRET = process.env.INTERNAL_API_SECRET!;
const BIG = {
  generalRateLimit: 100_000,
  authRateLimit: 100_000,
  couponRateLimit: 100_000,
  quoteRateLimit: 100_000,
  orderRateLimit: 100_000,
};

type App = ReturnType<typeof createApp>;
const hit = (app: App, url: string, headers: Record<string, string> = {}) =>
  request(app).post(url).set(headers).send({});

async function expectLimitedAfter(app: App, url: string, n: number, headers = {}) {
  for (let i = 0; i < n; i++) expect((await hit(app, url, headers)).status).not.toBe(429);
  const r = await hit(app, url, headers);
  expect(r.status).toBe(429);
  expect(r.body.error.code).toBe('RATE_LIMITED');
  expect(Number(r.headers['retry-after'])).toBeGreaterThan(0);
  expect(r.body.error.details.retryAfterSec).toBeGreaterThan(0);
}

describe('rate limit coupon / quote / orders (D-011)', () => {
  it('POST /cart/apply-coupon -> 429 sau N request, có Retry-After', async () => {
    await expectLimitedAfter(createApp({ ...BIG, couponRateLimit: 2 }), COUPON, 2);
  });

  it('POST /checkout/quote -> 429 sau N request, có Retry-After', async () => {
    await expectLimitedAfter(createApp({ ...BIG, quoteRateLimit: 2 }), QUOTE, 2);
  });

  it('POST /orders -> 429 sau N request, có Retry-After', async () => {
    await expectLimitedAfter(createApp({ ...BIG, orderRateLimit: 2 }), ORDERS, 2);
  });

  it('mặc định: coupon 10, quote 30, orders 10', async () => {
    const app = createApp({ generalRateLimit: 100_000, authRateLimit: 100_000 });
    await expectLimitedAfter(app, COUPON, 10);
    await expectLimitedAfter(app, ORDERS, 10);
    await expectLimitedAfter(app, QUOTE, 30);
  });

  it('store tách biệt: vượt coupon không ảnh hưởng orders/quote và ngược lại', async () => {
    const app = createApp({ ...BIG, couponRateLimit: 1, orderRateLimit: 1, quoteRateLimit: 1 });
    await hit(app, COUPON);
    expect((await hit(app, COUPON)).status).toBe(429);
    expect((await hit(app, ORDERS)).status).not.toBe(429);
    expect((await hit(app, QUOTE)).status).not.toBe(429);
    expect((await hit(app, ORDERS)).status).toBe(429);
    expect((await hit(app, QUOTE)).status).toBe(429);
  });

  it('request có Bearer vẫn bị tính', async () => {
    const h = { Authorization: 'Bearer token-gia' };
    await expectLimitedAfter(createApp({ ...BIG, couponRateLimit: 2 }), COUPON, 2, h);
    await expectLimitedAfter(createApp({ ...BIG, quoteRateLimit: 2 }), QUOTE, 2, h);
    await expectLimitedAfter(createApp({ ...BIG, orderRateLimit: 2 }), ORDERS, 2, h);
  });

  it('X-Internal-Secret đúng vẫn bị tính', async () => {
    const h = { 'X-Internal-Secret': SECRET };
    await expectLimitedAfter(createApp({ ...BIG, orderRateLimit: 2 }), ORDERS, 2, h);
  });
});
