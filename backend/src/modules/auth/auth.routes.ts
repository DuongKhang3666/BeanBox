import { Router, type RequestHandler } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { requireAllowedOrigin } from '../../middlewares/originCheck.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './auth.controller.js';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from './auth.schema.js';

export interface AuthRouterOptions {
  sensitiveLimiter: RequestHandler;
}

export function createAuthRouter({ sensitiveLimiter }: AuthRouterOptions): Router {
  const router = Router();

  router.post('/auth/register', sensitiveLimiter, validate(registerSchema), controller.register);
  router.post('/auth/login', sensitiveLimiter, validate(loginSchema), controller.login);
  router.post('/auth/refresh', requireAllowedOrigin, controller.refresh);
  router.post('/auth/logout', requireAllowedOrigin, controller.logout);
  router.post(
    '/auth/forgot-password',
    sensitiveLimiter,
    validate(forgotPasswordSchema),
    controller.forgotPassword,
  );
  router.post(
    '/auth/reset-password',
    sensitiveLimiter,
    validate(resetPasswordSchema),
    controller.resetPassword,
  );
  router.post('/auth/verify-email', validate(verifyEmailSchema), controller.verifyEmail);
  router.post('/auth/resend-verification', requireAuth, controller.resendVerification);
  router.post(
    '/auth/change-password',
    sensitiveLimiter,
    requireAuth,
    validate(changePasswordSchema),
    controller.changePassword,
  );

  return router;
}
