import type { Prisma, SlugEntity } from '../generated/prisma/client.js';
import { prisma } from './prisma.js';

/**
 * Redirect khi đổi slug (api-contract §14.5, D-018). Lưu theo id nên không tạo chuỗi redirect.
 */

/**
 * Ghi nhận đổi slug trong transaction của người gọi: upsert redirect (slug cũ -> id) và xóa
 * redirect có `fromSlug` = slug mới (slug của đối tượng khác nay được dùng lại, hoặc đổi về slug cũ).
 */
export async function recordSlugChange(
  tx: Prisma.TransactionClient,
  entity: SlugEntity,
  targetId: string,
  oldSlug: string,
  newSlug: string,
): Promise<void> {
  if (oldSlug === newSlug) return;
  await tx.slugRedirect.deleteMany({ where: { entity, fromSlug: newSlug } });
  await tx.slugRedirect.upsert({
    where: { entity_fromSlug: { entity, fromSlug: oldSlug } },
    create: { entity, fromSlug: oldSlug, targetId },
    update: { targetId },
  });
}

/** Xóa mọi redirect trỏ tới đối tượng (xóa vĩnh viễn danh mục). */
export async function deleteRedirectsOf(
  tx: Prisma.TransactionClient,
  entity: SlugEntity,
  targetId: string,
): Promise<void> {
  await tx.slugRedirect.deleteMany({ where: { entity, targetId } });
}

/**
 * Slug hiện tại nếu `slug` là slug cũ của một đối tượng ĐANG HIỂN THỊ (sản phẩm ACTIVE chưa xóa,
 * danh mục isActive); ngược lại null. Người gọi chỉ dùng khi slug không khớp trực tiếp.
 */
export async function resolveSlugRedirect(
  entity: SlugEntity,
  slug: string,
): Promise<string | null> {
  const redirect = await prisma.slugRedirect.findUnique({
    where: { entity_fromSlug: { entity, fromSlug: slug } },
    select: { targetId: true },
  });
  if (!redirect) return null;
  if (entity === 'PRODUCT') {
    const p = await prisma.product.findFirst({
      where: { id: redirect.targetId, status: 'ACTIVE', deletedAt: null },
      select: { slug: true },
    });
    return p?.slug ?? null;
  }
  const c = await prisma.category.findFirst({
    where: { id: redirect.targetId, isActive: true },
    select: { slug: true },
  });
  return c?.slug ?? null;
}
