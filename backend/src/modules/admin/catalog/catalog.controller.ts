import type { Request } from 'express';
import { asyncHandler } from '../../../lib/asyncHandler.js';
import type {
  CreateBrandInput,
  CreateCategoryInput,
  UpdateBrandInput,
  UpdateCategoryInput,
} from './catalog.schema.js';
import * as service from './catalog.service.js';

const actor = (req: Request): service.Actor => ({
  actorId: req.auth!.userId,
  ip: req.ip ?? null,
});
const idOf = (req: Request) => String(req.params.id ?? '');

export const listCategories = asyncHandler(async (_req, res) => {
  res.json({ data: await service.listCategories() });
});
export const createCategory = asyncHandler(async (req, res) => {
  const data = await service.createCategory(req.body as CreateCategoryInput, actor(req));
  res.status(201).json({ data });
});
export const updateCategory = asyncHandler(async (req, res) => {
  const data = await service.updateCategory(idOf(req), req.body as UpdateCategoryInput, actor(req));
  res.json({ data });
});
export const deleteCategory = asyncHandler(async (req, res) => {
  await service.deleteCategory(idOf(req), actor(req));
  res.status(204).end();
});

export const listBrands = asyncHandler(async (_req, res) => {
  res.json({ data: await service.listBrands() });
});
export const createBrand = asyncHandler(async (req, res) => {
  const data = await service.createBrand(req.body as CreateBrandInput, actor(req));
  res.status(201).json({ data });
});
export const updateBrand = asyncHandler(async (req, res) => {
  const data = await service.updateBrand(idOf(req), req.body as UpdateBrandInput, actor(req));
  res.json({ data });
});
export const deleteBrand = asyncHandler(async (req, res) => {
  await service.deleteBrand(idOf(req), actor(req));
  res.status(204).end();
});
