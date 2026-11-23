import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { EXPIRE_REASON, runExpirePendingPaymentsOnce } from '../src/jobs/cleanup.js';
import { prisma } from '../src/lib/prisma.js';
import { cancelOrderTx } from '../src/modules/orders/orders.cancel.js';
import { getCustomers } from '../src/modules/admin/analytics/analytics.customers.js';
import { getInventory } from '../src/modules/admin/analytics/analytics.inventory.js';
import { getOperations } from '../src/modules/admin/analytics/analytics.operations.js';
import { getOverview } from '../src/modules/admin/analytics/analytics.service.js';
import { API } from './authHelpers.js';
import { createFixtures, dataOf, errOf, type Who } from './checkoutHelpers.js';

const PREFIX = 'tm12-';
const BIG = 100_000;
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

let app: Express;
const fx = createFixtures(() => app, PREFIX);
let admin: { id: string; who: Who };
let staff: { id: string; who: Who };
let customer: { id: string; who: Who; email: string };
let base: { id: string; productId: string };

// 2034-03-15T10:00Z = 17:00 ngày 15/03 giờ VN. Kỳ này 10..15/03, kỳ trước 04..09/03.
const NOW = new Date('2034-03-15T10:00:00.000Z');
const Q = { from: '2034-03-10', to: '2034-03-15' } as const;
const at = (iso: string) => new Date(iso);

type Status =
  | 'PENDING_PAYMENT'
  | 'PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'DELIVERED'
  | 'FAILED_DELIVERY'
  | 'CANCELLED'
  | 'RETURN_REQUESTED'
  | 'RETURNED';

let seq = 0;
const codes: string[] = [];
async function mkOrder(o: {
  email: string;
  userId?: string;
  status?: Status;
  paid?: string; // ISO; có -> paymentStatus PAID
  created?: string; // mặc định = paid
  method?: 'COD' | 'VNPAY' | 'STRIPE';
  total?: number;
  confirmedAt?: string;
  deliveredAt?: string;
  expiresAt?: string;
  variantId?: string;
  productId?: string;
}) {
  const created = o.created ?? o.paid ?? '2034-03-11T03:00:00Z';
  const total = o.total ?? 100000;
  const code = `BB-T12${++seq}-${randomUUID().slice(0, 6)}`;
  codes.push(code);
  return prisma.order.create({
    data: {
      code,
      userId: o.userId ?? null,
      contactEmail: o.email,
      contactPhone: '0912345678',
      status: o.status ?? 'DELIVERED',
      paymentStatus: o.paid ? 'PAID' : 'UNPAID',
      paymentMethod: o.method ?? 'COD',
      shippingMethod: 'STANDARD',
      shippingAddress: { fullName: 'Khách Mẫu', phone: '0912345678' },
      subtotal: total,
      shippingFee: 0,
      grandTotal: total,
      idempotencyKey: randomUUID(),
      requestFingerprint: 'x',
      createdAt: at(created),
      paidAt: o.paid ? at(o.paid) : null,
      confirmedAt: o.confirmedAt ? at(o.confirmedAt) : null,
      deliveredAt: o.deliveredAt ? at(o.deliveredAt) : null,
      expiresAt: o.expiresAt ? at(o.expiresAt) : null,
      items: {
        create: [
          {
            productId: o.productId ?? base.productId,
            variantId: o.variantId ?? base.id,
            productName: 'Tên cũ',
            variantName: 'bt',
            sku: `SKU-${randomUUID().slice(0, 8)}`,
            unitPrice: total,
            quantity: 1,
            lineTotal: total,
          },
        ],
      },
    },
  });
}

const cancel = (
  orderId: string,
  from: 'PENDING' | 'CONFIRMED' | 'PROCESSING',
  actor: 'CUSTOMER' | 'STAFF' | 'ADMIN',
  actorId: string | null,
  reason: string | null,
) =>
  prisma.$transaction((tx) =>
    cancelOrderTx(tx, { orderId, from, actor, actorId, reason, note: null, now: NOW }),
  );

let baseOps: Awaited<ReturnType<typeof getOperations>>;

beforeAll(async () => {
  app = createApp({ generalRateLimit: BIG, authRateLimit: BIG });
  await fx.setup();
  admin = await fx.mkUser('admin');
  await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
  staff = await fx.mkUser('staff');
  await prisma.user.update({ where: { id: staff.id }, data: { role: 'STAFF' } });
  customer = await fx.mkUser('cust');
  const v = await fx.mkVariant('base', { stock: 1000 });
  base = { id: v.id, productId: v.productId };
  baseOps = await getOperations(Q, NOW);
});

afterAll(async () => {
  await prisma.payment.deleteMany({ where: { order: { code: { in: codes } } } });
  await fx.clean();
  await prisma.$disconnect();
});

describe('analytics bước 3 - quyền và validate', () => {
  const paths = [
    '/admin/analytics/customers',
    '/admin/analytics/operations',
    '/admin/analytics/inventory',
  ];
  it.each(paths)('401 / 403 customer + staff / 200 admin, no-store: %s', async (p) => {
    const noAuth = await request(app).get(`${API}${p}`);
    expect(noAuth.status).toBe(401);
    expect(noAuth.headers['cache-control']).toBe('no-store');
    expect((await fx.call('get', p, customer.who)).status).toBe(403);
    const st = await fx.call('get', p, staff.who);
    expect(st.status).toBe(403);
    expect(errOf(st).code).toBe('FORBIDDEN');
    const ok = await fx.call('get', p, admin.who);
    expect(ok.status).toBe(200);
    expect(ok.headers['cache-control']).toBe('no-store');
    expect(typeof dataOf(ok).generatedAt).toBe('string');
  });

  it('customers/operations có range 30 ngày mặc định; inventory có slowDays 30', async () => {
    for (const p of ['/admin/analytics/customers', '/admin/analytics/operations']) {
      const d = dataOf(await fx.call('get', p, admin.who));
      expect(d.range.days).toBe(30);
      expect(d.range.timezone).toBe('Asia/Ho_Chi_Minh');
      expect(d.previousRange.to < d.range.from).toBe(true);
    }
    expect(dataOf(await fx.call('get', '/admin/analytics/inventory', admin.who)).slowDays).toBe(30);
    expect(
      dataOf(await fx.call('get', '/admin/analytics/inventory?slowDays=7', admin.who)).slowDays,
    ).toBe(7);
    expect(
      dataOf(await fx.call('get', '/admin/analytics/inventory?slowDays=365', admin.who)).slowDays,
    ).toBe(365);
  });

  const cases: Array<[string, string, string]> = [
    ['slowDays 6', '/admin/analytics/inventory?slowDays=6', 'slowDays'],
    ['slowDays 366', '/admin/analytics/inventory?slowDays=366', 'slowDays'],
    ['slowDays abc', '/admin/analytics/inventory?slowDays=abc', 'slowDays'],
    ['slowDays thập phân', '/admin/analytics/inventory?slowDays=7.5', 'slowDays'],
    ['slowDays âm', '/admin/analytics/inventory?slowDays=-30', 'slowDays'],
    ['slowDays lặp', '/admin/analytics/inventory?slowDays=7&slowDays=8', 'slowDays'],
    ['customers from sai', '/admin/analytics/customers?from=2034-02-30', 'from'],
    ['customers from > to', '/admin/analytics/customers?from=2025-06-15&to=2025-06-10', 'from'],
    ['customers quá 366 ngày', '/admin/analytics/customers?from=2020-01-01&to=2022-01-01', 'to'],
    ['operations to sau hôm nay', '/admin/analytics/operations?to=2099-01-01', 'to'],
    ['operations from lặp', '/admin/analytics/operations?from=2025-01-01&from=2025-01-02', 'from'],
  ];
  it.each(cases)('400 VALIDATION_ERROR: %s', async (_n, path, field) => {
    const res = await fx.call('get', path, admin.who);
    expect(res.status).toBe(400);
    expect(errOf(res).code).toBe('VALIDATION_ERROR');
    const details = (errOf(res) as unknown as { details: Array<{ field: string }> }).details;
    expect(details.map((x) => x.field)).toContain(field);
  });
});

describe('customers - khách mua lần đầu và quay lại', () => {
  const g = (name: string) => `${PREFIX}${name}@example.test`;

  beforeAll(async () => {
    // A: khách tài khoản, 2 đơn trong kỳ với 2 contactEmail khác nhau -> một khách theo userId.
    await mkOrder({
      email: customer.email,
      userId: customer.id,
      paid: '2034-03-11T03:00:00Z',
      total: 100000,
    });
    await mkOrder({
      email: g('a-khac'),
      userId: customer.id,
      paid: '2034-03-13T03:00:00Z',
      total: 50000,
    });
    // G: vãng lai, email khác hoa thường gộp một khách; đơn trước đó bị hủy -> vẫn lần đầu.
    await mkOrder({
      email: g('Guest'),
      paid: '2034-03-12T03:00:00Z',
      total: 200000,
    });
    await mkOrder({ email: g('guest'), paid: '2034-03-14T03:00:00Z', total: 100000 });
    await mkOrder({
      email: g('GUEST'),
      status: 'CANCELLED',
      paid: '2034-03-02T03:00:00Z',
      total: 999000,
    });
    // R1: vãng lai, có đơn trước kỳ trước (20/02) -> quay lại.
    await mkOrder({ email: g('r1'), paid: '2034-02-20T03:00:00Z', total: 11000 });
    await mkOrder({ email: g('R1'), paid: '2034-03-12T05:00:00Z', total: 80000 });
    // R2: tài khoản, đơn đầu ở kỳ trước (05/03) -> lần đầu ở kỳ trước, quay lại ở kỳ này.
    const r2 = await prisma.user.create({
      data: { email: g('r2'), passwordHash: 'x', fullName: 'R2' },
    });
    await mkOrder({ email: g('r2'), userId: r2.id, paid: '2034-03-05T03:00:00Z', total: 60000 });
    await mkOrder({ email: g('r2'), userId: r2.id, paid: '2034-03-15T03:00:00Z', total: 70000 });
    // Kỳ trước: P2 vãng lai 2 đơn (lần đầu, mua lại).
    await mkOrder({ email: g('p2'), paid: '2034-03-06T03:00:00Z', total: 30000 });
    await mkOrder({ email: g('p2'), paid: '2034-03-07T03:00:00Z', total: 40000 });
    // Một đơn thanh toán vừa xong (đồng hồ thật) để kiểm route với dữ liệu.
    const nowIso = new Date().toISOString();
    await mkOrder({ email: g('hom-nay'), paid: nowIso, created: nowIso, total: 100000 });
    // Bị loại: COD chưa thu, đơn trả hàng.
    await mkOrder({ email: g('n1'), status: 'CONFIRMED', created: '2034-03-12T06:00:00Z' });
    await mkOrder({
      email: g('n2'),
      status: 'RETURNED',
      paid: '2034-03-12T04:00:00Z',
      total: 777000,
    });
  });

  it('đếm khách mua / lần đầu / quay lại / tỷ lệ mua lại đúng định nghĩa', async () => {
    const c = await getCustomers(Q, NOW);
    expect(c.range).toMatchObject({ from: '2034-03-10', to: '2034-03-15', days: 6 });
    expect(c.previousRange).toEqual({ from: '2034-03-04', to: '2034-03-09' });
    // Kỳ này: A, G (lần đầu), R1, R2 (quay lại).
    expect(c.buyers).toEqual({ current: 4, previous: 2, changePct: 100 });
    expect(c.firstTime).toEqual({ current: 2, previous: 2, changePct: 0 });
    expect(c.returning).toEqual({ current: 2, previous: 0, changePct: null });
    // Có >= 2 đơn trong kỳ: A, G -> 2/4. Kỳ trước: P2 -> 1/2.
    expect(c.repeatRate).toEqual({ current: 0.5, previous: 0.5, changePts: 0 });
    // A 150.000 + G 300.000 = 450.000; R1 80.000 + R2 70.000 = 150.000.
    expect(c.firstTimeRevenue).toEqual({ current: 450000, previous: 130000, changePct: 246.2 });
    expect(c.returningRevenue.current).toBe(150000);
    expect(c.returningRevenue.previous).toBe(0);
  });

  it('bất biến: lần đầu + quay lại = khách mua; doanh thu hai nhóm = doanh thu overview', async () => {
    const [c, o] = await Promise.all([getCustomers(Q, NOW), getOverview(Q, NOW)]);
    expect(c.firstTime.current + c.returning.current).toBe(c.buyers.current);
    expect(c.firstTime.previous + c.returning.previous).toBe(c.buyers.previous);
    expect(c.firstTimeRevenue.current + c.returningRevenue.current).toBe(o.kpis.revenue.current);
    expect(c.firstTimeRevenue.previous + c.returningRevenue.previous).toBe(o.kpis.revenue.previous);
  });

  it('không có khách: mọi số 0, tỷ lệ 0, changePct/Pts null; API trả cùng dữ liệu', async () => {
    const c = await getCustomers({ from: '2034-01-10', to: '2034-01-15' }, NOW);
    expect(c.buyers).toEqual({ current: 0, previous: 0, changePct: null });
    expect(c.repeatRate).toEqual({ current: 0, previous: 0, changePts: null });
    // Route dùng đồng hồ thật: một đơn thanh toán vừa xong của khách mới nằm trong khoảng mặc định.
    const res = await fx.call('get', '/admin/analytics/customers', admin.who);
    expect(res.status).toBe(200);
    const d = dataOf(res);
    expect(d.buyers.current).toBeGreaterThanOrEqual(1);
    expect(d.firstTime.current + d.returning.current).toBe(d.buyers.current);
    expect(d.firstTimeRevenue.current).toBeGreaterThanOrEqual(100000);
  });

  it('không lộ dữ liệu cá nhân (không email/tên khách trong response)', async () => {
    const res = await fx.call('get', '/admin/analytics/customers', admin.who);
    expect(JSON.stringify(res.body)).not.toContain('@');
  });
});

describe('operations - hủy, trả hàng, hoàn tiền, thời gian xử lý, cần xử lý', () => {
  const g = (name: string) => `${PREFIX}${name}@example.test`;
  const codeOf: Record<string, string> = {};

  beforeAll(async () => {
    const mkc = async (
      key: string,
      o: Parameters<typeof mkOrder>[0],
      doCancel?: () => Promise<void>,
    ) => {
      const ord = await mkOrder(o);
      codeOf[key] = ord.code;
      if (doCancel) await doCancel();
      return ord;
    };
    // Kỳ này (đơn tạo 10..15/03), 6 đơn hủy.
    const c1 = await mkc('cCust', {
      email: customer.email,
      userId: customer.id,
      status: 'PENDING',
      created: '2034-03-10T03:00:00Z',
    });
    await cancel(c1.id, 'PENDING', 'CUSTOMER', customer.id, 'Đổi ý');
    const c2 = await mkc('cGuest', {
      email: g('huy-vanglai'),
      status: 'PENDING',
      created: '2034-03-10T04:00:00Z',
    });
    await cancel(c2.id, 'PENDING', 'CUSTOMER', null, 'Đặt nhầm');
    const c3 = await mkc('cStaff', {
      email: g('huy-staff'),
      status: 'CONFIRMED',
      created: '2034-03-11T04:00:00Z',
    });
    await cancel(c3.id, 'CONFIRMED', 'STAFF', staff.id, 'Hết hàng');
    const c4 = await mkc('cAdmin', {
      email: g('huy-admin'),
      status: 'PROCESSING',
      created: '2034-03-11T05:00:00Z',
    });
    await cancel(c4.id, 'PROCESSING', 'ADMIN', admin.id, 'Khách yêu cầu');
    // Hết hạn qua job thật (actor SYSTEM, actorId null, from PENDING_PAYMENT).
    const c5 = await mkc('cExpired', {
      email: g('het-han'),
      status: 'PENDING_PAYMENT',
      method: 'VNPAY',
      created: '2034-03-12T04:00:00Z',
      expiresAt: '2034-03-12T04:15:00Z',
    });
    const expired = await runExpirePendingPaymentsOnce(NOW);
    expect(expired.skipped).toBe(false);
    // Không có dòng lịch sử -> không rõ.
    await mkc('cUnknown', {
      email: g('khong-ro'),
      status: 'CANCELLED',
      created: '2034-03-13T04:00:00Z',
    });
    // Khách TÀI KHOẢN hủy đơn PENDING_PAYMENT với lý do trùng lý do của job: actorId khác null nên vẫn
    // là "khách hủy" (chỉ actorId null + from PENDING_PAYMENT + note khớp mới là "hết hạn").
    const c7 = await mkc('cCustPendingPay', {
      email: customer.email,
      userId: customer.id,
      status: 'PENDING',
      created: '2034-03-14T04:00:00Z',
    });
    await prisma.order.update({ where: { id: c7.id }, data: { status: 'PENDING_PAYMENT' } });
    await prisma.$transaction((tx) =>
      cancelOrderTx(tx, {
        orderId: c7.id,
        from: 'PENDING_PAYMENT',
        actor: 'CUSTOMER',
        actorId: customer.id,
        reason: EXPIRE_REASON,
        now: NOW,
      }),
    );
    // Kỳ trước: 1 đơn staff hủy (tạo 05/03).
    const p1 = await mkc('pStaff', {
      email: g('prev-huy'),
      status: 'CONFIRMED',
      created: '2034-03-05T04:00:00Z',
    });
    await cancel(p1.id, 'CONFIRMED', 'STAFF', staff.id, 'Hết hàng');

    // Giao hàng. Kỳ này: D1..D3 COD, D4 VNPAY (RETURNED).
    // confirm (COD): 1, 3, 8 giờ; giao: 10, 20, 30, 40 giờ sau confirmedAt.
    const mkd = (
      key: string,
      created: string,
      confirmHours: number,
      deliverHours: number,
      method: 'COD' | 'VNPAY',
      status: Status = 'DELIVERED',
    ) => {
      const confirmed = new Date(at(created).getTime() + confirmHours * HOUR);
      const delivered = new Date(confirmed.getTime() + deliverHours * HOUR);
      return mkc(key, {
        email: g(key),
        status,
        method,
        paid: delivered.toISOString(),
        created,
        confirmedAt: confirmed.toISOString(),
        deliveredAt: delivered.toISOString(),
      });
    };
    await mkd('d1', '2034-03-10T00:00:00Z', 1, 10, 'COD');
    await mkd('d2', '2034-03-10T00:00:00Z', 3, 20, 'COD');
    await mkd('d3', '2034-03-10T00:00:00Z', 8, 30, 'COD');
    await mkd('d4', '2034-03-10T00:00:00Z', 40, 40, 'VNPAY', 'RETURNED');
    // Kỳ trước: 2 đơn giao (confirm 2h và 4h; giao 12h và 18h).
    await mkd('pd1', '2034-03-05T00:00:00Z', 2, 12, 'COD');
    await mkd('pd2', '2034-03-05T00:00:00Z', 4, 18, 'COD');

    // Hoàn tiền: kỳ này 2 (50.000 + 30.000), kỳ trước 1 (20.000).
    const orderOf = async (key: string) =>
      (await prisma.order.findUnique({ where: { code: codeOf[key]! } }))!;
    const pay = async (
      key: string,
      amount: number,
      refundedAt: string,
      status: 'REFUNDED' | 'SUCCEEDED' = 'REFUNDED',
      refunded = true,
    ) =>
      prisma.payment.create({
        data: {
          orderId: (await orderOf(key)).id,
          provider: 'VNPAY',
          amount,
          status,
          refundedAt: refunded ? at(refundedAt) : null,
        },
      });
    await pay('d4', 50000, '2034-03-12T03:00:00Z');
    await pay('d1', 30000, '2034-03-14T03:00:00Z');
    await pay('pd1', 20000, '2034-03-06T03:00:00Z');
    // Đơn hủy có Payment SUCCEEDED -> cần hoàn tiền.
    await pay('cExpired', 10000, '', 'SUCCEEDED', false);

    // Cần xử lý: PENDING 23 giờ (không tính), 25 giờ và 72 giờ (tính), trả hàng 1, giao thất bại 2.
    await mkOrder({
      email: g('pend23'),
      status: 'PENDING',
      created: new Date(NOW.getTime() - 23 * HOUR).toISOString(),
    }).then((o) => (codeOf.pend23 = o.code));
    await mkOrder({
      email: g('pend25'),
      status: 'PENDING',
      created: new Date(NOW.getTime() - 25 * HOUR).toISOString(),
      total: 123000,
    }).then((o) => (codeOf.pend25 = o.code));
    await mkOrder({
      email: g('pend72'),
      status: 'PENDING',
      created: new Date(NOW.getTime() - 72 * HOUR).toISOString(),
    }).then((o) => (codeOf.pend72 = o.code));
    await mkOrder({
      email: g('rr'),
      status: 'RETURN_REQUESTED',
      created: '2034-03-12T01:00:00Z',
    });
    await mkOrder({ email: g('fd1'), status: 'FAILED_DELIVERY', created: '2034-03-12T01:00:00Z' });
    await mkOrder({ email: g('fd2'), status: 'FAILED_DELIVERY', created: '2034-03-12T02:00:00Z' });
    // c5 chỉ để tránh cảnh báo biến không dùng.
    expect(c5.code).toBeTruthy();
  });

  it('phân loại hủy: khách / cửa hàng (staff + admin) / hết hạn / không rõ; tổng = overview', async () => {
    const [op, ov] = await Promise.all([getOperations(Q, NOW), getOverview(Q, NOW)]);
    const by = Object.fromEntries(op.cancellations.byType.map((t) => [t.type, t]));
    expect(op.cancellations.byType.map((t) => t.type)).toEqual([
      'customer',
      'store',
      'expired',
      'unknown',
    ]);
    expect(by.customer).toMatchObject({ label: 'Khách hủy', current: 3, previous: 0 });
    expect(by.store).toMatchObject({ label: 'Cửa hàng hủy', current: 2, previous: 1 });
    expect(by.expired).toMatchObject({ label: 'Hết hạn tự động', current: 1, previous: 0 });
    expect(by.unknown).toMatchObject({ label: 'Không rõ', current: 1, previous: 0 });
    expect(op.cancellations.total).toEqual({ current: 7, previous: 1, changePct: 600 });
    expect(op.cancellations.total.current).toBe(ov.kpis.cancelledOrders.current);
    expect(op.cancellations.total.previous).toBe(ov.kpis.cancelledOrders.previous);
    expect(op.cancellations.byType.reduce((s, t) => s + t.current, 0)).toBe(
      op.cancellations.total.current,
    );
  });

  it('job hết hạn thật ghi history đúng như quy ước phân loại', async () => {
    const o = await prisma.order.findUnique({
      where: { code: codeOf.cExpired! },
      include: { history: true },
    });
    expect(o?.status).toBe('CANCELLED');
    const h = o!.history.find((x) => x.toStatus === 'CANCELLED')!;
    expect(h).toMatchObject({ actorId: null, fromStatus: 'PENDING_PAYMENT', note: EXPIRE_REASON });
  });

  it('dùng dòng history CANCELLED mới nhất của đơn', async () => {
    const o = (await prisma.order.findUnique({ where: { code: codeOf.cExpired! } }))!;
    // Thêm dòng mới hơn do staff: đơn chuyển từ "hết hạn" sang "cửa hàng".
    const row = await prisma.orderStatusHistory.create({
      data: {
        orderId: o.id,
        fromStatus: 'PENDING_PAYMENT',
        toStatus: 'CANCELLED',
        note: 'ghi chú khác',
        actorId: staff.id,
        createdAt: new Date(Date.now() + 60_000),
      },
    });
    const op = await getOperations(Q, NOW);
    const by = Object.fromEntries(op.cancellations.byType.map((t) => [t.type, t.current]));
    expect(by).toMatchObject({ customer: 3, store: 3, expired: 0, unknown: 1 });
    await prisma.orderStatusHistory.delete({ where: { id: row.id } });
    const back = await getOperations(Q, NOW);
    expect(back.cancellations.byType.find((t) => t.type === 'expired')!.current).toBe(1);
  });

  it('tỷ lệ trả hàng: đơn có deliveredAt trong kỳ hiện đang RETURNED / đơn có deliveredAt trong kỳ', async () => {
    const op = await getOperations(Q, NOW);
    expect(op.returns.delivered).toEqual({ current: 4, previous: 2, changePct: 100 });
    expect(op.returns.returned).toEqual({ current: 1, previous: 0, changePct: null });
    expect(op.returns.rate).toEqual({ current: 0.25, previous: 0, changePts: 25 });
    const none = await getOperations({ from: '2034-01-10', to: '2034-01-15' }, NOW);
    expect(none.returns.rate).toEqual({ current: 0, previous: 0, changePts: null });
  });

  it('hoàn tiền: số lần và số tiền khớp overview kpis.refundedAmount', async () => {
    const [op, ov] = await Promise.all([getOperations(Q, NOW), getOverview(Q, NOW)]);
    expect(op.refunds.count).toEqual({ current: 2, previous: 1, changePct: 100 });
    expect(op.refunds.amount).toEqual({ current: 80000, previous: 20000, changePct: 300 });
    expect(op.refunds.amount.current).toBe(ov.kpis.refundedAmount.current);
    expect(op.refunds.amount.previous).toBe(ov.kpis.refundedAmount.previous);
  });

  it('thời gian xử lý: avg/median/n, đơn online bị loại khỏi confirmHours, kèm kỳ trước', async () => {
    const op = await getOperations(Q, NOW);
    // Xác nhận (COD): 1, 3, 8 giờ; D4 (VNPAY, 40 giờ) bị loại.
    expect(op.fulfillment.confirmHours).toEqual({ avg: 4, median: 3, n: 3, previousAvg: 3 });
    // Giao: 10, 20, 30, 40 giờ.
    expect(op.fulfillment.deliveryHours).toEqual({ avg: 25, median: 25, n: 4, previousAvg: 15 });
    const none = await getOperations({ from: '2034-01-10', to: '2034-01-15' }, NOW);
    expect(none.fulfillment.confirmHours).toEqual({
      avg: null,
      median: null,
      n: 0,
      previousAvg: null,
    });
    expect(none.fulfillment.deliveryHours.n).toBe(0);
  });

  it('cần xử lý: PENDING 23 giờ không tính, 25 giờ tính; cũ nhất trước, không có PII', async () => {
    const op = await getOperations(Q, NOW);
    const a = op.attention;
    expect(a.pendingOver24h.count - baseOps.attention.pendingOver24h.count).toBe(2);
    const mine = a.pendingOver24h.oldest.filter((x) => codes.includes(x.code));
    expect(mine.map((x) => x.code)).toEqual([codeOf.pend72, codeOf.pend25]);
    expect(mine[0]).toMatchObject({ waitingHours: 72 });
    expect(mine[1]).toMatchObject({ waitingHours: 25, grandTotal: 123000 });
    expect(a.pendingOver24h.oldest.map((x) => x.code)).not.toContain(codeOf.pend23);
    expect(a.pendingOver24h.oldest.length).toBeLessThanOrEqual(10);
    expect(Object.keys(mine[0]!).sort()).toEqual([
      'code',
      'createdAt',
      'grandTotal',
      'waitingHours',
    ]);
    expect(a.needsRefund - baseOps.attention.needsRefund).toBe(1);
    expect(a.returnRequested - baseOps.attention.returnRequested).toBe(1);
    expect(a.failedDelivery - baseOps.attention.failedDelivery).toBe(2);
  });

  it('API trả cùng cấu trúc, không lộ email/SĐT', async () => {
    const res = await fx.call('get', '/admin/analytics/operations', admin.who);
    expect(res.status).toBe(200);
    const d = dataOf(res);
    expect(d.cancellations.byType).toHaveLength(4);
    expect(
      d.cancellations.byType.reduce((n: number, t: { current: number }) => n + t.current, 0),
    ).toBe(d.cancellations.total.current);
    expect(Object.keys(d.attention).sort()).toEqual(
      ['failedDelivery', 'needsRefund', 'pendingOver24h', 'returnRequested'].sort(),
    );
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('@');
    expect(text).not.toContain('0912345678');
  });
});

describe('inventory - tồn kho', () => {
  const inScope: Array<{ stock: number; price: number }> = [];
  const sku: Record<string, string> = {};
  const ids: Record<string, string> = {};

  async function variant(
    key: string,
    o: {
      stock: number;
      price?: number;
      salePrice?: number;
      isActive?: boolean;
      deleted?: boolean;
      productDeleted?: boolean;
      createdDaysAgo?: number;
      lowStockThreshold?: number;
    },
  ) {
    const v = await fx.mkVariant(key, {
      stock: o.stock,
      price: o.price ?? 100000,
      isActive: o.isActive ?? true,
    });
    await prisma.productVariant.update({
      where: { id: v.id },
      data: {
        salePrice: o.salePrice ?? null,
        deletedAt: o.deleted ? new Date() : null,
        lowStockThreshold: o.lowStockThreshold ?? 5,
        ...(o.createdDaysAgo !== undefined
          ? { createdAt: new Date(NOW.getTime() - o.createdDaysAgo * DAY) }
          : {}),
      },
    });
    if (o.productDeleted) {
      await prisma.product.update({ where: { id: v.productId }, data: { deletedAt: new Date() } });
    }
    sku[key] = v.sku;
    ids[key] = v.id;
    if ((o.isActive ?? true) && !o.deleted && !o.productDeleted) {
      inScope.push({ stock: o.stock, price: o.price ?? 100000 });
    }
    return v;
  }
  let baseInv: Awaited<ReturnType<typeof getInventory>>;

  beforeAll(async () => {
    // Mốc so sánh lấy ngay trước khi tạo biến thể (các đơn hủy trước đó đã hoàn kho vào biến thể base).
    baseInv = await getInventory({}, NOW);
    // Có bán gần đây -> không thuộc bán chậm ở mọi slowDays >= 7.
    const recent = async (key: string, o: Parameters<typeof variant>[1]) => {
      const v = await variant(key, o);
      const ord = await mkOrder({
        email: `${PREFIX}recent-${key}@example.test`,
        status: 'DELIVERED',
        created: new Date(NOW.getTime() - 1 * DAY).toISOString(),
        variantId: v.id,
        productId: v.productId,
      });
      expect(ord.id).toBeTruthy();
    };
    // Hết hàng
    await variant('out1', { stock: 0 });
    await variant('out2', { stock: 0, isActive: false });
    await variant('out3', { stock: 0, deleted: true });
    await variant('out4', { stock: 0, productDeleted: true });
    // Sắp hết (ngưỡng 5): 1, 2, 5 là sắp hết; 6 không.
    await recent('lowa', { stock: 1 });
    await recent('lowb', { stock: 2 });
    await recent('lowc', { stock: 5 });
    await recent('lowd', { stock: 6 });
    // Giá trị tồn dùng price, không dùng salePrice.
    await recent('val', { stock: 10, price: 200000, salePrice: 100000 });
    // Bán chậm.
    await variant('never', { stock: 20, price: 50000 }); // chưa từng bán: 1.000.000
    await variant('oldsale', { stock: 30, price: 10000 }); // bán 40 ngày trước: 300.000
    await variant('canc', { stock: 8, price: 100000 }); // chỉ có đơn CANCELLED: 800.000
    await variant('pendpay', { stock: 3, price: 100000 }); // chỉ có đơn PENDING_PAYMENT: 300.000
    await variant('recent10', { stock: 15, price: 20000 }); // bán 10 ngày trước
    await variant('newv', { stock: 9, price: 100000, createdDaysAgo: 5 }); // mới tạo, chưa bán
    await variant('solnow', { stock: 4, price: 100000 }); // bán 2 ngày trước (PENDING)
    await variant('inact', { stock: 50, price: 100000, isActive: false }); // không thuộc phạm vi
    await variant('del', { stock: 50, price: 100000, deleted: true });
    for (const [key, days, status] of [
      ['oldsale', 40, 'DELIVERED'],
      ['canc', 12, 'CANCELLED'],
      ['pendpay', 3, 'PENDING_PAYMENT'],
      ['recent10', 10, 'DELIVERED'],
      ['solnow', 2, 'CONFIRMED'],
    ] as const) {
      const v = await prisma.productVariant.findUnique({ where: { id: ids[key]! } });
      await mkOrder({
        email: `${PREFIX}sell-${key}@example.test`,
        status,
        created: new Date(NOW.getTime() - days * DAY).toISOString(),
        variantId: v!.id,
        productId: v!.productId,
      });
    }
  });

  const mine = <T extends { sku: string }>(list: T[]) =>
    list.filter((i) => i.sku.startsWith(PREFIX.toUpperCase()));

  it('hết hàng: chỉ biến thể active/chưa xóa của sản phẩm chưa xóa, stock <= 0', async () => {
    const inv = await getInventory({}, NOW);
    expect(mine(inv.outOfStock).map((i) => i.sku)).toEqual([sku.out1]);
    expect(inv.outOfStock.every((i) => i.stock <= 0)).toBe(true);
    expect(mine(inv.outOfStock)[0]).toMatchObject({ stockValue: 0, price: 100000 });
    expect(inv.summary.outOfStock - baseInv.summary.outOfStock).toBe(1);
  });

  it('sắp hết: 0 < stock <= ngưỡng, sắp theo stock tăng dần', async () => {
    const inv = await getInventory({}, NOW);
    const low = mine(inv.lowStock);
    expect(low.map((i) => [i.sku, i.stock])).toEqual([
      [sku.lowa, 1],
      [sku.lowb, 2],
      [sku.pendpay, 3],
      [sku.solnow, 4],
      [sku.lowc, 5],
    ]);
    expect(low[0]).toMatchObject({ lowStockThreshold: 5, stockValue: 100000 });
    expect(inv.lowStock.map((i) => i.stock)).toEqual(
      [...inv.lowStock.map((i) => i.stock)].sort((a, b) => a - b),
    );
    expect(inv.summary.lowStock - baseInv.summary.lowStock).toBe(5);
  });

  it('giá trị tồn dùng giá niêm yết (price), không dùng salePrice', async () => {
    const inv = await getInventory({}, NOW);
    const expectedValue = inScope
      .filter((v) => v.stock > 0)
      .reduce((s, v) => s + v.stock * v.price, 0);
    const expectedUnits = inScope.filter((v) => v.stock > 0).reduce((s, v) => s + v.stock, 0);
    expect(inv.summary.stockValue - baseInv.summary.stockValue).toBe(expectedValue);
    expect(inv.summary.stockUnits - baseInv.summary.stockUnits).toBe(expectedUnits);
    expect(inv.summary.variants - baseInv.summary.variants).toBe(inScope.length);
    // `val`: 10 x 200.000 (price) nằm trong tổng; dùng salePrice 100.000 sẽ làm tổng lệch 1.000.000.
    expect(inScope.some((v) => v.stock === 10 && v.price === 200000)).toBe(true);
  });

  it('bán chậm (30 ngày): loại biến thể mới, đơn CANCELLED/PENDING_PAYMENT không phải bán; sắp theo giá trị tồn giảm dần', async () => {
    const inv = await getInventory({ slowDays: 30 }, NOW);
    expect(inv.slowDays).toBe(30);
    const slow = mine(inv.slowMovers);
    expect(slow.map((i) => [i.sku, i.stockValue])).toEqual([
      [sku.never, 1_000_000],
      [sku.canc, 800_000],
      [sku.oldsale, 300_000],
      [sku.pendpay, 300_000],
    ]);
    const bySku = Object.fromEntries(slow.map((i) => [i.sku, i]));
    expect(bySku[sku.never!]!.lastSoldAt).toBeNull();
    expect(bySku[sku.canc!]!.lastSoldAt).toBeNull();
    expect(bySku[sku.pendpay!]!.lastSoldAt).toBeNull();
    expect(bySku[sku.oldsale!]!.lastSoldAt).toBe(new Date(NOW.getTime() - 40 * DAY).toISOString());
    expect(inv.summary.slowMovers - baseInv.summary.slowMovers).toBe(4);
    expect(inv.summary.slowMoversValue - baseInv.summary.slowMoversValue).toBe(
      1_000_000 + 800_000 + 300_000 + 300_000,
    );
    // Danh sách tối đa 20.
    expect(inv.slowMovers.length).toBeLessThanOrEqual(20);
  });

  it('slowDays đổi kết quả: 60 ngày loại oldsale; 7 ngày thêm recent10', async () => {
    const d60 = mine((await getInventory({ slowDays: 60 }, NOW)).slowMovers).map((i) => i.sku);
    expect(d60).toEqual([sku.never, sku.canc, sku.pendpay]);
    const d7 = mine((await getInventory({ slowDays: 7 }, NOW)).slowMovers);
    expect(new Set(d7.map((i) => i.sku))).toEqual(
      new Set([sku.never, sku.canc, sku.oldsale, sku.recent10, sku.pendpay]),
    );
    // newv tạo 5 ngày trước: bị loại ở cả 7 và 30 ngày.
    expect(d7.map((i) => i.sku)).not.toContain(sku.newv);
  });

  it('biến thể inactive / đã xóa / sản phẩm đã xóa không xuất hiện ở bất kỳ danh sách nào', async () => {
    const inv = await getInventory({ slowDays: 7 }, NOW);
    const all = [...inv.outOfStock, ...inv.lowStock, ...inv.slowMovers].map((i) => i.sku);
    for (const key of ['out2', 'out3', 'out4', 'inact', 'del']) {
      expect(all).not.toContain(sku[key]);
    }
  });

  it('API: trả tối đa 20 mỗi danh sách và cấu trúc item đầy đủ', async () => {
    const res = await fx.call('get', '/admin/analytics/inventory?slowDays=30', admin.who);
    expect(res.status).toBe(200);
    const d = dataOf(res);
    expect(Object.keys(d.summary).sort()).toEqual(
      [
        'lowStock',
        'outOfStock',
        'slowMovers',
        'slowMoversValue',
        'stockCostValue',
        'stockUnits',
        'stockValue',
        'variants',
        'variantsWithoutCost',
      ].sort(),
    );
    for (const list of [d.outOfStock, d.lowStock, d.slowMovers]) {
      expect(list.length).toBeLessThanOrEqual(20);
    }
    const item = d.outOfStock.find((i: { sku: string }) => i.sku === sku.out1);
    expect(item).toMatchObject({
      variantId: ids.out1,
      productName: expect.stringContaining('out1'),
      variantName: 'Biến thể out1',
      stock: 0,
      lowStockThreshold: 5,
      price: 100000,
      stockValue: 0,
      lastSoldAt: null,
    });
    expect(typeof item.productId).toBe('string');
  });
});
