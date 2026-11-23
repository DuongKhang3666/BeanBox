import express, { Router, type ErrorRequestHandler, type RequestHandler } from 'express';
import { AppError } from '../../../lib/errors.js';
import { requireAdmin } from '../../../middlewares/auth.js';
import { validate } from '../../../middlewares/validate.js';
import * as controller from './products.controller.js';
import { IMPORT_MAX_BYTES } from './productsCsv.js';
import {
  createImageSchema,
  createProductSchema,
  createVariantSchema,
  productListQuerySchema,
  reorderImagesSchema,
  updateImageSchema,
  updateProductSchema,
  updateVariantSchema,
} from './products.schema.js';

export interface AdminProductsRouterOptions {
  /** Cùng limiter xuất CSV của analytics (D-053), chỉ áp cho `/products/export`. */
  exportLimiter: RequestHandler;
  /** Limiter nhập CSV (D-073), áp cho `/products/import/*`; store riêng. */
  importLimiter: RequestHandler;
}

/** File quá 1 MB -> 413 PAYLOAD_TOO_LARGE. */
const importTooLarge: ErrorRequestHandler = (err, _req, _res, next) => {
  if ((err as { type?: string }).type === 'entity.too.large') {
    next(new AppError(413, 'PAYLOAD_TOO_LARGE', 'File CSV vượt quá dung lượng tối đa 1 MB'));
    return;
  }
  next(err);
};
const csvBody = express.raw({ type: ['text/csv', 'text/plain'], limit: IMPORT_MAX_BYTES });

/** Mount ở gốc router admin (đã requireAuth + requireStaff); api-contract §12.4, §12.4b. */
export function createAdminProductsRouter({
  exportLimiter,
  importLimiter,
}: AdminProductsRouterOptions): Router {
  const adminProductsRouter = Router();

  // D-073: khai báo TRƯỚC `/products/:id`. Chỉ Admin; limiter đứng SAU requireAdmin.
  adminProductsRouter.get(
    '/products/export',
    requireAdmin,
    exportLimiter,
    controller.exportProducts,
  );
  adminProductsRouter.post(
    '/products/import/preview',
    requireAdmin,
    importLimiter,
    csvBody,
    importTooLarge,
    controller.previewImport,
  );
  adminProductsRouter.post(
    '/products/import/commit',
    requireAdmin,
    importLimiter,
    csvBody,
    importTooLarge,
    controller.commitImport,
  );

  adminProductsRouter.get(
    '/products',
    validate(productListQuerySchema, 'query'),
    controller.listProducts,
  );
  adminProductsRouter.post('/products', validate(createProductSchema), controller.createProduct);
  adminProductsRouter.get('/products/:id', controller.getProduct);
  adminProductsRouter.patch(
    '/products/:id',
    validate(updateProductSchema),
    controller.updateProduct,
  );
  adminProductsRouter.delete('/products/:id', requireAdmin, controller.deleteProduct);
  adminProductsRouter.post('/products/:id/restore', requireAdmin, controller.restoreProduct);

  adminProductsRouter.post(
    '/products/:id/variants',
    validate(createVariantSchema),
    controller.createVariant,
  );
  adminProductsRouter.patch(
    '/variants/:id',
    validate(updateVariantSchema),
    controller.updateVariant,
  );
  adminProductsRouter.delete('/variants/:id', controller.deleteVariant);

  adminProductsRouter.post(
    '/products/:id/images',
    validate(createImageSchema),
    controller.createImage,
  );
  // PUT .../images/order khai báo trước các route có :imageId (khác method nên không đụng nhau).
  adminProductsRouter.put(
    '/products/:id/images/order',
    validate(reorderImagesSchema),
    controller.reorderImages,
  );
  adminProductsRouter.patch(
    '/products/:id/images/:imageId',
    validate(updateImageSchema),
    controller.updateImage,
  );
  adminProductsRouter.delete('/products/:id/images/:imageId', controller.deleteImage);
  return adminProductsRouter;
}
