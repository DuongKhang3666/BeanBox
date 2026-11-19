import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../src/config/env.js';

const DEV_SECRET = 'dev-' + 'a'.repeat(40);
const GOOD_SECRET = 'Zq7' + 'k9'.repeat(20);
const base = { DATABASE_URL: 'x' } as NodeJS.ProcessEnv;

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
