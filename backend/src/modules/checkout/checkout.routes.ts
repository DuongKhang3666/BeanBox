import { Router, type RequestHandler } from 'express';
import { optionalAuth } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './checkout.controller.js';
import { quoteSchema } from './checkout.schema.js';

export interface CheckoutRouterOptions {
  /** 30/phút/IP cho POST /checkout/quote (store riêng, đứng trước optionalAuth). */
  quoteLimiter: RequestHandler;
}

export function createCheckoutRouter({ quoteLimiter }: CheckoutRouterOptions): Router {
  const router = Router();

  router.post(
    '/checkout/quote',
    quoteLimiter,
    optionalAuth,
    validate(quoteSchema),
    controller.quote,
  );

  return router;
}
