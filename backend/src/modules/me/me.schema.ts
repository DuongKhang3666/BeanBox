import { z } from 'zod';
import { phoneSchema } from '../../lib/phone.js';

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Ngày hôm nay theo giờ Việt Nam (UTC+7), dạng YYYY-MM-DD. */
function todayVn(): string {
  return new Date(Date.now() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

const birthDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày sinh phải có dạng YYYY-MM-DD')
  .transform((v, ctx) => {
    const [y, m, d] = v.split('-').map(Number) as [number, number, number];
    const date = new Date(Date.UTC(y, m - 1, d));
    if (
      date.getUTCFullYear() !== y ||
      date.getUTCMonth() !== m - 1 ||
      date.getUTCDate() !== d ||
      y < 1900
    ) {
      ctx.addIssue({ code: 'custom', message: 'Ngày sinh không hợp lệ' });
      return z.NEVER;
    }
    if (v > todayVn()) {
      ctx.addIssue({ code: 'custom', message: 'Ngày sinh không được ở tương lai' });
      return z.NEVER;
    }
    return date;
  });

const avatarUrlSchema = z
  .string()
  .max(500, 'Đường dẫn ảnh tối đa 500 ký tự')
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Đường dẫn ảnh phải là URL http hoặc https');

const fullNameSchema = z
  .string()
  .trim()
  .min(2, 'Họ tên tối thiểu 2 ký tự')
  .max(100, 'Họ tên tối đa 100 ký tự');

export const updateProfileSchema = z
  .object({
    fullName: fullNameSchema.optional(),
    phone: phoneSchema.nullable().optional(),
    birthDate: birthDateSchema.nullable().optional(),
    avatarUrl: avatarUrlSchema.nullable().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'Cần ít nhất một trường hợp lệ để cập nhật',
  });
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

const provinceCode = z.string().regex(/^\d{2}$/, 'Mã tỉnh/thành phải gồm 2 chữ số');
const wardCode = z.string().regex(/^\d{5}$/, 'Mã phường/xã phải gồm 5 chữ số');
const line1 = z
  .string()
  .trim()
  .min(5, 'Địa chỉ cụ thể tối thiểu 5 ký tự')
  .max(200, 'Địa chỉ cụ thể tối đa 200 ký tự');

export const createAddressSchema = z.object({
  fullName: fullNameSchema,
  phone: phoneSchema,
  provinceCode,
  wardCode,
  line1,
  isDefault: z.boolean().optional(),
});
export type CreateAddressInput = z.infer<typeof createAddressSchema>;

export const updateAddressSchema = z
  .object({
    fullName: fullNameSchema.optional(),
    phone: phoneSchema.optional(),
    provinceCode: provinceCode.optional(),
    wardCode: wardCode.optional(),
    line1: line1.optional(),
    isDefault: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (Object.values(v).every((x) => x === undefined)) {
      ctx.addIssue({ code: 'custom', message: 'Cần ít nhất một trường để cập nhật' });
      return;
    }
    if (v.provinceCode !== undefined && v.wardCode === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['wardCode'],
        message: 'Đổi tỉnh/thành thì phải gửi kèm phường/xã',
      });
    }
  });
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;
