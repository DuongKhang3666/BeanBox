import type { Request } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import type { DisableInput, EnableInput, SetupInput } from './twoFactor.schema.js';
import * as service from './twoFactor.service.js';

const actorOf = (req: Request): service.Actor => ({
  userId: req.auth!.userId,
  sessionId: req.auth!.sessionId,
  ip: req.ip,
});

export const setup = asyncHandler(async (req, res) => {
  const data = await service.setup(actorOf(req), (req.body as SetupInput).password);
  res.json({ data });
});

export const enable = asyncHandler(async (req, res) => {
  const data = await service.enable(actorOf(req), (req.body as EnableInput).code);
  res.json({ data });
});

export const disable = asyncHandler(async (req, res) => {
  const body = req.body as DisableInput;
  await service.disable(actorOf(req), body.password, body.code);
  res.status(204).end();
});

export const regenerateBackupCodes = asyncHandler(async (req, res) => {
  const body = req.body as DisableInput;
  res.json({ data: await service.regenerateBackupCodes(actorOf(req), body.password, body.code) });
});
