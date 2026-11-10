import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import {
  API,
  PREFIX,
  PW,
  bearer,
  clearTestOutbox,
  emailOf,
  hashOf,
  login,
  refreshWith,
  registerUser,
  rtOf,
  testOutbox,
  tokenFromMail,
  waitForMail,
} from './authHelpers.js';

const app = createApp({ generalRateLimit: 100_000, authRateLimit: 100_000 });
const NEW_PW = 'MatkhauMoi456';

const cleanup = () => prisma.user.deleteMany({ where: { email: { startsWith: `${PREFIX}r-` } } });
beforeAll(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

const em = (k: string) => emailOf(`r-${k}`);
const forgot = (email: string) => request(app).post(`${API}/auth/forgot-password`).send({ email });
const reset = (token: string, newPassword = NEW_PW) =>
  request(app).post(`${API}/auth/reset-password`).send({ token, newPassword });

/** Tạo user rồi yêu cầu reset, trả token từ mail. */
async function userWithResetToken(key: string) {
  const email = em(key);
  const reg = await registerUser(app, email);
  clearTestOutbox();
  expect((await forgot(email)).status).toBe(200);
  const token = tokenFromMail((await waitForMail(email)).text);
  return { email, token, ...reg };
}

describe('forgot-password / reset-password', () => {
  it('response giống hệt cho email có và không có; chỉ email có mới có mail', async () => {
    const email = em('f1');
    await registerUser(app, email);
    clearTestOutbox();
    const a = await forgot(email);
    const b = await forgot(em('khong-ton-tai'));
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body).toEqual(b.body);
    expect(a.body).toEqual({
      data: { message: 'Nếu email tồn tại, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu.' },
    });
    const mail = await waitForMail(email);
    expect(mail.text).toContain('http://localhost:3000/dat-lai-mat-khau?token=');
    expect(mail.text).toContain('30 phút');
    await new Promise((r) => setTimeout(r, 150));
    expect(testOutbox.filter((m) => m.to === em('khong-ton-tai'))).toHaveLength(0);
  });

  it('email sai định dạng -> 400; DISABLED -> 200 nhưng không có mail', async () => {
    expect((await forgot('khong-phai-email')).status).toBe(400);
    const email = em('f2');
    await registerUser(app, email);
    await prisma.user.update({ where: { email }, data: { status: 'DISABLED' } });
    clearTestOutbox();
    expect((await forgot(email)).status).toBe(200);
    await new Promise((r) => setTimeout(r, 150));
    expect(testOutbox.filter((m) => m.to === email)).toHaveLength(0);
  });

  it('reset thành công: mật khẩu mới đăng nhập được, cũ thì không; token lưu dạng hash', async () => {
    const { email, token } = await userWithResetToken('p1');
    const u = await prisma.user.findUniqueOrThrow({ where: { email } });
    const row = await prisma.passwordResetToken.findFirstOrThrow({ where: { userId: u.id } });
    expect(row.tokenHash).toBe(hashOf(token));
    expect(row.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(30 * 60_000);

    const r = await reset(token);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ data: { message: 'Đã đặt lại mật khẩu.' } });
    expect((await login(app, email, NEW_PW)).status).toBe(200);
    expect((await login(app, email, PW)).status).toBe(401);
  });

  it('dùng lại token -> 400 TOKEN_INVALID; token rác / mật khẩu yếu', async () => {
    const { token } = await userWithResetToken('p2');
    expect((await reset(token)).status).toBe(200);
    const again = await reset(token, 'MatkhauKhac789');
    expect(again.status).toBe(400);
    expect(again.body.error).toMatchObject({
      code: 'TOKEN_INVALID',
      message: 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn',
    });
    expect((await reset('rac')).body.error.code).toBe('TOKEN_INVALID');
    const weak = await reset('abc', 'yeu');
    expect(weak.status).toBe(400);
    expect(weak.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('token hết hạn -> 400', async () => {
    const { token, email } = await userWithResetToken('p3');
    const u = await prisma.user.findUniqueOrThrow({ where: { email } });
    await prisma.passwordResetToken.updateMany({
      where: { userId: u.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const r = await reset(token);
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('TOKEN_INVALID');
    expect((await login(app, email, PW)).status).toBe(200); // mật khẩu cũ không đổi
  });

  it('forgot lần 2 vô hiệu token lần 1', async () => {
    const { email, token: t1 } = await userWithResetToken('p4');
    clearTestOutbox();
    await forgot(email);
    const t2 = tokenFromMail((await waitForMail(email)).text);
    expect(t2).not.toBe(t1);
    expect((await reset(t1)).body.error.code).toBe('TOKEN_INVALID');
    expect((await reset(t2)).status).toBe(200);
  });

  it('reset thu hồi mọi refresh token và gỡ khóa', async () => {
    const { email, token, rt, userId } = await userWithResetToken('p5');
    for (let i = 0; i < 5; i++) await login(app, email, 'Sai12345');
    expect((await login(app, email, PW)).status).toBe(403);
    expect((await reset(token)).status).toBe(200);
    expect((await refreshWith(app, rt)).status).toBe(401);
    expect(await prisma.refreshToken.count({ where: { userId, revokedAt: null } })).toBe(0);
    const u = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(u).toMatchObject({ failedLoginCount: 0, lockedUntil: null, lastFailedLoginAt: null });
    expect((await login(app, email, NEW_PW)).status).toBe(200);
  });

  it('user DISABLED -> TOKEN_INVALID', async () => {
    const { token, email } = await userWithResetToken('p6');
    await prisma.user.update({ where: { email }, data: { status: 'DISABLED' } });
    expect((await reset(token)).body.error.code).toBe('TOKEN_INVALID');
  });
});

describe('verify-email / resend-verification', () => {
  const verify = (token: string) => request(app).post(`${API}/auth/verify-email`).send({ token });

  it('thành công -> emailVerified true; gọi lại cùng token vẫn 200; token rác 400', async () => {
    const email = em('v1');
    clearTestOutbox();
    const { accessToken } = await registerUser(app, email);
    const token = tokenFromMail((await waitForMail(email)).text);
    const r = await verify(token);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ data: { emailVerified: true } });
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { email } })).emailVerifiedAt,
    ).not.toBeNull();
    expect((await verify(token)).body).toEqual({ data: { emailVerified: true } });
    const junk = await verify('rac-rac');
    expect(junk.status).toBe(400);
    expect(junk.body.error.code).toBe('TOKEN_INVALID');
    // đã xác thực -> resend 409 CONFLICT
    const resend = await request(app)
      .post(`${API}/auth/resend-verification`)
      .set(bearer(accessToken));
    expect(resend.status).toBe(409);
    expect(resend.body.error).toMatchObject({
      code: 'CONFLICT',
      message: 'Email đã được xác thực',
    });
  });

  it('token hết hạn (chưa dùng) -> 400', async () => {
    const email = em('v2');
    clearTestOutbox();
    const { userId } = await registerUser(app, email);
    const token = tokenFromMail((await waitForMail(email)).text);
    await prisma.emailVerificationToken.updateMany({
      where: { userId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await verify(token)).body.error.code).toBe('TOKEN_INVALID');
  });

  it('resend: ngay sau đăng ký -> 429 + Retry-After; lùi 61 giây -> 204, token cũ bị vô hiệu', async () => {
    const email = em('v3');
    clearTestOutbox();
    const { accessToken, userId } = await registerUser(app, email);
    const oldToken = tokenFromMail((await waitForMail(email)).text);

    const blocked = await request(app)
      .post(`${API}/auth/resend-verification`)
      .set(bearer(accessToken));
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    const retry = Number(blocked.headers['retry-after']);
    expect(retry).toBeGreaterThanOrEqual(1);
    expect(retry).toBeLessThanOrEqual(60);
    expect(blocked.body.error.details.retryAfterSec).toBe(retry);

    await prisma.emailVerificationToken.updateMany({
      where: { userId },
      data: { createdAt: new Date(Date.now() - 61_000) },
    });
    clearTestOutbox();
    const ok = await request(app).post(`${API}/auth/resend-verification`).set(bearer(accessToken));
    expect(ok.status).toBe(204);
    const newToken = tokenFromMail((await waitForMail(email)).text);
    expect(newToken).not.toBe(oldToken);
    expect((await verify(oldToken)).body.error?.code).toBe('TOKEN_INVALID');
    expect((await verify(newToken)).status).toBe(200);
  });

  it('resend không có access token -> 401', async () => {
    expect((await request(app).post(`${API}/auth/resend-verification`)).status).toBe(401);
  });
});

describe('POST /auth/change-password', () => {
  const change = (token: string, body: Record<string, unknown>) =>
    request(app).post(`${API}/auth/change-password`).set(bearer(token)).send(body);

  it('sai mật khẩu hiện tại -> 400 INVALID_PASSWORD; trùng -> 400 VALIDATION_ERROR; chưa đăng nhập -> 401', async () => {
    const { accessToken } = await registerUser(app, em('c1'));
    const wrong = await change(accessToken, { currentPassword: 'Sai12345', newPassword: NEW_PW });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error).toMatchObject({
      code: 'INVALID_PASSWORD',
      message: 'Mật khẩu hiện tại không đúng',
    });
    const same = await change(accessToken, { currentPassword: PW, newPassword: PW });
    expect(same.status).toBe(400);
    expect(same.body.error.code).toBe('VALIDATION_ERROR');
    expect(same.body.error.details).toEqual([
      { field: 'newPassword', message: 'Mật khẩu mới phải khác mật khẩu hiện tại' },
    ]);
    const weak = await change(accessToken, { currentPassword: PW, newPassword: 'yeu' });
    expect(weak.status).toBe(400);
    const anon = await request(app)
      .post(`${API}/auth/change-password`)
      .send({ currentPassword: PW, newPassword: NEW_PW });
    expect(anon.status).toBe(401);
  });

  it('thành công: phiên hiện tại refresh được, phiên khác bị thu hồi, mật khẩu đổi', async () => {
    const email = em('c2');
    const first = await registerUser(app, email); // phiên A
    const second = await login(app, email); // phiên B
    const rtB = rtOf(second)!;

    const r = await change(first.accessToken, { currentPassword: PW, newPassword: NEW_PW });
    expect(r.status).toBe(204);

    expect((await refreshWith(app, first.rt)).status).toBe(200);
    expect((await refreshWith(app, rtB)).status).toBe(401);
    expect((await login(app, email, NEW_PW)).status).toBe(200);
    expect((await login(app, email, PW)).status).toBe(401);
  });
});
