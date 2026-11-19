import { asyncHandler } from '../../lib/asyncHandler.js';
import type { CaptchaConfig, TurnstileVerifier } from '../../lib/turnstile.js';
import type { CreateContactInput } from './contact.schema.js';
import { submitContact } from './contact.service.js';

export const createContact = asyncHandler(async (req, res) => {
  const config = req.app.locals.captchaConfig as CaptchaConfig | null | undefined;
  const verify = req.app.locals.captchaVerify as TurnstileVerifier | undefined;
  const data = await submitContact(
    req.body as CreateContactInput,
    req.auth?.userId ?? null,
    config && verify ? { verify } : null,
  );
  res.status(201).json({ data });
});
