import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SEED_ADDRESSES } from '../prisma/seed-data/addresses.js';
import { AppError } from '../src/lib/errors.js';
import {
  buildLocationIndex,
  EXPECTED_PROVINCE_COUNT,
  EXPECTED_WARD_COUNT,
  getProvince,
  loadLocations,
  resolveLocation,
} from '../src/modules/locations/locations.data.js';

const DATA_FILE = path.resolve(import.meta.dirname, '..', 'data', 'provinces-wards.json');
/**
 * SHA-256 ghim của file hiện tại, để phát hiện file bị thay đổi ngoài ý muốn.
 * Khi chủ ý thay file: kiểm lại dữ liệu, rồi cập nhật hằng số này và EXPECTED_* trong locations.data.ts.
 */
const PINNED_SHA256 = '481c2a793f8fb931241185cac38acf5ca7ccfb0a56192e8155ae461971c97afa';

const ward = (code: string, fullName = 'Phường A') => ({ code, fullName, postalCode: null });
const prov = (code: string, wards: unknown[], fullName = 'Tỉnh A') => ({ code, fullName, wards });

describe('file dữ liệu hành chính thật', () => {
  it('SHA-256 khớp bản đã kiểm', () => {
    const sha = createHash('sha256').update(readFileSync(DATA_FILE)).digest('hex');
    expect(sha).toBe(PINNED_SHA256);
  });

  it('có 34 tỉnh / 3.321 phường', () => {
    const idx = loadLocations();
    expect(idx.provinceCount).toBe(34);
    expect(idx.wardCount).toBe(3321);
    expect(EXPECTED_PROVINCE_COUNT).toBe(34);
    expect(EXPECTED_WARD_COUNT).toBe(3321);
    expect(idx.provinceList).toHaveLength(34);
    expect(idx.wardToProvince.size).toBe(3321);
  });

  it('01 và 79 có tên đúng, phường mẫu thuộc đúng tỉnh', () => {
    expect(getProvince('01')?.name).toBe('Thành phố Hà Nội');
    expect(getProvince('79')?.name).toBe('Thành phố Hồ Chí Minh');
    expect(getProvince('01')?.wards.get('00070')?.name).toBe('Phường Hoàn Kiếm');
    expect(getProvince('01')?.wards.get('00004')?.name).toBe('Phường Ba Đình');
    expect(getProvince('79')?.wards.get('26740')?.name).toBe('Phường Sài Gòn');
    expect(getProvince('__proto__')).toBeUndefined();
  });

  it('mọi mã trong shipping.innerCityProvinceCodes (seed) tồn tại', () => {
    const seed = readFileSync(path.resolve(import.meta.dirname, '..', 'prisma', 'seed.ts'), 'utf8');
    const m = /'shipping\.innerCityProvinceCodes':\s*\[([^\]]*)\]/.exec(seed);
    expect(m).not.toBeNull();
    const codes = [...m![1]!.matchAll(/'(\d{2})'/g)].map((x) => x[1]!);
    expect(codes.length).toBeGreaterThan(0);
    for (const c of codes) expect(getProvince(c), c).toBeDefined();
  });

  it('địa chỉ seed resolve được', () => {
    for (const a of SEED_ADDRESSES) {
      expect(() => resolveLocation(a.provinceCode, a.wardCode), a.line1).not.toThrow();
    }
    expect(resolveLocation('79', '26740')).toEqual({
      provinceCode: '79',
      provinceName: 'Thành phố Hồ Chí Minh',
      wardCode: '26740',
      wardName: 'Phường Sài Gòn',
    });
  });
});

describe('resolveLocation', () => {
  const failure = (p: string, w: string) => {
    try {
      resolveLocation(p, w);
    } catch (e) {
      return e as AppError;
    }
    throw new Error('không ném lỗi');
  };

  it('ném AppError 400 đúng field/message', () => {
    const cases: Array<[string, string, string, string]> = [
      ['99', '00070', 'provinceCode', 'Tỉnh/thành không tồn tại'],
      ['__proto__', '00070', 'provinceCode', 'Tỉnh/thành không tồn tại'],
      ['01', '99999', 'wardCode', 'Phường/xã không tồn tại'],
      ['01', '26740', 'wardCode', 'Phường/xã không thuộc tỉnh/thành đã chọn'],
    ];
    for (const [p, w, field, message] of cases) {
      const e = failure(p, w);
      expect(e).toBeInstanceOf(AppError);
      expect(e.status).toBe(400);
      expect(e.code).toBe('VALIDATION_ERROR');
      expect(e.details).toEqual([{ field, message }]);
    }
  });
});

describe('buildLocationIndex', () => {
  it('dựng chỉ mục hợp lệ, sắp tỉnh theo code và phường theo tên (vi)', () => {
    const idx = buildLocationIndex([
      prov('02', [
        ward('00002', 'Phường Đông'),
        ward('00001', 'Phường Ba'),
        ward('00003', 'Phường An'),
      ]),
      prov('01', [ward('00010', ' Xã Z ')]),
    ]);
    expect(idx.provinceList.map((p) => p.code)).toEqual(['01', '02']);
    expect(idx.wardListByProvince.get('02')!.map((w) => w.name)).toEqual([
      'Phường An',
      'Phường Ba',
      'Phường Đông',
    ]);
    expect(idx.wardListByProvince.get('01')![0]!.name).toBe('Xã Z');
    expect(idx.wardToProvince.get('00003')).toBe('02');
    expect(Object.isFrozen(idx)).toBe(true);
  });

  it('từ chối dữ liệu sai', () => {
    const bad: Array<[string, unknown, RegExp]> = [
      ['mảng rỗng', [], /rỗng/],
      ['không phải mảng', { a: 1 }, /không hợp lệ/],
      [
        'trùng mã phường giữa 2 tỉnh',
        [prov('01', [ward('00001')]), prov('02', [ward('00001')])],
        /Trùng mã phường\/xã 00001/,
      ],
      [
        'trùng mã tỉnh',
        [prov('01', [ward('00001')]), prov('01', [ward('00002')])],
        /Trùng mã tỉnh/,
      ],
      ['mã tỉnh sai định dạng', [prov('1', [ward('00001')])], /2 chữ số/],
      ['mã phường sai định dạng', [prov('01', [ward('0001')])], /5 chữ số/],
      ['tên tỉnh rỗng', [prov('01', [ward('00001')], '   ')], /rỗng/],
      ['tên phường rỗng', [prov('01', [ward('00001', '')])], /rỗng/],
      ['tên quá dài', [prov('01', [ward('00001', 'x'.repeat(101))])], /100/],
      ['wards rỗng', [prov('01', [])], /không có phường/],
      [
        'postalCode sai kiểu',
        [prov('01', [{ code: '00001', fullName: 'A', postalCode: 5 }])],
        /không hợp lệ/,
      ],
    ];
    for (const [name, raw, re] of bad) {
      expect(() => buildLocationIndex(raw), name).toThrow(re);
    }
  });
});
