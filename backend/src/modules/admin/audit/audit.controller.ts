import { asyncHandler } from '../../../lib/asyncHandler.js';
import type { AuditLogsQuery } from './audit.schema.js';
import { listAuditLogs } from './audit.service.js';

export const list = asyncHandler(async (req, res) => {
  res.json(await listAuditLogs(req.query as unknown as AuditLogsQuery));
});
