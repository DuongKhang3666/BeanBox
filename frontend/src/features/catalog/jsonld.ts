import { DEFAULT_OG_IMAGE, SITE_URL } from "@/lib/site";
import type { ProductDetail } from "@/types/catalog";

function abs(siteUrl: string, pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${siteUrl}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

/** Dữ liệu có cấu trúc schema.org/Product cho trang chi tiết. */
export function buildProductJsonLd(product: ProductDetail, siteUrl: string = SITE_URL) {
  const prices = product.variants.map((v) => v.effectivePrice);
  const lowPrice = prices.length ? Math.min(...prices) : product.minPrice;
  const highPrice = prices.length ? Math.max(...prices) : product.minPrice;
  const available = product.variants.length
    ? product.variants.some((v) => v.stockStatus !== "OUT_OF_STOCK")
    : product.inStock;

  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    ...(product.images.length ? { image: product.images.map((i) => abs(siteUrl, i.url)) } : {}),
    description: product.seo.description || product.shortDesc || product.name,
    url: `${siteUrl}/san-pham/${product.slug}`,
    ...(product.variants[0] ? { sku: product.variants[0].sku } : {}),
    ...(product.brand ? { brand: { "@type": "Brand", name: product.brand.name } } : {}),
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "VND",
      lowPrice,
      highPrice,
      offerCount: Math.max(product.variants.length, 1),
      availability: available ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
    },
  };
  if (product.ratingCount > 0) {
    data.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: product.ratingAvg,
      reviewCount: product.ratingCount,
    };
  }
  return data;
}

/** Chuỗi JSON an toàn để nhúng trong <script>: thay "<" bằng < để không thể đóng thẻ script. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export interface BreadcrumbItem {
  name: string;
  /** Đường dẫn tương đối hoặc URL tuyệt đối. */
  path: string;
}

/** schema.org/BreadcrumbList; mục đầu luôn là Trang chủ. */
export function buildBreadcrumbJsonLd(items: BreadcrumbItem[], siteUrl: string = SITE_URL) {
  const all: BreadcrumbItem[] = [{ name: "Trang chủ", path: "/" }, ...items];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: all.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: abs(siteUrl, item.path),
    })),
  };
}

/** schema.org/Organization cho layout gốc. */
export function buildOrganizationJsonLd(
  site: { name: string; description: string },
  siteUrl: string = SITE_URL,
) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: site.name,
    url: siteUrl,
    // Ảnh OG mặc định 1200x630 (app/opengraph-image.tsx) làm logo; chưa có file logo riêng.
    logo: `${siteUrl}${DEFAULT_OG_IMAGE}`,
    description: site.description,
  };
}

/** schema.org/WebSite kèm SearchAction trỏ tới trang /tim-kiem. */
export function buildWebSiteJsonLd(
  site: { name: string; description: string },
  siteUrl: string = SITE_URL,
) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: site.name,
    url: siteUrl,
    description: site.description,
    inLanguage: "vi-VN",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${siteUrl}/tim-kiem?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export interface ItemListEntry {
  /** Đường dẫn tương đối hoặc URL tuyệt đối. */
  path: string;
  name?: string;
}

/** schema.org/ItemList cho trang danh sách; `startPosition` = vị trí của mục đầu (phân trang). */
export function buildItemListJsonLd(
  entries: ItemListEntry[],
  startPosition = 1,
  siteUrl: string = SITE_URL,
) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: entries.map((e, i) => ({
      "@type": "ListItem",
      position: startPosition + i,
      url: abs(siteUrl, e.path),
      ...(e.name ? { name: e.name } : {}),
    })),
  };
}
