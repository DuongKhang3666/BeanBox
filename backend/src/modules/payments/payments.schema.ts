import { z } from 'zod';

/** Body của POST /payments/{vnpay,stripe}/create (api-contract §13.2). */
export const createPaymentSchema = z.object({
  code: z.string().trim().min(1, 'Vui lòng nhập mã đơn hàng').max(50, 'Mã đơn hàng không hợp lệ'),
  phone: z.string().trim().max(30, 'Số điện thoại không hợp lệ').optional(),
});

export type CreatePaymentBody = z.infer<typeof createPaymentSchema>;

/** Body của POST /payments/stripe/sync (api-contract §13.4). */
export const stripeSyncSchema = z.object({
  sessionId: z
    .string({ error: 'Mã phiên thanh toán không hợp lệ' })
    .trim()
    .max(255, 'Mã phiên thanh toán không hợp lệ')
    .regex(/^cs_(test_)?[A-Za-z0-9]+$/, 'Mã phiên thanh toán không hợp lệ'),
});

export type StripeSyncBody = z.infer<typeof stripeSyncSchema>;
