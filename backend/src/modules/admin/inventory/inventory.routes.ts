import { Router } from 'express';
import { validate } from '../../../middlewares/validate.js';
import * as controller from './inventory.controller.js';
import { adjustSchema, inventoryQuerySchema, movementsQuerySchema } from './inventory.schema.js';

/** Mount ở gốc router admin (đã requireAuth + requireStaff); api-contract §12.2. */
export const inventoryRouter = Router();

inventoryRouter.get(
  '/inventory',
  validate(inventoryQuerySchema, 'query'),
  controller.listInventory,
);
inventoryRouter.post('/inventory/adjust', validate(adjustSchema), controller.adjust);
inventoryRouter.get(
  '/inventory/movements',
  validate(movementsQuerySchema, 'query'),
  controller.listMovements,
);
