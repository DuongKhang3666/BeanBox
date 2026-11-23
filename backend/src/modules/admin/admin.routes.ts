import { Router, type RequestHandler } from 'express';
import { UPLOADS_DIR } from '../../config/paths.js';
import { requireAdminTwoFactor, requireAuth, requireStaff } from '../../middlewares/auth.js';
import { createAdminAnalyticsRouter } from './analytics/analytics.routes.js';
import { adminAuditRouter } from './audit/audit.routes.js';
import { adminCatalogRouter } from './catalog/catalog.routes.js';
import { adminContactRouter } from './contact/contact.routes.js';
import { adminCouponsRouter } from './coupons/coupons.routes.js';
import { adminDashboardRouter } from './dashboard/dashboard.routes.js';
import { inventoryRouter } from './inventory/inventory.routes.js';
import { adminOrdersRouter } from './orders/orders.routes.js';
import { createAdminProductsRouter } from './products/products.routes.js';
import { adminReviewsRouter } from './reviews/reviews.routes.js';
import { adminSettingsRouter } from './settings/settings.routes.js';
import { adminUsersRouter } from './users/users.routes.js';
import { createUploadsRouter } from './uploads/uploads.routes.js';

export interface AdminRouterOptions {
  /** 30/phút/IP, chỉ áp cho `/uploads` (store riêng). */
  uploadLimiter: RequestHandler;
  /** 10/phút/IP (env EXPORT_RATE_LIMIT_PER_MIN), chỉ áp cho `/analytics/export` (store riêng). */
  exportLimiter: RequestHandler;
  /** D-073: nhập CSV sản phẩm (20/phút/IP), chỉ áp cho `/products/import/*` (store riêng). */
  importLimiter: RequestHandler;
  /** Thư mục lưu ảnh upload (mặc định backend/uploads). */
  uploadsDir?: string;
}

const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};

/** Mount tại `/api/v1/admin`. Chặn quyền ở cấp router (api-contract §12.0). */
export function createAdminRouter({
  uploadLimiter,
  exportLimiter,
  importLimiter,
  uploadsDir,
}: AdminRouterOptions): Router {
  const router = Router();
  router.use(noStore); // đặt trước auth để cả 401/403 cũng không bị cache
  router.use(requireAuth, requireStaff, requireAdminTwoFactor);

  router.use('/orders', adminOrdersRouter);
  router.use('/coupons', adminCouponsRouter);
  router.use('/reviews', adminReviewsRouter);
  router.use('/dashboard', adminDashboardRouter);
  router.use('/analytics', createAdminAnalyticsRouter({ exportLimiter }));
  router.use('/audit-logs', adminAuditRouter);
  router.use('/settings', adminSettingsRouter);
  router.use('/users', adminUsersRouter);
  router.use('/contact-messages', adminContactRouter);
  // Các router dưới đây mount ở gốc vì route tự khai báo đường dẫn đầy đủ (inventory, catalog, products).
  router.use(inventoryRouter);
  router.use(adminCatalogRouter);
  router.use(createAdminProductsRouter({ exportLimiter, importLimiter }));
  // Router upload dùng `router.use(limiter)` nên PHẢI mount tại path riêng.
  router.use(
    '/uploads',
    createUploadsRouter({ uploadLimiter, uploadsDir: uploadsDir ?? UPLOADS_DIR }),
  );
  return router;
}
