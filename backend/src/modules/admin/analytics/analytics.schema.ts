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
