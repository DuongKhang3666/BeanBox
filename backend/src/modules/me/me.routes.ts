import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './me.controller.js';
import { createAddressSchema, updateAddressSchema, updateProfileSchema } from './me.schema.js';

export const meRouter = Router();

meRouter.get('/me', requireAuth, controller.getMe);
meRouter.patch('/me', requireAuth, validate(updateProfileSchema), controller.updateMe);

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
