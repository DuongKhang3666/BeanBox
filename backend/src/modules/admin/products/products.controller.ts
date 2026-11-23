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
import * as csv from './productsCsv.service.js';
import { AppError } from '../../../lib/errors.js';
import { safeCsvFilename, toCsv } from '../../../lib/csv.js';

const actor = (req: Request): Actor => ({
  actorId: req.auth!.userId,
  ip: req.ip ?? null,
  isAdmin: req.auth!.role === 'ADMIN',
});
const param = (req: Request, name: string) => String(req.params[name] ?? '');

export const listProducts = asyncHandler(async (req, res) => {
  res.json(await products.listProducts(req.query as unknown as ProductListQuery));
});
export const getProduct = asyncHandler(async (req, res) => {
  res.json({ data: await products.getProduct(param(req, 'id'), actor(req).isAdmin === true) });
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

export const restoreProduct = asyncHandler(async (req, res) => {
  res.json({ data: await products.restoreProduct(param(req, 'id'), actor(req)) });
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

// D-073: xuất/nhập CSV (chỉ Admin, đã chặn ở router).
const vnToday = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

export const exportProducts = asyncHandler(async (req, res) => {
  const file = await csv.buildProductsExport();
  await csv.auditExport(actor(req), file.rowCount);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${safeCsvFilename({ report: 'products', dates: vnToday() })}"`,
  );
  res.send(toCsv(file.rows));
});

/** Tên file từ query chỉ để hiển thị/audit: bỏ mọi ký tự ngoài [a-z0-9_.-], tối đa 60 ký tự. */
export function safeUploadName(raw: unknown): string {
  const base = typeof raw === 'string' ? raw.toLowerCase() : '';
  const cleaned = base
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/^[-.]+/, '')
    .slice(0, 60);
  return cleaned.length > 0 ? cleaned : 'import.csv';
}

function csvBuffer(req: Request): Buffer {
  const body: unknown = req.body;
  if (!Buffer.isBuffer(body) || body.length === 0) {
    throw new AppError(400, 'INVALID_CSV', 'Vui lòng gửi file CSV (Content-Type: text/csv)');
  }
  return body;
}

export const previewImport = asyncHandler(async (req, res) => {
  const data = await csv.previewImport(csvBuffer(req), safeUploadName(req.query.filename));
  res.json({ data });
});

export const commitImport = asyncHandler(async (req, res) => {
  const fingerprint = String(req.query.fingerprint ?? '');
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ', [
      { field: 'fingerprint', message: 'fingerprint phải là SHA-256 dạng hex (64 ký tự)' },
    ]);
  }
  const data = await csv.commitImport(
    csvBuffer(req),
    safeUploadName(req.query.filename),
    fingerprint,
    actor(req),
  );
  res.json({ data });
});
