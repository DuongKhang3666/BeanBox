import { Router, type RequestHandler } from 'express';
import { optionalAuth } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './payments.controller.js';
import { createPaymentSchema, stripeSyncSchema } from './payments.schema.js';

export interface PaymentsRouterOptions {
  /** 10/phút/IP cho POST /payments/*\/create (store riêng, đứng trước optionalAuth). */
  createLimiter: RequestHandler;
  /** 30/phút/IP cho GET /payments/vnpay/return (store riêng). */
  returnLimiter: RequestHandler;
  /** 30/phút/IP cho POST /payments/stripe/sync (store riêng). */
  syncLimiter: RequestHandler;
}

export function createPaymentsRouter({
  createLimiter,
  returnLimiter,
  syncLimiter,
}: PaymentsRouterOptions): Router {
  const router = Router();

  router.post(
    '/payments/vnpay/create',
    createLimiter,
    optionalAuth,
    validate(createPaymentSchema),
    controller.createVnpay,
  );
  // IPN: Public, xác thực bằng chữ ký; không rate limit riêng (VNPay gọi từ IP của họ).
  router.get('/payments/vnpay/ipn', controller.vnpayIpn);
  router.get('/payments/vnpay/return', returnLimiter, controller.vnpayReturn);

  // MoMo GIẢ (D-060): chỉ dùng được khi cấu hình `momo` có (PAYMENT_MOCKS_ENABLED); thiếu -> 409 UNAVAILABLE.
  router.post(
    '/payments/momo/create',
    createLimiter,
    optionalAuth,
    validate(createPaymentSchema),
    controller.createMomo,
  );
  router.post('/payments/momo/ipn', controller.momoIpn);
  router.get('/payments/momo/return', returnLimiter, controller.momoReturn);

  router.post(
    '/payments/stripe/create-session',
    createLimiter,
    optionalAuth,
    validate(createPaymentSchema),
    controller.createStripe,
  );
  // Webhook: body RAW do app.ts gắn trước express.json(); xác thực bằng chữ ký Stripe.
  router.post('/payments/stripe/webhook', controller.stripeWebhook);
  router.post(
    '/payments/stripe/sync',
    syncLimiter,
    validate(stripeSyncSchema),
    controller.stripeSync,
  );

  return router;
}
