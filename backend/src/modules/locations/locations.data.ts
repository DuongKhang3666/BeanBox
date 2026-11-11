import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { AppError } from '../../lib/errors.js';

/**
 * Số lượng mong đợi của file hiện tại (backend/data/provinces-wards.json).
 * Khi thay file bằng dữ liệu mới: kiểm lại với danh mục chính thức rồi cập nhật các hằng số này
 * (và SHA-256 ghim trong tests/locations.data.test.ts).
 */
export const EXPECTED_PROVINCE_COUNT = 34;
export const EXPECTED_WARD_COUNT = 3321;

/** backend/data: src/ và dist/ đều nằm ngay dưới thư mục backend (cùng cách app.ts tìm uploads). */
const DATA_FILE = path.resolve(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'data',
  'provinces-wards.json',
);

export interface LocationItem {
  code: string;
  name: string;
}

export interface ProvinceEntry extends LocationItem {
  /** wardCode -> ward */
  wards: ReadonlyMap<string, LocationItem>;
}

export interface LocationIndex {
  provinces: ReadonlyMap<string, ProvinceEntry>;
  /** wardCode -> provinceCode (mã phường là duy nhất toàn quốc) */
  wardToProvince: ReadonlyMap<string, string>;
  /** DTO đã sắp sẵn: tỉnh theo code tăng dần */
  provinceList: readonly Readonly<LocationItem>[];
  /** DTO đã sắp sẵn: phường theo tên (vi) của từng tỉnh */
  wardListByProvince: ReadonlyMap<string, readonly Readonly<LocationItem>[]>;
  provinceCount: number;
  wardCount: number;
}

const nameSchema = z
  .string()
  .transform((v) => v.trim())
  .pipe(z.string().min(1, 'tên rỗng').max(100, 'tên quá 100 ký tự'));

const rawSchema = z
  .array(
    z.object({
      code: z.string().regex(/^\d{2}$/, 'mã tỉnh phải gồm 2 chữ số'),
      fullName: nameSchema,
      wards: z
        .array(
          z.object({
            code: z.string().regex(/^\d{5}$/, 'mã phường phải gồm 5 chữ số'),
            fullName: nameSchema,
            postalCode: z.string().nullable(),
          }),
        )
        .min(1, 'tỉnh không có phường/xã'),
    }),
  )
  .min(1, 'danh sách tỉnh rỗng');

/** Hàm thuần: kiểm toàn vẹn dữ liệu thô và dựng chỉ mục bất biến. Sai -> throw Error mô tả rõ. */
export function buildLocationIndex(raw: unknown): LocationIndex {
  const parsed = rawSchema.safeParse(raw);
  if (!parsed.success) {
    const i = parsed.error.issues[0]!;
    throw new Error(`Dữ liệu hành chính không hợp lệ tại [${i.path.join('.')}]: ${i.message}`);
  }
  const collator = new Intl.Collator('vi');
  const provinces = new Map<string, ProvinceEntry>();
  const wardToProvince = new Map<string, string>();
  const wardListByProvince = new Map<string, readonly Readonly<LocationItem>[]>();
  let wardCount = 0;

  for (const p of parsed.data) {
    if (provinces.has(p.code)) throw new Error(`Trùng mã tỉnh/thành ${p.code}`);
    const wards = new Map<string, LocationItem>();
    for (const w of p.wards) {
      const owner = wardToProvince.get(w.code);
      if (owner !== undefined) {
        throw new Error(`Trùng mã phường/xã ${w.code} (tỉnh ${owner} và ${p.code})`);
      }
      wardToProvince.set(w.code, p.code);
      wards.set(w.code, Object.freeze({ code: w.code, name: w.fullName }));
      wardCount += 1;
    }
    provinces.set(p.code, Object.freeze({ code: p.code, name: p.fullName, wards }));
    wardListByProvince.set(
      p.code,
      Object.freeze(
        [...wards.values()].sort(
          (a, b) => collator.compare(a.name, b.name) || (a.code < b.code ? -1 : 1),
        ),
      ),
    );
  }

  const provinceList = Object.freeze(
    [...provinces.values()]
      .sort((a, b) => (a.code < b.code ? -1 : 1))
      .map((p) => Object.freeze({ code: p.code, name: p.name })),
  );

  return Object.freeze({
    provinces,
    wardToProvince,
    provinceList,
    wardListByProvince,
    provinceCount: provinces.size,
    wardCount,
  });
}

let cached: LocationIndex | undefined;

/** Đọc file đồng bộ, memo 1 lần. Lỗi (thiếu file, sai dữ liệu, sai số lượng) -> throw để fail-fast khi khởi động. */
export function loadLocations(): LocationIndex {
  if (cached) return cached;
  let index: LocationIndex;
  try {
    index = buildLocationIndex(JSON.parse(readFileSync(DATA_FILE, 'utf8')) as unknown);
  } catch (e) {
    throw new Error(`Không nạp được ${DATA_FILE}: ${e instanceof Error ? e.message : String(e)}`, {
      cause: e,
    });
  }
  if (index.provinceCount !== EXPECTED_PROVINCE_COUNT || index.wardCount !== EXPECTED_WARD_COUNT) {
    throw new Error(
      `Dữ liệu hành chính có ${index.provinceCount} tỉnh / ${index.wardCount} phường, ` +
        `mong đợi ${EXPECTED_PROVINCE_COUNT} / ${EXPECTED_WARD_COUNT}`,
    );
  }
  cached = index;
  return index;
}

export function getProvince(code: string): ProvinceEntry | undefined {
  return loadLocations().provinces.get(code);
}

export interface ResolvedLocation {
  provinceCode: string;
  provinceName: string;
  wardCode: string;
  wardName: string;
}

const invalid = (field: string, message: string) =>
  new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ', [{ field, message }]);

/** Đối chiếu cặp mã với danh mục và trả tên chuẩn; sai -> AppError 400 VALIDATION_ERROR. */
export function resolveLocation(provinceCode: string, wardCode: string): ResolvedLocation {
  const { provinces, wardToProvince } = loadLocations();
  const province = provinces.get(provinceCode);
  if (!province) throw invalid('provinceCode', 'Tỉnh/thành không tồn tại');
  const ward = province.wards.get(wardCode);
  if (!ward) {
    if (wardToProvince.has(wardCode)) {
      throw invalid('wardCode', 'Phường/xã không thuộc tỉnh/thành đã chọn');
    }
    throw invalid('wardCode', 'Phường/xã không tồn tại');
  }
  return {
    provinceCode: province.code,
    provinceName: province.name,
    wardCode: ward.code,
    wardName: ward.name,
  };
}
