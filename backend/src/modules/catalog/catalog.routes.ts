import { Router } from 'express';
import { validate } from '../../middlewares/validate.js';
import * as controller from './catalog.controller.js';
import { productListQuerySchema, suggestQuerySchema } from './catalog.schema.js';

export const catalogRouter = Router();

catalogRouter.get('/categories', controller.getCategories);
catalogRouter.get('/brands', controller.getBrands);
catalogRouter.get('/products', validate(productListQuerySchema, 'query'), controller.getProducts);
catalogRouter.get('/products/:slug', controller.getProduct);
catalogRouter.get('/search/suggest', validate(suggestQuerySchema, 'query'), controller.getSuggest);
