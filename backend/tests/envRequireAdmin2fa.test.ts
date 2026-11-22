import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../src/config/env.js';

/** D-070: REQUIRE_ADMIN_2FA mặc định false ở mọi môi trường, chỉ nhận true/false. */

const GOOD_SECRET = 'Zq7' + 'k9'.repeat(20);
const base = { DATABASE_URL: 'x', JWT_ACCESS_SECRET: GOOD_SECRET } as NodeJS.ProcessEnv;
const prod = {
  ...base,
  NODE_ENV: 'production',
  INTERNAL_API_SECRET: GOOD_SECRET,
  TOTP_ENCRYPTION_KEY: 'a1'.repeat(32),
} as NodeJS.ProcessEnv;

afterEach(() => vi.restoreAllMocks());

describe('parseEnv: REQUIRE_ADMIN_2FA', () => {
  it('mặc định false (dev, test, production); chuỗi rỗng coi như chưa đặt', () => {
    expect(parseEnv({ ...base, NODE_ENV: 'development' }).REQUIRE_ADMIN_2FA).toBe(false);
    expect(parseEnv({ ...base, NODE_ENV: 'test' }).REQUIRE_ADMIN_2FA).toBe(false);
    expect(parseEnv(prod).REQUIRE_ADMIN_2FA).toBe(false);
    expect(parseEnv({ ...base, REQUIRE_ADMIN_2FA: '' }).REQUIRE_ADMIN_2FA).toBe(false);
  });

  it('true bật, false tắt (kể cả production)', () => {
    expect(parseEnv({ ...base, REQUIRE_ADMIN_2FA: 'true' }).REQUIRE_ADMIN_2FA).toBe(true);
    expect(parseEnv({ ...prod, REQUIRE_ADMIN_2FA: 'true' }).REQUIRE_ADMIN_2FA).toBe(true);
    expect(parseEnv({ ...base, REQUIRE_ADMIN_2FA: 'false' }).REQUIRE_ADMIN_2FA).toBe(false);
  });

  it('giá trị lạ bị từ chối (không âm thầm hiểu là tắt)', () => {
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => parseEnv({ ...base, REQUIRE_ADMIN_2FA: 'yes' })).toThrow('exit');
    expect(String(err.mock.calls[0]?.[0])).toContain('REQUIRE_ADMIN_2FA');
  });
});
