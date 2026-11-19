import { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { listItemSelect, toListItem } from '../catalog/catalog.service.js';

export const WISHLIST_MAX = 100;

const VISIBLE = {
  product: { is: { status: 'ACTIVE', deletedAt: null } },
} satisfies Prisma.WishlistWhereInput;
const ORDER = [
  { createdAt: 'desc' },
  { productId: 'desc' },
] satisfies Prisma.WishlistOrderByWithRelationInput[];

const notFoundProduct = () => new AppError(404, 'NOT_FOUND', 'Không tìm thấy sản phẩm');

export async function listWishlist(userId: string, now: Date = new Date()) {
  const rows = await prisma.wishlist.findMany({
    where: { userId, ...VISIBLE },
    orderBy: ORDER,
    take: WISHLIST_MAX,
    select: { createdAt: true, product: { select: listItemSelect } },
  });
  return rows.map((r) => ({ ...toListItem(r.product, now), addedAt: r.createdAt.toISOString() }));
}

export async function listWishlistIds(userId: string) {
  const rows = await prisma.wishlist.findMany({
    where: { userId, ...VISIBLE },
    orderBy: ORDER,
    take: WISHLIST_MAX,
    select: { productId: true },
  });
  return { productIds: rows.map((r) => r.productId) };
}

export async function addToWishlist(
  userId: string,
  productId: string,
): Promise<{ created: boolean; productId: string; addedAt: string }> {
  const product = await prisma.product.findFirst({
    where: { id: productId, status: 'ACTIVE', deletedAt: null },
    select: { id: true },
  });
  if (!product) throw notFoundProduct();

  try {
    return await prisma.$transaction(
      async (tx) => {
        // Khóa user để các lần thêm đồng thời của cùng một người tuần tự hóa (giới hạn 100)
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
        const existing = await tx.wishlist.findUnique({
          where: { userId_productId: { userId, productId } },
          select: { createdAt: true },
        });
        if (existing) {
          return { created: false, productId, addedAt: existing.createdAt.toISOString() };
        }
        // Đếm cả mục của sản phẩm đang ẩn
        const count = await tx.wishlist.count({ where: { userId } });
        if (count >= WISHLIST_MAX) {
          throw new AppError(
            409,
            'WISHLIST_LIMIT',
            `Danh sách yêu thích đã đủ ${WISHLIST_MAX} sản phẩm, hãy xóa bớt trước khi thêm`,
          );
        }
        const row = await tx.wishlist.create({
          data: { userId, productId },
          select: { createdAt: true },
        });
        return { created: true, productId, addedAt: row.createdAt.toISOString() };
      },
      { timeout: 20_000, maxWait: 10_000 },
    );
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') {
        // Thêm trùng đồng thời: coi như đã có (idempotent)
        const row = await prisma.wishlist.findUnique({
          where: { userId_productId: { userId, productId } },
          select: { createdAt: true },
        });
        if (row) return { created: false, productId, addedAt: row.createdAt.toISOString() };
      }
      if (e.code === 'P2003') throw notFoundProduct();
    }
    throw e;
  }
}

export async function removeFromWishlist(userId: string, productId: string): Promise<void> {
  await prisma.wishlist.deleteMany({ where: { userId, productId } });
}
