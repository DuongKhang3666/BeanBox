import { Router } from 'express';
import { requireAdmin } from '../../../middlewares/auth.js';
import { get, update } from './settings.controller.js';

/** Mount tại `/settings` dưới admin router; chỉ Admin (api-contract §14.9). */
export const adminSettingsRouter = Router();

adminSettingsRouter.get('/', requireAdmin, get);
adminSettingsRouter.put('/', requireAdmin, update);
