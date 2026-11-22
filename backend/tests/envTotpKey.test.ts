import { afterEach, describe, expect, it, vi } from 'vitest';
import { TOTP_DEV_KEY_PREFIX, parseEnv, parseTotpKey } from '../src/config/env.js';

/** D-063: TOTP_ENCRYPTION_KEY (khóa AES-256 cho secret 2FA). */

const GOOD_SECRET = 'Zq7' + 'k9'.repeat(20);
const base = { DATABASE_URL: 'x', JWT_ACCESS_SECRET: GOOD_SECRET } as NodeJS.ProcessEnv;
const prod = {
  ...base,
  NODE_ENV: 'production',
  INTERNAL_API_SECRET: GOOD_SECRET,
} as NodeJS.ProcessEnv;
const HEX = 'a1'.repeat(32);
const B64 = Buffer.alloc(32, 0x5a).toString('base64');
const B64URL = Buffer.from(Array.from({ length: 32 }, (_, i) => 250 - i)).toString('base64url');
// Khóa mẫu dev của .env.example (32 byte ASCII bắt đầu bằng "beanbox-dev-").
const DEV_SAMPLE_B64 = Buffer.from('beanbox-dev-totp-key-localhost!!').toString('base64');

function expectRejected(source: NodeJS.ProcessEnv): string {
  vi.restoreAllMocks(); // spy mới cho mỗi lần gọi (mock.calls[0] là của lần này)
  vi.spyOn(process, 'exit').mockImplementation((() => {
    throw new Error('exit');
  }) as never);
  const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  expect(() => parseEnv(source)).toThrow('exit');
  return String(err.mock.calls[0]?.[0] ?? '');
}

afterEach(() => vi.restoreAllMocks());

describe('parseTotpKey', () => {
  it('nhận hex 64 ký tự, base64 (có/không padding) và base64url giải mã ra 32 byte', () => {
    expect(parseTotpKey(HEX)).toHaveLength(32);
    expect(parseTotpKey(B64)).toHaveLength(32);
    expect(parseTotpKey(B64.replace(/=+$/, ''))).toHaveLength(32);
    expect(parseTotpKey(B64URL)).toHaveLength(32);
    expect(parseTotpKey(`  ${HEX}  `)).toHaveLength(32);
    expect(parseTotpKey(DEV_SAMPLE_B64).toString('utf8')).toBe('beanbox-dev-totp-key-localhost!!');
  });

  it('sai độ dài / ký tự lạ -> lỗi, thông báo không chứa giá trị khóa', () => {
    for (const bad of ['', 'abc', 'a1'.repeat(31), 'a1'.repeat(33), '!'.repeat(44), 'x y']) {
      expect(() => parseTotpKey(bad)).toThrow(/TOTP_ENCRYPTION_KEY/);
    }
    try {
      parseTotpKey('a1'.repeat(31));
    } catch (e) {
      expect((e as Error).message).not.toContain('a1a1');
    }
  });
});

describe('parseEnv: TOTP_ENCRYPTION_KEY', () => {
  it('không bắt buộc ở dev/test (undefined); có thì thành Buffer 32 byte', () => {
    expect(parseEnv({ ...base, NODE_ENV: 'development' }).TOTP_ENCRYPTION_KEY).toBeUndefined();
    const e = parseEnv({ ...base, NODE_ENV: 'development', TOTP_ENCRYPTION_KEY: HEX });
    expect(Buffer.isBuffer(e.TOTP_ENCRYPTION_KEY)).toBe(true);
    expect(e.TOTP_ENCRYPTION_KEY).toHaveLength(32);
    // chuỗi rỗng coi như chưa đặt
    expect(parseEnv({ ...base, TOTP_ENCRYPTION_KEY: '' }).TOTP_ENCRYPTION_KEY).toBeUndefined();
  });

  it('giá trị sai ở mọi môi trường -> từ chối, không in khóa', () => {
    const msg = expectRejected({ ...base, TOTP_ENCRYPTION_KEY: 'khong-hop-le' });
    expect(msg).toContain('TOTP_ENCRYPTION_KEY');
    expect(msg).not.toContain('khong-hop-le');
  });

  it('production: thiếu khóa -> từ chối; khóa mẫu dev (hex hay base64) -> từ chối; khóa ngẫu nhiên -> ok', () => {
    expect(expectRejected(prod)).toContain('TOTP_ENCRYPTION_KEY');
    const dev64 = expectRejected({ ...prod, TOTP_ENCRYPTION_KEY: DEV_SAMPLE_B64 });
    expect(dev64).toContain('giá trị mẫu');
    expect(dev64).not.toContain(DEV_SAMPLE_B64);
    const devHex = expectRejected({
      ...prod,
      TOTP_ENCRYPTION_KEY: Buffer.from('beanbox-dev-totp-key-localhost!!').toString('hex'),
    });
    expect(devHex).toContain('giá trị mẫu');
    expect(TOTP_DEV_KEY_PREFIX).toBe('beanbox-dev-');
    expect(parseEnv({ ...prod, TOTP_ENCRYPTION_KEY: B64 }).TOTP_ENCRYPTION_KEY).toHaveLength(32);
  });
});
