import { stockStatusOf, type StockStatus } from '../modules/catalog/catalog.service.js';
import { roastAgeDays, roastStatusOfAge, type RoastStatus } from './freshness.js';
import { effectivePrice } from './pricing.js';

/** Tính giá/tồn/cảnh báo cho một dòng giỏ (api-contract §8). Hàm thuần. */

export const MAX_LINE_QUANTITY = 20;

export type CartWarning = 'PRICE_CHANGED' | 'INSUFFICIENT_STOCK' | 'OUT_OF_STOCK' | 'UNAVAILABLE';

export interface CartLineInput {
  quantity: number;
  unitPriceAtAdd: number;
  variant: {
    price: number;
    salePrice: number | null;
    saleStart: Date | null;
    saleEnd: Date | null;
    stock: number;
    lowStockThreshold: number;
    isActive: boolean;
    deletedAt: Date | null;
    weightGram: number;
    /** D-082: ngày rang (DATE); null = không áp quy tắc độ tươi. */
    roastDate?: Date | null;
  };
  product: { status: string; deletedAt: Date | null };
}

export interface PricedCartLine {
  unitPrice: number;
  listPrice: number;
  lineTotal: number;
  maxQuantity: number;
  stockStatus: StockStatus;
  warnings: CartWarning[];
  /** Dòng được tính vào subtotal/itemCount/cân nặng: không OUT_OF_STOCK/UNAVAILABLE. */
  countable: boolean;
  /** weightGram × quantity */
  weightGram: number;
  /** D-082: tuổi hạt (ngày, giờ VN) và mức độ tươi; null khi không có ngày rang. */
  roastAgeDays: number | null;
  roastStatus: RoastStatus | null;
}

export function priceCartLine(line: CartLineInput, now: Date): PricedCartLine {
  const { variant: v, product: p, quantity } = line;
  const unitPrice = effectivePrice(v, now);
  const stock = Math.max(0, v.stock);
  const roastAge = roastAgeDays(v.roastDate, now);
  const roastStatus = roastStatusOfAge(roastAge);
  // D-082: lô rang quá 90 ngày coi như ngừng bán (giỏ/báo giá/đặt đơn đều đi qua cờ UNAVAILABLE).
  const unavailable =
    !v.isActive ||
    v.deletedAt != null ||
    p.status !== 'ACTIVE' ||
    p.deletedAt != null ||
    roastStatus === 'EXPIRED';

  const warnings: CartWarning[] = [];
  if (unitPrice !== line.unitPriceAtAdd) warnings.push('PRICE_CHANGED');
  if (unavailable) {
    warnings.push('UNAVAILABLE');
  } else if (stock === 0) {
    warnings.push('OUT_OF_STOCK');
  } else if (stock < quantity) {
    warnings.push('INSUFFICIENT_STOCK');
  }

  return {
    unitPrice,
    listPrice: v.price,
    lineTotal: unitPrice * quantity,
    maxQuantity: Math.min(stock, MAX_LINE_QUANTITY),
    stockStatus: stockStatusOf(stock, v.lowStockThreshold),
    warnings,
    countable: !warnings.includes('OUT_OF_STOCK') && !warnings.includes('UNAVAILABLE'),
    weightGram: v.weightGram * quantity,
    roastAgeDays: roastAge,
    roastStatus,
  };
}
