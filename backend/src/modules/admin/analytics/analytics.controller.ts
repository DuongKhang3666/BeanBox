import { asyncHandler } from '../../../lib/asyncHandler.js';
import type { OverviewQuery } from './analytics.schema.js';
import { getOverview } from './analytics.service.js';

export const overview = asyncHandler(async (req, res) => {
  res.json({ data: await getOverview(req.query as unknown as OverviewQuery) });
});
