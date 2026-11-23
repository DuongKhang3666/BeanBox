import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { createFixtures, dataOf, errOf, type Who } from './checkoutHelpers.js';
import { placeGuestOrder, placeUserOrder } from './orderTestHelpers.js';

/** D-071 ghi chú nội bộ + D-072 dữ liệu in hàng loạt. */

const PREFIX = 'tw4n-';
const BIG = 100_000;
let app: Express;
const fx = createFixtures(() => app, PREFIX);

let staff: { id: string; who: Who };
let admin: { id: string; who: Who };
let customer: { id: string; email: string; who: Who };
let variantId = '';
let guestOrder: { code: string; contact: { phone: string } };
let userOrder: { code: string };

const SECRET = 'GHI-CHU-NOI-BO-KHONG-DUOC-LO';

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
  app = createApp({
    generalRateLimit: BIG,
    authRateLimit: BIG,
    trackRateLimit: BIG,
    couponRateLimit: BIG,
    quoteRateLimit: BIG,
    orderRateLimit: BIG,
    guestCancelRateLimit: BIG,
    dataExportRateLimit: BIG,
  });
  await cleanAudit();
  await fx.setup();
  staff = await fx.mkUser('staff');
  await prisma.user.update({ where: { id: staff.id }, data: { role: 'STAFF' } });
  admin = await fx.mkUser('admin');
  await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
  customer = await fx.mkUser('cust');
  variantId = (await fx.mkVariant('note', { stock: 100 })).id;
  guestOrder = (await placeGuestOrder(fx, [[variantId, 1]])).order;
  userOrder = await placeUserOrder(fx, customer, [[variantId, 1]]);
});
afterAll(async () => {
  await cleanAudit();
  await fx.clean();
  await prisma.$disconnect();
});

const notes = (code: string) => `/admin/orders/${code}/notes`;

describe('ghi chú nội bộ (D-071)', () => {
  it('Staff thêm ghi chú (trim), xem lại theo thứ tự; tác giả được trả về', async () => {
    const res = await fx.call('post', notes(guestOrder.code), staff.who, {
      body: `  ${SECRET} 1  `,
    });
    expect(res.status).toBe(201);
    expect(dataOf(res)).toMatchObject({
      body: `${SECRET} 1`,
      author: { id: staff.id, role: 'STAFF' },
    });
    await fx.call('post', notes(guestOrder.code), admin.who, { body: 'Dòng 1\nDòng 2\t(tab)' });

    const list = await fx.call('get', notes(guestOrder.code), staff.who);
    expect(list.status).toBe(200);
    expect(dataOf(list).map((n: { body: string }) => n.body)).toEqual([
      `${SECRET} 1`,
      'Dòng 1\nDòng 2\t(tab)',
    ]);
  });

  it('chi tiết đơn không kèm ghi chú; danh sách đơn có noteCount', async () => {
    const detail = await fx.call('get', `/admin/orders/${guestOrder.code}`, staff.who);
    expect(JSON.stringify(dataOf(detail))).not.toContain(SECRET);
    const list = await fx.call('get', `/admin/orders?q=${guestOrder.code}`, staff.who);
    const item = dataOf(list).find((o: { code: string }) => o.code === guestOrder.code);
    expect(item.noteCount).toBe(2);
    const other = await fx.call('get', `/admin/orders?q=${userOrder.code}`, staff.who);
    expect(dataOf(other)[0].noteCount).toBe(0);
  });

  it.each([
    ['rỗng', { body: '' }],
    ['chỉ khoảng trắng', { body: '   ' }],
    ['thiếu body', {}],
    ['không phải chuỗi', { body: 5 }],
    ['quá 2000 ký tự', { body: 'a'.repeat(2001) }],
    ['chứa NUL', { body: 'a\u0000b' }],
    ['chứa ký tự điều khiển', { body: 'a\u0007b' }],
  ])('ghi chú %s -> 400', async (_n, body) => {
    const res = await fx.call('post', notes(guestOrder.code), staff.who, body);
    expect(res.status).toBe(400);
    expect(errOf(res).code).toBe('VALIDATION_ERROR');
  });

  it('đúng 2000 ký tự được chấp nhận', async () => {
    const res = await fx.call('post', notes(userOrder.code), staff.who, { body: 'a'.repeat(2000) });
    expect(res.status).toBe(201);
  });

  it('đơn không tồn tại hoặc mã sai định dạng -> 404', async () => {
    for (const code of ['BB-261111-ZZZZ', 'khong-phai-ma']) {
      expect((await fx.call('get', notes(code), staff.who)).status).toBe(404);
      expect((await fx.call('post', notes(code), staff.who, { body: 'x' })).status).toBe(404);
    }
  });

  it('không có API sửa ghi chú', async () => {
    const list = await fx.call('get', notes(guestOrder.code), staff.who);
    const id = dataOf(list)[0].id as string;
    const res = await fx.call('patch', `${notes(guestOrder.code)}/${id}`, admin.who, { body: 'x' });
    expect(res.status).toBe(404);
  });

  it('Staff xóa -> 403; Admin xóa -> 204, ghi chú biến mất; xóa lại / sai đơn -> 404', async () => {
    const list = await fx.call('get', notes(guestOrder.code), staff.who);
    const id = dataOf(list)[0].id as string;
    const del = `${notes(guestOrder.code)}/${id}`;

    const denied = await fx.call('delete', del, staff.who);
    expect(denied.status).toBe(403);
    expect(await prisma.orderNote.count({ where: { id } })).toBe(1);

    expect((await fx.call('delete', `${notes(userOrder.code)}/${id}`, admin.who)).status).toBe(404);
    expect((await fx.call('delete', del, admin.who)).status).toBe(204);
    expect(await prisma.orderNote.count({ where: { id } })).toBe(0);
    expect((await fx.call('delete', del, admin.who)).status).toBe(404);
  });

  it('khách/guest không có quyền và không thấy ghi chú ở mọi API khách', async () => {
    expect((await fx.call('get', notes(guestOrder.code), customer.who)).status).toBe(403);
    expect(
      (await fx.call('post', notes(guestOrder.code), customer.who, { body: 'x' })).status,
    ).toBe(403);
    expect((await fx.call('get', notes(guestOrder.code))).status).toBe(401);

    await fx.call('post', notes(userOrder.code), staff.who, { body: `${SECRET} user` });
    const seen: string[] = [];
    const mine = await fx.call('get', '/me/orders', customer.who);
    seen.push(JSON.stringify(mine.body));
    const one = await fx.call('get', `/orders/${userOrder.code}`, customer.who);
    expect(one.status).toBe(200);
    seen.push(JSON.stringify(one.body));
    const exp = await fx.call('get', '/me/export', customer.who);
    expect(exp.status).toBe(200);
    seen.push(JSON.stringify(exp.body), exp.text);
    const track = await fx.call(
      'get',
      `/orders/track?${new URLSearchParams({ code: guestOrder.code, phone: '0901234567' })}`,
    );
    seen.push(JSON.stringify(track.body));
    for (const s of seen) expect(s).not.toContain(SECRET);
    expect(seen[0]).toContain(userOrder.code);
  });

  it('audit: ghi id + độ dài, KHÔNG ghi nội dung', async () => {
    const created = await prisma.auditLog.findMany({ where: { action: 'order.note.create' } });
    const mine = created.filter((a) => a.actorId === staff.id || a.actorId === admin.id);
    expect(mine.length).toBeGreaterThanOrEqual(3);
    const diff = mine[0]!.diff as Record<string, [unknown, unknown]>;
    expect(diff.length![1]).toBeTypeOf('number');
    expect(typeof diff.noteId![1]).toBe('string');
    for (const a of await prisma.auditLog.findMany({
      where: { action: { in: ['order.note.create', 'order.note.delete'] } },
    })) {
      expect(JSON.stringify(a.diff)).not.toContain(SECRET);
    }
    const del = await prisma.auditLog.findFirst({
      where: { action: 'order.note.delete', actorId: admin.id },
    });
    expect(del).not.toBeNull();
  });

  it('xóa đơn xóa luôn ghi chú (cascade)', async () => {
    const o = await placeGuestOrder(fx, [[variantId, 1]]);
    await fx.call('post', notes(o.order.code), staff.who, { body: 'tạm' });
    const row = await prisma.order.findUniqueOrThrow({ where: { code: o.order.code } });
    expect(await prisma.orderNote.count({ where: { orderId: row.id } })).toBe(1);
    await prisma.order.delete({ where: { id: row.id } });
    expect(await prisma.orderNote.count({ where: { orderId: row.id } })).toBe(0);
  });

  it('tác giả bị xóa -> authorId NULL, ghi chú còn', async () => {
    const tmp = await fx.mkUser('tmpstaff');
    await prisma.user.update({ where: { id: tmp.id }, data: { role: 'STAFF' } });
    const res = await fx.call('post', notes(userOrder.code), tmp.who, { body: 'của nhân viên cũ' });
    const id = dataOf(res).id as string;
    await prisma.user.delete({ where: { id: tmp.id } });
    const list = await fx.call('get', notes(userOrder.code), staff.who);
    expect(dataOf(list).find((n: { id: string }) => n.id === id).author).toBeNull();
  });
});

describe('GET /admin/orders/print (D-072)', () => {
  const print = (codes: string, who: Who = staff.who) =>
    fx.call('get', `/admin/orders/print?codes=${encodeURIComponent(codes)}`, who);

  it('trả chi tiết các đơn theo thứ tự yêu cầu, liệt kê mã không tồn tại, không đổi trạng thái', async () => {
    const before = await prisma.order.findUniqueOrThrow({ where: { code: guestOrder.code } });
    const res = await print(
      `${userOrder.code}, ${guestOrder.code},BB-261111-ZZZZ,bb-xx,${userOrder.code}`,
    );
    expect(res.status).toBe(200);
    expect(dataOf(res).map((o: { code: string }) => o.code)).toEqual([
      userOrder.code,
      guestOrder.code,
    ]);
    expect(dataOf(res)[1]).toMatchObject({
      items: expect.any(Array),
      shippingAddress: expect.any(Object),
      contact: expect.any(Object),
    });
    expect(res.body.meta.missing).toEqual(['BB-261111-ZZZZ', 'BB-XX']);
    expect(JSON.stringify(res.body)).not.toContain(SECRET);
    const after = await prisma.order.findUniqueOrThrow({ where: { code: guestOrder.code } });
    expect(after.status).toBe(before.status);
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
  });

  it('chấp nhận chữ thường và tối đa 50 mã; 51 mã -> 400', async () => {
    const fifty = Array.from({ length: 50 }, (_, i) => `BB-261111-${String(i).padStart(4, 'A')}`);
    const ok = await print(fifty.join(','));
    expect(ok.status).toBe(200);
    expect(ok.body.meta.missing).toHaveLength(50);
    const tooMany = await print([...fifty, 'BB-261111-AAAA'].join(','));
    expect(tooMany.status).toBe(400);
    expect(errOf(tooMany).code).toBe('VALIDATION_ERROR');
    const lower = await print(guestOrder.code.toLowerCase());
    expect(dataOf(lower)).toHaveLength(1);
  });

  it('thiếu / rỗng codes -> 400; trùng mã chỉ tính một lần', async () => {
    expect((await fx.call('get', '/admin/orders/print', staff.who)).status).toBe(400);
    expect((await print(' , ,')).status).toBe(400);
    const dup = await print(Array(60).fill(guestOrder.code).join(','));
    expect(dup.status).toBe(200);
    expect(dataOf(dup)).toHaveLength(1);
  });

  it('quyền: customer 403, guest 401, admin 200; /print không bị coi là mã đơn', async () => {
    expect((await print(guestOrder.code, customer.who)).status).toBe(403);
    expect((await print(guestOrder.code, {})).status).toBe(401);
    expect((await print(guestOrder.code, admin.who)).status).toBe(200);
  });
});
