/** Kiểu theo docs/api-contract.md §4. */

export type RoastLevel = "LIGHT" | "MEDIUM" | "MEDIUM_DARK" | "DARK";
export type CoffeeProcess = "WASHED" | "NATURAL" | "HONEY" | "ANAEROBIC" | "OTHER";
export type BrewMethod =
  "PHIN" | "ESPRESSO" | "POUR_OVER" | "COLD_BREW" | "FRENCH_PRESS" | "AEROPRESS" | "MOKA";
export type ProductSort =
  "newest" | "price_asc" | "price_desc" | "bestseller" | "rating" | "relevance";
export type StockStatus = "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";

export interface CategoryChild {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  productCount: number;
}

export interface CategoryNode extends CategoryChild {
  children: CategoryChild[];
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  productCount: number;
}

export interface BrandRef {
  id: string;
  name: string;
  slug: string;
}

export interface CategoryRef {
  id: string;
  name: string;
  slug: string;
}

export interface ProductImageRef {
  url: string;
  alt: string | null;
}

export interface ProductListItem {
  id: string;
  slug: string;
  name: string;
  shortDesc: string | null;
  brand: BrandRef | null;
  category: CategoryRef;
  primaryImage: ProductImageRef | null;
  minPrice: number;
  compareAtPrice: number | null;
  inStock: boolean;
  isFeatured: boolean;
  ratingAvg: number;
  ratingCount: number;
  coffee: {
    originCountry: string | null;
    roastLevel: RoastLevel | null;
    process: CoffeeProcess | null;
  } | null;
}

export interface Variant {
  id: string;
  sku: string;
  name: string;
  attributes: Record<string, string>;
  price: number;
  salePrice: number | null;
  effectivePrice: number;
  isOnSale: boolean;
  saleEndsAt: string | null;
  stockStatus: StockStatus;
  maxQuantity: number;
  weightGram: number | null;
  roastDate: string | null;
}

export interface ProductImage {
  id: string;
  url: string;
  alt: string | null;
  isPrimary: boolean;
}

export interface CoffeeProfile {
  originCountry: string | null;
  originRegion: string | null;
  variety: string | null;
  process: CoffeeProcess | null;
  roastLevel: RoastLevel | null;
  altitude: number | null;
  tastingNotes: string[];
  brewMethods: BrewMethod[];
}

export interface ProductDetail {
  id: string;
  slug: string;
  name: string;
  shortDesc: string | null;
  description: string | null;
  tags: string[];
  brand: BrandRef | null;
  category: CategoryRef;
  breadcrumbs: Array<{ name: string; slug: string }>;
  images: ProductImage[];
  variants: Variant[];
  minPrice: number;
  inStock: boolean;
  coffee: CoffeeProfile | null;
  ratingAvg: number;
  ratingCount: number;
  seo: { title: string; description: string };
  related: ProductListItem[];
  createdAt: string;
}

export interface SuggestResult {
  products: Array<{ slug: string; name: string; imageUrl: string | null; minPrice: number }>;
  categories: Array<{ slug: string; name: string }>;
}
