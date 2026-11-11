import { Router } from 'express';
import { requireAdmin } from '../../../middlewares/auth.js';
import { validate } from '../../../middlewares/validate.js';
import * as controller from './coupons.controller.js';
import {
  createCouponSchema,
  listCouponsQuerySchema,
  updateCouponSchema,
} from './coupons.schema.js';

/** Mount tại `/coupons` dưới admin router (đã requireAuth + requireStaff); api-contract §13.8. */
export const adminCouponsRouter = Router();

adminCouponsRouter.get('/', validate(listCouponsQuerySchema, 'query'), controller.listCoupons);
adminCouponsRouter.post('/', validate(createCouponSchema), controller.createCoupon);
adminCouponsRouter.get('/:id', controller.getCoupon);
adminCouponsRouter.patch('/:id', validate(updateCouponSchema), controller.updateCoupon);
adminCouponsRouter.delete('/:id', requireAdmin, controller.deleteCoupon);
