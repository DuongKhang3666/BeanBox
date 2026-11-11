import { z } from 'zod';
import { csvEnum, dateOnly, paginationShape } from '../admin.schema.js';

export const ORDER_STATUSES = [
  'PENDING_PAYMENT',
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPING',
  'DELIVERED',
  'FAILED_DELIVERY',
  'CANCELLED',
  'RETURN_REQUESTED',
  'RETURNED',
] as const;
const PAYMENT_STATUSES = ['UNPAID', 'PAID', 'FAILED', 'REFUNDED'] as const;
const PAYMENT_METHODS = ['COD', 'VNPAY', 'STRIPE'] as const;

export const adminOrdersQuerySchema = z
  .object({
    status: csvEnum(ORDER_STATUSES, 'Trạng thái đơn hàng không hợp lệ'),
    paymentStatus: csvEnum(PAYMENT_STATUSES, 'Trạng thái thanh toán không hợp lệ'),
    paymentMethod: csvEnum(PAYMENT_METHODS, 'Phương thức thanh toán không hợp lệ'),
    // Chỉ nhận `true` (lọc đơn cần hoàn tiền, §13.7); `false`/rỗng = không lọc.
    needsRefund: z
      .preprocess(
        (v) => (v === '' || v === undefined ? undefined : v),
        z.enum(['true', 'false'], { error: 'needsRefund phải là true hoặc false' }).optional(),
      )
      .transform((v) => v === 'true'),
    from: dateOnly('from').optional(),
    to: dateOnly('to').optional(),
    q: z
      .string({ error: 'Từ khóa không hợp lệ' })
      .trim()
      .transform((s) => (s === '' ? undefined : s))
      .pipe(
        z
          .string()
          .min(2, 'Từ khóa tối thiểu 2 ký tự')
          .max(50, 'Từ khóa tối đa 50 ký tự')
          .optional(),
      )
      .optional(),
    sort: z.enum(['newest', 'oldest'], { error: 'Sắp xếp không hợp lệ' }).default('newest'),
    ...paginationShape,
  })
  .superRefine((v, ctx) => {
    if (v.from && v.to && v.from > v.to) {
      ctx.addIssue({
        code: 'custom',
        path: ['from'],
        message: 'Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc',
      });
    }
  });
export type AdminOrdersQuery = z.infer<typeof adminOrdersQuerySchema>;

const optionalText = (max: number, maxMsg: string) =>
  z
    .string({ error: 'Giá trị không hợp lệ' })
    .trim()
    .max(max, maxMsg)
    .nullish()
    .transform((v) => (v === '' || v == null ? undefined : v));

export const updateOrderStatusSchema = z.object({
  toStatus: z.enum(ORDER_STATUSES, { error: 'Trạng thái đích không hợp lệ' }),
  fromStatus: z.enum(ORDER_STATUSES, { error: 'Trạng thái hiện tại không hợp lệ' }),
  note: optionalText(500, 'Ghi chú tối đa 500 ký tự'),
  trackingNumber: z
    .string({ error: 'Mã vận đơn không hợp lệ' })
    .trim()
    .min(1, 'Mã vận đơn không được để trống')
    .max(50, 'Mã vận đơn tối đa 50 ký tự')
    .regex(/^[A-Za-z0-9-]+$/, 'Mã vận đơn chỉ gồm chữ, số và dấu gạch ngang')
    .nullish()
    .transform((v) => v ?? undefined),
  carrier: z
    .string({ error: 'Đơn vị vận chuyển không hợp lệ' })
    .trim()
    .min(1, 'Đơn vị vận chuyển không được để trống')
    .max(50, 'Đơn vị vận chuyển tối đa 50 ký tự')
    .nullish()
    .transform((v) => v ?? undefined),
});
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;

export const refundPaymentSchema = z.object({
  paymentId: z
    .string({ error: 'Vui lòng chọn giao dịch cần hoàn tiền' })
    .trim()
    .min(1, 'Vui lòng chọn giao dịch cần hoàn tiền')
    .max(64, 'Mã giao dịch không hợp lệ'),
  note: z
    .string({ error: 'Vui lòng nhập ghi chú hoàn tiền' })
    .trim()
    .min(5, 'Ghi chú hoàn tiền tối thiểu 5 ký tự')
    .max(500, 'Ghi chú hoàn tiền tối đa 500 ký tự'),
});
export type RefundPaymentInput = z.infer<typeof refundPaymentSchema>;
