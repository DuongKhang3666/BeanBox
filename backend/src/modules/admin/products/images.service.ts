import type { Prisma } from '@prisma/client';
import { diffFields, writeAudit } from '../../../lib/audit.js';
import { AppError } from '../../../lib/errors.js';
import { prisma } from '../../../lib/prisma.js';
import { toAdminImage, type AdminImageDto } from './products.dto.js';
import type { CreateImageInput, ReorderImagesInput, UpdateImageInput } from './products.schema.js';
import {
  checkId,
  fieldError,
  imageNotFound,
  lockLiveProduct,
  productNotFound,
  TX_OPTIONS,
  type Actor,
} from './products.shared.js';

export const MAX_IMAGES = 10;

async function listImages(
  tx: Prisma.TransactionClient,
  productId: string,
): Promise<AdminImageDto[]> {
  const rows = await tx.productImage.findMany({
    where: { productId },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });
  return rows.map(toAdminImage);
}

/** Bỏ cờ ảnh chính cũ TRƯỚC khi đặt ảnh mới (partial unique index ProductImage_one_primary). */
async function clearPrimary(tx: Prisma.TransactionClient, productId: string): Promise<void> {
  await tx.productImage.updateMany({
    where: { productId, isPrimary: true },
    data: { isPrimary: false },
  });
}

/** Mọi thao tác ảnh khóa Product FOR UPDATE để tuần tự hóa (giới hạn 10 ảnh, một ảnh chính). */
async function withProductLock<T>(
  productId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  checkId(productId, productNotFound);
  return prisma.$transaction(async (tx) => {
    await lockLiveProduct(tx, productId, 'UPDATE');
    return fn(tx);
  }, TX_OPTIONS);
}

async function findImage(tx: Prisma.TransactionClient, productId: string, imageId: string) {
  checkId(imageId, imageNotFound);
  const image = await tx.productImage.findFirst({ where: { id: imageId, productId } });
  if (!image) throw imageNotFound();
  return image;
}

export function createImage(
  productId: string,
  input: CreateImageInput,
  { actorId, ip }: Actor,
): Promise<AdminImageDto[]> {
  return withProductLock(productId, async (tx) => {
    const existing = await tx.productImage.findMany({
      where: { productId },
      select: { sortOrder: true },
    });
    if (existing.length >= MAX_IMAGES) {
      throw new AppError(409, 'CONFLICT', `Mỗi sản phẩm tối đa ${MAX_IMAGES} ảnh`);
    }
    const isFirst = existing.length === 0;
    const isPrimary = isFirst || input.isPrimary === true;
    const sortOrder = existing.reduce((max, i) => Math.max(max, i.sortOrder), -1) + 1;

    if (isPrimary && !isFirst) await clearPrimary(tx, productId);
    const row = await tx.productImage.create({
      data: { productId, url: input.url, alt: input.alt, sortOrder, isPrimary },
    });
    await writeAudit(tx, {
      actorId,
      action: 'image.create',
      entity: 'ProductImage',
      entityId: row.id,
      diff: { url: [null, row.url], isPrimary: [null, row.isPrimary] },
      ip,
    });
    return listImages(tx, productId);
  });
}

export function updateImage(
  productId: string,
  imageId: string,
  input: UpdateImageInput,
  { actorId, ip }: Actor,
): Promise<AdminImageDto[]> {
  return withProductLock(productId, async (tx) => {
    const before = await findImage(tx, productId, imageId);
    const data: Prisma.ProductImageUpdateInput = {};
    if (input.alt !== undefined) data.alt = input.alt;
    if (input.isPrimary === true && !before.isPrimary) {
      await clearPrimary(tx, productId);
      data.isPrimary = true;
    }
    const row =
      Object.keys(data).length > 0
        ? await tx.productImage.update({ where: { id: imageId }, data })
        : before;
    const diff = diffFields(before, row, ['alt', 'isPrimary']);
    if (diff) {
      await writeAudit(tx, {
        actorId,
        action: 'image.update',
        entity: 'ProductImage',
        entityId: imageId,
        diff,
        ip,
      });
    }
    return listImages(tx, productId);
  });
}

export function reorderImages(
  productId: string,
  input: ReorderImagesInput,
  { actorId, ip }: Actor,
): Promise<AdminImageDto[]> {
  return withProductLock(productId, async (tx) => {
    const current = await listImages(tx, productId);
    const ids = input.imageIds;
    const currentIds = new Set(current.map((i) => i.id));
    const sameSet =
      ids.length === currentIds.size &&
      new Set(ids).size === ids.length &&
      ids.every((id) => currentIds.has(id));
    if (!sameSet) {
      throw fieldError('imageIds', 'Danh sách ảnh phải đúng bằng tập ảnh hiện có của sản phẩm');
    }
    for (const [index, id] of ids.entries()) {
      await tx.productImage.update({ where: { id }, data: { sortOrder: index } });
    }
    const oldOrder = current.map((i) => i.id);
    const diff = diffFields({ imageIds: oldOrder }, { imageIds: ids }, ['imageIds']);
    if (diff) {
      await writeAudit(tx, {
        actorId,
        action: 'image.reorder',
        entity: 'Product',
        entityId: productId,
        diff,
        ip,
      });
    }
    return listImages(tx, productId);
  });
}

export function deleteImage(
  productId: string,
  imageId: string,
  { actorId, ip }: Actor,
): Promise<AdminImageDto[]> {
  return withProductLock(productId, async (tx) => {
    const image = await findImage(tx, productId, imageId);
    await tx.productImage.delete({ where: { id: imageId } });
    if (image.isPrimary) {
      const next = await tx.productImage.findFirst({
        where: { productId },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      });
      if (next) await tx.productImage.update({ where: { id: next.id }, data: { isPrimary: true } });
    }
    await writeAudit(tx, {
      actorId,
      action: 'image.delete',
      entity: 'ProductImage',
      entityId: imageId,
      diff: { url: [image.url, null] },
      ip,
    });
    return listImages(tx, productId);
  });
}
