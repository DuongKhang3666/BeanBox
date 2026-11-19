import { validateEmail, validateOptionalPhone } from "@/features/auth/validation";

/** Validate form liên hệ, mirror docs/api-contract.md §14.11. Server vẫn là nguồn quyết định. */
export const CONTACT_NAME_MAX = 100;
export const CONTACT_SUBJECT_MAX = 150;
export const CONTACT_MESSAGE_MIN = 10;
export const CONTACT_MESSAGE_MAX = 2000;

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export function validateContactName(value: string): string | null {
  const v = value.trim();
  if (!v) return "Vui lòng nhập họ tên";
  if (v.length < 2) return "Họ tên tối thiểu 2 ký tự";
  if (v.length > CONTACT_NAME_MAX) return `Họ tên tối đa ${CONTACT_NAME_MAX} ký tự`;
  if (CONTROL_CHARS.test(v)) return "Họ tên không được chứa ký tự xuống dòng";
  return null;
}

export function validateContactSubject(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (v.length > CONTACT_SUBJECT_MAX) return `Tiêu đề tối đa ${CONTACT_SUBJECT_MAX} ký tự`;
  if (CONTROL_CHARS.test(v)) return "Tiêu đề không được chứa ký tự xuống dòng";
  return null;
}

export function validateContactMessage(value: string): string | null {
  const v = value.trim();
  if (!v) return "Vui lòng nhập nội dung";
  if (v.length < CONTACT_MESSAGE_MIN) return `Nội dung tối thiểu ${CONTACT_MESSAGE_MIN} ký tự`;
  if (v.length > CONTACT_MESSAGE_MAX) return `Nội dung tối đa ${CONTACT_MESSAGE_MAX} ký tự`;
  return null;
}

export interface ContactInput {
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
}

export function validateContact(v: ContactInput): Record<string, string> {
  const checks: Array<[string, string | null]> = [
    ["name", validateContactName(v.name)],
    ["email", validateEmail(v.email)],
    ["phone", validateOptionalPhone(v.phone)],
    ["subject", validateContactSubject(v.subject)],
    ["message", validateContactMessage(v.message)],
  ];
  const out: Record<string, string> = {};
  for (const [f, m] of checks) if (m) out[f] = m;
  return out;
}
