import { Router } from 'express';
import { validate } from '../../middlewares/validate.js';
import * as controller from './catalog.controller.js';
import {
  boughtTogetherQuerySchema,
  compareQuerySchema,
  productListQuerySchema,
  suggestQuerySchema,
} from './catalog.schema.js';

export const catalogRouter = Router();

catalogRouter.get('/categories', controller.getCategories);
catalogRouter.get('/categories/:slug', controller.getCategory);
catalogRouter.get('/brands', controller.getBrands);
catalogRouter.get('/products', validate(productListQuerySchema, 'query'), controller.getProducts);
// Phải khai báo trước `/products/:slug` (slug `compare` được dành riêng, xem admin products).
catalogRouter.get(
  '/products/compare',
  validate(compareQuerySchema, 'query'),
  controller.getCompare,
);
catalogRouter.get('/products/:slug', controller.getProduct);
catalogRouter.get(
  '/products/:slug/bought-together',
  validate(boughtTogetherQuerySchema, 'query'),
  controller.getBoughtTogether,
);
catalogRouter.get('/search/suggest', validate(suggestQuerySchema, 'query'), controller.getSuggest);
