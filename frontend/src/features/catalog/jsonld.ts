import { SITE_URL } from "@/lib/site";
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
    image: product.images.map((i) => abs(siteUrl, i.url)),
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
