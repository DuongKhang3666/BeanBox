import type { ShopSettings } from '../modules/settings/settings.service.js';
import type { PricedCartLine } from './cartLine.js';
import {
  evaluateCoupon,
  type CouponEvaluation,
  type CouponLike,
  type CouponReason,
  type CouponType,
} from './coupon.js';
import { buildShippingOptions, type ShippingOption, type ShippingZone } from './shipping.js';

/**
 * Gom tổng giỏ/quote/đơn từ các dòng đã tính giá. Dùng chung cho Cart, POST /checkout/quote và POST /orders
 * (api-contract §8, §9, §10). Hàm thuần.
 */

export type QuoteLine = Pick<PricedCartLine, 'lineTotal' | 'countable' | 'weightGram'> & {
  quantity: number;
  productId: string;
  categoryId: string;
  parentCategoryId: string | null;
};

export interface CouponInput {
  /** Mã khách/giỏ cung cấp (đã chuẩn hóa). */
  code: string;
  /** Dòng Coupon tìm được; null = không tồn tại (NOT_FOUND). */
  coupon: CouponLike | null;
  /** Số lượt đã dùng (chưa hoàn) của người này, nếu biết. */
  redemptionCount?: number | null;
}

export interface CouponSummary {
  code: string;
  type: CouponType | null;
  discount: number;
  valid: boolean;
  invalidReason: CouponReason | null;
  /** Chỉ có khi invalidReason = MIN_ORDER. */
  minOrder?: number;
}

export interface ComputeTotalsInput {
  lines: readonly QuoteLine[];
  coupon: CouponInput | null;
  /** null = chưa biết địa chỉ (giỏ): không tính shippingOptions. */
  zone: ShippingZone | null;
  settings: ShopSettings;
  now: Date;
}

export interface Totals {
  subtotal: number;
  itemCount: number;
  totalWeightGram: number;
  discountTotal: number;
  coupon: CouponSummary | null;
  couponEvaluation: CouponEvaluation | null;
  shippingZone: ShippingZone | null;
  shippingOptions: ShippingOption[] | null;
  shippingEstimate: {
    standardFrom: number;
    freeShippingThreshold: number;
    freeShippingRemaining: number;
  };
}

export function computeTotals(input: ComputeTotalsInput): Totals {
  const { settings, zone, now } = input;
  const counted = input.lines.filter((l) => l.countable);
  const subtotal = counted.reduce((s, l) => s + l.lineTotal, 0);
  const totalWeightGram = counted.reduce((s, l) => s + l.weightGram, 0);

  let couponEvaluation: CouponEvaluation | null = null;
  let coupon: CouponSummary | null = null;
  if (input.coupon) {
    couponEvaluation = evaluateCoupon(input.coupon.coupon, counted, {
      now,
      redemptionCount: input.coupon.redemptionCount,
    });
    coupon = {
      code: input.coupon.code,
      type: couponEvaluation.type,
      discount: couponEvaluation.discount,
      valid: couponEvaluation.valid,
      invalidReason: couponEvaluation.reason,
      ...(couponEvaluation.minOrder !== undefined ? { minOrder: couponEvaluation.minOrder } : {}),
    };
  }
  const discountTotal = couponEvaluation?.discount ?? 0;
  const freeshipCoupon = couponEvaluation?.freeship ?? null;

  const build = (z: ShippingZone, fc: typeof freeshipCoupon) =>
    buildShippingOptions({
      subtotal,
      discountTotal,
      totalWeightGram,
      zone: z,
      settings,
      freeshipCoupon: fc,
    });

  const shippingOptions = zone ? build(zone, freeshipCoupon) : null;

  // Ước tính ở giỏ: STANDARD vùng INNER, không tính mã FREESHIP (chưa biết địa chỉ).
  const standard = build('INNER', null).find((o) => o.method === 'STANDARD');
  const standardFrom = counted.length === 0 || !standard ? 0 : standard.payableFee;

  return {
    subtotal,
    itemCount: counted.reduce((s, l) => s + l.quantity, 0),
    totalWeightGram,
    discountTotal,
    coupon,
    couponEvaluation,
    shippingZone: zone,
    shippingOptions,
    shippingEstimate: {
      standardFrom,
      freeShippingThreshold: settings.freeShippingThreshold,
      // Giỏ không có dòng tính tiền: mọi số = 0 (api-contract §8.1).
      freeShippingRemaining:
        counted.length === 0
          ? 0
          : Math.max(0, settings.freeShippingThreshold - (subtotal - discountTotal)),
    },
  };
}
