import { asyncHandler } from '../../lib/asyncHandler.js';
import type { CreateAddressInput, UpdateAddressInput, UpdateProfileInput } from './me.schema.js';
import * as service from './me.service.js';

const uid = (req: { auth?: { userId: string } }): string => req.auth!.userId;
const idOf = (req: { params: Record<string, unknown> }): string => String(req.params.id ?? '');

export const getMe = asyncHandler(async (req, res) => {
  res.json({ data: await service.getProfile(uid(req)) });
});

export const updateMe = asyncHandler(async (req, res) => {
  res.json({ data: await service.updateProfile(uid(req), req.body as UpdateProfileInput) });
});

export const listAddresses = asyncHandler(async (req, res) => {
  res.json({ data: await service.listAddresses(uid(req)) });
});

export const createAddress = asyncHandler(async (req, res) => {
  const data = await service.createAddress(uid(req), req.body as CreateAddressInput);
  res.status(201).json({ data });
});

export const updateAddress = asyncHandler(async (req, res) => {
  const data = await service.updateAddress(uid(req), idOf(req), req.body as UpdateAddressInput);
  res.json({ data });
});

export const deleteAddress = asyncHandler(async (req, res) => {
  await service.deleteAddress(uid(req), idOf(req));
  res.status(204).end();
});

export const setDefaultAddress = asyncHandler(async (req, res) => {
  res.json({ data: await service.setDefaultAddress(uid(req), idOf(req)) });
});
