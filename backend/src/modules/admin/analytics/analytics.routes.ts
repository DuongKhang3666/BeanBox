import { Router, type RequestHandler } from 'express';
import { requireAdmin } from '../../../middlewares/auth.js';
import { validate } from '../../../middlewares/validate.js';
import {
  breakdown,
  coupons,
  customers,
  exportCsv,
  inventory,
  operations,
  overview,
  topCustomers,
  topProducts,
} from './analytics.controller.js';
import {
  breakdownQuerySchema,
  couponsQuerySchema,
  exportQuerySchema,
  inventoryQuerySchema,
  overviewQuerySchema,
  rangeOnlyQuerySchema,
  topCustomersQuerySchema,
  topProductsQuerySchema,
} from './analytics.schema.js';

/**
 * Mount tại `/analytics` dưới admin router; chỉ Admin ở cấp router (api-contract §16, D-049).
 * `exportLimiter` chỉ áp cho `/export`, đặt SAU `requireAdmin`: request chưa xác thực hoặc không
 * đủ quyền không tiêu hạn mức xuất của admin (§16.4, D-053).
 */
export function createAdminAnalyticsRouter({
  exportLimiter,
}: {
  exportLimiter: RequestHandler;
}): Router {
  const adminAnalyticsRouter = Router();
  adminAnalyticsRouter.use(requireAdmin);
  adminAnalyticsRouter.get('/overview', validate(overviewQuerySchema, 'query'), overview);
  adminAnalyticsRouter.get('/breakdown', validate(breakdownQuerySchema, 'query'), breakdown);
  adminAnalyticsRouter.get('/top-products', validate(topProductsQuerySchema, 'query'), topProducts);
  adminAnalyticsRouter.get(
    '/top-customers',
    validate(topCustomersQuerySchema, 'query'),
    topCustomers,
  );
  adminAnalyticsRouter.get('/customers', validate(rangeOnlyQuerySchema, 'query'), customers);
  adminAnalyticsRouter.get('/operations', validate(rangeOnlyQuerySchema, 'query'), operations);
  adminAnalyticsRouter.get('/inventory', validate(inventoryQuerySchema, 'query'), inventory);
  adminAnalyticsRouter.get('/coupons', validate(couponsQuerySchema, 'query'), coupons);
  adminAnalyticsRouter.get(
    '/export',
    exportLimiter,
    validate(exportQuerySchema, 'query'),
    exportCsv,
  );

  return adminAnalyticsRouter;
}
