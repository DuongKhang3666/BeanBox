import { asyncHandler } from '../../lib/asyncHandler.js';
import { getHealth } from './health.service.js';

export const healthHandler = asyncHandler(async (_req, res) => {
  res.json({ data: await getHealth() });
});
