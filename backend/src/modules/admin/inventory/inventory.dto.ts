import type { InventoryReason, Prisma, ProductStatus } from '@prisma/client';

export type StockStatus = 'OUT_OF_STOCK' | 'LOW_STOCK' | 'IN_STOCK';

export const inventoryItemSelect = {
  id: true,
  sku: true,
  name: true,
  stock: true,
  lowStockThreshold: true,
  isActive: true,
  updatedAt: true,
  product: {
    select: {
      id: true,
      name: true,
      status: true,
      images: {
        orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { id: 'asc' }],
        take: 1,
        select: { url: true },
      },
    },
  },
} satisfies Prisma.ProductVariantSelect;

export type InventoryItemRow = Prisma.ProductVariantGetPayload<{
  select: typeof inventoryItemSelect;
}>;

export interface InventoryItemDto {
  variantId: string;
  sku: string;
  variantName: string;
  productId: string;
  productName: string;
  productStatus: ProductStatus;
  imageUrl: string | null;
  stock: number;
  lowStockThreshold: number;
  stockStatus: StockStatus;
  isActive: boolean;
  updatedAt: string;
}

export function stockStatusOf(stock: number, lowStockThreshold: number): StockStatus {
  if (stock <= 0) return 'OUT_OF_STOCK';
  return stock <= lowStockThreshold ? 'LOW_STOCK' : 'IN_STOCK';
}

export function toInventoryItem(r: InventoryItemRow): InventoryItemDto {
  return {
    variantId: r.id,
    sku: r.sku,
    variantName: r.name,
    productId: r.product.id,
    productName: r.product.name,
    productStatus: r.product.status,
    imageUrl: r.product.images[0]?.url ?? null,
    stock: r.stock,
    lowStockThreshold: r.lowStockThreshold,
    stockStatus: stockStatusOf(r.stock, r.lowStockThreshold),
    isActive: r.isActive,
    updatedAt: r.updatedAt.toISOString(),
  };
}

export const movementSelect = {
  id: true,
  variantId: true,
  change: true,
  stockAfter: true,
  reason: true,
  note: true,
  createdAt: true,
  variant: { select: { sku: true, name: true, product: { select: { name: true } } } },
  order: { select: { code: true } },
  actor: { select: { id: true, fullName: true } },
} satisfies Prisma.InventoryMovementSelect;

export type MovementRow = Prisma.InventoryMovementGetPayload<{ select: typeof movementSelect }>;

export interface InventoryMovementDto {
  id: string;
  variantId: string;
  sku: string;
  productName: string;
  variantName: string;
  change: number;
  stockAfter: number;
  reason: InventoryReason;
  orderCode: string | null;
  actor: { id: string; fullName: string } | null;
  note: string | null;
  createdAt: string;
}

export function toMovementDto(r: MovementRow): InventoryMovementDto {
  return {
    id: r.id,
    variantId: r.variantId,
    sku: r.variant.sku,
    productName: r.variant.product.name,
    variantName: r.variant.name,
    change: r.change,
    stockAfter: r.stockAfter,
    reason: r.reason,
    orderCode: r.order?.code ?? null,
    actor: r.actor ? { id: r.actor.id, fullName: r.actor.fullName } : null,
    note: r.note,
    createdAt: r.createdAt.toISOString(),
  };
}
