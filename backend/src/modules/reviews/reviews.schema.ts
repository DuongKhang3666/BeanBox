import { z } from 'zod';
import { NO_NUL } from '../../lib/validation.js';
import { csvEnum, paginationShape } from '../admin/admin.schema.js';

// Giữ export để schema admin đã import từ đây vẫn dùng được.
export { NO_NUL };

const ratingSchema = z
  .number({ error: 'Điểm đánh giá phải là số nguyên từ 1 đến 5' })
  .int('Điểm đánh giá phải là số nguyên từ 1 đến 5')
  .min(1, 'Điểm đánh giá phải từ 1 đến 5')
  .max(5, 'Điểm đánh giá phải từ 1 đến 5');

const contentSchema = z
  .string({ error: 'Nội dung không hợp lệ' })
  .trim()
  .max(2000, 'Nội dung tối đa 2000 ký tự')
  .regex(NO_NUL, 'Nội dung chứa ký tự không hợp lệ');

export const RATING_VALUES = ['1', '2', '3', '4', '5'] as const;

export const listReviewsQuerySchema = z.object({
  rating: csvEnum(RATING_VALUES, 'Điểm lọc phải từ 1 đến 5'),
  sort: z
    .enum(['newest', 'highest', 'lowest'], { error: 'Cách sắp xếp không hợp lệ' })
    .default('newest'),
  ...paginationShape,
});
export type ListReviewsQuery = z.infer<typeof listReviewsQuerySchema>;

export const createReviewSchema = z.object({
  rating: ratingSchema,
  content: contentSchema.default(''),
});
export type CreateReviewInput = z.infer<typeof createReviewSchema>;

export const updateReviewSchema = z
  .object({
    rating: ratingSchema.optional(),
    content: contentSchema.optional(),
  })
  .refine((v) => v.rating !== undefined || v.content !== undefined, {
    message: 'Cần ít nhất một trường để cập nhật',
  });
export type UpdateReviewInput = z.infer<typeof updateReviewSchema>;
