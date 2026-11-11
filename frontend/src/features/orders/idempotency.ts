import { ApiError } from "@/lib/api/errors";

function newKey(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * Giữ `Idempotency-Key` gắn với payload (vân tay = JSON payload):
 * - cùng payload (bấm lại sau lỗi mạng/5xx/429 hoặc khi request còn chạy) -> cùng key;
 * - payload đổi, hoặc sau một phản hồi 4xx nghiệp vụ dứt khoát -> key mới.
 */
export class IdempotencyKeys {
  private fingerprint: string | null = null;
  private key: string | null = null;

  keyFor(fingerprint: string): string {
    if (this.key === null || this.fingerprint !== fingerprint) {
      this.fingerprint = fingerprint;
      this.key = newKey();
    }
    return this.key;
  }

  /** Gọi khi request kết thúc bằng lỗi: quyết định giữ hay bỏ key. */
  onError(err: unknown): void {
    if (err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 429) {
      this.reset();
    }
  }

  reset(): void {
    this.fingerprint = null;
    this.key = null;
  }
}
