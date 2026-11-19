import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { createFixtures, dataOf, errOf, type Who } from './checkoutHelpers.js';

/** M6b (D-023): quản lý tin nhắn liên hệ của Staff+ (api-contract §14.11). */

const PREFIX = 'tm6d-';
const BIG = 100_000;
let app: Express;
const fx = createFixtures(() => app, PREFIX);

interface U {
  id: string;
  who: Who;
}
let admin: U;
let staff: U;
let cust: U;

const get = (path: string, who: Who) => fx.call('get', `/admin/contact-messages${path}`, who);
const patch = (id: string, who: Who, body: Record<string, unknown>) =>
  fx.call('patch', `/admin/contact-messages/${id}`, who, body);
const auditsOf = (id: string) =>
  prisma.auditLog.findMany({ where: { entity: 'ContactMessage', entityId: id } });

async function mk(key: string, over: Record<string, unknown> = {}, ageMin = 0) {
  return prisma.contactMessage.create({
    data: {
      name: `Tên ${key}`,
      email: `${PREFIX}${key}@example.test`,
      message: `Nội dung tin nhắn số ${key} đủ dài`,
      createdAt: new Date(Date.now() - ageMin * 60_000),
      ...over,
    },
  });
}

async function cleanup() {
  const ids = (
    await prisma.contactMessage.findMany({
      where: { email: { startsWith: PREFIX } },
      select: { id: true },
    })
  ).map((m) => m.id);
  await prisma.auditLog.deleteMany({ where: { entity: 'ContactMessage', entityId: { in: ids } } });
  await prisma.contactMessage.deleteMany({ where: { id: { in: ids } } });
}

beforeAll(async () => {
  app = createApp({ generalRateLimit: BIG, authRateLimit: BIG, contactRateLimit: BIG });
  await cleanup();
  await fx.clean();
  admin = await fx.mkUser('adm');
  await prisma.user.update({
    where: { id: admin.id },
    data: { role: 'ADMIN', fullName: 'Quản Trị' },
  });
  staff = await fx.mkUser('staff');
  await prisma.user.update({
    where: { id: staff.id },
    data: { role: 'STAFF', fullName: 'Nhân Viên' },
  });
  cust = await fx.mkUser('cust');
});
afterAll(async () => {
  await cleanup();
  await fx.clean();
  await prisma.$disconnect();
});

describe('phân quyền', () => {
  it('không token 401; CUSTOMER 403; STAFF và ADMIN xem được list/detail', async () => {
    const m = await mk('perm');
    expect((await get('', {})).status).toBe(401);
    for (const res of [
      await get('', cust.who),
      await get(`/${m.id}`, cust.who),
      await patch(m.id, cust.who, { status: 'RESOLVED' }),
    ]) {
      expect(res.status).toBe(403);
      expect(errOf(res).code).toBe('FORBIDDEN');
    }
    for (const u of [staff, admin]) {
      const list = await get('?q=perm', u.who);
      expect(list.status).toBe(200);
      expect(dataOf(list).map((x: { id: string }) => x.id)).toContain(m.id);
      const d = await get(`/${m.id}`, u.who);
      expect(d.status).toBe(200);
      expect(dataOf(d)).toMatchObject({
        id: m.id,
        status: 'NEW',
        handledBy: null,
        handledAt: null,
      });
    }
    expect((await prisma.contactMessage.findUniqueOrThrow({ where: { id: m.id } })).status).toBe(
      'NEW',
    );
  });

  it('không có DELETE', async () => {
    const m = await mk('del');
    const res = await fx.call('delete', `/admin/contact-messages/${m.id}`, admin.who);
    expect(res.status).toBe(404);
    expect(await prisma.contactMessage.count({ where: { id: m.id } })).toBe(1);
  });
});

describe('GET /admin/contact-messages', () => {
  it('lọc status (nhiều giá trị), status sai 400, q, escape LIKE, phân trang, sắp mới nhất trước', async () => {
    await cleanup();
    const a = await mk('lista', { status: 'NEW', subject: 'Hỏi giá Moka' }, 30);
    const b = await mk('listb', { status: 'RESOLVED' }, 20);
    const c = await mk('listc', { status: 'SPAM', message: 'Giảm giá 100% hôm nay nhé' }, 10);
    const d = await mk('listd', { status: 'IN_PROGRESS' }, 0);

    const all = await get('?pageSize=100', staff.who);
    const ids = dataOf(all).map((x: { id: string }) => x.id);
    expect(ids.filter((i: string) => [a.id, b.id, c.id, d.id].includes(i))).toEqual([
      d.id,
      c.id,
      b.id,
      a.id,
    ]);
    expect(all.body.meta.total).toBeGreaterThanOrEqual(4);

    const two = await get('?status=NEW,spam'.replace('spam', 'SPAM'), staff.who);
    expect(
      dataOf(two)
        .map((x: { id: string }) => x.id)
        .sort(),
    ).toEqual([a.id, c.id].sort());
    expect((await get('?status=BAD', staff.who)).status).toBe(400);

    const byQ = await get('?q=MOKA', staff.who);
    expect(dataOf(byQ).map((x: { id: string }) => x.id)).toEqual([a.id]);
    // `%` chỉ khớp ký tự % thật, không phải mọi bản ghi.
    const pct = await get(`?q=${encodeURIComponent('100%')}`, staff.who);
    expect(dataOf(pct).map((x: { id: string }) => x.id)).toEqual([c.id]);
    const wild = await get(`?q=${encodeURIComponent('%%')}`, staff.who);
    expect(dataOf(wild).map((x: { id: string }) => x.id)).toEqual([]);
    expect((await get('?q=a', staff.who)).status).toBe(400);

    const p1 = await get('?pageSize=2&page=1&q=tm6d-list', staff.who);
    const p2 = await get('?pageSize=2&page=2&q=tm6d-list', staff.who);
    expect(p1.body.meta).toMatchObject({ page: 1, pageSize: 2, total: 4, totalPages: 2 });
    expect(dataOf(p1).map((x: { id: string }) => x.id)).toEqual([d.id, c.id]);
    expect(dataOf(p2).map((x: { id: string }) => x.id)).toEqual([b.id, a.id]);

    const item = dataOf(p1)[0];
    expect(Object.keys(item).sort()).toEqual(
      [
        'id',
        'userId',
        'name',
        'email',
        'phone',
        'subject',
        'message',
        'status',
        'adminNote',
        'handledBy',
        'handledAt',
        'createdAt',
        'updatedAt',
      ].sort(),
    );
  });

  it('detail: id sai định dạng hoặc không tồn tại -> 404', async () => {
    expect((await get('/BAD-ID!', staff.who)).status).toBe(404);
    expect((await get('/cxxxxxxxxxxxxxxxxxxxxxxxx', staff.who)).status).toBe(404);
  });
});

describe('PATCH /admin/contact-messages/:id', () => {
  it('đổi status: đặt handledBy/handledAt, 1 audit đúng diff, không chép nội dung', async () => {
    const m = await mk('patch1', { message: 'BÍ-MẬT-TIN-NHẮN nội dung riêng tư' });
    const res = await patch(m.id, staff.who, {
      status: 'IN_PROGRESS',
      adminNote: '  Đã gọi lại  ',
    });
    expect(res.status).toBe(200);
    const body = dataOf(res);
    expect(body).toMatchObject({
      status: 'IN_PROGRESS',
      adminNote: 'Đã gọi lại',
      handledBy: { id: staff.id, fullName: 'Nhân Viên' },
    });
    expect(body.handledAt).toEqual(expect.any(String));

    const logs = await auditsOf(m.id);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ action: 'contact.update', actorId: staff.id });
    expect(logs[0]!.diff).toEqual({
      status: ['NEW', 'IN_PROGRESS'],
      adminNote: [null, 'đã cập nhật'],
    });
    const dump = JSON.stringify(logs);
    expect(dump).not.toContain('Đã gọi lại');
    expect(dump).not.toContain('BÍ-MẬT');
    expect(dump).not.toContain(m.email);
    expect(dump).not.toContain(m.name);

    // Người khác đổi lại về NEW: handledBy chuyển sang người thao tác mới.
    const back = await patch(m.id, admin.who, { status: 'NEW' });
    expect(dataOf(back)).toMatchObject({ status: 'NEW', handledBy: { id: admin.id } });
    expect(
      (await auditsOf(m.id)).some(
        (l) => (l.diff as { status?: unknown })?.status?.toString() === 'IN_PROGRESS,NEW',
      ),
    ).toBe(true);
  });

  it('chỉ đổi adminNote: không đổi handledBy; xóa ghi chú bằng "" hoặc null', async () => {
    const m = await mk('patch2');
    const r1 = await patch(m.id, staff.who, { adminNote: 'ghi chú nội bộ' });
    expect(dataOf(r1)).toMatchObject({
      adminNote: 'ghi chú nội bộ',
      handledBy: null,
      handledAt: null,
    });
    expect((await auditsOf(m.id))[0]!.diff).toEqual({ adminNote: [null, 'đã cập nhật'] });

    const r2 = await patch(m.id, staff.who, { adminNote: '   ' });
    expect(dataOf(r2).adminNote).toBeNull();
    expect(await auditsOf(m.id)).toHaveLength(2);
    const r3 = await patch(m.id, staff.who, { adminNote: null });
    expect(r3.status).toBe(200);
    expect(await auditsOf(m.id)).toHaveLength(2); // đã null sẵn -> no-op
  });

  it('no-op: 200, không audit, không đổi handledBy', async () => {
    const m = await mk('patch3', { adminNote: 'giữ nguyên' });
    const res = await patch(m.id, staff.who, { status: 'NEW', adminNote: 'giữ nguyên' });
    expect(res.status).toBe(200);
    expect(dataOf(res)).toMatchObject({ status: 'NEW', handledBy: null });
    expect(await auditsOf(m.id)).toHaveLength(0);
  });

  it('validate: body rỗng/trường lạ 400; status sai 400; adminNote 1001 ký tự 400; 1000 hợp lệ', async () => {
    const m = await mk('patch4');
    expect((await patch(m.id, staff.who, {})).status).toBe(400);
    expect((await patch(m.id, staff.who, { foo: 'bar' })).status).toBe(400);
    expect((await patch(m.id, staff.who, { status: 'DONE' })).status).toBe(400);
    const long = await patch(m.id, staff.who, { adminNote: 'a'.repeat(1001) });
    expect(long.status).toBe(400);
    expect(errOf(long).code).toBe('VALIDATION_ERROR');
    expect((await patch(m.id, staff.who, { adminNote: 'a'.repeat(1000) })).status).toBe(200);
    expect(await auditsOf(m.id)).toHaveLength(1);
  });

  it('id không tồn tại hoặc sai định dạng -> 404', async () => {
    expect((await patch('cxxxxxxxxxxxxxxxxxxxxxxxx', staff.who, { status: 'SPAM' })).status).toBe(
      404,
    );
    expect((await patch('BAD-ID!', staff.who, { status: 'SPAM' })).status).toBe(404);
  });

  it('hai PATCH song song cùng status: chỉ một audit', async () => {
    const m = await mk('patch5');
    const [x, y] = await Promise.all([
      patch(m.id, staff.who, { status: 'RESOLVED' }),
      patch(m.id, admin.who, { status: 'RESOLVED' }),
    ]);
    expect([x.status, y.status]).toEqual([200, 200]);
    expect(await auditsOf(m.id)).toHaveLength(1);
  });
});
