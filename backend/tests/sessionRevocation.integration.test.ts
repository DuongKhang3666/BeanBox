import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import {
  API,
  ORIGIN,
  PREFIX,
  PW,
  bearer,
  emailOf,
  login,
  refreshWith,
  registerUser,
  rtOf,
  testOutbox,
  clearTestOutbox,
  tokenFromMail,
  waitForMail,
} from './authHelpers.js';

// B2: access token gắn với phiên (sid = familyId); thu hồi phiên có hiệu lực ngay.
const app = createApp({ generalRateLimit: 100_000, authRateLimit: 100_000 });
const NEW_PW = 'MatkhauMoi456';
const em = (k: string) => emailOf(`s-${k}`);

const cleanup = () => prisma.user.deleteMany({ where: { email: { startsWith: `${PREFIX}s-` } } });
beforeAll(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

const me = (token: string) => request(app).get(`${API}/me`).set(bearer(token));
const accessOf = (res: request.Response) =>
  (res.body as { data: { accessToken: string } }).data.accessToken;

describe('access token gắn với phiên (B2)', () => {
  it('logout -> access token cũ bị 401', async () => {
    const { accessToken, rt } = await registerUser(app, em('lo'));
    expect((await me(accessToken)).status).toBe(200);
    const out = await request(app)
      .post(`${API}/auth/logout`)
      .set('Origin', ORIGIN)
      .set('Cookie', `bb_rt=${rt}`);
    expect(out.status).toBe(204);
    const r = await me(accessToken);
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('UNAUTHORIZED');
  });

  it('refresh xoay token: access token cũ và mới đều còn dùng được (family còn token sống)', async () => {
    const { accessToken, rt } = await registerUser(app, em('rot'));
    const ref = await refreshWith(app, rt);
    expect(ref.status).toBe(200);
    expect((await me(accessOf(ref))).status).toBe(200);
    expect((await me(accessToken)).status).toBe(200);
  });

  it('reset-password -> mọi access token cũ bị 401', async () => {
    const email = em('rp');
    const a = await registerUser(app, email);
    const b = await login(app, email);
    expect((await me(a.accessToken)).status).toBe(200);
    expect((await me(accessOf(b))).status).toBe(200);

    clearTestOutbox();
    await request(app).post(`${API}/auth/forgot-password`).send({ email });
    const token = tokenFromMail((await waitForMail(email)).text);
    expect(testOutbox.length).toBeGreaterThan(0);
    const r = await request(app)
      .post(`${API}/auth/reset-password`)
      .send({ token, newPassword: NEW_PW });
    expect(r.status).toBe(200);

    expect((await me(a.accessToken)).status).toBe(401);
    expect((await me(accessOf(b))).status).toBe(401);
    // đăng nhập lại bằng mật khẩu mới -> token mới dùng được
    expect((await me(accessOf(await login(app, email, NEW_PW)))).status).toBe(200);
  });

  it('change-password -> access token phiên khác bị 401, phiên hiện tại vẫn 200', async () => {
    const email = em('cp');
    const a = await registerUser(app, email); // phiên hiện tại
    const b = await login(app, email); // phiên khác
    const r = await request(app)
      .post(`${API}/auth/change-password`)
      .set(bearer(a.accessToken))
      .send({ currentPassword: PW, newPassword: NEW_PW });
    expect(r.status).toBe(204);
    expect((await me(a.accessToken)).status).toBe(200);
    expect((await me(accessOf(b))).status).toBe(401);
  });

  it('dùng lại refresh token đã xoay -> access token của family đó bị 401, family khác không ảnh hưởng', async () => {
    const email = em('reuse');
    const a = await registerUser(app, email);
    const other = await login(app, email); // family khác
    const ref = await refreshWith(app, a.rt);
    expect(ref.status).toBe(200);
    const newAccess = accessOf(ref);
    expect((await me(newAccess)).status).toBe(200);

    expect((await refreshWith(app, a.rt)).status).toBe(401); // dùng lại token cũ
    expect((await me(newAccess)).status).toBe(401);
    expect((await me(a.accessToken)).status).toBe(401);
    expect((await me(accessOf(other))).status).toBe(200);
    expect(rtOf(ref)).toBeDefined();
  });

  it('refresh token hết hạn trong DB -> access token 401', async () => {
    const { accessToken, userId } = await registerUser(app, em('exp'));
    await prisma.refreshToken.updateMany({
      where: { userId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await me(accessToken)).status).toBe(401);
  });

  it('admin khóa user (D-022) vẫn trả 403 ACCOUNT_DISABLED như cũ', async () => {
    const { accessToken, userId } = await registerUser(app, em('dis'));
    await prisma.user.update({ where: { id: userId }, data: { status: 'DISABLED' } });
    const r = await me(accessToken);
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('ACCOUNT_DISABLED');
    // thu hồi luôn phiên: 403 vẫn đứng trước 401 phiên
    await prisma.refreshToken.updateMany({ where: { userId }, data: { revokedAt: new Date() } });
    expect((await me(accessToken)).status).toBe(403);
  });
});
