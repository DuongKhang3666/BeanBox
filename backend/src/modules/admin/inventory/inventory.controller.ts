import type { Request } from 'express';
import { asyncHandler } from '../../../lib/asyncHandler.js';
import type { AdjustInput, InventoryQuery, MovementsQuery } from './inventory.schema.js';
import * as service from './inventory.service.js';

/** D-078: giá vốn chỉ trả cho Admin. */
const isAdmin = (req: Request) => req.auth?.role === 'ADMIN';

export const listInventory = asyncHandler(async (req, res) => {
  res.json(await service.listInventory(req.query as unknown as InventoryQuery, isAdmin(req)));
});

export const listMovements = asyncHandler(async (req, res) => {
  res.json(await service.listMovements(req.query as unknown as MovementsQuery, isAdmin(req)));
});

export const adjust = asyncHandler(async (req, res) => {
  const data = await service.adjustInventory({
    input: req.body as AdjustInput,
    actorId: req.auth!.userId,
    ip: req.ip ?? null,
    isAdmin: isAdmin(req),
  });
  res.json({ data });
});
