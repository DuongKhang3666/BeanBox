import type { PublicBanner, PublicSettings } from "@/types/settings";

/** Khớp mặc định ở backend (docs/db-schema.md §6). Dùng khi API lỗi. */
export const DEFAULT_PUBLIC_SETTINGS: PublicSettings = {
  shipping: {
    rates: {
      inner: { STANDARD: 20000, EXPRESS: 35000 },
      other: { STANDARD: 35000, EXPRESS: 55000 },
    },
    freeShippingThreshold: 500000,
    innerCityWardCount: 0,
    weightSurcharge: { freeGram: 2000, stepGram: 1000, feePerStep: 5000 },
    innerCityProvinces: [
      { code: "01", name: "Thành phố Hà Nội" },
      { code: "79", name: "Thành phố Hồ Chí Minh" },
    ],
  },
  order: { paymentExpiryMinutes: 15 },
  store: { contact: { name: "BeanBox", email: "hello@beanbox.local", phone: "", address: "" } },
  home: { banners: [] },
};

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const isStr = (v: unknown): v is string => typeof v === "string";

/** Kiểm shape; sai bất kỳ chỗ nào thì trả null (caller dùng mặc định). */
export function normalizePublicSettings(raw: unknown): PublicSettings | null {
  if (!isObj(raw)) return null;
  const { shipping, order, store, home } = raw;
  if (!isObj(shipping) || !isObj(order) || !isObj(store) || !isObj(home)) return null;
  const rates = shipping.rates;
  if (!isObj(rates) || !isObj(rates.inner) || !isObj(rates.other)) return null;
  const { inner, other } = rates;
  if (![inner.STANDARD, inner.EXPRESS, other.STANDARD, other.EXPRESS].every(isInt)) return null;
  const ws = shipping.weightSurcharge;
  if (!isObj(ws) || !isInt(ws.freeGram) || !isInt(ws.stepGram) || !isInt(ws.feePerStep)) {
    return null;
  }
  if (!isInt(shipping.freeShippingThreshold) || !isInt(shipping.innerCityWardCount)) return null;
  if (!Array.isArray(shipping.innerCityProvinces)) return null;
  const provinces: { code: string; name: string }[] = [];
  for (const p of shipping.innerCityProvinces) {
    if (!isObj(p) || !isStr(p.code) || !isStr(p.name)) return null;
    provinces.push({ code: p.code, name: p.name });
  }
  if (!isInt(order.paymentExpiryMinutes)) return null;
  const c = isObj(store.contact) ? store.contact : null;
  if (!c || !isStr(c.name) || !isStr(c.email) || !isStr(c.phone) || !isStr(c.address)) return null;
  if (!Array.isArray(home.banners)) return null;
  const banners: PublicBanner[] = [];
  for (const b of home.banners) {
    if (!isObj(b) || !isStr(b.imageUrl) || !isStr(b.alt)) return null;
    banners.push({
      imageUrl: b.imageUrl,
      alt: b.alt,
      title: isStr(b.title) ? b.title : "",
      subtitle: isStr(b.subtitle) ? b.subtitle : "",
      href: isStr(b.href) ? b.href : null,
      isActive: b.isActive !== false,
    });
  }
  return {
    shipping: {
      rates: {
        inner: { STANDARD: inner.STANDARD as number, EXPRESS: inner.EXPRESS as number },
        other: { STANDARD: other.STANDARD as number, EXPRESS: other.EXPRESS as number },
      },
      freeShippingThreshold: shipping.freeShippingThreshold,
      innerCityWardCount: shipping.innerCityWardCount,
      weightSurcharge: {
        freeGram: ws.freeGram,
        stepGram: ws.stepGram,
        feePerStep: ws.feePerStep,
      },
      innerCityProvinces: provinces,
    },
    order: { paymentExpiryMinutes: order.paymentExpiryMinutes },
    store: { contact: { name: c.name, email: c.email, phone: c.phone, address: c.address } },
    home: { banners },
  };
}

/** Phòng thủ phía FE: chỉ banner có ảnh /uploads/ và href nội bộ (null hoặc "/..." không phải "//"). */
export function isSafeBanner(b: PublicBanner): boolean {
  if (!b.imageUrl.startsWith("/uploads/") || b.imageUrl.startsWith("/uploads//")) return false;
  if (b.href === null) return true;
  return b.href.startsWith("/") && !b.href.startsWith("//") && !b.href.includes("\\");
}
