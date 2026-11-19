import { Router } from 'express';
import { validate } from '../../../middlewares/validate.js';
import * as controller from './reviews.controller.js';
import {
  listAdminReviewsQuerySchema,
  replyReviewSchema,
  setReviewStatusSchema,
} from './reviews.schema.js';

/** Mount tại `/reviews` dưới admin router (đã requireAuth + requireStaff); api-contract §14.1. */
export const adminReviewsRouter = Router();

adminReviewsRouter.get('/', validate(listAdminReviewsQuerySchema, 'query'), controller.listReviews);
adminReviewsRouter.patch('/:id', validate(setReviewStatusSchema), controller.setStatus);
adminReviewsRouter.put('/:id/reply', validate(replyReviewSchema), controller.setReply);
adminReviewsRouter.delete('/:id/reply', controller.deleteReply);
