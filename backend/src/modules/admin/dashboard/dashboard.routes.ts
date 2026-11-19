import { Router } from 'express';
import { dashboard } from './dashboard.controller.js';

/** Mount tại `/dashboard` dưới admin router (Staff+); api-contract §14.3. */
export const adminDashboardRouter = Router();

adminDashboardRouter.get('/', dashboard);
