import { asyncHandler } from '../../../lib/asyncHandler.js';
import type { AdjustInput, InventoryQuery, MovementsQuery } from './inventory.schema.js';
import * as service from './inventory.service.js';

export const listInventory = asyncHandler(async (req, res) => {
  res.json(await service.listInventory(req.query as unknown as InventoryQuery));
});

export const listMovements = asyncHandler(async (req, res) => {
  res.json(await service.listMovements(req.query as unknown as MovementsQuery));
});

export const adjust = asyncHandler(async (req, res) => {
  const data = await service.adjustInventory({
    input: req.body as AdjustInput,
    actorId: req.auth!.userId,
    ip: req.ip ?? null,
  });
  res.json({ data });
});
