import { z } from 'zod';
import { AppError } from '../../../lib/errors.js';
import { normalizePhone } from '../../../lib/phone.js';
import { loadLocations } from '../../locations/locations.data.js';
import { isSafeHref, isSafeUploadUrl, type SettingKey } from '../../settings/settings.service.js';

/** Schema GHI cho 10 key cài đặt (api-contract §14.9, D-021). Chặt hơn schema đọc. */

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

const int = (label: string, min: number, max: number) =>
  z
    .number({ error: `${label} phải là số nguyên` })
    .int(`${label} phải là số nguyên`)
    .min(min, `${label} phải từ ${min} đến ${max}`)
    .max(max, `${label} phải từ ${min} đến ${max}`);

const fee = (label: string) => int(label, 0, 1_000_000);
const feeByMethod = (label: string) =>
  z.object({ STANDARD: fee(`${label} (STANDARD)`), EXPRESS: fee(`${label} (EXPRESS)`) });

const etaRange = (label: string) =>
  z
    .object({
      minDays: int(`${label}: số ngày tối thiểu`, 0, 30),
      maxDays: int(`${label}: số ngày tối đa`, 0, 30),
    })
    .refine((r) => r.minDays <= r.maxDays, {
      message: `${label}: số ngày tối thiểu không được lớn hơn tối đa`,
      path: ['minDays'],
    });
const etaByMethod = (label: string) =>
  z.object({
    STANDARD: etaRange(`${label} (STANDARD)`),
    EXPRESS: etaRange(`${label} (EXPRESS)`),
  });

/** Bỏ trùng, giữ thứ tự xuất hiện đầu. */
const dedupe = (arr: string[]) => [...new Set(arr)];

const text = (label: string, min: number, max: number, noControl: boolean) =>
  z
    .string({ error: `${label} không hợp lệ` })
    .trim()
    .min(min, min > 0 ? `${label} không được để trống` : `${label} không hợp lệ`)
    .max(max, `${label} tối đa ${max} ký tự`)
    .refine((v) => !noControl || !CONTROL_CHARS.test(v), `${label} chứa ký tự không hợp lệ`);

const banner = z.object({
  imageUrl: z
    .string({ error: 'Đường dẫn ảnh không hợp lệ' })
    .trim()
    .refine(isSafeUploadUrl, 'Đường dẫn ảnh phải bắt đầu bằng /uploads/ và hợp lệ'),
  alt: text('Mô tả ảnh', 1, 200, false),
  title: text('Tiêu đề', 0, 100, false).default(''),
  subtitle: text('Phụ đề', 0, 200, false).default(''),
  href: z
    .string({ error: 'Liên kết không hợp lệ' })
    .trim()
    .refine(isSafeHref, 'Liên kết phải là đường dẫn nội bộ bắt đầu bằng / (tối đa 300 ký tự)')
    .nullable()
    .default(null),
  isActive: z.boolean({ error: 'Trạng thái hiển thị phải là true/false' }),
});

const bankTransfer = z.object({
  bankBin: z
    .string({ error: 'Mã BIN ngân hàng không hợp lệ' })
    .trim()
    .regex(/^\d{6}$/, 'Mã BIN ngân hàng phải gồm đúng 6 chữ số'),
  bankName: text('Tên ngân hàng', 1, 100, true),
  accountNo: z
    .string({ error: 'Số tài khoản không hợp lệ' })
    .trim()
    .regex(/^\d{6,19}$/, 'Số tài khoản phải gồm 6 đến 19 chữ số'),
  accountName: text('Tên chủ tài khoản', 1, 100, true),
});

export const SETTING_WRITE_SCHEMAS: Record<SettingKey, z.ZodType> = {
  'shipping.rates': z.object({
    inner: feeByMethod('Phí nội thành'),
    other: feeByMethod('Phí ngoại thành'),
  }),
  'shipping.eta': z.object({
    inner: etaByMethod('Thời gian giao nội thành'),
    other: etaByMethod('Thời gian giao ngoại thành'),
  }),
  'shipping.innerCityProvinceCodes': z
    .array(
      z
        .string({ error: 'Mã tỉnh/thành không hợp lệ' })
        .regex(/^\d{2}$/, 'Mã tỉnh/thành phải gồm 2 chữ số')
        .refine((c) => loadLocations().provinces.has(c), 'Tỉnh/thành không tồn tại'),
      { error: 'Danh sách tỉnh/thành không hợp lệ' },
    )
    .max(34, 'Tối đa 34 tỉnh/thành')
    .transform(dedupe),
  'shipping.innerCityWardCodes': z
    .array(
      z
        .string({ error: 'Mã phường/xã không hợp lệ' })
        .regex(/^\d{5}$/, 'Mã phường/xã phải gồm 5 chữ số')
        .refine((c) => loadLocations().wardToProvince.has(c), 'Phường/xã không tồn tại'),
      { error: 'Danh sách phường/xã không hợp lệ' },
    )
    .max(500, 'Tối đa 500 phường/xã')
    .transform(dedupe),
  'shipping.freeShippingThreshold': int('Ngưỡng miễn phí vận chuyển', 0, 100_000_000),
  'shipping.weightSurcharge': z.object({
    freeGram: int('Khối lượng miễn phụ phí', 0, 100_000),
    stepGram: int('Bước khối lượng', 1, 100_000),
    feePerStep: int('Phụ phí mỗi bước', 0, 1_000_000),
  }),
  'order.paymentExpiryMinutes': int('Thời hạn thanh toán (phút)', 5, 120),
  'store.contact': z.object({
    name: text('Tên cửa hàng', 1, 100, true),
    email: z
      .string({ error: 'Email không hợp lệ' })
      .trim()
      .toLowerCase()
      .max(254, 'Email tối đa 254 ký tự')
      .pipe(z.email('Email không hợp lệ')),
    phone: z
      .string({ error: 'Số điện thoại không hợp lệ' })
      .trim()
      .transform((v, ctx) => {
        if (v === '') return '';
        const n = normalizePhone(v);
        if (n === null) {
          ctx.addIssue({ code: 'custom', message: 'Số điện thoại không hợp lệ' });
          return z.NEVER;
        }
        return n;
      }),
    address: text('Địa chỉ', 0, 300, true),
  }),
  'home.banners': z
    .array(banner, { error: 'Danh sách banner không hợp lệ' })
    .max(5, 'Tối đa 5 banner'),
  'payment.bankTransfer': bankTransfer,
};

const isKey = (k: string): k is SettingKey => Object.hasOwn(SETTING_WRITE_SCHEMAS, k);

export type SettingsPatch = Partial<Record<SettingKey, unknown>>;

/** Validate body PUT; lỗi -> 400 VALIDATION_ERROR, `field` là đường dẫn đầy đủ nối bằng dấu chấm. */
export function parseSettingsPatch(body: unknown): SettingsPatch {
  const fail = (details: Array<{ field: string; message: string }>) =>
    new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ', details);

  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw fail([{ field: '', message: 'Body phải là object chứa ít nhất một cài đặt' }]);
  }
  const entries = Object.entries(body);
  if (entries.length === 0) {
    throw fail([{ field: '', message: 'Cần gửi ít nhất một cài đặt' }]);
  }
  const details: Array<{ field: string; message: string }> = [];
  const out: SettingsPatch = {};
  for (const [key, value] of entries) {
    if (!isKey(key)) {
      details.push({ field: key, message: 'Cài đặt không được hỗ trợ' });
      continue;
    }
    const parsed = SETTING_WRITE_SCHEMAS[key].safeParse(value);
    if (parsed.success) {
      out[key] = parsed.data;
    } else {
      for (const i of parsed.error.issues) {
        details.push({ field: [key, ...i.path].join('.'), message: i.message });
      }
    }
  }
  if (details.length > 0) throw fail(details);
  return out;
}
