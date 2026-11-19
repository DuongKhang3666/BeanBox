import { isValidPhone, normalizePhone } from "@/features/auth/validation";
import type { AdminSettings, AdminSettingKey, PublicBanner } from "@/types/settings";

/** Mọi lỗi theo đường dẫn field của §14.9, ví dụ "shipping.rates.inner.STANDARD". */
export type FieldErrors = Record<string, string>;

export type SectionId = "shipping" | "area" | "contact" | "banners";

export const SECTION_KEYS: Record<SectionId, readonly AdminSettingKey[]> = {
  shipping: [
    "shipping.rates",
    "shipping.freeShippingThreshold",
    "shipping.weightSurcharge",
    "order.paymentExpiryMinutes",
  ],
  area: ["shipping.innerCityProvinceCodes", "shipping.innerCityWardCodes"],
  contact: ["store.contact"],
  banners: ["home.banners"],
};

export const MAX_BANNERS = 5;
export const MAX_WARD_CODES = 500;

const CONTROL_RE = /[\u0000-\u001f\u007f]/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const num = (n: number) => String(n);

function intIn(raw: string, min: number, max: number, label: string): string | null {
  const v = raw.trim();
  if (!/^\d+$/.test(v) || Number(v) < min || Number(v) > max) {
    return `${label} phải là số nguyên từ ${min} đến ${max}`;
  }
  return null;
}

// ---------- Phí vận chuyển ----------

export interface ShippingDraft {
  innerStandard: string;
  innerExpress: string;
  otherStandard: string;
  otherExpress: string;
  threshold: string;
  freeGram: string;
  stepGram: string;
  feePerStep: string;
  expiry: string;
}

export function shippingDraft(s: AdminSettings): ShippingDraft {
  const r = s["shipping.rates"];
  const w = s["shipping.weightSurcharge"];
  return {
    innerStandard: num(r.inner.STANDARD),
    innerExpress: num(r.inner.EXPRESS),
    otherStandard: num(r.other.STANDARD),
    otherExpress: num(r.other.EXPRESS),
    threshold: num(s["shipping.freeShippingThreshold"]),
    freeGram: num(w.freeGram),
    stepGram: num(w.stepGram),
    feePerStep: num(w.feePerStep),
    expiry: num(s["order.paymentExpiryMinutes"]),
  };
}

export function validateShipping(d: ShippingDraft): FieldErrors {
  const e: FieldErrors = {};
  const check = (path: string, raw: string, min: number, max: number, label: string) => {
    const m = intIn(raw, min, max, label);
    if (m) e[path] = m;
  };
  const M = 1_000_000;
  check("shipping.rates.inner.STANDARD", d.innerStandard, 0, M, "Phí nội thành - Tiêu chuẩn");
  check("shipping.rates.inner.EXPRESS", d.innerExpress, 0, M, "Phí nội thành - Nhanh");
  check("shipping.rates.other.STANDARD", d.otherStandard, 0, M, "Phí tỉnh khác - Tiêu chuẩn");
  check("shipping.rates.other.EXPRESS", d.otherExpress, 0, M, "Phí tỉnh khác - Nhanh");
  check(
    "shipping.freeShippingThreshold",
    d.threshold,
    0,
    100_000_000,
    "Ngưỡng miễn phí vận chuyển",
  );
  check("shipping.weightSurcharge.freeGram", d.freeGram, 0, 100_000, "Khối lượng miễn phụ phí");
  check("shipping.weightSurcharge.stepGram", d.stepGram, 1, 100_000, "Bước khối lượng");
  check("shipping.weightSurcharge.feePerStep", d.feePerStep, 0, M, "Phụ phí mỗi bước");
  check("order.paymentExpiryMinutes", d.expiry, 5, 120, "Thời hạn thanh toán");
  return e;
}

export function buildShippingPatch(d: ShippingDraft): Partial<AdminSettings> {
  const n = (v: string) => Number(v.trim());
  return {
    "shipping.rates": {
      inner: { STANDARD: n(d.innerStandard), EXPRESS: n(d.innerExpress) },
      other: { STANDARD: n(d.otherStandard), EXPRESS: n(d.otherExpress) },
    },
    "shipping.freeShippingThreshold": n(d.threshold),
    "shipping.weightSurcharge": {
      freeGram: n(d.freeGram),
      stepGram: n(d.stepGram),
      feePerStep: n(d.feePerStep),
    },
    "order.paymentExpiryMinutes": n(d.expiry),
  };
}

// ---------- Khu vực nội thành ----------

export interface AreaDraft {
  provinces: string[];
  /** Mã phường 5 chữ số, phân cách bằng dấu phẩy/xuống dòng. */
  wards: string;
}

export function areaDraft(s: AdminSettings): AreaDraft {
  return {
    provinces: [...s["shipping.innerCityProvinceCodes"]],
    wards: s["shipping.innerCityWardCodes"].join("\n"),
  };
}

export function parseWardCodes(raw: string): string[] {
  return raw.split(/[\s,;]+/).filter(Boolean);
}

export function validateArea(d: AreaDraft): FieldErrors {
  const e: FieldErrors = {};
  const codes = parseWardCodes(d.wards);
  const bad = codes.find((c) => !/^\d{5}$/.test(c));
  if (bad !== undefined) {
    e["shipping.innerCityWardCodes"] =
      `Mã phường "${bad.slice(0, 20)}" không hợp lệ (cần đúng 5 chữ số)`;
  } else if (new Set(codes).size > MAX_WARD_CODES) {
    e["shipping.innerCityWardCodes"] = `Tối đa ${MAX_WARD_CODES} mã phường`;
  }
  return e;
}

export function buildAreaPatch(d: AreaDraft): Partial<AdminSettings> {
  return {
    "shipping.innerCityProvinceCodes": [...new Set(d.provinces)],
    "shipping.innerCityWardCodes": [...new Set(parseWardCodes(d.wards))],
  };
}

// ---------- Liên hệ ----------

export interface ContactDraft {
  name: string;
  email: string;
  phone: string;
  address: string;
}

export function contactDraft(s: AdminSettings): ContactDraft {
  return { ...s["store.contact"] };
}

export function validateContact(d: ContactDraft): FieldErrors {
  const e: FieldErrors = {};
  const name = d.name.trim();
  if (!name) e["store.contact.name"] = "Vui lòng nhập tên cửa hàng";
  else if (name.length > 100) e["store.contact.name"] = "Tên cửa hàng tối đa 100 ký tự";
  else if (CONTROL_RE.test(name)) e["store.contact.name"] = "Tên cửa hàng chứa ký tự không hợp lệ";
  const email = d.email.trim();
  if (!email) e["store.contact.email"] = "Vui lòng nhập email";
  else if (email.length > 254 || !EMAIL_RE.test(email)) {
    e["store.contact.email"] = "Email không hợp lệ";
  }
  if (d.phone.trim() && !isValidPhone(d.phone)) {
    e["store.contact.phone"] = "Số điện thoại không hợp lệ (ví dụ 0901234567)";
  }
  const address = d.address.trim();
  if (address.length > 300) e["store.contact.address"] = "Địa chỉ tối đa 300 ký tự";
  else if (CONTROL_RE.test(address)) e["store.contact.address"] = "Địa chỉ chứa ký tự không hợp lệ";
  return e;
}

export function buildContactPatch(d: ContactDraft): Partial<AdminSettings> {
  return {
    "store.contact": {
      name: d.name.trim(),
      email: d.email.trim().toLowerCase(),
      phone: d.phone.trim() ? normalizePhone(d.phone) : "",
      address: d.address.trim(),
    },
  };
}

// ---------- Banner ----------

export interface BannerDraft {
  /** Khóa React ổn định khi đổi thứ tự; không gửi lên server. */
  uid: number;
  imageUrl: string;
  alt: string;
  title: string;
  subtitle: string;
  href: string;
  isActive: boolean;
}

let uidSeq = 0;

export function emptyBanner(): BannerDraft {
  uidSeq += 1;
  return { uid: uidSeq, imageUrl: "", alt: "", title: "", subtitle: "", href: "", isActive: true };
}

export function bannersDraft(s: AdminSettings): BannerDraft[] {
  return s["home.banners"].map((b) => {
    uidSeq += 1;
    return {
      uid: uidSeq,
      imageUrl: b.imageUrl,
      alt: b.alt,
      title: b.title ?? "",
      subtitle: b.subtitle ?? "",
      href: b.href ?? "",
      isActive: b.isActive,
    };
  });
}

export function isUploadPath(v: string): boolean {
  return (
    v.startsWith("/uploads/") &&
    v.length > "/uploads/".length &&
    !v.includes("\\") &&
    !v.includes("..") &&
    !/[\s\u0000-\u001f\u007f]/.test(v)
  );
}

export function isInternalHref(v: string): boolean {
  return v.startsWith("/") && !v.startsWith("//") && !v.includes("\\") && !CONTROL_RE.test(v);
}

export function validateBanners(list: BannerDraft[]): FieldErrors {
  const e: FieldErrors = {};
  if (list.length > MAX_BANNERS) e["home.banners"] = `Tối đa ${MAX_BANNERS} banner`;
  list.forEach((b, i) => {
    const p = `home.banners.${i}`;
    const url = b.imageUrl.trim();
    if (!url) e[`${p}.imageUrl`] = "Vui lòng tải ảnh lên hoặc nhập đường dẫn ảnh";
    else if (!isUploadPath(url)) {
      e[`${p}.imageUrl`] =
        "Đường dẫn ảnh phải bắt đầu bằng /uploads/ (tải ảnh lên để lấy đường dẫn)";
    }
    const alt = b.alt.trim();
    if (!alt) e[`${p}.alt`] = "Vui lòng nhập mô tả ảnh (alt)";
    else if (alt.length > 200) e[`${p}.alt`] = "Mô tả ảnh tối đa 200 ký tự";
    if (b.title.trim().length > 100) e[`${p}.title`] = "Tiêu đề tối đa 100 ký tự";
    if (b.subtitle.trim().length > 200) e[`${p}.subtitle`] = "Phụ đề tối đa 200 ký tự";
    const href = b.href.trim();
    if (href) {
      if (href.length > 300) e[`${p}.href`] = "Liên kết tối đa 300 ký tự";
      else if (!isInternalHref(href)) {
        e[`${p}.href`] = "Liên kết phải là đường dẫn nội bộ bắt đầu bằng / (ví dụ /san-pham)";
      }
    }
  });
  return e;
}

export function buildBannersPatch(list: BannerDraft[]): Partial<AdminSettings> {
  const banners: PublicBanner[] = list.map((b) => ({
    imageUrl: b.imageUrl.trim(),
    alt: b.alt.trim(),
    title: b.title.trim(),
    subtitle: b.subtitle.trim(),
    href: b.href.trim() ? b.href.trim() : null,
    isActive: b.isActive,
  }));
  return { "home.banners": banners };
}

// ---------- Map lỗi 400 ----------

export function bannerFieldPaths(count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    for (const f of ["imageUrl", "alt", "title", "subtitle", "href", "isActive"]) {
      out.push(`home.banners.${i}.${f}`);
    }
  }
  return out;
}

/**
 * `details[].field` -> ô nhập. Khớp chính xác, hoặc field con của một ô (vd.
 * `shipping.innerCityWardCodes.3` -> ô mã phường). Không khớp -> `general`.
 */
export function mapServerFieldErrors(
  serverErrors: Record<string, string>,
  knownPaths: readonly string[],
): { fields: FieldErrors; general: string[] } {
  const fields: FieldErrors = {};
  const general: string[] = [];
  for (const [f, msg] of Object.entries(serverErrors)) {
    const target = knownPaths.includes(f) ? f : knownPaths.find((k) => f.startsWith(`${k}.`));
    if (target) fields[target] ??= msg;
    else general.push(msg);
  }
  return { fields, general };
}

export const SHIPPING_FIELD_PATHS = [
  "shipping.rates.inner.STANDARD",
  "shipping.rates.inner.EXPRESS",
  "shipping.rates.other.STANDARD",
  "shipping.rates.other.EXPRESS",
  "shipping.freeShippingThreshold",
  "shipping.weightSurcharge.freeGram",
  "shipping.weightSurcharge.stepGram",
  "shipping.weightSurcharge.feePerStep",
  "order.paymentExpiryMinutes",
] as const;

export const AREA_FIELD_PATHS = [
  "shipping.innerCityProvinceCodes",
  "shipping.innerCityWardCodes",
] as const;

export const CONTACT_FIELD_PATHS = [
  "store.contact.name",
  "store.contact.email",
  "store.contact.phone",
  "store.contact.address",
] as const;

/** Lần cập nhật mới nhất trong các key của một section (ISO), null nếu chưa có. */
export function latestUpdatedAt(
  keys: readonly AdminSettingKey[],
  updatedAt: Partial<Record<AdminSettingKey, string | null>>,
): string | null {
  let best: string | null = null;
  for (const k of keys) {
    const v = updatedAt[k];
    if (v && (!best || new Date(v).getTime() > new Date(best).getTime())) best = v;
  }
  return best;
}
