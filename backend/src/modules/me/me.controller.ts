import type { Request } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { clearRefreshCookie } from '../auth/auth.cookies.js';
import { deleteAccount, exportFilename, exportPersonalData } from './me.account.js';
import type {
  CreateAddressInput,
  DeleteAccountInput,
  UpdateAddressInput,
  UpdateProfileInput,
} from './me.schema.js';
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

export const deleteMe = asyncHandler(async (req: Request, res) => {
  const { password } = req.body as DeleteAccountInput;
  await deleteAccount(uid(req), password, req.ip);
  clearRefreshCookie(res);
  res.status(204).end();
});

/** File tải về: thân là object JSON trực tiếp (không bọc `data`); tên file dựng từ ngày, không từ input. */
export const exportMe = asyncHandler(async (req: Request, res) => {
  const now = new Date();
  const payload = await exportPersonalData(uid(req), req.ip, now);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${exportFilename(now)}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(JSON.stringify(payload, null, 2));
});
