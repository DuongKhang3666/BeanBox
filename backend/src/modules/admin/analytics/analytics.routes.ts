import { Router } from 'express';
import { requireAdmin } from '../../../middlewares/auth.js';
import { validate } from '../../../middlewares/validate.js';
import { breakdown, overview, topCustomers, topProducts } from './analytics.controller.js';
import {
  breakdownQuerySchema,
  overviewQuerySchema,
  topCustomersQuerySchema,
  topProductsQuerySchema,
} from './analytics.schema.js';

/** Mount tại `/analytics` dưới admin router; chỉ Admin ở cấp router (api-contract §16, D-049). */
export const adminAnalyticsRouter = Router();
adminAnalyticsRouter.use(requireAdmin);

adminAnalyticsRouter.get('/overview', validate(overviewQuerySchema, 'query'), overview);
adminAnalyticsRouter.get('/breakdown', validate(breakdownQuerySchema, 'query'), breakdown);
adminAnalyticsRouter.get('/top-products', validate(topProductsQuerySchema, 'query'), topProducts);
adminAnalyticsRouter.get(
  '/top-customers',
  validate(topCustomersQuerySchema, 'query'),
  topCustomers,
);
