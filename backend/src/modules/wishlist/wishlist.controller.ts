import { asyncHandler } from '../../lib/asyncHandler.js';
import type { AddWishlistInput } from './wishlist.schema.js';
import * as service from './wishlist.service.js';

export const list = asyncHandler(async (req, res) => {
  res.json({ data: await service.listWishlist(req.auth!.userId) });
});

export const ids = asyncHandler(async (req, res) => {
  res.json({ data: await service.listWishlistIds(req.auth!.userId) });
});

export const add = asyncHandler(async (req, res) => {
  const { productId } = req.body as AddWishlistInput;
  const { created, ...data } = await service.addToWishlist(req.auth!.userId, productId);
  res.status(created ? 201 : 200).json({ data });
});

export const remove = asyncHandler(async (req, res) => {
  const productId = String(req.params.productId ?? '');
  // Id lạ (quá dài, chứa NUL) chắc chắn không có trong bảng: vẫn 204 (idempotent)
  if (productId.length <= 50 && !productId.includes('\u0000')) {
    await service.removeFromWishlist(req.auth!.userId, productId);
  }
  res.status(204).end();
});
