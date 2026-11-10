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
  clearTestOutbox,
  emailOf,
  hashOf,
  login,
  refreshWith,
  registerUser,
  rtOf,
  setCookies,
  testOutbox,
  tokenFromMail,
  waitForMail,
} from './authHelpers.js';

const app = createApp({ generalRateLimit: 100_000, authRateLimit: 100_000 });

const cleanup = () => prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
beforeAll(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('POST /auth/register', () => {
  it('201, cookie an toàn, body sạch, email lowercase, SĐT chuẩn hóa, mail xác thực', async () => {
    clearTestOutbox();
    const email = emailOf('reg1');
    const { res } = await registerUser(app, `  ${email.toUpperCase()} `, {
      phone: '+84 901-234.567',
      fullName: '  Nguyễn Văn An  ',
    });
    expect(res.status).toBe(201);

    const cookie = setCookies(res).find((c) => c.startsWith('bb_rt='))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
    expect(cookie).toMatch(/Max-Age=604800/);

    const data = (res.body as { data: Record<string, unknown> }).data;
    expect(data.expiresIn).toBe(900);
    expect(typeof data.accessToken).toBe('string');
    expect(data).not.toHaveProperty('refreshToken');
    const user = data.user as Record<string, unknown>;
    expect(user).toMatchObject({
      email,
      fullName: 'Nguyễn Văn An',
      phone: '0901234567',
      birthDate: null,
      avatarUrl: null,
      role: 'CUSTOMER',
      emailVerified: false,
    });
    expect(Object.keys(user).sort()).toEqual(
      [
        'avatarUrl',
        'birthDate',
        'createdAt',
        'email',
        'emailVerified',
        'fullName',
        'id',
        'phone',
        'role',
      ].sort(),
    );
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);

    const mail = await waitForMail(email);
    expect(mail.subject).toMatch(/Xác thực/);
    expect(mail.text).toContain('http://localhost:3000/xac-thuc-email?token=');
    expect(mail.html).toContain('http://localhost:3000/xac-thuc-email?token=');
    expect(mail.text).toContain('24 giờ');
    expect(mail.text).toContain('Nếu bạn không yêu cầu, hãy bỏ qua email này');
  });

  it('DB lưu hash, không lưu token rõ / mật khẩu rõ', async () => {
    clearTestOutbox();
    const email = emailOf('reg2');
    const { res, rt } = await registerUser(app, email);
    expect(res.status).toBe(201);
    const mailToken = tokenFromMail((await waitForMail(email)).text);

    const u = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(u.passwordHash).toMatch(/^\$argon2id\$/);
    expect(u.passwordHash).not.toContain(PW);

    const ev = await prisma.emailVerificationToken.findMany({ where: { userId: u.id } });
    expect(ev).toHaveLength(1);
    expect(ev[0]!.tokenHash).toBe(hashOf(mailToken));
    expect(ev[0]!.tokenHash).not.toBe(mailToken);
    expect(ev[0]!.expiresAt.getTime() - Date.now()).toBeGreaterThan(23.9 * 3600_000);

    const rts = await prisma.refreshToken.findMany({ where: { userId: u.id } });
    expect(rts).toHaveLength(1);
    expect(rts[0]!.tokenHash).toBe(hashOf(rt!));
    expect(rts[0]!.tokenHash).not.toBe(rt);
  });

  it('email trùng (khác hoa thường) -> 409 EMAIL_TAKEN', async () => {
    const email = emailOf('reg3');
    expect((await registerUser(app, email)).res.status).toBe(201);
    const r = await registerUser(app, email.toUpperCase());
    expect(r.res.status).toBe(409);
    expect(r.res.body.error).toMatchObject({
      code: 'EMAIL_TAKEN',
      message: 'Email đã được sử dụng',
    });
  });

  it('đăng ký đồng thời cùng email: đúng một bên thành công', async () => {
    const email = emailOf('reg-race');
    const rs = await Promise.all([registerUser(app, email), registerUser(app, email)]);
    const codes = rs.map((r) => r.res.status).sort();
    expect(codes).toEqual([201, 409]);
  });

  it('mật khẩu yếu / email sai / SĐT sai / thiếu họ tên -> 400 VALIDATION_ERROR', async () => {
    for (const body of [
      { email: emailOf('weak'), password: 'abcdefgh', fullName: 'An Nguyễn' },
      { email: emailOf('weak'), password: '12345678', fullName: 'An Nguyễn' },
      { email: emailOf('weak'), password: 'Ab1', fullName: 'An Nguyễn' },
      { email: 'khong-phai-email', password: PW, fullName: 'An Nguyễn' },
      { email: emailOf('weak'), password: PW, fullName: 'An Nguyễn', phone: '123' },
      { email: emailOf('weak'), password: PW, fullName: 'A' },
    ]) {
      const r = await request(app).post(`${API}/auth/register`).send(body);
      expect(r.status).toBe(400);
      expect(r.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect(await prisma.user.count({ where: { email: emailOf('weak') } })).toBe(0);
  });
});

describe('POST /auth/login', () => {
  it('đúng -> 200, cấp cookie và cập nhật lastLoginAt', async () => {
    const email = emailOf('log1');
    await registerUser(app, email);
    const r = await login(app, email.toUpperCase());
    expect(r.status).toBe(200);
    expect(rtOf(r)).toBeTruthy();
    expect(r.body.data.user.email).toBe(email);
    const u = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(u.lastLoginAt).not.toBeNull();
  });

  it('sai mật khẩu và email không tồn tại trả cùng status/code/message', async () => {
    const email = emailOf('log2');
    await registerUser(app, email);
    const a = await login(app, email, 'SaiMatkhau1');
    const b = await login(app, emailOf('khong-ton-tai'), PW);
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body).toEqual(b.body);
    expect(a.body.error).toEqual({
      code: 'INVALID_CREDENTIALS',
      message: 'Email hoặc mật khẩu không đúng',
    });
  });

  it('5 lần sai -> khóa; lần 6 (kể cả đúng mật khẩu) 403 ACCOUNT_LOCKED', async () => {
    const email = emailOf('lock1');
    await registerUser(app, email);
    for (let i = 0; i < 5; i++) expect((await login(app, email, 'Sai12345')).status).toBe(401);
    const r = await login(app, email, PW);
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('ACCOUNT_LOCKED');
    const until = new Date(r.body.error.details.lockedUntil as string).getTime();
    expect(until - Date.now()).toBeGreaterThan(14 * 60_000);
    expect(until - Date.now()).toBeLessThanOrEqual(15 * 60_000);
    expect((await login(app, email, 'Sai12345')).status).toBe(403);
  });

  it('hết khóa (lockedUntil quá khứ) đăng nhập được và counter reset', async () => {
    const email = emailOf('lock2');
    await registerUser(app, email);
    for (let i = 0; i < 5; i++) await login(app, email, 'Sai12345');
    await prisma.user.update({
      where: { email },
      data: { lockedUntil: new Date(Date.now() - 1000) },
    });
    const r = await login(app, email, PW);
    expect(r.status).toBe(200);
    const u = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(u).toMatchObject({ failedLoginCount: 0, lastFailedLoginAt: null, lockedUntil: null });
  });

  it('sai nhưng cách > 15 phút thì đếm lại từ 1', async () => {
    const email = emailOf('lock3');
    await registerUser(app, email);
    for (let i = 0; i < 4; i++) await login(app, email, 'Sai12345');
    expect((await prisma.user.findUniqueOrThrow({ where: { email } })).failedLoginCount).toBe(4);
    await prisma.user.update({
      where: { email },
      data: { lastFailedLoginAt: new Date(Date.now() - 16 * 60_000) },
    });
    expect((await login(app, email, 'Sai12345')).status).toBe(401);
    const u = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(u.failedLoginCount).toBe(1);
    expect(u.lockedUntil).toBeNull();
    // chưa bị khóa: vẫn đăng nhập được
    expect((await login(app, email, PW)).status).toBe(200);
  });

  it('đếm sai nguyên tử khi nhiều request đồng thời', async () => {
    const email = emailOf('lock4');
    await registerUser(app, email);
    await Promise.all(Array.from({ length: 4 }, () => login(app, email, 'Sai12345')));
    const u = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(u.failedLoginCount).toBe(4);
  });

  it('DISABLED: đúng mật khẩu 403 ACCOUNT_DISABLED, sai mật khẩu 401', async () => {
    const email = emailOf('dis1');
    await registerUser(app, email);
    await prisma.user.update({ where: { email }, data: { status: 'DISABLED' } });
    const ok = await login(app, email, PW);
    expect(ok.status).toBe(403);
    expect(ok.body.error.code).toBe('ACCOUNT_DISABLED');
    expect((await login(app, email, 'Sai12345')).status).toBe(401);
  });

  it('body thiếu/sai -> 400', async () => {
    expect((await request(app).post(`${API}/auth/login`).send({})).status).toBe(400);
    expect(
      (await request(app).post(`${API}/auth/login`).send({ email: 'x', password: 'y' })).status,
    ).toBe(400);
  });
});

describe('POST /auth/refresh', () => {
  it('thiếu Origin / Origin lạ -> 403 INVALID_ORIGIN (trước mọi xử lý)', async () => {
    const { rt } = await registerUser(app, emailOf('rf0'));
    const a = await request(app).post(`${API}/auth/refresh`).set('Cookie', `bb_rt=${rt}`);
    expect(a.status).toBe(403);
    expect(a.body.error.code).toBe('INVALID_ORIGIN');
    const b = await request(app)
      .post(`${API}/auth/refresh`)
      .set('Origin', 'http://evil.test')
      .set('Cookie', `bb_rt=${rt}`);
    expect(b.status).toBe(403);
    // token vẫn dùng được: request bị chặn không đụng tới nó
    expect((await refreshWith(app, rt)).status).toBe(200);
  });

  it('xoay vòng: cookie mới, user mới nhất, token cũ bị thu hồi, replacedById được set', async () => {
    const email = emailOf('rf1');
    const { rt, userId } = await registerUser(app, email);
    await prisma.user.update({ where: { id: userId }, data: { role: 'STAFF' } });
    const r = await refreshWith(app, rt);
    expect(r.status).toBe(200);
    const rt2 = rtOf(r);
    expect(rt2).toBeTruthy();
    expect(rt2).not.toBe(rt);
    expect(r.body.data.user.role).toBe('STAFF');
    expect(r.body.data.expiresIn).toBe(900);
    expect(setCookies(r)[0]).toMatch(/Max-Age=604800/);

    const rows = await prisma.refreshToken.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]!.revokedAt).not.toBeNull();
    expect(rows[0]!.replacedById).toBe(rows[1]!.id);
    expect(rows[1]!.revokedAt).toBeNull();
    expect(rows[0]!.familyId).toBe(rows[1]!.familyId);
  });

  it('dùng lại token cũ -> 401 và token MỚI của family cũng bị thu hồi', async () => {
    const { rt } = await registerUser(app, emailOf('rf2'));
    const r1 = await refreshWith(app, rt);
    const rt2 = rtOf(r1);
    const reuse = await refreshWith(app, rt);
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('INVALID_REFRESH_TOKEN');
    expect(setCookies(reuse).join(';')).toMatch(/bb_rt=;/);
    const next = await refreshWith(app, rt2);
    expect(next.status).toBe(401);
  });

  it('hai request đồng thời cùng một token: không bên nào để lại phiên sống', async () => {
    const { rt, userId } = await registerUser(app, emailOf('rf-race'));
    const rs = await Promise.all([refreshWith(app, rt), refreshWith(app, rt)]);
    const statuses = rs.map((r) => r.status).sort();
    expect(statuses[1]).toBe(401); // ít nhất một bên thua
    // Bên thua thu hồi cả family -> sau đó không còn token chưa thu hồi nào
    await new Promise((r) => setTimeout(r, 100));
    expect(await prisma.refreshToken.count({ where: { userId, revokedAt: null } })).toBe(0);
  });

  it('thiếu cookie / cookie rác -> 401 và xóa cookie', async () => {
    const none = await refreshWith(app, undefined);
    expect(none.status).toBe(401);
    expect(none.body.error.code).toBe('INVALID_REFRESH_TOKEN');
    const junk = await refreshWith(app, 'rac-khong-ton-tai');
    expect(junk.status).toBe(401);
    const clear = setCookies(junk).find((c) => c.startsWith('bb_rt='))!;
    expect(clear).toMatch(/^bb_rt=;/);
    expect(clear).toMatch(/Path=\/api\/v1\/auth/);
    expect(clear).toMatch(/HttpOnly/i);
    expect(clear).toMatch(/SameSite=Strict/i);
    expect(clear).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  it('token hết hạn -> 401', async () => {
    const { rt, userId } = await registerUser(app, emailOf('rf3'));
    await prisma.refreshToken.updateMany({
      where: { userId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await refreshWith(app, rt)).status).toBe(401);
  });

  it('user DISABLED -> thu hồi family, 401', async () => {
    const { rt, userId } = await registerUser(app, emailOf('rf4'));
    await prisma.user.update({ where: { id: userId }, data: { status: 'DISABLED' } });
    expect((await refreshWith(app, rt)).status).toBe(401);
    expect(await prisma.refreshToken.count({ where: { userId, revokedAt: null } })).toBe(0);
  });

  it('access token mới gọi được route requireAuth', async () => {
    const { rt } = await registerUser(app, emailOf('rf5'));
    const r = await refreshWith(app, rt);
    const t = r.body.data.accessToken as string;
    const resend = await request(app).post(`${API}/auth/resend-verification`).set(bearer(t));
    // vừa đăng ký nên bị chặn tần suất (429) chứ không phải 401: chứng tỏ token hợp lệ
    expect(resend.status).toBe(429);
  });
});

describe('POST /auth/logout', () => {
  it('204 khi không cookie; thiếu Origin -> 403', async () => {
    const r = await request(app).post(`${API}/auth/logout`).set('Origin', ORIGIN);
    expect(r.status).toBe(204);
    const bad = await request(app).post(`${API}/auth/logout`);
    expect(bad.status).toBe(403);
    expect(bad.body.error.code).toBe('INVALID_ORIGIN');
  });

  it('cookie rác vẫn 204 và có Set-Cookie xóa', async () => {
    const r = await request(app)
      .post(`${API}/auth/logout`)
      .set('Origin', ORIGIN)
      .set('Cookie', 'bb_rt=rac');
    expect(r.status).toBe(204);
    expect(setCookies(r).find((c) => c.startsWith('bb_rt='))).toMatch(/^bb_rt=;/);
  });

  it('có cookie -> 204, thu hồi cả family', async () => {
    const email = emailOf('out1');
    await registerUser(app, email);
    const l = await login(app, email);
    const rt = rtOf(l)!;
    const rt2 = rtOf(await refreshWith(app, rt))!; // family có 2 token
    const r = await request(app)
      .post(`${API}/auth/logout`)
      .set('Origin', ORIGIN)
      .set('Cookie', `bb_rt=${rt2}`);
    expect(r.status).toBe(204);
    expect((await refreshWith(app, rt2)).status).toBe(401);
    const u = await prisma.user.findUniqueOrThrow({ where: { email } });
    const alive = await prisma.refreshToken.findMany({ where: { userId: u.id, revokedAt: null } });
    // chỉ còn token của family khác (phiên đăng ký ban đầu)
    expect(alive).toHaveLength(1);
  });
});

describe('rate limit nhóm nhạy cảm', () => {
  it('authRateLimit=5: lần login thứ 6 -> 429 RATE_LIMITED + Retry-After', async () => {
    const limited = createApp({ generalRateLimit: 100_000, authRateLimit: 5 });
    const email = emailOf('nobody');
    for (let i = 0; i < 5; i++) expect((await login(limited, email)).status).toBe(401);
    const r = await login(limited, email);
    expect(r.status).toBe(429);
    expect(r.body.error.code).toBe('RATE_LIMITED');
    expect(Number(r.headers['retry-after'])).toBeGreaterThanOrEqual(1);
  });

  it('X-Internal-Secret đúng vẫn bị limiter nhạy cảm chặn', async () => {
    const limited = createApp({ generalRateLimit: 100_000, authRateLimit: 2 });
    const send = () =>
      request(limited)
        .post(`${API}/auth/login`)
        .set('X-Internal-Secret', process.env.INTERNAL_API_SECRET!)
        .send({ email: emailOf('nobody'), password: PW });
    expect((await send()).status).toBe(401);
    expect((await send()).status).toBe(401);
    expect((await send()).status).toBe(429);
  });

  it('mail không bị gửi cho email không tồn tại ở login', () => {
    expect(testOutbox.some((m) => m.to === emailOf('nobody'))).toBe(false);
  });
});
