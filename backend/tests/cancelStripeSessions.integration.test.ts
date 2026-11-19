import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { PaymentConfig } from '../src/config/payments.js';
import { prisma } from '../src/lib/prisma.js';
import { generateOrderCode } from '../src/lib/orderCode.js';
import type { StripeHttp } from '../src/modules/payments/stripe.js';
import { createFixtures, dataOf, errOf, type Who } from './checkoutHelpers.js';

const PREFIX = 'tm6c-';
const BIG = 100_000;
const limits = { generalRateLimit: BIG, authRateLimit: BIG, guestCancelRateLimit: BIG };

const ON: PaymentConfig = {
  vnpay: null,
  stripe: { secretKey: 'sk_test_fake', webhookSecret: 'whsec_test_fake' },
};
const OFF: PaymentConfig = { vnpay: null, stripe: null };

interface Call {
  method: string;
  path: string;
}
const stripe = {
  calls: [] as Call[],
  fail: false,
  reset() {
    this.calls = [];
    this.fail = false;
  },
};
const fakeHttp: StripeHttp = {
  request(method, path) {
    stripe.calls.push({ method, path });
    if (stripe.fail) return Promise.reject(new Error('Stripe lỗi mạng giả lập'));
    return Promise.resolve({ status: 200, json: { id: 'cs', status: 'expired' } });
  },
};
const failing500: StripeHttp = {
  request(method, path) {
    stripe.calls.push({ method, path });
    return Promise.resolve({ status: 500, json: { error: { type: 'api_error' } } });
  },
};

let appOn: Express;
let appOff: Express;
let appErr: Express;
let app: Express;
const fx = createFixtures(() => app, PREFIX);
let admin: { id: string; who: Who };
let staff: { id: string; who: Who };
let customer: { id: string; who: Who };
let seq = 0;

async function clean() {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: PREFIX } },
    select: { id: true },
  });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: users.map((u) => u.id) } } });
  await prisma.payment.deleteMany({ where: { order: { contactEmail: { startsWith: PREFIX } } } });
  await fx.clean();
}

/** Đơn PENDING_PAYMENT có 1 dòng hàng; stock đã trừ 2 để kiểm tra hoàn kho. */
async function mkPendingPaymentOrder(opts: { userId?: string; sessions?: string[] } = {}) {
  const v = await fx.mkVariant(`c${++seq}`, { stock: 10 });
  const order = await prisma.order.create({
    data: {
      code: generateOrderCode(new Date('2030-01-01T00:00:00Z')),
      userId: opts.userId ?? null,
      contactEmail: `${PREFIX}o${seq}@example.test`,
      contactPhone: '0912345678',
      status: 'PENDING_PAYMENT',
      paymentStatus: 'UNPAID',
      paymentMethod: 'STRIPE',
      shippingMethod: 'STANDARD',
      shippingAddress: {},
      subtotal: 200000,
      shippingFee: 0,
      grandTotal: 200000,
      expiresAt: new Date(Date.now() + 3600_000),
      idempotencyKey: randomUUID(),
      requestFingerprint: 'x',
      items: {
        create: [
          {
            productId: v.productId,
            variantId: v.id,
            productName: 'SP',
            variantName: 'BT',
            sku: v.sku,
            unitPrice: 100000,
            quantity: 2,
            lineTotal: 200000,
          },
        ],
      },
    },
  });
  await prisma.productVariant.update({ where: { id: v.id }, data: { stock: 8 } });
  const sessions = opts.sessions ?? [`cs_test_${randomUUID().slice(0, 8)}`];
  const payments = [];
  for (const ref of sessions) {
    payments.push(
      await prisma.payment.create({
        data: {
          orderId: order.id,
          provider: 'STRIPE',
          providerRef: ref,
          amount: 200000,
          status: 'PENDING',
        },
      }),
    );
  }
  return { order, variantId: v.id, payments, sessions };
}

const expireCalls = () => stripe.calls.filter((c) => c.path.endsWith('/expire'));
const adminCancel = (code: string, note = 'Khách đổi ý') =>
  fx.call('patch', `/admin/orders/${code}/status`, staff.who, {
    fromStatus: 'PENDING_PAYMENT',
    toStatus: 'CANCELLED',
    note,
  });

beforeAll(async () => {
  appOn = createApp({ ...limits, paymentConfig: ON, stripeHttp: fakeHttp });
  appOff = createApp({ ...limits, paymentConfig: OFF });
  appErr = createApp({ ...limits, paymentConfig: ON, stripeHttp: failing500 });
  app = appOn;
  await clean();
  await fx.setup();
  admin = await fx.mkUser('admin');
  await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
  staff = await fx.mkUser('staff');
  await prisma.user.update({ where: { id: staff.id }, data: { role: 'STAFF' } });
  customer = await fx.mkUser('cust');
});
afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});
beforeEach(() => {
  stripe.reset();
  app = appOn;
});

describe('admin hủy đơn có Payment Stripe PENDING (§14.7)', () => {
  it('Payment -> FAILED, expire phiên Stripe, hoàn kho', async () => {
    const { order, variantId, payments, sessions } = await mkPendingPaymentOrder();
    const res = await adminCancel(order.code);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(dataOf(res).status).toBe('CANCELLED');

    const p = await prisma.payment.findUniqueOrThrow({ where: { id: payments[0]!.id } });
    expect(p.status).toBe('FAILED');
    expect(stripe.calls).toEqual([
      { method: 'POST', path: `/checkout/sessions/${sessions[0]}/expire` },
    ]);
    expect(
      (await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock,
    ).toBe(10);
  });

  it('nhiều Payment PENDING: tất cả FAILED; chỉ phiên Stripe được expire; Payment đã SUCCEEDED giữ nguyên', async () => {
    const { order, payments, sessions } = await mkPendingPaymentOrder({
      sessions: ['cs_test_multi_a', 'cs_test_multi_b'],
    });
    const vn = await prisma.payment.create({
      data: {
        orderId: order.id,
        provider: 'VNPAY',
        providerRef: 'vnpref-1',
        amount: 200000,
        status: 'PENDING',
      },
    });
    const done = await prisma.payment.create({
      data: {
        orderId: order.id,
        provider: 'STRIPE',
        providerRef: 'cs_test_done',
        providerTxnId: `${PREFIX}pi-${seq}`,
        amount: 200000,
        status: 'SUCCEEDED',
      },
    });
    expect((await adminCancel(order.code)).status).toBe(200);

    for (const id of [...payments.map((x) => x.id), vn.id]) {
      expect((await prisma.payment.findUniqueOrThrow({ where: { id } })).status).toBe('FAILED');
    }
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: done.id } })).status).toBe(
      'SUCCEEDED',
    );
    expect(
      expireCalls()
        .map((c) => c.path)
        .sort(),
    ).toEqual(sessions.map((s) => `/checkout/sessions/${s}/expire`).sort());
  });

  it('Stripe lỗi (mạng hoặc HTTP 500) không làm hỏng việc hủy đơn', async () => {
    stripe.fail = true;
    const a = await mkPendingPaymentOrder();
    const resA = await adminCancel(a.order.code);
    expect(resA.status).toBe(200);
    expect(expireCalls()).toHaveLength(1);
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: a.payments[0]!.id } })).status,
    ).toBe('FAILED');
    expect((await prisma.order.findUniqueOrThrow({ where: { id: a.order.id } })).status).toBe(
      'CANCELLED',
    );

    stripe.reset();
    app = appErr;
    const b = await mkPendingPaymentOrder();
    expect((await adminCancel(b.order.code)).status).toBe(200);
    expect(expireCalls()).toHaveLength(1);
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: b.payments[0]!.id } })).status,
    ).toBe('FAILED');
  });

  it('Stripe chưa cấu hình: bỏ qua expire, vẫn hủy và đặt FAILED', async () => {
    app = appOff;
    const { order, payments } = await mkPendingPaymentOrder();
    expect((await adminCancel(order.code)).status).toBe(200);
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: payments[0]!.id } })).status,
    ).toBe('FAILED');
    expect(stripe.calls).toHaveLength(0);
  });

  it('hủy thất bại (trạng thái cũ) thì Payment vẫn PENDING và không gọi Stripe', async () => {
    const { order, payments } = await mkPendingPaymentOrder();
    const res = await fx.call('patch', `/admin/orders/${order.code}/status`, staff.who, {
      fromStatus: 'PENDING',
      toStatus: 'CANCELLED',
    });
    expect(res.status).toBe(409);
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: payments[0]!.id } })).status,
    ).toBe('PENDING');
    expect(stripe.calls).toHaveLength(0);
  });
});

describe('khách tự hủy đơn có Payment Stripe PENDING (§14.7)', () => {
  it('khách đăng nhập: Payment -> FAILED và expire phiên', async () => {
    const { order, payments, sessions } = await mkPendingPaymentOrder({ userId: customer.id });
    const res = await fx.call('post', `/orders/${order.code}/cancel`, customer.who, {});
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(dataOf(res).status).toBe('CANCELLED');
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: payments[0]!.id } })).status,
    ).toBe('FAILED');
    expect(stripe.calls).toEqual([
      { method: 'POST', path: `/checkout/sessions/${sessions[0]}/expire` },
    ]);
  });

  it('khách vãng lai (theo SĐT): Payment -> FAILED và expire phiên', async () => {
    const { order, payments } = await mkPendingPaymentOrder();
    const res = await fx.call('post', `/orders/${order.code}/cancel`, {}, { phone: '0912345678' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: payments[0]!.id } })).status,
    ).toBe('FAILED');
    expect(expireCalls()).toHaveLength(1);
  });

  it('Stripe lỗi không làm hỏng việc khách hủy đơn', async () => {
    app = appErr;
    const { order, payments } = await mkPendingPaymentOrder({ userId: customer.id });
    const res = await fx.call('post', `/orders/${order.code}/cancel`, customer.who, {});
    expect(res.status).toBe(200);
    expect(expireCalls()).toHaveLength(1);
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: payments[0]!.id } })).status,
    ).toBe('FAILED');
  });

  it('đơn của người khác -> 404, Payment giữ PENDING, không gọi Stripe', async () => {
    const { order, payments } = await mkPendingPaymentOrder({ userId: admin.id });
    const res = await fx.call('post', `/orders/${order.code}/cancel`, customer.who, {});
    expect(res.status).toBe(404);
    expect(errOf(res).code).toBe('NOT_FOUND');
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: payments[0]!.id } })).status,
    ).toBe('PENDING');
    expect(stripe.calls).toHaveLength(0);
  });
});
