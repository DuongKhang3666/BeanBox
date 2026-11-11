import { Router, type RequestHandler } from 'express';
import { optionalAuth, requireAuth } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './cart.controller.js';
import { addItemSchema, applyCouponSchema, updateItemSchema } from './cart.schema.js';

export interface CartRouterOptions {
  /** 10/phút/IP cho POST /cart/apply-coupon (store riêng, đứng trước optionalAuth). */
  couponLimiter: RequestHandler;
}

export function createCartRouter({ couponLimiter }: CartRouterOptions): Router {
  const router = Router();

  router.get('/cart', optionalAuth, controller.getCart);
  router.delete('/cart', optionalAuth, controller.clearCart);
  router.post('/cart/items', optionalAuth, validate(addItemSchema), controller.addItem);
  router.patch(
    '/cart/items/:itemId',
    optionalAuth,
    validate(updateItemSchema),
    controller.updateItem,
  );
  router.delete('/cart/items/:itemId', optionalAuth, controller.removeItem);
  router.post('/cart/merge', requireAuth, controller.mergeCart);
  router.post(
    '/cart/apply-coupon',
    couponLimiter,
    optionalAuth,
    validate(applyCouponSchema),
    controller.applyCoupon,
  );
  router.delete('/cart/coupon', optionalAuth, controller.removeCoupon);

  return router;
}
