import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import type { PaymentConfig } from '../src/config/payments.js';
import { EXPIRE_REASON, runExpirePendingPaymentsOnce } from '../src/jobs/cleanup.js';
import { prisma } from '../src/lib/prisma.js';
import { buildMomoIpn, verifyMomo } from '../src/modules/payments/momo.js';
import { parseTlv, verifyVietQrCrc } from '../src/modules/payments/vietqr.js';
import { verifyVnpay } from '../src/modules/payments/vnpay.js';
import { API } from './authHelpers.js';
import { createFixtures, dataOf, errOf, type Who } from './checkoutHelpers.js';

/**
 * D-060/D-061: VNPay giả, MoMo giả, chuyển khoản/VietQR qua API thật + DB thật.
 * Mọi khóa dưới đây là giá trị test tự đặt, KHÔNG phải secret thật.
 */
const PREFIX = 'tw2p-';
const SECRET = 'test-mock-secret-0123456789';
const VNPAY_URL = 'http://localhost:3000/cong-thanh-toan-gia-lap/vnpay';
const MOMO_URL = 'http://localhost:3000/cong-thanh-toan-gia-lap/momo';
const ENABLED: PaymentConfig = {
  vnpay: {
    tmnCode: 'BEANBOXDEMO',
    hashSecret: SECRET,
    paymentUrl: VNPAY_URL,
    returnUrl: 'http://localhost:3000/thanh-toan/ket-qua?provider=vnpay',
  },
  stripe: null,
  momo: {
    partnerCode: 'BEANBOXMOMODEMO',
    secret: SECRET,
    paymentUrl: MOMO_URL,
    returnUrl: 'http://localhost:3000/thanh-toan/ket-qua?provider=momo',
  },
  bankTransfer: { holdHours: 24 },
  mocksEnabled: true,
};
const OFF: PaymentConfig = { vnpay: null, stripe: null };
/** Chỉ chuyển khoản, không cổng giả (production-like). */
const BANK_ONLY: PaymentConfig = { vnpay: null, stripe: null, bankTransfer: { holdHours: 2 } };
const BIG = 100_000;
const limits = {
  generalRateLimit: BIG,
  authRateLimit: BIG,
  couponRateLimit: BIG,
  quoteRateLimit: BIG,
  orderRateLimit: BIG,
  paymentCreateRateLimit: BIG,
  paymentReturnRateLimit: BIG,
  mockGatewayRateLimit: BIG,
  bankTransferRateLimit: BIG,
  trackRateLimit: BIG,
};

let app: Express;
let appOn: Express;
let appOff: Express;
let appBank: Express;
const fx = createFixtures(() => app, PREFIX);
let staff: { id: string; who: Who };
let customer: { id: string; who: Who };
const PHONE = '0901234567';

const stockOf = async (id: string) =>
  (await prisma.productVariant.findUniqueOrThrow({ where: { id } })).stock;

async function clean() {
  const orders = await prisma.order.findMany({
    where: { contactEmail: { startsWith: PREFIX } },
    select: { id: true },
  });
  const ids = orders.map((o) => o.id);
  await prisma.auditLog.deleteMany({ where: { entity: 'Order', entityId: { in: ids } } });
  await prisma.payment.deleteMany({ where: { orderId: { in: ids } } });
  await fx.clean();
}

beforeAll(async () => {
  appOn = createApp({ ...limits, paymentConfig: ENABLED });
  appOff = createApp({ ...limits, paymentConfig: OFF });
  appBank = createApp({ ...limits, paymentConfig: BANK_ONLY });
  app = appOn;
  await clean();
  await fx.setup();
  for (const [key, role] of [
    ['staff', 'STAFF'],
    ['cust', 'CUSTOMER'],
  ] as const) {
    const u = await fx.mkUser(key);
    if (role === 'STAFF') await prisma.user.update({ where: { id: u.id }, data: { role } });
    if (key === 'staff') staff = u;
    else customer = u;
  }
});
afterAll(async () => {
  await fx.restoreSettings();
  await clean();
  await prisma.$disconnect();
});
beforeEach(async () => {
  app = appOn;
  await fx.setSetting('order.paymentExpiryMinutes', 15);
  await fx.setSetting('shipping.rates', {
    inner: { STANDARD: 20000, EXPRESS: 35000 },
    other: { STANDARD: 35000, EXPRESS: 55000 },
  });
  await fx.setSetting('shipping.freeShippingThreshold', 500000);
});

/** Đơn guest 2 x 100.000 + ship 20.000 = 220.000. */
async function placeGuest(method: 'VNPAY' | 'MOMO' | 'BANK_TRANSFER' | 'COD', key: string) {
  const v = await fx.mkVariant(key, { price: 100000, stock: 50 });
  const who = await fx.guestWith([[v.id, 2]]);
  const body = fx.guestOrderBody({ paymentMethod: method });
  const res = await fx.postOrder(who, body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return { v, order: dataOf(res), who };
}

const createSession = async (path: 'vnpay' | 'momo', code: string, phone = PHONE) => {
  const res = await fx.call('post', `/payments/${path}/create`, {}, { code, phone });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return {
    paymentId: dataOf(res).paymentId as string,
    url: new URL(dataOf(res).redirectUrl as string),
  };
};

const complete = (path: 'vnpay' | 'momo', params: Record<string, string>, result: string) =>
  request(app).post(`${API}/mock-gateway/${path}/complete`).send({ params, result });

const dbOrder = (code: string) =>
  prisma.order.findUniqueOrThrow({
    where: { code },
    include: { history: { orderBy: { createdAt: 'asc' } }, payments: true },
  });

const paramsOf = (u: URL) => Object.fromEntries(u.searchParams) as Record<string, string>;

describe('VNPay giả (D-060)', () => {
  it('tạo phiên: URL trỏ tới cổng giả của FE, ký bằng khóa mock, tmn demo', async () => {
    const { order } = await placeGuest('VNPAY', 'vn-url');
    const { url } = await createSession('vnpay', order.code);
    expect(`${url.origin}${url.pathname}`).toBe(VNPAY_URL);
    expect(url.searchParams.get('vnp_TmnCode')).toBe('BEANBOXDEMO');
    expect(url.searchParams.get('vnp_Amount')).toBe('22000000');
    expect(verifyVnpay(paramsOf(url), SECRET)).toBe(true);
  });

  it('thành công: đơn PAID + CONFIRMED qua IPN thật, returnUrl có chữ ký, trang kết quả SUCCEEDED', async () => {
    const { order, v } = await placeGuest('VNPAY', 'vn-ok');
    const { paymentId, url } = await createSession('vnpay', order.code);
    const res = await complete('vnpay', paramsOf(url), 'success');
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const db = await dbOrder(order.code);
    expect(db).toMatchObject({ status: 'CONFIRMED', paymentStatus: 'PAID' });
    expect(db.paidAt).not.toBeNull();
    const pay = db.payments.find((p) => p.id === paymentId)!;
    expect(pay.status).toBe('SUCCEEDED');
    expect(pay.providerTxnId).toMatch(/^\d{8}$/);
    expect(JSON.stringify(pay.rawPayload)).not.toContain('SecureHash');
    expect(await stockOf(v.id)).toBe(48);

    const back = new URL((dataOf(res) as { returnUrl: string }).returnUrl);
    expect(back.pathname).toBe('/thanh-toan/ket-qua');
    const query = paramsOf(back);
    expect(query.provider).toBe('vnpay');
    expect(verifyVnpay(query, SECRET)).toBe(true);
    const ret = await request(app).get(`${API}/payments/vnpay/return`).query(query);
    expect(ret.status).toBe(200);
    expect(dataOf(ret)).toMatchObject({
      orderCode: order.code,
      result: 'SUCCEEDED',
      orderStatus: 'CONFIRMED',
      paymentStatus: 'PAID',
    });
  });

  it('thất bại và hủy: đơn giữ PENDING_PAYMENT, paymentStatus FAILED (D-001), còn thanh toán lại được', async () => {
    for (const choice of ['failed', 'cancel']) {
      const { order, v } = await placeGuest('VNPAY', `vn-${choice}`);
      const { paymentId, url } = await createSession('vnpay', order.code);
      const res = await complete('vnpay', paramsOf(url), choice);
      expect(res.status).toBe(200);
      const db = await dbOrder(order.code);
      expect(db).toMatchObject({ status: 'PENDING_PAYMENT', paymentStatus: 'FAILED' });
      expect(db.payments.find((p) => p.id === paymentId)!.status).toBe('FAILED');
      expect(await stockOf(v.id)).toBe(48);
      // vẫn tạo được phiên mới
      expect((await createSession('vnpay', order.code)).paymentId).not.toBe(paymentId);
    }
  });

  it('sửa số tiền trên query -> 400 PAYMENT_SIGNATURE_INVALID, DB không đổi', async () => {
    const { order } = await placeGuest('VNPAY', 'vn-tamper');
    const { paymentId, url } = await createSession('vnpay', order.code);
    const res = await complete('vnpay', { ...paramsOf(url), vnp_Amount: '100' }, 'success');
    expect(res.status).toBe(400);
    expect(errOf(res).code).toBe('PAYMENT_SIGNATURE_INVALID');
    const db = await dbOrder(order.code);
    expect(db).toMatchObject({ status: 'PENDING_PAYMENT', paymentStatus: 'UNPAID' });
    expect(db.payments.find((p) => p.id === paymentId)!.status).toBe('PENDING');
  });

  it('sửa vnp_TxnRef sang Payment khác -> 400, cả hai Payment không đổi', async () => {
    const a = await placeGuest('VNPAY', 'vn-ref-a');
    const b = await placeGuest('VNPAY', 'vn-ref-b');
    const sa = await createSession('vnpay', a.order.code);
    const sb = await createSession('vnpay', b.order.code);
    const res = await complete(
      'vnpay',
      { ...paramsOf(sa.url), vnp_TxnRef: sb.paymentId },
      'success',
    );
    expect(res.status).toBe(400);
    for (const code of [a.order.code, b.order.code]) {
      expect((await dbOrder(code)).status).toBe('PENDING_PAYMENT');
    }
  });

  it('thiếu chữ ký / khác tmnCode / body sai -> 400, không đổi DB', async () => {
    const { order } = await placeGuest('VNPAY', 'vn-bad');
    const { url } = await createSession('vnpay', order.code);
    const p = paramsOf(url);
    const { vnp_SecureHash: _drop, ...noHash } = p;
    void _drop;
    expect((await complete('vnpay', noHash, 'success')).status).toBe(400);
    expect((await complete('vnpay', p, 'maybe')).status).toBe(400);
    expect((await request(app).post(`${API}/mock-gateway/vnpay/complete`).send({})).status).toBe(
      400,
    );
    expect((await dbOrder(order.code)).status).toBe('PENDING_PAYMENT');
  });

  it('gọi complete 2 lần: idempotent (một lần chuyển CONFIRMED, một Payment SUCCEEDED, kho không đổi)', async () => {
    const { order, v } = await placeGuest('VNPAY', 'vn-twice');
    const { url } = await createSession('vnpay', order.code);
    const first = await complete('vnpay', paramsOf(url), 'success');
    const second = await complete('vnpay', paramsOf(url), 'success');
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const db = await dbOrder(order.code);
    expect(db.history.filter((h) => h.toStatus === 'CONFIRMED')).toHaveLength(1);
    expect(db.payments.filter((p) => p.status === 'SUCCEEDED')).toHaveLength(1);
    expect(await stockOf(v.id)).toBe(48);
    // bấm "thất bại" sau khi đã thành công không đảo ngược
    const late = await complete('vnpay', paramsOf(url), 'failed');
    expect(late.status).toBe(200);
    expect((await dbOrder(order.code)).paymentStatus).toBe('PAID');
  });
});

describe('MoMo giả (D-060)', () => {
  it('tạo phiên: URL cổng giả, chữ ký MoMo hợp lệ, đủ tham số', async () => {
    const { order } = await placeGuest('MOMO', 'mm-url');
    const { paymentId, url } = await createSession('momo', order.code);
    expect(`${url.origin}${url.pathname}`).toBe(MOMO_URL);
    const p = paramsOf(url);
    expect(p).toMatchObject({
      partnerCode: 'BEANBOXMOMODEMO',
      orderId: paymentId,
      amount: '220000',
    });
    expect(verifyMomo(p, SECRET)).toBe(true);
  });

  it('thành công: PAID + CONFIRMED qua IPN, return đọc từ DB', async () => {
    const { order } = await placeGuest('MOMO', 'mm-ok');
    const { paymentId, url } = await createSession('momo', order.code);
    const res = await complete('momo', paramsOf(url), 'success');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const db = await dbOrder(order.code);
    expect(db).toMatchObject({ status: 'CONFIRMED', paymentStatus: 'PAID' });
    expect(db.payments.find((p) => p.id === paymentId)).toMatchObject({
      provider: 'MOMO',
      status: 'SUCCEEDED',
    });

    const back = new URL((dataOf(res) as { returnUrl: string }).returnUrl);
    expect(back.searchParams.get('provider')).toBe('momo');
    const query = Object.fromEntries(back.searchParams) as Record<string, string>;
    const ret = await request(app).get(`${API}/payments/momo/return`).query(query);
    expect(ret.status, JSON.stringify(ret.body)).toBe(200);
    expect(dataOf(ret)).toMatchObject({ orderCode: order.code, result: 'SUCCEEDED' });
  });

  it('return KHÔNG áp kết quả: chữ ký "thành công" nhưng DB chưa có IPN -> vẫn PENDING', async () => {
    const { order } = await placeGuest('MOMO', 'mm-ret');
    const { url } = await createSession('momo', order.code);
    const ipn = buildMomoIpn(
      paramsOf(url),
      'success',
      { partnerCode: 'BEANBOXMOMODEMO', secret: SECRET, paymentUrl: MOMO_URL, returnUrl: MOMO_URL },
      new Date(),
    );
    const ret = await request(app).get(`${API}/payments/momo/return`).query(ipn);
    expect(ret.status).toBe(200);
    expect(dataOf(ret).result).toBe('PENDING');
    expect((await dbOrder(order.code)).status).toBe('PENDING_PAYMENT');
  });

  it('thất bại và hủy: PENDING_PAYMENT + paymentStatus FAILED', async () => {
    for (const choice of ['failed', 'cancel']) {
      const { order } = await placeGuest('MOMO', `mm-${choice}`);
      const { url } = await createSession('momo', order.code);
      expect((await complete('momo', paramsOf(url), choice)).status).toBe(200);
      expect(await dbOrder(order.code)).toMatchObject({
        status: 'PENDING_PAYMENT',
        paymentStatus: 'FAILED',
      });
    }
  });

  it('sửa số tiền trên yêu cầu -> 400 PAYMENT_SIGNATURE_INVALID, không đổi DB', async () => {
    const { order } = await placeGuest('MOMO', 'mm-tamper');
    const { url } = await createSession('momo', order.code);
    const res = await complete('momo', { ...paramsOf(url), amount: '1000' }, 'success');
    expect(res.status).toBe(400);
    expect(errOf(res).code).toBe('PAYMENT_SIGNATURE_INVALID');
    expect((await dbOrder(order.code)).status).toBe('PENDING_PAYMENT');
  });

  it('complete 2 lần: idempotent', async () => {
    const { order } = await placeGuest('MOMO', 'mm-twice');
    const { url } = await createSession('momo', order.code);
    expect((await complete('momo', paramsOf(url), 'success')).status).toBe(200);
    expect((await complete('momo', paramsOf(url), 'success')).status).toBe(200);
    const db = await dbOrder(order.code);
    expect(db.history.filter((h) => h.toStatus === 'CONFIRMED')).toHaveLength(1);
    expect(db.payments.filter((p) => p.status === 'SUCCEEDED')).toHaveLength(1);
  });

  it('POST /payments/momo/ipn: chữ ký sai -> 400 và không đổi DB; đúng -> 200 idempotent; sai số tiền -> 400', async () => {
    const { order } = await placeGuest('MOMO', 'mm-ipn');
    const { url } = await createSession('momo', order.code);
    const cfg = {
      partnerCode: 'BEANBOXMOMODEMO',
      secret: SECRET,
      paymentUrl: MOMO_URL,
      returnUrl: MOMO_URL,
    };
    const ipn = buildMomoIpn(paramsOf(url), 'success', cfg, new Date());
    const post = (b: Record<string, unknown>) =>
      request(app).post(`${API}/payments/momo/ipn`).send(b);

    const bad = await post({ ...ipn, signature: 'a'.repeat(64) });
    expect(bad.status).toBe(400);
    expect(errOf(bad).code).toBe('PAYMENT_SIGNATURE_INVALID');
    expect((await post({ ...ipn, amount: '1' })).status).toBe(400); // đổi số tiền làm chữ ký sai
    expect((await post({})).status).toBe(400);
    expect((await dbOrder(order.code)).status).toBe('PENDING_PAYMENT');

    // chữ ký đúng nhưng số tiền không khớp Payment -> 400 VALIDATION_ERROR
    const signedWrong = buildMomoIpn({ ...paramsOf(url), amount: '1' }, 'success', cfg, new Date());
    const mismatch = await post(signedWrong);
    expect(mismatch.status).toBe(400);
    expect(errOf(mismatch).code).toBe('VALIDATION_ERROR');
    expect((await dbOrder(order.code)).status).toBe('PENDING_PAYMENT');

    const ok = await post(ipn);
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ resultCode: 0, message: 'Confirm Success' });
    expect((await post(ipn)).status).toBe(200);
    const db = await dbOrder(order.code);
    expect(db).toMatchObject({ status: 'CONFIRMED', paymentStatus: 'PAID' });
    expect(db.history.filter((h) => h.toStatus === 'CONFIRMED')).toHaveLength(1);
  });

  it('IPN với orderId không tồn tại (chữ ký đúng) -> 404', async () => {
    const cfg = {
      partnerCode: 'BEANBOXMOMODEMO',
      secret: SECRET,
      paymentUrl: MOMO_URL,
      returnUrl: MOMO_URL,
    };
    const ipn = buildMomoIpn(
      {
        partnerCode: 'BEANBOXMOMODEMO',
        orderId: 'khong-ton-tai',
        requestId: 'r',
        amount: '1000',
        orderInfo: 'x',
      },
      'success',
      cfg,
      new Date(),
    );
    const res = await request(app).post(`${API}/payments/momo/ipn`).send(ipn);
    expect(res.status).toBe(404);
  });

  it('return: chữ ký sai / thiếu -> 400; tham số lặp -> 400', async () => {
    expect((await request(app).get(`${API}/payments/momo/return`)).status).toBe(400);
    const r = await request(app)
      .get(`${API}/payments/momo/return`)
      .query({ orderId: 'x', amount: '1', signature: 'abc' });
    expect(r.status).toBe(400);
    expect(errOf(r).code).toBe('PAYMENT_SIGNATURE_INVALID');
    const dup = await request(app).get(`${API}/payments/momo/return?orderId=a&orderId=b`);
    expect(dup.status).toBe(400);
  });

  it('create: phương thức đơn không phải MOMO -> 409 METHOD_MISMATCH; MoMo tắt -> 409 UNAVAILABLE', async () => {
    const vn = await placeGuest('VNPAY', 'mm-mismatch');
    const res = await fx.call(
      'post',
      '/payments/momo/create',
      {},
      { code: vn.order.code, phone: PHONE },
    );
    expect(res.status).toBe(409);
    expect(errOf(res).code).toBe('PAYMENT_NOT_ALLOWED');
    expect((errOf(res).details as { reason: string }).reason).toBe('METHOD_MISMATCH');

    const mm = await placeGuest('MOMO', 'mm-off');
    app = appOff;
    const off = await fx.call(
      'post',
      '/payments/momo/create',
      {},
      { code: mm.order.code, phone: PHONE },
    );
    expect(off.status).toBe(409);
    expect((errOf(off).details as { reason: string }).reason).toBe('UNAVAILABLE');
  });
});

describe('route cổng giả theo cờ', () => {
  it('cờ tắt -> /mock-gateway/* là 404 (không mount)', async () => {
    for (const p of ['vnpay', 'momo']) {
      const res = await request(appOff)
        .post(`${API}/mock-gateway/${p}/complete`)
        .send({ params: {}, result: 'success' });
      expect(res.status).toBe(404);
    }
    expect(
      (await request(appBank).post(`${API}/mock-gateway/vnpay/complete`).send({})).status,
    ).toBe(404);
  });

  it('cờ bật -> route công khai (không cần đăng nhập): body rỗng là 400, không phải 401/404', async () => {
    for (const p of ['vnpay', 'momo']) {
      const res = await request(appOn).post(`${API}/mock-gateway/${p}/complete`).send({});
      expect(res.status).toBe(400);
    }
  });

  it('có rate limit riêng cho cổng giả', async () => {
    const limited = createApp({ ...limits, paymentConfig: ENABLED, mockGatewayRateLimit: 2 });
    const send = () => request(limited).post(`${API}/mock-gateway/vnpay/complete`).send({});
    expect((await send()).status).toBe(400);
    expect((await send()).status).toBe(400);
    const third = await send();
    expect(third.status).toBe(429);
    expect(errOf(third).code).toBe('RATE_LIMITED');
  });
});

describe('quote và đặt đơn với phương thức mới', () => {
  it('cấu hình bật: MOMO và BANK_TRANSFER được liệt kê; cổng giả có cờ mock', async () => {
    const v = await fx.mkVariant('q-on');
    const who = await fx.guestWith([[v.id, 1]]);
    const res = await fx.call('post', '/checkout/quote', who, { provinceCode: '79' });
    expect(dataOf(res).paymentMethods).toEqual([
      { method: 'COD', enabled: true },
      { method: 'VNPAY', enabled: true, mock: true },
      { method: 'STRIPE', enabled: false },
      { method: 'MOMO', enabled: true, mock: true },
      { method: 'BANK_TRANSFER', enabled: true },
    ]);
  });

  it('chỉ bật chuyển khoản: không liệt kê MOMO; mặc định tắt: giữ danh sách cũ', async () => {
    const v = await fx.mkVariant('q-bank');
    const who = await fx.guestWith([[v.id, 1]]);
    app = appBank;
    const bank = await fx.call('post', '/checkout/quote', who, { provinceCode: '79' });
    expect(dataOf(bank).paymentMethods.map((m: { method: string }) => m.method)).toEqual([
      'COD',
      'VNPAY',
      'STRIPE',
      'BANK_TRANSFER',
    ]);
    app = appOff;
    const off = await fx.call('post', '/checkout/quote', who, { provinceCode: '79' });
    expect(dataOf(off).paymentMethods.map((m: { method: string }) => m.method)).toEqual([
      'COD',
      'VNPAY',
      'STRIPE',
    ]);
  });

  it('phương thức tắt -> 409 PAYMENT_METHOD_UNAVAILABLE, kho không đổi', async () => {
    for (const method of ['MOMO', 'BANK_TRANSFER']) {
      app = appOff;
      const v = await fx.mkVariant(`off-${method}`);
      const who = await fx.guestWith([[v.id, 1]]);
      const r = await fx.postOrder(who, fx.guestOrderBody({ paymentMethod: method }));
      expect(r.status).toBe(409);
      expect(errOf(r).code).toBe('PAYMENT_METHOD_UNAVAILABLE');
      expect(await stockOf(v.id)).toBe(50);
    }
  });
});

describe('chuyển khoản / VietQR (D-061)', () => {
  it('đặt đơn: PENDING_PAYMENT, giữ kho, hạn = holdHours, canPay false', async () => {
    const before = Date.now();
    const { order, v } = await placeGuest('BANK_TRANSFER', 'bt-place');
    expect(order).toMatchObject({
      status: 'PENDING_PAYMENT',
      paymentStatus: 'UNPAID',
      paymentMethod: 'BANK_TRANSFER',
      canPay: false,
      transferClaimedAt: null,
    });
    const exp = new Date(order.expiresAt as string).getTime();
    expect(exp).toBeGreaterThanOrEqual(before + 24 * 3_600_000 - 1000);
    expect(exp).toBeLessThanOrEqual(Date.now() + 24 * 3_600_000 + 1000);
    expect(await stockOf(v.id)).toBe(48);

    app = appBank; // holdHours = 2
    const second = await placeGuest('BANK_TRANSFER', 'bt-place2');
    const exp2 = new Date(second.order.expiresAt as string).getTime();
    expect(exp2).toBeLessThanOrEqual(Date.now() + 2 * 3_600_000 + 1000);
    expect(exp2).toBeGreaterThanOrEqual(before + 2 * 3_600_000 - 1000);
  });

  it('hướng dẫn: QR hợp lệ (CRC, số tiền, nội dung = mã đơn), cảnh báo demo, PNG data URL', async () => {
    const { order } = await placeGuest('BANK_TRANSFER', 'bt-info');
    const res = await fx.call('get', `/orders/${order.code}/bank-transfer?phone=${PHONE}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const d = dataOf(res);
    expect(d).toMatchObject({
      orderCode: order.code,
      amount: 220000,
      content: order.code,
      bankBin: '999999',
      accountNo: '0123456789',
      isDemo: true,
      claimedAt: null,
    });
    expect(d.qrDataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(verifyVietQrCrc(d.qrPayload)).toBe(true);
    const top = parseTlv(d.qrPayload as string);
    expect(top.find((t) => t.id === '54')!.value).toBe('220000');
    expect(parseTlv(top.find((t) => t.id === '62')!.value)).toEqual([
      { id: '08', value: order.code },
    ]);
  });

  it('hướng dẫn: sai SĐT / thiếu SĐT / người khác / mã lạ -> 404 hoặc 400; không lộ đơn của người khác', async () => {
    const { order } = await placeGuest('BANK_TRANSFER', 'bt-owner');
    const get = (code: string, query: string, who: Who = {}) =>
      fx.call('get', `/orders/${code}/bank-transfer${query}`, who);
    expect((await get(order.code, '?phone=0912345678')).status).toBe(404);
    expect((await get(order.code, '')).status).toBe(400);
    expect((await get(order.code, '', customer.who)).status).toBe(404);
    expect((await get('BB-000000-ZZZZ', `?phone=${PHONE}`)).status).toBe(404);
    expect((await get('abc', `?phone=${PHONE}`)).status).toBe(404);
  });

  it('chủ đơn đăng nhập xem và báo chuyển khoản không cần SĐT', async () => {
    const v = await fx.mkVariant('bt-user', { price: 100000 });
    const addr = await fx.mkAddress(customer.id, { provinceCode: '79', wardCode: '25747' });
    expect((await fx.add(customer.who, v.id, 1)).status).toBe(201);
    const placed = await fx.postOrder(customer.who, {
      addressId: addr.id,
      shippingMethod: 'STANDARD',
      paymentMethod: 'BANK_TRANSFER',
      acceptTerms: true,
    });
    expect(placed.status, JSON.stringify(placed.body)).toBe(201);
    const code = dataOf(placed).code as string;
    const info = await fx.call('get', `/orders/${code}/bank-transfer`, customer.who);
    expect(info.status).toBe(200);
    const claim = await fx.call('post', `/orders/${code}/bank-transfer/claim`, customer.who, {});
    expect(claim.status).toBe(200);
    const mine = await fx.call('get', `/orders/${code}`, customer.who);
    expect(dataOf(mine).transferClaimedAt).toBe(dataOf(claim).claimedAt);
    // người khác (staff) không xem được đơn này
    expect((await fx.call('get', `/orders/${code}/bank-transfer`, staff.who)).status).toBe(404);
  });

  it('claim: ghi mốc một lần, KHÔNG đổi sang PAID; người khác -> 404', async () => {
    const { order } = await placeGuest('BANK_TRANSFER', 'bt-claim');
    const claim = (body: Record<string, unknown>, who: Who = {}) =>
      fx.call('post', `/orders/${order.code}/bank-transfer/claim`, who, body);
    expect((await claim({ phone: '0912345678' })).status).toBe(404);
    expect((await claim({}, customer.who)).status).toBe(404);
    expect((await claim({})).status).toBe(400);

    const first = await claim({ phone: PHONE });
    expect(first.status).toBe(200);
    const second = await claim({ phone: PHONE });
    expect(dataOf(second).claimedAt).toBe(dataOf(first).claimedAt);

    const db = await dbOrder(order.code);
    expect(db).toMatchObject({ status: 'PENDING_PAYMENT', paymentStatus: 'UNPAID', paidAt: null });
    expect(db.transferClaimedAt?.toISOString()).toBe(dataOf(first).claimedAt);
    expect(db.payments).toHaveLength(0);

    const track = await fx.call('get', `/orders/track?code=${order.code}&phone=${PHONE}`);
    expect(dataOf(track).transferClaimedAt).toBe(dataOf(first).claimedAt);
  });

  it('claim và hướng dẫn với đơn không phải chuyển khoản -> 409 METHOD_MISMATCH', async () => {
    const { order } = await placeGuest('COD', 'bt-cod');
    const res = await fx.call(
      'post',
      `/orders/${order.code}/bank-transfer/claim`,
      {},
      { phone: PHONE },
    );
    expect(res.status).toBe(409);
    expect((errOf(res).details as { reason: string }).reason).toBe('METHOD_MISMATCH');
    const info = await fx.call('get', `/orders/${order.code}/bank-transfer?phone=${PHONE}`);
    expect(info.status).toBe(409);
  });

  it('confirm: customer 403, staff 200 -> CONFIRMED + PAID + Payment BANK_TRANSFER SUCCEEDED + audit', async () => {
    const { order } = await placeGuest('BANK_TRANSFER', 'bt-confirm');
    const url = `/admin/orders/${order.code}/bank-transfer/confirm`;
    expect((await fx.call('post', url, customer.who)).status).toBe(403);
    expect((await fx.call('post', url, {})).status).toBe(401);

    const res = await fx.call('post', url, staff.who);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(dataOf(res)).toMatchObject({
      code: order.code,
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
      needsRefund: false,
    });
    expect(dataOf(res).payments).toHaveLength(1);
    expect(dataOf(res).payments[0]).toMatchObject({
      provider: 'BANK_TRANSFER',
      status: 'SUCCEEDED',
      amount: 220000,
    });

    const db = await dbOrder(order.code);
    expect(db.paidAt).not.toBeNull();
    const audit = await prisma.auditLog.findMany({
      where: { entityId: db.id, action: 'payment.bank_transfer_confirm' },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]!.actorId).toBe(staff.id);
  });

  it('confirm 2 lần: idempotent (một Payment, một dòng CONFIRMED, một audit)', async () => {
    const { order } = await placeGuest('BANK_TRANSFER', 'bt-twice');
    const url = `/admin/orders/${order.code}/bank-transfer/confirm`;
    expect((await fx.call('post', url, staff.who)).status).toBe(200);
    expect((await fx.call('post', url, staff.who)).status).toBe(200);
    const db = await dbOrder(order.code);
    expect(db.payments).toHaveLength(1);
    expect(db.history.filter((h) => h.toStatus === 'CONFIRMED')).toHaveLength(1);
    expect(
      await prisma.auditLog.count({
        where: { entityId: db.id, action: 'payment.bank_transfer_confirm' },
      }),
    ).toBe(1);
  });

  it('confirm: đơn COD -> 409; mã không có -> 404', async () => {
    const { order } = await placeGuest('COD', 'bt-confirm-cod');
    const res = await fx.call(
      'post',
      `/admin/orders/${order.code}/bank-transfer/confirm`,
      staff.who,
    );
    expect(res.status).toBe(409);
    expect(errOf(res).code).toBe('CONFLICT');
    expect(
      (await fx.call('post', '/admin/orders/BB-000000-ZZZZ/bank-transfer/confirm', staff.who))
        .status,
    ).toBe(404);
  });

  it('khách vãng lai: đơn chuyển khoản chờ tiền cũng bị giới hạn (GUEST_COD_MAX_OPEN), đơn COD/MoMo không tính', async () => {
    env.GUEST_COD_MAX_OPEN = 2;
    try {
      const phone = '0912345678';
      const place = async (method: 'BANK_TRANSFER' | 'COD' | 'MOMO', key: string) => {
        const v = await fx.mkVariant(key, { price: 100000, stock: 50 });
        const who = await fx.guestWith([[v.id, 1]]);
        const body = fx.guestOrderBody({ paymentMethod: method });
        (body.contact as { phone: string }).phone = phone;
        return { res: await fx.postOrder(who, body), v };
      };
      for (const k of ['bt-lim1', 'bt-lim2']) {
        expect((await place('BANK_TRANSFER', k)).res.status).toBe(201);
      }
      const blocked = await place('BANK_TRANSFER', 'bt-lim3');
      expect(blocked.res.status).toBe(409);
      expect(errOf(blocked.res)).toMatchObject({
        code: 'TOO_MANY_PENDING_ORDERS',
        details: { max: 2 },
      });
      expect(await stockOf(blocked.v.id)).toBe(50);
      // Phương thức khác không bị tính chung với chuyển khoản.
      expect((await place('MOMO', 'bt-lim-momo')).res.status).toBe(201);
      expect((await place('COD', 'bt-lim-cod')).res.status).toBe(201);
    } finally {
      env.GUEST_COD_MAX_OPEN = 100;
    }
  });

  it('quá hạn: job hủy + hoàn kho (loại "expired" của analytics); sau đó hướng dẫn 409 EXPIRED', async () => {
    const { order, v } = await placeGuest('BANK_TRANSFER', 'bt-expire');
    expect(await stockOf(v.id)).toBe(48);
    const future = new Date(Date.now() + 25 * 3_600_000);
    const r = await runExpirePendingPaymentsOnce(future);
    expect(r.skipped).toBe(false);
    const db = await dbOrder(order.code);
    expect(db.status).toBe('CANCELLED');
    expect(await stockOf(v.id)).toBe(50);
    const h = db.history.find((x) => x.toStatus === 'CANCELLED')!;
    expect(h).toMatchObject({ actorId: null, fromStatus: 'PENDING_PAYMENT', note: EXPIRE_REASON });

    const info = await fx.call('get', `/orders/${order.code}/bank-transfer?phone=${PHONE}`);
    expect(info.status).toBe(409);
  });

  it('chưa hết hạn thì job không hủy đơn chuyển khoản (24 giờ, không phải 15 phút)', async () => {
    const { order, v } = await placeGuest('BANK_TRANSFER', 'bt-hold');
    await runExpirePendingPaymentsOnce(new Date(Date.now() + 3_600_000));
    expect((await dbOrder(order.code)).status).toBe('PENDING_PAYMENT');
    expect(await stockOf(v.id)).toBe(48);
  });

  it('confirm sau khi đơn đã bị hủy: nhánh trả muộn (D-015) -> vẫn CANCELLED, PAID, cần hoàn tiền', async () => {
    const { order } = await placeGuest('BANK_TRANSFER', 'bt-late');
    await runExpirePendingPaymentsOnce(new Date(Date.now() + 25 * 3_600_000));
    const res = await fx.call(
      'post',
      `/admin/orders/${order.code}/bank-transfer/confirm`,
      staff.who,
    );
    expect(res.status).toBe(200);
    expect(dataOf(res)).toMatchObject({
      status: 'CANCELLED',
      paymentStatus: 'PAID',
      needsRefund: true,
    });
  });

  it('danh sách admin: lọc transferClaimed=true và hiện mốc; chi tiết có transferClaimedAt', async () => {
    const claimed = await placeGuest('BANK_TRANSFER', 'bt-list-a');
    const plain = await placeGuest('BANK_TRANSFER', 'bt-list-b');
    expect(
      (
        await fx.call(
          'post',
          `/orders/${claimed.order.code}/bank-transfer/claim`,
          {},
          { phone: PHONE },
        )
      ).status,
    ).toBe(200);

    const res = await fx.call(
      'get',
      `/admin/orders?paymentMethod=BANK_TRANSFER&transferClaimed=true&q=${PREFIX}`,
      staff.who,
    );
    expect(res.status).toBe(200);
    const codes = (res.body as { data: Array<{ code: string }> }).data.map((o) => o.code);
    expect(codes).toContain(claimed.order.code);
    expect(codes).not.toContain(plain.order.code);
    const item = (
      res.body as { data: Array<{ code: string; transferClaimedAt: string }> }
    ).data.find((o) => o.code === claimed.order.code)!;
    expect(item.transferClaimedAt).not.toBeNull();

    const detail = await fx.call('get', `/admin/orders/${claimed.order.code}`, staff.who);
    expect(dataOf(detail).transferClaimedAt).toBe(item.transferClaimedAt);
    const bad = await fx.call('get', '/admin/orders?transferClaimed=maybe', staff.who);
    expect(bad.status).toBe(400);
  });

  it('tài khoản nhận lấy từ settings; BIN thật + không có cổng giả -> isDemo false', async () => {
    const { order } = await placeGuest('BANK_TRANSFER', 'bt-settings');
    app = appBank;
    await fx.setSetting('payment.bankTransfer', {
      bankBin: '970400',
      bankName: 'Ngân hàng thử nghiệm',
      accountNo: '1122334455',
      accountName: 'CUA HANG THU NGHIEM',
    });
    const res = await fx.call('get', `/orders/${order.code}/bank-transfer?phone=${PHONE}`);
    expect(res.status).toBe(200);
    expect(dataOf(res)).toMatchObject({
      bankBin: '970400',
      accountNo: '1122334455',
      accountName: 'CUA HANG THU NGHIEM',
      isDemo: false,
    });
    const consumer = parseTlv(
      parseTlv(parseTlv(dataOf(res).qrPayload as string).find((t) => t.id === '38')!.value)[1]!
        .value,
    );
    expect(consumer).toEqual([
      { id: '00', value: '970400' },
      { id: '01', value: '1122334455' },
    ]);
    // cổng giả bật -> luôn cảnh báo demo kể cả BIN khác
    app = appOn;
    const demo = await fx.call('get', `/orders/${order.code}/bank-transfer?phone=${PHONE}`);
    expect(dataOf(demo).isDemo).toBe(true);
  });
});
