import type { ShopSettings } from '../modules/settings/settings.service.js';

/** Quy tắc phí ship (api-contract §10 mục 3–4, D-003, D-006). Tiền là số nguyên VND. */

export type ShippingZone = 'INNER' | 'OTHER';
export type ShippingMethod = 'STANDARD' | 'EXPRESS';

type ZoneConfig = Pick<ShopSettings, 'innerCityProvinceCodes' | 'innerCityWardCodes'>;
type SurchargeConfig = Pick<ShopSettings, 'weightSurcharge'>;

export function shippingZone(
  provinceCode: string,
  wardCode: string | null | undefined,
  cfg: ZoneConfig,
): ShippingZone {
  if (cfg.innerCityProvinceCodes.includes(provinceCode)) return 'INNER';
  if (wardCode != null && wardCode !== '' && cfg.innerCityWardCodes.includes(wardCode)) {
    return 'INNER';
  }
  return 'OTHER';
}

/** feePerStep × ceil(max(0, g − freeGram) / stepGram). */
export function weightSurcharge(totalGram: number, cfg: SurchargeConfig): number {
  const { freeGram, stepGram, feePerStep } = cfg.weightSurcharge;
  const over = Math.max(0, totalGram - freeGram);
  return feePerStep * Math.ceil(over / stepGram);
}

export interface ShippingOption {
  method: ShippingMethod;
  label: string;
  estimatedDays: string;
  baseFee: number;
  weightSurcharge: number;
  fee: number;
  freeShippingApplied: boolean;
  shippingDiscount: number;
  payableFee: number;
  grandTotal: number;
}

export interface BuildShippingInput {
  subtotal: number;
  discountTotal: number;
  totalWeightGram: number;
  zone: ShippingZone;
  settings: ShopSettings;
  freeshipCoupon: { maxDiscount: number | null } | null;
}

const METHODS: readonly { method: ShippingMethod; label: string; estimatedDays: string }[] = [
  { method: 'STANDARD', label: 'Tiêu chuẩn', estimatedDays: '3-5' },
  { method: 'EXPRESS', label: 'Nhanh', estimatedDays: '1-2' },
];

export function buildShippingOptions(input: BuildShippingInput): ShippingOption[] {
  const { subtotal, discountTotal, totalWeightGram, zone, settings, freeshipCoupon } = input;
  const rates = zone === 'INNER' ? settings.shippingRates.inner : settings.shippingRates.other;
  const surcharge = weightSurcharge(totalWeightGram, settings);
  const net = subtotal - discountTotal;
  const thresholdReached = net >= settings.freeShippingThreshold;

  return METHODS.map(({ method, label, estimatedDays }) => {
    const baseFee = rates[method];
    const fee = baseFee + surcharge;
    const freeShippingApplied = method === 'STANDARD' && thresholdReached;
    let shippingDiscount = 0;
    if (freeShippingApplied) {
      shippingDiscount = fee;
    } else if (freeshipCoupon) {
      shippingDiscount = Math.min(fee, freeshipCoupon.maxDiscount ?? fee);
    }
    const payableFee = fee - shippingDiscount;
    return {
      method,
      label,
      estimatedDays,
      baseFee,
      weightSurcharge: surcharge,
      fee,
      freeShippingApplied,
      shippingDiscount,
      payableFee,
      grandTotal: Math.max(0, net + payableFee),
    };
  });
}
