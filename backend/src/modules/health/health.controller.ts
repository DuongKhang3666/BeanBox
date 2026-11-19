import type { RequestHandler } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { getHealth } from './health.service.js';

export const healthHandler = asyncHandler(async (_req, res) => {
  res.json({ data: await getHealth() });
});

export const liveHandler: RequestHandler = (_req, res) => {
  res.json({ data: { status: 'ok' } });
};
