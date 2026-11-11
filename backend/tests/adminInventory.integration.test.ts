import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { bearer } from './authHelpers.js';
import { createFixtures, dataOf, errOf, type Who } from './checkoutHelpers.js';
import { placeGuestOrder } from './orderTestHelpers.js';

const PREFIX = 'tm4i-';
let app: Express;
const fx = createFixtures(() => app, PREFIX);
const BIG = {
  generalRateLimit: 100_000,
  authRateLimit: 100_000,
  trackRateLimit: 100_000,
  couponRateLimit: 100_000,
  quoteRateLimit: 100_000,
  orderRateLimit: 100_000,
  guestCancelRateLimit: 100_000,
  uploadRateLimit: 100_000,
};

let staff: { id: string; who: Who };
let admin: { id: string; who: Who };
let customer: { id: string; who: Who };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

const inv = (path: string, who: Who = staff.who) => fx.call('get', `/admin/inventory${path}`, who);
const adjust = (body: Record<string, unknown>, who: Who = staff.who) =>
  fx.call('post', '/admin/inventory/adjust', who, body);
const stockOf = async (id: string) =>
  (await prisma.productVariant.findUniqueOrThrow({ where: { id } })).stock;

async function mkRole(key: string, role: 'STAFF' | 'ADMIN' | 'CUSTOMER') {
  const u = await fx.mkUser(key);
  if (role !== 'CUSTOMER') await prisma.user.update({ where: { id: u.id }, data: { role } });
  return u;
}

async function cleanAudit() {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: PREFIX } },
    select: { id: true },
  });
  const variants = await prisma.productVariant.findMany({
    where: { sku: { startsWith: PREFIX.toUpperCase() } },
    select: { id: true },
  });
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { actorId: { in: users.map((u) => u.id) } },
        { entity: 'ProductVariant', entityId: { in: variants.map((v) => v.id) } },
      ],
    },
  });
}

beforeAll(async () => {
  app = createApp(BIG);
  await cleanAudit();
  await fx.setup();
  staff = await mkRole('staff', 'STAFF');
  admin = await mkRole('admin', 'ADMIN');
  customer = await mkRole('cust', 'CUSTOMER');
});
afterAll(async () => {
  await cleanAudit();
  await fx.clean();
  await prisma.$disconnect();
});

describe('phân quyền tồn kho', () => {
  const endpoints: Array<['get' | 'post', string, Record<string, unknown>?]> = [
    ['get', '/admin/inventory'],
    ['get', '/admin/inventory/movements'],
    ['post', '/admin/inventory/adjust', {}],
  ];

  it('401 không token, 403 CUSTOMER', async () => {
    for (const [m, p, body] of endpoints) {
      const anon = await fx.call(m, p, {}, body);
      expect(anon.status, p).toBe(401);
      expect(errOf(anon).code).toBe('UNAUTHORIZED');
      expect((await fx.call(m, p, { auth: bearer('abc.def.ghi') }, body)).status).toBe(401);
      const c = await fx.call(m, p, customer.who, body);
      expect(c.status, p).toBe(403);
      expect(errOf(c).code).toBe('FORBIDDEN');
    }
  });

  it('200 STAFF và ADMIN', async () => {
    expect((await inv(`?q=${PREFIX}`, staff.who)).status).toBe(200);
    expect((await inv(`?q=${PREFIX}`, admin.who)).status).toBe(200);
    expect((await fx.call('get', '/admin/inventory/movements', staff.who)).status).toBe(200);
  });
});

describe('GET /admin/inventory', () => {
  let productId: string;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const v0 = await fx.mkVariant('bnd0', { stock: 0 });
    productId = v0.productId;
    ids.s0 = v0.id;
    // lowStockThreshold mặc định 5
    ids.s1 = (await fx.mkVariant('bnd1', { productId, stock: 1 })).id;
    ids.s5 = (await fx.mkVariant('bnd5', { productId, stock: 5 })).id;
    ids.s6 = (await fx.mkVariant('bnd6', { productId, stock: 6 })).id;
    ids.t0 = (await fx.mkVariant('bndt0', { productId, stock: 0 })).id;
    await prisma.productVariant.update({ where: { id: ids.t0 }, data: { lowStockThreshold: 0 } });
    ids.t0pos = (await fx.mkVariant('bndt0b', { productId, stock: 1 })).id;
    await prisma.productVariant.update({
      where: { id: ids.t0pos },
      data: { lowStockThreshold: 0, isActive: false },
    });
  });

  const idsOf = (res: { body: Json }) =>
    (res.body.data as Array<{ variantId: string }>).map((i) => i.variantId);
  const byStatus = async (status: string) =>
    idsOf(await inv(`?productId=${productId}&stockStatus=${status}&pageSize=100`));

  it('item đúng shape contract', async () => {
    const res = await inv(`?productId=${productId}&pageSize=100`);
    expect(res.status).toBe(200);
    const item = (res.body.data as Json[]).find((i) => i.variantId === ids.s5)!;
    expect(item).toMatchObject({
      sku: expect.stringContaining('TM4I'),
      variantName: 'Biến thể bnd5',
      productId,
      productName: expect.stringContaining('Sản phẩm bnd0'),
      productStatus: 'ACTIVE',
      imageUrl: '/uploads/bnd0.jpg',
      stock: 5,
      lowStockThreshold: 5,
      stockStatus: 'LOW_STOCK',
      isActive: true,
    });
    expect(typeof item.updatedAt).toBe('string');
    expect(res.body.meta).toMatchObject({ page: 1, pageSize: 100, total: 6 });
  });

  it('stockStatus đúng biên 0 / = threshold / threshold + 1', async () => {
    expect((await byStatus('OUT_OF_STOCK')).sort()).toEqual([ids.s0, ids.t0].sort());
    expect((await byStatus('LOW_STOCK')).sort()).toEqual([ids.s1, ids.s5].sort());
    expect((await byStatus('IN_STOCK')).sort()).toEqual([ids.s6, ids.t0pos].sort());
  });

  it('stockStatus nhiều giá trị (phẩy và tham số lặp)', async () => {
    const a = await byStatus('OUT_OF_STOCK,IN_STOCK');
    expect(a.sort()).toEqual([ids.s0, ids.t0, ids.s6, ids.t0pos].sort());
    const b = idsOf(
      await inv(`?productId=${productId}&stockStatus=LOW_STOCK&stockStatus=IN_STOCK&pageSize=100`),
    );
    expect(b.sort()).toEqual([ids.s1, ids.s5, ids.s6, ids.t0pos].sort());
  });

  it('stockStatus sai -> 400; sort/page sai -> 400', async () => {
    expect((await inv('?stockStatus=NOPE')).status).toBe(400);
    expect((await inv('?sort=bogus')).status).toBe(400);
    expect((await inv('?pageSize=101')).status).toBe(400);
    expect((await inv('?productId=BAD ID')).status).toBe(400);
  });

  it('sort stock_asc mặc định tăng dần; sort name; phân trang', async () => {
    const res = await inv(`?productId=${productId}&pageSize=100`);
    const stocks = (res.body.data as Json[]).map((i) => i.stock);
    expect(stocks).toEqual([...stocks].sort((a, b) => a - b));
    expect((await inv(`?productId=${productId}&sort=name`)).status).toBe(200);
    expect((await inv(`?productId=${productId}&sort=updated`)).status).toBe(200);
    const p2 = await inv(`?productId=${productId}&pageSize=4&page=2`);
    expect(p2.body.data).toHaveLength(2);
    expect(p2.body.meta).toMatchObject({ page: 2, pageSize: 4, total: 6, totalPages: 2 });
    expect((await inv(`?productId=${productId}&pageSize=4&page=9`)).body.data).toEqual([]);
  });

  it('q theo SKU không phân biệt hoa thường và theo tên không dấu', async () => {
    expect(idsOf(await inv('?q=tm4i-bnd5'))).toEqual([ids.s5]);
    expect(idsOf(await inv('?q=TM4I-BND5'))).toEqual([ids.s5]);
    // searchText chuẩn hóa không dấu của sản phẩm
    await prisma.product.update({
      where: { id: productId },
      data: { searchText: 'ca phe rang xay tm4i-uniq' },
    });
    const res = await inv(`?q=${encodeURIComponent('Cà phê rang')}&pageSize=100`);
    expect(idsOf(res)).toContain(ids.s0);
  });

  it('q chứa % và _ chỉ là ký tự thường', async () => {
    const pct = await fx.mkVariant('pct', { productId });
    await prisma.productVariant.update({
      where: { id: pct.id },
      data: { sku: 'TM4I-PCT%X' },
    });
    const und = await fx.mkVariant('und', { productId });
    await prisma.productVariant.update({
      where: { id: und.id },
      data: { sku: 'TM4I-U_X' },
    });
    expect(idsOf(await inv(`?q=${encodeURIComponent('tm4i-pct%x')}`))).toEqual([pct.id]);
    expect(idsOf(await inv(`?q=${encodeURIComponent('pct%')}`))).toEqual([pct.id]);
    expect(idsOf(await inv(`?q=${encodeURIComponent('tm4i-u_x')}`))).toEqual([und.id]);
    // `_` không được khớp bất kỳ ký tự nào; `%` không khớp mọi chuỗi
    expect(idsOf(await inv(`?q=${encodeURIComponent('tm4i_pct%x')}`))).toEqual([]);
    expect(idsOf(await inv(`?q=${encodeURIComponent('tm4i-u%x')}`))).toEqual([]);
    expect(idsOf(await inv(`?q=${encodeURIComponent('tm4i-bn_5')}`))).toEqual([]);
    expect(idsOf(await inv(`?q=${encodeURIComponent('%bnd5')}`))).toEqual([]);
    const all = await inv(`?q=${encodeURIComponent('%')}&pageSize=100`);
    expect(idsOf(all)).toEqual([pct.id]);
  });

  it('loại biến thể và sản phẩm đã xóa mềm, giữ biến thể isActive=false và sản phẩm DRAFT', async () => {
    const draft = await fx.mkVariant('draft', { status: 'DRAFT', isActive: false });
    const gone = await fx.mkVariant('gone', { productId });
    await prisma.productVariant.update({ where: { id: gone.id }, data: { deletedAt: new Date() } });
    const delProd = await fx.mkVariant('delprod');
    await prisma.product.update({
      where: { id: delProd.productId },
      data: { deletedAt: new Date() },
    });

    const res = await inv('?q=tm4i&pageSize=100');
    const got = idsOf(res);
    expect(got).toContain(draft.id);
    expect(got).not.toContain(gone.id);
    expect(got).not.toContain(delProd.id);
    const d = (res.body.data as Json[]).find((i) => i.variantId === draft.id);
    expect(d).toMatchObject({ productStatus: 'DRAFT', isActive: false });
  });

  it('imageUrl là null khi sản phẩm không có ảnh', async () => {
    const v = await fx.mkVariant('noimg');
    await prisma.productImage.deleteMany({ where: { productId: v.productId } });
    const res = await inv(`?productId=${v.productId}`);
    expect(res.body.data[0].imageUrl).toBeNull();
  });
});

describe('POST /admin/inventory/adjust', () => {
  const movementsOf = (variantId: string) =>
    prisma.inventoryMovement.findMany({ where: { variantId }, orderBy: { createdAt: 'asc' } });
  const auditsOf = (variantId: string) =>
    prisma.auditLog.findMany({
      where: { action: 'inventory.adjust', entityId: variantId },
      orderBy: { createdAt: 'asc' },
    });

  it('RESTOCK đúng: ghi movement + audit, trả item + movement', async () => {
    const v = await fx.mkVariant('rs', { stock: 10 });
    const res = await adjust({
      variantId: v.id,
      reason: 'RESTOCK',
      change: 5,
      note: 'Nhập lô mới',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const d = dataOf(res);
    expect(d.item).toMatchObject({ variantId: v.id, stock: 15, stockStatus: 'IN_STOCK' });
    expect(d.movement).toMatchObject({
      variantId: v.id,
      sku: v.sku,
      change: 5,
      stockAfter: 15,
      reason: 'RESTOCK',
      orderCode: null,
      actor: { id: staff.id },
      note: 'Nhập lô mới',
    });
    expect(await stockOf(v.id)).toBe(15);
    const [m] = await movementsOf(v.id);
    expect(m).toMatchObject({ change: 5, stockAfter: 15, reason: 'RESTOCK', actorId: staff.id });
    const [a] = await auditsOf(v.id);
    expect(a).toMatchObject({ actorId: staff.id, entity: 'ProductVariant' });
    expect(a!.diff).toEqual({ stock: [10, 15], reason: [null, 'RESTOCK'] });
    expect(a!.ip).toBeTruthy();
  });

  it('RESTOCK note tùy chọn; change <= 0 -> 400', async () => {
    const v = await fx.mkVariant('rs2', { stock: 1 });
    expect((await adjust({ variantId: v.id, reason: 'RESTOCK', change: 1 })).status).toBe(200);
    for (const change of [0, -1]) {
      const res = await adjust({ variantId: v.id, reason: 'RESTOCK', change });
      expect(res.status).toBe(400);
      expect(errOf(res).code).toBe('VALIDATION_ERROR');
    }
    expect((await adjust({ variantId: v.id, reason: 'RESTOCK' })).status).toBe(400);
    expect(await stockOf(v.id)).toBe(2);
  });

  it('DAMAGE: change < 0 và note bắt buộc', async () => {
    const v = await fx.mkVariant('dm', { stock: 10 });
    const noNote = await adjust({ variantId: v.id, reason: 'DAMAGE', change: -2 });
    expect(noNote.status).toBe(400);
    expect(errOf(noNote).details).toEqual([expect.objectContaining({ field: 'note' })]);
    expect((await adjust({ variantId: v.id, reason: 'DAMAGE', change: 2, note: 'x' })).status).toBe(
      400,
    );
    expect(
      (await adjust({ variantId: v.id, reason: 'DAMAGE', change: -2, note: '  ' })).status,
    ).toBe(400);
    const ok = await adjust({ variantId: v.id, reason: 'DAMAGE', change: -2, note: 'Vỡ bao bì' });
    expect(ok.status).toBe(200);
    expect(dataOf(ok).item.stock).toBe(8);
    expect(dataOf(ok).movement).toMatchObject({ change: -2, stockAfter: 8, reason: 'DAMAGE' });
  });

  it('ADJUSTMENT: change khác 0, hai chiều, note bắt buộc', async () => {
    const v = await fx.mkVariant('adj', { stock: 10 });
    expect((await adjust({ variantId: v.id, reason: 'ADJUSTMENT', change: 3 })).status).toBe(400);
    expect(
      (await adjust({ variantId: v.id, reason: 'ADJUSTMENT', change: 0, note: 'x' })).status,
    ).toBe(400);
    expect(
      (await adjust({ variantId: v.id, reason: 'ADJUSTMENT', change: 3, note: 'Tìm thấy thêm' }))
        .status,
    ).toBe(200);
    expect(
      (await adjust({ variantId: v.id, reason: 'ADJUSTMENT', change: -4, note: 'Đếm lại' })).status,
    ).toBe(200);
    expect(await stockOf(v.id)).toBe(9);
    expect(await movementsOf(v.id)).toHaveLength(2);
  });

  it('STOCKTAKE: newStock bắt buộc >= 0, không dùng change', async () => {
    const v = await fx.mkVariant('st', { stock: 10 });
    expect((await adjust({ variantId: v.id, reason: 'STOCKTAKE' })).status).toBe(400);
    expect((await adjust({ variantId: v.id, reason: 'STOCKTAKE', newStock: -1 })).status).toBe(400);
    expect(
      (await adjust({ variantId: v.id, reason: 'STOCKTAKE', newStock: 4, change: 1 })).status,
    ).toBe(400);
    expect((await adjust({ variantId: v.id, reason: 'STOCKTAKE', newStock: 100_001 })).status).toBe(
      400,
    );
    const ok = await adjust({ variantId: v.id, reason: 'STOCKTAKE', newStock: 4 });
    expect(ok.status).toBe(200);
    expect(dataOf(ok).movement).toMatchObject({ change: -6, stockAfter: 4, reason: 'STOCKTAKE' });
    expect(await stockOf(v.id)).toBe(4);
  });

  it('STOCKTAKE không đổi số -> 200 movement null, không ghi movement/audit', async () => {
    const v = await fx.mkVariant('st0', { stock: 7 });
    const res = await adjust({ variantId: v.id, reason: 'STOCKTAKE', newStock: 7 });
    expect(res.status).toBe(200);
    expect(dataOf(res).movement).toBeNull();
    expect(dataOf(res).item.stock).toBe(7);
    expect(await movementsOf(v.id)).toHaveLength(0);
    expect(await auditsOf(v.id)).toHaveLength(0);
  });

  it('ORDER_RESERVE / ORDER_RELEASE / reason sai -> 400', async () => {
    const v = await fx.mkVariant('ord', { stock: 10 });
    for (const reason of ['ORDER_RESERVE', 'ORDER_RELEASE', 'BOGUS']) {
      const res = await adjust({ variantId: v.id, reason, change: 1, note: 'x' });
      expect(res.status, reason).toBe(400);
      expect(errOf(res).code).toBe('VALIDATION_ERROR');
    }
    expect(await stockOf(v.id)).toBe(10);
  });

  it('giới hạn: |change| <= 100000, note <= 255, change không nguyên', async () => {
    const v = await fx.mkVariant('lim', { stock: 10 });
    expect((await adjust({ variantId: v.id, reason: 'RESTOCK', change: 100_001 })).status).toBe(
      400,
    );
    expect((await adjust({ variantId: v.id, reason: 'RESTOCK', change: 1.5 })).status).toBe(400);
    expect(
      (await adjust({ variantId: v.id, reason: 'RESTOCK', change: 1, note: 'a'.repeat(256) }))
        .status,
    ).toBe(400);
    expect(
      (await adjust({ variantId: v.id, reason: 'RESTOCK', change: 1, note: 'a'.repeat(255) }))
        .status,
    ).toBe(200);
    expect((await adjust({ variantId: v.id, reason: 'RESTOCK', change: 100_000 })).status).toBe(
      200,
    );
  });

  it('giảm quá tồn -> 409 CONFLICT, kho không đổi, không ghi movement/audit', async () => {
    const v = await fx.mkVariant('over', { stock: 3 });
    const res = await adjust({ variantId: v.id, reason: 'DAMAGE', change: -4, note: 'Mất' });
    expect(res.status).toBe(409);
    expect(errOf(res)).toMatchObject({
      code: 'CONFLICT',
      message: 'Tồn kho không đủ để giảm',
      details: { currentStock: 3 },
    });
    expect(await stockOf(v.id)).toBe(3);
    expect(await movementsOf(v.id)).toHaveLength(0);
    expect(await auditsOf(v.id)).toHaveLength(0);
    // giảm đúng bằng tồn thì được
    expect(
      (await adjust({ variantId: v.id, reason: 'DAMAGE', change: -3, note: 'Hết' })).status,
    ).toBe(200);
    expect(await stockOf(v.id)).toBe(0);
  });

  it('expectedStock lệch -> 409 CONFLICT + currentStock; khớp thì qua', async () => {
    const v = await fx.mkVariant('exp', { stock: 10 });
    const bad = await adjust({ variantId: v.id, reason: 'RESTOCK', change: 1, expectedStock: 9 });
    expect(bad.status).toBe(409);
    expect(errOf(bad)).toMatchObject({ code: 'CONFLICT', details: { currentStock: 10 } });
    expect(await stockOf(v.id)).toBe(10);
    const stale = await adjust({
      variantId: v.id,
      reason: 'STOCKTAKE',
      newStock: 10,
      expectedStock: 3,
    });
    expect(stale.status).toBe(409);
    const ok = await adjust({ variantId: v.id, reason: 'RESTOCK', change: 1, expectedStock: 10 });
    expect(ok.status).toBe(200);
    expect(await stockOf(v.id)).toBe(11);
  });

  it('Product.inStock cập nhật khi về 0 và khi nhập lại', async () => {
    const v = await fx.mkVariant('instock', { stock: 3 });
    const inStock = async () =>
      (await prisma.product.findUniqueOrThrow({ where: { id: v.productId } })).inStock;
    expect(
      (await adjust({ variantId: v.id, reason: 'DAMAGE', change: -3, note: 'Hết hàng' })).status,
    ).toBe(200);
    expect(await inStock()).toBe(false);
    expect((await adjust({ variantId: v.id, reason: 'RESTOCK', change: 2 })).status).toBe(200);
    expect(await inStock()).toBe(true);
    expect((await adjust({ variantId: v.id, reason: 'STOCKTAKE', newStock: 0 })).status).toBe(200);
    expect(await inStock()).toBe(false);
  });

  it('biến thể không tồn tại / sai định dạng / đã xóa mềm / sản phẩm đã xóa mềm -> 404', async () => {
    const body = { reason: 'RESTOCK', change: 1 };
    expect((await adjust({ ...body, variantId: 'clxnotexist000000000' })).status).toBe(404);

    const v = await fx.mkVariant('del', { stock: 5 });
    await prisma.productVariant.update({ where: { id: v.id }, data: { deletedAt: new Date() } });
    const res = await adjust({ ...body, variantId: v.id });
    expect(res.status).toBe(404);
    expect(errOf(res).code).toBe('NOT_FOUND');

    const p = await fx.mkVariant('delp', { stock: 5 });
    await prisma.product.update({ where: { id: p.productId }, data: { deletedAt: new Date() } });
    expect((await adjust({ ...body, variantId: p.id })).status).toBe(404);
    expect(await stockOf(p.id)).toBe(5);
    expect(await movementsOf(p.id)).toHaveLength(0);
  });

  it('hai request DAMAGE đồng thời không làm tồn âm', async () => {
    const v = await fx.mkVariant('race', { stock: 10 });
    const req = () => adjust({ variantId: v.id, reason: 'DAMAGE', change: -7, note: 'Đồng thời' });
    const results = await Promise.all([req(), req()]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const loser = results.find((r) => r.status === 409)!;
    expect(errOf(loser).details).toEqual({ currentStock: 3 });
    expect(await stockOf(v.id)).toBe(3);
    expect(await movementsOf(v.id)).toHaveLength(1);
  });

  it('nhiều request đồng thời: tổng đúng, không mất cập nhật', async () => {
    const v = await fx.mkVariant('race2', { stock: 0 });
    const results = await Promise.all(
      Array.from({ length: 6 }, () => adjust({ variantId: v.id, reason: 'RESTOCK', change: 2 })),
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(await stockOf(v.id)).toBe(12);
    const ms = await movementsOf(v.id);
    expect(ms.map((m) => m.stockAfter).sort((a, b) => a - b)).toEqual([2, 4, 6, 8, 10, 12]);
  });

  it('thiếu variantId -> 400', async () => {
    const res = await adjust({ reason: 'RESTOCK', change: 1 });
    expect(res.status).toBe(400);
  });
});

describe('GET /admin/inventory/movements', () => {
  let v: Awaited<ReturnType<typeof fx.mkVariant>>;
  const mv = (q: string) => fx.call('get', `/admin/inventory/movements${q}`, staff.who);
  const todayVn = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

  beforeAll(async () => {
    v = await fx.mkVariant('mv', { stock: 20 });
    expect((await adjust({ variantId: v.id, reason: 'RESTOCK', change: 5 })).status).toBe(200);
    expect(
      (await adjust({ variantId: v.id, reason: 'DAMAGE', change: -1, note: 'Rơi vỡ' })).status,
    ).toBe(200);
    expect((await adjust({ variantId: v.id, reason: 'STOCKTAKE', newStock: 10 })).status).toBe(200);
    const { order } = await placeGuestOrder(fx, [[v.id, 2]]);
    expect(order.code).toBeTruthy();
  });

  it('lọc theo variantId, sắp createdAt DESC, id DESC, DTO đúng contract', async () => {
    const res = await mv(`?variantId=${v.id}`);
    expect(res.status).toBe(200);
    const list = res.body.data as Json[];
    expect(list).toHaveLength(4);
    expect(list.map((m) => m.reason)).toEqual(['ORDER_RESERVE', 'STOCKTAKE', 'DAMAGE', 'RESTOCK']);
    const times = list.map((m) => m.createdAt as string);
    expect([...times].sort().reverse()).toEqual(times);
    expect(list[2]).toMatchObject({
      variantId: v.id,
      sku: v.sku,
      productName: expect.stringContaining('Sản phẩm mv'),
      variantName: 'Biến thể mv',
      change: -1,
      stockAfter: 24,
      reason: 'DAMAGE',
      orderCode: null,
      actor: { id: staff.id, fullName: expect.any(String) },
      note: 'Rơi vỡ',
    });
    expect(res.body.meta).toMatchObject({ page: 1, pageSize: 20, total: 4, totalPages: 1 });
  });

  it('ORDER_RESERVE có orderCode và actor null', async () => {
    const res = await mv(`?variantId=${v.id}&reason=ORDER_RESERVE`);
    expect(res.body.data).toHaveLength(1);
    const m = res.body.data[0] as Json;
    expect(m).toMatchObject({ change: -2, stockAfter: 8, actor: null });
    expect(m.orderCode).toMatch(/^BB-/);
    const order = await prisma.order.findUniqueOrThrow({ where: { code: m.orderCode } });
    expect(order.contactEmail.startsWith(PREFIX)).toBe(true);
  });

  it('reason nhiều giá trị; reason sai -> 400', async () => {
    const res = await mv(`?variantId=${v.id}&reason=RESTOCK,DAMAGE`);
    expect((res.body.data as Json[]).map((m) => m.reason).sort()).toEqual(['DAMAGE', 'RESTOCK']);
    expect((await mv('?reason=NOPE')).status).toBe(400);
  });

  it('lọc from/to theo giờ VN, hai đầu bao gồm; from > to hoặc sai ngày -> 400', async () => {
    const today = todayVn();
    expect((await mv(`?variantId=${v.id}&from=${today}&to=${today}`)).body.meta.total).toBe(4);
    expect((await mv(`?variantId=${v.id}&from=2020-01-01&to=2020-01-02`)).body.meta.total).toBe(0);
    expect((await mv(`?variantId=${v.id}&to=2020-01-02`)).body.meta.total).toBe(0);
    expect((await mv(`?variantId=${v.id}&from=2020-01-01`)).body.meta.total).toBe(4);
    expect((await mv('?from=2026-02-02&to=2026-02-01')).status).toBe(400);
    expect((await mv('?from=2026-02-31')).status).toBe(400);
    expect((await mv('?from=abc')).status).toBe(400);
  });

  it('phân trang', async () => {
    const res = await mv(`?variantId=${v.id}&pageSize=3&page=2`);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta).toMatchObject({ page: 2, pageSize: 3, total: 4, totalPages: 2 });
  });
});
