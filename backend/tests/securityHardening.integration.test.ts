import { createHmac } from 'node:crypto';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SignJWT } from 'jose';
import pino from 'pino';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { parseEnv, parseTrustProxy } from '../src/config/env.js';
import { logger } from '../src/lib/logger.js';
import { prisma } from '../src/lib/prisma.js';
import { ACCESS_TOKEN_AUDIENCE, ACCESS_TOKEN_ISSUER } from '../src/lib/tokens.js';
import { signVnpay } from '../src/modules/payments/vnpay.js';
import { API, bearer, ORIGIN, PW, registerUser, rtOf, setCookies } from './authHelpers.js';
import { createFixtures, dataOf, errOf, type Who } from './checkoutHelpers.js';

/** M6 (D-020): kiểm tra cứng hóa: rate limit, header, cookie, CORS, upload, chữ ký, JWT, log, mass assignment. */

const PREFIX = 'tm6x-';
const SIGNED_SID = 'sid-hardening-test';
const BIG = 100_000;
const ALL_BIG = {
  generalRateLimit: BIG,
  authRateLimit: BIG,
  guestCancelRateLimit: BIG,
  trackRateLimit: BIG,
  couponRateLimit: BIG,
  quoteRateLimit: BIG,
  orderRateLimit: BIG,
  uploadRateLimit: BIG,
  reviewRateLimit: BIG,
  paymentCreateRateLimit: BIG,
  paymentReturnRateLimit: BIG,
  paymentSyncRateLimit: BIG,
};
const WHSEC = 'whsec_test_security_0123456789';
const VNP_SECRET = 'vnpay-test-secret-0123456789';

let app: Express;
const fx = createFixtures(() => app, PREFIX);
let staff: { id: string; who: Who };
let customer: { id: string; email: string; who: Who };
let uploadsDir = '';

beforeAll(async () => {
  uploadsDir = await mkdtemp(path.join(tmpdir(), 'bb-sec-'));
  app = createApp({
    ...ALL_BIG,
    uploadsDir,
    paymentConfig: {
      vnpay: {
        tmnCode: 'TESTCODE',
        hashSecret: VNP_SECRET,
        paymentUrl: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
        returnUrl: 'http://localhost:3000/thanh-toan/ket-qua?provider=vnpay',
      },
      stripe: { secretKey: 'sk_test_x', webhookSecret: WHSEC },
    },
  });
  await fx.setup();
  staff = await fx.mkUser('staff');
  await prisma.user.update({ where: { id: staff.id }, data: { role: 'STAFF' } });
  customer = await fx.mkUser('cust');
  // Phiên có thật cho test token tự ký (access token phải gắn với một refresh token còn sống).
  await prisma.refreshToken.create({
    data: {
      userId: customer.id,
      familyId: SIGNED_SID,
      tokenHash: `${PREFIX}signed-sid-${customer.id}`,
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  });
});
afterAll(async () => {
  await rm(uploadsDir, { recursive: true, force: true });
  await fx.clean();
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------------------------
describe('rate limit: mỗi nhóm có limiter và store riêng', () => {
  const post = (a: Express, p: string, body: object = {}, headers: Record<string, string> = {}) =>
    request(a).post(`${API}${p}`).set(headers).send(body);

  it('login/register/forgot/reset/change-password: mỗi route bị 429 sau khi hết hạn mức', async () => {
    const routes = [
      '/auth/login',
      '/auth/register',
      '/auth/forgot-password',
      '/auth/reset-password',
      '/auth/change-password',
    ];
    for (const p of routes) {
      const limited = createApp({ ...ALL_BIG, authRateLimit: 2 });
      const codes: number[] = [];
      for (let i = 0; i < 3; i++) codes.push((await post(limited, p)).status);
      expect(codes.slice(0, 2), p).not.toContain(429);
      expect(codes[2], p).toBe(429);
    }
  });

  it('trả 429 đúng định dạng: RATE_LIMITED + Retry-After + details.retryAfterSec', async () => {
    const limited = createApp({ ...ALL_BIG, authRateLimit: 1 });
    await post(limited, '/auth/login');
    const res = await post(limited, '/auth/login');
    expect(res.status).toBe(429);
    expect(errOf(res).code).toBe('RATE_LIMITED');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect((errOf(res).details as { retryAfterSec: number }).retryAfterSec).toBe(
      Number(res.headers['retry-after']),
    );
  });

  it('mỗi limiter còn lại có hạn mức riêng và không ăn chung store với nhau', async () => {
    // Mọi limiter = 1; mỗi route gọi 2 lần: lần 1 KHÔNG được 429 (kể cả sau khi limiter khác đã
    // cạn), lần 2 phải 429. Route nào dùng chung store sẽ lỗi ở lần 1.
    const one = createApp({
      ...ALL_BIG,
      authRateLimit: 1,
      guestCancelRateLimit: 1,
      trackRateLimit: 1,
      couponRateLimit: 1,
      quoteRateLimit: 1,
      orderRateLimit: 1,
      uploadRateLimit: 1,
      reviewRateLimit: 1,
      paymentCreateRateLimit: 1,
      paymentReturnRateLimit: 1,
      paymentSyncRateLimit: 1,
    });
    const s = { auth: staff.who.auth! };
    const cases: Array<[string, () => request.Test]> = [
      ['login', () => request(one).post(`${API}/auth/login`).send({})],
      ['guest cancel', () => request(one).post(`${API}/orders/BB-261111-ZZZZ/cancel`).send({})],
      ['track', () => request(one).get(`${API}/orders/track?code=a&phone=0912345678`)],
      ['apply-coupon', () => request(one).post(`${API}/cart/apply-coupon`).send({})],
      ['quote', () => request(one).post(`${API}/checkout/quote`).send({})],
      ['orders', () => request(one).post(`${API}/orders`).send({})],
      ['payments create', () => request(one).post(`${API}/payments/vnpay/create`).send({})],
      ['payments return', () => request(one).get(`${API}/payments/vnpay/return`)],
      ['payments sync', () => request(one).post(`${API}/payments/stripe/sync`).send({})],
      [
        'review write',
        () => request(one).post(`${API}/products/x/reviews`).set(s.auth).send({ rating: 5 }),
      ],
      [
        'upload',
        () => request(one).post(`${API}/admin/uploads`).set(s.auth).set('Content-Type', 'text/x'),
      ],
    ];
    for (const [name, make] of cases) {
      const first = await make();
      expect(first.status, `${name} lần 1`).not.toBe(429);
      const second = await make();
      expect(second.status, `${name} lần 2`).toBe(429);
      expect(second.headers['retry-after'], name).toBeDefined();
    }
  });

  it('guest cancel: request có Authorization không bị tính vào hạn mức guest', async () => {
    const limited = createApp({ ...ALL_BIG, guestCancelRateLimit: 1 });
    for (let i = 0; i < 3; i++) {
      const res = await request(limited)
        .post(`${API}/orders/BB-261111-ZZZZ/cancel`)
        .set(bearer('a.b.c'))
        .send({});
      expect(res.status).toBe(401);
    }
  });

  it('X-Internal-Secret đúng KHÔNG miễn limiter nhạy cảm', async () => {
    const limited = createApp({ ...ALL_BIG, authRateLimit: 1 });
    const h = { 'X-Internal-Secret': process.env.INTERNAL_API_SECRET ?? '' };
    await post(limited, '/auth/login', {}, h);
    expect((await post(limited, '/auth/login', {}, h)).status).toBe(429);
  });
});

// ---------------------------------------------------------------------------------------------
describe('header bảo mật, CORS, body limit, lỗi 500', () => {
  it('helmet: nosniff, frameguard, không X-Powered-By (API, 404 và /uploads)', async () => {
    for (const p of [`${API}/health`, `${API}/khong-co`, '/uploads/khong-co.jpg']) {
      const res = await request(app).get(p);
      expect(res.headers['x-content-type-options'], p).toBe('nosniff');
      expect(res.headers['x-frame-options'], p).toBe('SAMEORIGIN');
      expect(res.headers['x-powered-by'], p).toBeUndefined();
      expect(res.headers['strict-transport-security'], p).toBeDefined();
      expect(res.headers['referrer-policy'], p).toBe('no-referrer');
    }
  });

  it('CORS: chỉ origin trong FRONTEND_ORIGINS; origin lạ/gần giống không được phản hồi', async () => {
    const ok = await request(app).get(`${API}/health`).set('Origin', ORIGIN);
    expect(ok.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(ok.headers['access-control-allow-credentials']).toBe('true');
    for (const o of [
      'https://evil.example',
      `${ORIGIN}.evil.example`,
      `${ORIGIN}/`,
      'null',
      'http://localhost:3001',
    ]) {
      const res = await request(app).get(`${API}/health`).set('Origin', o);
      expect(res.headers['access-control-allow-origin'], o).toBeUndefined();
    }
    const pre = await request(app)
      .options(`${API}/cart`)
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'DELETE');
    expect(pre.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('refresh/logout: Origin phải khớp chính xác (không prefix, không dấu / cuối)', async () => {
    for (const o of [`${ORIGIN}/`, `${ORIGIN}.evil.example`, 'http://localhost:3001', '']) {
      for (const p of ['refresh', 'logout']) {
        const res = await request(app).post(`${API}/auth/${p}`).set('Origin', o);
        expect(res.status, `${p} ${o}`).toBe(403);
        expect(errOf(res).code).toBe('INVALID_ORIGIN');
      }
    }
  });

  it('body JSON > 100kb -> 413; JSON hỏng -> 400; không lộ stack', async () => {
    const big = JSON.stringify({ email: 'a@b.co', password: 'x'.repeat(101 * 1024) });
    const res = await request(app)
      .post(`${API}/auth/login`)
      .set('Content-Type', 'application/json')
      .send(big);
    expect(res.status).toBe(413);
    expect(JSON.stringify(res.body)).not.toMatch(/node_modules|\sat\s/);

    const bad = await request(app)
      .post(`${API}/auth/login`)
      .set('Content-Type', 'application/json')
      .send('{"email":');
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body)).not.toMatch(/node_modules|SyntaxError/);
  });

  it('lỗi không lường trước trên app thật -> 500 chuẩn, không lộ message/stack nội bộ', async () => {
    const spy = vi
      .spyOn(prisma.category, 'findMany')
      .mockRejectedValue(new Error('SECRET-DB-DETAIL postgres://u:p@host/db'));
    try {
      const res = await request(app).get(`${API}/categories`);
      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        error: { code: 'INTERNAL_ERROR', message: expect.any(String) },
      });
      const text = JSON.stringify(res.body);
      expect(text).not.toContain('SECRET-DB-DETAIL');
      expect(text).not.toMatch(/postgres:|node_modules|\.ts:/);
    } finally {
      spy.mockRestore();
    }
  });

  it('trust proxy không bao giờ là true; "true" bị từ chối khi cấu hình', () => {
    expect(app.get('trust proxy')).not.toBe(true);
    expect(() => parseTrustProxy('true')).toThrow();
    expect(() => parseTrustProxy(' TRUE ')).toThrow();
    expect(parseTrustProxy('1')).toBe(1);
    expect(parseTrustProxy('false')).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
describe('cookie refresh bb_rt', () => {
  it('httpOnly, SameSite=Strict, Path=/api/v1/auth; token không nằm trong body', async () => {
    const u = await registerUser(app, `${PREFIX}cookie@example.test`);
    expect(u.res.status).toBe(201);
    const line = setCookies(u.res).find((c) => c.startsWith('bb_rt='))!;
    expect(line).toMatch(/;\s*HttpOnly/i);
    expect(line).toMatch(/;\s*SameSite=Strict/i);
    expect(line).toMatch(/;\s*Path=\/api\/v1\/auth(;|$)/);
    expect(line).toMatch(/;\s*Max-Age=\d+|;\s*Expires=/i);
    const rt = rtOf(u.res)!;
    expect(JSON.stringify(u.res.body)).not.toContain(rt);
    expect(u.res.body.data).not.toHaveProperty('refreshToken');

    // Xóa cookie dùng cùng thuộc tính
    const out = await request(app)
      .post(`${API}/auth/logout`)
      .set('Origin', ORIGIN)
      .set('Cookie', `bb_rt=${rt}`);
    expect(out.status).toBe(204);
    const clear = setCookies(out).find((c) => c.startsWith('bb_rt='))!;
    expect(clear).toMatch(/Path=\/api\/v1\/auth/);
    expect(clear).toMatch(/HttpOnly/i);
    expect(clear).toMatch(/SameSite=Strict/i);
  });

  it('Secure: bật mặc định khi NODE_ENV=production, tắt ở development', () => {
    const base = {
      DATABASE_URL: 'postgresql://x',
      JWT_ACCESS_SECRET: 'x'.repeat(40),
    } as unknown as NodeJS.ProcessEnv;
    expect(
      parseEnv({ ...base, NODE_ENV: 'production', INTERNAL_API_SECRET: 'x'.repeat(40) })
        .COOKIE_SECURE,
    ).toBe(true);
    expect(parseEnv({ ...base, NODE_ENV: 'development' }).COOKIE_SECURE).toBe(false);
  });

  it('refresh token cũ dùng lại -> 401 và cả family bị thu hồi', async () => {
    const u = await registerUser(app, `${PREFIX}reuse@example.test`);
    const rt1 = u.rt!;
    const r1 = await request(app)
      .post(`${API}/auth/refresh`)
      .set('Origin', ORIGIN)
      .set('Cookie', `bb_rt=${rt1}`);
    expect(r1.status).toBe(200);
    const rt2 = rtOf(r1)!;
    expect(rt2).not.toBe(rt1);
    const replay = await request(app)
      .post(`${API}/auth/refresh`)
      .set('Origin', ORIGIN)
      .set('Cookie', `bb_rt=${rt1}`);
    expect(replay.status).toBe(401);
    const after = await request(app)
      .post(`${API}/auth/refresh`)
      .set('Origin', ORIGIN)
      .set('Cookie', `bb_rt=${rt2}`);
    expect(after.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------------------------
describe('JWT và vai trò', () => {
  const secret = () => new TextEncoder().encode(process.env.JWT_ACCESS_SECRET);
  const sign = (
    over: { alg?: string; iss?: string; aud?: string; exp?: string; sid?: string | null } = {},
  ) => {
    const payload: Record<string, unknown> = { role: 'ADMIN' };
    if (over.sid !== null) payload.sid = over.sid ?? SIGNED_SID;
    return new SignJWT(payload)
      .setProtectedHeader({ alg: over.alg ?? 'HS256' })
      .setSubject(customer.id)
      .setIssuer(over.iss ?? ACCESS_TOKEN_ISSUER)
      .setAudience(over.aud ?? ACCESS_TOKEN_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(over.exp ?? '5m')
      .sign(secret());
  };
  const me = (t: string) => request(app).get(`${API}/me`).set(bearer(t));

  it('token hợp lệ được chấp nhận; sai alg/iss/aud/hết hạn/thiếu sid bị từ chối', async () => {
    expect((await me(await sign())).status).toBe(200);
    for (const over of [
      { alg: 'HS512' },
      { alg: 'HS384' },
      { iss: 'someone-else' },
      { aud: 'other-app' },
      { exp: '-1m' },
      { sid: null },
    ]) {
      expect((await me(await sign(over))).status, JSON.stringify(over)).toBe(401);
    }
  });

  it('claim role trong token bị bỏ qua: CUSTOMER mang token "role: ADMIN" vẫn 403 ở admin', async () => {
    const res = await request(app)
      .get(`${API}/admin/orders`)
      .set(bearer(await sign()));
    expect(res.status).toBe(403);
  });

  it('role/status đọc lại từ DB mỗi request (đổi quyền, khóa tài khoản có hiệu lực ngay)', async () => {
    const u = await fx.mkUser('rolecheck');
    const adminOrders = () => request(app).get(`${API}/admin/orders`).set(u.who.auth!);
    expect((await adminOrders()).status).toBe(403);
    await prisma.user.update({ where: { id: u.id }, data: { role: 'ADMIN' } });
    expect((await adminOrders()).status).toBe(200);
    await prisma.user.update({ where: { id: u.id }, data: { role: 'CUSTOMER' } });
    expect((await adminOrders()).status).toBe(403);
    await prisma.user.update({ where: { id: u.id }, data: { status: 'DISABLED' } });
    const res = await adminOrders();
    expect(res.status).toBe(403);
    expect(errOf(res).code).toBe('ACCOUNT_DISABLED');
    await prisma.user.delete({ where: { id: u.id } });
    expect((await adminOrders()).status).toBe(401);
  });
});

// ---------------------------------------------------------------------------------------------
describe('mass assignment', () => {
  it('PATCH /me không đổi được role/status/email/emailVerifiedAt', async () => {
    const before = await prisma.user.findUniqueOrThrow({ where: { id: customer.id } });
    const res = await request(app).patch(`${API}/me`).set(customer.who.auth!).send({
      fullName: 'Tên Mới Hợp Lệ',
      role: 'ADMIN',
      status: 'DISABLED',
      email: 'hacker@example.test',
      emailVerifiedAt: new Date().toISOString(),
      passwordHash: 'x',
      id: 'other',
    });
    expect(res.status).toBe(200);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: customer.id } });
    expect(after.fullName).toBe('Tên Mới Hợp Lệ');
    expect(after.role).toBe('CUSTOMER');
    expect(after.status).toBe(before.status);
    expect(after.email).toBe(before.email);
    expect(after.emailVerifiedAt).toEqual(before.emailVerifiedAt);
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(after.id).toBe(before.id);

    // Chỉ có trường đặc quyền -> 400, không âm thầm "thành công"
    const only = await request(app)
      .patch(`${API}/me`)
      .set(customer.who.auth!)
      .send({ role: 'ADMIN' });
    expect(only.status).toBe(400);
  });

  it('đăng ký với role/status thừa vẫn tạo CUSTOMER ACTIVE', async () => {
    const email = `${PREFIX}mass@example.test`;
    const res = await request(app)
      .post(`${API}/auth/register`)
      .send({ fullName: 'Nguyễn Văn An', email, password: PW, role: 'ADMIN', status: 'DISABLED' });
    expect(res.status).toBe(201);
    const row = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(row.role).toBe('CUSTOMER');
    expect(row.status).toBe('ACTIVE');
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$argon2/);
  });

  it('tạo địa chỉ với userId của người khác -> vẫn thuộc người gọi', async () => {
    const res = await request(app).post(`${API}/me/addresses`).set(customer.who.auth!).send({
      fullName: 'Trần Thị Bình',
      phone: '0912345678',
      provinceCode: '79',
      wardCode: '25747',
      line1: '45 Nguyễn Huệ',
      userId: staff.id,
    });
    expect(res.status).toBe(201);
    const row = await prisma.address.findUniqueOrThrow({ where: { id: dataOf(res).id as string } });
    expect(row.userId).toBe(customer.id);
  });

  it('response user không lộ passwordHash / token', async () => {
    const res = await request(app).get(`${API}/me`).set(customer.who.auth!);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$argon2|tokenHash/i);
  });
});

// ---------------------------------------------------------------------------------------------
describe('upload và file tĩnh', () => {
  const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
  const PNG = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(64, 2),
  ]);
  const up = (type: string, body: Buffer, who: Who = staff.who) =>
    request(app)
      .post(`${API}/admin/uploads`)
      .set(who.auth ?? {})
      .set('Content-Type', type)
      .send(body);

  it('magic bytes phải khớp Content-Type; SVG/HTML/loại lạ bị từ chối', async () => {
    expect((await up('image/jpeg', PNG)).status).toBe(400);
    expect((await up('image/png', JPEG)).status).toBe(400);
    expect((await up('image/jpeg', Buffer.from('<?php echo 1; ?>'))).status).toBe(400);
    expect((await up('image/svg+xml', Buffer.from('<svg onload=alert(1)/>'))).status).toBe(400);
    expect((await up('text/html', Buffer.from('<script>1</script>'))).status).toBe(400);
    expect((await up('application/octet-stream', JPEG)).status).toBe(400);
    expect((await up('image/jpeg', Buffer.alloc(0))).status).toBe(400);
    expect(await readdir(uploadsDir)).toEqual([]); // chưa có gì được ghi
  });

  it('quá 5 MB -> 413 PAYLOAD_TOO_LARGE', async () => {
    const big = Buffer.concat([JPEG, Buffer.alloc(5 * 1024 * 1024)]);
    const res = await up('image/jpeg', big);
    expect(res.status).toBe(413);
    expect(errOf(res).code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('CUSTOMER 403, khách 401', async () => {
    expect((await up('image/jpeg', JPEG, customer.who)).status).toBe(403);
    expect((await up('image/jpeg', JPEG, {})).status).toBe(401);
  });

  it('tên file ngẫu nhiên, đuôi theo loại thật, phục vụ kèm nosniff', async () => {
    const a = await up('image/jpeg', JPEG);
    const b = await up('image/jpeg', JPEG);
    expect(a.status).toBe(201);
    const urlA = dataOf(a).url as string;
    const urlB = dataOf(b).url as string;
    expect(urlA).toMatch(/^\/uploads\/products\/\d{4}\/\d{2}\/[0-9a-f]{32}\.jpg$/);
    expect(urlA).not.toBe(urlB);

    const get = await request(app).get(urlA);
    expect(get.status).toBe(200);
    expect(get.headers['content-type']).toBe('image/jpeg');
    expect(get.headers['x-content-type-options']).toBe('nosniff');
    expect(get.headers['x-powered-by']).toBeUndefined();
  });

  it('dotfile, thư mục, path traversal -> 404 JSON; không liệt kê thư mục', async () => {
    await writeFile(path.join(uploadsDir, '.secret'), 'bí mật');
    await writeFile(path.join(uploadsDir, 'note.txt'), 'x');
    await mkdir(path.join(uploadsDir, 'sub'), { recursive: true });
    for (const p of [
      '/uploads/.secret',
      '/uploads/',
      '/uploads',
      '/uploads/products',
      '/uploads/sub/',
      '/uploads/..%2f..%2fpackage.json',
      '/uploads/%2e%2e/%2e%2e/package.json',
      '/uploads/..%5c..%5cpackage.json',
      '/uploads/%00.jpg',
    ]) {
      const res = await request(app).get(p);
      expect(res.status, p).toBeGreaterThanOrEqual(400);
      expect(res.status, p).toBeLessThan(500);
      expect(res.text, p).not.toMatch(/bí mật|"name"\s*:\s*"beanbox/);
      expect(res.text, p).not.toMatch(/<a href|Index of/i);
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe('chữ ký webhook / IPN / return', () => {
  const body = JSON.stringify({ id: 'evt_sec', type: 'checkout.session.completed', data: {} });
  const hook = (header?: string, app_: Express = app, raw: string = body) => {
    let r = request(app_)
      .post(`${API}/payments/stripe/webhook`)
      .set('Content-Type', 'application/json');
    if (header) r = r.set('Stripe-Signature', header);
    return r.send(raw);
  };
  const sig = (t: number, raw: string, secret = WHSEC) =>
    `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex')}`;

  it('Stripe webhook: thiếu/sai chữ ký, chữ ký cũ, body bị sửa -> 400 PAYMENT_SIGNATURE_INVALID', async () => {
    const now = Math.floor(Date.now() / 1000);
    const cases: Array<[string, Promise<request.Response>]> = [
      ['thiếu header', hook()],
      ['rác', hook('abc')],
      ['sai secret', hook(sig(now, body, 'whsec_khac'))],
      ['quá hạn', hook(sig(now - 3600, body))],
      ['body bị sửa', hook(sig(now, body), app, body.replace('evt_sec', 'evt_hack'))],
      ['v1 không phải hex 64', hook(`t=${now},v1=zz`)],
    ];
    for (const [name, p] of cases) {
      const res = await p;
      expect(res.status, name).toBe(400);
      expect(errOf(res).code, name).toBe('PAYMENT_SIGNATURE_INVALID');
    }
  });

  it('Stripe webhook: chưa cấu hình secret -> 503, không chấp nhận mọi thứ', async () => {
    const noSecret = createApp({
      ...ALL_BIG,
      paymentConfig: { vnpay: null, stripe: { secretKey: 'sk_test_x', webhookSecret: null } },
    });
    const now = Math.floor(Date.now() / 1000);
    const res = await hook(sig(now, body, ''), noSecret);
    expect(res.status).toBe(503);
  });

  it('Stripe webhook: chữ ký đúng được chấp nhận (sự kiện không khớp Payment thì bỏ qua)', async () => {
    const now = Math.floor(Date.now() / 1000);
    const res = await hook(sig(now, body));
    expect(res.status).toBe(200);
  });

  const vnp = (over: Record<string, string> = {}, secret = VNP_SECRET) => {
    const params: Record<string, string> = {
      vnp_Amount: '1000000',
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
      vnp_TxnRef: 'khong-ton-tai',
      vnp_TransactionNo: '1',
      ...over,
    };
    return { ...params, vnp_SecureHash: signVnpay(params, secret) };
  };

  it('VNPay IPN/return: không có hoặc sai chữ ký bị từ chối, chữ ký giả không tạo thanh toán', async () => {
    const good = vnp();
    const bad = { ...good, vnp_SecureHash: 'a'.repeat(128) };
    const forged = vnp({}, 'secret-khac');
    const noHash = Object.fromEntries(Object.entries(good).filter(([k]) => k !== 'vnp_SecureHash'));
    const tampered = { ...good, vnp_Amount: '1' };
    for (const q of [bad, forged, noHash, tampered]) {
      const ipn = await request(app).get(`${API}/payments/vnpay/ipn`).query(q);
      expect(ipn.status).toBe(200);
      expect(ipn.body.RspCode).toBe('97');
      const ret = await request(app).get(`${API}/payments/vnpay/return`).query(q);
      expect(ret.status).toBe(400);
      expect(errOf(ret).code).toBe('PAYMENT_SIGNATURE_INVALID');
    }
    // Chữ ký đúng nhưng giao dịch không tồn tại -> "Order not found", không lỗi 5xx
    const ok = await request(app).get(`${API}/payments/vnpay/ipn`).query(good);
    expect(ok.body.RspCode).toBe('01');
  });
});

// ---------------------------------------------------------------------------------------------
describe('log không chứa bí mật', () => {
  it('request có Authorization/Cookie/mật khẩu/chữ ký VNPay: dòng log không chứa các giá trị đó', async () => {
    const lines: string[] = [];
    const sym = pino.symbols.streamSym as unknown as keyof typeof logger;
    const L = logger as unknown as Record<symbol | string, unknown>;
    const origStream = L[sym as unknown as symbol];
    const origLevel = logger.level;
    L[sym as unknown as symbol] = { write: (s: string) => lines.push(s) };
    logger.level = 'info';
    const SECRET_PW = 'MatKhauBiMat-ZZZ-999';
    const SECRET_TOKEN = 'TOKEN-BI-MAT-ABC-123';
    const SECRET_SIG = 'CHUKY-BI-MAT-XYZ-456';
    try {
      const logged = createApp({
        ...ALL_BIG,
        paymentConfig: {
          vnpay: {
            tmnCode: 'T',
            hashSecret: VNP_SECRET,
            paymentUrl: 'https://sandbox.vnpayment.vn/x',
            returnUrl: 'http://localhost:3000/x',
          },
          stripe: null,
        },
      });
      await request(logged)
        .post(`${API}/auth/login`)
        .set('Authorization', `Bearer ${SECRET_TOKEN}`)
        .set('Cookie', `bb_rt=${SECRET_TOKEN}`)
        .send({ email: 'khong-co@example.test', password: SECRET_PW });
      await request(logged)
        .get(`${API}/payments/vnpay/return`)
        .query({ vnp_TxnRef: 'abc', vnp_SecureHash: SECRET_SIG });
      await request(logged)
        .post(`${API}/auth/forgot-password`)
        .send({ email: 'khong-co@example.test' });
      await request(logged)
        .post(`${API}/auth/reset-password`)
        .send({ token: SECRET_TOKEN, password: SECRET_PW });
    } finally {
      L[sym as unknown as symbol] = origStream;
      logger.level = origLevel;
    }
    const all = lines.join('\n');
    expect(lines.length).toBeGreaterThan(0); // đã bắt được log thật
    for (const s of [SECRET_PW, SECRET_TOKEN, SECRET_SIG]) expect(all).not.toContain(s);
    expect(all).not.toMatch(/authorization|set-cookie|cookie/i);
  });
});
