import { describe, expect, it } from 'vitest';
import {
  buildBuckets,
  defaultGranularity,
  resolveRange,
} from '../src/modules/admin/analytics/analytics.range.js';
import { buildOverview, changePct } from '../src/modules/admin/analytics/analytics.service.js';

const TODAY = '2031-06-15'; // Chủ nhật

function errOf(fn: () => unknown) {
  try {
    fn();
  } catch (e) {
    return e as { status: number; code: string; details: Array<{ field: string }> };
  }
  throw new Error('không ném lỗi');
}

describe('resolveRange', () => {
  it('mặc định 30 ngày kết thúc hôm nay, kỳ trước liền kề cùng độ dài', () => {
    const r = resolveRange({}, TODAY);
    expect(r).toMatchObject({
      from: '2031-05-17',
      to: '2031-06-15',
      days: 30,
      granularity: 'day',
      previousFrom: '2031-04-17',
      previousTo: '2031-05-16',
    });
  });

  it('chỉ có from hoặc chỉ có to: dùng độ dài 30 ngày (to không vượt hôm nay)', () => {
    expect(resolveRange({ from: '2031-06-01' }, TODAY)).toMatchObject({
      from: '2031-06-01',
      to: '2031-06-15',
      days: 15,
    });
    expect(resolveRange({ from: '2031-05-01' }, TODAY)).toMatchObject({
      to: '2031-05-30',
      days: 30,
    });
    expect(resolveRange({ to: '2031-06-10' }, TODAY)).toMatchObject({
      from: '2031-05-12',
      to: '2031-06-10',
      days: 30,
    });
  });

  it('granularity mặc định theo số ngày: <=62 day, <=184 week, còn lại month', () => {
    expect(defaultGranularity(62)).toBe('day');
    expect(defaultGranularity(63)).toBe('week');
    expect(defaultGranularity(184)).toBe('week');
    expect(defaultGranularity(185)).toBe('month');
    expect(resolveRange({ from: '2031-01-01', to: '2031-06-15' }, TODAY).granularity).toBe('week');
    expect(resolveRange({ from: '2030-06-15', to: '2031-06-15' }, TODAY).granularity).toBe('month');
    expect(
      resolveRange({ from: '2031-06-01', to: '2031-06-15', granularity: 'month' }, TODAY)
        .granularity,
    ).toBe('month');
  });

  it('kỳ trước qua ranh giới năm nhuận/tháng', () => {
    const r = resolveRange({ from: '2028-03-01', to: '2028-03-10' }, '2031-06-15');
    expect(r.previousFrom).toBe('2028-02-20');
    expect(r.previousTo).toBe('2028-02-29');
  });

  it('từ chối: to sau hôm nay, from > to, quá 366 ngày, trước 2020-01-01', () => {
    expect(errOf(() => resolveRange({ to: '2031-06-16' }, TODAY)).details[0]!.field).toBe('to');
    expect(errOf(() => resolveRange({ from: '2031-06-10', to: '2031-06-09' }, TODAY)).code).toBe(
      'VALIDATION_ERROR',
    );
    expect(
      errOf(() => resolveRange({ from: '2030-06-14', to: '2031-06-15' }, TODAY)).details[0]!.field,
    ).toBe('to');
    expect(resolveRange({ from: '2030-06-15', to: '2031-06-15' }, TODAY).days).toBe(366);
    expect(errOf(() => resolveRange({ from: '2019-12-31', to: '2020-01-05' }, TODAY)).status).toBe(
      400,
    );
    expect(resolveRange({ from: '2020-01-01', to: '2020-01-05' }, TODAY).days).toBe(5);
    // from sau hôm nay (không có to): to = hôm nay < from
    expect(errOf(() => resolveRange({ from: '2031-07-01' }, TODAY)).status).toBe(400);
  });
});

describe('buildBuckets', () => {
  it('day: một bucket mỗi ngày', () => {
    const b = buildBuckets('2031-06-13', '2031-06-15', 'day');
    expect(b).toEqual([
      { start: '2031-06-13', end: '2031-06-13' },
      { start: '2031-06-14', end: '2031-06-14' },
      { start: '2031-06-15', end: '2031-06-15' },
    ]);
  });

  it('week: bắt đầu thứ Hai, bucket đầu/cuối bị cắt theo khoảng', () => {
    // 2031-06-11 là thứ Tư; 2031-06-15 là Chủ nhật; 2031-06-16 là thứ Hai.
    const b = buildBuckets('2031-06-11', '2031-06-17', 'week');
    expect(b).toEqual([
      { start: '2031-06-11', end: '2031-06-15' },
      { start: '2031-06-16', end: '2031-06-17' },
    ]);
    const full = buildBuckets('2031-06-09', '2031-06-22', 'week');
    expect(full).toEqual([
      { start: '2031-06-09', end: '2031-06-15' },
      { start: '2031-06-16', end: '2031-06-22' },
    ]);
    // 1970 làm mốc: tuần chứa Chủ nhật đứng riêng, không lẫn sang tuần sau.
    expect(buildBuckets('2031-06-15', '2031-06-15', 'week')).toEqual([
      { start: '2031-06-15', end: '2031-06-15' },
    ]);
  });

  it('month: theo tháng lịch, cắt đầu/cuối, qua năm và tháng 2 nhuận', () => {
    expect(buildBuckets('2031-11-20', '2032-02-10', 'month')).toEqual([
      { start: '2031-11-20', end: '2031-11-30' },
      { start: '2031-12-01', end: '2031-12-31' },
      { start: '2032-01-01', end: '2032-01-31' },
      { start: '2032-02-01', end: '2032-02-10' },
    ]);
    expect(buildBuckets('2032-02-01', '2032-02-29', 'month')).toEqual([
      { start: '2032-02-01', end: '2032-02-29' },
    ]);
  });

  it('bucket liên tục, không trùng, phủ đúng khoảng', () => {
    for (const g of ['day', 'week', 'month'] as const) {
      const b = buildBuckets('2030-12-29', '2031-03-02', g);
      expect(b[0]!.start).toBe('2030-12-29');
      expect(b[b.length - 1]!.end).toBe('2031-03-02');
      for (let i = 1; i < b.length; i++) {
        const prevEnd = new Date(`${b[i - 1]!.end}T00:00:00Z`).getTime() + 86400000;
        expect(new Date(`${b[i]!.start}T00:00:00Z`).getTime()).toBe(prevEnd);
      }
    }
  });
});

describe('changePct / buildOverview (hàm thuần)', () => {
  it('changePct làm tròn 1 chữ số, null khi kỳ trước = 0', () => {
    expect(changePct(350000, 300000)).toBe(16.7);
    expect(changePct(50, 100)).toBe(-50);
    expect(changePct(0, 100)).toBe(-100);
    expect(changePct(5, 0)).toBeNull();
    expect(changePct(0, 0)).toBeNull();
  });

  it('số liệu theo ngày được chia đúng kỳ hiện tại/trước và bucket', () => {
    const range = resolveRange({ from: '2031-06-10', to: '2031-06-15' }, TODAY);
    const out = buildOverview(
      {
        paid: [
          { d: '2031-06-15', revenue: 100, n: 1, discount: 10 },
          { d: '2031-06-09', revenue: 300, n: 1, discount: 0 },
          { d: '2031-05-01', revenue: 999, n: 9, discount: 0 }, // ngoài cả hai kỳ
        ],
        created: [{ d: '2031-06-10', n: 4, cancelled: 1 }],
        refunds: [],
        customers: [],
        profit: [],
      },
      range,
      new Date('2031-06-15T10:00:00Z'),
    );
    expect(out.kpis.revenue).toEqual({ current: 100, previous: 300, changePct: -66.7 });
    expect(out.kpis.cancelRate).toEqual({ current: 0.25, previous: 0, changePts: null });
    expect(out.series).toHaveLength(6);
    expect(out.previousSeries).toHaveLength(6);
    expect(out.series[5]).toMatchObject({ start: '2031-06-15', revenue: 100, paidOrders: 1 });
    expect(out.previousSeries[5]).toMatchObject({ start: '2031-06-09', revenue: 300 });
  });
});
