import type { Request } from 'express';
import { AppError } from './errors.js';
import { normalizeOrderCode } from './orderCode.js';

/**
 * D-076: khóa tạm theo MÃ ĐƠN cho các thao tác của khách vãng lai xác thực bằng mã đơn + SĐT
 * (track, hủy, tạo thanh toán, hướng dẫn/báo chuyển khoản). Bổ sung (không thay) limiter theo IP:
 * chặn dò SĐT của một mã đơn từ nhiều IP.
 *
 * Trạng thái nằm trong tiến trình (1 instance, D-027): mất khi khởi động lại, không chia sẻ giữa instance.
 * Mã không tồn tại được đếm y hệt mã có thật nên phản hồi không lộ mã nào tồn tại.
 */
export const LOOKUP_MAX_FAILURES = 5;
export const LOOKUP_WINDOW_MS = 15 * 60_000;
export const LOOKUP_LOCK_MS = 15 * 60_000;
export const LOOKUP_MAX_KEYS = 10_000;

interface Entry {
  failures: number;
  windowStart: number;
  lockedUntil: number;
}

export interface OrderLookupLockOptions {
  now?: () => number;
  maxFailures?: number;
  windowMs?: number;
  lockMs?: number;
  maxKeys?: number;
}

export class OrderLookupLock {
  private readonly entries = new Map<string, Entry>();
  private readonly now: () => number;
  private readonly maxFailures: number;
  private readonly windowMs: number;
  private readonly lockMs: number;
  private readonly maxKeys: number;

  constructor(opts: OrderLookupLockOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.maxFailures = opts.maxFailures ?? LOOKUP_MAX_FAILURES;
    this.windowMs = opts.windowMs ?? LOOKUP_WINDOW_MS;
    this.lockMs = opts.lockMs ?? LOOKUP_LOCK_MS;
    this.maxKeys = opts.maxKeys ?? LOOKUP_MAX_KEYS;
  }

  /** Khóa theo mã đơn đã chuẩn hóa; cắt độ dài để chuỗi rác không phình bộ nhớ. */
  static keyOf(rawCode: string): string {
    return normalizeOrderCode(rawCode).slice(0, 40);
  }

  get size(): number {
    return this.entries.size;
  }

  private expired(e: Entry, t: number): boolean {
    return e.lockedUntil > 0 ? e.lockedUntil <= t : e.windowStart + this.windowMs <= t;
  }

  /** Còn khóa -> số giây phải chờ (làm tròn lên), ngược lại 0. Dọn mục hết hạn của khóa này. */
  retryAfterSec(key: string): number {
    const e = this.entries.get(key);
    if (!e) return 0;
    const t = this.now();
    if (this.expired(e, t)) {
      this.entries.delete(key);
      return 0;
    }
    return e.lockedUntil > t ? Math.ceil((e.lockedUntil - t) / 1000) : 0;
  }

  recordFailure(key: string): void {
    const t = this.now();
    let e = this.entries.get(key);
    if (e && this.expired(e, t)) {
      this.entries.delete(key);
      e = undefined;
    }
    if (!e) {
      this.makeRoom(t);
      e = { failures: 0, windowStart: t, lockedUntil: 0 };
      this.entries.set(key, e);
    }
    if (e.lockedUntil > t) return; // đã khóa: không kéo dài thêm
    e.failures += 1;
    if (e.failures >= this.maxFailures) e.lockedUntil = t + this.lockMs;
  }

  recordSuccess(key: string): void {
    const e = this.entries.get(key);
    if (e && e.lockedUntil <= this.now()) this.entries.delete(key);
  }

  /** Dọn mục hết hạn; vẫn đầy thì bỏ mục chưa khóa cũ nhất, cuối cùng mới bỏ mục cũ nhất. */
  private makeRoom(t: number): void {
    if (this.entries.size < this.maxKeys) return;
    for (const [k, e] of this.entries) if (this.expired(e, t)) this.entries.delete(k);
    if (this.entries.size < this.maxKeys) return;
    for (const [k, e] of this.entries) {
      if (e.lockedUntil <= t) {
        this.entries.delete(k);
        return;
      }
    }
    const oldest = this.entries.keys().next();
    if (!oldest.done) this.entries.delete(oldest.value);
  }

  clear(): void {
    this.entries.clear();
  }
}

export function orderLookupLocked(retryAfterSec: number): AppError {
  return new AppError(
    429,
    'ORDER_LOOKUP_LOCKED',
    'Bạn đã nhập sai thông tin đơn hàng quá nhiều lần. Vui lòng thử lại sau ít phút.',
    { retryAfterSec },
  );
}

/**
 * Bọc một thao tác của khách vãng lai. Đã đăng nhập -> chạy thẳng (xác thực bằng token).
 * Lỗi 404 NOT_FOUND = sai mã hoặc sai SĐT -> tính 1 lần sai; kết quả khác (kể cả 409/400) = đã xác thực đúng.
 */
export async function guardGuestLookup<T>(
  req: Request,
  rawCode: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (req.auth?.userId) return fn();
  const guard = req.app.locals.orderLookupLock as OrderLookupLock | undefined;
  if (!guard) return fn();
  const key = OrderLookupLock.keyOf(rawCode);
  const wait = guard.retryAfterSec(key);
  if (wait > 0) throw orderLookupLocked(wait);
  try {
    const result = await fn();
    guard.recordSuccess(key);
    return result;
  } catch (err) {
    if (err instanceof AppError && err.status === 404 && err.code === 'NOT_FOUND') {
      guard.recordFailure(key);
    } else if (err instanceof AppError && err.status !== 400 && err.status !== 429) {
      guard.recordSuccess(key);
    }
    throw err;
  }
}
