import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { API, bearer, login, ORIGIN, PW } from './authHelpers.js';
import { createFixtures, dataOf, errOf, type Who } from './checkoutHelpers.js';
import { placeGuestOrder } from './orderTestHelpers.js';

const PREFIX = 'tm4o-';
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

let staff: { id: string; email: string; who: Who };
let admin: { id: string; email: string; who: Who };
let customer: { id: string; email: string; who: Who };

const adm = (
  method: 'get' | 'patch',
  path: string,
  who: Who = staff.who,
  body?: Record<string, unknown>,
) => fx.call(method, `/admin/orders${path}`, who, body);
const patchStatus = (code: string, body: Record<string, unknown>, who: Who = staff.who) =>
  adm('patch', `/${code}/status`, who, body);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

const stockOf = async (id: string) =>
  (await prisma.productVariant.findUniqueOrThrow({ where: { id } })).stock;

async function mkRole(key: string, role: 'STAFF' | 'ADMIN' | 'CUSTOMER') {
  const u = await fx.mkUser(key);
  if (role !== 'CUSTOMER') await prisma.user.update({ where: { id: u.id }, data: { role } });
  return u;
}

async function cleanAudit() {
  const orders = await prisma.order.findMany({
    where: { contactEmail: { startsWith: PREFIX } },
    select: { id: true },
  });
  await prisma.auditLog.deleteMany({
    where: { entity: 'Order', entityId: { in: orders.map((o) => o.id) } },
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

/** Đưa đơn tới trạng thái mong muốn qua API (hợp lệ từng bước). */
async function advance(code: string, path: string[]) {
  let cur = 'PENDING';
  for (const to of path) {
    const body: Record<string, unknown> = { fromStatus: cur, toStatus: to };
    if (to === 'SHIPPING') body.trackingNumber = 'TRK-1';
    if (to === 'FAILED_DELIVERY') body.note = 'Khách không nghe máy';
    const res = await patchStatus(code, body);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    cur = to;
  }
}

describe('phân quyền /admin', () => {
  it('401 không token / token sai', async () => {
    const res = await adm('get', '', {});
    expect(res.status).toBe(401);
    expect(errOf(res).code).toBe('UNAUTHORIZED');
    expect((await adm('get', '', { auth: bearer('abc.def.ghi') })).status).toBe(401);
  });

  it('403 CUSTOMER; 200 STAFF và ADMIN', async () => {
    const c = await adm('get', '', customer.who);
    expect(c.status).toBe(403);
    expect(errOf(c).code).toBe('FORBIDDEN');
    expect((await adm('get', '?q=' + PREFIX, staff.who)).status).toBe(200);
    expect((await adm('get', '?q=' + PREFIX, admin.who)).status).toBe(200);
  });

  it('Cache-Control: no-store trên 200, 401 và 403', async () => {
    expect((await adm('get', '?q=' + PREFIX)).headers['cache-control']).toBe('no-store');
    expect((await adm('get', '', {})).headers['cache-control']).toBe('no-store');
    expect((await adm('get', '', customer.who)).headers['cache-control']).toBe('no-store');
  });

  it('user DISABLED -> 403 ACCOUNT_DISABLED ngay với token cũ', async () => {
    const u = await mkRole('dis', 'STAFF');
    expect((await adm('get', '?q=' + PREFIX, u.who)).status).toBe(200);
    await prisma.user.update({ where: { id: u.id }, data: { status: 'DISABLED' } });
    const res = await adm('get', '?q=' + PREFIX, u.who);
    expect(res.status).toBe(403);
    expect(errOf(res).code).toBe('ACCOUNT_DISABLED');
  });

  it('hạ role STAFF -> CUSTOMER thì token cũ bị 403 ngay', async () => {
    const u = await mkRole('demote', 'STAFF');
    expect((await adm('get', '?q=' + PREFIX, u.who)).status).toBe(200);
    await prisma.user.update({ where: { id: u.id }, data: { role: 'CUSTOMER' } });
    const res = await adm('get', '?q=' + PREFIX, u.who);
    expect(res.status).toBe(403);
    expect(errOf(res).code).toBe('FORBIDDEN');
  });

  it('upload limiter chỉ áp cho /admin/uploads, không áp cho /admin/orders', async () => {
    const small = createApp({ ...BIG, uploadRateLimit: 1 });
    const call = (path: string) =>
      request(small).get(`${API}${path}`).set('Origin', ORIGIN).set(staff.who.auth!);
    for (let i = 0; i < 4; i++) expect((await call('/admin/orders?q=' + PREFIX)).status).toBe(200);
    // Stub uploads chưa có route: lần 1 lọt qua limiter -> 404, lần 2 bị chặn -> 429.
    expect((await call('/admin/uploads')).status).toBe(404);
    const blocked = await call('/admin/uploads');
    expect(blocked.status).toBe(429);
    expect(errOf(blocked)).toMatchObject({ code: 'RATE_LIMITED' });
    // Sau khi hết hạn mức upload, orders vẫn hoạt động.
    expect((await call('/admin/orders?q=' + PREFIX)).status).toBe(200);
  });

  it('upload limiter đứng sau xác thực: không token -> 401, không tiêu hạn mức', async () => {
    const small = createApp({ ...BIG, uploadRateLimit: 1 });
    const anon = () => request(small).get(`${API}/admin/uploads`).set('Origin', ORIGIN);
    expect((await anon()).status).toBe(401);
    expect((await anon()).status).toBe(401);
  });
});

describe('GET /admin/orders', () => {
  const codes: Record<string, string> = {};
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const v = await fx.mkVariant('list', { stock: 500, price: 100000 });
    const mk = async (key: string, lines: Array<[string, number]>, phone?: string) => {
      const { order } = await placeGuestOrder(fx, lines, {}, phone);
      codes[key] = order.code as string;
      ids[key] = (await prisma.order.findUniqueOrThrow({ where: { code: order.code } })).id;
    };
    await mk('a', [[v.id, 2]], '0977123456');
    await mk('b', [[v.id, 1]], '0988765432');
    await mk('c', [[v.id, 3]], '0966111222');
    await mk('d', [[v.id, 1]], '0955000111');
    const set = (key: string, data: Record<string, unknown>) =>
      prisma.order.update({ where: { id: ids[key]! }, data });
    // Mốc thời gian theo giờ VN
    await set('a', { createdAt: new Date('2026-03-10T16:59:59.999Z') }); // 10/03 23:59:59.999 VN
    await set('b', { createdAt: new Date('2026-03-10T17:00:00.000Z') }); // 11/03 00:00:00 VN
    await set('c', {
      createdAt: new Date('2026-03-09T17:00:00.000Z'), // 10/03 00:00:00 VN
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
      paymentMethod: 'VNPAY',
    });
    await set('d', { createdAt: new Date('2026-03-09T16:59:59.999Z'), status: 'CANCELLED' }); // 09/03 23:59:59.999 VN
  });

  const list = async (qs: string) => {
    const res = await adm('get', `?q=${PREFIX}&${qs}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body as Json;
  };
  const codesOf = (body: Json) => (body.data as Json[]).map((o) => o.code as string);

  it('item đúng hình dạng, itemCount là tổng quantity', async () => {
    const body = await list('pageSize=100');
    const a = (body.data as Json[]).find((o) => o.code === codes.a);
    expect(a).toMatchObject({
      status: 'PENDING',
      paymentStatus: 'UNPAID',
      paymentMethod: 'COD',
      shippingMethod: 'STANDARD',
      customerName: 'Nguyễn Văn An',
      contactPhone: '0977123456',
      isGuest: true,
      itemCount: 2,
    });
    expect(a.contactEmail).toMatch(new RegExp(`^${PREFIX}`));
    expect(typeof a.grandTotal).toBe('number');
    expect(typeof a.provinceName).toBe('string');
    expect(a).not.toHaveProperty('idempotencyKey');
    expect(a).not.toHaveProperty('shippingAddress');
    expect(body.meta).toMatchObject({ page: 1, pageSize: 100, total: 4, totalPages: 1 });
  });

  it('lọc status (một hoặc nhiều), paymentStatus, paymentMethod', async () => {
    expect(codesOf(await list('status=CONFIRMED'))).toEqual([codes.c]);
    expect(codesOf(await list('status=CONFIRMED,CANCELLED')).sort()).toEqual(
      [codes.c, codes.d].sort(),
    );
    expect(codesOf(await list('paymentStatus=PAID'))).toEqual([codes.c]);
    expect(codesOf(await list('paymentMethod=VNPAY'))).toEqual([codes.c]);
    expect(codesOf(await list('paymentMethod=COD&paymentStatus=UNPAID'))).toHaveLength(3);
    expect((await list('status=SHIPPING')).data).toEqual([]);
  });

  it('from/to theo giờ VN, gồm cả hai đầu', async () => {
    // 10/03 VN: c (00:00:00) và a (23:59:59.999); b là 11/03, d là 09/03.
    expect(codesOf(await list('from=2026-03-10&to=2026-03-10')).sort()).toEqual(
      [codes.a, codes.c].sort(),
    );
    expect(codesOf(await list('from=2026-03-11&to=2026-03-11'))).toEqual([codes.b]);
    expect(codesOf(await list('to=2026-03-09'))).toEqual([codes.d]);
    expect(codesOf(await list('from=2026-03-11'))).toEqual([codes.b]);
    expect(codesOf(await list('from=2026-03-09&to=2026-03-11'))).toHaveLength(4);
  });

  it('from > to, ngày sai -> 400', async () => {
    for (const qs of ['from=2026-03-11&to=2026-03-10', 'from=2026-02-31', 'to=10-03-2026']) {
      const res = await adm('get', `?${qs}`);
      expect(res.status, qs).toBe(400);
      expect(errOf(res).code).toBe('VALIDATION_ERROR');
    }
  });

  it('q theo mã (không phân biệt hoa thường, chứa chuỗi)', async () => {
    const code = codes.a!;
    const res = await adm('get', `?q=${code.toLowerCase()}`);
    expect(codesOf(res.body as Json)).toEqual([code]);
    const part = await adm('get', `?q=${code.slice(-4).toLowerCase()}&pageSize=100`);
    expect(codesOf(part.body as Json)).toContain(code);
  });

  it('q theo SĐT: chữ số, +84, dấu cách; < 3 chữ số không khớp SĐT', async () => {
    expect(codesOf((await adm('get', '?q=0977123456')).body as Json)).toEqual([codes.a]);
    expect(codesOf((await adm('get', '?q=977123')).body as Json)).toEqual([codes.a]);
    expect(
      codesOf((await adm('get', `?q=${encodeURIComponent('+84 977 123 456')}`)).body as Json),
    ).toEqual([codes.a]);
    expect(codesOf((await adm('get', `?q=${encodeURIComponent('+84988')}`)).body as Json)).toEqual([
      codes.b,
    ]);
    // "77" chỉ có 2 chữ số: không dùng để khớp SĐT (không có mã/email nào chứa "77" kèm prefix)
    const short = await adm('get', `?q=${PREFIX}77`);
    expect((short.body as Json).data).toEqual([]);
  });

  it('q theo email (lowercase), kết hợp OR', async () => {
    const email = (await prisma.order.findUniqueOrThrow({ where: { id: ids.b! } })).contactEmail;
    const res = await adm('get', `?q=${encodeURIComponent(email.toUpperCase())}`);
    expect(codesOf(res.body as Json)).toEqual([codes.b]);
  });

  it('q không coi % và _ là ký tự đại diện', async () => {
    for (const q of ['%%', '__', 'tm4o-%']) {
      const res = await adm('get', `?q=${encodeURIComponent(q)}`);
      expect(res.status).toBe(200);
      expect((res.body as Json).data, q).toEqual([]);
    }
  });

  it('q ngắn/dài quá -> 400', async () => {
    expect((await adm('get', '?q=a')).status).toBe(400);
    expect((await adm('get', `?q=${'a'.repeat(51)}`)).status).toBe(400);
  });

  it('sort newest/oldest', async () => {
    expect(codesOf(await list('sort=newest'))).toEqual([codes.b, codes.a, codes.c, codes.d]);
    expect(codesOf(await list('sort=oldest'))).toEqual([codes.d, codes.c, codes.a, codes.b]);
    expect((await adm('get', '?sort=random')).status).toBe(400);
  });

  it('phân trang và page vượt tổng', async () => {
    const p1 = await list('pageSize=3&page=1&sort=oldest');
    const p2 = await list('pageSize=3&page=2&sort=oldest');
    expect(p1.meta).toMatchObject({ total: 4, totalPages: 2, page: 1, pageSize: 3 });
    expect([...codesOf(p1), ...codesOf(p2)]).toEqual([codes.d, codes.c, codes.a, codes.b]);
    expect((await list('page=9')).data).toEqual([]);
    for (const qs of ['page=0', 'pageSize=0', 'pageSize=101', 'page=abc']) {
      expect((await adm('get', `?${qs}`)).status, qs).toBe(400);
    }
  });

  it('statusCounts đủ mọi trạng thái, bỏ qua bộ lọc status nhưng theo các bộ lọc khác', async () => {
    const all = await list('status=CANCELLED');
    expect(Object.keys(all.meta.statusCounts).sort()).toEqual(
      [
        'PENDING_PAYMENT',
        'PENDING',
        'CONFIRMED',
        'PROCESSING',
        'SHIPPING',
        'DELIVERED',
        'FAILED_DELIVERY',
        'CANCELLED',
        'RETURN_REQUESTED',
        'RETURNED',
      ].sort(),
    );
    expect(all.meta.statusCounts).toMatchObject({
      PENDING: 2,
      CONFIRMED: 1,
      CANCELLED: 1,
      SHIPPING: 0,
    });
    expect(all.meta.total).toBe(1);

    const cod = await list('paymentMethod=COD');
    expect(cod.meta.statusCounts).toMatchObject({ PENDING: 2, CONFIRMED: 0, CANCELLED: 1 });
    const dated = await list('from=2026-03-10&to=2026-03-10');
    expect(dated.meta.statusCounts).toMatchObject({ PENDING: 1, CONFIRMED: 1, CANCELLED: 0 });
  });

  it('enum sai -> 400', async () => {
    for (const qs of [
      'status=FOO',
      'status=PENDING,FOO',
      'paymentStatus=X',
      'paymentMethod=PAYPAL',
    ]) {
      const res = await adm('get', `?${qs}`);
      expect(res.status, qs).toBe(400);
      expect(errOf(res).code).toBe('VALIDATION_ERROR');
    }
  });
});

describe('GET /admin/orders/:code', () => {
  it('đủ trường AdminOrder, không lộ idempotencyKey/requestFingerprint, allowedTransitions đúng', async () => {
    const v = await fx.mkVariant('det', { stock: 10, price: 150000 });
    const { order } = await placeGuestOrder(fx, [[v.id, 2]]);
    const res = await adm('get', `/${order.code}`);
    expect(res.status).toBe(200);
    const o = dataOf(res) as Json;
    expect(o).toMatchObject({
      code: order.code,
      status: 'PENDING',
      paymentStatus: 'UNPAID',
      paymentMethod: 'COD',
      isGuest: true,
      customer: null,
      confirmedAt: null,
      cancelledAt: null,
      trackingNumber: null,
      carrier: null,
      cancelReason: null,
      deliveredAt: null,
      paidAt: null,
      subtotal: 300000,
    });
    expect(o.id).toEqual(expect.any(String));
    expect(o.updatedAt).toEqual(expect.any(String));
    expect(o.totalWeightGram).toBe(1000);
    expect(o.contact.phone).toBe('0901234567');
    expect(o.shippingAddress).toMatchObject({ fullName: 'Nguyễn Văn An', line1: '12 Lê Lợi' });
    expect(o.items).toHaveLength(1);
    expect(o.items[0]).toMatchObject({
      variantId: v.id,
      quantity: 2,
      unitPrice: 150000,
      lineTotal: 300000,
    });
    expect(o.history).toHaveLength(1);
    expect(o.history[0]).toMatchObject({ fromStatus: null, toStatus: 'PENDING', actor: null });
    expect(o).not.toHaveProperty('canCancel');
    for (const k of ['idempotencyKey', 'requestFingerprint', 'couponId', 'userId']) {
      expect(o, k).not.toHaveProperty(k);
    }
    expect(JSON.stringify(o)).not.toContain('requestFingerprint');
    expect(o.allowedTransitions.sort()).toEqual(['CANCELLED', 'CONFIRMED']);
  });

  it('chuẩn hóa mã (trim + uppercase); sai định dạng hoặc không tồn tại -> 404', async () => {
    const v = await fx.mkVariant('det2', { stock: 10 });
    const { order } = await placeGuestOrder(fx, [[v.id, 1]]);
    const lower = await adm(
      'get',
      `/${encodeURIComponent(`  ${(order.code as string).toLowerCase()} `)}`,
    );
    expect(lower.status).toBe(200);
    expect(dataOf(lower).code).toBe(order.code);
    for (const bad of ['abc', 'BB-261110-0000', 'BB-26111-ABCD', 'BB-261110-ABCDE']) {
      const res = await adm('get', `/${bad}`);
      expect(res.status, bad).toBe(404);
      expect(errOf(res).code).toBe('NOT_FOUND');
    }
    expect((await adm('get', '/BB-261110-ZZZZ')).status).toBe(404);
  });

  it('đơn của user: customer, actor trong history; STAFF và ADMIN cùng allowedTransitions', async () => {
    const v = await fx.mkVariant('det3', { stock: 10 });
    const addr = await fx.mkAddress(customer.id);
    expect((await fx.add(customer.who, v.id, 1)).status).toBe(201);
    const placed = await fx.postOrder(customer.who, {
      addressId: addr.id,
      shippingMethod: 'STANDARD',
      paymentMethod: 'COD',
      acceptTerms: true,
    });
    expect(placed.status).toBe(201);
    const code = dataOf(placed).code as string;
    const o = dataOf(await adm('get', `/${code}`)) as Json;
    expect(o.isGuest).toBe(false);
    expect(o.customer).toEqual({
      id: customer.id,
      email: customer.email,
      fullName: expect.any(String),
    });
    expect(dataOf(await adm('get', `/${code}`, admin.who)).allowedTransitions.sort()).toEqual([
      'CANCELLED',
      'CONFIRMED',
    ]);
    await patchStatus(code, { fromStatus: 'PENDING', toStatus: 'CONFIRMED' });
    const after = dataOf(await adm('get', `/${code}`)) as Json;
    expect(after.history.at(-1).actor).toEqual({
      id: staff.id,
      fullName: expect.any(String),
      role: 'STAFF',
    });
    expect(after.allowedTransitions.sort()).toEqual(['CANCELLED', 'PROCESSING']);
  });
});

describe('PATCH /admin/orders/:code/status', () => {
  it('luồng đầy đủ PENDING -> CONFIRMED -> PROCESSING -> SHIPPING -> DELIVERED (COD)', async () => {
    const v1 = await fx.mkVariant('flow1', { stock: 10 });
    const v2 = await fx.mkVariant('flow2', { stock: 10 });
    const { order } = await placeGuestOrder(fx, [
      [v1.id, 2],
      [v2.id, 3],
    ]);
    const code = order.code as string;
    const sold = async (id: string) =>
      (await prisma.product.findUniqueOrThrow({ where: { id } })).soldCount;

    let res = await patchStatus(code, { fromStatus: 'PENDING', toStatus: 'CONFIRMED' });
    expect(res.status).toBe(200);
    expect(dataOf(res)).toMatchObject({ status: 'CONFIRMED' });
    expect(dataOf(res).confirmedAt).toEqual(expect.any(String));
    expect(dataOf(res).allowedTransitions.sort()).toEqual(['CANCELLED', 'PROCESSING']);

    res = await patchStatus(code, {
      fromStatus: 'CONFIRMED',
      toStatus: 'PROCESSING',
      note: 'Đóng gói',
    });
    expect(res.status).toBe(200);

    res = await patchStatus(code, {
      fromStatus: 'PROCESSING',
      toStatus: 'SHIPPING',
      trackingNumber: ' GHN-123 ',
      carrier: 'GHN',
    });
    expect(res.status).toBe(200);
    expect(dataOf(res)).toMatchObject({
      status: 'SHIPPING',
      trackingNumber: 'GHN-123',
      carrier: 'GHN',
    });
    expect(await sold(v1.productId)).toBe(0);

    res = await patchStatus(code, { fromStatus: 'SHIPPING', toStatus: 'DELIVERED' });
    expect(res.status).toBe(200);
    const o = dataOf(res) as Json;
    expect(o).toMatchObject({ status: 'DELIVERED', paymentStatus: 'PAID', allowedTransitions: [] });
    expect(o.paidAt).toEqual(expect.any(String));
    expect(o.deliveredAt).toEqual(expect.any(String));
    expect(await sold(v1.productId)).toBe(2);
    expect(await sold(v2.productId)).toBe(3);

    expect((o.history as Json[]).map((h) => [h.fromStatus, h.toStatus])).toEqual([
      [null, 'PENDING'],
      ['PENDING', 'CONFIRMED'],
      ['CONFIRMED', 'PROCESSING'],
      ['PROCESSING', 'SHIPPING'],
      ['SHIPPING', 'DELIVERED'],
    ]);
    expect(o.history[1].actor).toMatchObject({ id: staff.id, role: 'STAFF' });
    expect(o.history[2].note).toBe('Đóng gói');
    // DELIVERED là cuối (v2 chưa triển khai): không đổi tiếp
    const again = await patchStatus(code, { fromStatus: 'DELIVERED', toStatus: 'CANCELLED' });
    expect(again.status).toBe(409);
    expect(errOf(again).code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('ADMIN cũng đổi được trạng thái; history ghi actor ADMIN', async () => {
    const v = await fx.mkVariant('adm', { stock: 5 });
    const { order } = await placeGuestOrder(fx, [[v.id, 1]]);
    const res = await patchStatus(
      order.code,
      { fromStatus: 'PENDING', toStatus: 'CONFIRMED' },
      admin.who,
    );
    expect(res.status).toBe(200);
    expect(dataOf(res).history.at(-1).actor).toMatchObject({ id: admin.id, role: 'ADMIN' });
  });

  it('SHIPPING -> FAILED_DELIVERY (cần note) -> SHIPPING lại, ghi đè/giữ tracking', async () => {
    const v = await fx.mkVariant('fail', { stock: 5 });
    const { order } = await placeGuestOrder(fx, [[v.id, 1]]);
    const code = order.code as string;
    await advance(code, ['CONFIRMED', 'PROCESSING', 'SHIPPING']);

    const noNote = await patchStatus(code, { fromStatus: 'SHIPPING', toStatus: 'FAILED_DELIVERY' });
    expect(noNote.status).toBe(400);
    expect(errOf(noNote).details).toEqual([expect.objectContaining({ field: 'note' })]);

    const failed = await patchStatus(code, {
      fromStatus: 'SHIPPING',
      toStatus: 'FAILED_DELIVERY',
      note: 'Khách không nghe máy',
    });
    expect(failed.status).toBe(200);
    expect(dataOf(failed).allowedTransitions.sort()).toEqual(['CANCELLED', 'SHIPPING']);

    // Không gửi tracking: giữ nguyên
    const keep = await patchStatus(code, { fromStatus: 'FAILED_DELIVERY', toStatus: 'SHIPPING' });
    expect(keep.status).toBe(200);
    expect(dataOf(keep)).toMatchObject({ trackingNumber: 'TRK-1', status: 'SHIPPING' });

    await patchStatus(code, { fromStatus: 'SHIPPING', toStatus: 'FAILED_DELIVERY', note: 'Lần 2' });
    const over = await patchStatus(code, {
      fromStatus: 'FAILED_DELIVERY',
      toStatus: 'SHIPPING',
      trackingNumber: 'NEW-9',
      carrier: 'VTP',
    });
    expect(over.status).toBe(200);
    expect(dataOf(over)).toMatchObject({ trackingNumber: 'NEW-9', carrier: 'VTP' });

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: dataOf(over).id, action: 'order.status' },
      orderBy: { createdAt: 'desc' },
    });
    expect(log.diff).toEqual({
      status: ['FAILED_DELIVERY', 'SHIPPING'],
      trackingNumber: ['TRK-1', 'NEW-9'],
      carrier: [null, 'VTP'],
    });
  });

  describe('hủy đơn', () => {
    const COUPON_BODY = (code: string) => ({ couponCode: code });

    it.each([
      ['PENDING', [], false],
      ['CONFIRMED', ['CONFIRMED'], false],
      ['PROCESSING', ['CONFIRMED', 'PROCESSING'], true],
      ['FAILED_DELIVERY', ['CONFIRMED', 'PROCESSING', 'SHIPPING', 'FAILED_DELIVERY'], false],
    ])(
      'hủy từ %s: hoàn kho ORDER_RELEASE, hoàn lượt mã đúng 1 lần',
      async (from, path, noteRequired) => {
        const v = await fx.mkVariant(`cx${from.toLowerCase()}`, { stock: 10, price: 100000 });
        const coupon = await fx.mkCoupon(`cx${from.toLowerCase()}`, {
          type: 'FIXED',
          value: 5000,
          usageLimit: 1,
        });
        const { order } = await placeGuestOrder(fx, [[v.id, 4]], COUPON_BODY(coupon.code));
        const code = order.code as string;
        expect(await stockOf(v.id)).toBe(6);
        expect(
          (await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).usedCount,
        ).toBe(1);
        await advance(code, path as string[]);

        if (noteRequired) {
          const miss = await patchStatus(code, { fromStatus: from, toStatus: 'CANCELLED' });
          expect(miss.status).toBe(400);
          expect(errOf(miss).details).toEqual([expect.objectContaining({ field: 'note' })]);
          expect(await stockOf(v.id)).toBe(6);
        }
        const body: Record<string, unknown> = { fromStatus: from, toStatus: 'CANCELLED' };
        if (noteRequired) body.note = 'Hết hàng thực tế';
        const res = await patchStatus(code, body);
        expect(res.status, JSON.stringify(res.body)).toBe(200);
        const o = dataOf(res) as Json;
        expect(o).toMatchObject({
          status: 'CANCELLED',
          cancelReason: noteRequired ? 'Hết hàng thực tế' : 'Cửa hàng hủy đơn',
          allowedTransitions: [],
        });
        expect(o.cancelledAt).toEqual(expect.any(String));
        expect(o.history.at(-1)).toMatchObject({
          fromStatus: from,
          toStatus: 'CANCELLED',
          actor: { id: staff.id },
        });

        expect(await stockOf(v.id)).toBe(10);
        const moves = await prisma.inventoryMovement.findMany({
          where: { orderId: o.id, reason: 'ORDER_RELEASE' },
        });
        expect(moves).toHaveLength(1);
        expect(moves[0]).toMatchObject({ change: 4, stockAfter: 10, actorId: staff.id });
        expect(
          (await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).usedCount,
        ).toBe(0);
        expect(
          (await prisma.couponRedemption.findUniqueOrThrow({ where: { orderId: o.id } }))
            .releasedAt,
        ).not.toBeNull();

        // Hủy lần nữa: không hoàn thêm
        const again = await patchStatus(code, { ...body });
        expect(again.status).toBe(409);
        expect(errOf(again).code).toBe('CONFLICT');
        expect(await stockOf(v.id)).toBe(10);
        expect(
          (await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).usedCount,
        ).toBe(0);
      },
    );

    it('ghi note khi hủy PENDING thì dùng làm cancelReason', async () => {
      const v = await fx.mkVariant('cxnote', { stock: 3 });
      const { order } = await placeGuestOrder(fx, [[v.id, 1]]);
      const res = await patchStatus(order.code, {
        fromStatus: 'PENDING',
        toStatus: 'CANCELLED',
        note: '  Khách yêu cầu  ',
      });
      expect(res.status).toBe(200);
      expect(dataOf(res).cancelReason).toBe('Khách yêu cầu');
    });

    it('fromStatus cũ khi hủy -> 409 CONFLICT, không hoàn kho', async () => {
      const v = await fx.mkVariant('cxstale', { stock: 5 });
      const { order } = await placeGuestOrder(fx, [[v.id, 2]]);
      await advance(order.code, ['CONFIRMED']);
      const res = await patchStatus(order.code, { fromStatus: 'PENDING', toStatus: 'CANCELLED' });
      expect(res.status).toBe(409);
      expect(errOf(res).code).toBe('CONFLICT');
      expect(errOf(res).details).toEqual({ currentStatus: 'CONFIRMED' });
      expect(await stockOf(v.id)).toBe(3);
    });
  });

  it('fromStatus cũ -> 409 CONFLICT kèm currentStatus (kiểm trước máy trạng thái)', async () => {
    const v = await fx.mkVariant('stale', { stock: 5 });
    const { order } = await placeGuestOrder(fx, [[v.id, 1]]);
    await advance(order.code, ['CONFIRMED']);
    // from cũ + to không hợp lệ: vẫn là CONFLICT, không phải INVALID_STATUS_TRANSITION
    const res = await patchStatus(order.code, { fromStatus: 'PENDING', toStatus: 'DELIVERED' });
    expect(res.status).toBe(409);
    expect(errOf(res)).toEqual({
      code: 'CONFLICT',
      message: 'Đơn hàng vừa được cập nhật, vui lòng tải lại',
      details: { currentStatus: 'CONFIRMED' },
    });
  });

  it('chuyển sai -> 409 INVALID_STATUS_TRANSITION kèm from/to/allowed', async () => {
    const v = await fx.mkVariant('inv', { stock: 5 });
    const { order } = await placeGuestOrder(fx, [[v.id, 1]]);
    const code = order.code as string;
    const skip = await patchStatus(code, {
      fromStatus: 'PENDING',
      toStatus: 'SHIPPING',
      trackingNumber: 'X1',
    });
    expect(skip.status).toBe(409);
    expect(errOf(skip)).toMatchObject({ code: 'INVALID_STATUS_TRANSITION' });
    expect((errOf(skip).details as Json).from).toBe('PENDING');
    expect((errOf(skip).details as Json).to).toBe('SHIPPING');
    expect(((errOf(skip).details as Json).allowed as string[]).sort()).toEqual([
      'CANCELLED',
      'CONFIRMED',
    ]);

    const same = await patchStatus(code, { fromStatus: 'PENDING', toStatus: 'PENDING' });
    expect(same.status).toBe(409);
    expect(errOf(same).code).toBe('INVALID_STATUS_TRANSITION');

    const v2 = await patchStatus(code, { fromStatus: 'PENDING', toStatus: 'RETURNED' });
    expect(v2.status).toBe(409);
    expect(errOf(v2).code).toBe('INVALID_STATUS_TRANSITION');

    const sys = await prisma.order.update({ where: { code }, data: { status: 'PENDING_PAYMENT' } });
    const pp = await patchStatus(sys.code, {
      fromStatus: 'PENDING_PAYMENT',
      toStatus: 'CONFIRMED',
    });
    expect(pp.status).toBe(409);
    expect(errOf(pp).code).toBe('INVALID_STATUS_TRANSITION');
    expect((errOf(pp).details as Json).allowed as string[]).toEqual(['CANCELLED']);
    // Không có tác dụng phụ
    expect((await prisma.order.findUniqueOrThrow({ where: { code } })).status).toBe(
      'PENDING_PAYMENT',
    );
  });

  it('thiếu trackingNumber khi PROCESSING -> SHIPPING -> 400 field trackingNumber', async () => {
    const v = await fx.mkVariant('trk', { stock: 5 });
    const { order } = await placeGuestOrder(fx, [[v.id, 1]]);
    const code = order.code as string;
    await advance(code, ['CONFIRMED', 'PROCESSING']);
    const res = await patchStatus(code, { fromStatus: 'PROCESSING', toStatus: 'SHIPPING' });
    expect(res.status).toBe(400);
    expect(errOf(res).code).toBe('VALIDATION_ERROR');
    expect(errOf(res).details).toEqual([expect.objectContaining({ field: 'trackingNumber' })]);
    expect((await prisma.order.findUniqueOrThrow({ where: { code } })).status).toBe('PROCESSING');
  });

  it('body sai -> 400: thiếu fromStatus/toStatus, enum sai, tracking sai, note quá dài', async () => {
    const v = await fx.mkVariant('body', { stock: 5 });
    const { order } = await placeGuestOrder(fx, [[v.id, 1]]);
    const code = order.code as string;
    const bad: Array<[Record<string, unknown>, string]> = [
      [{ toStatus: 'CONFIRMED' }, 'fromStatus'],
      [{ fromStatus: 'PENDING' }, 'toStatus'],
      [{ fromStatus: 'PENDING', toStatus: 'NOPE' }, 'toStatus'],
      [{ fromStatus: 'PENDING', toStatus: 'CONFIRMED', trackingNumber: 'a b!' }, 'trackingNumber'],
      [{ fromStatus: 'PENDING', toStatus: 'CONFIRMED', note: 'x'.repeat(501) }, 'note'],
    ];
    for (const [body, field] of bad) {
      const res = await patchStatus(code, body);
      expect(res.status, field).toBe(400);
      expect(JSON.stringify(errOf(res).details)).toContain(`"field":"${field}"`);
    }
  });

  it('404 cho đơn không tồn tại hoặc mã sai định dạng; 403/401 theo quyền', async () => {
    const body = { fromStatus: 'PENDING', toStatus: 'CONFIRMED' };
    expect((await patchStatus('BB-261110-ZZZZ', body)).status).toBe(404);
    expect((await patchStatus('nope', body)).status).toBe(404);
    expect((await patchStatus('BB-261110-ZZZZ', body, customer.who)).status).toBe(403);
    expect((await patchStatus('BB-261110-ZZZZ', body, {})).status).toBe(401);
  });

  it('CUSTOMER không đổi được trạng thái đơn', async () => {
    const v = await fx.mkVariant('cust', { stock: 5 });
    const { order } = await placeGuestOrder(fx, [[v.id, 1]]);
    const res = await patchStatus(
      order.code,
      { fromStatus: 'PENDING', toStatus: 'CONFIRMED' },
      customer.who,
    );
    expect(res.status).toBe(403);
    expect((await prisma.order.findUniqueOrThrow({ where: { code: order.code } })).status).toBe(
      'PENDING',
    );
  });

  it('2 request song song cùng fromStatus hủy: đúng 1 thành công, kho và mã hoàn 1 lần', async () => {
    const v = await fx.mkVariant('race', { stock: 10 });
    const coupon = await fx.mkCoupon('race', { type: 'FIXED', value: 1000, usageLimit: 3 });
    const { order } = await placeGuestOrder(fx, [[v.id, 3]], COUPON(coupon.code));
    const body = { fromStatus: 'PENDING', toStatus: 'CANCELLED' };
    const results = await Promise.all([
      patchStatus(order.code, body),
      patchStatus(order.code, body, admin.who),
      patchStatus(order.code, body),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409, 409]);
    for (const r of results.filter((x) => x.status === 409)) expect(errOf(r).code).toBe('CONFLICT');
    expect(await stockOf(v.id)).toBe(10);
    expect(
      await prisma.inventoryMovement.count({ where: { variantId: v.id, reason: 'ORDER_RELEASE' } }),
    ).toBe(1);
    expect((await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).usedCount).toBe(0);
    const row = await prisma.order.findUniqueOrThrow({ where: { code: order.code } });
    expect(
      await prisma.orderStatusHistory.count({ where: { orderId: row.id, toStatus: 'CANCELLED' } }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({ where: { entityId: row.id, action: 'order.status' } }),
    ).toBe(1);
  });

  it('2 request song song xác nhận: đúng 1 thành công, 1 history', async () => {
    const v = await fx.mkVariant('race2', { stock: 10 });
    const { order } = await placeGuestOrder(fx, [[v.id, 1]]);
    const body = { fromStatus: 'PENDING', toStatus: 'CONFIRMED' };
    const results = await Promise.all([
      patchStatus(order.code, body),
      patchStatus(order.code, body),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const row = await prisma.order.findUniqueOrThrow({ where: { code: order.code } });
    expect(
      await prisma.orderStatusHistory.count({ where: { orderId: row.id, toStatus: 'CONFIRMED' } }),
    ).toBe(1);
  });

  it('giao thành công 2 lần song song: soldCount chỉ tăng 1 lần', async () => {
    const v = await fx.mkVariant('race3', { stock: 10 });
    const { order } = await placeGuestOrder(fx, [[v.id, 2]]);
    await advance(order.code, ['CONFIRMED', 'PROCESSING', 'SHIPPING']);
    const body = { fromStatus: 'SHIPPING', toStatus: 'DELIVERED' };
    const results = await Promise.all([
      patchStatus(order.code, body),
      patchStatus(order.code, body),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: v.productId } })).soldCount).toBe(
      2,
    );
  });

  it('đơn online đã PAID khi hủy: paymentStatus giữ PAID; giao đơn online không đổi paidAt', async () => {
    const v = await fx.mkVariant('paid', { stock: 5 });
    const { order } = await placeGuestOrder(fx, [[v.id, 1]]);
    const paidAt = new Date('2026-03-01T00:00:00.000Z');
    await prisma.order.update({
      where: { code: order.code },
      data: { paymentMethod: 'VNPAY', paymentStatus: 'PAID', paidAt },
    });
    await advance(order.code, ['CONFIRMED', 'PROCESSING', 'SHIPPING', 'DELIVERED']);
    const row = await prisma.order.findUniqueOrThrow({ where: { code: order.code } });
    expect(row.paidAt?.toISOString()).toBe(paidAt.toISOString());

    const v2 = await fx.mkVariant('paid2', { stock: 5 });
    const { order: o2 } = await placeGuestOrder(fx, [[v2.id, 1]]);
    await prisma.order.update({
      where: { code: o2.code },
      data: { paymentMethod: 'VNPAY', paymentStatus: 'PAID', paidAt },
    });
    const res = await patchStatus(o2.code, { fromStatus: 'PENDING', toStatus: 'CANCELLED' });
    expect(res.status).toBe(200);
    expect(dataOf(res)).toMatchObject({ status: 'CANCELLED', paymentStatus: 'PAID' });
  });

  it('AuditLog order.status: action, entity, actorId, ip, diff; không có PII', async () => {
    const v = await fx.mkVariant('aud', { stock: 5 });
    const { order } = await placeGuestOrder(fx, [[v.id, 1]]);
    const code = order.code as string;
    const orderId = (await prisma.order.findUniqueOrThrow({ where: { code } })).id;

    await patchStatus(code, { fromStatus: 'PENDING', toStatus: 'CONFIRMED' });
    await patchStatus(code, { fromStatus: 'CONFIRMED', toStatus: 'PROCESSING' }, admin.who);
    await patchStatus(code, {
      fromStatus: 'PROCESSING',
      toStatus: 'SHIPPING',
      trackingNumber: 'AUD-1',
      carrier: 'GHN',
    });
    await patchStatus(code, {
      fromStatus: 'SHIPPING',
      toStatus: 'FAILED_DELIVERY',
      note: 'Vắng nhà',
    });
    await patchStatus(code, { fromStatus: 'FAILED_DELIVERY', toStatus: 'CANCELLED' }, admin.who);
    // thất bại không ghi log
    await patchStatus(code, { fromStatus: 'PENDING', toStatus: 'CONFIRMED' });

    const logs = await prisma.auditLog.findMany({
      where: { entityId: orderId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    expect(logs).toHaveLength(5);
    expect(logs.every((l) => l.action === 'order.status' && l.entity === 'Order')).toBe(true);
    expect(logs.map((l) => l.actorId)).toEqual([staff.id, admin.id, staff.id, staff.id, admin.id]);
    expect(logs.map((l) => l.diff)).toEqual([
      { status: ['PENDING', 'CONFIRMED'] },
      { status: ['CONFIRMED', 'PROCESSING'] },
      {
        status: ['PROCESSING', 'SHIPPING'],
        trackingNumber: [null, 'AUD-1'],
        carrier: [null, 'GHN'],
      },
      { status: ['SHIPPING', 'FAILED_DELIVERY'] },
      { status: ['FAILED_DELIVERY', 'CANCELLED'] },
    ]);
    for (const l of logs) {
      expect(l.ip).toEqual(expect.any(String));
      expect(l.ip).not.toBe('');
      const text = JSON.stringify(l);
      expect(text).not.toContain('0901234567');
      expect(text).not.toContain('Lê Lợi');
      expect(text).not.toContain(PREFIX + 'g');
    }
  });

  it('đăng nhập thật bằng mật khẩu rồi dùng token cho admin API', async () => {
    const res = await login(app, staff.email, PW);
    expect(res.status).toBe(200);
    const token = (res.body as { data: { accessToken: string } }).data.accessToken;
    expect((await adm('get', '?q=' + PREFIX, { auth: bearer(token) })).status).toBe(200);
  });
});

function COUPON(code: string) {
  return { couponCode: code };
}
