import { Router } from 'express';
import { requireAdmin } from '../../../middlewares/auth.js';
import { validate } from '../../../middlewares/validate.js';
import * as controller from './catalog.controller.js';
import {
  createBrandSchema,
  createCategorySchema,
  updateBrandSchema,
  updateCategorySchema,
} from './catalog.schema.js';

/** Mount ở gốc router admin (đã requireAuth + requireStaff); api-contract §12.3. */
export const adminCatalogRouter = Router();

adminCatalogRouter.get('/categories', controller.listCategories);
adminCatalogRouter.post('/categories', validate(createCategorySchema), controller.createCategory);
adminCatalogRouter.patch(
  '/categories/:id',
  validate(updateCategorySchema),
  controller.updateCategory,
);
adminCatalogRouter.delete('/categories/:id', requireAdmin, controller.deleteCategory);

adminCatalogRouter.get('/brands', controller.listBrands);
adminCatalogRouter.post('/brands', validate(createBrandSchema), controller.createBrand);
adminCatalogRouter.patch('/brands/:id', validate(updateBrandSchema), controller.updateBrand);
adminCatalogRouter.delete('/brands/:id', requireAdmin, controller.deleteBrand);
