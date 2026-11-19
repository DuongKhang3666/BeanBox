import { Router, type RequestHandler } from 'express';
import { optionalAuth } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { createContact } from './contact.controller.js';
import { createContactSchema } from './contact.schema.js';

export interface ContactRouterOptions {
  /** 3 request/10 phút/IP (store riêng, đứng trước xác thực; §14.11). */
  contactLimiter: RequestHandler;
}

export function createContactRouter({ contactLimiter }: ContactRouterOptions): Router {
  const router = Router();
  router.post(
    '/contact',
    contactLimiter,
    optionalAuth,
    validate(createContactSchema),
    createContact,
  );
  return router;
}
