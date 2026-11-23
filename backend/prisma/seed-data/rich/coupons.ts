/*
 * Mã giảm giá của seed nhiều (D-084): 30 mã đủ trạng thái (còn hạn, hết hạn, chưa bắt đầu, hết lượt, tạm dừng).
 * Mốc thời gian tính TƯƠNG ĐỐI từ thời điểm chạy seed. Module thuần dữ liệu (không chạm DB).
 */

export type RichCouponType = 'PERCENT' | 'FIXED' | 'FREESHIP';

export interface RichCouponSeed {
  code: string;
  description: string;
  type: RichCouponType;
  value: number;
  maxDiscount: number | null;
  minOrder: number;
  startsAt: Date | null;
  endsAt: Date | null;
  usageLimit: number | null;
  perUserLimit: number | null;
  /** Giá trị cố định cho mã có giới hạn lượt; mã không giới hạn được tính lại theo CouponRedemption. */
  usedCount: number;
  isActive: boolean;
}

const DAY = 24 * 60 * 60 * 1000;

export function buildRichCoupons(now: Date): RichCouponSeed[] {
  const t = now.getTime();
  const at = (days: number) => new Date(t + days * DAY);
  const base = {
    maxDiscount: null,
    minOrder: 0,
    startsAt: null,
    endsAt: null,
    usageLimit: null,
    perUserLimit: null,
    usedCount: 0,
    isActive: true,
  } as const;
  const c = (
    code: string,
    description: string,
    type: RichCouponType,
    value: number,
    extra: Partial<Omit<RichCouponSeed, 'code' | 'description' | 'type' | 'value'>> = {},
  ): RichCouponSeed => ({ code, description, type, value, ...base, ...extra });

  return [
    // Còn hạn, không giới hạn lượt (đơn lịch sử có thể dùng)
    c('CAFE10', 'Giảm 10% (tối đa 40.000đ) cho đơn từ 150.000đ', 'PERCENT', 10, {
      maxDiscount: 40000,
      minOrder: 150000,
    }),
    c('HAT15', 'Giảm 15% (tối đa 80.000đ) cho đơn từ 400.000đ', 'PERCENT', 15, {
      maxDiscount: 80000,
      minOrder: 400000,
    }),
    c('PHIN20K', 'Giảm 20.000đ cho đơn từ 150.000đ', 'FIXED', 20000, { minOrder: 150000 }),
    c('GIAM30K', 'Giảm 30.000đ cho đơn từ 250.000đ', 'FIXED', 30000, { minOrder: 250000 }),
    c('GIAM100K', 'Giảm 100.000đ cho đơn từ 900.000đ', 'FIXED', 100000, { minOrder: 900000 }),
    c('SHIPFREE', 'Miễn phí vận chuyển cho đơn từ 300.000đ', 'FREESHIP', 0, { minOrder: 300000 }),
    c('FREESHIP15', 'Giảm tối đa 15.000đ phí vận chuyển', 'FREESHIP', 0, { maxDiscount: 15000 }),
    c('THANHVIEN5', 'Thành viên giảm 5% (tối đa 30.000đ)', 'PERCENT', 5, { maxDiscount: 30000 }),
    c(
      'BANMOI20',
      'Bạn mới giảm 20% (tối đa 60.000đ) cho đơn từ 300.000đ, mỗi người một lần',
      'PERCENT',
      20,
      { maxDiscount: 60000, minOrder: 300000, perUserLimit: 1 },
    ),
    c('COMBO50K', 'Giảm 50.000đ cho đơn từ 600.000đ', 'FIXED', 50000, { minOrder: 600000 }),
    c('SANGTAO', 'Giảm 8% (tối đa 25.000đ) cho đơn từ 100.000đ', 'PERCENT', 8, {
      maxDiscount: 25000,
      minOrder: 100000,
    }),
    c('QUANHAU', 'Giảm 15.000đ cho đơn từ 100.000đ', 'FIXED', 15000, { minOrder: 100000 }),
    // Còn hạn theo cửa sổ thời gian (bao phủ 120 ngày gần nhất)
    c('MUAHE', 'Khuyến mãi mùa hè: giảm 12% (tối đa 50.000đ) cho đơn từ 200.000đ', 'PERCENT', 12, {
      maxDiscount: 50000,
      minOrder: 200000,
      startsAt: at(-130),
      endsAt: at(60),
    }),
    c('CUOITUAN', 'Giảm 25.000đ cho đơn từ 200.000đ', 'FIXED', 25000, {
      minOrder: 200000,
      startsAt: at(-130),
      endsAt: at(60),
    }),
    c('FREESHIPTET', 'Giảm tối đa 30.000đ phí vận chuyển cho đơn từ 250.000đ', 'FREESHIP', 0, {
      maxDiscount: 30000,
      minOrder: 250000,
      startsAt: at(-130),
      endsAt: at(60),
    }),
    // Đã hết hạn
    c('XUAN2026', 'Khuyến mãi mùa xuân (đã kết thúc)', 'PERCENT', 10, {
      maxDiscount: 40000,
      startsAt: at(-100),
      endsAt: at(-40),
    }),
    c('HE2026', 'Khuyến mãi đầu hè (đã kết thúc)', 'FIXED', 40000, {
      minOrder: 300000,
      startsAt: at(-70),
      endsAt: at(-20),
    }),
    c('SALE1111', 'Siêu sale 11.11 (đã kết thúc)', 'PERCENT', 25, {
      maxDiscount: 150000,
      minOrder: 500000,
      startsAt: at(-20),
      endsAt: at(-12),
    }),
    c('HETHANTUAN', 'Mã tuần lễ vàng (đã kết thúc)', 'FREESHIP', 0, {
      maxDiscount: 25000,
      startsAt: at(-45),
      endsAt: at(-35),
    }),
    // Chưa bắt đầu
    c('NOEL25', 'Giáng sinh: giảm 15% (tối đa 70.000đ)', 'PERCENT', 15, {
      maxDiscount: 70000,
      minOrder: 300000,
      startsAt: at(10),
      endsAt: at(40),
    }),
    c('TET2027', 'Tết 2027: giảm 60.000đ cho đơn từ 500.000đ', 'FIXED', 60000, {
      minOrder: 500000,
      startsAt: at(45),
      endsAt: at(75),
    }),
    c('GIAMSOC', 'Giảm sốc cuối tuần sắp tới', 'PERCENT', 18, {
      maxDiscount: 90000,
      minOrder: 400000,
      startsAt: at(3),
      endsAt: at(10),
    }),
    c('KHAITRUONG', 'Mừng khai trương chi nhánh mới', 'FIXED', 35000, {
      minOrder: 250000,
      startsAt: at(20),
      endsAt: at(50),
    }),
    // Hết lượt dùng
    c('LIMIT50', 'Mã giới hạn 50 lượt (đã dùng hết)', 'FIXED', 30000, {
      usageLimit: 50,
      usedCount: 50,
    }),
    c('FLASH100', 'Flash sale 100 lượt (đã dùng hết)', 'PERCENT', 20, {
      maxDiscount: 80000,
      usageLimit: 100,
      usedCount: 100,
    }),
    c('TOP20', '20 khách đầu tiên (đã dùng hết)', 'FIXED', 50000, {
      minOrder: 300000,
      usageLimit: 20,
      usedCount: 20,
    }),
    // Còn lượt nhưng có giới hạn
    c('TUAN200', 'Mã 200 lượt, hiện còn dùng được', 'PERCENT', 7, {
      maxDiscount: 35000,
      usageLimit: 200,
      usedCount: 37,
    }),
    c('VIP10', 'Khách thân thiết giảm 10%, mỗi người một lần', 'PERCENT', 10, {
      maxDiscount: 60000,
      usageLimit: 500,
      perUserLimit: 1,
      usedCount: 112,
    }),
    // Tạm dừng
    c('TAMDUNG1', 'Mã đang tạm dừng', 'FIXED', 20000, { isActive: false }),
    c('NGUNGAP', 'Chương trình đã ngừng áp dụng', 'PERCENT', 5, {
      maxDiscount: 20000,
      isActive: false,
    }),
  ];
}
