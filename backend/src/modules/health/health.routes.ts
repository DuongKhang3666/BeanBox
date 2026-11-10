import { Router } from 'express';
import { healthHandler } from './health.controller.js';

export const healthRouter = Router();
healthRouter.get('/health', healthHandler);
