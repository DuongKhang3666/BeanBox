import { asyncHandler } from '../../../lib/asyncHandler.js';
import { parseSettingsPatch } from './settings.schema.js';
import { getAdminSettings, updateSettings } from './settings.service.js';

export const get = asyncHandler(async (_req, res) => {
  res.json(await getAdminSettings());
});

export const update = asyncHandler(async (req, res) => {
  const patch = parseSettingsPatch(req.body);
  res.json(await updateSettings(patch, { userId: req.auth!.userId, ip: req.ip }));
});
