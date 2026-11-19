import { asyncHandler } from '../../lib/asyncHandler.js';
import type { CreateContactInput } from './contact.schema.js';
import { submitContact } from './contact.service.js';

export const createContact = asyncHandler(async (req, res) => {
  const data = await submitContact(req.body as CreateContactInput, req.auth?.userId ?? null);
  res.status(201).json({ data });
});
