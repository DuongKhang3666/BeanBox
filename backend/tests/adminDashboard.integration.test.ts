import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { getDashboard, vnStartOfDay } from '../src/modules/admin/dashboard/dashboard.service.js';
import { API } from './authHelpers.js';
import { createFixtures, dataOf, type Who } from './checkoutHelpers.js';

const PREFIX = 'tm6d-';
const BIG = 100_000;

let app: Express;
const fx = createFixtures(() => app, PREFIX);
let admin: { id: string; who: Who };
let staff: { id: string; who: Who };
let customer: { id: string; who: Who };

// Mốc cố định ở tương lai xa: không lẫn với dữ liệu của các test khác (tạo bằng giờ hiện tại).
// 2030-06-15T10:00Z = 17:00 ngày 15/06 giờ VN -> hôm nay VN bắt đầu 2030-06-14T17:00Z.
const NOW = new Date('2030-06-15T10:00:00.000Z');

let seq = 0;
async function mkOrder(
  over: {
    status?: 'DELIVERED' | 'CANCELLED' | 'RETURNED' | 'PENDING' | 'PENDING_PAYMENT';
    paymentStatus?: 'UNPAID' | 'PAID' | 'REFUNDED';
    grandTotal?: number;
    createdAt: string;
    paidAt?: string;
    items?: Array<{ p: { id: string; variantId: string }; quantity: number; lineTotal: number }>;
  },
  tag: string,
) {
  return prisma.order.create({
    data: {
      code: `BB-T6D${++seq}-${randomUUID().slice(0, 6)}`,
      contactEmail: `${PREFIX}${tag}@example.test`,
      contactPhone: '0912345678',
      status: over.status ?? 'DELIVERED',
      paymentStatus: over.paymentStatus ?? 'PAID',
      paymentMethod: 'COD',
      shippingMethod: 'STANDARD',
      shippingAddress: {},
      subtotal: over.grandTotal ?? 1000,
      shippingFee: 0,
      grandTotal: over.grandTotal ?? 1000,
      idempotencyKey: randomUUID(),
      requestFingerprint: 'x',
      createdAt: new Date(over.createdAt),
      ...(over.paidAt ? { paidAt: new Date(over.paidAt) } : {}),
      items: {
        create: (over.items ?? []).map((i) => ({
          productId: i.p.id,
          variantId: i.p.variantId,
          productName: 'SP',
          variantName: 'BT',
          sku: 'SKU',
          unitPrice: Math.floor(i.lineTotal / i.quantity),
          quantity: i.quantity,
          lineTotal: i.lineTotal,
        })),
      },
    },
  });
}

async function mkProd(key: string, stock = 50, threshold = 5) {
  const v = await fx.mkVariant(key, { stock });
  await prisma.productVariant.update({
    where: { id: v.id },
    data: { lowStockThreshold: threshold },
  });
  return { id: v.productId, variantId: v.id, sku: v.sku };
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

describe('vnStartOfDay', () => {
  it('00:00 giờ VN của ngày chứa thời điểm', () => {
    expect(vnStartOfDay(new Date('2030-06-15T10:00:00Z')).toISOString()).toBe(
      '2030-06-14T17:00:00.000Z',
    );
    expect(vnStartOfDay(new Date('2030-06-14T17:00:00Z')).toISOString()).toBe(
      '2030-06-14T17:00:00.000Z',
    );
    expect(vnStartOfDay(new Date('2030-06-14T16:59:59.999Z')).toISOString()).toBe(
      '2030-06-13T17:00:00.000Z',
    );
  });
});

describe('GET /admin/dashboard - quyền', () => {
  it('401 khi thiếu token, 403 với customer, 200 với staff và admin, no-store', async () => {
    expect((await request(app).get(`${API}/admin/dashboard`)).status).toBe(401);
    expect((await fx.call('get', '/admin/dashboard', customer.who)).status).toBe(403);
    for (const u of [staff, admin]) {
      const res = await fx.call('get', '/admin/dashboard', u.who);
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      const d = dataOf(res);
      expect(d.dailyRevenue).toHaveLength(30);
      expect(Object.keys(d.ordersByStatus).sort()).toEqual(
        [
          'CANCELLED',
          'CONFIRMED',
          'DELIVERED',
          'FAILED_DELIVERY',
          'PENDING',
          'PENDING_PAYMENT',
          'PROCESSING',
          'RETURNED',
          'RETURN_REQUESTED',
          'SHIPPING',
        ].sort(),
      );
      expect(d.topProducts.length).toBeLessThanOrEqual(5);
      expect(d.lowStock.length).toBeLessThanOrEqual(10);
      expect(typeof d.attention.pendingOrders).toBe('number');
      expect(typeof d.generatedAt).toBe('string');
    }
  });
});

describe('getDashboard - tính theo giờ VN', () => {
  let p: Array<{ id: string; variantId: string; sku: string }>;
  let cancelledPaid: { id: string };

  beforeAll(async () => {
    p = [];
    for (let i = 1; i <= 6; i++) p.push(await mkProd(`p${i}`));
    const T = '2030-06-14T17:00:00.000Z'; // 00:00 VN 15/06 (biên)
    // Tính vào doanh thu
    await mkOrder({ grandTotal: 100000, createdAt: T, paidAt: T }, 'a'); // hôm nay (đúng biên)
    await mkOrder(
      {
        grandTotal: 200000,
        createdAt: '2030-06-14T16:59:59.999Z',
        paidAt: '2030-06-14T16:59:59.999Z',
      },
      'b',
    ); // 23:59:59.999 VN hôm qua
    await mkOrder(
      {
        grandTotal: 300000,
        createdAt: '2030-05-16T17:00:00.000Z',
        paidAt: '2030-05-16T17:00:00.000Z',
      },
      'c',
    ); // 00:00 VN 17/05 = ngày đầu của 30 ngày
    await mkOrder(
      {
        grandTotal: 400000,
        createdAt: '2030-05-16T16:59:59.000Z',
        paidAt: '2030-05-16T16:59:59.000Z',
      },
      'd',
    ); // 16/05 VN: ngoài khoảng
    // Không tính doanh thu (nhưng vẫn là đơn tạo hôm nay)
    const today = '2030-06-15T01:00:00.000Z';
    cancelledPaid = await mkOrder(
      { status: 'CANCELLED', grandTotal: 500000, createdAt: today, paidAt: today },
      'e',
    );
    await mkOrder(
      {
        status: 'CANCELLED',
        paymentStatus: 'REFUNDED',
        grandTotal: 600000,
        createdAt: today,
        paidAt: today,
      },
      'f',
    );
    await mkOrder({ status: 'RETURNED', grandTotal: 700000, createdAt: today, paidAt: today }, 'g');
    await mkOrder(
      {
        status: 'DELIVERED',
        paymentStatus: 'REFUNDED',
        grandTotal: 800000,
        createdAt: today,
        paidAt: today,
      },
      'h',
    );
    // Đơn có dòng hàng (topProducts)
    const t3 = '2030-06-15T03:00:00.000Z';
    await mkOrder(
      {
        status: 'PENDING',
        paymentStatus: 'UNPAID',
        createdAt: t3,
        items: [
          { p: p[0]!, quantity: 5, lineTotal: 50000 },
          { p: p[1]!, quantity: 5, lineTotal: 60000 },
        ],
      },
      'i1',
    );
    await mkOrder(
      {
        status: 'PENDING',
        paymentStatus: 'UNPAID',
        createdAt: t3,
        items: [
          { p: p[2]!, quantity: 4, lineTotal: 40000 },
          { p: p[3]!, quantity: 3, lineTotal: 30000 },
          { p: p[4]!, quantity: 2, lineTotal: 20000 },
          { p: p[5]!, quantity: 1, lineTotal: 10000 },
        ],
      },
      'i2',
    );
    // Bị loại khỏi topProducts: PENDING_PAYMENT và CANCELLED
    for (const [status, tag] of [
      ['PENDING_PAYMENT', 'pp'],
      ['CANCELLED', 'cx'],
    ] as const) {
      await mkOrder(
        {
          status,
          paymentStatus: 'UNPAID',
          createdAt: t3,
          items: [{ p: p[5]!, quantity: 100, lineTotal: 1_000_000 }],
        },
        tag,
      );
    }
  });

  it('revenue theo paidAt, loại CANCELLED/RETURNED/REFUNDED, đúng biên ngày VN', async () => {
    const d = await getDashboard(NOW);
    expect(d.revenue).toEqual({ today: 100000, last7Days: 300000, last30Days: 600000 });
    expect(d.generatedAt).toBe(NOW.toISOString());
  });

  it('orders theo createdAt, mọi trạng thái', async () => {
    const d = await getDashboard(NOW);
    // Hôm nay: a, e, f, g, h, i1, i2, pp, cx = 9; hôm qua: b; ngày đầu: c; d ngoài khoảng.
    expect(d.orders).toEqual({ today: 9, last7Days: 10, last30Days: 11 });
  });

  it('dailyRevenue đủ 30 phần tử, tăng dần, ngày trống = 0', async () => {
    const d = await getDashboard(NOW);
    expect(d.dailyRevenue).toHaveLength(30);
    expect(d.dailyRevenue[0]).toEqual({ date: '2030-05-17', revenue: 300000, orders: 1 });
    expect(d.dailyRevenue[29]).toEqual({ date: '2030-06-15', revenue: 100000, orders: 9 });
    expect(d.dailyRevenue[28]).toEqual({ date: '2030-06-14', revenue: 200000, orders: 1 });
    expect(d.dailyRevenue[1]).toEqual({ date: '2030-05-18', revenue: 0, orders: 0 });
    const dates = d.dailyRevenue.map((x) => x.date);
    expect(dates).toEqual([...dates].sort());
    expect(new Set(dates).size).toBe(30);
  });

  it('ordersByStatus đủ khóa; đếm toàn thời gian', async () => {
    const d = await getDashboard(NOW);
    expect(d.ordersByStatus.PENDING).toBeGreaterThanOrEqual(2);
    expect(d.ordersByStatus.CANCELLED).toBeGreaterThanOrEqual(3);
    expect(d.ordersByStatus.RETURN_REQUESTED).toBeGreaterThanOrEqual(0);
    expect(d.attention.pendingOrders).toBe(d.ordersByStatus.PENDING);
  });

  it('topProducts: top 5 theo quantity rồi revenue, loại CANCELLED/PENDING_PAYMENT', async () => {
    const d = await getDashboard(NOW);
    expect(d.topProducts.map((x) => [x.productId, x.quantity, x.revenue])).toEqual([
      [p[1]!.id, 5, 60000],
      [p[0]!.id, 5, 50000],
      [p[2]!.id, 4, 40000],
      [p[3]!.id, 3, 30000],
      [p[4]!.id, 2, 20000],
    ]);
    const first = d.topProducts[0]!;
    const row = await prisma.product.findUniqueOrThrow({ where: { id: first.productId } });
    expect(first).toMatchObject({ name: row.name, slug: row.slug });
  });

  it('lowStock: tối đa 10, stock <= ngưỡng, sắp stock tăng dần rồi sku, bỏ biến thể ẩn/đã xóa', async () => {
    const low = await mkProd('low0', 0, 5);
    await mkProd('lowEq', 5, 5);
    const ok = await mkProd('lowNo', 6, 5);
    const hidden = await mkProd('lowHidden', 0, 5);
    await prisma.productVariant.update({
      where: { id: hidden.variantId },
      data: { isActive: false },
    });
    const deleted = await mkProd('lowDel', 0, 5);
    await prisma.productVariant.update({
      where: { id: deleted.variantId },
      data: { deletedAt: new Date() },
    });

    const d = await getDashboard(NOW);
    const all = await prisma.productVariant.findMany({
      where: { isActive: true, deletedAt: null, product: { deletedAt: null } },
      select: { id: true, sku: true, stock: true, lowStockThreshold: true },
    });
    const expected = all
      .filter((v) => v.stock <= v.lowStockThreshold)
      .sort((a, b) => a.stock - b.stock || (a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0))
      .slice(0, 10)
      .map((v) => v.id);
    expect(d.lowStock.map((x) => x.variantId)).toEqual(expected);
    const ids = new Set(d.lowStock.map((x) => x.variantId));
    expect(ids.has(ok.variantId)).toBe(false);
    expect(ids.has(hidden.variantId)).toBe(false);
    expect(ids.has(deleted.variantId)).toBe(false);
    // Nếu còn chỗ trong top 10 thì biến thể thấp tồn của ta có mặt với đủ trường.
    const mine = d.lowStock.find((x) => x.variantId === low.variantId);
    if (mine) {
      expect(mine).toMatchObject({ sku: low.sku, stock: 0, lowStockThreshold: 5 });
      expect(typeof mine.productName).toBe('string');
      expect(typeof mine.variantName).toBe('string');
    }
  });

  it('attention.needsRefund tăng khi đơn CANCELLED còn Payment SUCCEEDED', async () => {
    const before = (await getDashboard(NOW)).attention.needsRefund;
    await prisma.payment.create({
      data: {
        orderId: cancelledPaid.id,
        provider: 'VNPAY',
        amount: 500000,
        status: 'SUCCEEDED',
        providerTxnId: `${PREFIX}txn`,
      },
    });
    const after = (await getDashboard(NOW)).attention.needsRefund;
    expect(after).toBe(before + 1);
  });
});
