import { describe, expect, it } from "vitest";
import { makeDetail, makeVariant } from "./fixtures";
import {
  buildBreadcrumbJsonLd,
  buildItemListJsonLd,
  buildOrganizationJsonLd,
  buildProductJsonLd,
  buildWebSiteJsonLd,
  serializeJsonLd,
} from "./jsonld";

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
      itemCondition: "https://schema.org/NewCondition",
    });
    expect(ld).toMatchObject({
      "@context": "https://schema.org",
      url: `${SITE}/san-pham/ethiopia-yirgacheffe`,
      name: "Ethiopia Yirgacheffe",
    });
    expect(ld).toHaveProperty("description");
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

describe("buildProductJsonLd - URL tuyệt đối và dữ liệu thiếu", () => {
  it("image đã tuyệt đối giữ nguyên; không ảnh -> bỏ khóa image; không shippingDetails/returnPolicy", () => {
    const abs = buildProductJsonLd(
      makeDetail({
        images: [{ id: "i", url: "https://cdn.test/a.jpg", alt: null, isPrimary: true }],
      }),
      SITE,
    ) as unknown as Ld;
    expect(abs.image).toEqual(["https://cdn.test/a.jpg"]);
    const none = buildProductJsonLd(makeDetail({ images: [] }), SITE);
    expect(none).not.toHaveProperty("image");
    const all = JSON.stringify(buildProductJsonLd(makeDetail(), SITE));
    expect(all).not.toContain("shippingDetails");
    expect(all).not.toContain("hasMerchantReturnPolicy");
  });

  it("không brand -> bỏ khóa brand", () => {
    expect(buildProductJsonLd(makeDetail({ brand: null }), SITE)).not.toHaveProperty("brand");
  });
});

describe("buildItemListJsonLd", () => {
  it("position liên tục từ startPosition, url tuyệt đối", () => {
    const ld = buildItemListJsonLd(
      [{ path: "/san-pham/a", name: "A" }, { path: "/san-pham/b" }],
      13,
      SITE,
    );
    expect(ld["@type"]).toBe("ItemList");
    expect(ld.itemListElement).toEqual([
      { "@type": "ListItem", position: 13, url: `${SITE}/san-pham/a`, name: "A" },
      { "@type": "ListItem", position: 14, url: `${SITE}/san-pham/b` },
    ]);
  });

  it("escape < khi serialize", () => {
    const s = serializeJsonLd(buildItemListJsonLd([{ path: "/x", name: "</script>" }], 1, SITE));
    expect(s).not.toContain("<");
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

describe("buildBreadcrumbJsonLd", () => {
  it("thêm Trang chủ ở vị trí 1, URL tuyệt đối, position tăng dần", () => {
    const ld = buildBreadcrumbJsonLd(
      [
        { name: "Cà phê hạt", path: "/danh-muc/ca-phe-hat" },
        { name: "Robusta", path: "/san-pham/robusta" },
      ],
      SITE,
    );
    expect(ld["@type"]).toBe("BreadcrumbList");
    expect(ld.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Trang chủ", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: "Cà phê hạt", item: `${SITE}/danh-muc/ca-phe-hat` },
      { "@type": "ListItem", position: 3, name: "Robusta", item: `${SITE}/san-pham/robusta` },
    ]);
  });
});

describe("Organization / WebSite JSON-LD", () => {
  const site = { name: "BeanBox", description: "Mô tả" };

  it("Organization có name và url", () => {
    expect(buildOrganizationJsonLd(site, SITE)).toMatchObject({
      "@type": "Organization",
      name: "BeanBox",
      url: SITE,
      logo: `${SITE}/opengraph-image`,
    });
  });

  it("WebSite có SearchAction trỏ /tim-kiem?q={search_term_string}", () => {
    const ld = buildWebSiteJsonLd(site, SITE);
    expect(ld["@type"]).toBe("WebSite");
    expect(ld.potentialAction).toMatchObject({
      "@type": "SearchAction",
      target: { urlTemplate: `${SITE}/tim-kiem?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    });
  });
});
