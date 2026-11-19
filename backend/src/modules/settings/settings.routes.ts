import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import type { CaptchaConfig } from '../../lib/turnstile.js';
import { getPublicSettings } from './settings.public.js';

/** Public, không auth (api-contract §14.9). Chỉ trả whitelist. */
export const settingsRouter = Router();

settingsRouter.get(
  '/settings/public',
  asyncHandler(async (req, res) => {
    const data = await getPublicSettings(
      (req.app.locals.captchaConfig as CaptchaConfig | null | undefined) ?? null,
    );
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({ data });
  }),
);
