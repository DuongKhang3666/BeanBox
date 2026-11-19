import { asyncHandler } from '../../../lib/asyncHandler.js';
import type { ListContactQuery, UpdateContactInput } from './contact.schema.js';
import { getContactMessage, listContactMessages, updateContactMessage } from './contact.service.js';

export const list = asyncHandler(async (req, res) => {
  res.json(await listContactMessages(req.query as unknown as ListContactQuery));
});

export const detail = asyncHandler(async (req, res) => {
  res.json({ data: await getContactMessage(String(req.params.id)) });
});

export const update = asyncHandler(async (req, res) => {
  const data = await updateContactMessage(String(req.params.id), req.body as UpdateContactInput, {
    userId: req.auth!.userId,
    ip: req.ip,
  });
  res.json({ data });
});
