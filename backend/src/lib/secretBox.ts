import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Mã hóa secret TOTP lúc lưu (D-063): AES-256-GCM, IV 12 byte ngẫu nhiên mỗi lần.
 * Định dạng: `v1:<iv>:<tag>:<ciphertext>` (base64url). Sai khóa hoặc ciphertext bị sửa -> ném lỗi
 * (thẻ xác thực GCM không khớp). `aad` buộc ciphertext vào đúng ngữ cảnh (userId) để không hoán đổi giữa user.
 */

const VERSION = 'v1';
const IV_BYTES = 12;
const KEY_BYTES = 32;

export function encryptSecret(plain: Uint8Array, key: Buffer, aad?: string): string {
  if (key.length !== KEY_BYTES) throw new Error('Khóa mã hóa phải dài 32 byte');
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  if (aad !== undefined) cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ct.toString('base64url'),
  ].join(':');
}

export function decryptSecret(encoded: string, key: Buffer, aad?: string): Buffer {
  if (key.length !== KEY_BYTES) throw new Error('Khóa mã hóa phải dài 32 byte');
  const parts = encoded.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) throw new Error('Định dạng secret không hợp lệ');
  const iv = Buffer.from(parts[1]!, 'base64url');
  const tag = Buffer.from(parts[2]!, 'base64url');
  const ct = Buffer.from(parts[3]!, 'base64url');
  if (iv.length !== IV_BYTES || tag.length !== 16) throw new Error('Định dạng secret không hợp lệ');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  if (aad !== undefined) decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}
