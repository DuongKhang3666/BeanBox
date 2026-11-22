import { Router, type RequestHandler } from 'express';
import { requireAuth, requireStaff } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './twoFactor.controller.js';
import { backupCodesSchema, disableSchema, enableSchema, setupSchema } from './twoFactor.schema.js';

export interface TwoFactorRouterOptions {
  sensitiveLimiter: RequestHandler;
}

/** `/me/2fa/*`: chỉ Staff/Admin (Customer -> 403), cùng limiter nhóm auth (D-063). */
export function createTwoFactorRouter({ sensitiveLimiter }: TwoFactorRouterOptions): Router {
  const router = Router();
  const guard = [sensitiveLimiter, requireAuth, requireStaff];

  router.post('/me/2fa/setup', ...guard, validate(setupSchema), controller.setup);
  router.post('/me/2fa/enable', ...guard, validate(enableSchema), controller.enable);
  router.post('/me/2fa/disable', ...guard, validate(disableSchema), controller.disable);
  router.post(
    '/me/2fa/backup-codes',
    ...guard,
    validate(backupCodesSchema),
    controller.regenerateBackupCodes,
  );
  return router;
}
