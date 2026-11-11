import { z } from 'zod';
import { csvEnum, dateOnly, idString, paginationShape, refineDateRange } from '../admin.schema.js';

export const STOCK_STATUSES = ['OUT_OF_STOCK', 'LOW_STOCK', 'IN_STOCK'] as const;
export const INVENTORY_REASONS = [
  'ORDER_RESERVE',
  'ORDER_RELEASE',
  'RESTOCK',
  'DAMAGE',
  'STOCKTAKE',
  'ADJUSTMENT',
] as const;
export const ADJUST_REASONS = ['RESTOCK', 'DAMAGE', 'STOCKTAKE', 'ADJUSTMENT'] as const;

const MAX_QTY = 100_000;

export const inventoryQuerySchema = z.object({
  q: z
    .string({ error: 'Từ khóa không hợp lệ' })
    .trim()
    .transform((s) => (s === '' ? undefined : s))
    .pipe(z.string().max(100, 'Từ khóa tối đa 100 ký tự').optional())
    .optional(),
  stockStatus: csvEnum(STOCK_STATUSES, 'Trạng thái tồn kho không hợp lệ'),
  productId: idString('productId').optional(),
  sort: z
    .enum(['stock_asc', 'name', 'updated'], { error: 'Sắp xếp không hợp lệ' })
    .default('stock_asc'),
  ...paginationShape,
});
export type InventoryQuery = z.infer<typeof inventoryQuerySchema>;

export const movementsQuerySchema = z
  .object({
    variantId: idString('variantId').optional(),
    reason: csvEnum(INVENTORY_REASONS, 'Lý do không hợp lệ'),
    from: dateOnly('from').optional(),
    to: dateOnly('to').optional(),
    ...paginationShape,
  })
  .superRefine(refineDateRange);
export type MovementsQuery = z.infer<typeof movementsQuerySchema>;

const nullishInt = (label: string, min: number, max: number) =>
  z
    .number({ error: `${label} phải là số nguyên` })
    .int(`${label} phải là số nguyên`)
    .min(min, `${label} phải từ ${min} đến ${max}`)
    .max(max, `${label} phải từ ${min} đến ${max}`)
    .nullish()
    .transform((v) => v ?? undefined);

export const adjustSchema = z
  .object({
    variantId: idString('variantId'),
    reason: z.enum(ADJUST_REASONS, { error: 'Lý do điều chỉnh không hợp lệ' }),
    change: nullishInt('Số lượng thay đổi', -MAX_QTY, MAX_QTY),
    newStock: nullishInt('Tồn kho mới', 0, MAX_QTY),
    note: z
      .string({ error: 'Ghi chú không hợp lệ' })
      .trim()
      .max(255, 'Ghi chú tối đa 255 ký tự')
      .nullish()
      .transform((v) => (v === '' || v == null ? undefined : v)),
    expectedStock: nullishInt('expectedStock', 0, 2_147_483_647),
  })
  .superRefine((v, ctx) => {
    const add = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    switch (v.reason) {
      case 'STOCKTAKE':
        if (v.newStock === undefined) add('newStock', 'Vui lòng nhập tồn kho sau kiểm kê');
        if (v.change !== undefined) add('change', 'Kiểm kê không dùng số lượng thay đổi');
        return;
      case 'RESTOCK':
        if (v.change === undefined || v.change <= 0) add('change', 'Số lượng nhập phải lớn hơn 0');
        break;
      case 'DAMAGE':
        if (v.change === undefined || v.change >= 0)
          add('change', 'Số lượng hao hụt phải nhỏ hơn 0');
        if (!v.note) add('note', 'Vui lòng nhập ghi chú');
        break;
      case 'ADJUSTMENT':
        if (v.change === undefined || v.change === 0)
          add('change', 'Số lượng thay đổi phải khác 0');
        if (!v.note) add('note', 'Vui lòng nhập ghi chú');
        break;
    }
    if (v.newStock !== undefined) add('newStock', 'Chỉ dùng tồn kho mới khi kiểm kê');
  });
export type AdjustInput = z.infer<typeof adjustSchema>;
