import type { PaymentProvider } from '@prisma/client';
import type { PaymentConfig } from '../../config/payments.js';
import { stripeAdapter, type StripeHttp } from './stripe.js';
import { buildVnpayUrl } from './vnpay.js';

/**
 * Adapter nhà cung cấp thanh toán: nơi DUY NHẤT khác nhau giữa VNPay và Stripe khi tạo phiên.
 * `createPaymentForOrder` lo quyền, điều kiện, tạo `Payment` PENDING; adapter chỉ dựng phiên.
 * Thêm provider = thêm một adapter vào `ADAPTERS`; chưa có adapter -> 409 UNAVAILABLE.
 */
export interface PaymentSessionContext {
  payment: { id: string; amount: number };
  order: { code: string; grandTotal: number; expiresAt: Date };
  ip: string;
  config: PaymentConfig;
  now: Date;
  /** HTTP client Stripe tiêm từ ngoài (test); mặc định dùng fetch theo cấu hình. */
  stripeHttp?: StripeHttp | undefined;
}

export interface PaymentSession {
  /** URL để FE chuyển hướng. */
  redirectUrl: string;
  /** Giá trị lưu vào Payment.providerRef (VNPay: Payment.id; Stripe: Checkout Session id). */
  providerRef: string;
}

export interface PaymentProviderAdapter {
  readonly provider: PaymentProvider;
  /** Cấu hình có đủ để dùng provider này không. */
  isConfigured(config: PaymentConfig): boolean;
  /** Có thể gọi mạng (Stripe); lỗi ném ra sẽ được service đổi thành Payment FAILED + 503. */
  createSession(ctx: PaymentSessionContext): Promise<PaymentSession>;
}

export const vnpayAdapter: PaymentProviderAdapter = {
  provider: 'VNPAY',
  isConfigured: (config) => config.vnpay !== null,
  createSession({ payment, order, ip, config, now }) {
    if (!config.vnpay) throw new Error('VNPay chưa được cấu hình');
    const redirectUrl = buildVnpayUrl(
      {
        txnRef: payment.id,
        amountVnd: payment.amount,
        orderCode: order.code,
        ipAddr: ip,
        createDate: now,
        expireDate: order.expiresAt,
      },
      config.vnpay,
    );
    return Promise.resolve({ redirectUrl, providerRef: payment.id });
  },
};

export type AdapterRegistry = Partial<Record<PaymentProvider, PaymentProviderAdapter>>;

export const ADAPTERS: AdapterRegistry = {
  VNPAY: vnpayAdapter,
  STRIPE: stripeAdapter,
};
