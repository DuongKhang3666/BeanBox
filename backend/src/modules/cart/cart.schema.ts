import { z } from 'zod';
import { MAX_LINE_QUANTITY } from '../../lib/cartLine.js';

const quantity = z
  .number({ error: 'Số lượng không hợp lệ' })
  .int('Số lượng phải là số nguyên')
  .min(1, 'Số lượng tối thiểu là 1')
  .max(MAX_LINE_QUANTITY, `Số lượng tối đa là ${MAX_LINE_QUANTITY}`);

export const addItemSchema = z.object({
  variantId: z.string().trim().min(1, 'Thiếu biến thể').max(50, 'Mã biến thể quá dài'),
  quantity,
});
export type AddItemInput = z.infer<typeof addItemSchema>;

export const updateItemSchema = z.object({ quantity });
export type UpdateItemInput = z.infer<typeof updateItemSchema>;

export const applyCouponSchema = z.object({
  code: z.string().trim().min(1, 'Vui lòng nhập mã giảm giá').max(50, 'Mã giảm giá quá dài'),
});
export type ApplyCouponInput = z.infer<typeof applyCouponSchema>;
