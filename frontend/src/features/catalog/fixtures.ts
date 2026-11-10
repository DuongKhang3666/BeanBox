import type { ProductDetail, ProductListItem, Variant } from "@/types/catalog";

export function makeProduct(over: Partial<ProductListItem> = {}): ProductListItem {
  return {
    id: "p1",
    slug: "ethiopia-yirgacheffe",
    name: "Ethiopia Yirgacheffe",
    shortDesc: "Hương hoa",
    brand: { id: "b1", name: "BeanBox Roastery", slug: "beanbox-roastery" },
    category: { id: "c1", name: "Specialty", slug: "specialty" },
    primaryImage: { url: "/uploads/seed/x.svg", alt: "Túi cà phê" },
    minPrice: 185000,
    compareAtPrice: null,
    inStock: true,
    isFeatured: false,
    ratingAvg: 4.6,
    ratingCount: 18,
    coffee: { originCountry: "Ethiopia", roastLevel: "LIGHT", process: "WASHED" },
    ...over,
  };
}

export function makeVariant(over: Partial<Variant> = {}): Variant {
  return {
    id: "v1",
    sku: "ETH-250",
    name: "250 g",
    attributes: {},
    price: 210000,
    salePrice: null,
    effectivePrice: 210000,
    isOnSale: false,
    saleEndsAt: null,
    stockStatus: "IN_STOCK",
    maxQuantity: 20,
    weightGram: 250,
    roastDate: null,
    ...over,
  };
}

export function makeDetail(over: Partial<ProductDetail> = {}): ProductDetail {
  return {
    id: "p1",
    slug: "ethiopia-yirgacheffe",
    name: "Ethiopia Yirgacheffe",
    shortDesc: "Hương hoa",
    description: "Mô tả",
    tags: [],
    brand: { id: "b1", name: "BeanBox Roastery", slug: "beanbox-roastery" },
    category: { id: "c1", name: "Specialty", slug: "specialty" },
    breadcrumbs: [],
    images: [{ id: "i1", url: "/uploads/seed/x.svg", alt: "Ảnh", isPrimary: true }],
    variants: [
      makeVariant({
        id: "v1",
        sku: "A-250",
        effectivePrice: 185000,
        price: 210000,
        salePrice: 185000,
        isOnSale: true,
      }),
      makeVariant({ id: "v2", sku: "A-500", name: "500 g", price: 380000, effectivePrice: 380000 }),
    ],
    minPrice: 185000,
    inStock: true,
    coffee: null,
    ratingAvg: 4.6,
    ratingCount: 18,
    seo: { title: "Ethiopia | BeanBox", description: "Mô tả SEO" },
    related: [],
    createdAt: "2026-10-01T00:00:00.000Z",
    ...over,
  };
}
