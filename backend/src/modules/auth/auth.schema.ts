import { z } from 'zod';
import { passwordSchema } from '../../lib/password.js';
import { phoneSchema } from '../../lib/phone.js';

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Email không đúng định dạng').max(254, 'Email tối đa 254 ký tự'));

export const registerSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Họ tên tối thiểu 2 ký tự')
    .max(100, 'Họ tên tối đa 100 ký tự'),
  email: emailSchema,
  password: passwordSchema,
  phone: phoneSchema.optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Vui lòng nhập mật khẩu').max(200, 'Mật khẩu quá dài'),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

const tokenSchema = z.string().min(1, 'Thiếu token').max(200, 'Token không hợp lệ');

export const resetPasswordSchema = z.object({
  token: tokenSchema,
  newPassword: passwordSchema,
});

export const verifyEmailSchema = z.object({ token: tokenSchema });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Vui lòng nhập mật khẩu hiện tại').max(72),
    newPassword: passwordSchema,
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    path: ['newPassword'],
    message: 'Mật khẩu mới phải khác mật khẩu hiện tại',
  });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
