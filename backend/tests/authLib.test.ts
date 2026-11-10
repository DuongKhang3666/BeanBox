import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { parseEnv, parseTrustProxy, ttlToSeconds } from '../src/config/env.js';
import { escapeHtml } from '../src/lib/mailer.js';
import {
  hashPassword,
  passwordSchema,
  verifyDummyPassword,
  verifyPassword,
} from '../src/lib/password.js';
import { normalizePhone, phoneSchema } from '../src/lib/phone.js';
import {
  generateOpaqueToken,
  sha256Hex,
  signAccessToken,
  verifyAccessToken,
} from '../src/lib/tokens.js';

describe('normalizePhone', () => {
  it.each([
    ['0901234567', '0901234567'],
    ['090 123 4567', '0901234567'],
    ['090.123.4567', '0901234567'],
    ['+84 901-234-567', '0901234567'],
    ['  0351234567 ', '0351234567'],
  ])('chấp nhận %s', (input, out) => {
    expect(normalizePhone(input)).toBe(out);
  });

  it.each([
    '0101234567',
    '0201234567',
    '0401234567',
    '0601234567',
    '090123456',
    '09012345678',
    '090abc4567',
    '84901234567',
    '',
    '   ',
    '+840901234567',
  ])('từ chối %j', (input) => {
    expect(normalizePhone(input)).toBeNull();
  });

  it('phoneSchema chuẩn hóa và báo lỗi tiếng Việt', () => {
    expect(phoneSchema.parse('+84 901 234 567')).toBe('0901234567');
    const r = phoneSchema.safeParse('123');
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('Số điện thoại không hợp lệ');
  });
});

describe('passwordSchema', () => {
  const ok = (s: string) => passwordSchema.safeParse(s).success;
  it('biên độ dài 7/8/72/73', () => {
    expect(ok('abcde1f')).toBe(false);
    expect(ok('abcdef12')).toBe(true);
    expect(ok('a1' + 'x'.repeat(70))).toBe(true);
    expect(ok('a1' + 'x'.repeat(71))).toBe(false);
  });
  it('cần chữ và số', () => {
    expect(ok('12345678')).toBe(false);
    expect(ok('abcdefgh')).toBe(false);
  });
  it('chữ có dấu tiếng Việt tính là chữ', () => {
    expect(ok('ếếếếếếế1')).toBe(true);
  });
});

describe('password hash', () => {
  it('hash/verify đúng, sai, và hash lỗi định dạng không ném', async () => {
    const h = await hashPassword('Matkhau123');
    expect(h.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(h, 'Matkhau123')).toBe(true);
    expect(await verifyPassword(h, 'sai')).toBe(false);
    expect(await verifyPassword('not-a-hash', 'x')).toBe(false);
    await expect(verifyDummyPassword('x')).resolves.toBeUndefined();
  });
});

describe('tokens', () => {
  const secret = new TextEncoder().encode(process.env.JWT_ACCESS_SECRET);
  const claims = { sub: 'u1', role: 'CUSTOMER' as const, sid: 's1' };

  it('opaque token và sha256', () => {
    const t = generateOpaqueToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(t).not.toBe(generateOpaqueToken());
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('sign/verify ok', async () => {
    const t = await signAccessToken(claims);
    expect(await verifyAccessToken(t)).toMatchObject(claims);
  });

  const forge = (opts: {
    iss?: string;
    aud?: string;
    exp?: string | number;
    role?: string;
    key?: Uint8Array;
  }) =>
    new SignJWT({ role: opts.role ?? 'CUSTOMER', sid: 's1' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('u1')
      .setIssuer(opts.iss ?? 'beanbox-api')
      .setAudience(opts.aud ?? 'beanbox-web')
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? '5m')
      .sign(opts.key ?? secret);

  it('từ chối token hết hạn', async () => {
    const t = await forge({ exp: Math.floor(Date.now() / 1000) - 60 });
    await expect(verifyAccessToken(t)).rejects.toThrow();
  });
  it('từ chối chữ ký sai', async () => {
    const key = new TextEncoder().encode('another-secret-0123456789abcdefghijkl');
    await expect(verifyAccessToken(await forge({ key }))).rejects.toThrow();
  });
  it('từ chối alg none', async () => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const t = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
      sub: 'u1',
      role: 'ADMIN',
      sid: 's',
      iss: 'beanbox-api',
      aud: 'beanbox-web',
      exp: Math.floor(Date.now() / 1000) + 300,
    })}.`;
    await expect(verifyAccessToken(t)).rejects.toThrow();
  });
  it('từ chối sai iss/aud/role', async () => {
    await expect(verifyAccessToken(await forge({ iss: 'x' }))).rejects.toThrow();
    await expect(verifyAccessToken(await forge({ aud: 'x' }))).rejects.toThrow();
    await expect(verifyAccessToken(await forge({ role: 'ROOT' }))).rejects.toThrow();
  });
});

describe('env helpers', () => {
  it('parseTrustProxy', () => {
    expect(parseTrustProxy('false')).toBe(false);
    expect(parseTrustProxy('1')).toBe(1);
    expect(parseTrustProxy('0')).toBe(0);
    expect(parseTrustProxy('loopback')).toBe('loopback');
    expect(parseTrustProxy('loopback, 10.0.0.0/8')).toBe('loopback,10.0.0.0/8');
    expect(() => parseTrustProxy('true')).toThrow(/TRUST_PROXY/);
  });
  it('ttlToSeconds', () => {
    expect(ttlToSeconds('15m')).toBe(900);
    expect(ttlToSeconds('30s')).toBe(30);
    expect(ttlToSeconds('2h')).toBe(7200);
  });
  it('parseEnv tính COOKIE_SECURE, accessTokenTtlSec, mặc định', () => {
    const base = { DATABASE_URL: 'x', JWT_ACCESS_SECRET: 'x'.repeat(32) } as NodeJS.ProcessEnv;
    const dev = parseEnv({ ...base, NODE_ENV: 'development' });
    expect(dev).toMatchObject({
      HOST: '127.0.0.1',
      TRUST_PROXY: 'loopback',
      COOKIE_SECURE: false,
      accessTokenTtlSec: 900,
      WEB_APP_URL: 'http://localhost:3000',
    });
    expect(parseEnv({ ...base, NODE_ENV: 'production' }).COOKIE_SECURE).toBe(true);
    const off = parseEnv({ ...base, NODE_ENV: 'production', COOKIE_SECURE: 'false' });
    expect(off.COOKIE_SECURE).toBe(false);
  });
});

describe('escapeHtml', () => {
  it('escape ký tự đặc biệt', () => {
    expect(escapeHtml('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  });
});
