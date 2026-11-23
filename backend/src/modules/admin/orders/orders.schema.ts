import { z } from 'zod';
import { csvEnum, dateOnly, paginationShape, refineDateRange } from '../admin.schema.js';

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
const PAYMENT_METHODS = ['COD', 'VNPAY', 'STRIPE', 'MOMO', 'BANK_TRANSFER'] as const;

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
    // D-061: chỉ nhận `true` (đơn chuyển khoản khách đã báo chuyển, đang chờ nhân viên xác nhận).
    transferClaimed: z
      .preprocess(
        (v) => (v === '' || v === undefined ? undefined : v),
        z.enum(['true', 'false'], { error: 'transferClaimed phải là true hoặc false' }).optional(),
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
  .superRefine(refineDateRange);
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
  // D-068: chuẩn hóa trim; rỗng/null -> undefined (server dùng mã đã có hoặc sinh mã giả lập).
  trackingNumber: z
    .string({ error: 'Mã vận đơn không hợp lệ' })
    .trim()
    .max(50, 'Mã vận đơn tối đa 50 ký tự')
    .refine(
      (v) => v === '' || /^[A-Za-z0-9-]+$/.test(v),
      'Mã vận đơn chỉ gồm chữ, số và dấu gạch ngang',
    )
    .nullish()
    .transform((v) => (v === '' || v == null ? undefined : v)),
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

// D-071: ghi chú nội bộ. Cho phép \t, \n, \r; chặn NUL và ký tự điều khiển khác.
// eslint-disable-next-line no-control-regex
const NOTE_FORBIDDEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
export const ORDER_NOTE_MAX = 2000;

export const addOrderNoteSchema = z.object({
  body: z
    .string({ error: 'Nội dung ghi chú không hợp lệ' })
    .trim()
    .min(1, 'Vui lòng nhập nội dung ghi chú')
    .max(ORDER_NOTE_MAX, `Ghi chú tối đa ${ORDER_NOTE_MAX} ký tự`)
    .refine((v) => !NOTE_FORBIDDEN.test(v), 'Ghi chú chứa ký tự không hợp lệ'),
});
export type AddOrderNoteInput = z.infer<typeof addOrderNoteSchema>;

// D-072: in hàng loạt, tối đa 50 mã (phân cách phẩy).
export const PRINT_MAX_CODES = 50;
export const printOrdersQuerySchema = z.object({
  codes: z
    .string({ error: 'Danh sách mã đơn không hợp lệ' })
    .transform((s) => [
      ...new Set(
        s
          .split(',')
          .map((x) => x.trim())
          .filter((x) => x.length > 0),
      ),
    ])
    .pipe(
      z
        .array(z.string().max(30, 'Mã đơn không hợp lệ'))
        .min(1, 'Vui lòng chọn ít nhất 1 đơn hàng')
        .max(PRINT_MAX_CODES, `Chỉ in tối đa ${PRINT_MAX_CODES} đơn mỗi lần`),
    ),
});
export type PrintOrdersQuery = z.infer<typeof printOrdersQuerySchema>;
