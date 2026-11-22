import { Router, type RequestHandler } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './me.controller.js';
import {
  createAddressSchema,
  deleteAccountSchema,
  updateAddressSchema,
  updateProfileSchema,
} from './me.schema.js';

export interface MeRouterOptions {
  /** Giới hạn xóa tài khoản (cùng nhóm auth nhạy cảm, theo IP). */
  sensitiveLimiter: RequestHandler;
  /** Giới hạn xuất dữ liệu cá nhân; đặt SAU requireAuth nên khóa theo userId (D-065). */
  dataExportLimiter: RequestHandler;
}

export function createMeRouter({ sensitiveLimiter, dataExportLimiter }: MeRouterOptions): Router {
  const meRouter = Router();

  meRouter.get('/me', requireAuth, controller.getMe);
  meRouter.patch('/me', requireAuth, validate(updateProfileSchema), controller.updateMe);
  // D-065: chỉ CUSTOMER tự xóa (STAFF/ADMIN -> 403 trước cả validate).
  meRouter.delete(
    '/me',
    sensitiveLimiter,
    requireAuth,
    requireRole('CUSTOMER'),
    validate(deleteAccountSchema),
    controller.deleteMe,
  );
  meRouter.get('/me/export', requireAuth, dataExportLimiter, controller.exportMe);

  meRouter.get('/me/addresses', requireAuth, controller.listAddresses);
  meRouter.post(
    '/me/addresses',
    requireAuth,
    validate(createAddressSchema),
    controller.createAddress,
  );
  meRouter.patch(
    '/me/addresses/:id',
    requireAuth,
    validate(updateAddressSchema),
    controller.updateAddress,
  );
  meRouter.delete('/me/addresses/:id', requireAuth, controller.deleteAddress);
  meRouter.post('/me/addresses/:id/default', requireAuth, controller.setDefaultAddress);

  return meRouter;
}
