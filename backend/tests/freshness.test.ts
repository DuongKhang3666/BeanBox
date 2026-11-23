import { describe, expect, it } from 'vitest';
import { priceCartLine, type CartLineInput } from '../src/lib/cartLine.js';
import {
  isRoastExpired,
  roastAgeDays,
  roastStatusOf,
  roastStatusOfAge,
} from '../src/lib/freshness.js';

/** Ngày rang (cột DATE) = UTC 00:00 của ngày lịch. */
const roast = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

describe('roastAgeDays (D-082, đồng hồ tiêm, ngày giờ VN)', () => {
  const r = roast('2030-01-01');

  it('đếm ngày nguyên theo ngày lịch VN', () => {
    expect(roastAgeDays(r, new Date('2029-12-31T17:00:00Z'))).toBe(0); // 00:00 ngày 01/01 VN
    expect(roastAgeDays(r, new Date('2030-01-01T16:59:59Z'))).toBe(0); // 23:59:59 ngày 01/01 VN
    expect(roastAgeDays(r, new Date('2030-01-01T17:00:00Z'))).toBe(1); // sang 02/01 VN
    expect(roastAgeDays(r, new Date('2030-01-31T10:00:00Z'))).toBe(30);
  });

  it('null/undefined -> null; ngày rang ở tương lai -> 0', () => {
    expect(roastAgeDays(null, new Date('2030-01-01T00:00:00Z'))).toBeNull();
    expect(roastAgeDays(undefined, new Date('2030-01-01T00:00:00Z'))).toBeNull();
    expect(roastAgeDays(r, new Date('2029-06-01T00:00:00Z'))).toBe(0);
  });
});

describe('roastStatusOfAge: ngưỡng 30 ngày khuyến nghị và 90 ngày ngừng bán', () => {
  it('biên', () => {
    expect(roastStatusOfAge(null)).toBeNull();
    expect(roastStatusOfAge(0)).toBe('FRESH');
    expect(roastStatusOfAge(30)).toBe('FRESH');
    expect(roastStatusOfAge(31)).toBe('PAST_RECOMMENDED');
    expect(roastStatusOfAge(90)).toBe('PAST_RECOMMENDED');
    expect(roastStatusOfAge(91)).toBe('EXPIRED');
  });

  it('theo ngày thật: 01/01 + 90 ngày = 01/04 còn bán đến hết ngày VN, sang 02/04 thì hết hạn', () => {
    const r = roast('2030-01-01');
    expect(roastStatusOf(r, new Date('2030-04-01T16:59:59Z'))).toBe('PAST_RECOMMENDED');
    expect(isRoastExpired(r, new Date('2030-04-01T16:59:59Z'))).toBe(false);
    expect(isRoastExpired(r, new Date('2030-04-01T17:00:00Z'))).toBe(true);
    expect(isRoastExpired(null, new Date('2099-01-01T00:00:00Z'))).toBe(false);
  });
});

describe('priceCartLine với độ tươi', () => {
  const line = (roastDate: Date | null | undefined): CartLineInput => ({
    quantity: 1,
    unitPriceAtAdd: 100000,
    variant: {
      price: 100000,
      salePrice: null,
      saleStart: null,
      saleEnd: null,
      stock: 10,
      lowStockThreshold: 3,
      isActive: true,
      deletedAt: null,
      weightGram: 250,
      ...(roastDate === undefined ? {} : { roastDate }),
    },
    product: { status: 'ACTIVE', deletedAt: null },
  });
  const now = new Date('2030-03-01T05:00:00Z'); // 59 ngày sau 01/01

  it('quá 90 ngày -> UNAVAILABLE, không tính tiền', () => {
    const r = priceCartLine(line(roast('2029-11-01')), now);
    expect(r.roastStatus).toBe('EXPIRED');
    expect(r.warnings).toContain('UNAVAILABLE');
    expect(r.countable).toBe(false);
  });

  it('31..90 ngày: vẫn bán, chỉ mang nhãn PAST_RECOMMENDED và số ngày', () => {
    const r = priceCartLine(line(roast('2030-01-01')), now);
    expect(r.roastAgeDays).toBe(59);
    expect(r.roastStatus).toBe('PAST_RECOMMENDED');
    expect(r.warnings).toEqual([]);
    expect(r.countable).toBe(true);
  });

  it('roastDate null hoặc không có: không áp quy tắc', () => {
    for (const d of [null, undefined]) {
      const r = priceCartLine(line(d), now);
      expect(r.roastAgeDays).toBeNull();
      expect(r.roastStatus).toBeNull();
      expect(r.warnings).toEqual([]);
    }
  });
});
