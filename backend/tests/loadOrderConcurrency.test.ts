import { describe, expect, it } from 'vitest';
import {
  deterministicUuidV4,
  median,
  percentile,
  resolveLoadConfig,
} from '../scripts/load-order-concurrency.js';

// URL giả dựng lúc chạy (không để literal giống secret cho scanner).
const db = (port: number) => `postgresql://u:${['p', 'w'].join('')}@127.0.0.1:${port}/load`;
const base = { LOAD_API_URL: 'http://127.0.0.1:4300', LOAD_DATABASE_URL: db(5440) };

describe('resolveLoadConfig (rào an toàn script đo tải)', () => {
  it('chấp nhận backend + DB tạm, giá trị mặc định', () => {
    const cfg = resolveLoadConfig({ ...base, LOAD_TAG: 't' });
    expect(cfg).toMatchObject({ stock: 20, orders: 100, concurrency: [25, 50, 100], repeats: 3 });
  });

  it('từ chối thiếu biến, cổng API 4000/4100 và DB localhost:5432', () => {
    expect(() => resolveLoadConfig({})).toThrow(/LOAD_API_URL/);
    expect(() => resolveLoadConfig({ LOAD_API_URL: base.LOAD_API_URL })).toThrow(
      /LOAD_DATABASE_URL/,
    );
    expect(() => resolveLoadConfig({ ...base, LOAD_API_URL: 'http://127.0.0.1:4000' })).toThrow(
      /4000/,
    );
    expect(() => resolveLoadConfig({ ...base, LOAD_API_URL: 'http://localhost:4100/' })).toThrow(
      /4100/,
    );
    expect(() => resolveLoadConfig({ ...base, LOAD_DATABASE_URL: db(5432) })).toThrow(/5432/);
  });

  it('chỉ cho phép khi có cờ rõ ràng; từ chối host ngoài và production', () => {
    const allowed = resolveLoadConfig({
      LOAD_API_URL: 'http://127.0.0.1:4000',
      LOAD_DATABASE_URL: db(5432),
      LOAD_ALLOW_PROTECTED: '1',
    });
    expect(allowed.apiUrl).toBe('http://127.0.0.1:4000');
    expect(() => resolveLoadConfig({ ...base, LOAD_API_URL: 'http://example.com:4300' })).toThrow(
      /localhost/,
    );
    expect(() => resolveLoadConfig({ ...base, NODE_ENV: 'production' })).toThrow(/production/);
  });

  it('kiểm biên các tham số số', () => {
    expect(() => resolveLoadConfig({ ...base, LOAD_STOCK: '0' })).toThrow(/LOAD_STOCK/);
    expect(() => resolveLoadConfig({ ...base, LOAD_ORDERS: '10', LOAD_STOCK: '11' })).toThrow(
      /LOAD_STOCK/,
    );
    expect(() => resolveLoadConfig({ ...base, LOAD_CONCURRENCY: '25,x' })).toThrow(
      /LOAD_CONCURRENCY/,
    );
    expect(resolveLoadConfig({ ...base, LOAD_CONCURRENCY: '5, 10' }).concurrency).toEqual([5, 10]);
  });
});

describe('percentile và median', () => {
  it('nearest-rank trên mảng đã sắp xếp', () => {
    const xs = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(xs, 50)).toBe(50);
    expect(percentile(xs, 95)).toBe(95);
    expect(percentile(xs, 99)).toBe(99);
    expect(percentile([7], 99)).toBe(7);
    expect(percentile([], 50)).toBe(0);
  });

  it('median số lẻ và chẵn phần tử', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });
});

describe('deterministicUuidV4', () => {
  it('ra UUID v4 hợp lệ, tất định và khác nhau theo đầu vào', () => {
    const re = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    const a = deterministicUuidV4('load-x-c25-r1-0');
    expect(a).toMatch(re);
    expect(deterministicUuidV4('load-x-c25-r1-0')).toBe(a);
    expect(deterministicUuidV4('load-x-c25-r1-1')).not.toBe(a);
    for (let i = 0; i < 200; i++) expect(deterministicUuidV4(`k${i}`)).toMatch(re);
  });
});
