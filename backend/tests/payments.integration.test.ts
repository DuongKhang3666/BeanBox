import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { PaymentConfig } from '../src/config/payments.js';
import { EXPIRE_PAYMENTS_LOCK_KEY, runExpirePendingPaymentsOnce } from '../src/jobs/cleanup.js';
import { prisma } from '../src/lib/prisma.js';
import { formatVnDateTime, formatVnpayDate } from '../src/lib/vnTime.js';
import { signVnpay, verifyVnpay } from '../src/modules/payments/vnpay.js';
import { API, clearTestOutbox, waitForMail } from './authHelpers.js';
import { createFixtures, dataOf, errOf, type Who } from './checkoutHelpers.js';

const PREFIX = 'tm5p-';
// Giá trị test tự đặt, KHÔNG phải secret thật.
const SECRET = 'test-hash-secret';
const ON: PaymentConfig = {
  vnpay: {
    tmnCode: 'TESTTMN01',
    hashSecret: SECRET,
    paymentUrl: 'https://sandbox.example.test/vpcpay.html',
    returnUrl: 'http://localhost:3000/thanh-toan/ket-qua?provider=vnpay',
  },
  stripe: null,
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
};

let app: Express;
let appOn: Express;
let appOff: Express;
const fx = createFixtures(() => app, PREFIX);
let seq = 0;

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
  appOn = createApp({ ...limits, paymentConfig: ON });
  appOff = createApp({ ...limits, paymentConfig: OFF });
  app = appOn;
  await clean();
  await fx.setup();
});
afterAll(async () => {
  await fx.restoreSettings();
  await clean();
  await prisma.$disconnect();
});
beforeEach(async () => {
  app = appOn;
  clearTestOutbox();
  await fx.setSetting('order.paymentExpiryMinutes', 15);
  await fx.setSetting('shipping.rates', {
    inner: { STANDARD: 20000, EXPRESS: 35000 },
    other: { STANDARD: 35000, EXPRESS: 55000 },
  });
  await fx.setSetting('shipping.freeShippingThreshold', 500000);
});

/** Đơn guest VNPay: 2 x 100.000 + ship 20.000 = 220.000. */
async function placeGuestVnpay(key: string, over: Record<string, unknown> = {}, qty = 2) {
  const v = await fx.mkVariant(key, { price: 100000, stock: 50 });
  const who = await fx.guestWith([[v.id, qty]]);
  const body = fx.guestOrderBody({ paymentMethod: 'VNPAY', ...over });
  const res = await fx.postOrder(who, body);
  expect(res.status).toBe(201);
  const order = dataOf(res);
  return { v, who, order, email: (body.contact as { email: string }).email, phone: '0901234567' };
}

const createPayment = (code: string, phone?: string, who: Who = {}) =>
  fx.call('post', '/payments/vnpay/create', who, { code, ...(phone ? { phone } : {}) });

/** Tạo Payment qua API; trả paymentId. */
async function startPayment(o: { order: { code: string }; phone: string }) {
  const res = await createPayment(o.order.code, o.phone);
  expect(res.status).toBe(200);
  return dataOf(res).paymentId as string;
}

function signedQuery(
  paymentId: string,
  amountVnd: number,
  extra: Record<string, string> = {},
  secret = SECRET,
): Record<string, string> {
  const p: Record<string, string> = {
    vnp_TmnCode: 'TESTTMN01',
    vnp_Amount: String(amountVnd * 100),
    vnp_BankCode: 'NCB',
    vnp_CardType: 'ATM',
    vnp_OrderInfo: 'Thanh toan don hang test',
    vnp_PayDate: '20261111101500',
    vnp_ResponseCode: '00',
    vnp_TransactionNo: `${Date.now()}${++seq}`,
    vnp_TransactionStatus: '00',
    vnp_TxnRef: paymentId,
    ...extra,
  };
  return { ...p, vnp_SecureHash: signVnpay(p, secret), vnp_SecureHashType: 'HmacSHA512' };
}

const ipn = (query: Record<string, string>) =>
  request(app).get(`${API}/payments/vnpay/ipn`).query(query);
const ret = (query: Record<string, string>) =>
  request(app).get(`${API}/payments/vnpay/return`).query(query);

const dbOrder = (code: string) =>
  prisma.order.findUniqueOrThrow({
    where: { code },
    include: { history: { orderBy: { createdAt: 'asc' } } },
  });

describe('quote: paymentMethods theo cấu hình', () => {
  it('bật VNPay khi có cấu hình; tắt khi thiếu; COD luôn bật', async () => {
    const v = await fx.mkVariant('q1');
    const who = await fx.guestWith([[v.id, 1]]);
    const body = { provinceCode: '79' };

    const on = await fx.call('post', '/checkout/quote', who, body);
    expect(dataOf(on).paymentMethods).toEqual([
      { method: 'COD', enabled: true },
      { method: 'VNPAY', enabled: true },
      { method: 'STRIPE', enabled: false },
    ]);

    app = appOff;
    const off = await fx.call('post', '/checkout/quote', who, body);
    expect(dataOf(off).paymentMethods).toEqual([
      { method: 'COD', enabled: true },
      { method: 'VNPAY', enabled: false },
      { method: 'STRIPE', enabled: false },
    ]);
  });
});

describe('POST /orders với VNPay', () => {
  it('tắt -> 409 PAYMENT_METHOD_UNAVAILABLE, kho không đổi', async () => {
    app = appOff;
    const v = await fx.mkVariant('o-off');
    const who = await fx.guestWith([[v.id, 1]]);
    const r = await fx.postOrder(who, fx.guestOrderBody({ paymentMethod: 'VNPAY' }));
    expect(r.status).toBe(409);
    expect(errOf(r).code).toBe('PAYMENT_METHOD_UNAVAILABLE');
    expect(await stockOf(v.id)).toBe(50);
  });

  it('bật -> PENDING_PAYMENT + expiresAt + canPay, trừ kho, giữ lượt mã, email ghi hạn', async () => {
    const coupon = await fx.mkCoupon('c-on', { type: 'PERCENT', value: 10, usageLimit: 5 });
    const v = await fx.mkVariant('o-on', { price: 100000, stock: 50 });
    const who = await fx.guestWith([[v.id, 2]]);
    const body = fx.guestOrderBody({ paymentMethod: 'VNPAY', couponCode: coupon.code });
    const email = (body.contact as { email: string }).email;
    const before = Date.now();
    const res = await fx.postOrder(who, body);
    expect(res.status).toBe(201);
    const o = dataOf(res);

    expect(o).toMatchObject({
      status: 'PENDING_PAYMENT',
      paymentStatus: 'UNPAID',
      paymentMethod: 'VNPAY',
      canPay: true,
      canCancel: true,
      paidAt: null,
    });
    const exp = new Date(o.expiresAt as string).getTime();
    expect(exp).toBeGreaterThanOrEqual(before + 15 * 60_000 - 1000);
    expect(exp).toBeLessThanOrEqual(Date.now() + 15 * 60_000 + 1000);
    expect(o.history).toHaveLength(1);
    expect(o.history[0]).toMatchObject({ fromStatus: null, toStatus: 'PENDING_PAYMENT' });

    expect(await stockOf(v.id)).toBe(48);
    const row = await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } });
    expect(row.usedCount).toBe(1);
    expect(await prisma.couponRedemption.count({ where: { couponId: coupon.id } })).toBe(1);

    const mail = await waitForMail(email);
    const deadline = formatVnDateTime(new Date(o.expiresAt as string));
    expect(mail.text).toContain(`Vui lòng thanh toán trước ${deadline} (giờ Việt Nam)`);
    expect(mail.html).toContain(deadline);
  });

  it('expiresAt theo setting order.paymentExpiryMinutes', async () => {
    await fx.setSetting('order.paymentExpiryMinutes', 30);
    const { order } = await placeGuestVnpay('o-30');
    const diff = new Date(order.expiresAt as string).getTime() - Date.now();
    expect(diff).toBeGreaterThan(29 * 60_000);
    expect(diff).toBeLessThanOrEqual(30 * 60_000 + 1000);
  });

  it('COD không có expiresAt và email không có dòng hạn thanh toán', async () => {
    const v = await fx.mkVariant('o-cod');
    const who = await fx.guestWith([[v.id, 1]]);
    const body = fx.guestOrderBody();
    const res = await fx.postOrder(who, body);
    expect(dataOf(res)).toMatchObject({ status: 'PENDING', expiresAt: null, canPay: false });
    const mail = await waitForMail((body.contact as { email: string }).email);
    expect(mail.text).not.toContain('Vui lòng thanh toán trước');
  });
});

describe('canPay', () => {
  it('Order: true khi còn hạn và bật; false khi tắt cấu hình hoặc hết hạn', async () => {
    const user = await fx.mkUser('cp-user');
    const addr = await fx.mkAddress(user.id);
    const v = await fx.mkVariant('cp1');
    await fx.add(user.who, v.id, 1);
    const created = await fx.postOrder(user.who, {
      addressId: addr.id,
      shippingMethod: 'STANDARD',
      paymentMethod: 'VNPAY',
      acceptTerms: true,
    });
    expect(created.status).toBe(201);
    const code = dataOf(created).code as string;

    expect(dataOf(await fx.call('get', `/orders/${code}`, user.who)).canPay).toBe(true);

    app = appOff;
    expect(dataOf(await fx.call('get', `/orders/${code}`, user.who)).canPay).toBe(false);

    app = appOn;
    await prisma.order.update({
      where: { code },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(dataOf(await fx.call('get', `/orders/${code}`, user.who)).canPay).toBe(false);
  });

  it('TrackedOrder: canPay chỉ với đơn guest; đơn của tài khoản -> false', async () => {
    const g = await placeGuestVnpay('cp-guest');
    const track = (code: string, phone: string) =>
      fx.call('get', `/orders/track?code=${code}&phone=${phone}`);
    expect(dataOf(await track(g.order.code, g.phone))).toMatchObject({
      status: 'PENDING_PAYMENT',
      canPay: true,
    });

    const user = await fx.mkUser('cp-user2');
    const addr = await fx.mkAddress(user.id, undefined, { phone: '0912345678' });
    const v = await fx.mkVariant('cp2');
    await fx.add(user.who, v.id, 1);
    const created = await fx.postOrder(user.who, {
      addressId: addr.id,
      shippingMethod: 'STANDARD',
      paymentMethod: 'VNPAY',
      acceptTerms: true,
    });
    const tracked = await track(dataOf(created).code as string, '0912345678');
    expect(dataOf(tracked).canPay).toBe(false);
  });
});

describe('POST /payments/vnpay/create', () => {
  it('guest + SĐT đúng: tạo Payment PENDING, URL có chữ ký verify được', async () => {
    const g = await placeGuestVnpay('c1');
    const res = await createPayment(g.order.code, '+84 90 123 4567');
    expect(res.status).toBe(200);
    const d = dataOf(res);
    expect(Object.keys(d).sort()).toEqual(['expiresAt', 'paymentId', 'redirectUrl']);
    expect(d.expiresAt).toBe(g.order.expiresAt);

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: d.paymentId } });
    expect(payment).toMatchObject({
      orderId: (await dbOrder(g.order.code)).id,
      provider: 'VNPAY',
      status: 'PENDING',
      amount: g.order.grandTotal,
      providerRef: d.paymentId,
    });

    const url = new URL(d.redirectUrl as string);
    expect(`${url.origin}${url.pathname}`).toBe('https://sandbox.example.test/vpcpay.html');
    const q = Object.fromEntries(url.searchParams);
    expect(verifyVnpay(q, SECRET)).toBe(true);
    expect(q).toMatchObject({
      vnp_Amount: String(g.order.grandTotal * 100),
      vnp_TxnRef: d.paymentId,
      vnp_TmnCode: 'TESTTMN01',
      vnp_OrderInfo: `Thanh toan don hang ${g.order.code}`,
      vnp_ExpireDate: formatVnpayDate(new Date(g.order.expiresAt as string)),
    });
    expect(q.vnp_SecureHash).toMatch(/^[0-9a-f]{128}$/);
    expect(d.redirectUrl).not.toContain(SECRET);
  });

  it('mỗi lần gọi tạo 1 Payment mới', async () => {
    const g = await placeGuestVnpay('c-multi');
    const a = await startPayment(g);
    const b = await startPayment(g);
    expect(a).not.toBe(b);
    expect(
      await prisma.payment.count({ where: { orderId: (await dbOrder(g.order.code)).id } }),
    ).toBe(2);
  });

  it('chủ đơn (đã đăng nhập) không cần SĐT; user khác -> 404', async () => {
    const owner = await fx.mkUser('c-owner');
    const other = await fx.mkUser('c-other');
    const addr = await fx.mkAddress(owner.id);
    const v = await fx.mkVariant('c2');
    await fx.add(owner.who, v.id, 1);
    const created = await fx.postOrder(owner.who, {
      addressId: addr.id,
      shippingMethod: 'STANDARD',
      paymentMethod: 'VNPAY',
      acceptTerms: true,
    });
    const code = dataOf(created).code as string;

    const ok = await createPayment(code, undefined, owner.who);
    expect(ok.status).toBe(200);

    const stolen = await createPayment(code, '0912345678', other.who);
    expect(stolen.status).toBe(404);
    expect(errOf(stolen).code).toBe('NOT_FOUND');
    // Guest không thể thanh toán đơn của tài khoản dù đúng SĐT
    expect((await createPayment(code, '0912345678')).status).toBe(404);
  });

  it('guest: SĐT sai -> 404; thiếu/sai định dạng -> 400; mã sai định dạng/không tồn tại -> 404', async () => {
    const g = await placeGuestVnpay('c3');
    const wrong = await createPayment(g.order.code, '0987654321');
    expect(wrong.status).toBe(404);
    expect(errOf(wrong).message).toBe(
      errOf(await createPayment('BB-000000-ABCD', g.phone)).message,
    );

    const noPhone = await createPayment(g.order.code);
    expect(noPhone.status).toBe(400);
    expect(errOf(noPhone).code).toBe('VALIDATION_ERROR');
    expect((await createPayment(g.order.code, '123')).status).toBe(400);

    expect((await createPayment('khong-hop-le', g.phone)).status).toBe(404);
    expect((await createPayment('BB-000000-ABCD', g.phone)).status).toBe(404);
    expect(await prisma.payment.count({ where: { order: { code: g.order.code } } })).toBe(0);
  });

  it('thiếu code -> 400 VALIDATION_ERROR', async () => {
    const res = await fx.call('post', '/payments/vnpay/create', {}, { phone: '0901234567' });
    expect(res.status).toBe(400);
    expect(errOf(res).code).toBe('VALIDATION_ERROR');
  });

  it('409 PAYMENT_NOT_ALLOWED: STATUS / METHOD_MISMATCH / EXPIRED / UNAVAILABLE', async () => {
    const countVnpay = () =>
      prisma.payment.count({
        where: { order: { contactEmail: { startsWith: PREFIX } }, provider: 'VNPAY' },
      });
    const before = await countVnpay();
    const reasonOf = async (code: string, phone: string) => {
      const r = await createPayment(code, phone);
      expect(r.status).toBe(409);
      expect(errOf(r).code).toBe('PAYMENT_NOT_ALLOWED');
      return (errOf(r).details as { reason: string }).reason;
    };

    // STATUS: đơn COD đang PENDING (không phải PENDING_PAYMENT)
    const v = await fx.mkVariant('c-status');
    const who = await fx.guestWith([[v.id, 1]]);
    const cod = await fx.postOrder(who, fx.guestOrderBody());
    expect(await reasonOf(dataOf(cod).code, '0901234567')).toBe('STATUS');

    // STATUS: đơn VNPay đã bị hủy
    const cancelled = await placeGuestVnpay('c-cancelled');
    await prisma.order.update({
      where: { code: cancelled.order.code },
      data: { status: 'CANCELLED' },
    });
    expect(await reasonOf(cancelled.order.code, cancelled.phone)).toBe('STATUS');

    // METHOD_MISMATCH: endpoint VNPay nhưng đơn Stripe
    const mismatch = await placeGuestVnpay('c-mismatch');
    await prisma.order.update({
      where: { code: mismatch.order.code },
      data: { paymentMethod: 'STRIPE' },
    });
    expect(await reasonOf(mismatch.order.code, mismatch.phone)).toBe('METHOD_MISMATCH');

    // EXPIRED
    const expired = await placeGuestVnpay('c-expired');
    await prisma.order.update({
      where: { code: expired.order.code },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await reasonOf(expired.order.code, expired.phone)).toBe('EXPIRED');

    // UNAVAILABLE: phương thức bị tắt sau khi đặt đơn
    const unavailable = await placeGuestVnpay('c-unavail');
    app = appOff;
    expect(await reasonOf(unavailable.order.code, unavailable.phone)).toBe('UNAVAILABLE');

    // Không Payment nào được tạo khi bị từ chối
    expect(await countVnpay()).toBe(before);
  });
});

describe('GET /payments/vnpay/ipn', () => {
  it('sai chữ ký -> 97; không có cấu hình VNPay -> 97; không đổi gì', async () => {
    const g = await placeGuestVnpay('i-sig');
    const pid = await startPayment(g);
    const bad = signedQuery(pid, g.order.grandTotal, {}, 'wrong-secret');
    const r = await ipn(bad);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ RspCode: '97' });

    const tampered = signedQuery(pid, g.order.grandTotal);
    tampered.vnp_ResponseCode = '24';
    expect((await ipn(tampered)).body.RspCode).toBe('97');

    expect((await ipn({ vnp_TxnRef: pid })).body.RspCode).toBe('97');

    app = appOff;
    expect((await ipn(signedQuery(pid, g.order.grandTotal))).body.RspCode).toBe('97');

    expect((await dbOrder(g.order.code)).status).toBe('PENDING_PAYMENT');
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: pid } })).status).toBe('PENDING');
  });

  it('TxnRef lạ -> 01; sai số tiền -> 04', async () => {
    const g = await placeGuestVnpay('i-misc');
    const pid = await startPayment(g);
    const unknown = await ipn(signedQuery('khong-ton-tai', g.order.grandTotal));
    expect(unknown.status).toBe(200);
    expect(unknown.body).toMatchObject({ RspCode: '01' });

    const wrongAmount = await ipn(signedQuery(pid, g.order.grandTotal - 1000));
    expect(wrongAmount.body).toMatchObject({ RspCode: '04' });
    expect((await dbOrder(g.order.code)).status).toBe('PENDING_PAYMENT');
  });

  it('thành công -> 00: CONFIRMED/PAID/paidAt/history; gửi lại -> 02 không đổi gì', async () => {
    const g = await placeGuestVnpay('i-ok');
    const pid = await startPayment(g);
    const q = signedQuery(pid, g.order.grandTotal);

    const r = await ipn(q);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ RspCode: '00', Message: 'Confirm Success' });

    const o = await dbOrder(g.order.code);
    expect(o).toMatchObject({ status: 'CONFIRMED', paymentStatus: 'PAID' });
    expect(o.paidAt).toBeInstanceOf(Date);
    expect(o.confirmedAt).toBeInstanceOf(Date);
    const hist = o.history.filter((h) => h.toStatus === 'CONFIRMED');
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({
      fromStatus: 'PENDING_PAYMENT',
      note: 'Thanh toán VNPay thành công',
      actorId: null,
    });
    const p = await prisma.payment.findUniqueOrThrow({ where: { id: pid } });
    expect(p).toMatchObject({ status: 'SUCCEEDED', providerTxnId: q.vnp_TransactionNo });
    const raw = p.rawPayload as Record<string, string>;
    expect(raw.vnp_TxnRef).toBe(pid);
    expect(raw).not.toHaveProperty('vnp_SecureHash');
    expect(raw).not.toHaveProperty('vnp_SecureHashType');

    // Gửi lại đúng IPN
    const again = await ipn(q);
    expect(again.body).toMatchObject({ RspCode: '02' });
    const o2 = await dbOrder(g.order.code);
    expect(o2.history).toHaveLength(o.history.length);
    expect(o2.paidAt?.getTime()).toBe(o.paidAt?.getTime());
    expect(o2.updatedAt.getTime()).toBe(o.updatedAt.getTime());
    expect(await prisma.payment.count({ where: { orderId: o.id } })).toBe(1);
  });

  it('thất bại (24) -> Payment FAILED, paymentStatus FAILED, đơn vẫn PENDING_PAYMENT; thử lại thành công -> CONFIRMED (D-001)', async () => {
    const g = await placeGuestVnpay('i-fail');
    const p1 = await startPayment(g);
    const fail = signedQuery(p1, g.order.grandTotal, {
      vnp_ResponseCode: '24',
      vnp_TransactionStatus: '02',
    });
    expect((await ipn(fail)).body).toMatchObject({ RspCode: '00' });

    let o = await dbOrder(g.order.code);
    expect(o).toMatchObject({ status: 'PENDING_PAYMENT', paymentStatus: 'FAILED', paidAt: null });
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: p1 } })).status).toBe('FAILED');
    // Gửi lại IPN thất bại -> trùng
    expect((await ipn(fail)).body).toMatchObject({ RspCode: '02' });
    // Vẫn thanh toán lại được
    const track = await fx.call('get', `/orders/track?code=${g.order.code}&phone=${g.phone}`);
    expect(dataOf(track)).toMatchObject({ paymentStatus: 'FAILED', canPay: true });

    const p2 = await startPayment(g);
    expect(p2).not.toBe(p1);
    expect((await ipn(signedQuery(p2, g.order.grandTotal))).body).toMatchObject({ RspCode: '00' });
    o = await dbOrder(g.order.code);
    expect(o).toMatchObject({ status: 'CONFIRMED', paymentStatus: 'PAID' });
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: p1 } })).status).toBe('FAILED');
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: p2 } })).status).toBe(
      'SUCCEEDED',
    );
  });

  it('ResponseCode 00 nhưng TransactionStatus khác 00 -> thất bại', async () => {
    const g = await placeGuestVnpay('i-ts');
    const pid = await startPayment(g);
    await ipn(signedQuery(pid, g.order.grandTotal, { vnp_TransactionStatus: '01' }));
    expect(await dbOrder(g.order.code)).toMatchObject({
      status: 'PENDING_PAYMENT',
      paymentStatus: 'FAILED',
    });
  });

  it('thất bại đến sau khi đã thành công -> bỏ qua (02), không hạ trạng thái', async () => {
    const g = await placeGuestVnpay('i-order');
    const pid = await startPayment(g);
    await ipn(signedQuery(pid, g.order.grandTotal));
    const late = await ipn(
      signedQuery(pid, g.order.grandTotal, { vnp_ResponseCode: '24', vnp_TransactionStatus: '02' }),
    );
    expect(late.body).toMatchObject({ RspCode: '02' });
    expect(await dbOrder(g.order.code)).toMatchObject({
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
    });
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: pid } })).status).toBe(
      'SUCCEEDED',
    );
  });

  it('2 IPN thành công song song cùng Payment -> xử lý đúng 1 lần', async () => {
    const g = await placeGuestVnpay('i-par');
    const pid = await startPayment(g);
    const q = signedQuery(pid, g.order.grandTotal);
    const results = await Promise.all([ipn(q), ipn(q), ipn(q)]);
    const codes = results.map((r) => r.body.RspCode as string).sort();
    expect(codes).toEqual(['00', '02', '02']);
    const o = await dbOrder(g.order.code);
    expect(o.history.filter((h) => h.toStatus === 'CONFIRMED')).toHaveLength(1);
    expect(o.status).toBe('CONFIRMED');
  });

  it('trả trùng: Payment thứ hai thành công khi đơn đã PAID -> không đổi đơn, ghi audit payment.late', async () => {
    const g = await placeGuestVnpay('i-dup');
    const p1 = await startPayment(g);
    const p2 = await startPayment(g);
    await ipn(signedQuery(p1, g.order.grandTotal));
    const histBefore = (await dbOrder(g.order.code)).history.length;

    expect((await ipn(signedQuery(p2, g.order.grandTotal))).body).toMatchObject({ RspCode: '00' });
    const o = await dbOrder(g.order.code);
    expect(o).toMatchObject({ status: 'CONFIRMED', paymentStatus: 'PAID' });
    expect(o.history).toHaveLength(histBefore);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: p2 } })).status).toBe(
      'SUCCEEDED',
    );
    const audit = await prisma.auditLog.findMany({
      where: { action: 'payment.late', entityId: o.id },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorId: null, entity: 'Order' });
  });
});

describe('GET /payments/vnpay/return', () => {
  it('chữ ký hợp lệ chạy cùng xử lý; response không có PII', async () => {
    const g = await placeGuestVnpay('r-ok');
    const pid = await startPayment(g);
    const res = await ret(signedQuery(pid, g.order.grandTotal));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      orderCode: g.order.code,
      result: 'SUCCEEDED',
      orderStatus: 'CONFIRMED',
      paymentStatus: 'PAID',
      canPay: false,
      expiresAt: g.order.expiresAt,
    });
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(g.email);
    expect(text).not.toContain(g.phone);
    expect(text).not.toContain('Lê Lợi');
    expect(text).not.toContain('Nguyễn Văn An');

    // IPN đến sau -> trùng
    expect(
      (await ipn(signedQuery(pid, g.order.grandTotal, { vnp_TransactionNo: 'x' }))).body.RspCode,
    ).toBe('02');
    // Return lặp lại vẫn 200 cùng kết quả
    const again = await ret(signedQuery(pid, g.order.grandTotal));
    expect(again.status).toBe(200);
    expect(again.body.data.result).toBe('SUCCEEDED');
    expect(
      (await dbOrder(g.order.code)).history.filter((h) => h.toStatus === 'CONFIRMED'),
    ).toHaveLength(1);
  });

  it('thất bại hợp lệ -> result FAILED, canPay true', async () => {
    const g = await placeGuestVnpay('r-fail');
    const pid = await startPayment(g);
    const res = await ret(
      signedQuery(pid, g.order.grandTotal, { vnp_ResponseCode: '24', vnp_TransactionStatus: '02' }),
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      result: 'FAILED',
      orderStatus: 'PENDING_PAYMENT',
      paymentStatus: 'FAILED',
      canPay: true,
    });
  });

  it('sai chữ ký -> 400 PAYMENT_SIGNATURE_INVALID, không đổi gì', async () => {
    const g = await placeGuestVnpay('r-sig');
    const pid = await startPayment(g);
    const res = await ret(signedQuery(pid, g.order.grandTotal, {}, 'wrong-secret'));
    expect(res.status).toBe(400);
    expect(errOf(res).code).toBe('PAYMENT_SIGNATURE_INVALID');
    expect((await ret({})).status).toBe(400);
    expect((await dbOrder(g.order.code)).status).toBe('PENDING_PAYMENT');
  });

  it('không thấy Payment -> 404; sai số tiền -> 400 VALIDATION_ERROR', async () => {
    const g = await placeGuestVnpay('r-misc');
    const pid = await startPayment(g);
    const missing = await ret(signedQuery('khong-ton-tai', g.order.grandTotal));
    expect(missing.status).toBe(404);
    expect(errOf(missing).code).toBe('NOT_FOUND');

    const wrong = await ret(signedQuery(pid, g.order.grandTotal + 1));
    expect(wrong.status).toBe(400);
    expect(errOf(wrong).code).toBe('VALIDATION_ERROR');
    expect((await dbOrder(g.order.code)).status).toBe('PENDING_PAYMENT');
  });
});

describe('job hết hạn thanh toán', () => {
  const expire = (code: string, msAgo = 60_000) =>
    prisma.order.update({ where: { code }, data: { expiresAt: new Date(Date.now() - msAgo) } });

  it('hủy đơn quá hạn: hoàn kho, hoàn lượt mã, Payment PENDING -> FAILED', async () => {
    const coupon = await fx.mkCoupon('j1', { type: 'FIXED', value: 10000, usageLimit: 5 });
    const g = await placeGuestVnpay('j1', { couponCode: coupon.code });
    const pid = await startPayment(g);
    expect(await stockOf(g.v.id)).toBe(48);
    expect((await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).usedCount).toBe(1);
    await expire(g.order.code);

    const r = await runExpirePendingPaymentsOnce(new Date());
    expect(r.skipped).toBe(false);
    if (r.skipped) return;
    const mine = r.cancelled.find((c) => c.code === g.order.code);
    expect(mine).toMatchObject({ code: g.order.code, contactEmail: g.email, stripeSessionIds: [] });

    const o = await dbOrder(g.order.code);
    expect(o).toMatchObject({
      status: 'CANCELLED',
      cancelReason: 'Quá hạn thanh toán',
      paymentStatus: 'UNPAID',
    });
    expect(o.cancelledAt).toBeInstanceOf(Date);
    const last = o.history.at(-1);
    expect(last).toMatchObject({
      fromStatus: 'PENDING_PAYMENT',
      toStatus: 'CANCELLED',
      actorId: null,
    });
    expect(await stockOf(g.v.id)).toBe(50);
    expect(
      await prisma.inventoryMovement.count({ where: { orderId: o.id, reason: 'ORDER_RELEASE' } }),
    ).toBe(1);
    expect((await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).usedCount).toBe(0);
    expect(
      (await prisma.couponRedemption.findFirstOrThrow({ where: { orderId: o.id } })).releasedAt,
    ).toBeInstanceOf(Date);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: pid } })).status).toBe('FAILED');

    // Chạy lại: không hủy lần 2, kho không hoàn thêm
    const again = await runExpirePendingPaymentsOnce(new Date());
    expect(again.skipped).toBe(false);
    if (!again.skipped) expect(again.cancelled.some((c) => c.code === g.order.code)).toBe(false);
    expect(await stockOf(g.v.id)).toBe(50);
    expect(
      await prisma.inventoryMovement.count({ where: { orderId: o.id, reason: 'ORDER_RELEASE' } }),
    ).toBe(1);
  });

  it('hủy cả đơn paymentStatus=FAILED; bỏ qua đơn chưa hạn và đơn đã CONFIRMED', async () => {
    const failed = await placeGuestVnpay('j-failed');
    const failedPay = await startPayment(failed);
    await ipn(
      signedQuery(failedPay, failed.order.grandTotal, {
        vnp_ResponseCode: '24',
        vnp_TransactionStatus: '02',
      }),
    );
    await expire(failed.order.code);

    const fresh = await placeGuestVnpay('j-fresh');
    const paid = await placeGuestVnpay('j-paid');
    const paidPay = await startPayment(paid);
    await ipn(signedQuery(paidPay, paid.order.grandTotal));
    await expire(paid.order.code); // đã CONFIRMED nhưng expiresAt còn trong quá khứ

    const r = await runExpirePendingPaymentsOnce(new Date());
    expect(r.skipped).toBe(false);
    if (r.skipped) return;
    const codes = r.cancelled.map((c) => c.code);
    expect(codes).toContain(failed.order.code);
    expect(codes).not.toContain(fresh.order.code);
    expect(codes).not.toContain(paid.order.code);

    expect((await dbOrder(failed.order.code)).status).toBe('CANCELLED');
    expect((await dbOrder(fresh.order.code)).status).toBe('PENDING_PAYMENT');
    expect((await dbOrder(paid.order.code)).status).toBe('CONFIRMED');
    expect(await stockOf(paid.v.id)).toBe(48);
  });

  it('now cũ hơn expiresAt -> chưa hủy (so với tham số now)', async () => {
    const g = await placeGuestVnpay('j-now');
    const r = await runExpirePendingPaymentsOnce(new Date(Date.now() + 14 * 60_000));
    expect(r.skipped).toBe(false);
    if (!r.skipped) expect(r.cancelled.some((c) => c.code === g.order.code)).toBe(false);
    expect((await dbOrder(g.order.code)).status).toBe('PENDING_PAYMENT');
    const later = await runExpirePendingPaymentsOnce(new Date(Date.now() + 16 * 60_000));
    if (!later.skipped) expect(later.cancelled.some((c) => c.code === g.order.code)).toBe(true);
    expect((await dbOrder(g.order.code)).status).toBe('CANCELLED');
  });

  it('advisory lock đang bận -> skipped', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let locked: () => void = () => undefined;
    const lockedP = new Promise<void>((resolve) => (locked = resolve));
    const holder = prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${EXPIRE_PAYMENTS_LOCK_KEY}::bigint)`;
      locked();
      await gate;
    });
    await lockedP;
    try {
      expect(await runExpirePendingPaymentsOnce(new Date())).toEqual({ skipped: true });
    } finally {
      release();
      await holder;
    }
    expect((await runExpirePendingPaymentsOnce(new Date())).skipped).toBe(false);
  });

  it('thanh toán muộn: đơn đã bị job hủy rồi IPN thành công -> vẫn CANCELLED, paymentStatus PAID, audit payment.late', async () => {
    const g = await placeGuestVnpay('j-late');
    const pid = await startPayment(g);
    await expire(g.order.code);
    await runExpirePendingPaymentsOnce(new Date());
    expect((await dbOrder(g.order.code)).status).toBe('CANCELLED');
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: pid } })).status).toBe('FAILED');
    expect(await stockOf(g.v.id)).toBe(50);

    const res = await ipn(signedQuery(pid, g.order.grandTotal));
    expect(res.body).toMatchObject({ RspCode: '00' });

    const o = await dbOrder(g.order.code);
    expect(o).toMatchObject({ status: 'CANCELLED', paymentStatus: 'PAID' });
    expect(o.history.some((h) => h.toStatus === 'CONFIRMED')).toBe(false);
    expect(await stockOf(g.v.id)).toBe(50);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: pid } })).status).toBe(
      'SUCCEEDED',
    );
    const audit = await prisma.auditLog.findMany({
      where: { action: 'payment.late', entityId: o.id },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorId: null, entity: 'Order' });

    // Return cho kết quả đó: đơn CANCELLED, canPay false, vẫn không lộ PII
    const rr = await ret(signedQuery(pid, g.order.grandTotal, { vnp_TransactionNo: 'late-2' }));
    expect(rr.status).toBe(200);
    expect(rr.body.data).toMatchObject({
      result: 'SUCCEEDED',
      orderStatus: 'CANCELLED',
      paymentStatus: 'PAID',
      canPay: false,
    });
  });
});

describe('rate limit endpoint thanh toán', () => {
  it('create 429 khi vượt hạn mức; return 429 với store riêng', async () => {
    const tiny = createApp({
      ...limits,
      paymentConfig: ON,
      paymentCreateRateLimit: 2,
      paymentReturnRateLimit: 2,
    });
    const hit = async (fn: () => request.Test, n: number) => {
      const statuses: number[] = [];
      for (let i = 0; i < n; i++) statuses.push((await fn()).status);
      return statuses;
    };
    const create = () =>
      request(tiny)
        .post(`${API}/payments/vnpay/create`)
        .send({ code: 'BB-000000-ABCD', phone: '0901234567' });
    expect(await hit(create, 3)).toEqual([404, 404, 429]);
    const r = () => request(tiny).get(`${API}/payments/vnpay/return`);
    // store riêng: return chưa bị ảnh hưởng bởi create
    expect(await hit(r, 3)).toEqual([400, 400, 429]);
  });
});
