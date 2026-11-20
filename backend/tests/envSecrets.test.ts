import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../src/config/env.js';

const DEV_SECRET = 'dev-' + 'a'.repeat(40);
const GOOD_SECRET = 'Zq7' + 'k9'.repeat(20);
const base = { DATABASE_URL: 'x' } as NodeJS.ProcessEnv;
const baseOk = { ...base, JWT_ACCESS_SECRET: GOOD_SECRET } as NodeJS.ProcessEnv;

/** parseEnv gọi process.exit(1) khi lỗi: chặn để kiểm tra. */
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

describe('parseEnv: COOKIE_SECURE ở production (B3)', () => {
  const prod = {
    ...base,
    NODE_ENV: 'production',
    JWT_ACCESS_SECRET: GOOD_SECRET,
    INTERNAL_API_SECRET: GOOD_SECRET,
  } as NodeJS.ProcessEnv;

  it('production + COOKIE_SECURE=false -> lỗi cấu hình, không in secret', () => {
    const msg = expectRejected({ ...prod, COOKIE_SECURE: 'false' });
    expect(msg).toContain('COOKIE_SECURE');
    expect(msg).not.toContain(GOOD_SECRET);
  });
  it('production + COOKIE_SECURE=true hoặc bỏ trống -> true', () => {
    expect(parseEnv({ ...prod, COOKIE_SECURE: 'true' }).COOKIE_SECURE).toBe(true);
    expect(parseEnv(prod).COOKIE_SECURE).toBe(true);
  });
  it('development + COOKIE_SECURE=false vẫn ok', () => {
    expect(
      parseEnv({
        ...base,
        NODE_ENV: 'development',
        JWT_ACCESS_SECRET: GOOD_SECRET,
        COOKIE_SECURE: 'false',
      }).COOKIE_SECURE,
    ).toBe(false);
  });
});

describe('parseEnv: AUTH_RATE_LIMIT_PER_MIN (B4)', () => {
  it('mặc định 5; đọc được từ env; không hợp lệ -> lỗi', () => {
    expect(parseEnv({ ...baseOk }).AUTH_RATE_LIMIT_PER_MIN).toBe(5);
    expect(parseEnv({ ...baseOk, AUTH_RATE_LIMIT_PER_MIN: '30' }).AUTH_RATE_LIMIT_PER_MIN).toBe(30);
    expect(expectRejected({ ...baseOk, AUTH_RATE_LIMIT_PER_MIN: '0' })).toContain(
      'AUTH_RATE_LIMIT_PER_MIN',
    );
    expectRejected({ ...baseOk, AUTH_RATE_LIMIT_PER_MIN: 'abc' });
  });
});

describe('parseEnv: secret mẫu "dev-"', () => {
  it('production + JWT_ACCESS_SECRET dev- -> lỗi, không in giá trị', () => {
    const msg = expectRejected({ ...base, NODE_ENV: 'production', JWT_ACCESS_SECRET: DEV_SECRET });
    expect(msg).toContain('JWT_ACCESS_SECRET');
    expect(msg).not.toContain(DEV_SECRET);
  });

  it('production + INTERNAL_API_SECRET dev- -> lỗi, không in giá trị', () => {
    const msg = expectRejected({
      ...base,
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: GOOD_SECRET,
      INTERNAL_API_SECRET: DEV_SECRET,
    });
    expect(msg).toContain('INTERNAL_API_SECRET');
    expect(msg).not.toContain(DEV_SECRET);
  });

  it('development + dev- -> ok', () => {
    const e = parseEnv({
      ...base,
      NODE_ENV: 'development',
      JWT_ACCESS_SECRET: DEV_SECRET,
      INTERNAL_API_SECRET: DEV_SECRET,
    });
    expect(e.JWT_ACCESS_SECRET).toBe(DEV_SECRET);
  });

  it('production + secret ngẫu nhiên -> ok', () => {
    const e = parseEnv({
      ...base,
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: GOOD_SECRET,
      INTERNAL_API_SECRET: GOOD_SECRET,
    });
    expect(e.NODE_ENV).toBe('production');
  });
});
