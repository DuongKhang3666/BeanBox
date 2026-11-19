import { Router } from 'express';
import { validate } from '../../../middlewares/validate.js';
import { detail, list, update } from './contact.controller.js';
import { listContactQuerySchema, updateContactSchema } from './contact.schema.js';

/** Mount tại `/contact-messages` dưới admin router; Staff+ (api-contract §14.11). Không có DELETE. */
export const adminContactRouter = Router();

adminContactRouter.get('/', validate(listContactQuerySchema, 'query'), list);
adminContactRouter.get('/:id', detail);
adminContactRouter.patch('/:id', validate(updateContactSchema), update);
