import { z } from 'zod';
import { idString, paginationShape } from '../admin.schema.js';
import { NO_NUL } from '../../reviews/reviews.schema.js';

export const REVIEW_STATUSES = ['PUBLISHED', 'HIDDEN'] as const;

export const listAdminReviewsQuerySchema = z.object({
  status: z.enum(REVIEW_STATUSES, { error: 'Trạng thái không hợp lệ' }).optional(),
  rating: z
    .string({ error: 'Điểm lọc không hợp lệ' })
    .trim()
    .regex(/^[1-5]$/, 'Điểm lọc phải từ 1 đến 5')
    .transform(Number)
    .optional(),
  productId: idString('Sản phẩm').optional(),
  q: z
    .string()
    .trim()
    .max(100, 'Từ khóa tối đa 100 ký tự')
    .regex(NO_NUL, 'Từ khóa chứa ký tự không hợp lệ')
    .optional()
    .transform((v) => (v ? v : undefined)),
  hasReply: z
    .enum(['true', 'false'], { error: 'hasReply phải là true hoặc false' })
    .transform((v) => v === 'true')
    .optional(),
  ...paginationShape,
});
export type ListAdminReviewsQuery = z.infer<typeof listAdminReviewsQuerySchema>;

export const setReviewStatusSchema = z.object({
  status: z.enum(REVIEW_STATUSES, { error: 'Trạng thái không hợp lệ' }),
});
export type SetReviewStatusInput = z.infer<typeof setReviewStatusSchema>;

export const replyReviewSchema = z.object({
  reply: z
    .string({ error: 'Câu trả lời không hợp lệ' })
    .trim()
    .min(1, 'Vui lòng nhập câu trả lời')
    .max(1000, 'Câu trả lời tối đa 1000 ký tự')
    .regex(NO_NUL, 'Câu trả lời chứa ký tự không hợp lệ'),
});
export type ReplyReviewInput = z.infer<typeof replyReviewSchema>;
