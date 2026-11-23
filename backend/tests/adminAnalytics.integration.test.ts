import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { getOverview } from '../src/modules/admin/analytics/analytics.service.js';
import { API } from './authHelpers.js';
import { createFixtures, dataOf, errOf, type Who } from './checkoutHelpers.js';

const PREFIX = 'tm10a-';
const BIG = 100_000;

let app: Express;
const fx = createFixtures(() => app, PREFIX);
let admin: { id: string; who: Who };
let staff: { id: string; who: Who };
let customer: { id: string; who: Who };

// Mốc cố định ở tương lai xa để không lẫn với dữ liệu test khác.
// 2031-06-15T10:00Z = 17:00 ngày 15/06 giờ VN (Chủ nhật).
const NOW = new Date('2031-06-15T10:00:00.000Z');
const Q = { from: '2031-06-10', to: '2031-06-15' } as const; // 6 ngày; kỳ trước 2031-06-04..09

let seq = 0;
async function mkOrder(
  over: {
    status?: 'DELIVERED' | 'CANCELLED' | 'RETURNED' | 'PENDING';
    paymentStatus?: 'UNPAID' | 'PAID' | 'REFUNDED';
    grandTotal: number;
    discountTotal?: number;
    createdAt: string;
    paidAt?: string;
  },
  tag: string,
) {
  return prisma.order.create({
    data: {
      code: `BB-T10${++seq}-${randomUUID().slice(0, 6)}`,
      contactEmail: `${PREFIX}${tag}@example.test`,
      contactPhone: '0912345678',
      status: over.status ?? 'DELIVERED',
      paymentStatus: over.paymentStatus ?? 'PAID',
      paymentMethod: 'COD',
      shippingMethod: 'STANDARD',
      shippingAddress: {},
      subtotal: over.grandTotal + (over.discountTotal ?? 0),
      discountTotal: over.discountTotal ?? 0,
      shippingFee: 0,
      grandTotal: over.grandTotal,
      idempotencyKey: randomUUID(),
      requestFingerprint: 'x',
      createdAt: new Date(over.createdAt),
      ...(over.paidAt ? { paidAt: new Date(over.paidAt) } : {}),
    },
  });
}

beforeAll(async () => {
  app = createApp({ generalRateLimit: BIG, authRateLimit: BIG });
  await fx.setup();
  admin = await fx.mkUser('admin');
  await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
  staff = await fx.mkUser('staff');
  await prisma.user.update({ where: { id: staff.id }, data: { role: 'STAFF' } });
  customer = await fx.mkUser('cust');
});
afterAll(async () => {
  await prisma.payment.deleteMany({ where: { order: { contactEmail: { startsWith: PREFIX } } } });
  await fx.clean();
  await prisma.$disconnect();
});

describe('GET /admin/analytics/overview - quyền', () => {
  it('401 khi chưa đăng nhập, 403 với customer và staff, 200 với admin, no-store', async () => {
    const noAuth = await request(app).get(`${API}/admin/analytics/overview`);
    expect(noAuth.status).toBe(401);
    expect(noAuth.headers['cache-control']).toBe('no-store');
    const cust = await fx.call('get', '/admin/analytics/overview', customer.who);
    expect(cust.status).toBe(403);
    const st = await fx.call('get', '/admin/analytics/overview', staff.who);
    expect(st.status).toBe(403);
    expect(errOf(st).code).toBe('FORBIDDEN');
    expect(st.headers['cache-control']).toBe('no-store');
    const ok = await fx.call('get', '/admin/analytics/overview', admin.who);
    expect(ok.status).toBe(200);
    expect(ok.headers['cache-control']).toBe('no-store');
    const d = dataOf(ok);
    expect(d.range.days).toBe(30);
    expect(d.range.granularity).toBe('day');
    expect(d.range.timezone).toBe('Asia/Ho_Chi_Minh');
    expect(d.series).toHaveLength(30);
    expect(d.previousSeries).toHaveLength(30);
    expect(Object.keys(d.kpis).sort()).toEqual(
      [
        'aov',
        'cancelRate',
        'cancelledOrders',
        'costCoverage',
        'discountTotal',
        'grossMargin',
        'grossProfit',
        'newCustomers',
        'ordersPlaced',
        'paidOrders',
        'refundedAmount',
        'revenue',
      ].sort(),
    );
    expect(typeof d.generatedAt).toBe('string');
  });
});

describe('GET /admin/analytics/overview - validate', () => {
  const tomorrowVn = new Date(Date.now() + 7 * 3600_000 + 24 * 3600_000).toISOString().slice(0, 10);
  const cases: Array<[string, string, string]> = [
    ['định dạng from sai', 'from=10/06/2031&to=2031-06-15', 'from'],
    ['ngày không tồn tại', 'from=2031-02-30&to=2031-06-15', 'from'],
    ['to không tồn tại', 'from=2031-06-01&to=2031-13-01', 'to'],
    ['from > to', 'from=2025-06-15&to=2025-06-10', 'from'],
    ['to sau hôm nay VN', `from=2031-01-01&to=${tomorrowVn}`, 'to'],
    ['quá 366 ngày', 'from=2020-01-01&to=2022-01-01', 'to'],
    ['from < 2020-01-01', 'from=2019-12-31&to=2020-01-10', 'from'],
    ['granularity sai', 'granularity=year', 'granularity'],
    ['from lặp', 'from=2031-06-01&from=2031-06-02', 'from'],
  ];
  it.each(cases)('400 VALIDATION_ERROR: %s', async (_name, qs, field) => {
    const res = await fx.call('get', `/admin/analytics/overview?${qs}`, admin.who);
    expect(res.status).toBe(400);
    expect(errOf(res).code).toBe('VALIDATION_ERROR');
    const details = (errOf(res) as unknown as { details: Array<{ field: string }> }).details;
    expect(details.map((x) => x.field)).toContain(field);
  });

  it('chỉ có from hoặc chỉ có to: 200 với khoảng 30 ngày', async () => {
    const a = await fx.call('get', '/admin/analytics/overview?to=2025-03-31', admin.who);
    expect(a.status).toBe(200);
    expect(dataOf(a).range).toMatchObject({ from: '2025-03-02', to: '2025-03-31', days: 30 });
    const b = await fx.call('get', '/admin/analytics/overview?from=2025-03-01', admin.who);
    expect(dataOf(b).range).toMatchObject({ from: '2025-03-01', to: '2025-03-30', days: 30 });
  });

  it('granularity theo query và mặc định theo độ dài', async () => {
    const wk = await fx.call(
      'get',
      '/admin/analytics/overview?from=2025-01-01&to=2025-03-31',
      admin.who,
    );
    expect(dataOf(wk).range.granularity).toBe('week');
    const mo = await fx.call(
      'get',
      '/admin/analytics/overview?from=2025-01-01&to=2025-12-31',
      admin.who,
    );
    expect(dataOf(mo).range.granularity).toBe('month');
    expect(dataOf(mo).series).toHaveLength(12);
    const forced = await fx.call(
      'get',
      '/admin/analytics/overview?from=2025-01-01&to=2025-12-31&granularity=day',
      admin.who,
    );
    expect(dataOf(forced).series).toHaveLength(365);
  });
});

describe('getOverview - định nghĩa chỉ số theo giờ VN', () => {
  beforeAll(async () => {
    const first = '2031-06-14T17:00:00.000Z'; // 00:00 VN 15/06 (ngày cuối kỳ)
    // Kỳ hiện tại 10..15/06
    await mkOrder(
      { grandTotal: 100000, discountTotal: 10000, createdAt: first, paidAt: first },
      'a',
    );
    const b = '2031-06-14T16:59:59.999Z'; // 23:59:59.999 VN 14/06
    await mkOrder({ grandTotal: 200000, createdAt: b, paidAt: b }, 'b');
    // COD chưa thu: không tính doanh thu nhưng tính ordersPlaced
    await mkOrder(
      {
        status: 'PENDING',
        paymentStatus: 'UNPAID',
        grandTotal: 999000,
        createdAt: '2031-06-12T03:00:00Z',
      },
      'c',
    );
    // Đã thanh toán nhưng bị hủy / trả hàng: không tính doanh thu
    await mkOrder(
      {
        status: 'CANCELLED',
        grandTotal: 500000,
        createdAt: '2031-06-11T03:00:00Z',
        paidAt: '2031-06-11T03:00:00Z',
      },
      'd',
    );
    await mkOrder(
      {
        status: 'RETURNED',
        grandTotal: 700000,
        createdAt: '2031-06-11T04:00:00Z',
        paidAt: '2031-06-11T04:00:00Z',
      },
      'e',
    );
    // Biên đầu kỳ: 2031-06-09T17:00Z = 00:00 VN 10/06 -> thuộc kỳ hiện tại
    const f = '2031-06-09T17:00:00.000Z';
    await mkOrder({ grandTotal: 50000, createdAt: f, paidAt: f }, 'f');
    // Đơn tạo ngày 9 (kỳ trước) nhưng thanh toán ngày 10 (kỳ này): doanh thu kỳ này, đơn đặt kỳ trước
    await mkOrder(
      { grandTotal: 70000, createdAt: '2031-06-09T10:00:00Z', paidAt: '2031-06-10T05:00:00Z' },
      'g',
    );
    // Kỳ trước 04..09/06
    const h = '2031-06-09T16:59:59.000Z'; // 23:59:59 VN 09/06
    await mkOrder({ grandTotal: 300000, createdAt: h, paidAt: h }, 'h');
    await mkOrder(
      {
        status: 'CANCELLED',
        paymentStatus: 'UNPAID',
        grandTotal: 1000,
        createdAt: '2031-06-05T03:00:00Z',
      },
      'i',
    );
    // Ngoài cả hai kỳ
    await mkOrder(
      { grandTotal: 888000, createdAt: '2031-06-03T16:59:59Z', paidAt: '2031-06-03T16:59:59Z' },
      'j',
    );

    // Hoàn tiền: 1 trong kỳ này (ngày 12), 1 trong kỳ trước
    const ord = await mkOrder(
      {
        status: 'CANCELLED',
        grandTotal: 40000,
        createdAt: '2031-06-04T03:00:00Z',
        paidAt: '2031-06-04T03:00:00Z',
      },
      'k',
    );
    await prisma.payment.createMany({
      data: [
        {
          orderId: ord.id,
          provider: 'STRIPE',
          amount: 40000,
          status: 'REFUNDED',
          refundedAt: new Date('2031-06-12T03:00:00Z'),
        },
        {
          orderId: ord.id,
          provider: 'STRIPE',
          amount: 25000,
          status: 'REFUNDED',
          refundedAt: new Date('2031-06-05T03:00:00Z'),
        },
        // Chưa hoàn: không tính
        { orderId: ord.id, provider: 'STRIPE', amount: 9999, status: 'SUCCEEDED' },
      ],
    });

    // Khách mới: chỉ role CUSTOMER
    await prisma.user.update({
      where: { id: customer.id },
      data: { createdAt: new Date('2031-06-12T03:00:00Z') },
    });
    await prisma.user.update({
      where: { id: staff.id },
      data: { createdAt: new Date('2031-06-12T03:00:00Z') },
    });
    await prisma.user.update({
      where: { id: admin.id },
      data: { createdAt: new Date('2031-06-06T03:00:00Z') },
    });
  });

  it('KPI kỳ hiện tại và kỳ trước đúng định nghĩa', async () => {
    const d = await getOverview(Q, NOW);
    expect(d.range).toMatchObject({
      from: '2031-06-10',
      to: '2031-06-15',
      days: 6,
      granularity: 'day',
    });
    expect(d.previousRange).toEqual({ from: '2031-06-04', to: '2031-06-09' });
    const k = d.kpis;
    // Kỳ này: a 100k + b 200k + f 50k (đúng 00:00 VN) + g 70k (đặt ngày 9, thu ngày 10) = 420k.
    // Loại: c (COD chưa thu), d (CANCELLED), e (RETURNED), j (ngoài kỳ).
    expect(k.revenue).toEqual({ current: 420000, previous: 300000, changePct: 40 });
    expect(k.paidOrders).toEqual({ current: 4, previous: 1, changePct: 300 });
    expect(k.aov).toEqual({ current: 105000, previous: 300000, changePct: -65 });
    // Đơn đặt theo createdAt, mọi trạng thái (c, d, e tính; g thuộc kỳ trước).
    expect(k.ordersPlaced).toEqual({ current: 6, previous: 4, changePct: 50 });
    expect(k.cancelledOrders).toEqual({ current: 1, previous: 2, changePct: -50 });
    expect(k.cancelRate).toEqual({ current: 0.1667, previous: 0.5, changePts: -33.3 });
    expect(k.discountTotal).toEqual({ current: 10000, previous: 0, changePct: null });
    expect(k.refundedAmount).toEqual({ current: 40000, previous: 25000, changePct: 60 });
    expect(k.newCustomers).toEqual({ current: 1, previous: 0, changePct: null });
  });

  it('series theo ngày: liên tục, điền 0, biên 23:59:59 và 00:00 VN', async () => {
    const d = await getOverview(Q, NOW);
    expect(d.series).toHaveLength(6);
    expect(d.previousSeries).toHaveLength(6);
    expect(d.series.map((p) => p.start)).toEqual([
      '2031-06-10',
      '2031-06-11',
      '2031-06-12',
      '2031-06-13',
      '2031-06-14',
      '2031-06-15',
    ]);
    const pick = (i: number) => {
      const p = d.series[i]!;
      return [p.revenue, p.paidOrders, p.ordersPlaced];
    };
    expect(pick(0)).toEqual([120000, 2, 1]); // 10/06: f + g thu; f đặt
    expect(pick(1)).toEqual([0, 0, 2]); // 11/06: d, e (không tính doanh thu)
    expect(pick(2)).toEqual([0, 0, 1]); // 12/06: c COD chưa thu
    expect(pick(3)).toEqual([0, 0, 0]);
    expect(pick(4)).toEqual([200000, 1, 1]); // 23:59:59.999 VN 14/06
    expect(pick(5)).toEqual([100000, 1, 1]); // 00:00 VN 15/06
    expect(d.previousSeries[0]).toMatchObject({ start: '2031-06-04', ordersPlaced: 1 });
    expect(d.previousSeries[5]).toMatchObject({
      start: '2031-06-09',
      revenue: 300000,
      paidOrders: 1,
      ordersPlaced: 2,
    });
    // Tổng series = KPI
    expect(d.series.reduce((a, p) => a + p.revenue, 0)).toBe(d.kpis.revenue.current);
    expect(d.previousSeries.reduce((a, p) => a + p.revenue, 0)).toBe(d.kpis.revenue.previous);
  });

  it('bucket tuần (thứ Hai đầu tuần): điền 0 và cắt theo khoảng', async () => {
    const d = await getOverview({ from: '2031-06-02', to: '2031-06-15', granularity: 'week' }, NOW);
    expect(d.series.map((p) => [p.start, p.end])).toEqual([
      ['2031-06-02', '2031-06-08'],
      ['2031-06-09', '2031-06-15'],
    ]);
    expect(d.series[0]).toMatchObject({ revenue: 888000, paidOrders: 1, ordersPlaced: 3 });
    expect(d.series[1]).toMatchObject({ revenue: 720000, paidOrders: 5, ordersPlaced: 8 });
    expect(d.previousSeries.map((p) => [p.start, p.end])).toEqual([
      ['2031-05-19', '2031-05-25'],
      ['2031-05-26', '2031-06-01'],
    ]);
    expect(d.previousSeries.every((p) => p.revenue === 0 && p.ordersPlaced === 0)).toBe(true);
    // Tuần bị cắt ở đầu: 11/06 (thứ Tư) .. 15/06
    const cut = await getOverview(
      { from: '2031-06-11', to: '2031-06-15', granularity: 'week' },
      NOW,
    );
    expect(cut.series).toHaveLength(1);
    expect(cut.series[0]).toMatchObject({
      start: '2031-06-11',
      end: '2031-06-15',
      revenue: 300000,
    });
  });

  it('bucket tháng: cắt đầu/cuối, kỳ trước cùng granularity', async () => {
    const d = await getOverview(
      { from: '2031-05-20', to: '2031-06-15', granularity: 'month' },
      NOW,
    );
    expect(d.series.map((p) => [p.start, p.end])).toEqual([
      ['2031-05-20', '2031-05-31'],
      ['2031-06-01', '2031-06-15'],
    ]);
    expect(d.series[0]).toMatchObject({ revenue: 0, paidOrders: 0, ordersPlaced: 0 });
    expect(d.series[1]).toMatchObject({ revenue: 1608000, paidOrders: 6, ordersPlaced: 11 });
    expect(d.previousSeries.map((p) => [p.start, p.end])).toEqual([
      ['2031-04-23', '2031-04-30'],
      ['2031-05-01', '2031-05-19'],
    ]);
    expect(d.kpis.revenue.previous).toBe(0);
    expect(d.kpis.revenue.changePct).toBeNull();
  });

  it('kỳ không có dữ liệu: toàn 0, tỷ lệ 0, changePts null', async () => {
    const d = await getOverview({ from: '2031-01-01', to: '2031-01-10' }, NOW);
    expect(d.kpis.revenue).toEqual({ current: 0, previous: 0, changePct: null });
    expect(d.kpis.aov.current).toBe(0);
    expect(d.kpis.cancelRate).toEqual({ current: 0, previous: 0, changePts: null });
    expect(d.series).toHaveLength(10);
    expect(d.series.every((p) => p.revenue === 0 && p.ordersPlaced === 0)).toBe(true);
  });

  it('khoảng ở tương lai so với đồng hồ thật bị từ chối qua HTTP', async () => {
    const res = await fx.call(
      'get',
      '/admin/analytics/overview?from=2031-06-10&to=2031-06-15',
      admin.who,
    );
    // to = 2031-06-15 ở tương lai so với đồng hồ thật -> 400 (kiểm tra giới hạn "sau hôm nay").
    expect(res.status).toBe(400);
    expect(errOf(res).code).toBe('VALIDATION_ERROR');
  });
});
