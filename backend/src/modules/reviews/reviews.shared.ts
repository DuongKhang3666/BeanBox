import { Prisma, type ReviewStatus } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { resolveSlugRedirect } from '../../lib/slugRedirect.js';

/** Dùng chung cho API đánh giá công khai/me và admin (api-contract §14.1, D-017). */

export const EDIT_WINDOW_MS = 30 * 24 * 3600 * 1000;

export const LIVE_PRODUCT = {
  status: 'ACTIVE',
  deletedAt: null,
} satisfies Prisma.ProductWhereInput;

const initialOf = (word: string): string => (Array.from(word)[0] ?? '').toUpperCase();

/** "Nguyễn Văn An" -> "An N. V."; tên một từ giữ nguyên. */
export function maskAuthorName(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  const last = words.pop();
  if (last === undefined) return '';
  if (words.length === 0) return last;
  return `${last} ${words.map((w) => `${initialOf(w)}.`).join(' ')}`;
}

export const round1 = (n: number) => Math.round(n * 10) / 10;

export const notFoundProduct = () => new AppError(404, 'NOT_FOUND', 'Không tìm thấy sản phẩm');
export const notFoundReview = () => new AppError(404, 'NOT_FOUND', 'Không tìm thấy đánh giá');

/** Id sản phẩm đang hiển thị (ACTIVE, chưa xóa) theo slug; ngược lại 404. */
export async function findLiveProductId(slug: string): Promise<string> {
  const product = await prisma.product.findFirst({
    where: { slug, ...LIVE_PRODUCT },
    select: { id: true },
  });
  if (!product) {
    const movedTo = await resolveSlugRedirect('PRODUCT', slug);
    if (movedTo) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy sản phẩm', { movedTo });
    throw notFoundProduct();
  }
  return product.id;
}

/**
 * Khóa dòng Product để tuần tự hóa mọi thay đổi review của sản phẩm (tính lại denormalize và
 * chặn tạo review trùng đồng thời). FOR NO KEY UPDATE không xung đột với KEY SHARE của FK.
 * Trả về null nếu sản phẩm không tồn tại.
 */
export async function lockProduct(
  tx: Prisma.TransactionClient,
  productId: string,
): Promise<{ status: string; deletedAt: Date | null } | null> {
  const rows = await tx.$queryRaw<Array<{ status: string; deletedAt: Date | null }>>`
    SELECT "status", "deletedAt" FROM "Product" WHERE "id" = ${productId} FOR NO KEY UPDATE`;
  return rows[0] ?? null;
}

/** Tính lại Product.ratingAvg/ratingCount từ các review PUBLISHED (gọi sau lockProduct). */
export async function recomputeRating(
  tx: Prisma.TransactionClient,
  productId: string,
): Promise<void> {
  const agg = await tx.review.aggregate({
    where: { productId, status: 'PUBLISHED' },
    _avg: { rating: true },
    _count: { _all: true },
  });
  await tx.product.update({
    where: { id: productId },
    data: { ratingAvg: agg._avg.rating ?? 0, ratingCount: agg._count._all },
  });
}

export const reviewSelect = {
  id: true,
  productId: true,
  rating: true,
  content: true,
  status: true,
  reply: true,
  repliedAt: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { fullName: true } },
} satisfies Prisma.ReviewSelect;

export type ReviewRow = Prisma.ReviewGetPayload<{ select: typeof reviewSelect }>;

export function toReview(r: ReviewRow) {
  return {
    id: r.id,
    rating: r.rating,
    content: r.content,
    authorName: maskAuthorName(r.user.fullName),
    verifiedPurchase: true as const,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    reply: r.reply,
    repliedAt: r.repliedAt ? r.repliedAt.toISOString() : null,
  };
}

export function toMyReview(r: ReviewRow) {
  return { ...toReview(r), status: r.status as ReviewStatus, images: [] as string[] };
}

export const canEditReview = (createdAt: Date, now: Date = new Date()) =>
  now.getTime() - createdAt.getTime() <= EDIT_WINDOW_MS;
