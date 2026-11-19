import type { Prisma } from '@prisma/client';
import { writeAudit } from '../../../lib/audit.js';
import { prisma } from '../../../lib/prisma.js';
import { escapeLike } from '../../../lib/text.js';
import {
  lockProduct,
  notFoundReview,
  recomputeRating,
  toMyReview,
} from '../../reviews/reviews.shared.js';
import { ID_REGEX } from '../admin.schema.js';
import type {
  ListAdminReviewsQuery,
  ReplyReviewInput,
  SetReviewStatusInput,
} from './reviews.schema.js';

const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;

export interface Actor {
  actorId: string;
  ip: string | null;
}

const adminSelect = {
  id: true,
  productId: true,
  rating: true,
  content: true,
  status: true,
  reply: true,
  repliedAt: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, fullName: true, email: true } },
  product: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.ReviewSelect;

type AdminRow = Prisma.ReviewGetPayload<{ select: typeof adminSelect }>;

export function toAdminReview(r: AdminRow) {
  return {
    ...toMyReview(r),
    product: r.product,
    author: { id: r.user.id, fullName: r.user.fullName, email: r.user.email },
  };
}

export async function listReviews(q: ListAdminReviewsQuery) {
  const and: Prisma.ReviewWhereInput[] = [];
  if (q.status) and.push({ status: q.status });
  if (q.rating !== undefined) and.push({ rating: q.rating });
  if (q.productId) and.push({ productId: q.productId });
  if (q.q) and.push({ content: { contains: escapeLike(q.q), mode: 'insensitive' } });
  if (q.hasReply !== undefined) and.push({ reply: q.hasReply ? { not: null } : null });
  const where: Prisma.ReviewWhereInput = and.length > 0 ? { AND: and } : {};

  const [total, rows] = await Promise.all([
    prisma.review.count({ where }),
    prisma.review.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: adminSelect,
    }),
  ]);
  return {
    data: rows.map(toAdminReview),
    meta: {
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.ceil(total / q.pageSize),
    },
  };
}

async function loadOrThrow(id: string): Promise<AdminRow> {
  if (!ID_REGEX.test(id)) throw notFoundReview();
  const row = await prisma.review.findUnique({ where: { id }, select: adminSelect });
  if (!row) throw notFoundReview();
  return row;
}

export async function setStatus(id: string, input: SetReviewStatusInput, actor: Actor) {
  const pre = await loadOrThrow(id);
  return prisma.$transaction(async (tx) => {
    await lockProduct(tx, pre.productId);
    const current = await tx.review.findUnique({ where: { id }, select: { status: true } });
    if (!current) throw notFoundReview();
    // Trạng thái không đổi: 200, không ghi audit
    if (current.status !== input.status) {
      await tx.review.update({ where: { id }, data: { status: input.status } });
      await recomputeRating(tx, pre.productId);
      await writeAudit(tx, {
        actorId: actor.actorId,
        action: input.status === 'HIDDEN' ? 'review.hide' : 'review.show',
        entity: 'Review',
        entityId: id,
        diff: { status: [current.status, input.status] },
        ip: actor.ip,
      });
    }
    return toAdminReview(await tx.review.findUniqueOrThrow({ where: { id }, select: adminSelect }));
  }, TX_OPTIONS);
}

export async function setReply(id: string, input: ReplyReviewInput, actor: Actor) {
  await loadOrThrow(id);
  return prisma.$transaction(async (tx) => {
    const before = await tx.review.findUnique({ where: { id }, select: { reply: true } });
    if (!before) throw notFoundReview();
    const row = await tx.review.update({
      where: { id },
      data: { reply: input.reply, repliedAt: new Date() },
      select: adminSelect,
    });
    // Không chép nội dung đánh giá/câu trả lời vào audit
    await writeAudit(tx, {
      actorId: actor.actorId,
      action: 'review.reply',
      entity: 'Review',
      entityId: id,
      diff: { replied: [before.reply !== null, true] },
      ip: actor.ip,
    });
    return toAdminReview(row);
  }, TX_OPTIONS);
}

export async function deleteReply(id: string, actor: Actor) {
  await loadOrThrow(id);
  return prisma.$transaction(async (tx) => {
    const before = await tx.review.findUnique({ where: { id }, select: { reply: true } });
    if (!before) throw notFoundReview();
    // Chưa có reply: vẫn 200, không ghi audit
    if (before.reply === null) {
      return toAdminReview(
        await tx.review.findUniqueOrThrow({ where: { id }, select: adminSelect }),
      );
    }
    const row = await tx.review.update({
      where: { id },
      data: { reply: null, repliedAt: null },
      select: adminSelect,
    });
    await writeAudit(tx, {
      actorId: actor.actorId,
      action: 'review.reply_delete',
      entity: 'Review',
      entityId: id,
      diff: { replied: [true, false] },
      ip: actor.ip,
    });
    return toAdminReview(row);
  }, TX_OPTIONS);
}
