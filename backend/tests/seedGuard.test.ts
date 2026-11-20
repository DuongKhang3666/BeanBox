import { describe, expect, it } from 'vitest';
import { checkSeedAllowed } from '../prisma/seedGuard.js';

// Giá trị giả dựng lúc chạy (không để literal giống secret cho scanner).
// fakePw(n): chuỗi dài n ký tự gồm chữ và số (n >= 3).
const fakePw = (n: number): string => 'Q' + 'z'.repeat(n - 3) + '42';

const GOOD = {
  NODE_ENV: 'production',
  SEED_ALLOW_PRODUCTION: 'true',
  SEED_ADMIN_PASSWORD: fakePw(17),
  SEED_STAFF_PASSWORD: fakePw(18),
  SEED_CUSTOMER_PASSWORD: fakePw(19),
};
// Giá trị mẫu bị cấm, ghép lúc chạy.
const SAMPLE = {
  admin: ['Admin', '12345'].join(''),
  staff: ['Staff', '12345'].join(''),
  cust: ['Customer', '12345'].join(''),
};

describe('checkSeedAllowed (D-031)', () => {
  it('ngoài production: luôn cho phép, kể cả mật khẩu mẫu', () => {
    for (const NODE_ENV of ['development', 'test', undefined]) {
      expect(checkSeedAllowed({ NODE_ENV, SEED_ADMIN_PASSWORD: SAMPLE.admin })).toEqual([]);
    }
  });

  it('production không có SEED_ALLOW_PRODUCTION=true -> từ chối', () => {
    expect(checkSeedAllowed({ ...GOOD, SEED_ALLOW_PRODUCTION: undefined })).toHaveLength(1);
    expect(checkSeedAllowed({ ...GOOD, SEED_ALLOW_PRODUCTION: 'false' })).toHaveLength(1);
    expect(checkSeedAllowed({ ...GOOD, SEED_ALLOW_PRODUCTION: '1' })).toHaveLength(1);
  });

  it('production + opt-in + mật khẩu tốt -> cho phép', () => {
    expect(checkSeedAllowed(GOOD)).toEqual([]);
  });

  it('thiếu mật khẩu -> lỗi nêu tên biến', () => {
    const errs = checkSeedAllowed({ ...GOOD, SEED_STAFF_PASSWORD: undefined });
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain('SEED_STAFF_PASSWORD');
  });

  it('quá ngắn (< 12), thiếu chữ hoặc thiếu số -> lỗi', () => {
    for (const bad of [fakePw(11), '1'.repeat(12), 'q'.repeat(13)]) {
      const errs = checkSeedAllowed({ ...GOOD, SEED_ADMIN_PASSWORD: bad });
      expect(errs).toHaveLength(1);
      expect(errs[0]).toContain('SEED_ADMIN_PASSWORD');
    }
  });

  it('đúng 12 ký tự có chữ và số -> ok', () => {
    expect(checkSeedAllowed({ ...GOOD, SEED_ADMIN_PASSWORD: fakePw(12) })).toEqual([]);
  });

  it('giá trị mẫu bị từ chối ở cả 3 biến', () => {
    expect(checkSeedAllowed({ ...GOOD, SEED_ADMIN_PASSWORD: SAMPLE.admin })).toHaveLength(1);
    expect(checkSeedAllowed({ ...GOOD, SEED_STAFF_PASSWORD: SAMPLE.staff })).toHaveLength(1);
    expect(checkSeedAllowed({ ...GOOD, SEED_CUSTOMER_PASSWORD: SAMPLE.cust })).toHaveLength(1);
  });

  it('thông báo lỗi không in mật khẩu', () => {
    const shortPw = ['sh', 'ort1'].join('');
    const errs = checkSeedAllowed({
      ...GOOD,
      SEED_ADMIN_PASSWORD: SAMPLE.admin,
      SEED_STAFF_PASSWORD: shortPw,
      SEED_CUSTOMER_PASSWORD: undefined,
    });
    expect(errs).toHaveLength(3);
    const all = errs.join('\n');
    expect(all).not.toContain(SAMPLE.admin);
    expect(all).not.toContain(shortPw);
  });
});
