import { asyncHandler } from '../../lib/asyncHandler.js';
import type { CreateReviewInput, ListReviewsQuery, UpdateReviewInput } from './reviews.schema.js';
import * as service from './reviews.service.js';

export const listProductReviews = asyncHandler(async (req, res) => {
  res.json(
    await service.listProductReviews(
      String(req.params.slug ?? ''),
      req.query as unknown as ListReviewsQuery,
    ),
  );
});

export const getMyReview = asyncHandler(async (req, res) => {
  res.json({
    data: await service.getMyReviewState(req.auth!.userId, String(req.params.slug ?? '')),
  });
});

export const createReview = asyncHandler(async (req, res) => {
  const data = await service.createReview(
    req.auth!.userId,
    String(req.params.slug ?? ''),
    req.body as CreateReviewInput,
  );
  res.status(201).json({ data });
});

export const updateReview = asyncHandler(async (req, res) => {
  const data = await service.updateReview(
    req.auth!.userId,
    String(req.params.id ?? ''),
    req.body as UpdateReviewInput,
  );
  res.json({ data });
});
