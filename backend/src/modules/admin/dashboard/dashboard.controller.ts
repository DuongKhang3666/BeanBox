import { asyncHandler } from '../../../lib/asyncHandler.js';
import { getDashboard } from './dashboard.service.js';

export const dashboard = asyncHandler(async (_req, res) => {
  res.json({ data: await getDashboard() });
});
