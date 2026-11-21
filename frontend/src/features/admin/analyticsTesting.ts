import { jsonRes } from "@/features/account/testing";
import type {
  AnalyticsCouponItem,
  AnalyticsCoupons,
  AnalyticsCustomers,
  AnalyticsInventory,
  AnalyticsInventoryItem,
  AnalyticsOperations,
} from "@/types/admin";

/** Dữ liệu mẫu cho test các khối Bước 3 (khách hàng, vận hành, tồn kho). */

export const T_RANGE = {
  from: "2026-10-22",
  to: "2026-11-20",
  days: 30,
  timezone: "Asia/Ho_Chi_Minh",
};
const PREV = { from: "2026-09-22", to: "2026-10-21" };
const c = (current: number, previous: number, changePct: number | null) => ({
  current,
  previous,
  changePct,
});

export function makeCustomers(over: Partial<AnalyticsCustomers> = {}): AnalyticsCustomers {
  return {
    range: T_RANGE,
    previousRange: PREV,
    buyers: c(40, 32, 25),
    firstTime: c(25, 20, 25),
    returning: c(15, 12, 25),
    repeatRate: { current: 0.175, previous: 0.15, changePts: 2.5 },
    firstTimeRevenue: c(9000000, 0, null),
    returningRevenue: c(6000000, 5000000, 20),
    generatedAt: "2026-11-20T05:00:00.000Z",
    ...over,
  };
}

export function makeOperations(over: Partial<AnalyticsOperations> = {}): AnalyticsOperations {
  return {
    range: T_RANGE,
    previousRange: PREV,
    cancellations: {
      total: c(10, 5, 100),
      byType: [
        { type: "customer", label: "Khách hủy", current: 4, previous: 2 },
        { type: "store", label: "Cửa hàng hủy", current: 3, previous: 1 },
        { type: "expired", label: "Hết hạn tự động", current: 2, previous: 2 },
        { type: "unknown", label: "Không rõ", current: 1, previous: 0 },
      ],
    },
    returns: {
      delivered: c(20, 10, 100),
      returned: c(2, 0, null),
      rate: { current: 0.1, previous: 0, changePts: 10 },
    },
    refunds: { count: c(3, 1, 200), amount: c(450000, 100000, 350) },
    fulfillment: {
      confirmHours: { avg: 3.5, median: 2, n: 12, previousAvg: null },
      deliveryHours: { avg: 54, median: 48, n: 8, previousAvg: 30.5 },
    },
    attention: {
      pendingOver24h: {
        count: 2,
        oldest: [
          {
            code: "BB-261101-AAAA",
            createdAt: "2026-11-18T03:00:00.000Z",
            grandTotal: 320000,
            waitingHours: 50,
          },
          {
            code: "BB-261102-BBBB",
            createdAt: "2026-11-19T03:00:00.000Z",
            grandTotal: 150000,
            waitingHours: 26,
          },
        ],
      },
      needsRefund: 1,
      returnRequested: 3,
      failedDelivery: 0,
    },
    generatedAt: "2026-11-20T05:00:00.000Z",
    ...over,
  };
}

export const invItem = (
  key: string,
  over: Partial<AnalyticsInventoryItem> = {},
): AnalyticsInventoryItem => ({
  variantId: `v-${key}`,
  productId: `p-${key}`,
  productName: `Sản phẩm ${key}`,
  variantName: "500 g",
  sku: `SKU-${key}`,
  stock: 0,
  lowStockThreshold: 5,
  price: 100000,
  stockValue: 0,
  lastSoldAt: null,
  ...over,
});

export function makeInventory(over: Partial<AnalyticsInventory> = {}): AnalyticsInventory {
  return {
    summary: {
      variants: 30,
      outOfStock: 2,
      lowStock: 1,
      stockUnits: 400,
      stockValue: 38000000,
      slowMovers: 1,
      slowMoversValue: 2000000,
    },
    outOfStock: [invItem("het1"), invItem("het2")],
    lowStock: [invItem("sap1", { stock: 3, stockValue: 300000 })],
    slowMovers: [
      invItem("cham1", {
        stock: 20,
        stockValue: 2000000,
        lastSoldAt: "2026-08-01T05:00:00.000Z",
      }),
    ],
    slowDays: 30,
    generatedAt: "2026-11-20T05:00:00.000Z",
    ...over,
  };
}

export const couponItem = (
  key: string,
  over: Partial<AnalyticsCouponItem> = {},
): AnalyticsCouponItem => ({
  couponId: `c-${key}`,
  code: `MA${key.toUpperCase()}`,
  type: "PERCENT",
  isActive: true,
  deleted: false,
  uses: 2,
  discount: 50000,
  revenue: 500000,
  aov: 250000,
  previousUses: 1,
  previousRevenue: 100000,
  changePct: 400,
  ...over,
});

export function makeCoupons(over: Partial<AnalyticsCoupons> = {}): AnalyticsCoupons {
  return {
    range: T_RANGE,
    previousRange: PREV,
    sort: "revenue",
    limit: 10,
    summary: {
      ordersWithCoupon: c(4, 2, 100),
      ordersWithoutCoupon: c(6, 6, 0),
      couponRate: { current: 0.4, previous: 0.25, changePts: 15 },
      aovWithCoupon: c(187500, 90000, 108.3),
      aovWithoutCoupon: c(200000, 50000, 300),
      totalDiscount: c(95000, 18000, 427.8),
    },
    items: [
      couponItem("sale"),
      couponItem("gone", { couponId: null, type: null, isActive: null, deleted: true, uses: 1 }),
    ],
    generatedAt: "2026-11-20T05:00:00.000Z",
    ...over,
  };
}

/** Phản hồi mẫu cho các endpoint Bước 3-4; null nếu URL không phải của hai bước đó. */
export function step3Response(url: string): Response | null {
  if (url.includes("/analytics/customers")) return jsonRes(200, { data: makeCustomers() });
  if (url.includes("/analytics/operations")) return jsonRes(200, { data: makeOperations() });
  if (url.includes("/analytics/inventory")) return jsonRes(200, { data: makeInventory() });
  if (url.includes("/analytics/coupons")) return jsonRes(200, { data: makeCoupons() });
  return null;
}
