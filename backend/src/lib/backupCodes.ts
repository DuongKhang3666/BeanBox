import { randomInt } from 'node:crypto';
import { sha256Hex } from './tokens.js';

/**
 * Mã dự phòng 2FA (D-063): 10 mã, mỗi mã 10 ký tự dạng `XXXXX-XXXXX`.
 * Bảng chữ cái bỏ ký tự dễ nhầm (I, L, O, 0, 1): 31 ký tự -> ~49,5 bit entropy/mã,
 * đủ để lưu SHA-256 (không cần băm chậm). Mỗi mã chỉ dùng một lần.
 */

export const BACKUP_CODE_COUNT = 10;
export const BACKUP_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const HALF = 5;
const LENGTH = HALF * 2;

export function generateBackupCode(): string {
  let s = '';
  for (let i = 0; i < LENGTH; i++)
    s += BACKUP_CODE_ALPHABET[randomInt(BACKUP_CODE_ALPHABET.length)];
  return `${s.slice(0, HALF)}-${s.slice(HALF)}`;
}

export function generateBackupCodes(count: number = BACKUP_CODE_COUNT): string[] {
  const set = new Set<string>();
  while (set.size < count) set.add(generateBackupCode());
  return [...set];
}

/** Bỏ khoảng trắng và "-", viết hoa. Trả null nếu không đúng 10 ký tự trong bảng chữ cái. */
export function normalizeBackupCode(input: string): string | null {
  const s = input.replace(/[\s-]/g, '').toUpperCase();
  if (s.length !== LENGTH) return null;
  for (const ch of s) if (!BACKUP_CODE_ALPHABET.includes(ch)) return null;
  return s;
}

/** Băm mã đã chuẩn hóa. */
export const hashBackupCode = (normalized: string): string => sha256Hex(normalized);
