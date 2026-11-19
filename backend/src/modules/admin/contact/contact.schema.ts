import { z } from 'zod';
import { csvEnum, paginationShape } from '../admin.schema.js';

/** Quản lý tin nhắn liên hệ (api-contract §14.11, D-023). */

export const CONTACT_STATUSES = ['NEW', 'IN_PROGRESS', 'RESOLVED', 'SPAM'] as const;

export const listContactQuerySchema = z.object({
  q: z
    .string({ error: 'Từ khóa không hợp lệ' })
    .trim()
    .min(2, 'Từ khóa phải từ 2 đến 100 ký tự')
    .max(100, 'Từ khóa phải từ 2 đến 100 ký tự')
    .optional(),
  status: csvEnum(CONTACT_STATUSES, 'Trạng thái không hợp lệ'),
  ...paginationShape,
});
export type ListContactQuery = z.infer<typeof listContactQuerySchema>;

export const updateContactSchema = z
  .object({
    status: z.enum(CONTACT_STATUSES, { error: 'Trạng thái không hợp lệ' }).optional(),
    adminNote: z
      .union([z.string().trim().max(1000, 'Ghi chú tối đa 1000 ký tự'), z.null()], {
        error: 'Ghi chú không hợp lệ',
      })
      .transform((v) => (v === null || v === '' ? null : v))
      .optional(),
  })
  .refine((v) => v.status !== undefined || v.adminNote !== undefined, {
    message: 'Cần ít nhất một trường để cập nhật',
  });
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
