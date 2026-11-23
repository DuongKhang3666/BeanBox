import { Router } from 'express';
import { publicCatalogCache } from '../../middlewares/publicCache.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './catalog.controller.js';
import {
  boughtTogetherQuerySchema,
  compareQuerySchema,
  productListQuerySchema,
  suggestQuerySchema,
} from './catalog.schema.js';

export const catalogRouter = Router();

// D-075: mỗi route khai báo `cache` riêng (KHÔNG dùng router.use: router mount ở gốc API, sẽ dính mọi path).
const cache = publicCatalogCache;

catalogRouter.get('/categories', cache, controller.getCategories);
catalogRouter.get('/categories/:slug', cache, controller.getCategory);
catalogRouter.get('/brands', cache, controller.getBrands);
catalogRouter.get(
  '/products',
  cache,
  validate(productListQuerySchema, 'query'),
  controller.getProducts,
);
// Phải khai báo trước `/products/:slug` (slug `compare` được dành riêng, xem admin products).
catalogRouter.get(
  '/products/compare',
  cache,
  validate(compareQuerySchema, 'query'),
  controller.getCompare,
);
catalogRouter.get('/products/:slug', cache, controller.getProduct);
catalogRouter.get(
  '/products/:slug/bought-together',
  cache,
  validate(boughtTogetherQuerySchema, 'query'),
  controller.getBoughtTogether,
);
catalogRouter.get(
  '/search/suggest',
  cache,
  validate(suggestQuerySchema, 'query'),
  controller.getSuggest,
);
