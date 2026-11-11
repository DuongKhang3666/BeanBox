import { Router } from 'express';
import { requireAdmin } from '../../../middlewares/auth.js';
import { validate } from '../../../middlewares/validate.js';
import * as controller from './products.controller.js';
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

/** Mount ở gốc router admin (đã requireAuth + requireStaff); api-contract §12.4. */
export const adminProductsRouter = Router();

adminProductsRouter.get(
  '/products',
  validate(productListQuerySchema, 'query'),
  controller.listProducts,
);
adminProductsRouter.post('/products', validate(createProductSchema), controller.createProduct);
adminProductsRouter.get('/products/:id', controller.getProduct);
adminProductsRouter.patch('/products/:id', validate(updateProductSchema), controller.updateProduct);
adminProductsRouter.delete('/products/:id', requireAdmin, controller.deleteProduct);

adminProductsRouter.post(
  '/products/:id/variants',
  validate(createVariantSchema),
  controller.createVariant,
);
adminProductsRouter.patch('/variants/:id', validate(updateVariantSchema), controller.updateVariant);
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
