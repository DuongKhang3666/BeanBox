import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { sha256Hex } from '../src/lib/tokens.js';
import { bearer, login, refreshWith, rtOf } from './authHelpers.js';
import { createFixtures, dataOf, errOf, type Who } from './checkoutHelpers.js';

/** M6b (D-022): quản lý người dùng của Admin (api-contract §14.10). */

const PREFIX = 'tm6u-';
const BIG = 100_000;
let app: Express;
const fx = createFixtures(() => app, PREFIX);

interface U {
  id: string;
  email: string;
  who: Who;
}
let adminA: U;
let adminB: U;
let staff: U;
let cust: U;
let target: U;

const setRole = (u: U, role: 'CUSTOMER' | 'STAFF' | 'ADMIN') =>
  prisma.user.update({ where: { id: u.id }, data: { role } });

async function mkRole(key: string, role: 'CUSTOMER' | 'STAFF' | 'ADMIN'): Promise<U> {
  const u = await fx.mkUser(key);
  if (role !== 'CUSTOMER') await setRole(u, role);
  return u;
}

const get = (path: string, who: Who) => fx.call('get', `/admin/users${path}`, who);
const patch = (id: string, part: 'status' | 'role', who: Who, body: Record<string, unknown>) =>
  fx.call('patch', `/admin/users/${id}/${part}`, who, body);

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: PREFIX } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actorId: { in: ids } }, { entityId: { in: ids } }] },
  });
  await fx.clean();
}

async function resetCore() {
  await prisma.auditLog.deleteMany({
    where: { entityId: { in: [adminA.id, adminB.id, target.id] } },
  });
  await prisma.user.updateMany({
    where: { id: { in: [adminA.id, adminB.id] } },
    data: { role: 'ADMIN', status: 'ACTIVE', failedLoginCount: 0, lockedUntil: null },
  });
  await prisma.user.update({
    where: { id: target.id },
    data: {
      role: 'CUSTOMER',
      status: 'ACTIVE',
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: null,
    },
  });
}

const auditCount = (entityId: string) => prisma.auditLog.count({ where: { entityId } });

beforeAll(async () => {
  app = createApp({
    generalRateLimit: BIG,
    authRateLimit: BIG,
    guestCancelRateLimit: BIG,
    trackRateLimit: BIG,
    couponRateLimit: BIG,
    quoteRateLimit: BIG,
    orderRateLimit: BIG,
    uploadRateLimit: BIG,
    reviewRateLimit: BIG,
    paymentCreateRateLimit: BIG,
    paymentReturnRateLimit: BIG,
    paymentSyncRateLimit: BIG,
  });
  await cleanup();
  await fx.setup();
  adminA = await mkRole('adma', 'ADMIN');
  adminB = await mkRole('admb', 'ADMIN');
  staff = await mkRole('staff', 'STAFF');
  cust = await mkRole('cust', 'CUSTOMER');
  target = await mkRole('target', 'CUSTOMER');
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

beforeEach(resetCore);

describe('quyền truy cập', () => {
  it('không token 401; CUSTOMER và STAFF 403 FORBIDDEN', async () => {
    expect((await get('', {})).status).toBe(401);
    for (const u of [cust, staff]) {
      for (const res of [
        await get('', u.who),
        await get(`/${target.id}`, u.who),
        await patch(target.id, 'status', u.who, { status: 'DISABLED' }),
        await patch(target.id, 'role', u.who, { role: 'STAFF' }),
      ]) {
        expect(res.status).toBe(403);
        expect(errOf(res).code).toBe('FORBIDDEN');
      }
    }
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).status).toBe(
      'ACTIVE',
    );
  });
});

describe('GET /admin/users', () => {
  it('lọc role/status và q khớp email/tên/SĐT', async () => {
    await prisma.user.update({
      where: { id: cust.id },
      data: { fullName: 'Hoàng Thị Zebra', phone: '0987000111' },
    });
    await prisma.user.update({ where: { id: target.id }, data: { status: 'DISABLED' } });

    const byRole = await get(`?q=${PREFIX}&role=STAFF,ADMIN&pageSize=100`, adminA.who);
    expect(byRole.status).toBe(200);
    const emails = (dataOf(byRole) as Array<{ email: string; role: string }>).map((x) => x.email);
    expect(emails.sort()).toEqual([adminA.email, adminB.email, staff.email].sort());

    const byStatus = await get(`?q=${PREFIX}&status=DISABLED`, adminA.who);
    expect((dataOf(byStatus) as Array<{ id: string }>).map((x) => x.id)).toEqual([target.id]);

    expect((await get('?status=ACTIVE,DISABLED&role=CUSTOMER&q=tm6u', adminA.who)).status).toBe(
      200,
    );

    const byName = await get('?q=ZEBRA', adminA.who);
    expect((dataOf(byName) as Array<{ id: string }>).map((x) => x.id)).toEqual([cust.id]);
    const byPhone = await get('?q=0987000', adminA.who);
    expect((dataOf(byPhone) as Array<{ id: string }>).map((x) => x.id)).toEqual([cust.id]);
    const byEmail = await get(`?q=${target.email.toUpperCase()}`, adminA.who);
    expect((dataOf(byEmail) as Array<{ id: string }>).map((x) => x.id)).toEqual([target.id]);
  });

  it('q chứa ký tự đại diện LIKE được escape', async () => {
    for (const q of ['%%', '__', '%25%25']) {
      const res = await get(`?q=${q}`, adminA.who);
      expect(res.status).toBe(200);
      expect((res.body as { meta: { total: number } }).meta.total).toBe(0);
    }
  });

  it('q 1 ký tự hoặc quá 100 ký tự, enum sai, sort sai -> 400', async () => {
    for (const qs of ['?q=a', `?q=${'a'.repeat(101)}`, '?role=OWNER', '?status=X', '?sort=zzz']) {
      const res = await get(qs, adminA.who);
      expect(res.status, qs).toBe(400);
      expect(errOf(res).code).toBe('VALIDATION_ERROR');
    }
  });

  it('sort lastLogin đặt null cuối; newest/oldest; phân trang meta', async () => {
    const now = Date.now();
    await prisma.user.update({
      where: { id: cust.id },
      data: { lastLoginAt: new Date(now - 1000) },
    });
    await prisma.user.update({
      where: { id: staff.id },
      data: { lastLoginAt: new Date(now - 5000) },
    });
    await prisma.user.updateMany({
      where: { id: { in: [adminA.id, adminB.id, target.id] } },
      data: { lastLoginAt: null },
    });
    const res = await get(`?q=${PREFIX}&sort=lastLogin&pageSize=100`, adminA.who);
    const rows = dataOf(res) as Array<{ id: string; lastLoginAt: string | null }>;
    expect(rows.slice(0, 2).map((r) => r.id)).toEqual([cust.id, staff.id]);
    expect(rows.slice(2).every((r) => r.lastLoginAt === null)).toBe(true);

    const newest = (await get(`?q=${PREFIX}&pageSize=100`, adminA.who)).body.data as Array<{
      createdAt: string;
    }>;
    const oldest = (await get(`?q=${PREFIX}&sort=oldest&pageSize=100`, adminA.who)).body
      .data as Array<{ createdAt: string }>;
    expect(newest.map((x) => x.createdAt)).toEqual(oldest.map((x) => x.createdAt).reverse());
    expect(newest[0]!.createdAt >= newest[newest.length - 1]!.createdAt).toBe(true);

    const p2 = await get(`?q=${PREFIX}&pageSize=2&page=2`, adminA.who);
    expect((p2.body as { meta: unknown }).meta).toEqual({
      page: 2,
      pageSize: 2,
      total: 5,
      totalPages: 3,
    });
    expect(dataOf(p2)).toHaveLength(2);
  });

  it('item có đúng shape, không lộ passwordHash', async () => {
    const res = await get(`?q=${target.email}`, adminA.who);
    const item = dataOf(res)[0] as Record<string, unknown>;
    expect(Object.keys(item).sort()).toEqual(
      [
        'id',
        'email',
        'fullName',
        'phone',
        'role',
        'status',
        'emailVerified',
        'lastLoginAt',
        'lockedUntil',
        'createdAt',
        'orderCount',
      ].sort(),
    );
    expect(item.emailVerified).toBe(false);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|tokenHash/);
  });
});

describe('GET /admin/users/:id', () => {
  it('shape, paidTotal bỏ đơn CANCELLED/RETURNED, activeSessions, không lộ hash', async () => {
    const mkOrder = (
      status: 'DELIVERED' | 'CANCELLED' | 'RETURNED',
      paid: 'PAID' | 'UNPAID',
      total: number,
    ) =>
      prisma.order.create({
        data: {
          code: `BB-T6U-${randomUUID().slice(0, 8)}`,
          userId: target.id,
          contactEmail: target.email,
          contactPhone: '0912345678',
          status,
          paymentStatus: paid,
          paymentMethod: 'COD',
          shippingMethod: 'STANDARD',
          shippingAddress: {},
          subtotal: total,
          shippingFee: 0,
          grandTotal: total,
          idempotencyKey: randomUUID(),
          requestFingerprint: 'x',
        },
      });
    await mkOrder('DELIVERED', 'PAID', 100000);
    await mkOrder('DELIVERED', 'PAID', 50000);
    await mkOrder('CANCELLED', 'PAID', 70000);
    await mkOrder('RETURNED', 'PAID', 30000);
    await mkOrder('DELIVERED', 'UNPAID', 10000);
    await fx.mkAddress(target.id);

    const loginRes = await login(app, target.email);
    expect(loginRes.status).toBe(200);
    await prisma.refreshToken.create({
      data: {
        userId: target.id,
        familyId: randomUUID(),
        tokenHash: sha256Hex(randomUUID()),
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    await prisma.refreshToken.create({
      data: {
        userId: target.id,
        familyId: randomUUID(),
        tokenHash: sha256Hex(randomUUID()),
        expiresAt: new Date(Date.now() + 100000),
        revokedAt: new Date(),
      },
    });
    const active = await prisma.refreshToken.count({
      where: { userId: target.id, revokedAt: null, expiresAt: { gt: new Date() } },
    });

    const res = await get(`/${target.id}`, adminA.who);
    expect(res.status).toBe(200);
    const d = dataOf(res);
    expect(d.id).toBe(target.id);
    expect(d.addressCount).toBe(1);
    expect(d.orderCount).toBe(5);
    expect(d.orders.count).toBe(5);
    expect(d.orders.paidTotal).toBe(150000);
    expect(d.orders.recent).toHaveLength(5);
    expect(Object.keys(d.orders.recent[0]).sort()).toEqual(
      ['code', 'createdAt', 'grandTotal', 'status'].sort(),
    );
    expect(d.activeSessions).toBe(active);
    expect(active).toBeGreaterThanOrEqual(2); // đăng ký + đăng nhập
    const raw = JSON.stringify(res.body);
    expect(raw).not.toMatch(/passwordHash|tokenHash|\$argon|\$2[aby]\$/);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(raw).not.toContain(row.passwordHash);
  });

  it('id không tồn tại hoặc sai định dạng -> 404', async () => {
    for (const id of ['clzzzzzzzzzzzzzzzzzzzzzzz', 'ABC-../x', 'a'.repeat(60)]) {
      const res = await get(`/${encodeURIComponent(id)}`, adminA.who);
      expect(res.status, id).toBe(404);
      expect(errOf(res).code).toBe('NOT_FOUND');
    }
    const p = await patch('bad-id!', 'status', adminA.who, { status: 'DISABLED' });
    expect(p.status).toBe(404);
  });
});

describe('PATCH status', () => {
  it('khóa: thu hồi refresh, token cũ 403 ACCOUNT_DISABLED, refresh 401; mở khóa đăng nhập lại được', async () => {
    const reg = await login(app, target.email);
    const rt = rtOf(reg)!;
    const access = (reg.body as { data: { accessToken: string } }).data.accessToken;
    expect((await fx.call('get', '/me', { auth: bearer(access) })).status).toBe(200);

    const res = await patch(target.id, 'status', adminA.who, {
      status: 'DISABLED',
      reason: '  Vi phạm điều khoản  ',
    });
    expect(res.status).toBe(200);
    expect(dataOf(res).status).toBe('DISABLED');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(dataOf(res).activeSessions).toBe(0);
    expect(await prisma.refreshToken.count({ where: { userId: target.id, revokedAt: null } })).toBe(
      0,
    );

    const me = await fx.call('get', '/me', { auth: bearer(access) });
    expect(me.status).toBe(403);
    expect(errOf(me).code).toBe('ACCOUNT_DISABLED');
    expect((await refreshWith(app, rt)).status).toBe(401);

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: target.id, action: 'user.status' },
    });
    expect(log.entity).toBe('User');
    expect(log.actorId).toBe(adminA.id);
    expect(log.diff).toEqual({
      status: ['ACTIVE', 'DISABLED'],
      reason: [null, 'Vi phạm điều khoản'],
    });
    expect(JSON.stringify(log.diff)).not.toContain(target.email);

    // Mở khóa: đặt lại bộ đếm đăng nhập sai
    await prisma.user.update({
      where: { id: target.id },
      data: { failedLoginCount: 4, lockedUntil: new Date(Date.now() + 600_000) },
    });
    const un = await patch(target.id, 'status', adminA.who, { status: 'ACTIVE' });
    expect(un.status).toBe(200);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(row.failedLoginCount).toBe(0);
    expect(row.lockedUntil).toBeNull();
    expect((await login(app, target.email)).status).toBe(200);
    const logs = await prisma.auditLog.findMany({
      where: { entityId: target.id, action: 'user.status' },
      orderBy: { createdAt: 'asc' },
    });
    expect(logs).toHaveLength(2);
    expect(logs[1]!.diff).toEqual({ status: ['DISABLED', 'ACTIVE'] });
  });

  it('mở khóa tạm (ACTIVE còn lockedUntil tương lai): reset + audit lockedUntil, giữ phiên', async () => {
    await login(app, target.email);
    const until = new Date(Date.now() + 600_000);
    await prisma.user.update({
      where: { id: target.id },
      data: { failedLoginCount: 5, lockedUntil: until },
    });
    const sessions = await prisma.refreshToken.count({
      where: { userId: target.id, revokedAt: null },
    });
    const res = await patch(target.id, 'status', adminA.who, { status: 'ACTIVE' });
    expect(res.status).toBe(200);
    expect(dataOf(res).lockedUntil).toBeNull();
    const row = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(row.failedLoginCount).toBe(0);
    expect(row.lockedUntil).toBeNull();
    expect(await prisma.refreshToken.count({ where: { userId: target.id, revokedAt: null } })).toBe(
      sessions,
    );
    const logs = await prisma.auditLog.findMany({ where: { entityId: target.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0]!.action).toBe('user.status');
    expect(logs[0]!.diff).toEqual({ lockedUntil: [until.toISOString(), null] });
  });

  it('no-op -> 200, không audit, không thu hồi phiên', async () => {
    await login(app, target.email);
    const sessions = await prisma.refreshToken.count({
      where: { userId: target.id, revokedAt: null },
    });
    const res = await patch(target.id, 'status', adminA.who, { status: 'ACTIVE' });
    expect(res.status).toBe(200);
    expect(await auditCount(target.id)).toBe(0);
    expect(await prisma.refreshToken.count({ where: { userId: target.id, revokedAt: null } })).toBe(
      sessions,
    );

    await prisma.user.update({ where: { id: target.id }, data: { status: 'DISABLED' } });
    expect((await patch(target.id, 'status', adminA.who, { status: 'DISABLED' })).status).toBe(200);
    expect(await auditCount(target.id)).toBe(0);
  });

  it('validate: reason 256 ký tự, enum sai, body rỗng -> 400', async () => {
    for (const body of [
      { status: 'DISABLED', reason: 'a'.repeat(256) },
      { status: 'BANNED' },
      {},
    ]) {
      const res = await patch(target.id, 'status', adminA.who, body);
      expect(res.status).toBe(400);
    }
    expect(
      (await patch(target.id, 'status', adminA.who, { status: 'ACTIVE', reason: 'a'.repeat(255) }))
        .status,
    ).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).status).toBe(
      'ACTIVE',
    );
  });

  it('lý do rỗng không ghi reason vào diff', async () => {
    await patch(target.id, 'status', adminA.who, { status: 'DISABLED', reason: '   ' });
    const log = await prisma.auditLog.findFirstOrThrow({ where: { entityId: target.id } });
    expect(log.diff).toEqual({ status: ['ACTIVE', 'DISABLED'] });
  });

  it('tự thao tác -> 409 CANNOT_MODIFY_SELF (status và role)', async () => {
    const a = await patch(adminA.id, 'status', adminA.who, { status: 'DISABLED' });
    const b = await patch(adminA.id, 'role', adminA.who, { role: 'CUSTOMER' });
    for (const res of [a, b]) {
      expect(res.status).toBe(409);
      expect(errOf(res).code).toBe('CANNOT_MODIFY_SELF');
    }
    const row = await prisma.user.findUniqueOrThrow({ where: { id: adminA.id } });
    expect(row.role).toBe('ADMIN');
    expect(row.status).toBe('ACTIVE');
  });

  it('user không tồn tại -> 404', async () => {
    const res = await patch('clzzzzzzzzzzzzzzzzzzzzzzz', 'status', adminA.who, {
      status: 'DISABLED',
    });
    expect(res.status).toBe(404);
  });
});

describe('PATCH role', () => {
  it('STAFF -> CUSTOMER: token cũ mất quyền ngay, refresh bị thu hồi, có audit', async () => {
    await setRole(target, 'STAFF');
    const l = await login(app, target.email);
    const access = (l.body as { data: { accessToken: string } }).data.accessToken;
    const rt = rtOf(l)!;
    expect((await fx.call('get', '/admin/orders', { auth: bearer(access) })).status).toBe(200);

    const res = await patch(target.id, 'role', adminA.who, { role: 'CUSTOMER' });
    expect(res.status).toBe(200);
    expect(dataOf(res).role).toBe('CUSTOMER');
    expect(await prisma.refreshToken.count({ where: { userId: target.id, revokedAt: null } })).toBe(
      0,
    );
    expect((await fx.call('get', '/admin/orders', { auth: bearer(access) })).status).toBe(403);
    expect((await refreshWith(app, rt)).status).toBe(401);

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: target.id, action: 'user.role' },
    });
    expect(log.diff).toEqual({ role: ['STAFF', 'CUSTOMER'] });
    expect(log.actorId).toBe(adminA.id);
  });

  it('no-op và enum sai', async () => {
    expect((await patch(target.id, 'role', adminA.who, { role: 'CUSTOMER' })).status).toBe(200);
    expect(await auditCount(target.id)).toBe(0);
    expect((await patch(target.id, 'role', adminA.who, { role: 'OWNER' })).status).toBe(400);
    expect((await patch(target.id, 'role', adminA.who, {})).status).toBe(400);
  });

  it('hạ admin khác khi còn actor: được phép (không phải admin cuối)', async () => {
    const res = await patch(adminB.id, 'role', adminA.who, { role: 'STAFF' });
    expect(res.status).toBe(200);
  });
});

describe('đồng thời: luôn còn ít nhất một ADMIN ACTIVE', () => {
  const activeAdmins = () => prisma.user.count({ where: { role: 'ADMIN', status: 'ACTIVE' } });
  let others: string[] = [];

  async function isolatePair() {
    const rows = await prisma.user.findMany({
      where: { role: 'ADMIN', status: 'ACTIVE', id: { notIn: [adminA.id, adminB.id] } },
      select: { id: true },
    });
    others = rows.map((r) => r.id);
    await prisma.user.updateMany({ where: { id: { in: others } }, data: { status: 'DISABLED' } });
  }
  async function restoreOthers() {
    await prisma.user.updateMany({ where: { id: { in: others } }, data: { status: 'ACTIVE' } });
    others = [];
  }

  it('A khóa B và B khóa A cùng lúc: đúng 1 thành công', async () => {
    await isolatePair();
    try {
      for (let i = 0; i < 6; i++) {
        await resetCore();
        const [r1, r2] = await Promise.all([
          patch(adminB.id, 'status', adminA.who, { status: 'DISABLED' }),
          patch(adminA.id, 'status', adminB.who, { status: 'DISABLED' }),
        ]);
        const statuses = [r1.status, r2.status].sort();
        const failed = [r1, r2].find((r) => r.status !== 200)!;
        expect(statuses[0], JSON.stringify([r1.body, r2.body])).toBe(200);
        expect([403, 409]).toContain(failed.status);
        expect(['FORBIDDEN', 'LAST_ADMIN', 'ACCOUNT_DISABLED']).toContain(errOf(failed).code);
        expect(await activeAdmins()).toBeGreaterThanOrEqual(1);
      }
    } finally {
      await restoreOthers();
    }
  });

  it('A hạ role B và B hạ role A cùng lúc: đúng 1 thành công', async () => {
    await isolatePair();
    try {
      for (let i = 0; i < 6; i++) {
        await resetCore();
        const [r1, r2] = await Promise.all([
          patch(adminB.id, 'role', adminA.who, { role: 'CUSTOMER' }),
          patch(adminA.id, 'role', adminB.who, { role: 'CUSTOMER' }),
        ]);
        const failed = [r1, r2].filter((r) => r.status !== 200);
        expect([r1, r2].filter((r) => r.status === 200)).toHaveLength(1);
        expect(failed).toHaveLength(1);
        expect([403, 409]).toContain(failed[0]!.status);
        expect(['FORBIDDEN', 'LAST_ADMIN']).toContain(errOf(failed[0]!).code);
        expect(await activeAdmins()).toBeGreaterThanOrEqual(1);
      }
    } finally {
      await restoreOthers();
    }
  });

  it('khóa chéo xen kẽ khóa/đổi role: vẫn còn ADMIN ACTIVE', async () => {
    await isolatePair();
    try {
      await resetCore();
      await Promise.all([
        patch(adminB.id, 'status', adminA.who, { status: 'DISABLED' }),
        patch(adminA.id, 'role', adminB.who, { role: 'STAFF' }),
      ]);
      expect(await activeAdmins()).toBeGreaterThanOrEqual(1);
    } finally {
      await restoreOthers();
    }
  });

  it('actor đã bị khóa trong DB: token cũ bị chặn, ghi DB trực tiếp cũng 403 ở tầng auth', async () => {
    await prisma.user.update({ where: { id: adminA.id }, data: { status: 'DISABLED' } });
    const res = await patch(target.id, 'status', adminA.who, { status: 'DISABLED' });
    expect(res.status).toBe(403);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).status).toBe(
      'ACTIVE',
    );
  });
});
