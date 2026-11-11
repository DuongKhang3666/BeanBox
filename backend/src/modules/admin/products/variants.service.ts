import { Prisma } from '@prisma/client';
import { diffFields, writeAudit } from '../../../lib/audit.js';
import { AppError } from '../../../lib/errors.js';
import { prisma } from '../../../lib/prisma.js';
import { refreshProductDenorm } from '../../catalog/catalog.denorm.js';
import { toAdminVariant, type AdminVariantDto } from './products.dto.js';
import {
  checkPricing,
  type CreateVariantInput,
  type UpdateVariantInput,
} from './products.schema.js';
import {
  checkId,
  fieldError,
  lockLiveProduct,
  productNotFound,
  TX_OPTIONS,
  variantNotFound,
  type Actor,
} from './products.shared.js';

const VARIANT_AUDIT_KEYS = [
  'sku',
  'name',
  'attributes',
  'price',
  'salePrice',
  'saleStart',
  'saleEnd',
  'stock',
  'lowStockThreshold',
  'weightGram',
  'roastDate',
  'sortOrder',
  'isActive',
] as const;

const LAST_ACTIVE_MSG = 'Hãy chuyển sản phẩm sang Nháp trước khi ngừng bán biến thể cuối cùng';

function mapSkuViolation(e: unknown): unknown {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    return new AppError(409, 'SKU_TAKEN', 'SKU đã tồn tại', { field: 'sku' });
  }
  return e;
}

export async function createVariant(
  productId: string,
  input: CreateVariantInput,
  { actorId, ip }: Actor,
): Promise<AdminVariantDto> {
  checkId(productId, productNotFound);
  try {
    return await prisma.$transaction(async (tx) => {
      await lockLiveProduct(tx, productId, 'NO KEY UPDATE');
      const row = await tx.productVariant.create({
        data: {
          productId,
          sku: input.sku,
          name: input.name,
          attributes: input.attributes,
          price: input.price,
          salePrice: input.salePrice,
          saleStart: input.saleStart,
          saleEnd: input.saleEnd,
          stock: input.stock,
          lowStockThreshold: input.lowStockThreshold,
          weightGram: input.weightGram,
          roastDate: input.roastDate,
          sortOrder: input.sortOrder,
          isActive: input.isActive,
        },
      });
      if (input.stock > 0) {
        await tx.inventoryMovement.create({
          data: {
            variantId: row.id,
            change: input.stock,
            stockAfter: input.stock,
            reason: 'STOCKTAKE',
            actorId,
            note: 'Tồn kho ban đầu',
          },
        });
      }
      await refreshProductDenorm(tx, productId);
      const nulls = Object.fromEntries(VARIANT_AUDIT_KEYS.map((k) => [k, null]));
      await writeAudit(tx, {
        actorId,
        action: 'variant.create',
        entity: 'ProductVariant',
        entityId: row.id,
        diff: diffFields(nulls, row, VARIANT_AUDIT_KEYS),
        ip,
      });
      return toAdminVariant(row);
    }, TX_OPTIONS);
  } catch (e) {
    throw mapSkuViolation(e);
  }
}

/**
 * Khóa biến thể (FOR UPDATE) rồi Product (FOR NO KEY UPDATE) - cùng thứ tự đặt/hủy đơn.
 * Trả về productId và trạng thái sản phẩm đọc SAU khi đã giữ khóa Product.
 */
async function lockVariantAndProduct(tx: Prisma.TransactionClient, variantId: string) {
  const locked = await tx.$queryRaw<Array<{ productId: string }>>`
    SELECT "productId" FROM "ProductVariant"
    WHERE "id" = ${variantId} AND "deletedAt" IS NULL FOR UPDATE`;
  const variant = locked[0];
  if (!variant) throw variantNotFound();
  try {
    const { status } = await lockLiveProduct(tx, variant.productId, 'NO KEY UPDATE');
    return { productId: variant.productId, productStatus: status };
  } catch (e) {
    // Sản phẩm cha đã xóa mềm -> biến thể coi như không tồn tại.
    if (e instanceof AppError && e.status === 404) throw variantNotFound();
    throw e;
  }
}

/** Biến thể đang bán cuối cùng của sản phẩm ACTIVE không được tắt/xóa. */
async function assertNotLastActive(
  tx: Prisma.TransactionClient,
  productId: string,
  productStatus: string,
  variantId: string,
): Promise<void> {
  if (productStatus !== 'ACTIVE') return;
  const others = await tx.productVariant.count({
    where: { productId, isActive: true, deletedAt: null, id: { not: variantId } },
  });
  if (others === 0) throw new AppError(409, 'CONFLICT', LAST_ACTIVE_MSG);
}

export async function updateVariant(
  id: string,
  input: UpdateVariantInput,
  { actorId, ip }: Actor,
): Promise<AdminVariantDto> {
  checkId(id, variantNotFound);
  try {
    return await prisma.$transaction(async (tx) => {
      const { productId, productStatus } = await lockVariantAndProduct(tx, id);
      const before = await tx.productVariant.findUniqueOrThrow({ where: { id } });

      const pricing = {
        price: input.price ?? before.price,
        salePrice: input.salePrice === undefined ? before.salePrice : input.salePrice,
        saleStart: input.saleStart === undefined ? before.saleStart : input.saleStart,
        saleEnd: input.saleEnd === undefined ? before.saleEnd : input.saleEnd,
      };
      const err = checkPricing(pricing);
      if (err) throw fieldError(err.field, err.message);

      if (input.isActive === false && before.isActive) {
        await assertNotLastActive(tx, productId, productStatus, id);
      }

      const data: Prisma.ProductVariantUncheckedUpdateInput = {};
      if (input.sku !== undefined) data.sku = input.sku;
      if (input.name !== undefined) data.name = input.name;
      if (input.attributes !== undefined) data.attributes = input.attributes;
      if (input.price !== undefined) data.price = input.price;
      if (input.salePrice !== undefined) data.salePrice = input.salePrice;
      if (input.saleStart !== undefined) data.saleStart = input.saleStart;
      if (input.saleEnd !== undefined) data.saleEnd = input.saleEnd;
      if (input.lowStockThreshold !== undefined) data.lowStockThreshold = input.lowStockThreshold;
      if (input.weightGram !== undefined) data.weightGram = input.weightGram;
      if (input.roastDate !== undefined) data.roastDate = input.roastDate;
      if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
      if (input.isActive !== undefined) data.isActive = input.isActive;

      const row = await tx.productVariant.update({ where: { id }, data });
      await refreshProductDenorm(tx, productId);
      const diff = diffFields(before, row, VARIANT_AUDIT_KEYS);
      if (diff) {
        await writeAudit(tx, {
          actorId,
          action: 'variant.update',
          entity: 'ProductVariant',
          entityId: id,
          diff,
          ip,
        });
      }
      return toAdminVariant(row);
    }, TX_OPTIONS);
  } catch (e) {
    throw mapSkuViolation(e);
  }
}

export async function deleteVariant(id: string, { actorId, ip }: Actor): Promise<void> {
  checkId(id, variantNotFound);
  await prisma.$transaction(async (tx) => {
    const { productId, productStatus } = await lockVariantAndProduct(tx, id);
    const before = await tx.productVariant.findUniqueOrThrow({ where: { id } });
    if (before.isActive) await assertNotLastActive(tx, productId, productStatus, id);

    const now = new Date();
    await tx.productVariant.update({ where: { id }, data: { deletedAt: now, isActive: false } });
    await refreshProductDenorm(tx, productId);
    await writeAudit(tx, {
      actorId,
      action: 'variant.delete',
      entity: 'ProductVariant',
      entityId: id,
      diff: {
        ...(before.isActive ? { isActive: [true, false] as [unknown, unknown] } : {}),
        deletedAt: [null, now.toISOString()],
      },
      ip,
    });
  }, TX_OPTIONS);
}
