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
    /** D-062: số ngày giao dự kiến theo vùng x phương thức. */
    eta: ShippingEtaSettings;
    freeShippingThreshold: number;
    innerCityWardCount: number;
    weightSurcharge: WeightSurcharge;
    innerCityProvinces: { code: string; name: string }[];
  };
  order: { paymentExpiryMinutes: number };
  store: { contact: StoreContact };
  home: { banners: PublicBanner[] };
}

/** D-062: số ngày giao dự kiến (ngày lịch) theo vùng x phương thức. */
export interface EtaRangeSetting {
  minDays: number;
  maxDays: number;
}
export interface ShippingEtaSettings {
  inner: { STANDARD: EtaRangeSetting; EXPRESS: EtaRangeSetting };
  other: { STANDARD: EtaRangeSetting; EXPRESS: EtaRangeSetting };
}

/** D-061: tài khoản nhận chuyển khoản. Mặc định BIN 999999 (không tồn tại) = tài khoản demo. */
export interface BankTransferSettings {
  bankBin: string;
  bankName: string;
  accountNo: string;
  accountName: string;
}

/** GET/PUT /admin/settings: `data` (đủ mọi key). */
export interface AdminSettings {
  "shipping.rates": ShippingRates;
  "shipping.eta": ShippingEtaSettings;
  "shipping.innerCityProvinceCodes": string[];
  "shipping.innerCityWardCodes": string[];
  "shipping.freeShippingThreshold": number;
  "shipping.weightSurcharge": WeightSurcharge;
  "order.paymentExpiryMinutes": number;
  "store.contact": StoreContact;
  "home.banners": PublicBanner[];
  "payment.bankTransfer": BankTransferSettings;
}

export type AdminSettingKey = keyof AdminSettings;

export interface AdminSettingsMeta {
  updatedAt: Partial<Record<AdminSettingKey, string | null>>;
}
