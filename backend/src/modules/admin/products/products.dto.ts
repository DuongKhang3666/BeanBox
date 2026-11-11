import type { Prisma, ProductStatus } from '@prisma/client';
import { effectivePrice, isOnSale } from '../../../lib/pricing.js';
import { stockStatusOf, type StockStatus } from '../inventory/inventory.dto.js';

export const productDetailInclude = {
  coffee: true,
  images: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
  variants: {
    where: { deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.ProductInclude;

export type ProductDetailRow = Prisma.ProductGetPayload<{ include: typeof productDetailInclude }>;
type VariantRow = ProductDetailRow['variants'][number];
type ImageRow = ProductDetailRow['images'][number];
type CoffeeRow = NonNullable<ProductDetailRow['coffee']>;

export interface AdminVariantDto {
  id: string;
  sku: string;
  name: string;
  attributes: Prisma.JsonValue;
  price: number;
  salePrice: number | null;
  saleStart: string | null;
  saleEnd: string | null;
  effectivePrice: number;
  isOnSale: boolean;
  stock: number;
  lowStockThreshold: number;
  stockStatus: StockStatus;
  weightGram: number;
  roastDate: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export function toAdminVariant(v: VariantRow, now: Date = new Date()): AdminVariantDto {
  return {
    id: v.id,
    sku: v.sku,
    name: v.name,
    attributes: v.attributes,
    price: v.price,
    salePrice: v.salePrice,
    saleStart: v.saleStart?.toISOString() ?? null,
    saleEnd: v.saleEnd?.toISOString() ?? null,
    effectivePrice: effectivePrice(v, now),
    isOnSale: isOnSale(v, now),
    stock: v.stock,
    lowStockThreshold: v.lowStockThreshold,
    stockStatus: stockStatusOf(v.stock, v.lowStockThreshold),
    weightGram: v.weightGram,
    roastDate: v.roastDate?.toISOString().slice(0, 10) ?? null,
    sortOrder: v.sortOrder,
    isActive: v.isActive,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
  };
}

export interface AdminImageDto {
  id: string;
  url: string;
  alt: string;
  sortOrder: number;
  isPrimary: boolean;
}

export const toAdminImage = (i: ImageRow): AdminImageDto => ({
  id: i.id,
  url: i.url,
  alt: i.alt,
  sortOrder: i.sortOrder,
  isPrimary: i.isPrimary,
});

export type AdminCoffeeDto = Omit<CoffeeRow, 'productId'>;

export function toAdminCoffee(c: CoffeeRow | null): AdminCoffeeDto | null {
  if (!c) return null;
  return {
    originCountry: c.originCountry,
    originRegion: c.originRegion,
    variety: c.variety,
    process: c.process,
    roastLevel: c.roastLevel,
    altitude: c.altitude,
    tastingNotes: c.tastingNotes,
    brewMethods: c.brewMethods,
  };
}

export interface AdminProductDto {
  id: string;
  slug: string;
  name: string;
  shortDesc: string;
  description: string;
  status: ProductStatus;
  isFeatured: boolean;
  tags: string[];
  seoTitle: string | null;
  seoDesc: string | null;
  categoryId: string;
  brandId: string | null;
  coffee: AdminCoffeeDto | null;
  images: AdminImageDto[];
  variants: AdminVariantDto[];
  minPrice: number;
  inStock: boolean;
  soldCount: number;
  ratingAvg: number;
  ratingCount: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toAdminProduct(p: ProductDetailRow, now: Date = new Date()): AdminProductDto {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    shortDesc: p.shortDesc,
    description: p.description,
    status: p.status,
    isFeatured: p.isFeatured,
    tags: p.tags,
    seoTitle: p.seoTitle,
    seoDesc: p.seoDesc,
    categoryId: p.categoryId,
    brandId: p.brandId,
    coffee: toAdminCoffee(p.coffee),
    images: p.images.map(toAdminImage),
    variants: p.variants.map((v) => toAdminVariant(v, now)),
    minPrice: p.minPrice,
    inStock: p.inStock,
    soldCount: p.soldCount,
    ratingAvg: p.ratingAvg,
    ratingCount: p.ratingCount,
    deletedAt: p.deletedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export const productListSelect = {
  id: true,
  slug: true,
  name: true,
  status: true,
  isFeatured: true,
  minPrice: true,
  inStock: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true } },
  brand: { select: { id: true, name: true } },
  images: {
    orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { id: 'asc' }],
    take: 1,
    select: { url: true },
  },
  variants: { where: { deletedAt: null }, select: { stock: true } },
} satisfies Prisma.ProductSelect;

export type ProductListRow = Prisma.ProductGetPayload<{ select: typeof productListSelect }>;

export interface AdminProductListItem {
  id: string;
  slug: string;
  name: string;
  status: ProductStatus;
  isFeatured: boolean;
  category: { id: string; name: string };
  brand: { id: string; name: string } | null;
  primaryImageUrl: string | null;
  minPrice: number;
  variantCount: number;
  totalStock: number;
  inStock: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toProductListItem(p: ProductListRow): AdminProductListItem {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    status: p.status,
    isFeatured: p.isFeatured,
    category: p.category,
    brand: p.brand,
    primaryImageUrl: p.images[0]?.url ?? null,
    minPrice: p.minPrice,
    variantCount: p.variants.length,
    totalStock: p.variants.reduce((sum, v) => sum + v.stock, 0),
    inStock: p.inStock,
    deletedAt: p.deletedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}
