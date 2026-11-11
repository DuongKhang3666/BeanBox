import { z } from 'zod';
import { phoneSchema } from '../../lib/phone.js';

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Email không đúng định dạng').max(254, 'Email tối đa 254 ký tự'));

const shippingAddressSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Họ tên tối thiểu 2 ký tự')
    .max(100, 'Họ tên tối đa 100 ký tự'),
  phone: phoneSchema,
  provinceCode: z
    .string()
    .trim()
    .regex(/^\d{2}$/, 'Mã tỉnh/thành không hợp lệ'),
  wardCode: z
    .string()
    .trim()
    .regex(/^\d{5}$/, 'Mã phường/xã không hợp lệ'),
  line1: z
    .string()
    .trim()
    .min(5, 'Địa chỉ cụ thể tối thiểu 5 ký tự')
    .max(200, 'Địa chỉ cụ thể tối đa 200 ký tự'),
});

export const createOrderSchema = z
  .object({
    contact: z.object({ email: emailSchema.optional(), phone: phoneSchema.optional() }).optional(),
    addressId: z
      .string()
      .trim()
      .min(1, 'Địa chỉ không hợp lệ')
      .max(50, 'Địa chỉ không hợp lệ')
      .optional(),
    shippingAddress: shippingAddressSchema.optional(),
    shippingMethod: z.enum(['STANDARD', 'EXPRESS'], {
      error: 'Phương thức vận chuyển không hợp lệ',
    }),
    paymentMethod: z.enum(['COD', 'VNPAY', 'STRIPE'], {
      error: 'Phương thức thanh toán không hợp lệ',
    }),
    couponCode: z
      .string()
      .trim()
      .min(1, 'Mã giảm giá không hợp lệ')
      .max(50, 'Mã giảm giá quá dài')
      .optional(),
    note: z
      .string()
      .trim()
      .max(500, 'Ghi chú tối đa 500 ký tự')
      .transform((v) => (v === '' ? null : v))
      .optional(),
    acceptTerms: z.literal(true, { error: 'Bạn cần đồng ý với điều khoản để đặt hàng' }),
    expectedTotal: z
      .number({ error: 'Tổng tiền không hợp lệ' })
      .int('Tổng tiền không hợp lệ')
      .min(0, 'Tổng tiền không hợp lệ')
      .optional(),
  })
  .superRefine((v, ctx) => {
    const both = v.addressId !== undefined && v.shippingAddress !== undefined;
    const none = v.addressId === undefined && v.shippingAddress === undefined;
    if (both) {
      ctx.addIssue({
        code: 'custom',
        path: ['shippingAddress'],
        message: 'Chỉ gửi một trong hai: địa chỉ đã lưu hoặc địa chỉ giao hàng mới',
      });
    } else if (none) {
      ctx.addIssue({
        code: 'custom',
        path: ['shippingAddress'],
        message: 'Vui lòng chọn hoặc nhập địa chỉ giao hàng',
      });
    }
  });
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

// ---------------------------------------------------------------------------
// Hủy đơn, tra cứu, danh sách đơn của tôi

const ORDER_STATUSES = [
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

/** `phone` chỉ được chuẩn hóa/kiểm ở service (đăng nhập thì bỏ qua hoàn toàn). */
export const cancelOrderSchema = z.preprocess(
  (v) => v ?? {},
  z.object({
    reason: z
      .string({ error: 'Lý do không hợp lệ' })
      .trim()
      .max(255, 'Lý do tối đa 255 ký tự')
      .transform((v) => (v === '' ? null : v))
      .optional(),
    phone: z.string({ error: 'Số điện thoại không hợp lệ' }).max(50).optional(),
  }),
);
export type CancelOrderInput = { reason?: string | null; phone?: string };

export const trackOrderQuerySchema = z.object({
  code: z
    .string({ error: 'Vui lòng nhập mã đơn hàng' })
    .trim()
    .min(1, 'Vui lòng nhập mã đơn hàng')
    .max(50, 'Mã đơn hàng không hợp lệ'),
  phone: z.string({ error: 'Vui lòng nhập số điện thoại' }).pipe(phoneSchema),
});
export type TrackOrderQuery = z.infer<typeof trackOrderQuerySchema>;

const intParam = (min: number, max: number, label: string) =>
  z
    .string({ error: `${label} không hợp lệ` })
    .trim()
    .regex(/^\d+$/, `${label} phải là số nguyên không âm`)
    .transform(Number)
    .pipe(
      z
        .number()
        .int()
        .min(min, `${label} phải từ ${min} đến ${max}`)
        .max(max, `${label} phải từ ${min} đến ${max}`),
    );

export const myOrdersQuerySchema = z.object({
  status: z
    .preprocess(
      (v) => (Array.isArray(v) ? v.join(',') : v),
      z
        .string()
        .transform((s) =>
          s
            .split(',')
            .map((x) => x.trim())
            .filter((x) => x.length > 0),
        )
        .pipe(
          z.array(z.enum(ORDER_STATUSES, { error: 'Trạng thái đơn hàng không hợp lệ' })).max(10),
        )
        .transform((arr) => (arr.length > 0 ? [...new Set(arr)] : undefined)),
    )
    .optional(),
  page: intParam(1, 1_000_000, 'page').default(1),
  pageSize: intParam(1, 100, 'pageSize').default(20),
});
export type MyOrdersQuery = z.infer<typeof myOrdersQuerySchema>;
