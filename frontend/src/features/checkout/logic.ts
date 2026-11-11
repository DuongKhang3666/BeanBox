import {
  validateLine1,
  validateProvinceCode,
  validateWardCode,
} from "@/features/account/validation";
import {
  isValidPhone,
  normalizeEmail,
  validateEmail,
  validateFullName,
  validateOptionalPhone,
} from "@/features/auth/validation";
import type { CartItem } from "@/types/cart";
import type { PaymentOption, QuoteRequest } from "@/types/order";

export const NOTE_MAX = 500;

/** Thứ tự hiển thị của các field, dùng để focus ô lỗi đầu tiên. */
export const FIELD_ORDER = [
  "contactEmail",
  "contactPhone",
  "addressId",
  "shipFullName",
  "shipPhone",
  "shipLine1",
  "provinceCode",
  "wardCode",
  "note",
  "acceptTerms",
] as const;

/** `details[].field` của server (§9.2) -> id field trong form. */
const SERVER_FIELD_MAP: Record<string, string> = {
  "contact.email": "contactEmail",
  "contact.phone": "contactPhone",
  addressId: "addressId",
  "shippingAddress.fullName": "shipFullName",
  "shippingAddress.phone": "shipPhone",
  "shippingAddress.line1": "shipLine1",
  "shippingAddress.provinceCode": "provinceCode",
  "shippingAddress.wardCode": "wardCode",
  note: "note",
  acceptTerms: "acceptTerms",
};

export function mapOrderFieldErrors(details: unknown): {
  fieldErrors: Record<string, string>;
  extra: string | undefined;
} {
  const fieldErrors: Record<string, string> = {};
  let extra: string | undefined;
  if (Array.isArray(details)) {
    for (const d of details as Array<{ field?: unknown; message?: unknown }>) {
      if (typeof d?.field !== "string" || typeof d?.message !== "string") continue;
      const id = SERVER_FIELD_MAP[d.field];
      if (id) {
        if (!(id in fieldErrors)) fieldErrors[id] = d.message;
      } else if (!extra) {
        extra = d.message;
      }
    }
  }
  return { fieldErrors, extra };
}

export interface NewAddressValues {
  fullName: string;
  phone: string;
  line1: string;
  provinceCode: string;
  wardCode: string;
}

export interface CheckoutValues {
  authed: boolean;
  email: string;
  phone: string;
  /** Có -> dùng địa chỉ trong sổ, bỏ qua `address`. */
  addressId: string | null;
  address: NewAddressValues;
  acceptTerms: boolean;
  note: string;
}

export function validateCheckout(v: CheckoutValues): Record<string, string> {
  const e: Record<string, string> = {};
  if (!v.authed) {
    const err = validateEmail(v.email);
    if (err) e.contactEmail = err;
    if (!v.phone.trim()) e.contactPhone = "Vui lòng nhập số điện thoại";
    else if (!isValidPhone(v.phone))
      e.contactPhone = "Số điện thoại không hợp lệ (ví dụ 0901234567)";
  } else {
    const err = validateOptionalPhone(v.phone);
    if (err) e.contactPhone = err;
  }
  if (!v.addressId) {
    const a = v.address;
    const name = validateFullName(a.fullName);
    if (name) e.shipFullName = name;
    if (!a.phone.trim()) e.shipPhone = "Vui lòng nhập số điện thoại người nhận";
    else if (!isValidPhone(a.phone)) e.shipPhone = "Số điện thoại không hợp lệ (ví dụ 0901234567)";
    const line = validateLine1(a.line1);
    if (line) e.shipLine1 = line;
    const pc = validateProvinceCode(a.provinceCode);
    if (pc) e.provinceCode = pc;
    const wc = validateWardCode(a.wardCode);
    if (wc) e.wardCode = wc;
  }
  if (v.note.length > NOTE_MAX) e.note = `Ghi chú tối đa ${NOTE_MAX} ký tự`;
  if (!v.acceptTerms) e.acceptTerms = "Vui lòng đồng ý với điều khoản mua hàng";
  return e;
}

/** Body quote (§9.1); null khi chưa đủ địa chỉ. */
export function buildQuoteRequest(input: {
  addressId: string | null;
  provinceCode: string;
  wardCode: string;
  guestEmail: string | null;
}): QuoteRequest | null {
  let req: QuoteRequest;
  if (input.addressId) req = { addressId: input.addressId };
  else if (input.provinceCode && input.wardCode) {
    req = { provinceCode: input.provinceCode, wardCode: input.wardCode };
  } else return null;
  if (input.guestEmail && validateEmail(input.guestEmail) === null) {
    req.contactEmail = normalizeEmail(input.guestEmail);
  }
  return req;
}

/** Chữ ký giỏ: đổi khi dòng/số lượng/mã giảm giá đổi -> gọi lại quote. */
export function cartSignature(items: CartItem[], coupon: { code: string; valid: boolean } | null) {
  return `${items.map((i) => `${i.variantId}:${i.quantity}`).join(",")}|${
    coupon ? `${coupon.code}:${coupon.valid ? 1 : 0}` : ""
  }`;
}

export const DEFAULT_PAYMENT_METHODS: PaymentOption[] = [
  { method: "COD", enabled: true },
  { method: "VNPAY", enabled: false },
  { method: "STRIPE", enabled: false },
];
