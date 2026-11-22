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

/** MoMo GIẢ (D-060): chỉ tồn tại khi PAYMENT_MOCKS_ENABLED. Không có bản MoMo thật. */
export interface MomoMockConfig {
  partnerCode: string;
  secret: string;
  /** Trang cổng giả của FE. */
  paymentUrl: string;
  returnUrl: string;
}

/** Chuyển khoản/VietQR (D-061). Thông tin tài khoản nằm ở settings `payment.bankTransfer`. */
export interface BankTransferConfig {
  holdHours: number;
}

export interface PaymentConfig {
  vnpay: VnpayConfig | null;
  stripe: StripeConfig | null;
  /** Các trường dưới đây tùy chọn: cấu hình dựng tay (test) không cần khai báo; thiếu = tắt. */
  momo?: MomoMockConfig | null;
  bankTransfer?: BankTransferConfig | null;
  /** true khi VNPay/MoMo đang là cổng giả (PAYMENT_MOCKS_ENABLED). */
  mocksEnabled?: boolean;
}

export type OnlineProvider = 'VNPAY' | 'STRIPE' | 'MOMO';
export type PaymentMethodName = 'COD' | OnlineProvider | 'BANK_TRANSFER';

export const MOCK_VNPAY_TMN_CODE = 'BEANBOXDEMO';
export const MOCK_MOMO_PARTNER_CODE = 'BEANBOXMOMODEMO';
export const MOCK_GATEWAY_PATH = '/cong-thanh-toan-gia-lap';

type PaymentEnv = Pick<
  Env,
  | 'VNPAY_TMN_CODE'
  | 'VNPAY_HASH_SECRET'
  | 'VNPAY_PAYMENT_URL'
  | 'VNPAY_RETURN_URL'
  | 'STRIPE_SECRET_KEY'
  | 'STRIPE_WEBHOOK_SECRET'
> &
  Partial<
    Pick<
      Env,
      | 'PAYMENT_MOCKS_ENABLED'
      | 'PAYMENT_MOCK_SECRET'
      | 'BANK_TRANSFER_ENABLED'
      | 'BANK_TRANSFER_HOLD_HOURS'
      | 'WEB_APP_URL'
    >
  >;

/**
 * VNPAY bật khi có cả TMN_CODE và HASH_SECRET, hoặc khi cổng giả bật (D-060: tmnCode demo, khóa
 * PAYMENT_MOCK_SECRET, URL = trang giả của FE); STRIPE bật khi có STRIPE_SECRET_KEY (đã kiểm sk_test_ ở env).
 */
export function getPaymentConfig(source: PaymentEnv = env): PaymentConfig {
  const webUrl = source.WEB_APP_URL ?? 'http://localhost:3000';
  const mockSecret = source.PAYMENT_MOCK_SECRET;
  const mocks = source.PAYMENT_MOCKS_ENABLED === true && !!mockSecret;
  const vnpay: VnpayConfig | null = mocks
    ? {
        tmnCode: MOCK_VNPAY_TMN_CODE,
        hashSecret: mockSecret,
        paymentUrl: `${webUrl}${MOCK_GATEWAY_PATH}/vnpay`,
        // Cổng giả luôn quay về đúng web app đang chạy (không theo VNPAY_RETURN_URL của sandbox).
        returnUrl: `${webUrl}/thanh-toan/ket-qua?provider=vnpay`,
      }
    : source.VNPAY_TMN_CODE && source.VNPAY_HASH_SECRET
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
  const base: PaymentConfig = { vnpay, stripe };
  if (mocks) {
    base.momo = {
      partnerCode: MOCK_MOMO_PARTNER_CODE,
      secret: mockSecret,
      paymentUrl: `${webUrl}${MOCK_GATEWAY_PATH}/momo`,
      returnUrl: `${webUrl}/thanh-toan/ket-qua?provider=momo`,
    };
    base.mocksEnabled = true;
  }
  if (source.BANK_TRANSFER_ENABLED === true) {
    base.bankTransfer = { holdHours: source.BANK_TRANSFER_HOLD_HOURS ?? 24 };
  }
  return base;
}

export function isProviderEnabled(config: PaymentConfig, method: PaymentMethodName): boolean {
  switch (method) {
    case 'COD':
      return true;
    case 'VNPAY':
      return config.vnpay !== null;
    case 'STRIPE':
      return config.stripe !== null;
    case 'MOMO':
      return !!config.momo;
    case 'BANK_TRANSFER':
      return !!config.bankTransfer;
  }
}
