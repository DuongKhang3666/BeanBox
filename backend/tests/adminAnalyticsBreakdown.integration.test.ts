import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import {
  assembleGroups,
  getBreakdown,
  OTHER_KEY,
  type RawGroup,
} from '../src/modules/admin/analytics/analytics.breakdown.js';
import { getOverview } from '../src/modules/admin/analytics/analytics.service.js';
import { getTopCustomers, getTopProducts } from '../src/modules/admin/analytics/analytics.top.js';
import { API } from './authHelpers.js';
import { createFixtures, dataOf, errOf, type Who } from './checkoutHelpers.js';

const PREFIX = 'tm10b-';
const BIG = 100_000;

let app: Express;
const fx = createFixtures(() => app, PREFIX);
let admin: { id: string; who: Who };
let staff: { id: string; who: Who };
let customer: { id: string; who: Who; email: string };

// 2033-03-15T10:00Z = 17:00 ngày 15/03 giờ VN. Kỳ này 10..15/03, kỳ trước 04..09/03.
const NOW = new Date('2033-03-15T10:00:00.000Z');
const Q = { from: '2033-03-10', to: '2033-03-15' } as const;

interface Line {
  variantId: string;
  productId: string;
  name: string;
  qty: number;
  unit: number;
}

let seq = 0;
async function mkOrder(o: {
  email: string;
  userId?: string;
  status?: 'DELIVERED' | 'CANCELLED' | 'RETURNED' | 'PENDING';
  paymentStatus?: 'UNPAID' | 'PAID';
  paymentMethod?: 'COD' | 'VNPAY' | 'STRIPE';
  shippingMethod?: 'STANDARD' | 'EXPRESS';
  address?: Record<string, unknown>;
  grandTotal: number;
  paidAt: string;
  lines: Line[];
}) {
  const subtotal = o.lines.reduce((s, l) => s + l.qty * l.unit, 0);
  return prisma.order.create({
    data: {
      code: `BB-T11${++seq}-${randomUUID().slice(0, 6)}`,
      userId: o.userId ?? null,
      contactEmail: o.email,
      contactPhone: '0912345678',
      status: o.status ?? 'DELIVERED',
      paymentStatus: o.paymentStatus ?? 'PAID',
      paymentMethod: o.paymentMethod ?? 'COD',
      shippingMethod: o.shippingMethod ?? 'STANDARD',
      shippingAddress: (o.address ?? {
        fullName: 'Khách Mẫu',
        phone: '0912345678',
        provinceCode: '79',
        provinceName: 'Thành phố Hồ Chí Minh',
        line1: '1 Đường bí mật',
      }) as object,
      subtotal,
      // grandTotal = subtotal - discountTotal + shippingFee - shippingDiscount (CHECK ở DB).
      discountTotal: Math.max(0, subtotal - o.grandTotal),
      shippingFee: Math.max(0, o.grandTotal - subtotal),
      grandTotal: o.grandTotal,
      idempotencyKey: randomUUID(),
      requestFingerprint: 'x',
      createdAt: new Date(o.paidAt),
      paidAt: o.paymentStatus === 'UNPAID' ? null : new Date(o.paidAt),
      items: {
        create: o.lines.map((l) => ({
          productId: l.productId,
          variantId: l.variantId,
          productName: l.name,
          variantName: 'bt',
          sku: `SKU-${randomUUID().slice(0, 8)}`,
          unitPrice: l.unit,
          quantity: l.qty,
          lineTotal: l.qty * l.unit,
        })),
      },
    },
  });
}

const HN = {
  fullName: 'Khách Hà Nội',
  provinceCode: '48',
  provinceName: 'Thành phố Đà Nẵng',
};

let catA: string;
let catB: string;
let brandX: string;
let L: Record<'p1' | 'p2' | 'p3' | 'p4', Line>;

beforeAll(async () => {
  app = createApp({ generalRateLimit: BIG, authRateLimit: BIG });
  await fx.setup();
  await prisma.brand.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  admin = await fx.mkUser('admin');
  await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
  staff = await fx.mkUser('staff');
  await prisma.user.update({ where: { id: staff.id }, data: { role: 'STAFF' } });
  customer = await fx.mkUser('cust');

  catA = (await prisma.category.create({ data: { name: 'Nhóm A', slug: `${PREFIX}ca` } })).id;
  catB = (await prisma.category.create({ data: { name: 'Nhóm B', slug: `${PREFIX}cb` } })).id;
  brandX = (await prisma.brand.create({ data: { name: 'Hiệu X', slug: `${PREFIX}bx` } })).id;

  const mk = async (key: 'p1' | 'p2' | 'p3' | 'p4', categoryId: string, brandId: string | null) => {
    const v = await fx.mkVariant(key);
    await prisma.product.update({
      where: { id: v.productId },
      data: { categoryId, brandId, name: `Tên hiện tại ${key}` },
    });
    return {
      variantId: v.id,
      productId: v.productId,
      name: `Tên cũ ${key}`,
      qty: 1,
      unit: 0,
    } satisfies Line;
  };
  L = {
    p1: await mk('p1', catA, brandX),
    p2: await mk('p2', catA, null),
    p3: await mk('p3', catB, brandX),
    p4: await mk('p4', catB, null),
  };
  const line = (p: keyof typeof L, qty: number, unit: number): Line => ({ ...L[p], qty, unit });

  const g = `${PREFIX}guest@example.test`;
  // Kỳ này (10..15/03): doanh thu 680.000, 5 đơn.
  await mkOrder({
    email: `${PREFIX}Guest@Example.test`, // khác hoa thường
    grandTotal: 240000,
    paidAt: '2033-03-11T03:00:00Z',
    lines: [line('p1', 2, 100000), line('p3', 1, 50000)],
  });
  await mkOrder({
    email: g,
    paymentMethod: 'VNPAY',
    shippingMethod: 'EXPRESS',
    address: HN,
    grandTotal: 130000,
    paidAt: '2033-03-12T03:00:00Z',
    lines: [line('p2', 1, 100000)],
  });
  await mkOrder({
    email: customer.email,
    userId: customer.id,
    paymentMethod: 'STRIPE',
    grandTotal: 160000,
    paidAt: '2033-03-13T03:00:00Z',
    lines: [line('p4', 3, 20000), line('p1', 1, 100000)],
  });
  await mkOrder({
    email: `${PREFIX}other@example.test`,
    grandTotal: 100000,
    paidAt: '2033-03-14T03:00:00Z',
    lines: [line('p2', 1, 100000)],
  });
  await mkOrder({
    email: `${PREFIX}noprov@example.test`,
    address: {},
    grandTotal: 50000,
    paidAt: '2033-03-15T03:00:00Z',
    lines: [line('p3', 1, 50000)],
  });
  // Bị loại khỏi doanh thu: hủy, trả hàng, COD chưa thu.
  await mkOrder({
    email: `${PREFIX}x1@example.test`,
    status: 'CANCELLED',
    grandTotal: 900000,
    paidAt: '2033-03-12T04:00:00Z',
    lines: [line('p1', 9, 100000)],
  });
  await mkOrder({
    email: `${PREFIX}x2@example.test`,
    status: 'RETURNED',
    grandTotal: 800000,
    paidAt: '2033-03-12T05:00:00Z',
    lines: [line('p1', 8, 100000)],
  });
  await mkOrder({
    email: `${PREFIX}x3@example.test`,
    status: 'PENDING',
    paymentStatus: 'UNPAID',
    grandTotal: 700000,
    paidAt: '2033-03-12T06:00:00Z',
    lines: [line('p1', 7, 100000)],
  });
  // Kỳ trước (04..09/03): 200.000.
  await mkOrder({
    email: `${PREFIX}prev1@example.test`,
    grandTotal: 100000,
    paidAt: '2033-03-05T03:00:00Z',
    lines: [line('p1', 1, 100000)],
  });
  await mkOrder({
    email: `${PREFIX}prev2@example.test`,
    address: HN,
    grandTotal: 100000,
    paidAt: '2033-03-06T03:00:00Z',
    lines: [line('p3', 2, 50000)],
  });
  // Sản phẩm xóa mềm vẫn được tính.
  await prisma.product.update({ where: { id: L.p4.productId }, data: { deletedAt: new Date() } });
});

afterAll(async () => {
  await fx.clean();
  await prisma.brand.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await prisma.$disconnect();
});

describe('analytics breakdown/top - quyền và validate', () => {
  const paths = [
    '/admin/analytics/breakdown?dimension=category',
    '/admin/analytics/top-products',
    '/admin/analytics/top-customers',
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
    expect(dataOf(ok).range.days).toBe(30);
    expect(dataOf(ok).range.timezone).toBe('Asia/Ho_Chi_Minh');
  });

  const cases: Array<[string, string, string]> = [
    ['dimension thiếu', '/admin/analytics/breakdown', 'dimension'],
    ['dimension sai', '/admin/analytics/breakdown?dimension=color', 'dimension'],
    ['dimension lặp', '/admin/analytics/breakdown?dimension=brand&dimension=category', 'dimension'],
    ['breakdown from sai', '/admin/analytics/breakdown?dimension=brand&from=2033-02-30', 'from'],
    [
      'breakdown from > to',
      '/admin/analytics/breakdown?dimension=brand&from=2025-06-15&to=2025-06-10',
      'from',
    ],
    [
      'breakdown quá 366 ngày',
      '/admin/analytics/breakdown?dimension=brand&from=2020-01-01&to=2022-01-01',
      'to',
    ],
    ['limit 0', '/admin/analytics/top-products?limit=0', 'limit'],
    ['limit 51', '/admin/analytics/top-products?limit=51', 'limit'],
    ['limit không phải số', '/admin/analytics/top-products?limit=abc', 'limit'],
    ['limit thập phân', '/admin/analytics/top-customers?limit=1.5', 'limit'],
    ['limit âm', '/admin/analytics/top-customers?limit=-3', 'limit'],
    ['limit lặp', '/admin/analytics/top-customers?limit=1&limit=2', 'limit'],
    ['sort sai (sản phẩm)', '/admin/analytics/top-products?sort=orders', 'sort'],
    ['sort sai (khách)', '/admin/analytics/top-customers?sort=quantity', 'sort'],
    ['top-products to sau hôm nay', '/admin/analytics/top-products?to=2099-01-01', 'to'],
    [
      'top-customers from lặp',
      '/admin/analytics/top-customers?from=2025-01-01&from=2025-01-02',
      'from',
    ],
  ];
  it.each(cases)('400 VALIDATION_ERROR: %s', async (_n, path, field) => {
    const res = await fx.call('get', path, admin.who);
    expect(res.status).toBe(400);
    expect(errOf(res).code).toBe('VALIDATION_ERROR');
    const details = (errOf(res) as unknown as { details: Array<{ field: string }> }).details;
    expect(details.map((x) => x.field)).toContain(field);
  });

  it('limit 1 và 50 hợp lệ; sort hợp lệ', async () => {
    for (const p of [
      '/admin/analytics/top-products?limit=1&sort=quantity',
      '/admin/analytics/top-products?limit=50',
      '/admin/analytics/top-customers?limit=50&sort=orders',
    ]) {
      expect((await fx.call('get', p, admin.who)).status).toBe(200);
    }
  });
});

describe('getBreakdown - chiều cấp đơn', () => {
  it('thanh toán: tổng nhóm = doanh thu overview, loại hủy/trả/COD chưa thu, kỳ trước + changePct', async () => {
    const [b, o] = await Promise.all([
      getBreakdown({ ...Q, dimension: 'paymentMethod' }, NOW),
      getOverview(Q, NOW),
    ]);
    expect(b.basis).toBe('order');
    expect(b.dimension).toBe('paymentMethod');
    expect(b.range).toMatchObject({ from: '2033-03-10', to: '2033-03-15', days: 6 });
    expect(b.previousRange).toEqual({ from: '2033-03-04', to: '2033-03-09' });
    expect(o.kpis.revenue.current).toBe(680000);
    expect(b.total).toEqual({ revenue: 680000, orders: 5, quantity: null });
    expect(b.previousTotal).toEqual({ revenue: 200000, orders: 2, quantity: null });
    expect(b.groups.reduce((s, g) => s + g.revenue, 0)).toBe(o.kpis.revenue.current);
    expect(b.groups.map((g) => [g.key, g.revenue, g.orders])).toEqual([
      ['COD', 390000, 3],
      ['STRIPE', 160000, 1],
      ['VNPAY', 130000, 1],
    ]);
    const cod = b.groups[0]!;
    expect(cod.label).toBe('Thanh toán khi nhận hàng (COD)');
    expect(cod.quantity).toBeNull();
    expect(cod.share).toBe(0.5735);
    expect(cod.previousRevenue).toBe(200000);
    expect(cod.changePct).toBe(95);
    expect(b.groups[2]!.changePct).toBeNull(); // VNPAY: kỳ trước = 0
    expect(b.groups.reduce((s, g) => s + g.share, 0)).toBeCloseTo(1, 3);
  });

  it('giao hàng: nhãn tiếng Việt và tổng khớp', async () => {
    const b = await getBreakdown({ ...Q, dimension: 'shippingMethod' }, NOW);
    expect(b.groups.map((g) => [g.key, g.label, g.revenue])).toEqual([
      ['STANDARD', 'Tiêu chuẩn', 550000],
      ['EXPRESS', 'Nhanh', 130000],
    ]);
  });

  it('tỉnh/thành: lấy từ shippingAddress, thiếu -> "Không xác định" (key null)', async () => {
    const b = await getBreakdown({ ...Q, dimension: 'province' }, NOW);
    expect(b.groups.map((g) => [g.key, g.label, g.revenue, g.orders])).toEqual([
      ['79', 'Thành phố Hồ Chí Minh', 500000, 3],
      ['48', 'Thành phố Đà Nẵng', 130000, 1],
      [null, 'Không xác định', 50000, 1],
    ]);
    expect(b.groups[0]!.previousRevenue).toBe(100000);
    expect(b.groups[0]!.changePct).toBe(400);
    expect(b.groups[1]!.changePct).toBe(30);
    expect(b.groups.reduce((s, g) => s + g.revenue, 0)).toBe(b.total.revenue);
  });
});

describe('getBreakdown - chiều cấp dòng hàng', () => {
  it('danh mục: revenue = Σ lineTotal, tổng nhóm = total, orders không cộng dồn, sản phẩm xóa mềm vẫn tính', async () => {
    const b = await getBreakdown({ ...Q, dimension: 'category' }, NOW);
    expect(b.basis).toBe('item');
    const rows = await prisma.orderItem.aggregate({
      _sum: { lineTotal: true },
      where: {
        order: {
          paymentStatus: 'PAID',
          status: { notIn: ['CANCELLED', 'RETURNED'] },
          paidAt: { gte: new Date('2033-03-09T17:00:00Z'), lt: new Date('2033-03-15T17:00:00Z') },
          contactEmail: { startsWith: PREFIX },
        },
      },
    });
    expect(rows._sum.lineTotal).toBe(660000);
    expect(b.total).toEqual({ revenue: 660000, orders: 5, quantity: 10 });
    expect(b.previousTotal).toEqual({ revenue: 200000, orders: 2, quantity: 3 });
    expect(b.groups.reduce((s, g) => s + g.revenue, 0)).toBe(b.total.revenue);
    expect(b.groups.map((g) => [g.label, g.revenue, g.quantity, g.orders])).toEqual([
      ['Nhóm A', 500000, 5, 4],
      ['Nhóm B', 160000, 5, 3],
    ]);
    // 4 + 3 = 7 > 5 đơn khác nhau: không cộng dồn được.
    expect(b.groups.reduce((s, g) => s + g.orders, 0)).toBeGreaterThan(b.total.orders);
    expect(b.groups[0]!.previousRevenue).toBe(100000);
    expect(b.groups[0]!.changePct).toBe(400);
    expect(b.groups[1]!.changePct).toBe(60);
  });

  it('đổi danh mục sản phẩm thì doanh thu chuyển theo danh mục mới (phân loại hiện tại)', async () => {
    await prisma.product.update({ where: { id: L.p2.productId }, data: { categoryId: catB } });
    try {
      const b = await getBreakdown({ ...Q, dimension: 'category' }, NOW);
      expect(b.groups.map((g) => [g.label, g.revenue])).toEqual([
        ['Nhóm B', 360000],
        ['Nhóm A', 300000],
      ]);
      expect(b.groups.reduce((s, g) => s + g.revenue, 0)).toBe(660000);
    } finally {
      await prisma.product.update({ where: { id: L.p2.productId }, data: { categoryId: catA } });
    }
  });

  it('thương hiệu: brand null -> nhóm key null "Không có thương hiệu"', async () => {
    const b = await getBreakdown({ ...Q, dimension: 'brand' }, NOW);
    expect(b.groups.map((g) => [g.key, g.label, g.revenue, g.quantity, g.orders])).toEqual([
      [brandX, 'Hiệu X', 400000, 5, 3],
      [null, 'Không có thương hiệu', 260000, 5, 3],
    ]);
    expect(b.groups.reduce((s, g) => s + g.revenue, 0)).toBe(b.total.revenue);
  });

  it('khoảng không có dữ liệu: nhóm rỗng, tổng 0', async () => {
    const b = await getBreakdown({ from: '2033-01-01', to: '2033-01-10', dimension: 'brand' }, NOW);
    expect(b.groups).toEqual([]);
    expect(b.total).toEqual({ revenue: 0, orders: 0, quantity: 0 });
  });
});

describe('assembleGroups - sắp xếp và gộp "Khác"', () => {
  const mk = (i: number, revenue: number): RawGroup => ({
    key: `k${i}`,
    label: `Nhóm ${String(i).padStart(2, '0')}`,
    revenue,
    orders: 1,
    quantity: 2,
    previousRevenue: 10,
  });
  it('trên 50 nhóm: giữ 49 nhóm đầu + "Khác", tổng doanh thu không đổi', () => {
    const raw = Array.from({ length: 60 }, (_, i) => mk(i, 1000 + i));
    const total = raw.reduce((s, g) => s + g.revenue, 0);
    const out = assembleGroups(raw, total);
    expect(out).toHaveLength(50);
    expect(out[0]!.revenue).toBe(1059);
    const other = out[49]!;
    expect(other.key).toBe(OTHER_KEY);
    expect(other.label).toBe('Khác');
    expect(other.orders).toBe(11);
    expect(other.quantity).toBe(22);
    expect(other.previousRevenue).toBe(110);
    expect(out.reduce((s, g) => s + g.revenue, 0)).toBe(total);
    expect(out.reduce((s, g) => s + g.share, 0)).toBeCloseTo(1, 2);
  });
  it('đúng 50 nhóm: không gộp; cùng doanh thu sắp theo nhãn', () => {
    const raw = Array.from({ length: 50 }, (_, i) => mk(i, 500));
    const out = assembleGroups(raw, 25000);
    expect(out).toHaveLength(50);
    expect(out.some((g) => g.key === OTHER_KEY)).toBe(false);
    expect(out[0]!.label).toBe('Nhóm 00');
    expect(out[49]!.label).toBe('Nhóm 49');
  });
  it('tổng 0: share 0', () => {
    expect(assembleGroups([mk(1, 0)], 0)[0]!.share).toBe(0);
  });
});

describe('getTopProducts', () => {
  it('sắp theo doanh thu; tên hiện tại; xóa mềm deleted = true; tên danh mục', async () => {
    const r = await getTopProducts({ ...Q }, NOW);
    expect(r.sort).toBe('revenue');
    expect(r.limit).toBe(10);
    const mine = r.items.filter((i) => Object.values(L).some((l) => l.productId === i.productId));
    expect(mine.map((i) => [i.name, i.revenue, i.quantity, i.orders, i.deleted])).toEqual([
      ['Tên hiện tại p1', 300000, 3, 2, false],
      ['Tên hiện tại p2', 200000, 2, 2, false],
      ['Tên hiện tại p3', 100000, 2, 2, false],
      ['Tên hiện tại p4', 60000, 3, 1, true],
    ]);
    expect(mine[0]!.categoryName).toBe('Nhóm A');
    expect(mine[0]!.slug).toMatch(/^tm10b-p1-/);
    expect(Object.keys(mine[0]!).sort()).toEqual(
      [
        'categoryName',
        'deleted',
        'name',
        'orders',
        'productId',
        'quantity',
        'revenue',
        'slug',
      ].sort(),
    );
  });
  it('sắp theo số lượng (hòa -> doanh thu) và giới hạn limit', async () => {
    const r = await getTopProducts({ ...Q, sort: 'quantity', limit: 3 }, NOW);
    expect(r.items).toHaveLength(3);
    expect(r.items.map((i) => [i.name, i.quantity])).toEqual([
      ['Tên hiện tại p1', 3],
      ['Tên hiện tại p4', 3],
      ['Tên hiện tại p2', 2],
    ]);
    const one = await getTopProducts({ ...Q, limit: 1 }, NOW);
    expect(one.items).toHaveLength(1);
    expect(one.items[0]!.name).toBe('Tên hiện tại p1');
  });
  it('loại đơn hủy/trả/COD chưa thu và đơn ngoài khoảng', async () => {
    const r = await getTopProducts({ from: '2033-03-04', to: '2033-03-09' }, NOW);
    const p1 = r.items.find((i) => i.productId === L.p1.productId)!;
    expect(p1).toMatchObject({ revenue: 100000, quantity: 1, orders: 1 });
  });
});

describe('getTopCustomers', () => {
  it('gộp vãng lai theo email không phân biệt hoa thường; registered theo userId', async () => {
    const r = await getTopCustomers({ ...Q }, NOW);
    expect(r.sort).toBe('revenue');
    const mine = r.items.filter((i) => i.email.startsWith(PREFIX));
    expect(mine.map((i) => [i.customerType, i.email, i.orders, i.revenue, i.aov])).toEqual([
      ['guest', `${PREFIX}guest@example.test`, 2, 370000, 185000],
      ['registered', customer.email, 1, 160000, 160000],
      ['guest', `${PREFIX}other@example.test`, 1, 100000, 100000],
      ['guest', `${PREFIX}noprov@example.test`, 1, 50000, 50000],
    ]);
    const reg = mine[1]!;
    expect(reg.userId).toBe(customer.id);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: customer.id } });
    expect(reg.name).toBe(u.fullName);
    expect(mine[0]!.userId).toBeNull();
    expect(mine[0]!.name).toBe('Khách Hà Nội'); // tên ở đơn mới nhất (12/03)
    expect(mine[0]!.lastPaidAt).toBe('2033-03-12T03:00:00.000Z');
  });
  it('không trả SĐT hay địa chỉ', async () => {
    const r = await getTopCustomers({ ...Q, limit: 50 }, NOW);
    for (const i of r.items) {
      expect(Object.keys(i).sort()).toEqual(
        [
          'aov',
          'customerType',
          'email',
          'lastPaidAt',
          'name',
          'orders',
          'revenue',
          'userId',
        ].sort(),
      );
    }
    const text = JSON.stringify(r);
    expect(text).not.toContain('0912345678');
    expect(text).not.toContain('bí mật');
    expect(text).not.toMatch(/phone|address|line1/i);
  });
  it('sắp theo số đơn và limit', async () => {
    const r = await getTopCustomers({ ...Q, sort: 'orders', limit: 2 }, NOW);
    expect(r.items).toHaveLength(2);
    expect(r.items[0]).toMatchObject({ email: `${PREFIX}guest@example.test`, orders: 2 });
    expect(r.items[1]!.orders).toBe(1);
    expect(r.items[1]!.revenue).toBe(160000);
  });
  it('guest và registered cùng email vẫn là hai dòng', async () => {
    await mkOrder({
      email: `${PREFIX}${customer.email.slice(PREFIX.length).toUpperCase()}`,
      grandTotal: 11111,
      paidAt: '2033-03-14T05:00:00Z',
      lines: [{ ...L.p2, qty: 1, unit: 11111 }],
    });
    const r = await getTopCustomers({ ...Q, limit: 50 }, NOW);
    const same = r.items.filter((i) => i.email === customer.email);
    expect(same.map((i) => i.customerType).sort()).toEqual(['guest', 'registered']);
  });
});
