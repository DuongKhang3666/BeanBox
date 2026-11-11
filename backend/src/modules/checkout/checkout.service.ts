import type { Cart, Prisma } from '@prisma/client';
import { getPaymentConfig, isProviderEnabled, type PaymentConfig } from '../../config/payments.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { computeTotals, type CouponInput, type Totals } from '../../lib/quote.js';
import { shippingZone, type ShippingZone } from '../../lib/shipping.js';
import {
  findCartForIdentity,
  loadCartLines,
  loadCouponForCart,
  toCartDto,
  toQuoteLine,
  type CartDto,
  type CartIdentity,
  type CartLine,
} from '../cart/cart.service.js';
import { getProvince, resolveLocation } from '../locations/locations.data.js';
import { getShopSettings, type ShopSettings } from '../settings/settings.service.js';
import type { QuoteInput } from './checkout.schema.js';

/**
 * Tính giá thanh toán (api-contract §9.1). `buildCheckoutContext` là MỘT hàm dùng chung cho
 * POST /checkout/quote và POST /orders để hai nơi luôn ra cùng kết quả.
 */

type Db = Prisma.TransactionClient;

export type CheckoutIssueType = 'OUT_OF_STOCK' | 'INSUFFICIENT_STOCK' | 'UNAVAILABLE';

export interface CheckoutIssue {
  variantId: string;
  type: CheckoutIssueType;
  /** Tồn thực; 0 khi UNAVAILABLE. */
  available: number;
}

export interface CheckoutContext {
  lines: CartLine[];
  totals: Totals;
  zone: ShippingZone;
  couponInput: CouponInput | null;
  issues: CheckoutIssue[];
}

export interface PaymentMethodOption {
  method: 'COD' | 'VNPAY' | 'STRIPE';
  enabled: boolean;
}

export interface QuoteDto {
  items: CartDto['items'];
  subtotal: number;
  discountTotal: number;
  coupon: Totals['coupon'];
  totalWeightGram: number;
  shippingZone: ShippingZone;
  shippingOptions: NonNullable<Totals['shippingOptions']>;
  paymentMethods: PaymentMethodOption[];
  issues: CheckoutIssue[];
}

/** COD luôn bật; VNPAY/STRIPE theo cấu hình (api-contract §13.0). */
export function paymentMethodOptions(config: PaymentConfig): PaymentMethodOption[] {
  return (['COD', 'VNPAY', 'STRIPE'] as const).map((method) => ({
    method,
    enabled: isProviderEnabled(config, method),
  }));
}

export const validationError = (field: string, message: string) =>
  new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ', [{ field, message }]);

export const cartEmpty = () => new AppError(409, 'CART_EMPTY', 'Giỏ hàng đang trống');

/** Hàm thuần: vấn đề về tồn/ngừng bán của từng dòng. */
export function collectIssues(lines: readonly CartLine[]): CheckoutIssue[] {
  const issues: CheckoutIssue[] = [];
  for (const l of lines) {
    const w = l.priced.warnings;
    if (w.includes('UNAVAILABLE')) {
      issues.push({ variantId: l.variantId, type: 'UNAVAILABLE', available: 0 });
    } else if (w.includes('OUT_OF_STOCK')) {
      issues.push({ variantId: l.variantId, type: 'OUT_OF_STOCK', available: 0 });
    } else if (w.includes('INSUFFICIENT_STOCK')) {
      issues.push({ variantId: l.variantId, type: 'INSUFFICIENT_STOCK', available: l.stock });
    }
  }
  return issues;
}

/** Đối chiếu tỉnh (và phường nếu có) với danh mục; sai -> 400. */
export function checkLocation(provinceCode: string, wardCode: string | null): void {
  if (wardCode) {
    resolveLocation(provinceCode, wardCode);
  } else if (!getProvince(provinceCode)) {
    throw validationError('provinceCode', 'Tỉnh/thành không tồn tại');
  }
}

export interface CheckoutContextArgs {
  db: Db;
  cart: Pick<Cart, 'couponCode'>;
  lines: readonly CartLine[];
  provinceCode: string;
  wardCode: string | null;
  /** Mã ghi đè mã trong giỏ (đã trim, chưa cần chuẩn hóa hoa). */
  couponCode?: string | null;
  who: { userId?: string | null; email?: string | null };
  settings: ShopSettings;
  now: Date;
}

export async function buildCheckoutContext(a: CheckoutContextArgs): Promise<CheckoutContext> {
  const code = a.couponCode ?? a.cart.couponCode;
  const couponInput = code ? await loadCouponForCart(a.db, code, a.who) : null;
  const zone = shippingZone(a.provinceCode, a.wardCode, a.settings);
  const totals = computeTotals({
    lines: a.lines.map(toQuoteLine),
    coupon: couponInput,
    zone,
    settings: a.settings,
    now: a.now,
  });
  return {
    lines: [...a.lines],
    totals,
    zone,
    couponInput,
    issues: collectIssues(a.lines),
  };
}

export function toQuoteDto(
  ctx: CheckoutContext,
  paymentConfig: PaymentConfig = getPaymentConfig(),
): QuoteDto {
  const { totals } = ctx;
  return {
    items: toCartDto({ cartToken: null, lines: ctx.lines, totals }).items,
    subtotal: totals.subtotal,
    discountTotal: totals.discountTotal,
    coupon: totals.coupon,
    totalWeightGram: totals.totalWeightGram,
    shippingZone: ctx.zone,
    shippingOptions: totals.shippingOptions ?? [],
    paymentMethods: paymentMethodOptions(paymentConfig),
    issues: ctx.issues,
  };
}

/** POST /checkout/quote: chỉ đọc, không ghi DB. */
export async function getQuote(
  identity: CartIdentity,
  input: QuoteInput,
  paymentConfig: PaymentConfig = getPaymentConfig(),
  now = new Date(),
): Promise<QuoteDto> {
  const userId = identity.kind === 'user' ? identity.userId : null;

  let provinceCode: string;
  let wardCode: string | null = null;
  if (input.addressId) {
    if (!userId) throw new AppError(401, 'UNAUTHORIZED', 'Vui lòng đăng nhập');
    const address = await prisma.address.findFirst({ where: { id: input.addressId, userId } });
    if (!address) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy địa chỉ');
    provinceCode = address.provinceCode;
    wardCode = address.wardCode;
  } else {
    if (!input.provinceCode) throw validationError('provinceCode', 'Vui lòng chọn tỉnh/thành');
    provinceCode = input.provinceCode;
    wardCode = input.wardCode ?? null;
    checkLocation(provinceCode, wardCode);
  }

  const cart = await findCartForIdentity(prisma, identity, now);
  if (!cart) throw cartEmpty();
  const [lines, settings] = await Promise.all([
    loadCartLines(prisma, cart.id, now),
    getShopSettings(prisma),
  ]);
  if (lines.length === 0) throw cartEmpty();

  const ctx = await buildCheckoutContext({
    db: prisma,
    cart,
    lines,
    provinceCode,
    wardCode,
    couponCode: input.couponCode ?? null,
    who: userId ? { userId } : { email: input.contactEmail ?? null },
    settings,
    now,
  });
  return toQuoteDto(ctx, paymentConfig);
}
