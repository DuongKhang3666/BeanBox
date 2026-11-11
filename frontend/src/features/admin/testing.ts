import type {
  AdminBrand,
  AdminCategory,
  AdminCoupon,
  AdminOrder,
  AdminOrderListItem,
  AdminPayment,
  AdminProduct,
  AdminProductListItem,
  AdminVariant,
  InventoryItem,
  InventoryMovement,
  OrderStatusCounts,
} from "@/types/admin";
import { makeOrder } from "../orders/testing";
import { emptyStatusCounts } from "./api/orders";

export function makeStatusCounts(over: Partial<OrderStatusCounts> = {}): OrderStatusCounts {
  return { ...emptyStatusCounts(), ...over };
}

export function makeAdminListItem(over: Partial<AdminOrderListItem> = {}): AdminOrderListItem {
  return {
    code: "BB-261110-K7QP",
    status: "PENDING",
    paymentStatus: "UNPAID",
    paymentMethod: "COD",
    shippingMethod: "STANDARD",
    customerName: "Nguyễn Văn An",
    contactPhone: "0901234567",
    contactEmail: "an@example.com",
    isGuest: false,
    provinceName: "Thành phố Hồ Chí Minh",
    grandTotal: 350000,
    itemCount: 2,
    createdAt: "2026-11-10T08:30:00.000Z",
    ...over,
  };
}

export function makeAdminOrder(over: Partial<AdminOrder> = {}): AdminOrder {
  const base = makeOrder();
  delete (base as Partial<typeof base>).canCancel;
  return {
    ...base,
    id: "cko1",
    isGuest: false,
    customer: { id: "u1", email: "an@example.com", fullName: "Nguyễn Văn An" },
    confirmedAt: null,
    cancelledAt: null,
    updatedAt: "2026-11-10T08:30:00.000Z",
    totalWeightGram: 1000,
    history: [
      {
        fromStatus: null,
        toStatus: "PENDING",
        note: null,
        createdAt: "2026-11-10T08:30:00.000Z",
        actor: null,
      },
    ],
    allowedTransitions: ["CONFIRMED", "CANCELLED"],
    payments: [],
    needsRefund: false,
    ...over,
  };
}

export function makeAdminPayment(over: Partial<AdminPayment> = {}): AdminPayment {
  return {
    id: "ckpay1",
    provider: "VNPAY",
    amount: 317000,
    status: "SUCCEEDED",
    providerTxnId: "14012345",
    providerRef: "ckpay1",
    createdAt: "2026-11-10T08:30:00.000Z",
    updatedAt: "2026-11-10T08:31:00.000Z",
    refundedAt: null,
    refundNote: null,
    needsRefund: false,
    ...over,
  };
}

export function makeAdminCoupon(over: Partial<AdminCoupon> = {}): AdminCoupon {
  return {
    id: "cp1",
    code: "WELCOME10",
    description: "Chào khách mới",
    type: "PERCENT",
    value: 10,
    maxDiscount: 50000,
    minOrder: 200000,
    startsAt: "2026-11-01T00:00:00.000Z",
    endsAt: "2026-11-30T16:59:00.000Z",
    usageLimit: 100,
    perUserLimit: 1,
    usedCount: 12,
    scope: null,
    isActive: true,
    createdAt: "2026-10-30T08:30:00.000Z",
    updatedAt: "2026-11-02T08:30:00.000Z",
    state: "ACTIVE",
    ...over,
  };
}

export function makeInventoryItem(over: Partial<InventoryItem> = {}): InventoryItem {
  return {
    variantId: "v1",
    sku: "ETH-YIRG-250",
    variantName: "Gói 250 g",
    productId: "p1",
    productName: "Ethiopia Yirgacheffe",
    productStatus: "ACTIVE",
    imageUrl: null,
    stock: 12,
    lowStockThreshold: 5,
    stockStatus: "IN_STOCK",
    isActive: true,
    updatedAt: "2026-11-10T08:30:00.000Z",
    ...over,
  };
}

export function makeMovement(over: Partial<InventoryMovement> = {}): InventoryMovement {
  return {
    id: "m1",
    variantId: "v1",
    sku: "ETH-YIRG-250",
    productName: "Ethiopia Yirgacheffe",
    variantName: "Gói 250 g",
    change: -2,
    stockAfter: 10,
    reason: "ORDER_RESERVE",
    orderCode: "BB-261110-A2B3",
    actor: null,
    note: null,
    createdAt: "2026-11-10T08:30:00.000Z",
    ...over,
  };
}

export function makeCategory(over: Partial<AdminCategory> = {}): AdminCategory {
  return {
    id: "c1",
    parentId: null,
    name: "Dụng cụ pha chế",
    slug: "dung-cu-pha-che",
    description: null,
    imageUrl: null,
    sortOrder: 0,
    isActive: true,
    productCount: 0,
    children: [],
    ...over,
  };
}

export function makeBrand(over: Partial<AdminBrand> = {}): AdminBrand {
  return {
    id: "b1",
    name: "Hario",
    slug: "hario",
    logoUrl: null,
    productCount: 4,
    createdAt: "2026-11-10T08:30:00.000Z",
    updatedAt: "2026-11-10T08:30:00.000Z",
    ...over,
  };
}

export function makeProductListItem(
  over: Partial<AdminProductListItem> = {},
): AdminProductListItem {
  return {
    id: "p1",
    slug: "ethiopia-yirgacheffe",
    name: "Ethiopia Yirgacheffe",
    status: "ACTIVE",
    isFeatured: false,
    category: { id: "c1", name: "Cà phê hạt" },
    brand: { id: "b1", name: "BeanBox" },
    primaryImageUrl: null,
    minPrice: 165000,
    variantCount: 2,
    totalStock: 30,
    inStock: true,
    deletedAt: null,
    createdAt: "2026-11-10T08:30:00.000Z",
    updatedAt: "2026-11-10T08:30:00.000Z",
    ...over,
  };
}

export function makeAdminVariant(over: Partial<AdminVariant> = {}): AdminVariant {
  return {
    id: "v1",
    sku: "ETH-250",
    name: "Gói 250 g",
    attributes: { weight: "250g" },
    price: 210000,
    salePrice: null,
    saleStart: null,
    saleEnd: null,
    effectivePrice: 210000,
    isOnSale: false,
    stock: 12,
    lowStockThreshold: 5,
    stockStatus: "IN_STOCK",
    weightGram: 250,
    roastDate: null,
    sortOrder: 0,
    isActive: true,
    createdAt: "2026-11-10T08:30:00.000Z",
    updatedAt: "2026-11-10T08:30:00.000Z",
    ...over,
  };
}

export function makeAdminProduct(over: Partial<AdminProduct> = {}): AdminProduct {
  return {
    id: "p1",
    slug: "ethiopia-yirgacheffe",
    name: "Ethiopia Yirgacheffe",
    shortDesc: "Hương hoa và cam chanh.",
    description: null,
    status: "DRAFT",
    isFeatured: false,
    tags: ["specialty"],
    seoTitle: null,
    seoDesc: null,
    categoryId: "c1",
    brandId: "b1",
    coffee: null,
    images: [],
    variants: [makeAdminVariant()],
    minPrice: 210000,
    inStock: true,
    soldCount: 0,
    ratingAvg: 0,
    ratingCount: 0,
    deletedAt: null,
    createdAt: "2026-11-10T08:30:00.000Z",
    updatedAt: "2026-11-10T08:30:00.000Z",
    ...over,
  };
}
