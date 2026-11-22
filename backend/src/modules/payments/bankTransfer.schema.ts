import { z } from 'zod';

/** Query/body chung của hướng dẫn chuyển khoản và "đã chuyển khoản" (SĐT chỉ dành cho khách vãng lai). */
export const bankTransferOwnerSchema = z.preprocess(
  (v) => v ?? {},
  z.object({ phone: z.string({ error: 'Số điện thoại không hợp lệ' }).trim().max(30).optional() }),
);
export type BankTransferOwnerInput = { phone?: string | undefined };
