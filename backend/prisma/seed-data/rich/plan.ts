/*
 * Lập kế hoạch dữ liệu nhiều (D-084): khách, địa chỉ, wishlist, đơn hàng, đánh giá, liên hệ, ghi chú đơn.
 * Hàm THUẦN và TẤT ĐỊNH: mọi giá trị ngẫu nhiên lấy từ mulberry32 theo khóa (không Math.random); thời điểm
 * tuyệt đối chỉ phụ thuộc `now` được truyền vào. Việc ghi DB nằm ở prisma/seed-rich.ts.
 *
 * Đơn hàng lịch sử KHÔNG trừ tồn kho thật và không tạo InventoryMovement (giống scripts/generate-demo-orders.ts):
 * đây là dữ liệu demo, không khớp sổ kho. Tiền tính bằng chính `computeTotals` của hệ thống (mã giảm giá, phí ship,
 * phụ phí khối lượng, freeship theo ngưỡng), nên tổng đơn khớp công thức `grandTotal = subtotal - discount + fee - shipDiscount`.
 */
import { createHash } from 'node:crypto';
import type { CouponLike } from '../../../src/lib/coupon.js';
import { computeEtaDates } from '../../../src/lib/eta.js';
import { ORDER_CODE_ALPHABET } from '../../../src/lib/orderCode.js';
import { computeTotals, type QuoteLine } from '../../../src/lib/quote.js';
import { shippingZone } from '../../../src/lib/shipping.js';
import type { ShopSettings } from '../../../src/modules/settings/settings.service.js';
import {
  ADMIN_REPLY_NEGATIVE,
  ADMIN_REPLY_POSITIVE,
  CANCEL_NOTES_CUSTOMER,
  CANCEL_NOTES_STORE,
  CARRIERS,
  CONTACT_ADMIN_NOTES,
  CONTACT_MESSAGES,
  CONTACT_SUBJECTS,
  FEMALE_GIVEN,
  FEMALE_MIDDLE,
  HO,
  MALE_GIVEN,
  MALE_MIDDLE,
  ORDER_NOTES,
  REVIEW_BODY_NEGATIVE,
  REVIEW_BODY_NEUTRAL,
  REVIEW_BODY_POSITIVE,
  REVIEW_CLOSE_NEGATIVE,
  REVIEW_CLOSE_POSITIVE,
  REVIEW_OPEN_NEGATIVE,
  REVIEW_OPEN_NEUTRAL,
  REVIEW_OPEN_POSITIVE,
  STREETS,
  type ReviewGroup,
} from './pools.js';
import {
  chance,
  hashString,
  int,
  mulberry32,
  pad,
  pick,
  shuffled,
  weightedIndex,
  type Rng,
} from './prng.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const VN_OFFSET = 7 * HOUR;

/** Mirror `SETTINGS` của prisma/seed.ts (không import settings.service để tránh nạp Prisma/env). */
export const SEED_SHOP_SETTINGS: ShopSettings = {
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
};

/** Lý do hủy do hệ thống khi quá hạn thanh toán (trùng EXPIRE_REASON của jobs/cleanup.ts). */
export const EXPIRE_REASON = 'Quá hạn thanh toán';

// ───────────── Địa điểm ─────────────

export interface PlanLocation {
  provinceCode: string;
  provinceName: string;
  wardCode: string;
  wardName: string;
}

export interface LocationPoolEntry {
  provinceCode: string;
  provinceName: string;
  wards: { code: string; name: string }[];
}

interface ProvinceLike {
  code: string;
  name: string;
  wards: ReadonlyMap<string, { code: string; name: string }>;
}

/** Danh sách tỉnh (theo mã tăng dần) kèm phường (theo mã tăng dần) từ dữ liệu hành chính có thật. */
export function buildLocationPool(
  provinces: ReadonlyMap<string, ProvinceLike>,
): LocationPoolEntry[] {
  return [...provinces.values()]
    .sort((a, b) => (a.code < b.code ? -1 : 1))
    .map((p) => ({
      provinceCode: p.code,
      provinceName: p.name,
      wards: [...p.wards.values()].sort((a, b) => (a.code < b.code ? -1 : 1)),
    }));
}

function pickLocation(r: Rng, pool: readonly LocationPoolEntry[]): PlanLocation {
  // Ưu tiên TP.HCM (79), Hà Nội (01), Đà Nẵng (48) như phân bố khách thật; phần còn lại rải đều.
  const hot = ['79', '01', '48'];
  const x = r();
  let entry: LocationPoolEntry | undefined;
  if (x < 0.63) {
    const code = hot[weightedIndex(r, [30, 25, 8])] as string;
    entry = pool.find((p) => p.provinceCode === code);
  }
  entry ??= pick(r, pool);
  const ward = pick(r, entry.wards);
  return {
    provinceCode: entry.provinceCode,
    provinceName: entry.provinceName,
    wardCode: ward.code,
    wardName: ward.name,
  };
}

// ───────────── Khách hàng ─────────────

export interface PlanAddress {
  id: string;
  fullName: string;
  phone: string;
  line1: string;
  isDefault: boolean;
  location: PlanLocation;
}

export interface PlanCustomer {
  index: number;
  id: string;
  email: string;
  fullName: string;
  phone: string;
  addresses: PlanAddress[];
}

/** SĐT di động giả hợp lệ (regex `^0(3|5|7|8|9)\d{8}$` của hệ thống). */
export function fakePhone(r: Rng): string {
  const prefix = pick(r, ['3', '5', '7', '8', '9', '9', '9']);
  let tail = '';
  for (let i = 0; i < 8; i++) tail += String(int(r, 0, 9));
  return `0${prefix}${tail}`;
}

function fakeName(r: Rng): string {
  const female = chance(r, 0.5);
  const middle = pick(r, female ? FEMALE_MIDDLE : MALE_MIDDLE);
  const given = pick(r, female ? FEMALE_GIVEN : MALE_GIVEN);
  return `${pick(r, HO)} ${middle} ${given}`;
}

const streetLine = (r: Rng) => `${int(r, 1, 320)} ${pick(r, STREETS)}`;

export function planCustomers(count: number, pool: readonly LocationPoolEntry[]): PlanCustomer[] {
  return Array.from({ length: count }, (_, i) => {
    const r = mulberry32(hashString(`rich:customer:${i}`));
    const fullName = fakeName(r);
    const phone = fakePhone(r);
    const n = weightedIndex(r, [25, 50, 25]);
    const addresses: PlanAddress[] = Array.from({ length: n }, (_, k) => ({
      id: `richad${pad(i, 3)}${k}`,
      fullName,
      phone: k === 0 ? phone : fakePhone(r),
      line1: streetLine(r),
      isDefault: k === 0,
      location: pickLocation(r, pool),
    }));
    return {
      index: i,
      id: `richu${pad(i, 3)}`,
      email: `rich.khach${pad(i, 3)}@example.com`,
      fullName,
      phone,
      addresses,
    };
  });
}

export interface PlanWishlist {
  userId: string;
  productId: string;
  createdAt: Date;
}

export function planWishlists(
  customers: readonly PlanCustomer[],
  productIds: readonly string[],
  now: Date,
): PlanWishlist[] {
  const out: PlanWishlist[] = [];
  if (productIds.length === 0) return out;
  for (const c of customers) {
    const r = mulberry32(hashString(`rich:wishlist:${c.index}`));
    if (!chance(r, 0.35)) continue;
    const chosen = shuffled(r, productIds).slice(0, int(r, 1, 4));
    for (const productId of chosen) {
      out.push({
        userId: c.id,
        productId,
        createdAt: new Date(now.getTime() - int(r, 1, 100) * DAY - int(r, 0, 23) * HOUR),
      });
    }
  }
  return out;
}

// ───────────── Đơn hàng ─────────────

export interface PlanVariant {
  variantId: string;
  productId: string;
  categoryId: string;
  parentCategoryId: string | null;
  productName: string;
  variantName: string;
  sku: string;
  imageUrl: string | null;
  weightGram: number;
  price: number;
  avgCost: number | null;
}

export interface PlanCoupon extends CouponLike {
  id: string;
}

export type OrderStatusName =
  | 'PENDING_PAYMENT'
  | 'PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'SHIPPING'
  | 'DELIVERED'
  | 'FAILED_DELIVERY'
  | 'CANCELLED'
  | 'RETURN_REQUESTED'
  | 'RETURNED';
export type PaymentMethodName = 'COD' | 'VNPAY' | 'MOMO' | 'BANK_TRANSFER';

export interface PlanLine {
  id: string;
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  sku: string;
  imageUrl: string | null;
  weightGram: number;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  unitCost: number | null;
}

export interface PlanHistory {
  id: string;
  fromStatus: OrderStatusName | null;
  toStatus: OrderStatusName;
  note: string | null;
  actorId: string | null;
  createdAt: Date;
}

export interface PlanPayment {
  id: string;
  provider: Exclude<PaymentMethodName, 'COD'>;
  providerTxnId: string | null;
  providerRef: string;
  amount: number;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED';
  refundedAt: Date | null;
  refundNote: string | null;
  refundedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlanOrder {
  index: number;
  id: string;
  code: string;
  idempotencyKey: string;
  requestFingerprint: string;
  userId: string | null;
  contactEmail: string;
  contactPhone: string;
  status: OrderStatusName;
  paymentStatus: 'UNPAID' | 'PAID' | 'REFUNDED';
  paymentMethod: PaymentMethodName;
  shippingMethod: 'STANDARD' | 'EXPRESS';
  shippingAddress: { fullName: string; phone: string; line1: string } & PlanLocation;
  totalWeightGram: number;
  subtotal: number;
  discountTotal: number;
  shippingFee: number;
  shippingDiscount: number;
  grandTotal: number;
  couponId: string | null;
  couponCode: string | null;
  trackingNumber: string | null;
  carrier: string | null;
  cancelReason: string | null;
  etaFrom: Date;
  etaTo: Date;
  expiresAt: Date | null;
  paidAt: Date | null;
  confirmedAt: Date | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lines: PlanLine[];
  history: PlanHistory[];
  payment: PlanPayment | null;
  redemption: { id: string; releasedAt: Date | null; createdAt: Date } | null;
}

export interface PlanOrdersInput {
  now: Date;
  count: number;
  days: number;
  customers: readonly PlanCustomer[];
  /** Số danh tính khách vãng lai (email `rich.vanglaiNN@example.com`). */
  guestCount: number;
  variants: readonly PlanVariant[];
  /** Mã giảm giá có thể dùng cho đơn lịch sử (đã bỏ mã hết lượt/tạm dừng). */
  coupons: readonly PlanCoupon[];
  staffIds: readonly string[];
  pool: readonly LocationPoolEntry[];
  /** Mã đơn đã có trong DB (tránh trùng). */
  usedCodes: ReadonlySet<string>;
}

const METHODS: PaymentMethodName[] = ['COD', 'VNPAY', 'MOMO', 'BANK_TRANSFER'];
const METHOD_LABEL: Record<string, string> = { VNPAY: 'VNPay', MOMO: 'MoMo' };

/** Nửa đêm giờ Việt Nam của ngày chứa `d`. */
function vnMidnight(d: Date): Date {
  return new Date(Math.floor((d.getTime() + VN_OFFSET) / DAY) * DAY - VN_OFFSET);
}

const addH = (d: Date, hours: number) => new Date(d.getTime() + hours * HOUR);
const le = (d: Date, now: Date) => d.getTime() <= now.getTime();

function codeDatePart(created: Date): string {
  const vn = new Date(created.getTime() + VN_OFFSET);
  const yy = String(vn.getUTCFullYear() % 100).padStart(2, '0');
  const mm = String(vn.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(vn.getUTCDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

function suffixOf(n: number): string {
  const base = ORDER_CODE_ALPHABET.length;
  let s = '';
  let x = n;
  for (let i = 0; i < 4; i++) {
    s = ORDER_CODE_ALPHABET[x % base] + s;
    x = Math.floor(x / base);
  }
  return s;
}

function uniqueCode(created: Date, seed: number, used: Set<string>): string {
  const space = ORDER_CODE_ALPHABET.length ** 4;
  const datePart = codeDatePart(created);
  for (let k = 0; k < space; k++) {
    const code = `BB-${datePart}-${suffixOf((seed + k) % space)}`;
    if (!used.has(code)) {
      used.add(code);
      return code;
    }
  }
  throw new Error('Hết mã đơn trong ngày');
}

export function planOrders(input: PlanOrdersInput): PlanOrder[] {
  const { now, variants, coupons, staffIds } = input;
  if (variants.length < 30)
    throw new Error('Cần seed cơ bản trước (ít nhất 30 biến thể đang bán).');
  if (staffIds.length === 0) throw new Error('Cần tài khoản STAFF/ADMIN (chạy seed cơ bản trước).');
  const used = new Set(input.usedCodes);
  const pool = shuffled(mulberry32(hashString('rich:variant-pool')), variants);
  const out: PlanOrder[] = [];

  for (let i = 0; i < input.count; i++) {
    const r = mulberry32(hashString(`rich:order:${i}`));
    const id = `richo${pad(i, 4)}`;
    const staffId = staffIds[i % staffIds.length] as string;

    // Khách: ~88% có tài khoản, còn lại vãng lai.
    const registered = chance(r, 0.88) && input.customers.length > 0;
    const customer = registered
      ? (input.customers[Math.floor(input.customers.length * r() ** 1.3)] as PlanCustomer)
      : null;
    const guestIdx = Math.floor(input.guestCount * r() ** 1.5);
    const gr = mulberry32(hashString(`rich:guest:${guestIdx}`));
    const guestName = fakeName(gr);
    const guestPhone = fakePhone(gr);
    const guestLoc = pickLocation(gr, input.pool);
    const guestLine = streetLine(gr);

    let contactEmail: string;
    let contactPhone: string;
    let address: PlanOrder['shippingAddress'];
    if (customer) {
      const a = customer.addresses.length > 0 ? pick(r, customer.addresses) : null;
      contactEmail = customer.email;
      contactPhone = customer.phone;
      address = a
        ? { fullName: a.fullName, phone: a.phone, line1: a.line1, ...a.location }
        : {
            fullName: customer.fullName,
            phone: customer.phone,
            line1: streetLine(r),
            ...pickLocation(r, input.pool),
          };
    } else {
      contactEmail = `rich.vanglai${pad(guestIdx, 2)}@example.com`;
      contactPhone = guestPhone;
      address = { fullName: guestName, phone: guestPhone, line1: guestLine, ...guestLoc };
    }

    const method = METHODS[weightedIndex(r, [40, 28, 14, 18])] as PaymentMethodName;
    const shippingMethod = chance(r, 0.2) ? 'EXPRESS' : 'STANDARD';

    // Thời điểm tạo: rải 120 ngày (nghiêng nhẹ về gần đây), giờ cao điểm 9-20 giờ VN.
    const daysAgo = Math.floor(input.days * r() ** 1.15);
    const hour = 7 + Math.floor((16 * (r() + r())) / 2);
    const sec = int(r, 0, 3599);
    const rawCreated = new Date(
      vnMidnight(new Date(now.getTime() - daysAgo * DAY)).getTime() + hour * HOUR + sec * 1000,
    );
    const cap = new Date(now.getTime() - 3 * HOUR - int(r, 0, 7200) * 1000);
    const created = rawCreated.getTime() > cap.getTime() ? cap : rawCreated;

    // Dòng hàng: 1-5 biến thể khác nhau, nghiêng về nhóm đầu của danh sách đã xáo (hàng bán chạy).
    const nl = [1, 2, 3, 4, 5][weightedIndex(r, [30, 35, 20, 10, 5])] as number;
    const chosen = new Map<string, PlanVariant>();
    for (let tries = 0; chosen.size < nl && tries < 40; tries++) {
      const v = pool[Math.floor(pool.length * r() ** 1.6)] as PlanVariant;
      if (!chosen.has(v.variantId)) chosen.set(v.variantId, v);
    }
    const lines: PlanLine[] = [...chosen.values()].map((v, k) => {
      const quantity = [1, 2, 3, 4][weightedIndex(r, [70, 22, 6, 2])] as number;
      return {
        id: `richi${pad(i, 4)}-${k + 1}`,
        variantId: v.variantId,
        productId: v.productId,
        productName: v.productName,
        variantName: v.variantName,
        sku: v.sku,
        imageUrl: v.imageUrl,
        weightGram: v.weightGram,
        unitPrice: v.price,
        quantity,
        lineTotal: v.price * quantity,
        unitCost: v.avgCost,
      };
    });
    const quoteLines: QuoteLine[] = lines.map((l) => {
      const v = chosen.get(l.variantId) as PlanVariant;
      return {
        lineTotal: l.lineTotal,
        countable: true,
        weightGram: l.weightGram * l.quantity,
        quantity: l.quantity,
        productId: l.productId,
        categoryId: v.categoryId,
        parentCategoryId: v.parentCategoryId,
      };
    });

    // Tiền: dùng đúng hàm tính của hệ thống tại thời điểm tạo đơn; mã không hợp lệ thì bỏ mã.
    const zone = shippingZone(address.provinceCode, address.wardCode, SEED_SHOP_SETTINGS);
    const wantCoupon = chance(r, 0.3) && coupons.length > 0;
    const couponPick = wantCoupon ? pick(r, coupons) : null;
    const compute = (c: PlanCoupon | null) =>
      computeTotals({
        lines: quoteLines,
        coupon: c ? { code: c.code, coupon: c } : null,
        zone,
        settings: SEED_SHOP_SETTINGS,
        now: created,
      });
    let totals = compute(couponPick);
    let coupon: PlanCoupon | null = couponPick;
    if (couponPick && !totals.coupon?.valid) {
      coupon = null;
      totals = compute(null);
    }
    const option = totals.shippingOptions?.find((o) => o.method === shippingMethod);
    if (!option) throw new Error('Thiếu phương thức giao hàng khi tính tiền');

    // Mốc thời gian thô theo kế hoạch rồi cắt tại "bây giờ" (mốc sau hiện tại chưa xảy ra).
    const x = r();
    const recent60 = created.getTime() > now.getTime() - 60 * DAY;
    const plan: 'D' | 'R' | 'RR' | 'C' | 'F' =
      x < 0.8
        ? 'D'
        : x < 0.83
          ? 'R'
          : x < 0.84
            ? 'RR'
            : x < 0.95
              ? 'C'
              : x < 0.97 && recent60
                ? 'F'
                : 'D';
    const xc = r();
    const cKind: 'expired' | 'customer' | 'store' =
      method === 'COD'
        ? xc < 0.6
          ? 'customer'
          : 'store'
        : xc < 0.35
          ? 'expired'
          : xc < 0.75
            ? 'customer'
            : 'store';

    const rConf =
      method === 'COD'
        ? addH(created, r() < 0.96 ? 0.1 + 14 * r() ** 2 : 24 + 40 * r())
        : method === 'BANK_TRANSFER'
          ? addH(created, 0.5 + 10 * r() ** 2)
          : addH(created, (1 + 12 * r() ** 2) / 60);
    const rProc = addH(rConf, 2 + 22 * r());
    const rShip = addH(rProc, 4 + 20 * r());
    const rDeliv = addH(rShip, 24 * (shippingMethod === 'EXPRESS' ? 1 + 1.5 * r() : 2 + 3 * r()));
    const rFail = addH(rShip, 24 * (1 + 2 * r()));
    const rRetReq = addH(rDeliv, 24 * (1 + 4 * r()));
    const rRet = addH(rRetReq, 24 * (1 + 5 * r()));
    const cancelU = r();
    const rCancel =
      plan !== 'C'
        ? null
        : cKind === 'expired'
          ? addH(created, method === 'BANK_TRANSFER' ? 24 : 0.25)
          : cKind === 'customer' && method !== 'COD'
            ? addH(created, (1 + 12 * cancelU) / 60)
            : cKind === 'customer'
              ? addH(created, 0.1 + 10 * cancelU)
              : addH(rConf, 1 + 19 * cancelU);

    const when = (d: Date | null, ok = true) => (ok && d && le(d, now) ? d : null);
    const inLine = plan === 'D' || plan === 'R' || plan === 'RR' || plan === 'F';
    const tConf = plan === 'C' && cKind !== 'store' ? null : when(rConf);
    const tProc = when(rProc, inLine);
    const tShip = when(rShip, inLine);
    const tDeliv = when(rDeliv, plan === 'D' || plan === 'R' || plan === 'RR');
    const tFail = when(rFail, plan === 'F');
    const tRetReq = when(rRetReq, plan === 'R' || plan === 'RR');
    const tRet = when(rRet, plan === 'R');
    const tCancel = when(rCancel);

    const status: OrderStatusName = tCancel
      ? 'CANCELLED'
      : tRet
        ? 'RETURNED'
        : tRetReq
          ? 'RETURN_REQUESTED'
          : tDeliv
            ? 'DELIVERED'
            : tFail
              ? 'FAILED_DELIVERY'
              : tShip
                ? 'SHIPPING'
                : tProc
                  ? 'PROCESSING'
                  : tConf
                    ? 'CONFIRMED'
                    : method === 'COD'
                      ? 'PENDING'
                      : 'PENDING_PAYMENT';

    const paidAt = method === 'COD' ? tDeliv : tConf;
    const cancelFrom: OrderStatusName | null = !tCancel
      ? null
      : cKind === 'store'
        ? 'CONFIRMED'
        : method === 'COD'
          ? 'PENDING'
          : 'PENDING_PAYMENT';
    // Chọn câu eager (không phụ thuộc `now`) để luồng ngẫu nhiên của đơn không đổi theo thời điểm chạy.
    const skipNote = chance(r, 0.3);
    const customerNote = pick(r, CANCEL_NOTES_CUSTOMER);
    const storeNote = pick(r, CANCEL_NOTES_STORE);
    const carrierPick = pick(r, CARRIERS);
    const cancelNote = !tCancel
      ? null
      : cKind === 'expired'
        ? EXPIRE_REASON
        : cKind === 'customer'
          ? skipNote
            ? null
            : customerNote
          : storeNote;
    // Hoàn tiền đơn online đã thu: hủy bởi cửa hàng hoặc trả hàng, ~88% đã hoàn khi đủ thời gian.
    const refundU = r();
    const refundDelay = r();
    const refundAt =
      method !== 'COD' && paidAt && refundU < 0.88
        ? tCancel
          ? addH(tCancel, 2 + 46 * refundDelay)
          : tRet
            ? addH(tRet, 24 * (1 + 2 * refundDelay))
            : null
        : null;
    const refundedAt = refundAt && le(refundAt, now) ? refundAt : null;

    const idemKey = `rich-order-${pad(i, 4)}`;
    const history: PlanHistory[] = [];
    const h = (
      to: OrderStatusName,
      from: OrderStatusName | null,
      at: Date,
      actorId: string | null,
      note: string | null,
    ) =>
      history.push({
        id: `richh${pad(i, 4)}-${history.length}`,
        fromStatus: from,
        toStatus: to,
        note,
        actorId,
        createdAt: at,
      });
    const userActor = customer ? customer.id : null;
    h(method === 'COD' ? 'PENDING' : 'PENDING_PAYMENT', null, created, userActor, null);
    if (tConf) {
      const prev: OrderStatusName = method === 'COD' ? 'PENDING' : 'PENDING_PAYMENT';
      const manual = method === 'COD' || method === 'BANK_TRANSFER';
      h(
        'CONFIRMED',
        prev,
        tConf,
        manual ? staffId : null,
        method === 'COD'
          ? null
          : method === 'BANK_TRANSFER'
            ? 'Đã nhận chuyển khoản'
            : `Thanh toán ${METHOD_LABEL[method]} thành công`,
      );
    }
    if (tProc) h('PROCESSING', 'CONFIRMED', tProc, staffId, null);
    if (tShip) h('SHIPPING', 'PROCESSING', tShip, staffId, null);
    if (tDeliv) h('DELIVERED', 'SHIPPING', tDeliv, staffId, null);
    if (tFail) h('FAILED_DELIVERY', 'SHIPPING', tFail, staffId, 'Khách không nghe máy');
    if (tRetReq) h('RETURN_REQUESTED', 'DELIVERED', tRetReq, userActor, null);
    if (tRet) h('RETURNED', 'RETURN_REQUESTED', tRet, staffId, null);
    if (tCancel && cancelFrom) {
      h(
        'CANCELLED',
        cancelFrom,
        tCancel,
        cKind === 'expired' ? null : cKind === 'customer' ? userActor : staffId,
        cancelNote,
      );
    }

    const times = [
      created,
      tConf,
      tProc,
      tShip,
      tDeliv,
      tFail,
      tRetReq,
      tRet,
      tCancel,
      refundedAt,
    ].filter((d): d is Date => d != null);
    const updatedAt = new Date(Math.max(...times.map((d) => d.getTime())));

    const payment: PlanPayment | null =
      method === 'COD'
        ? null
        : {
            id: `richp${pad(i, 4)}`,
            provider: method,
            providerTxnId: paidAt ? `rich-txn-${pad(i, 4)}` : null,
            providerRef: `rich-ref-${pad(i, 4)}`,
            amount: option.grandTotal,
            status: refundedAt ? 'REFUNDED' : paidAt ? 'SUCCEEDED' : tCancel ? 'FAILED' : 'PENDING',
            refundedAt,
            refundNote: refundedAt ? 'Hoàn tiền (dữ liệu mẫu)' : null,
            refundedById: refundedAt ? staffId : null,
            createdAt: created,
            updatedAt: new Date(
              Math.max(
                ...[created, tConf, tCancel, refundedAt]
                  .filter((d): d is Date => d != null)
                  .map((d) => d.getTime()),
              ),
            ),
          };

    const eta = computeEtaDates(
      created,
      SEED_SHOP_SETTINGS.shippingEta[zone === 'INNER' ? 'inner' : 'other'][shippingMethod],
    );

    out.push({
      index: i,
      id,
      code: uniqueCode(created, Math.floor(r() * 923521), used),
      idempotencyKey: idemKey,
      requestFingerprint: createHash('sha256').update(idemKey).digest('hex'),
      userId: customer ? customer.id : null,
      contactEmail,
      contactPhone,
      status,
      paymentStatus: refundedAt ? 'REFUNDED' : paidAt ? 'PAID' : 'UNPAID',
      paymentMethod: method,
      shippingMethod,
      shippingAddress: address,
      totalWeightGram: totals.totalWeightGram,
      subtotal: totals.subtotal,
      discountTotal: totals.discountTotal,
      shippingFee: option.fee,
      shippingDiscount: option.shippingDiscount,
      grandTotal: option.grandTotal,
      couponId: coupon ? coupon.id : null,
      couponCode: coupon ? coupon.code : null,
      trackingNumber: tShip ? `RICH${pad(i, 6)}` : null,
      carrier: tShip ? carrierPick : null,
      cancelReason: tCancel ? cancelNote : null,
      etaFrom: eta.from,
      etaTo: eta.to,
      expiresAt: method === 'COD' ? null : addH(created, method === 'BANK_TRANSFER' ? 24 : 0.25),
      paidAt,
      confirmedAt: tConf,
      deliveredAt: tDeliv,
      cancelledAt: tCancel,
      createdAt: created,
      updatedAt,
      lines,
      history,
      payment,
      redemption: coupon
        ? { id: `richcr${pad(i, 4)}`, releasedAt: tCancel, createdAt: created }
        : null,
    });
  }
  return out;
}

// ───────────── Đánh giá ─────────────

export interface PlanReview {
  id: string;
  productId: string;
  userId: string;
  orderItemId: string;
  rating: number;
  content: string;
  status: 'PUBLISHED' | 'HIDDEN';
  reply: string | null;
  repliedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function reviewGroupOf(rootCategorySlug: string | null | undefined): ReviewGroup {
  if (rootCategorySlug === 'ca-phe-hat') return 'coffee';
  if (rootCategorySlug === 'dung-cu-pha-che') return 'tool';
  return 'accessory';
}

export function composeReview(r: Rng, rating: number, group: ReviewGroup): string {
  if (rating >= 4) {
    const parts = [
      pick(r, REVIEW_OPEN_POSITIVE),
      pick(r, REVIEW_BODY_POSITIVE[group]),
      pick(r, REVIEW_CLOSE_POSITIVE),
    ];
    return parts.filter(Boolean).join(' ');
  }
  if (rating === 3) {
    return [pick(r, REVIEW_OPEN_NEUTRAL), pick(r, REVIEW_BODY_NEUTRAL[group])].join(' ');
  }
  return [
    pick(r, REVIEW_OPEN_NEGATIVE),
    pick(r, REVIEW_BODY_NEGATIVE[group]),
    pick(r, REVIEW_CLOSE_NEGATIVE),
  ]
    .filter(Boolean)
    .join(' ');
}

/** Chỉ cho đơn DELIVERED của người đã mua; 1 đánh giá/người/sản phẩm; điểm nghiêng về 4-5. */
export function planReviews(
  orders: readonly PlanOrder[],
  groupOfProduct: ReadonlyMap<string, ReviewGroup>,
  now: Date,
): PlanReview[] {
  const out: PlanReview[] = [];
  const seen = new Set<string>();
  for (const o of orders) {
    if (o.status !== 'DELIVERED' || !o.userId || !o.deliveredAt) continue;
    for (const [k, line] of o.lines.entries()) {
      const key = `${o.userId}|${line.productId}`;
      if (seen.has(key)) continue;
      const r = mulberry32(hashString(`rich:review:${o.index}:${k}`));
      if (!chance(r, 0.8)) continue;
      const createdAt = new Date(o.deliveredAt.getTime() + (1 + 9 * r()) * DAY);
      if (createdAt.getTime() > now.getTime() - HOUR) continue;
      seen.add(key);
      const rating = [1, 2, 3, 4, 5][weightedIndex(r, [3, 4, 11, 32, 50])] as number;
      const content = chance(r, 0.88)
        ? composeReview(r, rating, groupOfProduct.get(line.productId) ?? 'accessory')
        : '';
      const hidden = chance(r, 0.03);
      const wantReply = chance(r, 0.14);
      const repliedAt = wantReply ? new Date(createdAt.getTime() + (0.2 + 2 * r()) * DAY) : null;
      const replied = repliedAt && repliedAt.getTime() <= now.getTime() ? repliedAt : null;
      out.push({
        id: `richr${line.id.slice(5)}`, // theo dòng hàng (richiNNNN-k) nên không đổi khi kế hoạch đổi
        productId: line.productId,
        userId: o.userId,
        orderItemId: line.id,
        rating,
        content,
        status: hidden ? 'HIDDEN' : 'PUBLISHED',
        reply: replied ? pick(r, rating >= 4 ? ADMIN_REPLY_POSITIVE : ADMIN_REPLY_NEGATIVE) : null,
        repliedAt: replied,
        createdAt,
        updatedAt: replied ?? createdAt,
      });
    }
  }
  return out;
}

// ───────────── Liên hệ, ghi chú nội bộ ─────────────

export interface PlanContact {
  id: string;
  userId: string | null;
  name: string;
  email: string;
  phone: string | null;
  subject: string;
  message: string;
  status: 'NEW' | 'IN_PROGRESS' | 'RESOLVED' | 'SPAM';
  adminNote: string | null;
  handledById: string | null;
  handledAt: Date | null;
  createdAt: Date;
}

export function planContacts(
  count: number,
  customers: readonly PlanCustomer[],
  staffIds: readonly string[],
  now: Date,
): PlanContact[] {
  return Array.from({ length: count }, (_, i) => {
    const r = mulberry32(hashString(`rich:contact:${i}`));
    const member =
      customers.length > 0 && chance(r, 0.4) ? (pick(r, customers) as PlanCustomer) : null;
    const name = member ? member.fullName : fakeName(r);
    const subject = pick(r, CONTACT_SUBJECTS);
    const createdAt = new Date(now.getTime() - (1 + 119 * r()) * DAY);
    const status = (['NEW', 'IN_PROGRESS', 'RESOLVED', 'SPAM'] as const)[
      weightedIndex(r, [40, 20, 35, 5])
    ] as PlanContact['status'];
    const handled = status !== 'NEW' && staffIds.length > 0;
    const handledAt = handled ? new Date(createdAt.getTime() + (0.1 + 3 * r()) * DAY) : null;
    const handledOk = handledAt && handledAt.getTime() <= now.getTime() ? handledAt : null;
    return {
      id: `richcm${pad(i, 3)}`,
      userId: member ? member.id : null,
      name,
      email: member ? member.email : `rich.lienhe${pad(i, 3)}@example.com`,
      phone: chance(r, 0.6) ? (member ? member.phone : fakePhone(r)) : null,
      subject,
      message: pick(r, CONTACT_MESSAGES[subject]),
      status: handledOk || status === 'NEW' ? status : 'NEW',
      adminNote: status === 'RESOLVED' && chance(r, 0.6) ? pick(r, CONTACT_ADMIN_NOTES) : null,
      handledById: handledOk ? (staffIds[i % staffIds.length] as string) : null,
      handledAt: handledOk,
      createdAt,
    };
  });
}

export interface PlanOrderNote {
  id: string;
  orderId: string;
  authorId: string;
  body: string;
  createdAt: Date;
}

/** Vài chục ghi chú nội bộ trên các đơn (cứ 8 đơn có 1 đơn có ghi chú, đôi khi 2 ghi chú). */
export function planOrderNotes(
  orders: readonly PlanOrder[],
  staffIds: readonly string[],
  now: Date,
): PlanOrderNote[] {
  const out: PlanOrderNote[] = [];
  for (const o of orders) {
    if (o.index % 8 !== 3) continue;
    const r = mulberry32(hashString(`rich:note:${o.index}`));
    const n = chance(r, 0.25) ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const at = new Date(o.createdAt.getTime() + (0.2 + 20 * r()) * HOUR);
      if (at.getTime() > now.getTime()) continue;
      out.push({
        id: `richn${pad(o.index, 4)}-${k}`,
        orderId: o.id,
        authorId: staffIds[(o.index + k) % staffIds.length] as string,
        body: pick(r, ORDER_NOTES),
        createdAt: at,
      });
    }
  }
  return out;
}
