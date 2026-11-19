import { z } from 'zod';
import { csvEnum, paginationShape } from '../admin.schema.js';

/** Quản lý người dùng (api-contract §14.10, D-022). */

export const ROLES = ['CUSTOMER', 'STAFF', 'ADMIN'] as const;
export const STATUSES = ['ACTIVE', 'DISABLED'] as const;

export const listUsersQuerySchema = z.object({
  q: z
    .string({ error: 'Từ khóa không hợp lệ' })
    .trim()
    .min(2, 'Từ khóa phải từ 2 đến 100 ký tự')
    .max(100, 'Từ khóa phải từ 2 đến 100 ký tự')
    .optional(),
  role: csvEnum(ROLES, 'Vai trò không hợp lệ'),
  status: csvEnum(STATUSES, 'Trạng thái không hợp lệ'),
  sort: z
    .enum(['newest', 'oldest', 'lastLogin'], { error: 'Cách sắp xếp không hợp lệ' })
    .default('newest'),
  ...paginationShape,
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

export const updateStatusSchema = z.object({
  status: z.enum(STATUSES, { error: 'Trạng thái không hợp lệ' }),
  reason: z
    .string({ error: 'Lý do không hợp lệ' })
    .trim()
    .max(255, 'Lý do tối đa 255 ký tự')
    .optional(),
});
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;

export const updateRoleSchema = z.object({
  role: z.enum(ROLES, { error: 'Vai trò không hợp lệ' }),
});
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
