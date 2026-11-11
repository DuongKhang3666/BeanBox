import type { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';

/** Cấu hình cửa hàng dùng cho tính giá (api-contract §10). Mặc định trùng seed. */

const money = z.number().int().min(0);
const feeByMethod = z.object({ STANDARD: money, EXPRESS: money });

const SCHEMAS = {
  'shipping.rates': z.object({ inner: feeByMethod, other: feeByMethod }),
  'shipping.innerCityProvinceCodes': z.array(z.string().regex(/^\d{2}$/)),
  'shipping.innerCityWardCodes': z.array(z.string().regex(/^\d{5}$/)),
  'shipping.freeShippingThreshold': money,
  'shipping.weightSurcharge': z.object({
    freeGram: z.number().int().min(0),
    stepGram: z.number().int().min(1),
    feePerStep: money,
  }),
  'order.paymentExpiryMinutes': z.number().int().min(1).max(1440),
} as const;

export interface ShopSettings {
  shippingRates: {
    inner: { STANDARD: number; EXPRESS: number };
    other: { STANDARD: number; EXPRESS: number };
  };
  innerCityProvinceCodes: string[];
  innerCityWardCodes: string[];
  freeShippingThreshold: number;
  weightSurcharge: { freeGram: number; stepGram: number; feePerStep: number };
  paymentExpiryMinutes: number;
}

export const DEFAULT_SHOP_SETTINGS: Readonly<ShopSettings> = Object.freeze({
  shippingRates: {
    inner: { STANDARD: 20000, EXPRESS: 35000 },
    other: { STANDARD: 35000, EXPRESS: 55000 },
  },
  innerCityProvinceCodes: ['01', '79'],
  innerCityWardCodes: [],
  freeShippingThreshold: 500000,
  weightSurcharge: { freeGram: 2000, stepGram: 1000, feePerStep: 5000 },
  paymentExpiryMinutes: 15,
});

export interface SettingRow {
  key: string;
  value: unknown;
}

/**
 * Hàm thuần: ghép các dòng Setting thành ShopSettings. Key thiếu hoặc sai kiểu -> mặc định + cảnh báo
 * (chỉ log tên key và đường dẫn lỗi, không log giá trị).
 */
export function parseShopSettings(rows: readonly SettingRow[]): ShopSettings {
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const out: ShopSettings = structuredClone(DEFAULT_SHOP_SETTINGS) as ShopSettings;

  const read = <K extends keyof typeof SCHEMAS>(
    key: K,
  ): z.infer<(typeof SCHEMAS)[K]> | undefined => {
    if (!byKey.has(key)) {
      logger.warn({ key }, 'Thiếu setting, dùng giá trị mặc định');
      return undefined;
    }
    const parsed = SCHEMAS[key].safeParse(byKey.get(key));
    if (!parsed.success) {
      logger.warn(
        { key, issues: parsed.error.issues.map((i) => i.path.join('.') || '(root)') },
        'Setting sai định dạng, dùng giá trị mặc định',
      );
      return undefined;
    }
    return parsed.data as z.infer<(typeof SCHEMAS)[K]>;
  };

  out.shippingRates = read('shipping.rates') ?? out.shippingRates;
  out.innerCityProvinceCodes =
    read('shipping.innerCityProvinceCodes') ?? out.innerCityProvinceCodes;
  out.innerCityWardCodes = read('shipping.innerCityWardCodes') ?? out.innerCityWardCodes;
  out.freeShippingThreshold = read('shipping.freeShippingThreshold') ?? out.freeShippingThreshold;
  out.weightSurcharge = read('shipping.weightSurcharge') ?? out.weightSurcharge;
  out.paymentExpiryMinutes = read('order.paymentExpiryMinutes') ?? out.paymentExpiryMinutes;
  return out;
}

/** Đọc cấu hình bằng 1 query, không cache. */
export async function getShopSettings(
  db: Prisma.TransactionClient | PrismaClient = prisma,
): Promise<ShopSettings> {
  const rows = await db.setting.findMany({
    where: { key: { in: Object.keys(SCHEMAS) } },
    select: { key: true, value: true },
  });
  return parseShopSettings(rows);
}
