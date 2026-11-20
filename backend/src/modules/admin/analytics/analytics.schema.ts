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

/** `GET /admin/analytics/customers` và `/operations` (§16.3): chỉ khoảng ngày. */
export const rangeOnlyQuerySchema = z.object({
  from: dateOnly('from').optional(),
  to: dateOnly('to').optional(),
});
export type RangeOnlyQuery = z.infer<typeof rangeOnlyQuerySchema>;

export const SLOW_DAYS_MIN = 7;
export const SLOW_DAYS_MAX = 365;
export const SLOW_DAYS_DEFAULT = 30;

/** `GET /admin/analytics/inventory` (§16.3): `slowDays` số nguyên 7..365 (chuỗi chữ số; tham số lặp -> 400). */
export const inventoryQuerySchema = z.object({
  slowDays: z
    .string({ error: `slowDays phải là số nguyên từ ${SLOW_DAYS_MIN} đến ${SLOW_DAYS_MAX}` })
    .regex(/^\d{1,3}$/, `slowDays phải là số nguyên từ ${SLOW_DAYS_MIN} đến ${SLOW_DAYS_MAX}`)
    .transform(Number)
    .refine(
      (n) => n >= SLOW_DAYS_MIN && n <= SLOW_DAYS_MAX,
      `slowDays phải là số nguyên từ ${SLOW_DAYS_MIN} đến ${SLOW_DAYS_MAX}`,
    )
    .optional(),
});
export type InventoryQuery = z.infer<typeof inventoryQuerySchema>;

/** `GET /admin/analytics/coupons` (§16.4): `limit` 1..50 như top sản phẩm, `sort` mặc định `revenue`. */
export const COUPON_SORTS = ['revenue', 'uses', 'discount'] as const;
export type CouponSort = (typeof COUPON_SORTS)[number];
export const couponsQuerySchema = z.object({
  from: dateOnly('from').optional(),
  to: dateOnly('to').optional(),
  sort: z.enum(COUPON_SORTS, { error: 'sort phải là revenue, uses hoặc discount' }).optional(),
  limit: limitSchema,
});
export type CouponsQuery = z.infer<typeof couponsQuerySchema>;

export const EXPORT_REPORTS = [
  'overview',
  'series',
  'breakdown',
  'top-products',
  'top-customers',
  'coupons',
  'customers',
  'operations',
  'inventory',
] as const;
export type ExportReport = (typeof EXPORT_REPORTS)[number];
export const INVENTORY_LISTS = ['outOfStock', 'lowStock', 'slowMovers'] as const;
export type InventoryList = (typeof INVENTORY_LISTS)[number];

export const EXPORT_LIMIT_MAX = 200;
export const EXPORT_LIMIT_DEFAULT = 100;
export const EXPORT_INVENTORY_ROWS = 1000;

const exportLimit = z
  .string({ error: `limit phải là số nguyên từ 1 đến ${EXPORT_LIMIT_MAX}` })
  .regex(/^\d{1,3}$/, `limit phải là số nguyên từ 1 đến ${EXPORT_LIMIT_MAX}`)
  .transform(Number)
  .refine(
    (n) => n >= 1 && n <= EXPORT_LIMIT_MAX,
    `limit phải là số nguyên từ 1 đến ${EXPORT_LIMIT_MAX}`,
  )
  .optional();

/** Mỗi báo cáo chỉ nhận đúng tham số của nó; tham số khác (hoặc lặp) -> 400 (D-053). */
const strict = <T extends z.core.$ZodLooseShape>(shape: T) =>
  z.strictObject(shape, {
    error: (iss) =>
      iss.code === 'unrecognized_keys'
        ? `Tham số không áp dụng cho báo cáo này: ${iss.keys.join(', ')}`
        : undefined,
  });
const range = { from: dateOnly('from').optional(), to: dateOnly('to').optional() };

export const exportQuerySchema = z.discriminatedUnion(
  'report',
  [
    strict({
      report: z.literal('overview'),
      ...range,
      granularity: overviewQuerySchema.shape.granularity,
    }),
    strict({
      report: z.literal('series'),
      ...range,
      granularity: overviewQuerySchema.shape.granularity,
    }),
    strict({
      report: z.literal('breakdown'),
      dimension: breakdownQuerySchema.shape.dimension,
      ...range,
    }),
    strict({
      report: z.literal('top-products'),
      ...range,
      sort: topProductsQuerySchema.shape.sort,
      limit: exportLimit,
    }),
    strict({
      report: z.literal('top-customers'),
      ...range,
      sort: topCustomersQuerySchema.shape.sort,
      limit: exportLimit,
    }),
    strict({
      report: z.literal('coupons'),
      ...range,
      sort: couponsQuerySchema.shape.sort,
      limit: exportLimit,
    }),
    strict({ report: z.literal('customers'), ...range }),
    strict({ report: z.literal('operations'), ...range }),
    strict({
      report: z.literal('inventory'),
      list: z.enum(INVENTORY_LISTS, {
        error: `list bắt buộc và phải là một trong: ${INVENTORY_LISTS.join(', ')}`,
      }),
      slowDays: inventoryQuerySchema.shape.slowDays,
    }),
  ],
  { error: `report bắt buộc và phải là một trong: ${EXPORT_REPORTS.join(', ')}` },
);
export type ExportQuery = z.infer<typeof exportQuerySchema>;
