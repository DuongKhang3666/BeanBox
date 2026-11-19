import { Router, type RequestHandler } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './reviews.controller.js';
import {
  createReviewSchema,
  listReviewsQuerySchema,
  updateReviewSchema,
} from './reviews.schema.js';

export interface ReviewsRouterOptions {
  /** 10/phút/IP cho POST/PATCH đánh giá (store riêng, đứng trước xác thực; §14.1). */
  writeLimiter: RequestHandler;
}

export function createReviewsRouter({ writeLimiter }: ReviewsRouterOptions): Router {
  const router = Router();

  router.get(
    '/products/:slug/reviews',
    validate(listReviewsQuerySchema, 'query'),
    controller.listProductReviews,
  );
  router.get('/products/:slug/reviews/me', requireAuth, controller.getMyReview);
  router.post(
    '/products/:slug/reviews',
    writeLimiter,
    requireAuth,
    validate(createReviewSchema),
    controller.createReview,
  );
  router.patch(
    '/reviews/:id',
    writeLimiter,
    requireAuth,
    validate(updateReviewSchema),
    controller.updateReview,
  );
  return router;
}
