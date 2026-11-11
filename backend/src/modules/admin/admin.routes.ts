import { Router, type RequestHandler } from 'express';
import { UPLOADS_DIR } from '../../config/paths.js';
import { requireAuth, requireStaff } from '../../middlewares/auth.js';
import { adminCatalogRouter } from './catalog/catalog.routes.js';
import { adminCouponsRouter } from './coupons/coupons.routes.js';
import { inventoryRouter } from './inventory/inventory.routes.js';
import { adminOrdersRouter } from './orders/orders.routes.js';
import { adminProductsRouter } from './products/products.routes.js';
import { createUploadsRouter } from './uploads/uploads.routes.js';

export interface AdminRouterOptions {
  /** 30/phút/IP, chỉ áp cho `/uploads` (store riêng). */
  uploadLimiter: RequestHandler;
  /** Thư mục lưu ảnh upload (mặc định backend/uploads). */
  uploadsDir?: string;
}

const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};

/** Mount tại `/api/v1/admin`. Chặn quyền ở cấp router (api-contract §12.0). */
export function createAdminRouter({ uploadLimiter, uploadsDir }: AdminRouterOptions): Router {
  const router = Router();
  router.use(noStore); // đặt trước auth để cả 401/403 cũng không bị cache
  router.use(requireAuth, requireStaff);

  router.use('/orders', adminOrdersRouter);
  router.use('/coupons', adminCouponsRouter);
  // Stub: các task sau điền route; mount ở gốc vì route tự khai báo đường dẫn đầy đủ.
  router.use(inventoryRouter);
  router.use(adminCatalogRouter);
  router.use(adminProductsRouter);
  // Router upload dùng `router.use(limiter)` nên PHẢI mount tại path riêng.
  router.use(
    '/uploads',
    createUploadsRouter({ uploadLimiter, uploadsDir: uploadsDir ?? UPLOADS_DIR }),
  );
  return router;
}
