import { Router, type RequestHandler } from 'express';
import { optionalAuth, requireAuth } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './orders.controller.js';
import { bankTransferOwnerSchema } from '../payments/bankTransfer.schema.js';
import {
  cancelOrderSchema,
  createOrderSchema,
  myOrdersQuerySchema,
  trackOrderQuerySchema,
} from './orders.schema.js';

export interface OrdersRouterOptions {
  /** 10/phút/IP cho GET /orders/track (store riêng). */
  trackLimiter: RequestHandler;
  /** 5/phút/IP cho POST /orders/:code/cancel, đã tự bỏ qua request có Authorization. */
  guestCancelLimiter: RequestHandler;
  /** 10/phút/IP cho POST /orders (store riêng, đứng trước optionalAuth). */
  orderLimiter: RequestHandler;
  /** Hướng dẫn chuyển khoản và báo đã chuyển (store riêng, bỏ qua request có Authorization). */
  bankTransferLimiter: RequestHandler;
}

export function createOrdersRouter({
  trackLimiter,
  guestCancelLimiter,
  orderLimiter,
  bankTransferLimiter,
}: OrdersRouterOptions): Router {
  const router = Router();

  router.post(
    '/orders',
    orderLimiter,
    optionalAuth,
    controller.requireIdempotencyKey, // header kiểm TRƯỚC body
    validate(createOrderSchema),
    controller.createOrder,
  );

  router.get(
    '/me/orders',
    requireAuth,
    validate(myOrdersQuerySchema, 'query'),
    controller.listMyOrders,
  );

  // D-077: mua lại = thêm các dòng còn bán của đơn cũ vào giỏ của chính user.
  router.post('/me/orders/:code/reorder', requireAuth, controller.reorder);

  // Thứ tự: `/orders/track` PHẢI đứng trước `/orders/:code`, nếu không `:code` nuốt "track".
  router.get(
    '/orders/track',
    trackLimiter,
    validate(trackOrderQuerySchema, 'query'),
    controller.trackOrder,
  );
  // Limiter đứng trước optionalAuth để guest brute-force SĐT bị chặn kể cả khi token sai.
  router.post(
    '/orders/:code/cancel',
    guestCancelLimiter,
    optionalAuth,
    validate(cancelOrderSchema),
    controller.cancelOrder,
  );
  // D-061: hướng dẫn chuyển khoản (QR) và khách báo đã chuyển. Chủ đơn hoặc khách vãng lai + SĐT.
  router.get(
    '/orders/:code/bank-transfer',
    bankTransferLimiter,
    optionalAuth,
    validate(bankTransferOwnerSchema, 'query'),
    controller.getBankTransfer,
  );
  router.post(
    '/orders/:code/bank-transfer/claim',
    bankTransferLimiter,
    optionalAuth,
    validate(bankTransferOwnerSchema),
    controller.claimBankTransfer,
  );
  router.get('/orders/:code', requireAuth, controller.getOrder);

  return router;
}
