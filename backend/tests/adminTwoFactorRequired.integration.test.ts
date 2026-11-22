import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { prisma } from '../src/lib/prisma.js';
import { API, PW, bearer, emailOf, login, registerUser } from './authHelpers.js';

/** D-070: REQUIRE_ADMIN_2FA bắt Admin bật 2FA mới dùng được /admin/*. */

const app = createApp({ generalRateLimit: 100_000, authRateLimit: 100_000 });
const em = (k: string) => emailOf(`tr2f-${k}`);
type Role = 'CUSTOMER' | 'STAFF' | 'ADMIN';

interface Acct {
  id: string;
  email: string;
  token: string;
}

async function mk(key: string, role: Role, with2fa = false): Promise<Acct> {
  const email = em(key);
  const r = await registerUser(app, email);
  expect(r.res.status).toBe(201);
  await prisma.user.update({
    where: { id: r.userId },
    data: { role, ...(with2fa ? { twoFactorEnabledAt: new Date() } : {}) },
  });
  return { id: r.userId, email, token: r.accessToken };
}

const get = (path: string, token: string) => request(app).get(`${API}${path}`).set(bearer(token));
const errCode = (res: request.Response) => (res.body as { error: { code: string } }).error.code;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dataOf = (res: request.Response) => (res.body as { data: any }).data;

const ADMIN_ROUTES = [
  '/admin/orders',
  '/admin/users',
  '/admin/settings',
  '/admin/dashboard',
  '/admin/audit-logs',
];

const ORIGINAL = env.REQUIRE_ADMIN_2FA;
let admin: Acct;
let admin2fa: Acct;
let staff: Acct;

const cleanup = async () => {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: 'tm2a-tr2f-' } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actorId: { in: ids } }, { entityId: { in: ids } }] },
  });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
};

beforeAll(async () => {
  await cleanup();
  admin = await mk('admin', 'ADMIN');
  admin2fa = await mk('admin2fa', 'ADMIN', true);
  staff = await mk('staff', 'STAFF');
});
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});
afterEach(() => {
  env.REQUIRE_ADMIN_2FA = ORIGINAL;
});

describe('REQUIRE_ADMIN_2FA tắt (mặc định)', () => {
  it('mặc định false; Admin chưa bật 2FA vẫn dùng /admin như cũ; twoFactorRequired=false', async () => {
    expect(ORIGINAL).toBe(false);
    for (const p of ADMIN_ROUTES) expect((await get(p, admin.token)).status, p).toBe(200);
    const me = await get('/me', admin.token);
    expect(dataOf(me)).toMatchObject({ twoFactorEnabled: false, twoFactorRequired: false });
  });
});

describe('REQUIRE_ADMIN_2FA bật', () => {
  it('Admin chưa bật 2FA: mọi route /admin/* -> 403 ADMIN_TWO_FACTOR_REQUIRED (tiếng Việt, no-store)', async () => {
    env.REQUIRE_ADMIN_2FA = true;
    for (const p of ADMIN_ROUTES) {
      const res = await get(p, admin.token);
      expect(res.status, p).toBe(403);
      expect(errCode(res)).toBe('ADMIN_TWO_FACTOR_REQUIRED');
      expect((res.body as { error: { message: string } }).error.message).toContain(
        'xác thực 2 lớp',
      );
      expect(res.headers['cache-control']).toBe('no-store');
    }
  });

  it('Admin đã bật 2FA -> 200; Staff (kể cả chưa bật) -> 200', async () => {
    env.REQUIRE_ADMIN_2FA = true;
    for (const p of ADMIN_ROUTES) {
      expect((await get(p, admin2fa.token)).status, `admin2fa ${p}`).toBe(200);
    }
    for (const p of ['/admin/orders', '/admin/dashboard']) {
      expect((await get(p, staff.token)).status, `staff ${p}`).toBe(200);
    }
  });

  it('không có token vẫn 401; /me và /me/2fa/setup vẫn dùng được để Admin tự bật', async () => {
    env.REQUIRE_ADMIN_2FA = true;
    expect((await request(app).get(`${API}/admin/orders`)).status).toBe(401);
    const me = await get('/me', admin.token);
    expect(me.status).toBe(200);
    expect(dataOf(me)).toMatchObject({ twoFactorEnabled: false, twoFactorRequired: true });
    const setup = await request(app)
      .post(`${API}/me/2fa/setup`)
      .set(bearer(admin.token))
      .send({ password: PW });
    expect(setup.status).toBe(200);
    expect(dataOf(setup).secret).toEqual(expect.any(String));
  });

  it('twoFactorRequired: false cho Admin đã bật 2FA và cho Staff', async () => {
    env.REQUIRE_ADMIN_2FA = true;
    for (const a of [admin2fa, staff]) {
      expect(dataOf(await get('/me', a.token)).twoFactorRequired, a.email).toBe(false);
    }
  });

  it('đăng nhập Admin chưa bật 2FA không đổi (200, user.twoFactorRequired=true)', async () => {
    env.REQUIRE_ADMIN_2FA = true;
    const res = await login(app, admin.email);
    expect(res.status).toBe(200);
    expect(dataOf(res).user).toMatchObject({ role: 'ADMIN', twoFactorRequired: true });
  });

  it('đọc cờ mỗi request: tắt lại thì Admin vào được ngay', async () => {
    env.REQUIRE_ADMIN_2FA = true;
    expect((await get('/admin/orders', admin.token)).status).toBe(403);
    env.REQUIRE_ADMIN_2FA = false;
    expect((await get('/admin/orders', admin.token)).status).toBe(200);
  });
});
