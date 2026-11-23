import { createHash, randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { parseCsv, toCsv } from '../src/lib/csv.js';
import { prisma } from '../src/lib/prisma.js';
import { getInventory } from '../src/modules/admin/analytics/analytics.inventory.js';
import { getOverview } from '../src/modules/admin/analytics/analytics.service.js';
import { getTopProducts } from '../src/modules/admin/analytics/analytics.top.js';
import { API, ORIGIN } from './authHelpers.js';
import { createFixtures, dataOf, errOf, type Who } from './checkoutHelpers.js';
import { placeGuestOrder } from './orderTestHelpers.js';

/** D-078: giá vốn bình quân gia quyền di động + lợi nhuận gộp. */

const PREFIX = 'tm78-';
const BIG = 100_000;
let app: Express;
const fx = createFixtures(() => app, PREFIX);
let admin: { id: string; who: Who };
let staff: { id: string; who: Who };

const avgOf = async (id: string) =>
  (await prisma.productVariant.findUniqueOrThrow({ where: { id } })).avgCost;
const adjust = (body: Record<string, unknown>, who: Who = admin.who) =>
  fx.call('post', '/admin/inventory/adjust', who, body);

/** Có khóa tên `avgCost`/`unitCost` ở bất kỳ đâu trong JSON không (kiểm rò rỉ cho Staff/khách). */
function hasCostKey(v: unknown): boolean {
  if (Array.isArray(v)) return v.some(hasCostKey);
  if (v !== null && typeof v === 'object') {
    return Object.entries(v).some(([k, x]) => k === 'avgCost' || k === 'unitCost' || hasCostKey(x));
  }
  return false;
}

async function cleanAudit() {
  const variants = await prisma.productVariant.findMany({
    where: { sku: { startsWith: PREFIX.toUpperCase() } },
    select: { id: true },
  });
  await prisma.auditLog.deleteMany({
    where: { entity: 'ProductVariant', entityId: { in: variants.map((v) => v.id) } },
  });
}

beforeAll(async () => {
  app = createApp({ generalRateLimit: BIG, authRateLimit: BIG, orderRateLimit: BIG });
  await cleanAudit();
  await fx.setup();
  admin = await fx.mkUser('admin');
  await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
  staff = await fx.mkUser('staff');
  await prisma.user.update({ where: { id: staff.id }, data: { role: 'STAFF' } });
});
afterAll(async () => {
  await cleanAudit();
  await fx.clean();
  await prisma.$disconnect();
});

describe('nhập hàng cập nhật giá vốn bình quân', () => {
  it('Admin nhập nhiều lần: avgCost + movement.unitCost + audit; bán/hủy/hao hụt không đổi avgCost', async () => {
    const v = await fx.mkVariant('r1', { stock: 0 });
    expect(v.avgCost).toBeNull();

    // Lần 1: kho trống, chưa có giá vốn -> avgCost = đơn giá nhập.
    let res = await adjust({ variantId: v.id, reason: 'RESTOCK', change: 10, unitCost: 60_000 });
    expect(res.status).toBe(200);
    expect(dataOf(res).item).toMatchObject({ stock: 10, avgCost: 60_000 });
    expect(dataOf(res).movement).toMatchObject({ change: 10, reason: 'RESTOCK', unitCost: 60_000 });
    expect(await avgOf(v.id)).toBe(60_000);

    // Lần 2: (10 x 60.000 + 30 x 80.000) / 40 = 75.000.
    res = await adjust({ variantId: v.id, reason: 'RESTOCK', change: 30, unitCost: 80_000 });
    expect(dataOf(res).item).toMatchObject({ stock: 40, avgCost: 75_000 });

    // Bán (đặt hàng) 5, hao hụt 2, kiểm kê 30, điều chỉnh +1: avgCost đứng yên.
    const { order } = await placeGuestOrder(fx, [[v.id, 5]]);
    expect(await avgOf(v.id)).toBe(75_000);
    expect(
      (await adjust({ variantId: v.id, reason: 'DAMAGE', change: -2, note: 'vỡ' })).status,
    ).toBe(200);
    expect((await adjust({ variantId: v.id, reason: 'STOCKTAKE', newStock: 30 })).status).toBe(200);
    expect(
      (await adjust({ variantId: v.id, reason: 'ADJUSTMENT', change: 1, note: 'lệch' })).status,
    ).toBe(200);
    expect(await avgOf(v.id)).toBe(75_000);

    // Hủy đơn hoàn kho (+5): avgCost không đổi.
    const cancel = await fx.call(
      'post',
      `/orders/${order.code}/cancel`,
      {},
      { phone: '0901234567' },
    );
    expect(cancel.status).toBe(200);
    expect(await avgOf(v.id)).toBe(75_000);

    // Lần 3 sau khi tồn đã đổi (40 - 5 - 2 -> 30 -> 31 -> 36): (36 x 75.000 + 9 x 100.000) / 45 = 80.000.
    const stock = (await prisma.productVariant.findUniqueOrThrow({ where: { id: v.id } })).stock;
    expect(stock).toBe(36);
    res = await adjust({ variantId: v.id, reason: 'RESTOCK', change: 9, unitCost: 100_000 });
    expect(dataOf(res).item.avgCost).toBe(80_000);

    const moves = await prisma.inventoryMovement.findMany({
      where: { variantId: v.id, reason: 'RESTOCK' },
      orderBy: { createdAt: 'asc' },
    });
    expect(moves.map((m) => m.unitCost)).toEqual([60_000, 80_000, 100_000]);
    const others = await prisma.inventoryMovement.findMany({
      where: { variantId: v.id, reason: { not: 'RESTOCK' } },
    });
    expect(others.every((m) => m.unitCost === null)).toBe(true);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'inventory.adjust', entityId: v.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit.diff).toMatchObject({
      avgCost: [75_000, 80_000],
      unitCost: [null, 100_000],
    });
  });

  it('Admin: RESTOCK thiếu unitCost -> 400; unitCost với lý do khác -> 400; âm/thập phân -> 400', async () => {
    const v = await fx.mkVariant('r2', { stock: 5 });
    let res = await adjust({ variantId: v.id, reason: 'RESTOCK', change: 1 });
    expect(res.status).toBe(400);
    expect(JSON.stringify(errOf(res).details)).toContain('unitCost');
    res = await adjust({ variantId: v.id, reason: 'DAMAGE', change: -1, note: 'x', unitCost: 5 });
    expect(res.status).toBe(400);
    for (const unitCost of [-1, 1.5, 100_000_001]) {
      res = await adjust({ variantId: v.id, reason: 'RESTOCK', change: 1, unitCost });
      expect(res.status).toBe(400);
    }
    // Tồn không đổi khi 400.
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: v.id } })).stock).toBe(5);
    // 0 là đơn giá hợp lệ.
    res = await adjust({ variantId: v.id, reason: 'RESTOCK', change: 5, unitCost: 0 });
    expect(res.status).toBe(200);
    expect(await avgOf(v.id)).toBe(0);
  });

  it('Staff: nhập hàng không có đơn giá thì được, avgCost giữ nguyên; gửi unitCost -> 403; không thấy giá vốn', async () => {
    const v = await fx.mkVariant('r3', { stock: 10 });
    await prisma.productVariant.update({ where: { id: v.id }, data: { avgCost: 50_000 } });
    const res = await adjust({ variantId: v.id, reason: 'RESTOCK', change: 3 }, staff.who);
    expect(res.status).toBe(200);
    expect(hasCostKey(res.body)).toBe(false);
    expect(await avgOf(v.id)).toBe(50_000);
    const mv = await prisma.inventoryMovement.findFirstOrThrow({
      where: { variantId: v.id, reason: 'RESTOCK' },
    });
    expect(mv.unitCost).toBeNull();

    const bad = await adjust(
      { variantId: v.id, reason: 'RESTOCK', change: 3, unitCost: 1 },
      staff.who,
    );
    expect(bad.status).toBe(403);
    expect(await avgOf(v.id)).toBe(50_000);
  });

  it('nhập song song: không mất cập nhật (khóa biến thể), avgCost khớp tính tuần tự', async () => {
    const v = await fx.mkVariant('r4', { stock: 0 });
    const results = await Promise.all(
      [1, 2, 3, 4].map(() =>
        adjust({ variantId: v.id, reason: 'RESTOCK', change: 10, unitCost: 1000 }),
      ),
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: v.id } })).stock).toBe(40);
    expect(await avgOf(v.id)).toBe(1000);
  });
});

describe('danh sách tồn kho / lịch sử: Staff không thấy giá vốn', () => {
  it('Admin có avgCost + unitCost; Staff không có khóa nào', async () => {
    const v = await fx.mkVariant('inv', { stock: 0 });
    await adjust({ variantId: v.id, reason: 'RESTOCK', change: 4, unitCost: 33_000 });
    const q = `?q=${v.sku}`;

    const a = await fx.call('get', `/admin/inventory${q}`, admin.who);
    expect(dataOf(a)[0]).toMatchObject({ variantId: v.id, avgCost: 33_000 });
    const s = await fx.call('get', `/admin/inventory${q}`, staff.who);
    expect(s.status).toBe(200);
    expect(dataOf(s)).toHaveLength(1);
    expect(hasCostKey(s.body)).toBe(false);

    const am = await fx.call('get', `/admin/inventory/movements?variantId=${v.id}`, admin.who);
    expect(dataOf(am)[0]).toMatchObject({ reason: 'RESTOCK', unitCost: 33_000 });
    const sm = await fx.call('get', `/admin/inventory/movements?variantId=${v.id}`, staff.who);
    expect(sm.status).toBe(200);
    expect(dataOf(sm).length).toBeGreaterThan(0);
    expect(hasCostKey(sm.body)).toBe(false);
  });
});

describe('biến thể: sửa giá vốn thủ công', () => {
  it('Admin tạo/sửa avgCost có audit variant.cost_set (cũ/mới); null xóa; Staff gửi avgCost -> 403', async () => {
    const base = await fx.mkVariant('vc', { stock: 3 });
    const productId = base.productId;

    // Tạo biến thể mới có avgCost.
    const created = await fx.call('post', `/admin/products/${productId}/variants`, admin.who, {
      sku: `${PREFIX.toUpperCase()}VC-NEW`,
      name: '250 g',
      price: 90_000,
      avgCost: 50_000,
    });
    expect(created.status).toBe(201);
    expect(dataOf(created).avgCost).toBe(50_000);
    const id = dataOf(created).id as string;
    let audits = await prisma.auditLog.findMany({
      where: { action: 'variant.cost_set', entityId: id },
      orderBy: { createdAt: 'asc' },
    });
    expect(audits.map((a) => a.diff)).toEqual([{ avgCost: [null, 50_000] }]);

    // Sửa 50.000 -> 55.000; gửi lại cùng giá trị không thêm audit; xóa -> null.
    const patch = (body: Record<string, unknown>, who: Who = admin.who) =>
      fx.call('patch', `/admin/variants/${id}`, who, body);
    expect(dataOf(await patch({ avgCost: 55_000 })).avgCost).toBe(55_000);
    await patch({ avgCost: 55_000 });
    expect(dataOf(await patch({ avgCost: null })).avgCost).toBeNull();
    audits = await prisma.auditLog.findMany({
      where: { action: 'variant.cost_set', entityId: id },
      orderBy: { createdAt: 'asc' },
    });
    expect(audits.map((a) => a.diff)).toEqual([
      { avgCost: [null, 50_000] },
      { avgCost: [50_000, 55_000] },
      { avgCost: [55_000, null] },
    ]);

    // Sai giá trị.
    for (const avgCost of [-1, 1.5, 100_000_001]) {
      expect((await patch({ avgCost })).status).toBe(400);
    }

    // Staff: gửi avgCost -> 403 (cả tạo lẫn sửa), không đổi gì; sửa trường khác vẫn được.
    expect((await patch({ avgCost: 1 }, staff.who)).status).toBe(403);
    expect(
      (
        await fx.call('post', `/admin/products/${productId}/variants`, staff.who, {
          sku: `${PREFIX.toUpperCase()}VC-ST`,
          name: 'x',
          price: 90_000,
          avgCost: 1,
        })
      ).status,
    ).toBe(403);
    const ok = await patch({ name: 'Tên mới' }, staff.who);
    expect(ok.status).toBe(200);
    expect(hasCostKey(ok.body)).toBe(false);
    expect(await avgOf(id)).toBeNull();
  });

  it('chi tiết sản phẩm: Admin thấy avgCost từng biến thể, Staff không thấy; danh sách sản phẩm không có', async () => {
    const v = await fx.mkVariant('pd', { stock: 3 });
    await prisma.productVariant.update({ where: { id: v.id }, data: { avgCost: 12_300 } });
    const a = await fx.call('get', `/admin/products/${v.productId}`, admin.who);
    expect(dataOf(a).variants[0].avgCost).toBe(12_300);
    const s = await fx.call('get', `/admin/products/${v.productId}`, staff.who);
    expect(s.status).toBe(200);
    expect(hasCostKey(s.body)).toBe(false);
    expect(dataOf(s).variants[0].sku).toBe(v.sku);
    const list = await fx.call('get', `/admin/products?q=${PREFIX}`, staff.who);
    expect(hasCostKey(list.body)).toBe(false);
    // Danh mục công khai không bao giờ có.
    const pub = await request(app).get(`${API}/products/${dataOf(a).slug}`);
    expect(hasCostKey(pub.body)).toBe(false);
  });
});

describe('đặt hàng chụp unitCost', () => {
  it('chụp avgCost lúc đặt; đổi giá vốn sau đó không đổi dòng đơn; biến thể chưa có giá vốn -> null', async () => {
    const v1 = await fx.mkVariant('o1', { stock: 20 });
    const v2 = await fx.mkVariant('o2', { stock: 20 });
    await prisma.productVariant.update({ where: { id: v1.id }, data: { avgCost: 40_000 } });

    const { order } = await placeGuestOrder(fx, [
      [v1.id, 2],
      [v2.id, 1],
    ]);
    const items = await prisma.orderItem.findMany({ where: { order: { code: order.code } } });
    const by = new Map(items.map((i) => [i.variantId, i.unitCost]));
    expect(by.get(v1.id)).toBe(40_000);
    expect(by.get(v2.id)).toBeNull();

    // Nhập hàng làm avgCost đổi: dòng đơn cũ giữ nguyên.
    await adjust({ variantId: v1.id, reason: 'RESTOCK', change: 18, unitCost: 80_000 });
    // Tồn lúc nhập = 20 - 2 = 18: (18 x 40.000 + 18 x 80.000) / 36 = 60.000.
    expect(await avgOf(v1.id)).toBe(60_000);
    expect(
      (await prisma.orderItem.findFirstOrThrow({ where: { variantId: v1.id } })).unitCost,
    ).toBe(40_000);

    const next = await placeGuestOrder(fx, [[v1.id, 1]]);
    expect(
      (
        await prisma.orderItem.findFirstOrThrow({
          where: { order: { code: next.order.code } },
        })
      ).unitCost,
    ).toBe(60_000);

    // Khách, Staff và Admin xem đơn đều KHÔNG có giá vốn (chỉ analytics Admin dùng).
    const track = await fx.call('get', `/orders/track?code=${order.code}&phone=0901234567`);
    expect(hasCostKey(track.body)).toBe(false);
    expect(hasCostKey(order)).toBe(false);
    for (const who of [staff.who, admin.who]) {
      const d = await fx.call('get', `/admin/orders/${order.code}`, who);
      expect(d.status).toBe(200);
      expect(hasCostKey(d.body)).toBe(false);
      const l = await fx.call('get', `/admin/orders?q=${order.code}`, who);
      expect(hasCostKey(l.body)).toBe(false);
    }
  });

  it('đặt song song nhiều đơn cùng biến thể: mọi dòng đều chụp đúng avgCost, không lệch', async () => {
    const v = await fx.mkVariant('o3', { stock: 100 });
    await prisma.productVariant.update({ where: { id: v.id }, data: { avgCost: 21_000 } });
    const whos = await Promise.all([1, 2, 3, 4, 5].map(() => fx.guestWith([[v.id, 1]])));
    const res = await Promise.all(whos.map((w) => fx.postOrder(w, fx.guestOrderBody())));
    expect(res.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
    const items = await prisma.orderItem.findMany({ where: { variantId: v.id } });
    expect(items).toHaveLength(5);
    expect(items.every((i) => i.unitCost === 21_000)).toBe(true);
  });

  it('đặt hàng đồng thời với nhập hàng: unitCost là một trong hai giá trị hợp lệ (trước hoặc sau), không lệch', async () => {
    const v = await fx.mkVariant('o4', { stock: 10 });
    await prisma.productVariant.update({ where: { id: v.id }, data: { avgCost: 10_000 } });
    const who = await fx.guestWith([[v.id, 1]]);
    const [o, r] = await Promise.all([
      fx.postOrder(who, fx.guestOrderBody()),
      adjust({ variantId: v.id, reason: 'RESTOCK', change: 9, unitCost: 20_000 }),
    ]);
    expect(o.status).toBe(201);
    expect(r.status).toBe(200);
    const item = await prisma.orderItem.findFirstOrThrow({ where: { variantId: v.id } });
    // Đặt trước nhập: dòng đơn 10.000, tồn lúc nhập = 9 -> (9 x 10.000 + 9 x 20.000) / 18 = 15.000.
    // Nhập trước đặt: tồn 10 -> (10 x 10.000 + 9 x 20.000) / 19 = 14.737; dòng đơn chụp 14.737.
    expect([
      [10_000, 15_000],
      [14_737, 14_737],
    ]).toContainEqual([item.unitCost, await avgOf(v.id)]);
  });
});

// ---------------------------------------------------------------------------
// Analytics (năm 2022 để tách khỏi dữ liệu của test khác)

const NOW = new Date('2022-03-15T10:00:00.000Z');
const Q = { from: '2022-03-10', to: '2022-03-15' } as const;
let seq = 0;

interface L {
  variantId: string;
  productId: string;
  qty: number;
  unit: number;
  cost: number | null;
}

async function mkOrder(o: {
  paidAt: string;
  status?: 'DELIVERED' | 'CANCELLED';
  paid?: boolean;
  discount?: number;
  shipping?: number;
  lines: L[];
}) {
  const subtotal = o.lines.reduce((s, l) => s + l.qty * l.unit, 0);
  const discount = o.discount ?? 0;
  const shipping = o.shipping ?? 0;
  return prisma.order.create({
    data: {
      code: `BB-T78${++seq}-${randomUUID().slice(0, 6)}`,
      contactEmail: `${PREFIX}an${seq}@example.test`,
      contactPhone: '0912345678',
      status: o.status ?? 'DELIVERED',
      paymentStatus: o.paid === false ? 'UNPAID' : 'PAID',
      paymentMethod: 'COD',
      shippingMethod: 'STANDARD',
      shippingAddress: { fullName: 'Khách', phone: '0912345678', provinceCode: '79' },
      subtotal,
      discountTotal: discount,
      shippingFee: shipping,
      grandTotal: subtotal - discount + shipping,
      idempotencyKey: randomUUID(),
      requestFingerprint: 'x',
      createdAt: new Date(o.paidAt),
      paidAt: o.paid === false ? null : new Date(o.paidAt),
      items: {
        create: o.lines.map((l) => ({
          productId: l.productId,
          variantId: l.variantId,
          productName: 'SP',
          variantName: 'bt',
          sku: `SKU-${randomUUID().slice(0, 8)}`,
          unitPrice: l.unit,
          quantity: l.qty,
          lineTotal: l.qty * l.unit,
          unitCost: l.cost,
        })),
      },
    },
  });
}

describe('analytics: lợi nhuận gộp, top sản phẩm, tồn kho theo giá vốn', () => {
  let a1: L; // sản phẩm p1 (có giá vốn)
  let a2: L; // sản phẩm p2 (chưa có giá vốn)
  let baseline: Awaited<ReturnType<typeof getInventory>>['summary'];

  beforeAll(async () => {
    baseline = (await getInventory({}, NOW, 1)).summary;
    const p1 = await fx.mkVariant('an1', { stock: 10, price: 100_000 });
    const p2 = await fx.mkVariant('an2', { stock: 4, price: 50_000 });
    await prisma.productVariant.update({ where: { id: p1.id }, data: { avgCost: 65_000 } });
    a1 = { variantId: p1.id, productId: p1.productId, qty: 0, unit: 100_000, cost: 0 };
    a2 = { variantId: p2.id, productId: p2.productId, qty: 0, unit: 50_000, cost: null };
    const l = (b: L, qty: number, cost: number | null): L => ({ ...b, qty, cost });

    // Kỳ này (10..15/03). Giờ VN = UTC + 7: 03:00Z = 10:00 cùng ngày.
    // Đơn A: p1 2 x 100.000 (vốn 60.000), p2 1 x 50.000 (chưa có vốn); giảm 25.000.
    //   phân bổ giảm giá cho phần có vốn = round(25.000 x 200.000 / 250.000) = 20.000.
    await mkOrder({
      paidAt: '2022-03-12T03:00:00Z',
      discount: 25_000,
      lines: [l(a1, 2, 60_000), l(a2, 1, null)],
    });
    // Đơn B: p1 1 x 100.000 (vốn 70.000), ship 30.000 (không tính vào lợi nhuận hàng hóa).
    await mkOrder({ paidAt: '2022-03-14T03:00:00Z', shipping: 30_000, lines: [l(a1, 1, 70_000)] });
    // Loại khỏi mọi số liệu: đơn hủy, đơn chưa thanh toán.
    await mkOrder({ paidAt: '2022-03-13T03:00:00Z', status: 'CANCELLED', lines: [l(a1, 5, 1)] });
    await mkOrder({ paidAt: '2022-03-13T03:00:00Z', paid: false, lines: [l(a1, 5, 1)] });
    // Kỳ trước (04..09/03): p1 1 x 100.000 vốn 50.000.
    await mkOrder({ paidAt: '2022-03-07T03:00:00Z', lines: [l(a1, 1, 50_000)] });
  });

  it('overview: lợi nhuận gộp, biên, độ phủ khớp số cộng tay; so kỳ trước', async () => {
    const d = await getOverview(Q, NOW);
    // Doanh thu (grandTotal) không đổi định nghĩa D-019: A 225.000 + B 130.000 = 355.000.
    expect(d.kpis.revenue.current).toBeGreaterThanOrEqual(355_000);
    // Hàng hóa thuần phần có vốn = (200.000 - 20.000) + 100.000 = 280.000; vốn = 120.000 + 70.000 = 190.000.
    expect(d.kpis.grossProfit).toEqual({ current: 90_000, previous: 50_000, changePct: 80 });
    expect(d.kpis.grossMargin).toEqual({ current: 0.3214, previous: 0.5, changePts: -17.9 });
    // Độ phủ: (200.000 + 100.000) / (250.000 + 100.000) = 0,8571; kỳ trước 1.
    expect(d.kpis.costCoverage).toEqual({ current: 0.8571, previous: 1, changePts: -14.3 });
  });

  it('overview: không có dữ liệu giá vốn -> 0, không chia cho 0, so kỳ trước null', async () => {
    const d = await getOverview(
      { from: '2022-06-10', to: '2022-06-15' },
      new Date('2022-06-15T10:00:00Z'),
    );
    expect(d.kpis.grossProfit).toEqual({ current: 0, previous: 0, changePct: null });
    expect(d.kpis.grossMargin).toEqual({ current: 0, previous: 0, changePts: null });
    expect(d.kpis.costCoverage).toEqual({ current: 0, previous: 0, changePts: null });
  });

  it('overview: đơn cũ không có unitCost làm độ phủ < 1 và không tính vào lợi nhuận', async () => {
    const d = await getOverview(Q, NOW);
    expect(d.kpis.costCoverage.current).toBeLessThan(1);
    const old = await getOverview({ from: '2022-03-04', to: '2022-03-09' }, NOW);
    expect(old.kpis.costCoverage.current).toBe(1);
  });

  it('top-products: cogs/grossProfit/margin theo sản phẩm; thiếu giá vốn -> null', async () => {
    const r = await getTopProducts({ ...Q, limit: 100 }, NOW);
    const p1 = r.items.find((i) => i.productId === a1.productId)!;
    const p2 = r.items.find((i) => i.productId === a2.productId)!;
    expect(p1).toMatchObject({
      revenue: 300_000,
      quantity: 3,
      orders: 2,
      cogs: 190_000,
      grossProfit: 90_000,
      margin: 0.3214,
      costCoverage: 1,
    });
    expect(p2).toMatchObject({
      revenue: 50_000,
      cogs: null,
      grossProfit: null,
      margin: null,
      costCoverage: 0,
    });
  });

  it('inventory: giá trị tồn theo giá vốn + số biến thể còn tồn nhưng chưa có giá vốn', async () => {
    const after = await getInventory({}, NOW, 1000);
    // Thêm p1 (10 x 65.000 = 650.000) và p2 (4, chưa có vốn).
    expect(after.summary.stockCostValue - baseline.stockCostValue).toBe(650_000);
    expect(after.summary.variantsWithoutCost - baseline.variantsWithoutCost).toBe(1);
    expect(after.summary.stockValue - baseline.stockValue).toBe(10 * 100_000 + 4 * 50_000);
    const all = [...after.outOfStock, ...after.lowStock, ...after.slowMovers];
    const mine = all.find((i) => i.variantId === a2.variantId);
    expect(mine).toMatchObject({ avgCost: null, stockCostValue: null, stockValue: 200_000 });
  });

  it('export CSV: overview/top-products/inventory có cột giá vốn; Staff 403', async () => {
    const get = (qs: string, who: Who = admin.who) =>
      fx.call('get', `/admin/analytics/export?${qs}`, who);
    const range = 'from=2022-03-10&to=2022-03-15';

    const ov = await get(`report=overview&${range}`);
    expect(ov.status).toBe(200);
    const rows = parseCsv(ov.text);
    const row = (label: string) => rows.find((r) => r[0] === label);
    expect(row('Lợi nhuận gộp (VND)')).toEqual(['Lợi nhuận gộp (VND)', '90000', '50000', '80', '']);
    expect(row('Biên lợi nhuận gộp (%)')).toEqual([
      'Biên lợi nhuận gộp (%)',
      '32.14',
      '50',
      '',
      '-17.9',
    ]);
    expect(row('Độ phủ giá vốn (%)')).toEqual(['Độ phủ giá vốn (%)', '85.71', '100', '', '-14.3']);

    const top = await get(`report=top-products&${range}&limit=100`);
    const topRows = parseCsv(top.text);
    expect(topRows[0]!.slice(-4)).toEqual([
      'Giá vốn hàng bán (VND)',
      'Lợi nhuận gộp (VND)',
      'Biên lợi nhuận (%)',
      'Độ phủ giá vốn (%)',
    ]);
    const p1 = topRows.find((r) => r[4] === '3' && r[3] === '300000')!;
    expect(p1.slice(-4)).toEqual(['190000', '90000', '32.14', '100']);
    const p2 = topRows.find((r) => r[3] === '50000')!;
    expect(p2.slice(-4)).toEqual(['', '', '', '0']);

    const inv = await get('report=inventory&list=lowStock');
    expect(parseCsv(inv.text)[0]!.slice(-2)).toEqual([
      'Giá vốn bình quân (VND)',
      'Giá trị tồn theo giá vốn (VND)',
    ]);

    expect((await get(`report=overview&${range}`, staff.who)).status).toBe(403);
  });

  it('Staff không truy cập được analytics (giá vốn/lợi nhuận chỉ Admin)', async () => {
    for (const path of [
      `/admin/analytics/overview?from=2022-03-10&to=2022-03-15`,
      `/admin/analytics/top-products?from=2022-03-10&to=2022-03-15`,
      `/admin/analytics/inventory`,
    ]) {
      expect((await fx.call('get', path, staff.who)).status).toBe(403);
      expect((await fx.call('get', path, admin.who)).status).toBe(200);
    }
  });
});

describe('CSV sản phẩm: cột avg_cost (D-078)', () => {
  const csvApp = () =>
    createApp({
      generalRateLimit: BIG,
      authRateLimit: BIG,
      exportRateLimit: BIG,
      importRateLimit: BIG,
    });
  let csvAgent: Express;
  const post = (path: string, body: string) =>
    request(csvAgent)
      .post(`${API}/admin/products/${path}`)
      .set('Origin', ORIGIN)
      .set(admin.who.auth!)
      .set('Content-Type', 'text/csv')
      .send(body);
  const exportCsv = async () => {
    const r = await request(csvAgent)
      .get(`${API}/admin/products/export`)
      .set('Origin', ORIGIN)
      .set(admin.who.auth!);
    expect(r.status).toBe(200);
    return r.text;
  };
  const sha = (text: string) =>
    createHash('sha256').update(Buffer.from(text, 'utf-8')).digest('hex');

  it('xuất có cột avg_cost (cuối); khứ hồi toàn bộ "unchanged"; Staff không xuất/nhập được', async () => {
    csvAgent = csvAgent ?? csvApp();
    const v = await fx.mkVariant('csv1', { stock: 3 });
    const w = await fx.mkVariant('csv2', { stock: 3 });
    await prisma.productVariant.update({ where: { id: v.id }, data: { avgCost: 41_500 } });

    const text = await exportCsv();
    const rows = parseCsv(text);
    expect(rows[0]!.at(-1)).toBe('avg_cost');
    expect(rows[0]).toHaveLength(17);
    const mine = rows.filter((r) => r[6] === v.sku || r[6] === w.sku);
    expect(mine.find((r) => r[6] === v.sku)!.at(-1)).toBe('41500');
    expect(mine.find((r) => r[6] === w.sku)!.at(-1)).toBe('');

    const preview = await post('import/preview?filename=roundtrip.csv', text);
    expect(preview.status).toBe(200);
    const entries = dataOf(preview).entries as Array<{ sku: string; action: string }>;
    expect(entries.filter((e) => [v.sku, w.sku].includes(e.sku)).map((e) => e.action)).toEqual([
      'unchanged',
      'unchanged',
    ]);

    for (const who of [staff.who, {}]) {
      const ex = await fx.call('get', '/admin/products/export', who);
      expect([401, 403]).toContain(ex.status);
    }
    expect((await fx.call('get', '/admin/products/export', staff.who)).status).toBe(403);
  });

  it('nhập đổi avg_cost: cập nhật + audit variant.cost_set (cũ/mới); rỗng xóa; file 16 cột cũ không đụng giá vốn', async () => {
    csvAgent = csvAgent ?? csvApp();
    const v = await fx.mkVariant('csv3', { stock: 3 });
    await prisma.productVariant.update({ where: { id: v.id }, data: { avgCost: 10_000 } });

    const text = await exportCsv();
    const rows = parseCsv(text);
    const idx = rows.findIndex((r) => r[6] === v.sku);
    const edit = (cell: string) => {
      const copy = rows.map((r) => [...r]);
      copy[idx]![16] = cell;
      return toCsv(copy.filter((r, i) => i === 0 || i === idx));
    };

    const file = edit('12345');
    const pv = await post('import/preview?filename=cost.csv', file);
    expect(dataOf(pv).entries[0]).toMatchObject({
      action: 'update_variant',
      changes: ['avg_cost'],
    });
    const commit = await post(`import/commit?filename=cost.csv&fingerprint=${sha(file)}`, file);
    expect(commit.status).toBe(200);
    expect(await avgOf(v.id)).toBe(12_345);

    // Rỗng -> xóa giá vốn.
    const clear = edit('');
    await post(`import/commit?filename=cost.csv&fingerprint=${sha(clear)}`, clear);
    expect(await avgOf(v.id)).toBeNull();

    const audits = await prisma.auditLog.findMany({
      where: { action: 'variant.cost_set', entityId: v.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(audits.map((a) => a.diff)).toEqual([
      { avgCost: [10_000, 12_345] },
      { avgCost: [12_345, null] },
    ]);

    // Giá trị sai -> 422 từng dòng, không ghi gì.
    for (const bad of ['-1', '1.5', 'abc', '100000001']) {
      const f = edit(bad);
      const p = await post('import/preview', f);
      expect(dataOf(p).canApply).toBe(false);
      const c = await post(`import/commit?fingerprint=${sha(f)}`, f);
      expect(c.status).toBe(422);
    }
    expect(await avgOf(v.id)).toBeNull();

    // File cũ 16 cột (không có avg_cost): hợp lệ và không đụng tới giá vốn.
    await prisma.productVariant.update({ where: { id: v.id }, data: { avgCost: 777 } });
    const legacy = toCsv([rows[0]!, rows[idx]!].map((r) => r.slice(0, 16)));
    const lp = await post('import/preview', legacy);
    expect(lp.status).toBe(200);
    expect(dataOf(lp).entries[0].action).toBe('unchanged');
    const lc = await post(`import/commit?fingerprint=${sha(legacy)}`, legacy);
    expect(lc.status).toBe(200);
    expect(await avgOf(v.id)).toBe(777);
  });
});
