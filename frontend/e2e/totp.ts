import { createHmac } from "node:crypto";

/**
 * TOTP (RFC 6238, HMAC-SHA1, 30 giây, 6 số) viết lại độc lập cho E2E: không import code của backend
 * để E2E kiểm chứng chéo cài đặt phía server (D-063).
 */

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_MS = 30_000;

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/[\s=-]/g, "").toUpperCase();
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error("Ký tự base32 không hợp lệ");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
    value &= (1 << bits) - 1;
  }
  return Buffer.from(out);
}

export function hotp(secret: Buffer, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", secret).update(msg).digest();
  const off = h[h.length - 1]! & 0x0f;
  const n = ((h[off]! & 0x7f) << 24) | (h[off + 1]! << 16) | (h[off + 2]! << 8) | h[off + 3]!;
  return String(n % 1_000_000).padStart(6, "0");
}

export const stepOf = (nowMs: number) => Math.floor(nowMs / STEP_MS);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Trả mã hợp lệ và CHƯA bị dùng (bước > `lastUsedStep`), tránh flaky gần biên 30 giây:
 * nếu còn < 3 giây tới bước kế thì chờ sang bước mới; chỉ dùng bước hiện tại hoặc kế tiếp
 * (server nhận cửa sổ +-1 nên cả hai đều an toàn dù biên bước bị vượt giữa lúc tính và lúc kiểm).
 */
export async function freshCode(
  secret: Buffer,
  lastUsedStep: number | null,
): Promise<{ code: string; step: number }> {
  for (;;) {
    const now = Date.now();
    const toNext = STEP_MS - (now % STEP_MS);
    if (toNext < 3000) {
      await sleep(toNext + 250);
      continue;
    }
    const cur = stepOf(now);
    const candidate = Math.max(cur, (lastUsedStep ?? -1) + 1);
    if (candidate <= cur + 1) return { code: hotp(secret, candidate), step: candidate };
    await sleep(toNext + 250); // đã dùng cả bước kế tiếp: chờ sang bước mới
  }
}
