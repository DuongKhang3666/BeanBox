import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { PaymentConfig } from '../src/config/payments.js';
import { afterOrdersExpired, runExpirePendingPaymentsOnce } from '../src/jobs/cleanup.js';
import { testOutbox } from '../src/lib/mailer.js';
import { prisma } from '../src/lib/prisma.js';
import { computeStripeSignature, type StripeHttp } from '../src/modules/payments/stripe.js';
import { API, clearTestOutbox } from './authHelpers.js';
import { createFixtures, dataOf, errOf, type Who } from './checkoutHelpers.js';

const PREFIX = 'tm5s-';
// Khóa/secret test tự đặt, KHÔNG phải secret thật.
const WHSEC = 'whsec_test_fake';
const ON: PaymentConfig = {
  vnpay: {
    tmnCode: 'TESTTMN01',
    hashSecret: 'test-hash-secret',
    paymentUrl: 'https://sandbox.example.test/vpcpay.html',
    returnUrl: 'http://localhost:3000/thanh-toan/ket-qua?provider=vnpay',
  },
  stripe: { secretKey: 'sk_test_fake', webhookSecret: WHSEC },
};
const NO_SECRET: PaymentConfig = {
  vnpay: null,
  stripe: { secretKey: 'sk_test_fake', webhookSecret: null },
};
const OFF: PaymentConfig = { vnpay: null, stripe: null };
const BIG = 100_000;
const limits = {
  generalRateLimit: BIG,
  authRateLimit: BIG,
  couponRateLimit: BIG,
  quoteRateLimit: BIG,
  orderRateLimit: BIG,
  paymentCreateRateLimit: BIG,
  paymentReturnRateLimit: BIG,
  paymentSyncRateLimit: BIG,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
interface Call {
  method: string;
  path: string;
  form?: Record<string, string> | undefined;
  headers?: Record<string, string> | undefined;
}

/** Stripe giả: ghi lại mọi lời gọi, trả theo `handler` (mặc định tạo phiên cs_test_N). */
const stripe = {
  calls: [] as Call[],
  n: 0,
  handler: null as null | ((c: Call) => { status: number; json: unknown }),
  reset() {
    this.calls = [];
    this.handler = null;
  },
};
const fakeHttp: StripeHttp = {
  request(method, path, form, headers) {
    const c: Call = { method, path, form, headers };
    stripe.calls.push(c);
    if (stripe.handler) return Promise.resolve(stripe.handler(c));
    if (method === 'POST' && path === '/checkout/sessions') {
      const id = `cs_test_fake${++stripe.n}x${Date.now()}`;
      return Promise.resolve({
        status: 200,
        json: { id, url: `https://checkout.example.test/c/pay/${id}` },
      });
    }
    return Promise.resolve({ status: 404, json: { error: { type: 'invalid_request_error' } } });
  },
};

let appOn: Express;
let appNoSecret: Express;
let appOff: Express;
let app: Express;
const fx = createFixtures(() => app, PREFIX);
let admin: { id: string; who: Who };
let staff: { id: string; who: Who };
let seq = 0;

const stockOf = async (id: string) =>
  (await prisma.productVariant.findUniqueOrThrow({ where: { id } })).stock;
const dbOrder = (code: string) =>
  prisma.order.findUniqueOrThrow({
    where: { code },
    include: { history: { orderBy: { createdAt: 'asc' } } },
  });
const dbPayment = (id: string) => prisma.payment.findUniqueOrThrow({ where: { id } });

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
  appOn = createApp({ ...limits, paymentConfig: ON, stripeHttp: fakeHttp });
  appNoSecret = createApp({ ...limits, paymentConfig: NO_SECRET, stripeHttp: fakeHttp });
  appOff = createApp({ ...limits, paymentConfig: OFF, stripeHttp: fakeHttp });
  app = appOn;
  await clean();
  await fx.setup();
  admin = await fx.mkUser('admin');
  await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
  staff = await fx.mkUser('staff');
  await prisma.user.update({ where: { id: staff.id }, data: { role: 'STAFF' } });
});
afterAll(async () => {
  await fx.restoreSettings();
  await clean();
  await prisma.$disconnect();
});
beforeEach(async () => {
  app = appOn;
  stripe.reset();
  clearTestOutbox();
  await fx.setSetting('order.paymentExpiryMinutes', 15);
  await fx.setSetting('shipping.rates', {
    inner: { STANDARD: 20000, EXPRESS: 35000 },
    other: { STANDARD: 35000, EXPRESS: 55000 },
  });
  await fx.setSetting('shipping.freeShippingThreshold', 500000);
});

/** Đơn guest Stripe: 2 x 100.000 + ship 20.000 = 220.000. */
async function placeStripe(key: string, over: Record<string, unknown> = {}, qty = 2) {
  const v = await fx.mkVariant(key, { price: 100000, stock: 50 });
  const who = await fx.guestWith([[v.id, qty]]);
  const body = fx.guestOrderBody({ paymentMethod: 'STRIPE', ...over });
  const res = await fx.postOrder(who, body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  const order = dataOf(res);
  return { v, who, order, email: (body.contact as { email: string }).email, phone: '0901234567' };
}
type Placed = Awaited<ReturnType<typeof placeStripe>>;

const createSession = (code: string, phone?: string, who: Who = {}) =>
  fx.call('post', '/payments/stripe/create-session', who, { code, ...(phone ? { phone } : {}) });

/** Tạo Payment + phiên Stripe qua API. */
async function startSession(o: Placed) {
  const res = await createSession(o.order.code, o.phone);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  const paymentId = dataOf(res).paymentId as string;
  const payment = await dbPayment(paymentId);
  return { paymentId, sessionId: payment.providerRef!, redirectUrl: dataOf(res).redirectUrl };
}

function sessionObj(
  s: { paymentId: string; sessionId: string },
  amount: number,
  over: Json = {},
): Json {
  return {
    id: s.sessionId,
    object: 'checkout.session',
    payment_status: 'paid',
    status: 'complete',
    amount_total: amount,
    currency: 'vnd',
    client_reference_id: s.paymentId,
    metadata: { paymentId: s.paymentId, orderCode: 'BB-X' },
    payment_intent: `pi_fake${++seq}x${Date.now()}`,
    customer_details: { email: 'khong-luu@example.test' },
    ...over,
  };
}

/** Body JSON có khoảng trắng/thứ tự khóa bất thường và ký tự Unicode: phải verify trên byte gốc. */
function eventBody(type: string, object: Json, id = `evt_fake${++seq}`): string {
  return `\n  ${JSON.stringify({ data: { object }, type, id, note: 'Đơn hàng – ✓' }, null, 3)}  \n`;
}

function postWebhook(
  body: string,
  opts: {
    secret?: string;
    ts?: number;
    header?: string | null;
    contentType?: string;
    target?: Express;
  } = {},
) {
  const ts = opts.ts ?? Math.floor(Date.now() / 1000);
  const header =
    opts.header === undefined
      ? `t=${ts},v1=${computeStripeSignature(ts, body, opts.secret ?? WHSEC)}`
      : opts.header;
  let r = request(opts.target ?? app)
    .post(`${API}/payments/stripe/webhook`)
    .set('Content-Type', opts.contentType ?? 'application/json');
  if (header !== null) r = r.set('Stripe-Signature', header);
  return r.send(body);
}

const sendEvent = (type: string, object: Json, opts = {}) =>
  postWebhook(eventBody(type, object), opts);

const sync = (sessionId: unknown) => fx.call('post', '/payments/stripe/sync', {}, { sessionId });

/** Mail đổi trạng thái (không tính mail xác nhận đặt hàng) gửi tới `to` có chứa `snippet` ở subject. */
const mailsOf = (to: string, snippet: string) =>
  testOutbox.filter((m) => m.to === to && m.subject.includes(snippet));
async function waitMails(to: string, snippet: string, count = 1) {
  for (let i = 0; i < 80 && mailsOf(to, snippet).length < count; i++) {
    await new Promise((r) => setTimeout(r, 25));
  }
  return mailsOf(to, snippet);
}
const settle = () => new Promise((r) => setTimeout(r, 150));

describe('POST /payments/stripe/create-session', () => {
  it('gửi đúng form lên Stripe, lưu session id vào providerRef, trả redirectUrl', async () => {
    const g = await placeStripe('cs-ok');
    const res = await createSession(g.order.code, '+84 90 123 4567');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const d = dataOf(res);
    expect(Object.keys(d).sort()).toEqual(['expiresAt', 'paymentId', 'redirectUrl']);
    expect(d.expiresAt).toBe(g.order.expiresAt);

    expect(stripe.calls).toHaveLength(1);
    const c = stripe.calls[0]!;
    expect(c).toMatchObject({ method: 'POST', path: '/checkout/sessions' });
    expect(c.headers).toEqual({ 'Idempotency-Key': d.paymentId });
    expect(c.form).toMatchObject({
      mode: 'payment',
      'line_items[0][price_data][currency]': 'vnd',
      'line_items[0][price_data][unit_amount]': String(g.order.grandTotal),
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][product_data][name]': `Đơn hàng ${g.order.code}`,
      client_reference_id: d.paymentId,
      'metadata[orderCode]': g.order.code,
      'metadata[paymentId]': d.paymentId,
    });
    expect(g.order.grandTotal).toBe(220000);
    expect(c.form!.success_url).toContain(
      '/thanh-toan/ket-qua?provider=stripe&session_id={CHECKOUT_SESSION_ID}',
    );
    expect(c.form!.cancel_url).toContain(`provider=stripe&cancelled=1&code=${g.order.code}`);
    const leaked = JSON.stringify(c.form);
    expect(leaked).not.toContain(g.email);
    expect(leaked).not.toContain('0901234567');
    expect(leaked).not.toContain('Lê Lợi');
    expect(leaked).not.toContain('Nguyễn Văn An');
    const expiresAt = Number(c.form!.expires_at);
    const nowSec = Math.floor(Date.now() / 1000);
    expect(expiresAt - nowSec).toBeGreaterThanOrEqual(30 * 60);
    expect(expiresAt - nowSec).toBeLessThanOrEqual(32 * 60);

    const p = await dbPayment(d.paymentId);
    expect(p).toMatchObject({ provider: 'STRIPE', status: 'PENDING', amount: g.order.grandTotal });
    expect(p.providerRef).toMatch(/^cs_test_/);
    expect(d.redirectUrl).toBe(`https://checkout.example.test/c/pay/${p.providerRef}`);
  });

  it('Stripe lỗi -> 503 SERVICE_UNAVAILABLE, Payment FAILED, không lộ chi tiết', async () => {
    const g = await placeStripe('cs-err');
    stripe.handler = () => ({
      status: 400,
      json: { error: { type: 'invalid_request_error', message: 'CHI-TIET-NHA-CUNG-CAP' } },
    });
    const res = await createSession(g.order.code, g.phone);
    expect(res.status).toBe(503);
    expect(errOf(res).code).toBe('SERVICE_UNAVAILABLE');
    expect(JSON.stringify(res.body)).not.toContain('CHI-TIET-NHA-CUNG-CAP');
    const payments = await prisma.payment.findMany({ where: { order: { code: g.order.code } } });
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ status: 'FAILED', providerRef: null });
    expect((await dbOrder(g.order.code)).status).toBe('PENDING_PAYMENT');
  });

  it('lỗi mạng (ném) cũng -> 503 + Payment FAILED', async () => {
    const g = await placeStripe('cs-net');
    stripe.handler = () => {
      throw new Error('ECONNRESET');
    };
    const res = await createSession(g.order.code, g.phone);
    expect(res.status).toBe(503);
    expect(
      (await prisma.payment.findFirstOrThrow({ where: { order: { code: g.order.code } } })).status,
    ).toBe('FAILED');
  });

  it('quyền như VNPay: SĐT sai -> 404; Stripe tắt -> 409 UNAVAILABLE; phương thức khác -> METHOD_MISMATCH', async () => {
    const g = await placeStripe('cs-perm');
    expect((await createSession(g.order.code, '0987654321')).status).toBe(404);
    expect((await createSession(g.order.code)).status).toBe(400);

    app = appOff;
    const off = await createSession(g.order.code, g.phone);
    expect(off.status).toBe(409);
    expect(errOf(off).details).toEqual({ reason: 'UNAVAILABLE' });

    app = appOn;
    await prisma.order.update({ where: { code: g.order.code }, data: { paymentMethod: 'VNPAY' } });
    const mm = await createSession(g.order.code, g.phone);
    expect(mm.status).toBe(409);
    expect(errOf(mm).details).toEqual({ reason: 'METHOD_MISMATCH' });
    expect(stripe.calls).toHaveLength(0);
  });
});

describe('POST /payments/stripe/webhook – chữ ký', () => {
  it('thiếu webhook secret -> 503 SERVICE_UNAVAILABLE', async () => {
    const res = await sendEvent('checkout.session.completed', {}, { target: appNoSecret });
    expect(res.status).toBe(503);
    expect(errOf(res).code).toBe('SERVICE_UNAVAILABLE');
    expect((await sendEvent('x', {}, { target: appOff })).status).toBe(503);
  });

  it('sai chữ ký / thiếu header / body bị sửa / sai content-type -> 400 PAYMENT_SIGNATURE_INVALID', async () => {
    const g = await placeStripe('wh-sig');
    const s = await startSession(g);
    const obj = sessionObj(s, g.order.grandTotal);
    const body = eventBody('checkout.session.completed', obj);
    const ts = Math.floor(Date.now() / 1000);

    const cases = [
      postWebhook(body, { secret: 'whsec_wrong_fake' }),
      postWebhook(body, { header: null }),
      postWebhook(body, { header: 'garbage' }),
      postWebhook(body.replace('Đơn', 'Don'), {
        header: `t=${ts},v1=${computeStripeSignature(ts, body, WHSEC)}`,
      }),
      postWebhook(body, { contentType: 'text/plain' }),
    ];
    for (const r of cases) {
      const res = await r;
      expect(res.status).toBe(400);
      expect(errOf(res).code).toBe('PAYMENT_SIGNATURE_INVALID');
    }
    expect((await dbOrder(g.order.code)).status).toBe('PENDING_PAYMENT');
    expect((await dbPayment(s.paymentId)).status).toBe('PENDING');
  });

  it('replay: timestamp cũ hơn 300 giây -> 400, không đổi gì', async () => {
    const g = await placeStripe('wh-replay');
    const s = await startSession(g);
    const res = await sendEvent('checkout.session.completed', sessionObj(s, g.order.grandTotal), {
      ts: Math.floor(Date.now() / 1000) - 301,
    });
    expect(res.status).toBe(400);
    expect(errOf(res).code).toBe('PAYMENT_SIGNATURE_INVALID');
    expect((await dbOrder(g.order.code)).status).toBe('PENDING_PAYMENT');
  });

  it('nhận đúng raw body: JSON nhiều khoảng trắng, khóa đảo thứ tự, Unicode vẫn verify được', async () => {
    const g = await placeStripe('wh-raw');
    const s = await startSession(g);
    const body = eventBody('checkout.session.completed', sessionObj(s, g.order.grandTotal));
    expect(body).toMatch(/^\n {2}\{/);
    expect(body).not.toBe(JSON.stringify(JSON.parse(body)));
    const res = await postWebhook(body);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect((await dbOrder(g.order.code)).status).toBe('CONFIRMED');
  });

  it('chữ ký đúng ở một trong nhiều v1 -> chấp nhận', async () => {
    const g = await placeStripe('wh-multi');
    const s = await startSession(g);
    const body = eventBody('checkout.session.completed', sessionObj(s, g.order.grandTotal));
    const ts = Math.floor(Date.now() / 1000);
    const old = computeStripeSignature(ts, body, 'whsec_old_fake');
    const good = computeStripeSignature(ts, body, WHSEC);
    const res = await postWebhook(body, { header: `t=${ts},v1=${old},v1=${good}` });
    expect(res.status).toBe(200);
    expect((await dbOrder(g.order.code)).status).toBe('CONFIRMED');
  });
});

describe('POST /payments/stripe/webhook – xử lý sự kiện', () => {
  it('completed + paid -> CONFIRMED/PAID, lưu rawPayload rút gọn, gửi email CONFIRMED đúng 1 lần', async () => {
    const g = await placeStripe('wh-ok');
    const s = await startSession(g);
    const obj = sessionObj(s, g.order.grandTotal);
    const body = eventBody('checkout.session.completed', obj);

    const res = await postWebhook(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });

    const o = await dbOrder(g.order.code);
    expect(o).toMatchObject({ status: 'CONFIRMED', paymentStatus: 'PAID' });
    expect(o.paidAt).toBeInstanceOf(Date);
    const hist = o.history.filter((h) => h.toStatus === 'CONFIRMED');
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({ note: 'Thanh toán Stripe thành công', actorId: null });
    const p = await dbPayment(s.paymentId);
    expect(p).toMatchObject({ status: 'SUCCEEDED', providerTxnId: obj.payment_intent });
    expect(p.rawPayload).toEqual({
      id: s.sessionId,
      payment_status: 'paid',
      amount_total: g.order.grandTotal,
      currency: 'vnd',
      payment_intent: obj.payment_intent,
    });

    const mails = await waitMails(g.email, 'đã được xác nhận');
    expect(mails).toHaveLength(1);
    expect(mails[0]!.subject).toContain(g.order.code);

    // Gửi lại cùng event -> idempotent: không đổi trạng thái, không gửi thêm mail
    const again = await postWebhook(body);
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ received: true });
    const o2 = await dbOrder(g.order.code);
    expect(o2.history).toHaveLength(o.history.length);
    expect(o2.updatedAt.getTime()).toBe(o.updatedAt.getTime());
    expect(o2.paidAt?.getTime()).toBe(o.paidAt?.getTime());
    await settle();
    expect(mailsOf(g.email, 'đã được xác nhận')).toHaveLength(1);
    expect(await prisma.payment.count({ where: { orderId: o.id } })).toBe(1);
  });

  it('2 webhook song song cùng sự kiện -> xử lý đúng 1 lần', async () => {
    const g = await placeStripe('wh-par');
    const s = await startSession(g);
    const body = eventBody('checkout.session.completed', sessionObj(s, g.order.grandTotal));
    const rs = await Promise.all([postWebhook(body), postWebhook(body), postWebhook(body)]);
    expect(rs.map((r) => r.status)).toEqual([200, 200, 200]);
    const o = await dbOrder(g.order.code);
    expect(o.history.filter((h) => h.toStatus === 'CONFIRMED')).toHaveLength(1);
    await waitMails(g.email, 'đã được xác nhận');
    await settle();
    expect(mailsOf(g.email, 'đã được xác nhận')).toHaveLength(1);
  });

  it('không khớp (số tiền, tiền tệ, session id, payment id, provider) -> 200 nhưng không đổi gì', async () => {
    const g = await placeStripe('wh-mm');
    const s = await startSession(g);
    const amount = g.order.grandTotal;

    // Payment của VNPay không được xử lý qua webhook Stripe
    const vnpayPay = await prisma.payment.create({
      data: {
        orderId: (await dbOrder(g.order.code)).id,
        provider: 'VNPAY',
        amount,
        providerRef: 'cs_test_vnpayref',
      },
    });

    const bad: Json[] = [
      sessionObj(s, amount - 1000),
      sessionObj(s, amount, { currency: 'usd' }),
      sessionObj(s, amount, { id: 'cs_test_khacsession' }),
      sessionObj(s, amount, {
        client_reference_id: 'khong-ton-tai',
        metadata: { paymentId: 'khong-ton-tai' },
      }),
      sessionObj(s, amount, {
        client_reference_id: s.paymentId,
        metadata: { paymentId: 'khac-id' },
      }),
      sessionObj(s, amount, { client_reference_id: null, metadata: {} }),
      sessionObj({ paymentId: vnpayPay.id, sessionId: 'cs_test_vnpayref' }, amount),
    ];
    for (const obj of bad) {
      const res = await sendEvent('checkout.session.completed', obj);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    }
    expect(await dbOrder(g.order.code)).toMatchObject({
      status: 'PENDING_PAYMENT',
      paymentStatus: 'UNPAID',
    });
    expect((await dbPayment(s.paymentId)).status).toBe('PENDING');
    expect((await dbPayment(vnpayPay.id)).status).toBe('PENDING');
    await settle();
    expect(mailsOf(g.email, 'đã được xác nhận')).toHaveLength(0);
  });

  it('completed nhưng payment_status=unpaid -> bỏ qua; async_payment_succeeded -> thành công', async () => {
    const g = await placeStripe('wh-async');
    const s = await startSession(g);
    const unpaid = sessionObj(s, g.order.grandTotal, { payment_status: 'unpaid' });
    expect((await sendEvent('checkout.session.completed', unpaid)).status).toBe(200);
    expect((await dbPayment(s.paymentId)).status).toBe('PENDING');
    expect((await dbOrder(g.order.code)).status).toBe('PENDING_PAYMENT');

    const ok = await sendEvent('checkout.session.async_payment_succeeded', {
      ...unpaid,
      payment_status: 'paid',
    });
    expect(ok.status).toBe(200);
    expect(await dbOrder(g.order.code)).toMatchObject({
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
    });
  });

  it('async_payment_failed và expired -> Payment FAILED, paymentStatus FAILED, đơn vẫn chờ (D-001)', async () => {
    for (const type of ['checkout.session.async_payment_failed', 'checkout.session.expired']) {
      const g = await placeStripe(`wh-fail-${type.split('.').pop()}`);
      const s = await startSession(g);
      const res = await sendEvent(
        type,
        sessionObj(s, g.order.grandTotal, { payment_status: 'unpaid', status: 'expired' }),
      );
      expect(res.status).toBe(200);
      expect(await dbOrder(g.order.code)).toMatchObject({
        status: 'PENDING_PAYMENT',
        paymentStatus: 'FAILED',
      });
      const p = await dbPayment(s.paymentId);
      expect(p.status).toBe('FAILED');
      expect(p.providerTxnId).toBeNull();
    }
  });

  it('thất bại đến sau thành công -> bỏ qua, không hạ trạng thái', async () => {
    const g = await placeStripe('wh-order');
    const s = await startSession(g);
    const obj = sessionObj(s, g.order.grandTotal);
    await sendEvent('checkout.session.completed', obj);
    const res = await sendEvent('checkout.session.expired', { ...obj, payment_status: 'unpaid' });
    expect(res.status).toBe(200);
    expect(await dbOrder(g.order.code)).toMatchObject({
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
    });
    expect((await dbPayment(s.paymentId)).status).toBe('SUCCEEDED');
  });

  it('sự kiện loại khác hoặc rác -> 200 received', async () => {
    for (const type of ['payment_intent.succeeded', 'charge.refunded', 'customer.created']) {
      const res = await sendEvent(type, { id: 'x' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    }
    expect((await postWebhook('{"type":"checkout.session.completed"}')).status).toBe(200);
    expect((await postWebhook('khong phai json')).status).toBe(400);
  });
});

describe('POST /payments/stripe/sync', () => {
  const retrieve = (obj: Json) => {
    stripe.handler = (c) =>
      c.method === 'GET' ? { status: 200, json: obj } : { status: 404, json: null };
  };

  it('gọi retrieve (server-to-server) và áp kết quả; response không có PII', async () => {
    const g = await placeStripe('sy-ok');
    const s = await startSession(g);
    stripe.calls.length = 0;
    const obj = sessionObj(s, g.order.grandTotal);
    retrieve(obj);

    const res = await sync(s.sessionId);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toEqual({
      orderCode: g.order.code,
      result: 'SUCCEEDED',
      orderStatus: 'CONFIRMED',
      paymentStatus: 'PAID',
      canPay: false,
      expiresAt: g.order.expiresAt,
    });
    expect(stripe.calls).toHaveLength(1);
    expect(stripe.calls[0]).toMatchObject({
      method: 'GET',
      path: `/checkout/sessions/${s.sessionId}`,
    });
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(g.email);
    expect(text).not.toContain(g.phone);

    expect(await dbOrder(g.order.code)).toMatchObject({
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
    });
    expect((await dbPayment(s.paymentId)).providerTxnId).toBe(obj.payment_intent);
    expect(await waitMails(g.email, 'đã được xác nhận')).toHaveLength(1);

    // Gọi lại và webhook đến sau: không đổi, không gửi thêm mail
    expect((await sync(s.sessionId)).body.data.result).toBe('SUCCEEDED');
    expect((await sendEvent('checkout.session.completed', obj)).status).toBe(200);
    await settle();
    expect(mailsOf(g.email, 'đã được xác nhận')).toHaveLength(1);
    expect(
      (await dbOrder(g.order.code)).history.filter((h) => h.toStatus === 'CONFIRMED'),
    ).toHaveLength(1);
  });

  it('sessionId sai định dạng -> 400 VALIDATION_ERROR, không gọi Stripe', async () => {
    for (const bad of ['abc', 'cs_', 'cs_test_a b', 'cs_test_../x', '', 123, null, 'cs_live-x']) {
      const res = await sync(bad);
      expect(res.status, String(bad)).toBe(400);
      expect(errOf(res).code).toBe('VALIDATION_ERROR');
    }
    expect((await fx.call('post', '/payments/stripe/sync', {}, {})).status).toBe(400);
    expect(stripe.calls).toHaveLength(0);
  });

  it('không có Payment với session đó -> 404 và không gọi Stripe', async () => {
    const res = await sync('cs_test_khongtontai');
    expect(res.status).toBe(404);
    expect(errOf(res).code).toBe('NOT_FOUND');
    expect(stripe.calls).toHaveLength(0);
  });

  it('Stripe trả số tiền/tiền tệ lệch -> 404, không đổi gì', async () => {
    const g = await placeStripe('sy-mm');
    const s = await startSession(g);
    retrieve(sessionObj(s, g.order.grandTotal - 1));
    expect((await sync(s.sessionId)).status).toBe(404);
    retrieve(sessionObj(s, g.order.grandTotal, { currency: 'usd' }));
    expect((await sync(s.sessionId)).status).toBe(404);
    expect((await dbOrder(g.order.code)).status).toBe('PENDING_PAYMENT');
  });

  it('chưa thanh toán và chưa hết hạn -> PENDING; hết hạn -> FAILED', async () => {
    const g = await placeStripe('sy-pend');
    const s = await startSession(g);
    retrieve(sessionObj(s, g.order.grandTotal, { payment_status: 'unpaid', status: 'open' }));
    const pending = await sync(s.sessionId);
    expect(pending.status).toBe(200);
    expect(pending.body.data).toMatchObject({
      result: 'PENDING',
      orderStatus: 'PENDING_PAYMENT',
      paymentStatus: 'UNPAID',
      canPay: true,
    });
    expect((await dbPayment(s.paymentId)).status).toBe('PENDING');

    retrieve(sessionObj(s, g.order.grandTotal, { payment_status: 'unpaid', status: 'expired' }));
    const failed = await sync(s.sessionId);
    expect(failed.body.data).toMatchObject({
      result: 'FAILED',
      paymentStatus: 'FAILED',
      canPay: true,
    });
    expect((await dbPayment(s.paymentId)).status).toBe('FAILED');
  });

  it('Stripe lỗi -> 503; Stripe chưa cấu hình -> 409 PAYMENT_NOT_ALLOWED UNAVAILABLE', async () => {
    const g = await placeStripe('sy-err');
    const s = await startSession(g);
    stripe.handler = () => ({ status: 500, json: null });
    const err = await sync(s.sessionId);
    expect(err.status).toBe(503);
    expect(errOf(err).code).toBe('SERVICE_UNAVAILABLE');

    app = appOff;
    const off = await sync(s.sessionId);
    expect(off.status).toBe(409);
    expect(errOf(off).code).toBe('PAYMENT_NOT_ALLOWED');
    expect(errOf(off).details).toEqual({ reason: 'UNAVAILABLE' });
  });

  it('rate limit riêng 429', async () => {
    const tiny = createApp({
      ...limits,
      paymentConfig: ON,
      stripeHttp: fakeHttp,
      paymentSyncRateLimit: 2,
    });
    const hit = () =>
      request(tiny).post(`${API}/payments/stripe/sync`).send({ sessionId: 'cs_test_khong' });
    expect([(await hit()).status, (await hit()).status, (await hit()).status]).toEqual([
      404, 404, 429,
    ]);
  });
});

describe('thanh toán muộn, needsRefund và hoàn tiền', () => {
  const adminGet = (code: string) => fx.call('get', `/admin/orders/${code}`, admin.who);
  const refund = (code: string, body: Record<string, unknown>, who: Who = admin.who) =>
    fx.call('post', `/admin/orders/${code}/refunds`, who, body);
  const list = (qs: string) => fx.call('get', `/admin/orders?${qs}&pageSize=100`, admin.who);

  /** Đơn bị job hủy rồi webhook paid đến muộn. */
  async function lateOrder(key: string) {
    const g = await placeStripe(key);
    const s = await startSession(g);
    await prisma.order.update({
      where: { code: g.order.code },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    await runExpirePendingPaymentsOnce(new Date());
    expect((await dbOrder(g.order.code)).status).toBe('CANCELLED');
    const res = await sendEvent('checkout.session.completed', sessionObj(s, g.order.grandTotal));
    expect(res.status).toBe(200);
    return { g, s };
  }

  it('webhook paid sau khi job hủy -> đơn CANCELLED giữ nguyên, needsRefund true ở AdminOrder, list và bộ lọc', async () => {
    const { g, s } = await lateOrder('rf-late');
    expect(await dbOrder(g.order.code)).toMatchObject({
      status: 'CANCELLED',
      paymentStatus: 'PAID',
    });
    expect(await stockOf(g.v.id)).toBe(50);

    const res = await adminGet(g.order.code);
    expect(res.status).toBe(200);
    const o = dataOf(res);
    expect(o.needsRefund).toBe(true);
    expect(o.payments).toHaveLength(1);
    expect(o.payments[0]).toMatchObject({
      id: s.paymentId,
      provider: 'STRIPE',
      amount: g.order.grandTotal,
      status: 'SUCCEEDED',
      providerRef: s.sessionId,
      refundedAt: null,
      refundNote: null,
      needsRefund: true,
    });
    expect(Object.keys(o.payments[0]).sort()).toEqual(
      [
        'amount',
        'createdAt',
        'id',
        'needsRefund',
        'provider',
        'providerRef',
        'providerTxnId',
        'refundNote',
        'refundedAt',
        'status',
        'updatedAt',
      ].sort(),
    );
    expect(JSON.stringify(res.body)).not.toContain('rawPayload');

    const filtered = await list(`needsRefund=true&q=${PREFIX}`);
    expect(filtered.status).toBe(200);
    const codes = (filtered.body.data as Json[]).map((x) => x.code);
    expect(codes).toContain(g.order.code);
    expect((filtered.body.data as Json[]).every((x) => x.needsRefund === true)).toBe(true);

    // Đơn thường không có cờ và không lọt vào bộ lọc
    const normal = await placeStripe('rf-normal');
    const all = await list('q=BB-');
    const mine = (all.body.data as Json[]).find((x) => x.code === normal.order.code);
    expect(mine.needsRefund).toBe(false);
    expect(
      ((await list('needsRefund=true')).body.data as Json[]).some(
        (x) => x.code === normal.order.code,
      ),
    ).toBe(false);
    expect(((await list('needsRefund=false')).body.data as Json[]).length).toBeGreaterThan(0);
    expect((await list('needsRefund=abc')).status).toBe(400);
  });

  it('hoàn tiền: STAFF 403; ADMIN thành công; lần 2 -> 409; needsRefund hết', async () => {
    const { g, s } = await lateOrder('rf-ok');

    const forbidden = await refund(
      g.order.code,
      { paymentId: s.paymentId, note: 'Đã hoàn trên Stripe' },
      staff.who,
    );
    expect(forbidden.status).toBe(403);
    expect((await dbPayment(s.paymentId)).status).toBe('SUCCEEDED');
    expect(
      (await refund(g.order.code, { paymentId: s.paymentId, note: 'Đã hoàn trên Stripe' }, {}))
        .status,
    ).toBe(401);

    const ok = await refund(g.order.code, {
      paymentId: s.paymentId,
      note: '  Đã hoàn tay trên Stripe Dashboard, mã re_fake  ',
    });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    const o = dataOf(ok);
    expect(o.paymentStatus).toBe('REFUNDED');
    expect(o.needsRefund).toBe(false);
    expect(o.payments[0]).toMatchObject({
      id: s.paymentId,
      status: 'REFUNDED',
      needsRefund: false,
      refundNote: 'Đã hoàn tay trên Stripe Dashboard, mã re_fake',
    });
    expect(o.payments[0].refundedAt).toEqual(expect.any(String));

    const p = await dbPayment(s.paymentId);
    expect(p).toMatchObject({ status: 'REFUNDED', refundedById: admin.id });
    expect(p.refundedAt).toBeInstanceOf(Date);
    expect(await dbOrder(g.order.code)).toMatchObject({
      status: 'CANCELLED',
      paymentStatus: 'REFUNDED',
    });

    const audit = await prisma.auditLog.findMany({
      where: { action: 'payment.refund', entityId: (await dbOrder(g.order.code)).id },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorId: admin.id, entity: 'Order' });
    expect((audit[0]!.diff as Json).status).toEqual(['SUCCEEDED', 'REFUNDED']);

    const again = await refund(g.order.code, { paymentId: s.paymentId, note: 'Hoàn lần hai' });
    expect(again.status).toBe(409);
    expect(errOf(again).code).toBe('CONFLICT');

    const codes = ((await list('needsRefund=true')).body.data as Json[]).map((x) => x.code);
    expect(codes).not.toContain(g.order.code);
  });

  it('đơn chưa hủy mà chỉ có 1 Payment SUCCEEDED -> 409 "Hãy hủy đơn trước khi hoàn tiền"', async () => {
    const g = await placeStripe('rf-notcancel');
    const s = await startSession(g);
    await sendEvent('checkout.session.completed', sessionObj(s, g.order.grandTotal));
    expect((await dbOrder(g.order.code)).status).toBe('CONFIRMED');
    expect(dataOf(await adminGet(g.order.code)).needsRefund).toBe(false);

    const res = await refund(g.order.code, { paymentId: s.paymentId, note: 'Hoàn khi chưa hủy' });
    expect(res.status).toBe(409);
    expect(errOf(res).code).toBe('CONFLICT');
    expect(errOf(res).message).toContain('Hãy hủy đơn trước khi hoàn tiền');
    expect((await dbPayment(s.paymentId)).status).toBe('SUCCEEDED');
  });

  it('validate và 404: note quá ngắn/dài, paymentId thiếu, Payment của đơn khác, mã đơn lạ', async () => {
    const { g, s } = await lateOrder('rf-val');
    const other = await lateOrder('rf-val2');
    const code = g.order.code;
    for (const body of [
      { paymentId: s.paymentId, note: 'abcd' },
      { paymentId: s.paymentId, note: 'x'.repeat(501) },
      { paymentId: s.paymentId },
      { note: 'Ghi chú hợp lệ' },
    ]) {
      const res = await refund(code, body);
      expect(res.status).toBe(400);
      expect(errOf(res).code).toBe('VALIDATION_ERROR');
    }
    expect(
      (await refund(code, { paymentId: other.s.paymentId, note: 'Ghi chú hợp lệ' })).status,
    ).toBe(404);
    expect(
      (await refund(code, { paymentId: 'khong-ton-tai', note: 'Ghi chú hợp lệ' })).status,
    ).toBe(404);
    expect(
      (await refund('BB-000000-ABCD', { paymentId: s.paymentId, note: 'Ghi chú hợp lệ' })).status,
    ).toBe(404);
    expect(
      (await refund('khong-hop-le', { paymentId: s.paymentId, note: 'Ghi chú hợp lệ' })).status,
    ).toBe(404);
    expect((await dbPayment(s.paymentId)).status).toBe('SUCCEEDED');
    expect((await dbPayment(other.s.paymentId)).status).toBe('SUCCEEDED');
  });

  it('trả trùng: 2 Payment SUCCEEDED trên đơn CONFIRMED -> needsRefund cho Payment sau; hoàn được, paymentStatus giữ PAID', async () => {
    const g = await placeStripe('rf-dup');
    const s1 = await startSession(g);
    const s2 = await startSession(g);
    await sendEvent('checkout.session.completed', sessionObj(s1, g.order.grandTotal));
    await sendEvent('checkout.session.completed', sessionObj(s2, g.order.grandTotal));
    expect(await dbOrder(g.order.code)).toMatchObject({
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
    });

    const o = dataOf(await adminGet(g.order.code));
    expect(o.needsRefund).toBe(true);
    const byId = Object.fromEntries((o.payments as Json[]).map((p) => [p.id, p]));
    expect(byId[s1.paymentId].needsRefund).toBe(false);
    expect(byId[s2.paymentId].needsRefund).toBe(true);
    expect((o.payments as Json[])[0].id).toBe(s2.paymentId); // mới nhất trước
    expect(
      ((await list('needsRefund=true')).body.data as Json[]).some((x) => x.code === g.order.code),
    ).toBe(true);

    const res = await refund(g.order.code, {
      paymentId: s2.paymentId,
      note: 'Hoàn khoản trả trùng',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(dataOf(res)).toMatchObject({
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
      needsRefund: false,
    });
    expect((await dbPayment(s2.paymentId)).status).toBe('REFUNDED');
    expect((await dbPayment(s1.paymentId)).status).toBe('SUCCEEDED');
    // Payment còn lại là duy nhất và đơn chưa hủy -> không được hoàn
    expect(
      (await refund(g.order.code, { paymentId: s1.paymentId, note: 'Hoàn nốt khoản còn lại' }))
        .status,
    ).toBe(409);
  });
});

describe('email và dọn dẹp khi hủy', () => {
  it('job hết hạn: afterOrdersExpired gửi email CANCELLED và gọi expireSession cho phiên Stripe', async () => {
    const g = await placeStripe('jb-ok');
    const s = await startSession(g);
    await prisma.order.update({
      where: { code: g.order.code },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    const r = await runExpirePendingPaymentsOnce(new Date());
    expect(r.skipped).toBe(false);
    if (r.skipped) return;
    const mine = r.cancelled.filter((c) => c.code === g.order.code);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.stripeSessionIds).toEqual([s.sessionId]);

    stripe.calls.length = 0;
    stripe.handler = () => ({ status: 200, json: { id: s.sessionId, status: 'expired' } });
    await afterOrdersExpired(mine, { stripeHttp: fakeHttp });

    const mails = await waitMails(g.email, 'đã được hủy');
    expect(mails).toHaveLength(1);
    expect(mails[0]!.text).toContain('Quá hạn thanh toán');
    expect(stripe.calls).toHaveLength(1);
    expect(stripe.calls[0]).toMatchObject({
      method: 'POST',
      path: `/checkout/sessions/${s.sessionId}/expire`,
    });
  });

  it('lỗi expire (HTTP lỗi hoặc ném) không làm hỏng job: vẫn gửi mail và xử lý các phiên/đơn còn lại', async () => {
    const a = await placeStripe('jb-err-a');
    const sa = await startSession(a);
    const b = await placeStripe('jb-err-b');
    const sb = await startSession(b);
    for (const g of [a, b]) {
      await prisma.order.update({
        where: { code: g.order.code },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });
    }
    const r = await runExpirePendingPaymentsOnce(new Date());
    if (r.skipped) throw new Error('job bị bỏ qua');
    const mine = r.cancelled.filter((c) => [a.order.code, b.order.code].includes(c.code));
    expect(mine).toHaveLength(2);

    stripe.calls.length = 0;
    stripe.handler = (c) => {
      if (c.path.includes(sa.sessionId)) throw new Error('ECONNRESET');
      return { status: 400, json: { error: { type: 'invalid_request_error' } } };
    };
    await expect(afterOrdersExpired(mine, { stripeHttp: fakeHttp })).resolves.toBeUndefined();
    expect(stripe.calls.map((c) => c.path).sort()).toEqual(
      [
        `/checkout/sessions/${sa.sessionId}/expire`,
        `/checkout/sessions/${sb.sessionId}/expire`,
      ].sort(),
    );
    expect(await waitMails(a.email, 'đã được hủy')).toHaveLength(1);
    expect(await waitMails(b.email, 'đã được hủy')).toHaveLength(1);
  });

  it('đơn VNPay quá hạn không gọi Stripe nhưng vẫn có email hủy', async () => {
    const g = await placeStripe('jb-vn');
    await prisma.order.update({
      where: { code: g.order.code },
      data: { expiresAt: new Date(Date.now() - 60_000), paymentMethod: 'VNPAY' },
    });
    const r = await runExpirePendingPaymentsOnce(new Date());
    if (r.skipped) throw new Error('job bị bỏ qua');
    const mine = r.cancelled.filter((c) => c.code === g.order.code);
    stripe.calls.length = 0;
    await afterOrdersExpired(mine, { stripeHttp: fakeHttp });
    expect(stripe.calls).toHaveLength(0);
    expect(await waitMails(g.email, 'đã được hủy')).toHaveLength(1);
  });

  it('khách tự hủy (guest) -> email CANCELLED sau commit, kèm lý do; hủy lỗi không gửi', async () => {
    const g = await placeStripe('cx-guest');
    const bad = await fx.call(
      'post',
      `/orders/${g.order.code}/cancel`,
      {},
      { phone: '0987654321' },
    );
    expect(bad.status).toBe(404);
    await settle();
    expect(mailsOf(g.email, 'đã được hủy')).toHaveLength(0);

    const res = await fx.call(
      'post',
      `/orders/${g.order.code}/cancel`,
      {},
      { phone: g.phone, reason: 'Đặt nhầm sản phẩm' },
    );
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const mails = await waitMails(g.email, 'đã được hủy');
    expect(mails).toHaveLength(1);
    expect(mails[0]!.subject).toContain(g.order.code);
    expect(mails[0]!.text).toContain('Đặt nhầm sản phẩm');
    expect(mails[0]!.text).not.toContain(g.phone);

    // Hủy lại -> 409, không gửi thêm
    const again = await fx.call('post', `/orders/${g.order.code}/cancel`, {}, { phone: g.phone });
    expect(again.status).toBe(409);
    await settle();
    expect(mailsOf(g.email, 'đã được hủy')).toHaveLength(1);
  });

  it('khách đăng nhập tự hủy -> email CANCELLED tới email liên hệ', async () => {
    const user = await fx.mkUser('cx-user');
    const addr = await fx.mkAddress(user.id);
    const v = await fx.mkVariant('cx-user');
    await fx.add(user.who, v.id, 1);
    const created = await fx.postOrder(user.who, {
      addressId: addr.id,
      shippingMethod: 'STANDARD',
      paymentMethod: 'STRIPE',
      acceptTerms: true,
    });
    expect(created.status).toBe(201);
    const code = dataOf(created).code as string;
    const res = await fx.call('post', `/orders/${code}/cancel`, user.who, {});
    expect(res.status).toBe(200);
    const mails = await waitMails(user.email, 'đã được hủy');
    expect(mails).toHaveLength(1);
    expect(mails[0]!.text).toContain(`/tai-khoan/don-hang/${code}`);
  });
});

describe('TrackedOrder.expiresAt', () => {
  it('đơn online chờ thanh toán trả expiresAt; đơn COD trả null', async () => {
    const g = await placeStripe('tr-exp');
    const track = (code: string, phone: string) =>
      fx.call('get', `/orders/track?code=${code}&phone=${phone}`);
    const t = dataOf(await track(g.order.code, g.phone));
    expect(t.expiresAt).toBe(g.order.expiresAt);
    expect(t.canPay).toBe(true);

    const v = await fx.mkVariant('tr-cod');
    const who = await fx.guestWith([[v.id, 1]]);
    const cod = dataOf(await fx.postOrder(who, fx.guestOrderBody()));
    expect(dataOf(await track(cod.code, '0901234567')).expiresAt).toBeNull();
  });
});
