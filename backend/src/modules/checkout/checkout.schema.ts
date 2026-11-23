import { z } from 'zod';
import { emailSchema } from '../../lib/validation.js';

export const quoteSchema = z.object({
  provinceCode: z
    .string()
    .trim()
    .regex(/^\d{2}$/, 'Mã tỉnh/thành không hợp lệ')
    .optional(),
  wardCode: z
    .string()
    .trim()
    .regex(/^\d{5}$/, 'Mã phường/xã không hợp lệ')
    .optional(),
  addressId: z
    .string()
    .trim()
    .min(1, 'Địa chỉ không hợp lệ')
    .max(50, 'Địa chỉ không hợp lệ')
    .optional(),
  couponCode: z
    .string()
    .trim()
    .min(1, 'Mã giảm giá không hợp lệ')
    .max(50, 'Mã giảm giá quá dài')
    .optional(),
  contactEmail: emailSchema.optional(),
});
export type QuoteInput = z.infer<typeof quoteSchema>;
