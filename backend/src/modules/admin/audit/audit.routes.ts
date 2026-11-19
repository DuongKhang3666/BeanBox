import { Router } from 'express';
import { requireAdmin } from '../../../middlewares/auth.js';
import { validate } from '../../../middlewares/validate.js';
import { list } from './audit.controller.js';
import { auditLogsQuerySchema } from './audit.schema.js';

/** Mount tại `/audit-logs` dưới admin router; chỉ Admin (api-contract §14.4). */
export const adminAuditRouter = Router();

adminAuditRouter.get('/', requireAdmin, validate(auditLogsQuerySchema, 'query'), list);
