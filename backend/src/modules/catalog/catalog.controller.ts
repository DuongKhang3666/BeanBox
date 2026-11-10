import { asyncHandler } from '../../lib/asyncHandler.js';
import { AppError } from '../../lib/errors.js';
import type { ProductListQuery, SuggestQuery } from './catalog.schema.js';
import { slugSchema } from './catalog.schema.js';
import * as service from './catalog.service.js';

export const getCategories = asyncHandler(async (_req, res) => {
  res.json({ data: await service.listCategories() });
});

export const getBrands = asyncHandler(async (_req, res) => {
  res.json({ data: await service.listBrands() });
});

// req.query đã được middleware validate thay bằng bản đã parse
export const getProducts = asyncHandler(async (req, res) => {
  const { data, meta } = await service.listProducts(req.query as unknown as ProductListQuery);
  res.json({ data, meta });
});

export const getProduct = asyncHandler(async (req, res) => {
  const slug = slugSchema.safeParse(req.params.slug);
  // Slug sai định dạng coi như không tồn tại (404, không phải 400)
  if (!slug.success) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy sản phẩm');
  res.json({ data: await service.getProductBySlug(slug.data) });
});

export const getSuggest = asyncHandler(async (req, res) => {
  res.json({ data: await service.suggest(req.query as unknown as SuggestQuery) });
});
