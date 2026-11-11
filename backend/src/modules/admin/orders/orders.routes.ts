import { Router } from 'express';
import { requireAdmin } from '../../../middlewares/auth.js';
import { validate } from '../../../middlewares/validate.js';
import * as controller from './orders.controller.js';
import {
  adminOrdersQuerySchema,
  refundPaymentSchema,
  updateOrderStatusSchema,
} from './orders.schema.js';

/** Mount tại `/orders` dưới admin router (đã requireAuth + requireStaff). */
export const adminOrdersRouter = Router();

adminOrdersRouter.get('/', validate(adminOrdersQuerySchema, 'query'), controller.listOrders);
adminOrdersRouter.get('/:code', controller.getOrder);
adminOrdersRouter.patch(
  '/:code/status',
  validate(updateOrderStatusSchema),
  controller.updateStatus,
);
// Ghi nhận hoàn tiền thủ công: chỉ Admin (D-015).
adminOrdersRouter.post(
  '/:code/refunds',
  requireAdmin,
  validate(refundPaymentSchema),
  controller.refundPayment,
);
