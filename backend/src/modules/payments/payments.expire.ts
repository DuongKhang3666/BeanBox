import { getPaymentConfig, type PaymentConfig } from '../../config/payments.js';
import { logger } from '../../lib/logger.js';
import { defaultStripeHttp, expireSession, type StripeHttp } from './stripe.js';

export interface ExpireSessionsOptions {
  paymentConfig?: PaymentConfig | undefined;
  /** HTTP client Stripe (test tiêm bản giả). */
  stripeHttp?: StripeHttp | undefined;
}

/**
 * Sau commit: best-effort expire các Checkout Session Stripe còn mở (api-contract §13.6, §14.7).
 * Stripe chưa cấu hình thì bỏ qua. Không bao giờ ném lỗi; lỗi chỉ log, không retry.
 */
export async function expireStripeSessionsBestEffort(
  orderId: string,
  sessionIds: readonly string[],
  opts: ExpireSessionsOptions = {},
): Promise<void> {
  if (sessionIds.length === 0) return;
  let http: StripeHttp | null | undefined = opts.stripeHttp;
  for (const sessionId of sessionIds) {
    try {
      http ??= defaultStripeHttp((opts.paymentConfig ?? getPaymentConfig()).stripe);
      if (!http) continue;
      await expireSession(http, sessionId);
    } catch (err) {
      logger.warn({ err, orderId, sessionId }, 'Expire phiên Stripe thất bại (bỏ qua)');
    }
  }
}
