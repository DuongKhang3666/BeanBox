import { Router } from 'express';
import { requireAdmin } from '../../../middlewares/auth.js';
import { validate } from '../../../middlewares/validate.js';
import { detail, list, updateRole, updateStatus } from './users.controller.js';
import { listUsersQuerySchema, updateRoleSchema, updateStatusSchema } from './users.schema.js';

/** Mount tại `/users` dưới admin router; chỉ Admin (api-contract §14.10). */
export const adminUsersRouter = Router();

adminUsersRouter.use(requireAdmin);
adminUsersRouter.get('/', validate(listUsersQuerySchema, 'query'), list);
adminUsersRouter.get('/:id', detail);
adminUsersRouter.patch('/:id/status', validate(updateStatusSchema), updateStatus);
adminUsersRouter.patch('/:id/role', validate(updateRoleSchema), updateRole);
