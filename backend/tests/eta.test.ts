import { describe, expect, it } from 'vitest';
import {
  computeEta,
  computeEtaDates,
  formatDaysRange,
  formatEtaRange,
  vnCalendarDate,
  vnMorning,
} from '../src/lib/eta.js';
import { buildShippingOptions } from '../src/lib/shipping.js';
import {
  DEFAULT_SHOP_SETTINGS,
  type ShopSettings,
} from '../src/modules/settings/settings.service.js';

const settings = DEFAULT_SHOP_SETTINGS as ShopSettings;

describe('ngày lịch Việt Nam', () => {
  it('vnCalendarDate: biên nửa đêm UTC+7', () => {
    // 16:59:59 UTC = 23:59:59 VN cùng ngày; 17:00:00 UTC = 00:00:00 VN ngày kế
    expect(vnCalendarDate(new Date('2026-11-22T16:59:59Z')).toISOString()).toBe(
      '2026-11-22T00:00:00.000Z',
    );
    expect(vnCalendarDate(new Date('2026-11-22T17:00:00Z')).toISOString()).toBe(
      '2026-11-23T00:00:00.000Z',
    );
    expect(vnCalendarDate(new Date('2026-12-31T20:00:00Z')).toISOString()).toBe(
      '2027-01-01T00:00:00.000Z',
    );
  });

  it('computeEta: cộng ngày lịch, qua tháng/năm', () => {
    expect(computeEta(new Date('2026-11-22T03:00:00Z'), { minDays: 1, maxDays: 3 })).toEqual({
      minDays: 1,
      maxDays: 3,
      fromDate: '2026-11-23',
      toDate: '2026-11-25',
    });
    expect(computeEta(new Date('2026-12-30T18:00:00Z'), { minDays: 0, maxDays: 5 })).toMatchObject({
      fromDate: '2026-12-31',
      toDate: '2027-01-05',
    });
  });

  it('đặt lúc 23:30 VN tính từ ngày VN đó, 00:30 VN tính từ ngày kế', () => {
    const late = computeEtaDates(new Date('2026-11-22T16:30:00Z'), { minDays: 1, maxDays: 2 });
    const early = computeEtaDates(new Date('2026-11-22T17:30:00Z'), { minDays: 1, maxDays: 2 });
    expect(late.from.toISOString().slice(0, 10)).toBe('2026-11-23');
    expect(early.from.toISOString().slice(0, 10)).toBe('2026-11-24');
  });

  it('định dạng', () => {
    expect(formatDaysRange({ minDays: 3, maxDays: 5 })).toBe('3-5');
    expect(formatDaysRange({ minDays: 2, maxDays: 2 })).toBe('2');
    expect(formatEtaRange('2026-11-22', '2026-11-24')).toBe('22/11/2026 - 24/11/2026');
    expect(formatEtaRange('2026-11-22', '2026-11-22')).toBe('22/11/2026');
  });

  it('vnMorning: 08:00 VN = 01:00 UTC cùng ngày', () => {
    expect(vnMorning(new Date('2026-11-24T00:00:00Z')).toISOString()).toBe(
      '2026-11-24T01:00:00.000Z',
    );
  });
});

describe('ETA theo vùng x phương thức (settings mặc định)', () => {
  const now = new Date('2026-11-22T03:00:00Z');
  const base = {
    subtotal: 100000,
    discountTotal: 0,
    totalWeightGram: 500,
    settings,
    now,
    freeshipCoupon: null,
  };
  const pick = (zone: 'INNER' | 'OTHER') =>
    Object.fromEntries(
      buildShippingOptions({ ...base, zone }).map((o) => [
        o.method,
        [o.eta.fromDate, o.eta.toDate, o.estimatedDays],
      ]),
    );

  it('nội thành', () => {
    expect(pick('INNER')).toEqual({
      STANDARD: ['2026-11-23', '2026-11-24', '1-2'],
      EXPRESS: ['2026-11-22', '2026-11-23', '0-1'],
    });
  });
  it('ngoại tỉnh', () => {
    expect(pick('OTHER')).toEqual({
      STANDARD: ['2026-11-25', '2026-11-27', '3-5'],
      EXPRESS: ['2026-11-23', '2026-11-25', '1-3'],
    });
  });
  it('dùng giá trị từ settings tùy chỉnh', () => {
    const custom: ShopSettings = {
      ...settings,
      shippingEta: {
        ...settings.shippingEta,
        other: { ...settings.shippingEta.other, STANDARD: { minDays: 7, maxDays: 10 } },
      },
    };
    const std = buildShippingOptions({ ...base, settings: custom, zone: 'OTHER' }).find(
      (o) => o.method === 'STANDARD',
    )!;
    expect(std.eta).toEqual({
      minDays: 7,
      maxDays: 10,
      fromDate: '2026-11-29',
      toDate: '2026-12-02',
    });
  });
});
