import { z } from 'zod';

export const addWishlistSchema = z.object({
  productId: z
    .string({ error: 'Mã sản phẩm không hợp lệ' })
    .trim()
    .min(1, 'Mã sản phẩm không hợp lệ')
    .max(50, 'Mã sản phẩm không hợp lệ')
    // eslint-disable-next-line no-control-regex
    .regex(/^[^\u0000]*$/, 'Mã sản phẩm không hợp lệ'),
});
export type AddWishlistInput = z.infer<typeof addWishlistSchema>;
