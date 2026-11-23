import { describe, expect, it } from 'vitest';
import { allocateDiscount, profitFigures, weightedAvgCost } from '../src/lib/cost.js';

describe('weightedAvgCost (bình quân gia quyền di động, D-078)', () => {
  it('chưa có giá vốn (null) -> đúng đơn giá nhập', () => {
    expect(weightedAvgCost(10, null, 5, 70_000)).toBe(70_000);
  });

  it('tồn cũ = 0 hoặc âm -> đúng đơn giá nhập (không kéo giá cũ)', () => {
    expect(weightedAvgCost(0, 50_000, 10, 80_000)).toBe(80_000);
    expect(weightedAvgCost(-3, 50_000, 10, 80_000)).toBe(80_000);
  });

  it('một lần nhập: (10 x 60.000 + 10 x 80.000) / 20 = 70.000', () => {
    expect(weightedAvgCost(10, 60_000, 10, 80_000)).toBe(70_000);
  });

  it('nhiều lần nhập liên tiếp, tính cộng dồn', () => {
    // Lần 1: kho trống -> 100.000. Lần 2: 10 cũ + 30 mới @120.000 -> (1.000.000 + 3.600.000) / 40 = 115.000.
    const a = weightedAvgCost(0, null, 10, 100_000);
    expect(a).toBe(100_000);
    const b = weightedAvgCost(10, a, 30, 120_000);
    expect(b).toBe(115_000);
    // Đã bán bớt còn 20 (giá vốn giữ nguyên), nhập thêm 20 @ 90.000 -> (20 x 115.000 + 20 x 90.000) / 40 = 102.500.
    expect(weightedAvgCost(20, b, 20, 90_000)).toBe(102_500);
  });

  it('làm tròn nửa lên về số nguyên VND', () => {
    // (1 x 100 + 2 x 101) / 3 = 100,666... -> 101
    expect(weightedAvgCost(1, 100, 2, 101)).toBe(101);
    // (1 x 100 + 1 x 101) / 2 = 100,5 -> 101 (nửa lên)
    expect(weightedAvgCost(1, 100, 1, 101)).toBe(101);
    // (2 x 100 + 1 x 101) / 3 = 100,333... -> 100
    expect(weightedAvgCost(2, 100, 1, 101)).toBe(100);
  });

  it('đơn giá nhập 0 hợp lệ (hàng tặng) và kéo giá bình quân xuống', () => {
    expect(weightedAvgCost(10, 100, 10, 0)).toBe(50);
    expect(weightedAvgCost(0, null, 5, 0)).toBe(0);
  });

  it('số lớn không tràn', () => {
    expect(weightedAvgCost(1_000_000_000, 100_000_000, 100_000, 100_000_000)).toBe(100_000_000);
  });

  it('tham số sai bị từ chối', () => {
    expect(() => weightedAvgCost(1, 1, 0, 1)).toThrow(RangeError);
    expect(() => weightedAvgCost(1, 1, 1.5, 1)).toThrow(RangeError);
    expect(() => weightedAvgCost(1, 1, 1, -1)).toThrow(RangeError);
  });
});

describe('allocateDiscount (phân bổ giảm giá cấp đơn theo tỷ lệ lineTotal)', () => {
  it('mọi dòng có giá vốn -> đúng toàn bộ giảm giá', () => {
    expect(allocateDiscount(25_000, 250_000, 250_000)).toBe(25_000);
  });

  it('một phần dòng có giá vốn -> theo tỷ lệ, làm tròn nửa lên', () => {
    expect(allocateDiscount(25_000, 200_000, 250_000)).toBe(20_000);
    // 1000 x 1/3 = 333,33 -> 333; 1000 x 2/3 = 666,67 -> 667
    expect(allocateDiscount(1000, 1, 3)).toBe(333);
    expect(allocateDiscount(1000, 2, 3)).toBe(667);
    // 5 x 1/2 = 2,5 -> 3
    expect(allocateDiscount(5, 1, 2)).toBe(3);
  });

  it('không dòng nào có giá vốn / không giảm giá / tổng 0 -> 0', () => {
    expect(allocateDiscount(25_000, 0, 250_000)).toBe(0);
    expect(allocateDiscount(0, 100, 250_000)).toBe(0);
    expect(allocateDiscount(100, 100, 0)).toBe(0);
  });
});

describe('profitFigures', () => {
  it('số cố định: doanh thu thuần, lợi nhuận, biên, độ phủ', () => {
    // Đơn A (200.000 có vốn / 250.000, giảm 25.000 -> phân bổ 20.000, vốn 120.000) + đơn B (100.000, vốn 70.000)
    const f = profitFigures({
      lineTotal: 350_000,
      costedLineTotal: 300_000,
      allocatedDiscount: 20_000,
      cogs: 190_000,
    });
    expect(f.netGoodsRevenue).toBe(280_000);
    expect(f.cogs).toBe(190_000);
    expect(f.grossProfit).toBe(90_000);
    expect(f.grossMargin).toBe(0.3214);
    expect(f.costCoverage).toBe(0.8571);
  });

  it('không có doanh thu -> 0, không chia cho 0', () => {
    expect(
      profitFigures({ lineTotal: 0, costedLineTotal: 0, allocatedDiscount: 0, cogs: 0 }),
    ).toEqual({
      netGoodsRevenue: 0,
      cogs: 0,
      grossProfit: 0,
      grossMargin: 0,
      costCoverage: 0,
    });
  });

  it('không có dòng nào có giá vốn: lợi nhuận 0, độ phủ 0 (không đoán)', () => {
    const f = profitFigures({
      lineTotal: 100_000,
      costedLineTotal: 0,
      allocatedDiscount: 0,
      cogs: 0,
    });
    expect(f).toMatchObject({ grossProfit: 0, grossMargin: 0, costCoverage: 0 });
  });

  it('bán lỗ cho lợi nhuận và biên âm', () => {
    const f = profitFigures({
      lineTotal: 100_000,
      costedLineTotal: 100_000,
      allocatedDiscount: 10_000,
      cogs: 95_000,
    });
    expect(f.grossProfit).toBe(-5_000);
    expect(f.grossMargin).toBe(-0.0556);
  });
});
