import type { Request } from 'express';
import { asyncHandler } from '../../../lib/asyncHandler.js';
import * as images from './images.service.js';
import type {
  CreateImageInput,
  CreateProductInput,
  CreateVariantInput,
  ProductListQuery,
  ReorderImagesInput,
  UpdateImageInput,
  UpdateProductInput,
  UpdateVariantInput,
} from './products.schema.js';
import * as products from './products.service.js';
import type { Actor } from './products.shared.js';
import * as variants from './variants.service.js';

const actor = (req: Request): Actor => ({ actorId: req.auth!.userId, ip: req.ip ?? null });
const param = (req: Request, name: string) => String(req.params[name] ?? '');

export const listProducts = asyncHandler(async (req, res) => {
  res.json(await products.listProducts(req.query as unknown as ProductListQuery));
});
export const getProduct = asyncHandler(async (req, res) => {
  res.json({ data: await products.getProduct(param(req, 'id')) });
});
export const createProduct = asyncHandler(async (req, res) => {
  const data = await products.createProduct(req.body as CreateProductInput, actor(req));
  res.status(201).json({ data });
});
export const updateProduct = asyncHandler(async (req, res) => {
  const data = await products.updateProduct(
    param(req, 'id'),
    req.body as UpdateProductInput,
    actor(req),
  );
  res.json({ data });
});
export const deleteProduct = asyncHandler(async (req, res) => {
  await products.deleteProduct(param(req, 'id'), actor(req));
  res.status(204).end();
});

export const createVariant = asyncHandler(async (req, res) => {
  const data = await variants.createVariant(
    param(req, 'id'),
    req.body as CreateVariantInput,
    actor(req),
  );
  res.status(201).json({ data });
});
export const updateVariant = asyncHandler(async (req, res) => {
  const data = await variants.updateVariant(
    param(req, 'id'),
    req.body as UpdateVariantInput,
    actor(req),
  );
  res.json({ data });
});
export const deleteVariant = asyncHandler(async (req, res) => {
  await variants.deleteVariant(param(req, 'id'), actor(req));
  res.status(204).end();
});

export const createImage = asyncHandler(async (req, res) => {
  const data = await images.createImage(param(req, 'id'), req.body as CreateImageInput, actor(req));
  res.status(201).json({ data });
});
export const updateImage = asyncHandler(async (req, res) => {
  const data = await images.updateImage(
    param(req, 'id'),
    param(req, 'imageId'),
    req.body as UpdateImageInput,
    actor(req),
  );
  res.json({ data });
});
export const reorderImages = asyncHandler(async (req, res) => {
  const data = await images.reorderImages(
    param(req, 'id'),
    req.body as ReorderImagesInput,
    actor(req),
  );
  res.json({ data });
});
export const deleteImage = asyncHandler(async (req, res) => {
  const data = await images.deleteImage(param(req, 'id'), param(req, 'imageId'), actor(req));
  res.json({ data });
});
