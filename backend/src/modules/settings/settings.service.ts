import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { z } from 'zod';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { isValidImageUrl } from '../admin/admin.schema.js';

/** Cấu hình cửa hàng dùng cho tính giá (api-contract §10). Mặc định trùng seed. */

const money = z.number().int().min(0);
const feeByMethod = z.object({ STANDARD: money, EXPRESS: money });
const etaRange = z
  .object({ minDays: z.number().int().min(0).max(30), maxDays: z.number().int().min(0).max(30) })
  .refine((r) => r.minDays <= r.maxDays);
const etaByMethod = z.object({ STANDARD: etaRange, EXPRESS: etaRange });

const SCHEMAS = {
  'shipping.rates': z.object({ inner: feeByMethod, other: feeByMethod }),
  'shipping.eta': z.object({ inner: etaByMethod, other: etaByMethod }),
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

export interface EtaRangeSetting {
  minDays: number;
  maxDays: number;
}

export interface ShopSettings {
  shippingRates: {
    inner: { STANDARD: number; EXPRESS: number };
    other: { STANDARD: number; EXPRESS: number };
  };
  /** D-062: số ngày giao dự kiến theo vùng x phương thức. */
  shippingEta: {
    inner: { STANDARD: EtaRangeSetting; EXPRESS: EtaRangeSetting };
    other: { STANDARD: EtaRangeSetting; EXPRESS: EtaRangeSetting };
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
  shippingEta: {
    inner: { STANDARD: { minDays: 1, maxDays: 2 }, EXPRESS: { minDays: 0, maxDays: 1 } },
    other: { STANDARD: { minDays: 3, maxDays: 5 }, EXPRESS: { minDays: 1, maxDays: 3 } },
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
  out.shippingEta = read('shipping.eta') ?? out.shippingEta;
  out.innerCityProvinceCodes =
    read('shipping.innerCityProvinceCodes') ?? out.innerCityProvinceCodes;
  out.innerCityWardCodes = read('shipping.innerCityWardCodes') ?? out.innerCityWardCodes;
  out.freeShippingThreshold = read('shipping.freeShippingThreshold') ?? out.freeShippingThreshold;
  out.weightSurcharge = read('shipping.weightSurcharge') ?? out.weightSurcharge;
  out.paymentExpiryMinutes = read('order.paymentExpiryMinutes') ?? out.paymentExpiryMinutes;
  return out;
}

// ---------------------------------------------------------------------------------------------
// Cài đặt cửa hàng đầy đủ (api-contract §14.9, D-021, D-061): 10 key quản lý. Schema ĐỌC nới hơn schema GHI.
// ---------------------------------------------------------------------------------------------

/** `/uploads/...` an toàn (không https, không `..`, `\`, `//`, khoảng trắng, ký tự điều khiển). */
export function isSafeUploadUrl(raw: string): boolean {
  return raw.startsWith('/uploads/') && isValidImageUrl(raw);
}

/** Đường dẫn tương đối nội bộ: bắt đầu `/`, không `//`, không `\`, khoảng trắng, ký tự điều khiển. */
export function isSafeHref(raw: string): boolean {
  if (raw.length === 0 || raw.length > 300) return false;
  if (!raw.startsWith('/') || raw.startsWith('//')) return false;
  // eslint-disable-next-line no-control-regex
  return !/[\\\s\u0000-\u001f\u007f]/.test(raw);
}

export interface StoreContact {
  name: string;
  phone: string;
  email: string;
  address: string;
}
/** D-061: tài khoản nhận chuyển khoản. Mặc định dùng BIN `999999` (không tồn tại) nên không chuyển tiền thật được. */
export interface BankTransferSettings {
  bankBin: string;
  bankName: string;
  accountNo: string;
  accountName: string;
}
export interface HomeBanner {
  imageUrl: string;
  alt: string;
  title: string;
  subtitle: string;
  href: string | null;
  isActive: boolean;
}

const readBanner = z.object({
  imageUrl: z.string().refine(isSafeUploadUrl),
  alt: z.string().max(200),
  title: z.string().max(100).default(''),
  subtitle: z.string().max(200).default(''),
  href: z.string().refine(isSafeHref).nullable().default(null),
  isActive: z.boolean(),
});

const READ_SCHEMAS = {
  ...SCHEMAS,
  'store.contact': z.object({
    name: z.string().min(1).max(100),
    phone: z.string().max(30),
    email: z.string().min(1).max(254),
    address: z.string().max(300),
  }),
  'home.banners': z.array(readBanner).max(5),
  'payment.bankTransfer': z.object({
    bankBin: z.string().regex(/^\d{6}$/),
    bankName: z.string().min(1).max(100),
    accountNo: z.string().regex(/^\d{6,19}$/),
    accountName: z.string().min(1).max(100),
  }),
} as const;

export type SettingKey = keyof typeof READ_SCHEMAS;
export const SETTING_KEYS = Object.keys(READ_SCHEMAS) as SettingKey[];

export const DEFAULT_BANK_TRANSFER: Readonly<BankTransferSettings> = Object.freeze({
  bankBin: '999999',
  bankName: 'Ngân hàng demo (không có thật)',
  accountNo: '0123456789',
  accountName: 'BEANBOX DEMO',
});

export const DEFAULT_STORE_CONTACT: Readonly<StoreContact> = Object.freeze({
  name: 'BeanBox',
  phone: '',
  email: 'hello@beanbox.local',
  address: '',
});

function defaultValue(key: SettingKey): unknown {
  const d = DEFAULT_SHOP_SETTINGS;
  switch (key) {
    case 'shipping.rates':
      return structuredClone(d.shippingRates);
    case 'shipping.eta':
      return structuredClone(d.shippingEta);
    case 'shipping.innerCityProvinceCodes':
      return [...d.innerCityProvinceCodes];
    case 'shipping.innerCityWardCodes':
      return [...d.innerCityWardCodes];
    case 'shipping.freeShippingThreshold':
      return d.freeShippingThreshold;
    case 'shipping.weightSurcharge':
      return { ...d.weightSurcharge };
    case 'order.paymentExpiryMinutes':
      return d.paymentExpiryMinutes;
    case 'store.contact':
      return { ...DEFAULT_STORE_CONTACT };
    case 'home.banners':
      return [];
    case 'payment.bankTransfer':
      return { ...DEFAULT_BANK_TRANSFER };
  }
}

export interface AllSettings {
  values: Record<SettingKey, unknown>;
  updatedAt: Record<SettingKey, string | null>;
}

/** Đủ 10 key; thiếu/sai định dạng -> mặc định và updatedAt null. Không cache. */
export async function getAllSettings(
  db: Prisma.TransactionClient | PrismaClient = prisma,
): Promise<AllSettings> {
  const rows = await db.setting.findMany({
    where: { key: { in: SETTING_KEYS } },
    select: { key: true, value: true, updatedAt: true },
  });
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const values = {} as Record<SettingKey, unknown>;
  const updatedAt = {} as Record<SettingKey, string | null>;
  for (const key of SETTING_KEYS) {
    const row = byKey.get(key);
    const parsed = row ? READ_SCHEMAS[key].safeParse(row.value) : undefined;
    if (row && parsed?.success) {
      values[key] = parsed.data;
      updatedAt[key] = row.updatedAt.toISOString();
    } else {
      if (row) {
        logger.warn(
          { key, issues: parsed?.error?.issues.map((i) => i.path.join('.') || '(root)') },
          'Setting sai định dạng, dùng giá trị mặc định',
        );
      }
      values[key] = defaultValue(key);
      updatedAt[key] = null;
    }
  }
  return { values, updatedAt };
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
