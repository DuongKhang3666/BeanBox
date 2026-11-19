import { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import type { CreateReviewInput, ListReviewsQuery, UpdateReviewInput } from './reviews.schema.js';
import {
  canEditReview,
  findLiveProductId,
  lockProduct,
  notFoundProduct,
  notFoundReview,
  recomputeRating,
  reviewSelect,
  round1,
  toMyReview,
  toReview,
} from './reviews.shared.js';

const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;

const notAllowed = (reason: 'NOT_PURCHASED' | 'ALREADY_REVIEWED') =>
  new AppError(
    409,
    'REVIEW_NOT_ALLOWED',
    reason === 'ALREADY_REVIEWED'
      ? 'Bạn đã đánh giá sản phẩm này rồi'
      : 'Chỉ khách đã nhận hàng mới được đánh giá sản phẩm này',
    { reason },
  );

/** Dòng đơn DELIVERED sớm nhất của user cho sản phẩm mà chưa có review. */
function findReviewableItem(
  tx: Prisma.TransactionClient | typeof prisma,
  userId: string,
  productId: string,
) {
  return tx.orderItem.findFirst({
    where: { productId, review: null, order: { userId, status: 'DELIVERED' } },
    orderBy: [{ order: { createdAt: 'asc' } }, { id: 'asc' }],
    select: { id: true },
  });
}

// ───────────── Công khai ─────────────

export async function listProductReviews(slug: string, q: ListReviewsQuery) {
  const productId = await findLiveProductId(slug);
  const ratings = q.rating?.map(Number);
  const where: Prisma.ReviewWhereInput = {
    productId,
    status: 'PUBLISHED',
    ...(ratings ? { rating: { in: ratings } } : {}),
  };
  const orderBy: Prisma.ReviewOrderByWithRelationInput[] =
    q.sort === 'highest'
      ? [{ rating: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }]
      : q.sort === 'lowest'
        ? [{ rating: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }]
        : [{ createdAt: 'desc' }, { id: 'desc' }];

  const [total, rows, groups] = await Promise.all([
    prisma.review.count({ where }),
    prisma.review.findMany({
      where,
      orderBy,
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: reviewSelect,
    }),
    // Tóm tắt trên TẤT CẢ review PUBLISHED, không bị lọc rating ảnh hưởng
    prisma.review.groupBy({
      by: ['rating'],
      where: { productId, status: 'PUBLISHED' },
      _count: { _all: true },
    }),
  ]);

  const distribution: Record<'1' | '2' | '3' | '4' | '5', number> = {
    '1': 0,
    '2': 0,
    '3': 0,
    '4': 0,
    '5': 0,
  };
  let ratingCount = 0;
  let sum = 0;
  for (const g of groups) {
    const key = String(g.rating) as keyof typeof distribution;
    if (key in distribution) distribution[key] = g._count._all;
    ratingCount += g._count._all;
    sum += g.rating * g._count._all;
  }
  return {
    data: rows.map(toReview),
    meta: {
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.ceil(total / q.pageSize),
      summary: {
        ratingAvg: ratingCount > 0 ? round1(sum / ratingCount) : 0,
        ratingCount,
        distribution,
      },
    },
  };
}

// ───────────── Của tôi ─────────────

export async function getMyReviewState(userId: string, slug: string) {
  const productId = await findLiveProductId(slug);
  const review = await prisma.review.findUnique({
    where: { userId_productId: { userId, productId } },
    select: reviewSelect,
  });
  if (review) {
    return {
      canReview: false,
      reason: 'ALREADY_REVIEWED' as const,
      review: toMyReview(review),
      canEdit: canEditReview(review.createdAt),
    };
  }
  const item = await findReviewableItem(prisma, userId, productId);
  return {
    canReview: item !== null,
    reason: item ? null : ('NOT_PURCHASED' as const),
    review: null,
    canEdit: false,
  };
}

export async function createReview(userId: string, slug: string, input: CreateReviewInput) {
  const productId = await findLiveProductId(slug);
  try {
    return await prisma.$transaction(async (tx) => {
      // Khóa Product: tuần tự hóa các lần tạo review đồng thời của cùng sản phẩm
      const locked = await lockProduct(tx, productId);
      if (!locked || locked.deletedAt !== null || locked.status !== 'ACTIVE') {
        throw notFoundProduct();
      }
      const existing = await tx.review.findUnique({
        where: { userId_productId: { userId, productId } },
        select: { id: true },
      });
      if (existing) throw notAllowed('ALREADY_REVIEWED');
      const item = await findReviewableItem(tx, userId, productId);
      if (!item) throw notAllowed('NOT_PURCHASED');

      const created = await tx.review.create({
        data: {
          productId,
          userId,
          orderItemId: item.id,
          rating: input.rating,
          content: input.content,
          status: 'PUBLISHED',
        },
        select: reviewSelect,
      });
      await recomputeRating(tx, productId);
      return toMyReview(created);
    }, TX_OPTIONS);
  } catch (e) {
    // Lưới an toàn: unique (userId, productId) hoặc orderItemId
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw notAllowed('ALREADY_REVIEWED');
    }
    throw e;
  }
}

export async function updateReview(userId: string, reviewId: string, input: UpdateReviewInput) {
  // Review của người khác hoặc không tồn tại: 404 như nhau (chống IDOR)
  const pre = await prisma.review.findFirst({
    where: { id: reviewId, userId },
    select: { productId: true },
  });
  if (!pre) throw notFoundReview();

  return prisma.$transaction(async (tx) => {
    await lockProduct(tx, pre.productId);
    const current = await tx.review.findFirst({
      where: { id: reviewId, userId },
      select: { rating: true, content: true, status: true, createdAt: true },
    });
    if (!current) throw notFoundReview();
    if (!canEditReview(current.createdAt)) {
      throw new AppError(
        409,
        'REVIEW_EDIT_EXPIRED',
        'Đã quá 30 ngày kể từ khi đánh giá, bạn không thể chỉnh sửa nữa',
      );
    }
    const rating = input.rating ?? current.rating;
    const updated = await tx.review.update({
      where: { id: reviewId },
      data: { rating, content: input.content ?? current.content },
      select: reviewSelect,
    });
    // HIDDEN giữ nguyên HIDDEN và không tính vào điểm
    if (current.status === 'PUBLISHED' && rating !== current.rating) {
      await recomputeRating(tx, pre.productId);
    }
    return toMyReview(updated);
  }, TX_OPTIONS);
}
