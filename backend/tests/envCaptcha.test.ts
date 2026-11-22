import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../src/config/env.js';

const GOOD_SECRET = 'Zq7' + 'k9'.repeat(20);
const base = { DATABASE_URL: 'x', JWT_ACCESS_SECRET: GOOD_SECRET } as NodeJS.ProcessEnv;
const SITE = 'site-key-fake-value';
const SECRET = 'secret-key-fake-value';

function expectRejected(source: NodeJS.ProcessEnv): string {
  const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
    throw new Error('exit');
  }) as never);
  const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    expect(() => parseEnv(source)).toThrow('exit');
    expect(exit).toHaveBeenCalledWith(1);
    return String(err.mock.calls[0]?.[0] ?? '');
  } finally {
    exit.mockRestore();
    err.mockRestore();
  }
}

afterEach(() => vi.restoreAllMocks());

describe('parseEnv: Turnstile (D-028)', () => {
  it('không đặt cả hai -> tắt, ok', () => {
    const e = parseEnv({ ...base });
    expect(e.TURNSTILE_SITE_KEY).toBeUndefined();
    expect(e.TURNSTILE_SECRET_KEY).toBeUndefined();
  });

  it('chuỗi rỗng coi như chưa đặt', () => {
    expect(() =>
      parseEnv({ ...base, TURNSTILE_SITE_KEY: '', TURNSTILE_SECRET_KEY: '' }),
    ).not.toThrow();
  });

  it('đủ cả hai -> ok', () => {
    const e = parseEnv({ ...base, TURNSTILE_SITE_KEY: SITE, TURNSTILE_SECRET_KEY: SECRET });
    expect(e.TURNSTILE_SITE_KEY).toBe(SITE);
    expect(e.TURNSTILE_SECRET_KEY).toBe(SECRET);
  });

  it('chỉ có SITE_KEY -> lỗi nêu tên biến thiếu, không in giá trị', () => {
    const msg = expectRejected({ ...base, TURNSTILE_SITE_KEY: SITE });
    expect(msg).toContain('TURNSTILE_SECRET_KEY');
    expect(msg).not.toContain(SITE);
  });

  it('chỉ có SECRET_KEY -> lỗi nêu tên biến thiếu, không in giá trị', () => {
    const msg = expectRejected({ ...base, TURNSTILE_SECRET_KEY: SECRET });
    expect(msg).toContain('TURNSTILE_SITE_KEY');
    expect(msg).not.toContain(SECRET);
  });
});

describe('parseEnv: CONTACT_RETENTION_DAYS (D-029)', () => {
  it('mặc định 365', () => {
    expect(parseEnv({ ...base }).CONTACT_RETENTION_DAYS).toBe(365);
  });
  it('0 hợp lệ (tắt)', () => {
    expect(parseEnv({ ...base, CONTACT_RETENTION_DAYS: '0' }).CONTACT_RETENTION_DAYS).toBe(0);
  });
  it('số âm, số thập phân, chữ -> lỗi', () => {
    for (const v of ['-1', '1.5', 'abc']) {
      expect(expectRejected({ ...base, CONTACT_RETENTION_DAYS: v })).toContain(
        'CONTACT_RETENTION_DAYS',
      );
    }
  });
});

describe('parseEnv: INTERNAL_API_SECRET ở production', () => {
  it('production thiếu INTERNAL_API_SECRET -> lỗi', () => {
    expect(expectRejected({ ...base, NODE_ENV: 'production' })).toContain('INTERNAL_API_SECRET');
  });
  it('production có INTERNAL_API_SECRET -> ok', () => {
    expect(() =>
      parseEnv({
        ...base,
        NODE_ENV: 'production',
        INTERNAL_API_SECRET: GOOD_SECRET,
        TOTP_ENCRYPTION_KEY: 'a1'.repeat(32),
      }),
    ).not.toThrow();
  });
  it('development thiếu INTERNAL_API_SECRET -> ok', () => {
    expect(() => parseEnv({ ...base, NODE_ENV: 'development' })).not.toThrow();
  });
});
