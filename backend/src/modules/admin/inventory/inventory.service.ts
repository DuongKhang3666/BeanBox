import type { InventoryReason, Prisma } from '../../../generated/prisma/client.js';
import { diffFields, writeAudit } from '../../../lib/audit.js';
import { weightedAvgCost } from '../../../lib/cost.js';
import { AppError } from '../../../lib/errors.js';
import { prisma } from '../../../lib/prisma.js';
import { escapeLike, normalizeSearch } from '../../../lib/text.js';
import { refreshProductDenorm } from '../../catalog/catalog.denorm.js';
import { vnDayEnd, vnDayStart } from '../admin.schema.js';
import {
  inventoryItemSelect,
  movementSelect,
  toInventoryItem,
  toMovementDto,
  type InventoryItemDto,
  type InventoryMovementDto,
} from './inventory.dto.js';
import type { AdjustInput, InventoryQuery, MovementsQuery } from './inventory.schema.js';

const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;
const MAX_STOCK = 1_000_000_000;

const variantNotFound = () => new AppError(404, 'NOT_FOUND', 'Không tìm thấy biến thể');

interface ListMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Danh sách tồn kho

function buildInventoryWhere(q: InventoryQuery): Prisma.ProductVariantWhereInput {
  const and: Prisma.ProductVariantWhereInput[] = [];
  // So sánh cột-với-cột bằng field reference của Prisma (không dùng raw SQL).
  const thresholdRef = prisma.productVariant.fields.lowStockThreshold;

  if (q.stockStatus) {
    and.push({
      OR: q.stockStatus.map((s): Prisma.ProductVariantWhereInput => {
        if (s === 'OUT_OF_STOCK') return { stock: { lte: 0 } };
        if (s === 'LOW_STOCK') return { stock: { gt: 0, lte: thresholdRef } };
        return { stock: { gt: thresholdRef } };
      }),
    });
  }
  if (q.q) {
    const norm = normalizeSearch(q.q);
    const or: Prisma.ProductVariantWhereInput[] = [
      { sku: { contains: escapeLike(q.q), mode: 'insensitive' } },
    ];
    if (norm) or.push({ product: { searchText: { contains: escapeLike(norm) } } });
    and.push({ OR: or });
  }
  return {
    deletedAt: null,
    product: { deletedAt: null, ...(q.productId ? { id: q.productId } : {}) },
    ...(and.length > 0 ? { AND: and } : {}),
  };
}

function inventoryOrderBy(
  sort: InventoryQuery['sort'],
): Prisma.ProductVariantOrderByWithRelationInput[] {
  if (sort === 'name') {
    return [{ product: { name: 'asc' } }, { sortOrder: 'asc' }, { id: 'asc' }];
  }
  if (sort === 'updated') return [{ updatedAt: 'desc' }, { id: 'desc' }];
  return [{ stock: 'asc' }, { product: { name: 'asc' } }, { id: 'asc' }];
}

export async function listInventory(
  q: InventoryQuery,
  includeCost = false,
): Promise<{ data: InventoryItemDto[]; meta: ListMeta }> {
  const where = buildInventoryWhere(q);
  const [total, rows] = await Promise.all([
    prisma.productVariant.count({ where }),
    prisma.productVariant.findMany({
      where,
      orderBy: inventoryOrderBy(q.sort),
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: inventoryItemSelect,
    }),
  ]);
  return {
    data: rows.map((r) => toInventoryItem(r, includeCost)),
    meta: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) },
  };
}

// ---------------------------------------------------------------------------
// Lịch sử

export async function listMovements(
  q: MovementsQuery,
  includeCost = false,
): Promise<{ data: InventoryMovementDto[]; meta: ListMeta }> {
  const where: Prisma.InventoryMovementWhereInput = {
    ...(q.variantId ? { variantId: q.variantId } : {}),
    ...(q.reason ? { reason: { in: q.reason } } : {}),
    ...(q.from || q.to
      ? {
          createdAt: {
            ...(q.from ? { gte: vnDayStart(q.from) } : {}),
            ...(q.to ? { lte: vnDayEnd(q.to) } : {}),
          },
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.inventoryMovement.count({ where }),
    prisma.inventoryMovement.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: movementSelect,
    }),
  ]);
  return {
    data: rows.map((r) => toMovementDto(r, includeCost)),
    meta: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) },
  };
}

// ---------------------------------------------------------------------------
// Điều chỉnh

export interface AdjustArgs {
  input: AdjustInput;
  actorId: string;
  ip: string | null;
  /** D-078: Admin mới được ghi/xem giá nhập và giá vốn. */
  isAdmin: boolean;
}

export async function adjustInventory(
  args: AdjustArgs,
): Promise<{ item: InventoryItemDto; movement: InventoryMovementDto | null }> {
  const { input, actorId, ip, isAdmin } = args;

  // D-078: nhập hàng ghi đơn giá nhập (Admin bắt buộc); Staff không thấy/không ghi giá vốn.
  if (input.reason === 'RESTOCK') {
    if (isAdmin && input.unitCost === undefined) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ', [
        { field: 'unitCost', message: 'Vui lòng nhập đơn giá nhập' },
      ]);
    }
    if (!isAdmin && input.unitCost !== undefined) {
      throw new AppError(403, 'FORBIDDEN', 'Chỉ Admin được ghi đơn giá nhập');
    }
  }

  return prisma.$transaction(async (tx) => {
    // Thứ tự khóa: Variant -> Product (cùng đặt/hủy đơn) để không deadlock.
    const locked = await tx.$queryRaw<
      Array<{ id: string; productId: string; stock: number; avgCost: number | null }>
    >`
      SELECT "id", "productId", "stock", "avgCost" FROM "ProductVariant"
      WHERE "id" = ${input.variantId} AND "deletedAt" IS NULL FOR UPDATE`;
    const variant = locked[0];
    if (!variant) throw variantNotFound();

    const product = await tx.$queryRaw<Array<{ deletedAt: Date | null }>>`
      SELECT "deletedAt" FROM "Product" WHERE "id" = ${variant.productId} FOR NO KEY UPDATE`;
    if (!product[0] || product[0].deletedAt) throw variantNotFound();

    const current = variant.stock;
    if (input.expectedStock !== undefined && input.expectedStock !== current) {
      throw new AppError(409, 'CONFLICT', 'Tồn kho vừa thay đổi, vui lòng tải lại', {
        currentStock: current,
      });
    }

    const reason = input.reason as InventoryReason;
    const newStock = reason === 'STOCKTAKE' ? input.newStock! : current + input.change!;
    if (newStock < 0) {
      throw new AppError(409, 'CONFLICT', 'Tồn kho không đủ để giảm', { currentStock: current });
    }
    if (newStock > MAX_STOCK) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ', [
        { field: 'change', message: 'Tồn kho vượt giới hạn cho phép' },
      ]);
    }

    const itemOf = async () =>
      toInventoryItem(
        await tx.productVariant.findUniqueOrThrow({
          where: { id: variant.id },
          select: inventoryItemSelect,
        }),
        isAdmin,
      );

    if (newStock === current) return { item: await itemOf(), movement: null };

    // Bình quân gia quyền di động (D-078): chỉ khi Admin nhập hàng có đơn giá; mọi thay đổi
    // tồn khác (bán, hủy, hao hụt, kiểm kê, điều chỉnh) giữ nguyên giá vốn.
    const costed = reason === 'RESTOCK' && isAdmin && input.unitCost !== undefined;
    const newAvg = costed
      ? weightedAvgCost(current, variant.avgCost, input.change!, input.unitCost!)
      : variant.avgCost;
    await tx.productVariant.update({
      where: { id: variant.id },
      data: { stock: newStock, ...(costed ? { avgCost: newAvg } : {}) },
    });
    const movement = await tx.inventoryMovement.create({
      data: {
        variantId: variant.id,
        change: newStock - current,
        stockAfter: newStock,
        reason,
        actorId,
        note: input.note ?? null,
        ...(costed ? { unitCost: input.unitCost! } : {}),
      },
      select: movementSelect,
    });
    await refreshProductDenorm(tx, variant.productId);
    await writeAudit(tx, {
      actorId,
      action: 'inventory.adjust',
      entity: 'ProductVariant',
      entityId: variant.id,
      diff: diffFields(
        { stock: current, reason: null, avgCost: variant.avgCost, unitCost: null },
        {
          stock: newStock,
          reason,
          avgCost: newAvg,
          unitCost: costed ? input.unitCost! : null,
        },
        ['stock', 'reason', 'avgCost', 'unitCost'],
      ),
      ip,
    });
    return { item: await itemOf(), movement: toMovementDto(movement, isAdmin) };
  }, TX_OPTIONS);
}
