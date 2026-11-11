import { Router } from 'express';
import * as controller from './locations.controller.js';

export const locationsRouter = Router();

locationsRouter.get('/locations/provinces', controller.getProvinces);
locationsRouter.get('/locations/provinces/:code/wards', controller.getWards);
