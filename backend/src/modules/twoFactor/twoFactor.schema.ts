import { z } from 'zod';

const passwordField = z.string().min(1, 'Vui lòng nhập mật khẩu').max(200, 'Mật khẩu quá dài');

/** Mã TOTP 6 số (cho phép khoảng trắng giữa các số, ví dụ "123 456"). */
const totpField = z
  .string()
  .max(16, 'Mã không hợp lệ')
  .refine((s) => /^\d{6}$/.test(s.replace(/\s+/g, '')), 'Mã gồm 6 chữ số');

/** TOTP hoặc mã dự phòng (XXXXX-XXXXX): kiểm định dạng chi tiết ở service. */
const anyCodeField = z.string().trim().min(1, 'Vui lòng nhập mã').max(32, 'Mã không hợp lệ');

export const setupSchema = z.object({ password: passwordField });
export const enableSchema = z.object({ code: totpField });
export const disableSchema = z.object({ password: passwordField, code: anyCodeField });
export const backupCodesSchema = disableSchema;

export const loginTwoFactorSchema = z
  .object({
    challengeToken: z.string().min(1, 'Thiếu token').max(200, 'Token không hợp lệ'),
    code: totpField.optional(),
    backupCode: z.string().trim().min(1, 'Vui lòng nhập mã').max(32, 'Mã không hợp lệ').optional(),
  })
  .refine((d) => (d.code === undefined) !== (d.backupCode === undefined), {
    path: ['code'],
    message: 'Gửi đúng một trong hai: code hoặc backupCode',
  });

export type SetupInput = z.infer<typeof setupSchema>;
export type EnableInput = z.infer<typeof enableSchema>;
export type DisableInput = z.infer<typeof disableSchema>;
export type LoginTwoFactorInput = z.infer<typeof loginTwoFactorSchema>;
