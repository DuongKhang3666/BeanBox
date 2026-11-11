import type { Request } from 'express';
import { asyncHandler } from '../../../lib/asyncHandler.js';
import type { CreateCouponInput, ListCouponsQuery, UpdateCouponInput } from './coupons.schema.js';
import * as service from './coupons.service.js';

const actor = (req: Request): service.Actor => ({
  actorId: req.auth!.userId,
  ip: req.ip ?? null,
});
const idOf = (req: Request) => String(req.params.id ?? '');

export const listCoupons = asyncHandler(async (req, res) => {
  res.json(await service.listCoupons(req.query as unknown as ListCouponsQuery));
});
export const getCoupon = asyncHandler(async (req, res) => {
  res.json({ data: await service.getCoupon(idOf(req)) });
});
export const createCoupon = asyncHandler(async (req, res) => {
  const data = await service.createCoupon(req.body as CreateCouponInput, actor(req));
  res.status(201).json({ data });
});
export const updateCoupon = asyncHandler(async (req, res) => {
  const data = await service.updateCoupon(idOf(req), req.body as UpdateCouponInput, actor(req));
  res.json({ data });
});
export const deleteCoupon = asyncHandler(async (req, res) => {
  await service.deleteCoupon(idOf(req), actor(req));
  res.status(204).end();
});
