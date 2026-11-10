import { describe, expect, it } from "vitest";
import { makeDetail, makeVariant } from "./fixtures";
import { buildProductJsonLd, serializeJsonLd } from "./jsonld";

const SITE = "https://beanbox.test";

type Ld = {
  sku?: string;
  image: string[];
  brand?: unknown;
  offers: Record<string, unknown>;
  aggregateRating?: unknown;
};

describe("buildProductJsonLd", () => {
  it("AggregateOffer theo effectivePrice, VND, ảnh tuyệt đối, sku biến thể đầu", () => {
    const ld = buildProductJsonLd(makeDetail(), SITE) as unknown as Ld & { "@type": string };
    expect(ld["@type"]).toBe("Product");
    expect(ld.sku).toBe("A-250");
    expect(ld.image).toEqual([`${SITE}/uploads/seed/x.svg`]);
    expect(ld.brand).toEqual({ "@type": "Brand", name: "BeanBox Roastery" });
    expect(ld.offers).toMatchObject({
      "@type": "AggregateOffer",
      priceCurrency: "VND",
      lowPrice: 185000,
      highPrice: 380000,
      offerCount: 2,
      availability: "https://schema.org/InStock",
    });
    expect(ld.aggregateRating).toMatchObject({ ratingValue: 4.6, reviewCount: 18 });
  });

  it("không có aggregateRating khi ratingCount = 0", () => {
    const ld = buildProductJsonLd(makeDetail({ ratingCount: 0, ratingAvg: 0 }), SITE);
    expect(ld).not.toHaveProperty("aggregateRating");
  });

  it("tất cả hết hàng -> OutOfStock", () => {
    const ld = buildProductJsonLd(
      makeDetail({ variants: [makeVariant({ stockStatus: "OUT_OF_STOCK" })] }),
      SITE,
    ) as unknown as Ld;
    expect(ld.offers.availability).toBe("https://schema.org/OutOfStock");
  });
});

describe("serializeJsonLd", () => {
  it("thay < bằng \\u003c để không thể đóng thẻ script", () => {
    const s = serializeJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(s).not.toContain("<");
    expect(s).toContain("\\u003c/script>");
    expect(JSON.parse(s).name).toBe("</script><script>alert(1)</script>");
  });
});
