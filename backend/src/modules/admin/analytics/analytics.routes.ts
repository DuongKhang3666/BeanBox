import { Router } from 'express';
import { requireAdmin } from '../../../middlewares/auth.js';
import { validate } from '../../../middlewares/validate.js';
import { overview } from './analytics.controller.js';
import { overviewQuerySchema } from './analytics.schema.js';

/** Mount tại `/analytics` dưới admin router; chỉ Admin ở cấp router (api-contract §16, D-049). */
export const adminAnalyticsRouter = Router();
adminAnalyticsRouter.use(requireAdmin);

adminAnalyticsRouter.get('/overview', validate(overviewQuerySchema, 'query'), overview);
