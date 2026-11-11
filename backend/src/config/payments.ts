import { env, type Env } from './env.js';

/** Cấu hình thanh toán online (api-contract §13.0). Thiếu cấu hình -> phương thức tắt (null). */
export interface VnpayConfig {
  tmnCode: string;
  hashSecret: string;
  paymentUrl: string;
  returnUrl: string;
}

export interface StripeConfig {
  secretKey: string;
  webhookSecret: string | null;
}

export interface PaymentConfig {
  vnpay: VnpayConfig | null;
  stripe: StripeConfig | null;
}

export type OnlineProvider = 'VNPAY' | 'STRIPE';

type PaymentEnv = Pick<
  Env,
  | 'VNPAY_TMN_CODE'
  | 'VNPAY_HASH_SECRET'
  | 'VNPAY_PAYMENT_URL'
  | 'VNPAY_RETURN_URL'
  | 'STRIPE_SECRET_KEY'
  | 'STRIPE_WEBHOOK_SECRET'
>;

/** VNPAY bật khi có cả TMN_CODE và HASH_SECRET; STRIPE bật khi có STRIPE_SECRET_KEY (đã kiểm sk_test_ ở env). */
export function getPaymentConfig(source: PaymentEnv = env): PaymentConfig {
  const vnpay =
    source.VNPAY_TMN_CODE && source.VNPAY_HASH_SECRET
      ? {
          tmnCode: source.VNPAY_TMN_CODE,
          hashSecret: source.VNPAY_HASH_SECRET,
          paymentUrl: source.VNPAY_PAYMENT_URL,
          returnUrl: source.VNPAY_RETURN_URL,
        }
      : null;
  const stripe = source.STRIPE_SECRET_KEY
    ? { secretKey: source.STRIPE_SECRET_KEY, webhookSecret: source.STRIPE_WEBHOOK_SECRET ?? null }
    : null;
  return { vnpay, stripe };
}

export function isProviderEnabled(config: PaymentConfig, method: 'COD' | OnlineProvider): boolean {
  if (method === 'COD') return true;
  return method === 'VNPAY' ? config.vnpay !== null : config.stripe !== null;
}
