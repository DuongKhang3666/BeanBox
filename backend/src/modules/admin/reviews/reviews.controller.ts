import type { Request } from 'express';
import { asyncHandler } from '../../../lib/asyncHandler.js';
import type {
  ListAdminReviewsQuery,
  ReplyReviewInput,
  SetReviewStatusInput,
} from './reviews.schema.js';
import * as service from './reviews.service.js';

const actor = (req: Request): service.Actor => ({
  actorId: req.auth!.userId,
  ip: req.ip ?? null,
});
const idOf = (req: Request) => String(req.params.id ?? '');

export const listReviews = asyncHandler(async (req, res) => {
  res.json(await service.listReviews(req.query as unknown as ListAdminReviewsQuery));
});
export const setStatus = asyncHandler(async (req, res) => {
  res.json({
    data: await service.setStatus(idOf(req), req.body as SetReviewStatusInput, actor(req)),
  });
});
export const setReply = asyncHandler(async (req, res) => {
  res.json({ data: await service.setReply(idOf(req), req.body as ReplyReviewInput, actor(req)) });
});
export const deleteReply = asyncHandler(async (req, res) => {
  res.json({ data: await service.deleteReply(idOf(req), actor(req)) });
});
