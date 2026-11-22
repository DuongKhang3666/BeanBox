import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { runCleanupOnce } from '../src/jobs/cleanup.js';
import { prisma } from '../src/lib/prisma.js';
import { sha256Hex } from '../src/lib/tokens.js';
import { base32Decode, totpAt } from '../src/lib/totp.js';
import { API, PW, bearer, emailOf, login, refreshWith, registerUser } from './authHelpers.js';

/** D-063: xác thực 2 lớp TOTP cho Staff/Admin (api-contract §5.9, §6.5, §14.10). */

const app = createApp({ generalRateLimit: 100_000, authRateLimit: 100_000 });
const em = (k: string) => emailOf(`ttfa-${k}`);
const ORIGINAL_KEY = env.TOTP_ENCRYPTION_KEY;

interface Acct {
  id: string;
  email: string;
  token: string;
}

type Role = 'CUSTOMER' | 'STAFF' | 'ADMIN';

async function mk(key: string, role: Role = 'STAFF'): Promise<Acct> {
  const email = em(key);
  const r = await registerUser(app, email);
  expect(r.res.status).toBe(201);
  if (role !== 'CUSTOMER') await prisma.user.update({ where: { id: r.userId }, data: { role } });
  return { id: r.userId, email, token: r.accessToken };
}

const post = (path: string, token: string | null, body: Record<string, unknown>) => {
  const r = request(app).post(`${API}${path}`);
  return (token ? r.set(bearer(token)) : r).send(body);
};
const errCode = (res: request.Response) => (res.body as { error: { code: string } }).error.code;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dataOf = (res: request.Response) => (res.body as { data: any }).data;
const meOf = (token: string) => request(app).get(`${API}/me`).set(bearer(token));

const code = (secret: Buffer, offsetSteps = 0) => totpAt(secret, Date.now() + offsetSteps * 30_000);
/** Mã 6 số chắc chắn SAI: không trùng mã nào trong cửa sổ +-2 bước quanh bây giờ (tất định, không đoán '000000'). */
const wrongCode = (secret: Buffer): string => {
  const valid = new Set([-2, -1, 0, 1, 2].map((o) => code(secret, o)));
  for (let i = 0; ; i++) {
    const c = String(i).padStart(6, '0');
    if (!valid.has(c)) return c;
  }
};
const freeStep = (userId: string) =>
  prisma.user.update({ where: { id: userId }, data: { twoFactorLastStep: null } });

interface Enabled {
  secret: Buffer;
  backupCodes: string[];
}

/** setup + enable; phiên `a.token` được giữ, mọi phiên khác bị thu hồi. */
async function enable2fa(a: Acct): Promise<Enabled> {
  const s = await post('/me/2fa/setup', a.token, { password: PW });
  expect(s.status).toBe(200);
  const secret = base32Decode(dataOf(s).secret as string);
  const e = await post('/me/2fa/enable', a.token, { code: code(secret) });
  expect(e.status).toBe(200);
  await freeStep(a.id); // các test sau tự chọn bước; replay có test riêng
  return { secret, backupCodes: dataOf(e).backupCodes as string[] };
}

async function step1(a: Acct) {
  const r = await login(app, a.email);
  expect(r.status).toBe(200);
  return dataOf(r).challengeToken as string;
}

const step2 = (challengeToken: string, body: Record<string, unknown>) =>
  request(app)
    .post(`${API}/auth/login/2fa`)
    .send({ challengeToken, ...body });

const cleanup = async () => {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: 'tm2a-ttfa-' } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actorId: { in: ids } }, { entityId: { in: ids } }] },
  });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
};

beforeAll(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});
afterEach(() => {
  env.TOTP_ENCRYPTION_KEY = ORIGINAL_KEY;
});

describe('quyền truy cập /me/2fa/*', () => {
  it('chưa đăng nhập -> 401; CUSTOMER -> 403 ở cả 4 endpoint', async () => {
    const cust = await mk('cust', 'CUSTOMER');
    const bodies: Array<[string, Record<string, unknown>]> = [
      ['/me/2fa/setup', { password: PW }],
      ['/me/2fa/enable', { code: '123456' }],
      ['/me/2fa/disable', { password: PW, code: '123456' }],
      ['/me/2fa/backup-codes', { password: PW, code: '123456' }],
    ];
    for (const [path, body] of bodies) {
      expect((await post(path, null, body)).status).toBe(401);
      const r = await post(path, cust.token, body);
      expect(r.status).toBe(403);
      expect(errCode(r)).toBe('FORBIDDEN');
    }
  });

  it('body sai -> 400 VALIDATION_ERROR', async () => {
    const a = await mk('val');
    expect((await post('/me/2fa/setup', a.token, {})).status).toBe(400);
    expect((await post('/me/2fa/enable', a.token, { code: '12ab56' })).status).toBe(400);
    expect((await post('/me/2fa/disable', a.token, { password: PW })).status).toBe(400);
  });
});

describe('setup / enable', () => {
  it('setup: sai mật khẩu -> 400; đúng -> secret + otpauth + QR; secret được mã hóa khi lưu', async () => {
    const a = await mk('setup');
    const bad = await post('/me/2fa/setup', a.token, { password: 'Sai-mat-khau1' });
    expect(bad.status).toBe(400);
    expect(errCode(bad)).toBe('INVALID_PASSWORD');

    const r = await post('/me/2fa/setup', a.token, { password: PW });
    expect(r.status).toBe(200);
    const d = dataOf(r);
    expect(Object.keys(d).sort()).toEqual(['otpauthUri', 'qrDataUrl', 'secret']);
    expect(d.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(d.otpauthUri).toBe(
      `otpauth://totp/BeanBox:${encodeURIComponent(a.email)}?secret=${d.secret}&issuer=BeanBox&algorithm=SHA1&digits=6&period=30`,
    );
    expect(d.qrDataUrl).toMatch(/^data:image\/png;base64,/);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: a.id } });
    expect(row.twoFactorPendingSecretEnc).toMatch(/^v1:/);
    expect(row.twoFactorPendingSecretEnc).not.toContain(d.secret as string);
    expect(row.twoFactorEnabledAt).toBeNull();
    expect(dataOf(await meOf(a.token)).twoFactorEnabled).toBe(false);
  });

  it('enable: chưa setup -> 409; sai mã -> 400; hết hạn thiết lập 10 phút -> 409', async () => {
    const a = await mk('enable-bad');
    const none = await post('/me/2fa/enable', a.token, { code: '123456' });
    expect(none.status).toBe(409);
    expect(errCode(none)).toBe('TWO_FACTOR_SETUP_REQUIRED');

    const s = await post('/me/2fa/setup', a.token, { password: PW });
    const secret = base32Decode(dataOf(s).secret as string);
    const wrong = wrongCode(secret);
    const bad = await post('/me/2fa/enable', a.token, { code: wrong });
    expect(bad.status).toBe(400);
    expect(errCode(bad)).toBe('TWO_FACTOR_INVALID');

    await prisma.user.update({
      where: { id: a.id },
      data: { twoFactorPendingAt: new Date(Date.now() - 11 * 60_000) },
    });
    const old = await post('/me/2fa/enable', a.token, { code: code(secret) });
    expect(old.status).toBe(409);
    expect(errCode(old)).toBe('TWO_FACTOR_SETUP_REQUIRED');
  });

  it('enable đúng: 10 mã dự phòng, lưu băm, audit, thu hồi phiên khác (giữ phiên hiện tại)', async () => {
    const a = await mk('enable-ok');
    const other = await login(app, a.email);
    const otherToken = dataOf(other).accessToken as string;
    expect((await meOf(otherToken)).status).toBe(200);

    const { secret, backupCodes } = await enable2fa(a);
    expect(backupCodes).toHaveLength(10);
    expect(new Set(backupCodes).size).toBe(10);
    for (const c of backupCodes) expect(c).toMatch(/^[A-HJ-KM-NP-Z2-9]{5}-[A-HJ-KM-NP-Z2-9]{5}$/);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: a.id } });
    expect(row.twoFactorEnabledAt).not.toBeNull();
    expect(row.twoFactorSecretEnc).toMatch(/^v1:/);
    expect(row.twoFactorPendingSecretEnc).toBeNull();
    expect(row.twoFactorPendingAt).toBeNull();
    const stored = await prisma.twoFactorBackupCode.findMany({ where: { userId: a.id } });
    expect(stored).toHaveLength(10);
    const hashes = new Set(stored.map((s) => s.codeHash));
    for (const c of backupCodes) {
      expect(hashes.has(sha256Hex(c.replace('-', '')))).toBe(true);
      expect(JSON.stringify(stored)).not.toContain(c);
    }
    expect(secret).toHaveLength(20);

    expect((await meOf(a.token)).status).toBe(200); // phiên hiện tại còn
    expect((await meOf(otherToken)).status).toBe(401); // phiên khác bị thu hồi
    expect(dataOf(await meOf(a.token)).twoFactorEnabled).toBe(true);

    const audit = await prisma.auditLog.findMany({
      where: { entityId: a.id, action: 'user.2fa.enable' },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]!.actorId).toBe(a.id);
    expect(JSON.stringify(audit[0]!.diff)).not.toMatch(/secret|v1:/i);
  });

  it('đã bật -> setup/enable trả 409; mã dùng để bật không đăng nhập lại được (chống dùng lại)', async () => {
    const a = await mk('twice');
    const s = await post('/me/2fa/setup', a.token, { password: PW });
    const secret = base32Decode(dataOf(s).secret as string);
    const c = code(secret);
    expect((await post('/me/2fa/enable', a.token, { code: c })).status).toBe(200);

    const again = await post('/me/2fa/setup', a.token, { password: PW });
    expect(again.status).toBe(409);
    expect(errCode(again)).toBe('CONFLICT');
    expect((await post('/me/2fa/enable', a.token, { code: c })).status).toBe(409);

    const r = await step2(await step1(a), { code: c });
    expect(r.status).toBe(401);
    expect(errCode(r)).toBe('TWO_FACTOR_INVALID');
  });

  it('setup lại khi chưa bật: secret mới thay secret chờ cũ (mã của secret cũ bị từ chối)', async () => {
    const a = await mk('resetup');
    const s1 = await post('/me/2fa/setup', a.token, { password: PW });
    const s2 = await post('/me/2fa/setup', a.token, { password: PW });
    expect(dataOf(s1).secret).not.toBe(dataOf(s2).secret);
    const old = base32Decode(dataOf(s1).secret as string);
    const cur = base32Decode(dataOf(s2).secret as string);
    if (code(old) !== code(cur)) {
      expect((await post('/me/2fa/enable', a.token, { code: code(old) })).status).toBe(400);
    }
    expect((await post('/me/2fa/enable', a.token, { code: code(cur) })).status).toBe(200);
  });
});

describe('thiếu / sai TOTP_ENCRYPTION_KEY', () => {
  it('thiếu khóa: setup -> 503 TWO_FACTOR_UNAVAILABLE', async () => {
    const a = await mk('nokey-setup');
    env.TOTP_ENCRYPTION_KEY = undefined;
    const r = await post('/me/2fa/setup', a.token, { password: PW });
    expect(r.status).toBe(503);
    expect(errCode(r)).toBe('TWO_FACTOR_UNAVAILABLE');
  });

  it('user đã bật 2FA mà thiếu khóa: đăng nhập 503, không cấp phiên/thử thách', async () => {
    const a = await mk('nokey-login');
    await enable2fa(a);
    const token = await step1(a);
    env.TOTP_ENCRYPTION_KEY = undefined;
    const before = await prisma.twoFactorChallenge.count({ where: { userId: a.id } });
    const r = await login(app, a.email);
    expect(r.status).toBe(503);
    expect(errCode(r)).toBe('TWO_FACTOR_UNAVAILABLE');
    expect(r.headers['set-cookie']).toBeUndefined();
    expect(await prisma.twoFactorChallenge.count({ where: { userId: a.id } })).toBe(before);
    const r2 = await step2(token, { backupCode: 'AAAAA-AAAAA' });
    expect(r2.status).toBe(503);
  });

  it('khóa khác khóa đã dùng để mã hóa: bước 2 -> 503 (không đăng nhập được, không bỏ qua)', async () => {
    const a = await mk('wrongkey');
    const { secret } = await enable2fa(a);
    const token = await step1(a);
    env.TOTP_ENCRYPTION_KEY = Buffer.alloc(32, 7);
    const r = await step2(token, { code: code(secret) });
    expect(r.status).toBe(503);
    expect(errCode(r)).toBe('TWO_FACTOR_UNAVAILABLE');
  });
});

describe('đăng nhập 2 bước', () => {
  it('bước 1: 200 chỉ có challenge; không cookie, không access token; DB chỉ giữ băm', async () => {
    const a = await mk('s1');
    await enable2fa(a);
    const r = await login(app, a.email);
    expect(r.status).toBe(200);
    expect(r.headers['set-cookie']).toBeUndefined();
    const d = dataOf(r);
    expect(Object.keys(d).sort()).toEqual(['challengeToken', 'expiresAt', 'twoFactorRequired']);
    expect(d.twoFactorRequired).toBe(true);
    expect(JSON.stringify(r.body)).not.toMatch(/accessToken|"user"/);
    const ttl = new Date(d.expiresAt as string).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(4 * 60_000);
    expect(ttl).toBeLessThanOrEqual(5 * 60_000);
    const row = await prisma.twoFactorChallenge.findFirstOrThrow({
      where: { userId: a.id, usedAt: null },
    });
    expect(row.tokenHash).toBe(sha256Hex(d.challengeToken as string));
    expect(row.tokenHash).not.toBe(d.challengeToken);
    // Sai mật khẩu vẫn 401 chung, không lộ 2FA
    const bad = await login(app, a.email, 'Sai-mat-khau1');
    expect(bad.status).toBe(401);
    expect(errCode(bad)).toBe('INVALID_CREDENTIALS');
  });

  it('bước 2 đúng TOTP: cấp phiên (cookie + access), lastLoginAt, challenge đã dùng; refresh hoạt động', async () => {
    const a = await mk('s2');
    const { secret } = await enable2fa(a);
    const token = await step1(a);
    const r = await step2(token, { code: code(secret) });
    expect(r.status).toBe(200);
    const d = dataOf(r);
    expect(d.user.twoFactorEnabled).toBe(true);
    expect(d.expiresIn).toBeGreaterThan(0);
    const cookie = (r.headers['set-cookie'] as unknown as string[]).find((c) =>
      c.startsWith('bb_rt='),
    )!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect((await meOf(d.accessToken as string)).status).toBe(200);
    const rt = cookie.slice('bb_rt='.length).split(';')[0];
    expect((await refreshWith(app, rt)).status).toBe(200);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: a.id } });
    expect(row.lastLoginAt).not.toBeNull();
    expect(row.failedLoginCount).toBe(0);
    const ch = await prisma.twoFactorChallenge.findFirstOrThrow({ where: { userId: a.id } });
    expect(ch.usedAt).not.toBeNull();

    // Challenge đã dùng -> không dùng lại
    await freeStep(a.id);
    const reuse = await step2(token, { code: code(secret) });
    expect(reuse.status).toBe(401);
    expect(errCode(reuse)).toBe('TWO_FACTOR_CHALLENGE_INVALID');
  });

  it('chấp nhận mã có khoảng trắng và mã của bước liền kề (cửa sổ +-1)', async () => {
    const a = await mk('window');
    const { secret } = await enable2fa(a);
    const c = code(secret, 1);
    const r = await step2(await step1(a), { code: `${c.slice(0, 3)} ${c.slice(3)}` });
    expect(r.status).toBe(200);
  });

  it('replay: cùng mã (cùng bước) dùng lần hai bị từ chối', async () => {
    const a = await mk('replay');
    const { secret } = await enable2fa(a);
    const c = code(secret);
    expect((await step2(await step1(a), { code: c })).status).toBe(200);
    const again = await step2(await step1(a), { code: c });
    expect(again.status).toBe(401);
    expect(errCode(again)).toBe('TWO_FACTOR_INVALID');
    // bước trước đó (nhỏ hơn) cũng bị từ chối; bước kế tiếp thì được
    expect((await step2(await step1(a), { code: code(secret, -1) })).status).toBe(401);
    expect((await step2(await step1(a), { code: code(secret, 1) })).status).toBe(200);
  });

  it('mã dự phòng dùng một lần (không phân biệt hoa thường, bỏ gạch ngang), có audit', async () => {
    const a = await mk('backup');
    const { backupCodes } = await enable2fa(a);
    const mine = backupCodes[0]!;
    const r = await step2(await step1(a), { backupCode: mine.toLowerCase().replace('-', '') });
    expect(r.status).toBe(200);
    expect(r.headers['set-cookie']).toBeDefined();
    const again = await step2(await step1(a), { backupCode: mine });
    expect(again.status).toBe(401);
    expect(errCode(again)).toBe('TWO_FACTOR_INVALID');
    // mã khác vẫn dùng được
    expect((await step2(await step1(a), { backupCode: backupCodes[1]! })).status).toBe(200);

    const used = await prisma.twoFactorBackupCode.count({
      where: { userId: a.id, usedAt: { not: null } },
    });
    expect(used).toBe(2);
    const audit = await prisma.auditLog.findMany({
      where: { entityId: a.id, action: 'user.2fa.backup_used' },
    });
    expect(audit).toHaveLength(2);
    expect(JSON.stringify(audit)).not.toContain(mine);
  });

  it('phải gửi đúng một trong code / backupCode; token thiếu/sai', async () => {
    const a = await mk('shape');
    const { secret } = await enable2fa(a);
    const token = await step1(a);
    expect((await step2(token, {})).status).toBe(400);
    expect((await step2(token, { code: code(secret), backupCode: 'AAAAA-AAAAA' })).status).toBe(
      400,
    );
    expect((await step2(token, { code: 'abcdef' })).status).toBe(400);
    const unknown = await step2('khong-ton-tai', { code: code(secret) });
    expect(unknown.status).toBe(401);
    expect(errCode(unknown)).toBe('TWO_FACTOR_CHALLENGE_INVALID');
  });

  it('sai 5 lần: thử thách bị vô hiệu (kể cả mã đúng) và tài khoản bị khóa tạm theo failedLoginCount', async () => {
    const a = await mk('brute');
    const { secret } = await enable2fa(a);
    const token = await step1(a);
    const good = code(secret);
    const wrong = good === '000000' ? '000001' : '000000';
    for (let i = 0; i < 5; i++) {
      const r = await step2(token, { code: wrong });
      expect(r.status).toBe(401);
      expect(errCode(r)).toBe('TWO_FACTOR_INVALID');
    }
    const dead = await step2(token, { code: good });
    expect(dead.status).toBe(401);
    expect(errCode(dead)).toBe('TWO_FACTOR_CHALLENGE_INVALID');

    const row = await prisma.user.findUniqueOrThrow({ where: { id: a.id } });
    expect(row.lockedUntil).not.toBeNull();
    const locked = await login(app, a.email);
    expect(locked.status).toBe(403);
    expect(errCode(locked)).toBe('ACCOUNT_LOCKED');
  });

  it('sai mã tăng failedLoginCount; bước 1 không reset; thành công mới reset', async () => {
    const a = await mk('count');
    const { secret } = await enable2fa(a);
    const wrong = wrongCode(secret);
    expect((await step2(await step1(a), { code: wrong })).status).toBe(401);
    expect((await step2(await step1(a), { code: wrong })).status).toBe(401);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: a.id } })).failedLoginCount).toBe(2);
    const t = await step1(a);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: a.id } })).failedLoginCount).toBe(2);
    expect((await step2(t, { code: code(secret) })).status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: a.id } })).failedLoginCount).toBe(0);
  });

  it('thử thách hết hạn -> TWO_FACTOR_CHALLENGE_INVALID; bước 1 mới vô hiệu thử thách cũ', async () => {
    const a = await mk('expire');
    const { secret } = await enable2fa(a);
    const old = await step1(a);
    await prisma.twoFactorChallenge.updateMany({
      where: { userId: a.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const r = await step2(old, { code: code(secret) });
    expect(r.status).toBe(401);
    expect(errCode(r)).toBe('TWO_FACTOR_CHALLENGE_INVALID');

    const first = await step1(a);
    const second = await step1(a);
    expect(errCode(await step2(first, { code: code(secret) }))).toBe(
      'TWO_FACTOR_CHALLENGE_INVALID',
    );
    expect((await step2(second, { code: code(secret) })).status).toBe(200);
  });

  it('tài khoản bị khóa (DISABLED) hoặc đã tắt 2FA giữa chừng -> từ chối bước 2', async () => {
    const a = await mk('mid');
    const { secret } = await enable2fa(a);
    const t1 = await step1(a);
    await prisma.user.update({ where: { id: a.id }, data: { status: 'DISABLED' } });
    const r = await step2(t1, { code: code(secret) });
    expect(r.status).toBe(403);
    expect(errCode(r)).toBe('ACCOUNT_DISABLED');
    await prisma.user.update({ where: { id: a.id }, data: { status: 'ACTIVE' } });

    const t2 = await step1(a);
    await prisma.user.update({
      where: { id: a.id },
      data: { twoFactorEnabledAt: null, twoFactorSecretEnc: null },
    });
    expect(errCode(await step2(t2, { code: code(secret) }))).toBe('TWO_FACTOR_CHALLENGE_INVALID');
  });

  it('người dùng chưa bật 2FA đăng nhập như cũ (phiên đầy đủ)', async () => {
    const a = await mk('plain');
    const r = await login(app, a.email);
    expect(r.status).toBe(200);
    expect(dataOf(r).accessToken).toBeTypeOf('string');
    expect(dataOf(r).user.twoFactorEnabled).toBe(false);
  });
});

describe('tắt 2FA và sinh lại mã dự phòng', () => {
  it('disable: sai mật khẩu 400; sai mã 400 (tính lockout); đúng -> 204, xóa dữ liệu, thu hồi phiên khác, audit', async () => {
    const a = await mk('disable');
    const { secret } = await enable2fa(a);
    // phiên khác có sau khi bật 2FA
    const other = dataOf(await step2(await step1(a), { code: code(secret, 1) }))
      .accessToken as string;
    expect((await meOf(other)).status).toBe(200);
    await freeStep(a.id);

    const wp = await post('/me/2fa/disable', a.token, {
      password: 'Sai-mat-khau1',
      code: code(secret),
    });
    expect(wp.status).toBe(400);
    expect(errCode(wp)).toBe('INVALID_PASSWORD');

    const wrong = wrongCode(secret);
    const wc = await post('/me/2fa/disable', a.token, { password: PW, code: wrong });
    expect(wc.status).toBe(400);
    expect(errCode(wc)).toBe('TWO_FACTOR_INVALID');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: a.id } })).failedLoginCount).toBe(1);

    const ok = await post('/me/2fa/disable', a.token, { password: PW, code: code(secret) });
    expect(ok.status).toBe(204);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: a.id } });
    expect(row.twoFactorEnabledAt).toBeNull();
    expect(row.twoFactorSecretEnc).toBeNull();
    expect(row.twoFactorPendingSecretEnc).toBeNull();
    expect(row.twoFactorLastStep).toBeNull();
    expect(await prisma.twoFactorBackupCode.count({ where: { userId: a.id } })).toBe(0);
    expect((await meOf(a.token)).status).toBe(200);
    expect((await meOf(other)).status).toBe(401);
    expect(dataOf(await meOf(a.token)).twoFactorEnabled).toBe(false);
    expect(
      await prisma.auditLog.count({ where: { entityId: a.id, action: 'user.2fa.disable' } }),
    ).toBe(1);

    const plain = await login(app, a.email);
    expect(plain.status).toBe(200);
    expect(dataOf(plain).accessToken).toBeTypeOf('string');

    const again = await post('/me/2fa/disable', a.token, { password: PW, code: '123456' });
    expect(again.status).toBe(409);
    expect(errCode(again)).toBe('TWO_FACTOR_NOT_ENABLED');
  });

  it('disable bằng mã dự phòng', async () => {
    const a = await mk('disable-bk');
    const { backupCodes } = await enable2fa(a);
    const r = await post('/me/2fa/disable', a.token, { password: PW, code: backupCodes[3]! });
    expect(r.status).toBe(204);
  });

  it('backup-codes: sinh lại 10 mã, mã cũ vô hiệu, mã mới dùng được, có audit; không thu hồi phiên', async () => {
    const a = await mk('regen');
    const { secret, backupCodes: oldCodes } = await enable2fa(a);
    const other = dataOf(await step2(await step1(a), { code: code(secret, 1) }))
      .accessToken as string;
    await freeStep(a.id);

    const bad = await post('/me/2fa/backup-codes', a.token, {
      password: PW,
      code: wrongCode(secret),
    });
    expect(bad.status).toBe(400);
    expect(errCode(bad)).toBe('TWO_FACTOR_INVALID');

    const r = await post('/me/2fa/backup-codes', a.token, { password: PW, code: code(secret) });
    expect(r.status).toBe(200);
    const fresh = dataOf(r).backupCodes as string[];
    expect(fresh).toHaveLength(10);
    expect(fresh.filter((c) => oldCodes.includes(c))).toHaveLength(0);
    expect(await prisma.twoFactorBackupCode.count({ where: { userId: a.id } })).toBe(10);
    expect((await meOf(other)).status).toBe(200);

    const oldTry = await step2(await step1(a), { backupCode: oldCodes[0]! });
    expect(errCode(oldTry)).toBe('TWO_FACTOR_INVALID');
    expect((await step2(await step1(a), { backupCode: fresh[0]! })).status).toBe(200);
    expect(
      await prisma.auditLog.count({
        where: { entityId: a.id, action: 'user.2fa.backup_regenerate' },
      }),
    ).toBe(1);

    await prisma.user.update({
      where: { id: a.id },
      data: { twoFactorEnabledAt: null, twoFactorSecretEnc: null },
    });
    const notOn = await post('/me/2fa/backup-codes', a.token, { password: PW, code: '123456' });
    expect(errCode(notOn)).toBe('TWO_FACTOR_NOT_ENABLED');
  });
});

describe('admin đặt lại 2FA của người dùng khác', () => {
  const reset = (id: string, token: string) =>
    request(app).post(`${API}/admin/users/${id}/2fa/reset`).set(bearer(token));

  it('ADMIN 200: tắt 2FA, thu hồi mọi phiên, xóa mã dự phòng, audit; STAFF 403; tự reset 409; chưa bật 409; id lạ 404', async () => {
    const admin = await mk('adm', 'ADMIN');
    const staff = await mk('adm-staff', 'STAFF');
    const target = await mk('adm-target', 'STAFF');
    const { secret } = await enable2fa(target);
    const targetSession = dataOf(await step2(await step1(target), { code: code(secret, 1) }))
      .accessToken as string;
    expect((await meOf(targetSession)).status).toBe(200);

    const listBefore = await request(app)
      .get(`${API}/admin/users/${target.id}`)
      .set(bearer(admin.token));
    expect(dataOf(listBefore).twoFactorEnabled).toBe(true);
    const list = await request(app)
      .get(`${API}/admin/users`)
      .query({ q: target.email })
      .set(bearer(admin.token));
    expect(dataOf(list)[0].twoFactorEnabled).toBe(true);

    expect((await reset(target.id, staff.token)).status).toBe(403);
    const self = await reset(admin.id, admin.token);
    expect(self.status).toBe(409);
    expect(errCode(self)).toBe('CANNOT_MODIFY_SELF');
    expect((await reset('khong-ton-tai-id', admin.token)).status).toBe(404);
    expect((await reset(staff.id, admin.token)).status).toBe(409);

    const ok = await reset(target.id, admin.token);
    expect(ok.status).toBe(200);
    expect(dataOf(ok).twoFactorEnabled).toBe(false);
    expect((await meOf(targetSession)).status).toBe(401);
    expect((await meOf(target.token)).status).toBe(401);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(row.twoFactorEnabledAt).toBeNull();
    expect(row.twoFactorSecretEnc).toBeNull();
    expect(await prisma.twoFactorBackupCode.count({ where: { userId: target.id } })).toBe(0);
    expect(await prisma.twoFactorChallenge.count({ where: { userId: target.id } })).toBe(0);
    const audit = await prisma.auditLog.findMany({
      where: { entityId: target.id, action: 'user.2fa.reset' },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]!.actorId).toBe(admin.id);

    // Sau reset: đăng nhập thường (không còn bước 2)
    const plain = await login(app, target.email);
    expect(dataOf(plain).accessToken).toBeTypeOf('string');
  });
});

describe('dọn dẹp và nguồn gốc', () => {
  it('job dọn dẹp xóa thử thách hết hạn, giữ thử thách còn hạn', async () => {
    const a = await mk('clean');
    await enable2fa(a);
    await step1(a);
    await prisma.twoFactorChallenge.create({
      data: {
        userId: a.id,
        tokenHash: sha256Hex('het-han-ttfa'),
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    const r = await runCleanupOnce(new Date());
    expect(r.skipped).toBe(false);
    if (!r.skipped) expect(r.twoFactorChallenges).toBeGreaterThanOrEqual(1);
    const left = await prisma.twoFactorChallenge.findMany({ where: { userId: a.id } });
    expect(left).toHaveLength(1);
    expect(left[0]!.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('response bước 1 và bước 2 mang Cache-Control no-store', async () => {
    const a = await mk('hdr');
    const { secret } = await enable2fa(a);
    const r1 = await login(app, a.email);
    expect(r1.headers['cache-control']).toMatch(/no-store/);
    const r2 = await step2(dataOf(r1).challengeToken as string, { code: code(secret) });
    expect(r2.headers['cache-control']).toMatch(/no-store/);
  });
});
