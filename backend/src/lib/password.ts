import argon2 from 'argon2';
import { z } from 'zod';

export const passwordSchema = z
  .string()
  .min(8, 'Mật khẩu phải có ít nhất 8 ký tự')
  .max(72, 'Mật khẩu tối đa 72 ký tự')
  .regex(/\p{L}/u, 'Mật khẩu phải có ít nhất 1 chữ cái')
  .regex(/\d/, 'Mật khẩu phải có ít nhất 1 chữ số');

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/** Chạy verify trên hash giả để đăng nhập email không tồn tại tốn thời gian tương đương. */
export async function verifyDummyPassword(plain: string): Promise<void> {
  dummyHash ??= hashPassword('dummy-password-for-timing-0');
  await verifyPassword(await dummyHash, plain);
}
