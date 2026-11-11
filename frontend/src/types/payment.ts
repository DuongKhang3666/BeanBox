import type { OrderStatus, PaymentStatus } from "./order";

/** docs/api-contract.md §13.2 */
export interface PaymentSession {
  redirectUrl: string;
  paymentId: string;
  expiresAt: string | null;
}

/** §13.3: kết quả xử lý do server xác minh (không chứa PII). */
export interface PaymentResult {
  orderCode: string;
  result: "SUCCEEDED" | "FAILED" | "PENDING";
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  canPay: boolean;
  expiresAt: string | null;
}

export type OnlineProvider = "VNPAY" | "STRIPE";
