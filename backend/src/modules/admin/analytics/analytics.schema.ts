import { z } from 'zod';
import { dateOnly } from '../admin.schema.js';

/** Query của `GET /admin/analytics/overview` (api-contract §16.1). Quy tắc theo ngữ cảnh ở `resolveRange`. */
export const overviewQuerySchema = z.object({
  from: dateOnly('from').optional(),
  to: dateOnly('to').optional(),
  granularity: z
    .enum(['day', 'week', 'month'], { error: 'granularity phải là day, week hoặc month' })
    .optional(),
});
export type OverviewQuery = z.infer<typeof overviewQuerySchema>;

export const BREAKDOWN_DIMENSIONS = [
  'category',
  'brand',
  'paymentMethod',
  'shippingMethod',
  'province',
] as const;
export type BreakdownDimension = (typeof BREAKDOWN_DIMENSIONS)[number];

/** `GET /admin/analytics/breakdown` (§16.2): `dimension` bắt buộc; tham số lặp -> mảng -> 400. */
export const breakdownQuerySchema = z.object({
  dimension: z.enum(BREAKDOWN_DIMENSIONS, {
    error: `dimension bắt buộc và phải là một trong: ${BREAKDOWN_DIMENSIONS.join(', ')}`,
  }),
  from: dateOnly('from').optional(),
  to: dateOnly('to').optional(),
});
export type BreakdownQuery = z.infer<typeof breakdownQuerySchema>;

/** `limit`: số nguyên 1..50 (chuỗi chữ số, không nhận "1.5", "abc", "-1", tham số lặp). */
const limitSchema = z
  .string({ error: 'limit phải là số nguyên từ 1 đến 50' })
  .regex(/^\d{1,3}$/, 'limit phải là số nguyên từ 1 đến 50')
  .transform(Number)
  .refine((n) => n >= 1 && n <= 50, 'limit phải là số nguyên từ 1 đến 50')
  .optional();

export const topProductsQuerySchema = z.object({
  from: dateOnly('from').optional(),
  to: dateOnly('to').optional(),
  sort: z.enum(['revenue', 'quantity'], { error: 'sort phải là revenue hoặc quantity' }).optional(),
  limit: limitSchema,
});
export type TopProductsQuery = z.infer<typeof topProductsQuerySchema>;

export const topCustomersQuerySchema = z.object({
  from: dateOnly('from').optional(),
  to: dateOnly('to').optional(),
  sort: z.enum(['revenue', 'orders'], { error: 'sort phải là revenue hoặc orders' }).optional(),
  limit: limitSchema,
});
export type TopCustomersQuery = z.infer<typeof topCustomersQuerySchema>;
