import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../src/config/env.js';

/** Biến mới của Đợt 1: GUEST_COD_* (D-057), DATABASE_POOL_MAX/ANALYTICS_* (D-058). */

const GOOD_SECRET = 'Zq7' + 'k9'.repeat(20);
const base = { DATABASE_URL: 'x', JWT_ACCESS_SECRET: GOOD_SECRET } as NodeJS.ProcessEnv;

function expectRejected(source: NodeJS.ProcessEnv): string {
  vi.spyOn(process, 'exit').mockImplementation((() => {
    throw new Error('exit');
  }) as never);
  const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  expect(() => parseEnv(source)).toThrow('exit');
  return String(err.mock.calls[0]?.[0] ?? '');
}

afterEach(() => vi.restoreAllMocks());

describe('parseEnv: giá trị mặc định', () => {
  it('đúng mặc định đã chốt', () => {
    const e = parseEnv({ ...base });
    expect(e.GUEST_COD_HOLD_HOURS).toBe(48);
    expect(e.GUEST_COD_MAX_OPEN).toBe(3);
    expect(e.DATABASE_POOL_MAX).toBe(10);
    expect(e.ANALYTICS_POOL_MAX).toBe(4);
    expect(e.ANALYTICS_STATEMENT_TIMEOUT_MS).toBe(15000);
  });

  it('chuỗi rỗng coi như chưa đặt', () => {
    const e = parseEnv({ ...base, GUEST_COD_HOLD_HOURS: '', ANALYTICS_POOL_MAX: '' });
    expect(e.GUEST_COD_HOLD_HOURS).toBe(48);
    expect(e.ANALYTICS_POOL_MAX).toBe(4);
  });

  it('nhận giá trị hợp lệ ở biên', () => {
    const e = parseEnv({
      ...base,
      GUEST_COD_HOLD_HOURS: '720',
      GUEST_COD_MAX_OPEN: '1',
      ANALYTICS_STATEMENT_TIMEOUT_MS: '1000',
      DATABASE_POOL_MAX: '20',
    });
    expect(e).toMatchObject({
      GUEST_COD_HOLD_HOURS: 720,
      GUEST_COD_MAX_OPEN: 1,
      ANALYTICS_STATEMENT_TIMEOUT_MS: 1000,
      DATABASE_POOL_MAX: 20,
    });
    expect(parseEnv({ ...base, GUEST_COD_HOLD_HOURS: '1' }).GUEST_COD_HOLD_HOURS).toBe(1);
    expect(
      parseEnv({ ...base, ANALYTICS_STATEMENT_TIMEOUT_MS: '120000' })
        .ANALYTICS_STATEMENT_TIMEOUT_MS,
    ).toBe(120000);
  });
});

describe('parseEnv: ngoài phạm vi -> lỗi nêu tên biến', () => {
  it.each([
    ['GUEST_COD_HOLD_HOURS', '0'],
    ['GUEST_COD_HOLD_HOURS', '721'],
    ['GUEST_COD_HOLD_HOURS', '1.5'],
    ['GUEST_COD_MAX_OPEN', '0'],
    ['GUEST_COD_MAX_OPEN', 'abc'],
    ['DATABASE_POOL_MAX', '0'],
    ['ANALYTICS_POOL_MAX', '0'],
    ['ANALYTICS_STATEMENT_TIMEOUT_MS', '999'],
    ['ANALYTICS_STATEMENT_TIMEOUT_MS', '120001'],
  ])('%s=%s', (name, value) => {
    expect(expectRejected({ ...base, [name]: value })).toContain(name);
  });
});
