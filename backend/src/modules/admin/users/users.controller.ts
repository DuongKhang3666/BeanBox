import { asyncHandler } from '../../../lib/asyncHandler.js';
import type { ListUsersQuery, UpdateRoleInput, UpdateStatusInput } from './users.schema.js';
import {
  getUserDetail,
  listUsers,
  resetUserTwoFactor,
  updateUserRole,
  updateUserStatus,
} from './users.service.js';

export const list = asyncHandler(async (req, res) => {
  res.json(await listUsers(req.query as unknown as ListUsersQuery));
});

export const detail = asyncHandler(async (req, res) => {
  res.json({ data: await getUserDetail(String(req.params.id)) });
});

export const updateStatus = asyncHandler(async (req, res) => {
  const body = req.body as UpdateStatusInput;
  const data = await updateUserStatus(String(req.params.id), body, {
    userId: req.auth!.userId,
    ip: req.ip,
  });
  res.json({ data });
});

export const updateRole = asyncHandler(async (req, res) => {
  const body = req.body as UpdateRoleInput;
  const data = await updateUserRole(String(req.params.id), body.role, {
    userId: req.auth!.userId,
    ip: req.ip,
  });
  res.json({ data });
});

export const resetTwoFactor = asyncHandler(async (req, res) => {
  const data = await resetUserTwoFactor(String(req.params.id), {
    userId: req.auth!.userId,
    ip: req.ip,
  });
  res.json({ data });
});
