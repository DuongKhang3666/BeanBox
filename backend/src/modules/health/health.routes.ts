import { Router } from 'express';
import { healthHandler, liveHandler } from './health.controller.js';

export const healthRouter = Router();
healthRouter.get('/health', healthHandler);
// Liveness (D-030): không chạm DB.
healthRouter.get('/health/live', liveHandler);
