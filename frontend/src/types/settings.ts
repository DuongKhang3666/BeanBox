/** Theo docs/api-contract.md §14.9. */
export interface ShippingRates {
  inner: { STANDARD: number; EXPRESS: number };
  other: { STANDARD: number; EXPRESS: number };
}

export interface WeightSurcharge {
  freeGram: number;
  stepGram: number;
  feePerStep: number;
}

export interface StoreContact {
  name: string;
  email: string;
  phone: string;
  address: string;
}

/** Banner trang chủ trả ở GET /settings/public (chỉ phần tử isActive). */
export interface PublicBanner {
  imageUrl: string;
  alt: string;
  title: string;
  subtitle: string;
  href: string | null;
  isActive: boolean;
}

/** Captcha form liên hệ (D-028). `null` = tắt. */
export interface ContactCaptcha {
  provider: "turnstile";
  siteKey: string;
}

/** GET /settings/public. */
export interface PublicSettings {
  contactCaptcha: ContactCaptcha | null;
  shipping: {
    rates: ShippingRates;
    freeShippingThreshold: number;
    innerCityWardCount: number;
    weightSurcharge: WeightSurcharge;
    innerCityProvinces: { code: string; name: string }[];
  };
  order: { paymentExpiryMinutes: number };
  store: { contact: StoreContact };
  home: { banners: PublicBanner[] };
}

/** GET/PUT /admin/settings: `data` (đủ mọi key). */
export interface AdminSettings {
  "shipping.rates": ShippingRates;
  "shipping.innerCityProvinceCodes": string[];
  "shipping.innerCityWardCodes": string[];
  "shipping.freeShippingThreshold": number;
  "shipping.weightSurcharge": WeightSurcharge;
  "order.paymentExpiryMinutes": number;
  "store.contact": StoreContact;
  "home.banners": PublicBanner[];
}

export type AdminSettingKey = keyof AdminSettings;

export interface AdminSettingsMeta {
  updatedAt: Partial<Record<AdminSettingKey, string | null>>;
}
