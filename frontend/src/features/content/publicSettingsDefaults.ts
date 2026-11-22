import type { PublicBanner, PublicSettings } from "@/types/settings";

/** Khớp mặc định ở backend (docs/db-schema.md §6). Dùng khi API lỗi. */
export const DEFAULT_PUBLIC_SETTINGS: PublicSettings = {
  shipping: {
    rates: {
      inner: { STANDARD: 20000, EXPRESS: 35000 },
      other: { STANDARD: 35000, EXPRESS: 55000 },
    },
    eta: {
      inner: { STANDARD: { minDays: 1, maxDays: 2 }, EXPRESS: { minDays: 0, maxDays: 1 } },
      other: { STANDARD: { minDays: 3, maxDays: 5 }, EXPRESS: { minDays: 1, maxDays: 3 } },
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
  contactCaptcha: null,
};

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const isStr = (v: unknown): v is string => typeof v === "string";

function etaRange(v: unknown): { minDays: number; maxDays: number } | null {
  if (!isObj(v) || !isInt(v.minDays) || !isInt(v.maxDays) || v.minDays > v.maxDays) return null;
  return { minDays: v.minDays, maxDays: v.maxDays };
}

/** `shipping.eta` (D-062): backend cũ chưa có hoặc sai shape -> dùng mặc định. */
function normalizeEta(raw: unknown): PublicSettings["shipping"]["eta"] {
  const d = DEFAULT_PUBLIC_SETTINGS.shipping.eta;
  if (!isObj(raw) || !isObj(raw.inner) || !isObj(raw.other)) return d;
  const parts = [
    etaRange(raw.inner.STANDARD),
    etaRange(raw.inner.EXPRESS),
    etaRange(raw.other.STANDARD),
    etaRange(raw.other.EXPRESS),
  ];
  if (parts.some((p) => p === null)) return d;
  const [is, ie, os, oe] = parts as { minDays: number; maxDays: number }[];
  return { inner: { STANDARD: is!, EXPRESS: ie! }, other: { STANDARD: os!, EXPRESS: oe! } };
}

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
  // Thiếu/sai shape -> coi như tắt (backend cũ chưa có field này).
  const cc = raw.contactCaptcha;
  const contactCaptcha =
    isObj(cc) && cc.provider === "turnstile" && isStr(cc.siteKey) && cc.siteKey.trim() !== ""
      ? ({ provider: "turnstile", siteKey: cc.siteKey } as const)
      : null;
  return {
    contactCaptcha,
    shipping: {
      rates: {
        inner: { STANDARD: inner.STANDARD as number, EXPRESS: inner.EXPRESS as number },
        other: { STANDARD: other.STANDARD as number, EXPRESS: other.EXPRESS as number },
      },
      eta: normalizeEta(shipping.eta),
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
