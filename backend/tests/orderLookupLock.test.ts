import { describe, expect, it } from 'vitest';
import { AppError } from '../src/lib/errors.js';
import {
  guardGuestLookup,
  LOOKUP_LOCK_MS,
  LOOKUP_MAX_KEYS,
  OrderLookupLock,
} from '../src/lib/orderLookupLock.js';

function mk(opts: ConstructorParameters<typeof OrderLookupLock>[0] = {}) {
  let t = 1_000_000;
  const lock = new OrderLookupLock({ now: () => t, ...opts });
  return { lock, advance: (ms: number) => (t += ms) };
}
const K = OrderLookupLock.keyOf('BB-261124-ABCD');

describe('OrderLookupLock', () => {
  it('chuẩn hóa mã (hoa/thường, khoảng trắng) về cùng một khóa', () => {
    expect(OrderLookupLock.keyOf(' bb-261124-abcd ')).toBe(K);
  });

  it('4 lần sai chưa khóa; lần thứ 5 khóa 15 phút, retryAfterSec làm tròn lên', () => {
    const { lock, advance } = mk();
    for (let i = 0; i < 4; i++) lock.recordFailure(K);
    expect(lock.retryAfterSec(K)).toBe(0);
    lock.recordFailure(K);
    expect(lock.retryAfterSec(K)).toBe(900);
    advance(1_500);
    expect(lock.retryAfterSec(K)).toBe(899);
  });

  it('mở khóa đúng sau 15 phút; sau đó đếm lại từ 0', () => {
    const { lock, advance } = mk();
    for (let i = 0; i < 5; i++) lock.recordFailure(K);
    advance(LOOKUP_LOCK_MS - 1);
    expect(lock.retryAfterSec(K)).toBe(1);
    advance(1);
    expect(lock.retryAfterSec(K)).toBe(0);
    expect(lock.size).toBe(0);
    for (let i = 0; i < 4; i++) lock.recordFailure(K);
    expect(lock.retryAfterSec(K)).toBe(0);
  });

  it('lần sai nằm ngoài cửa sổ 15 phút không cộng dồn', () => {
    const { lock, advance } = mk();
    for (let i = 0; i < 4; i++) lock.recordFailure(K);
    advance(15 * 60_000);
    lock.recordFailure(K);
    expect(lock.retryAfterSec(K)).toBe(0);
    for (let i = 0; i < 3; i++) lock.recordFailure(K);
    expect(lock.retryAfterSec(K)).toBe(0);
    lock.recordFailure(K);
    expect(lock.retryAfterSec(K)).toBeGreaterThan(0);
  });

  it('thành công trước khi khóa xóa bộ đếm; sau khi khóa thì không gỡ khóa', () => {
    const { lock } = mk();
    for (let i = 0; i < 4; i++) lock.recordFailure(K);
    lock.recordSuccess(K);
    expect(lock.size).toBe(0);
    for (let i = 0; i < 5; i++) lock.recordFailure(K);
    lock.recordSuccess(K);
    expect(lock.retryAfterSec(K)).toBe(900);
  });

  it('sai tiếp khi đã khóa không kéo dài thời gian khóa', () => {
    const { lock, advance } = mk();
    for (let i = 0; i < 5; i++) lock.recordFailure(K);
    advance(60_000);
    lock.recordFailure(K);
    expect(lock.retryAfterSec(K)).toBe(840);
  });

  it('khóa của mã này không ảnh hưởng mã khác', () => {
    const { lock } = mk();
    for (let i = 0; i < 5; i++) lock.recordFailure(K);
    expect(lock.retryAfterSec(OrderLookupLock.keyOf('BB-261124-WXYZ'))).toBe(0);
  });

  it('giới hạn kích thước: không vượt maxKeys, ưu tiên bỏ mục hết hạn rồi mục chưa khóa', () => {
    const { lock, advance } = mk({ maxKeys: 3 });
    for (let i = 0; i < 5; i++) lock.recordFailure('LOCKED');
    lock.recordFailure('A');
    lock.recordFailure('B');
    expect(lock.size).toBe(3);
    lock.recordFailure('C'); // đầy: bỏ mục chưa khóa cũ nhất (A), giữ LOCKED
    expect(lock.size).toBe(3);
    expect(lock.retryAfterSec('LOCKED')).toBe(900);
    advance(LOOKUP_LOCK_MS + 1); // tất cả hết hạn
    lock.recordFailure('D');
    expect(lock.size).toBe(1);
  });

  it('toàn bộ mục đang khóa mà vẫn đầy: bỏ mục cũ nhất, không phình', () => {
    const { lock } = mk({ maxKeys: 2 });
    for (const k of ['A', 'B']) for (let i = 0; i < 5; i++) lock.recordFailure(k);
    for (let i = 0; i < 5; i++) lock.recordFailure('C');
    expect(lock.size).toBe(2);
    expect(lock.retryAfterSec('A')).toBe(0);
    expect(lock.retryAfterSec('C')).toBe(900);
  });

  it('mặc định giới hạn 10.000 khóa', () => {
    expect(LOOKUP_MAX_KEYS).toBe(10_000);
    const { lock } = mk();
    for (let i = 0; i < LOOKUP_MAX_KEYS + 50; i++) lock.recordFailure(`K${i}`);
    expect(lock.size).toBe(LOOKUP_MAX_KEYS);
  });

  it('khóa dài bị cắt để chuỗi rác không phình bộ nhớ', () => {
    expect(OrderLookupLock.keyOf('x'.repeat(500)).length).toBeLessThanOrEqual(40);
  });
});

describe('guardGuestLookup', () => {
  const reqOf = (lock: OrderLookupLock | undefined, userId?: string) =>
    ({
      auth: userId ? { userId } : undefined,
      app: { locals: { orderLookupLock: lock } },
    }) as never;
  const notFound = () => new AppError(404, 'NOT_FOUND', 'Không tìm thấy đơn hàng');

  it('404 NOT_FOUND tính là sai; 400 và lỗi lạ không tính; 409 = đã xác thực đúng (xóa bộ đếm)', async () => {
    const { lock } = mk();
    const req = reqOf(lock);
    for (let i = 0; i < 3; i++) {
      await expect(
        guardGuestLookup(req, 'BB-261124-ABCD', () => Promise.reject(notFound())),
      ).rejects.toMatchObject({ status: 404 });
    }
    await expect(
      guardGuestLookup(req, 'BB-261124-ABCD', () =>
        Promise.reject(new AppError(400, 'VALIDATION_ERROR', 'x')),
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      guardGuestLookup(req, 'BB-261124-ABCD', () => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');
    expect(lock.size).toBe(1); // 400 và lỗi lạ không xóa, không cộng
    await expect(
      guardGuestLookup(req, 'BB-261124-ABCD', () =>
        Promise.reject(new AppError(409, 'PAYMENT_NOT_ALLOWED', 'x')),
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(lock.size).toBe(0);
  });

  it('đã khóa -> 429 ORDER_LOOKUP_LOCKED + details.retryAfterSec, KHÔNG gọi fn', async () => {
    const { lock } = mk();
    for (let i = 0; i < 5; i++) lock.recordFailure(K);
    let called = false;
    const err = await guardGuestLookup(reqOf(lock), 'bb-261124-abcd', () => {
      called = true;
      return Promise.resolve('ok');
    }).catch((e: unknown) => e as AppError);
    expect(called).toBe(false);
    expect((err as AppError).status).toBe(429);
    expect((err as AppError).code).toBe('ORDER_LOOKUP_LOCKED');
    expect((err as AppError).details).toEqual({ retryAfterSec: 900 });
    expect((err as AppError).message).toMatch(/thử lại/);
  });

  it('người dùng đã đăng nhập bỏ qua khóa (xác thực bằng token)', async () => {
    const { lock } = mk();
    for (let i = 0; i < 5; i++) lock.recordFailure(K);
    await expect(
      guardGuestLookup(reqOf(lock, 'u1'), 'BB-261124-ABCD', () => Promise.resolve('ok')),
    ).resolves.toBe('ok');
    await expect(
      guardGuestLookup(reqOf(lock, 'u1'), 'BB-261124-ABCD', () => Promise.reject(notFound())),
    ).rejects.toMatchObject({ status: 404 });
    expect(lock.retryAfterSec(K)).toBe(900); // không đổi
  });

  it('không có guard trong app.locals -> chạy thẳng', async () => {
    await expect(
      guardGuestLookup(reqOf(undefined), 'BB-261124-ABCD', () => Promise.resolve(1)),
    ).resolves.toBe(1);
  });
});
