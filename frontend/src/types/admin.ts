import type { PaginationMeta } from "./api";
import type { UserRole } from "./auth";
import type { BrewMethod, CoffeeProcess, CoffeeProfile, RoastLevel } from "./catalog";
import type {
  Order,
  OrderHistoryEntry,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ShippingMethod,
} from "./order";

/** Theo docs/api-contract.md §12.1. */

export interface AdminOrderListItem {
  code: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  shippingMethod: ShippingMethod;
  customerName: string;
  contactPhone: string;
  contactEmail: string;
  isGuest: boolean;
  provinceName: string;
  grandTotal: number;
  itemCount: number;
  createdAt: string;
  /** Contract 0.6 chưa có trường này ở danh sách; nếu server trả thì hiện badge. */
  needsRefund?: boolean;
}

export type OrderStatusCounts = Record<OrderStatus, number>;

export interface AdminOrderListMeta extends PaginationMeta {
  /** Đếm theo mọi bộ lọc TRỪ `status`; đủ key mọi trạng thái. */
  statusCounts: OrderStatusCounts;
}

export type AdminOrderSort = "newest" | "oldest";

export interface AdminOrderQuery {
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  paymentMethod?: PaymentMethod;
  /** true = chỉ đơn cần hoàn tiền (§13.7); không gửi khi false. */
  needsRefund?: boolean;
  /** YYYY-MM-DD, giờ Việt Nam */
  from?: string;
  to?: string;
  q?: string;
  sort?: AdminOrderSort;
  page?: number;
  pageSize?: number;
}

export interface AdminHistoryActor {
  id: string;
  fullName: string;
  role: UserRole;
}

export interface AdminOrderHistoryEntry extends OrderHistoryEntry {
  /** null khi SYSTEM */
  actor: AdminHistoryActor | null;
}

/** Theo docs/api-contract.md §13.7. */
export type AdminPaymentStatus = "PENDING" | "SUCCEEDED" | "FAILED" | "REFUNDED";
export type AdminPaymentProvider = "VNPAY" | "STRIPE";

export interface AdminPayment {
  id: string;
  provider: AdminPaymentProvider;
  amount: number;
  status: AdminPaymentStatus;
  providerTxnId: string | null;
  providerRef: string | null;
  createdAt: string;
  updatedAt: string;
  refundedAt: string | null;
  refundNote: string | null;
  needsRefund: boolean;
}

/** POST /admin/orders/:code/refunds */
export interface RefundPaymentBody {
  paymentId: string;
  /** 5-500 ký tự */
  note: string;
}

export interface AdminOrder extends Omit<Order, "canCancel" | "history"> {
  id: string;
  isGuest: boolean;
  customer: { id: string; email: string; fullName: string } | null;
  confirmedAt: string | null;
  cancelledAt: string | null;
  updatedAt: string;
  totalWeightGram: number;
  history: AdminOrderHistoryEntry[];
  allowedTransitions: OrderStatus[];
  /** Mới nhất trước. */
  payments: AdminPayment[];
  needsRefund: boolean;
}

/** PATCH /admin/orders/:code/status */
export interface UpdateOrderStatusBody {
  toStatus: OrderStatus;
  /** Trạng thái admin đang thấy (chống thao tác trên dữ liệu cũ). */
  fromStatus: OrderStatus;
  note?: string;
  trackingNumber?: string;
  carrier?: string;
}

/** Theo docs/api-contract.md §12.2 (tồn kho). */

export type AdminStockStatus = "OUT_OF_STOCK" | "LOW_STOCK" | "IN_STOCK";
export type AdminProductStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type InventoryReason =
  "ORDER_RESERVE" | "ORDER_RELEASE" | "RESTOCK" | "DAMAGE" | "STOCKTAKE" | "ADJUSTMENT";
/** Lý do admin được phép chọn khi điều chỉnh tay. */
export type AdjustReason = Extract<
  InventoryReason,
  "RESTOCK" | "DAMAGE" | "ADJUSTMENT" | "STOCKTAKE"
>;

export interface InventoryItem {
  variantId: string;
  sku: string;
  variantName: string;
  productId: string;
  productName: string;
  productStatus: AdminProductStatus;
  imageUrl: string | null;
  stock: number;
  lowStockThreshold: number;
  stockStatus: AdminStockStatus;
  /** false = biến thể ngừng bán */
  isActive: boolean;
  updatedAt: string;
}

export type InventorySort = "stock_asc" | "name" | "updated";

export interface InventoryQuery {
  q?: string;
  stockStatus?: AdminStockStatus[];
  productId?: string;
  sort?: InventorySort;
  page?: number;
  pageSize?: number;
}

export interface InventoryMovement {
  id: string;
  variantId: string;
  sku: string;
  productName: string;
  variantName: string;
  /** Có dấu: dương = nhập, âm = xuất */
  change: number;
  stockAfter: number;
  reason: InventoryReason;
  orderCode: string | null;
  actor: { id: string; fullName: string } | null;
  note: string | null;
  createdAt: string;
}

export interface MovementQuery {
  variantId?: string;
  reason?: InventoryReason[];
  /** YYYY-MM-DD, giờ Việt Nam */
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface AdjustInventoryInput {
  variantId: string;
  reason: AdjustReason;
  change?: number;
  newStock?: number;
  note?: string;
  expectedStock?: number;
}

export interface AdjustInventoryResult {
  item: InventoryItem;
  /** null khi STOCKTAKE không đổi số */
  movement: InventoryMovement | null;
}

/** Theo docs/api-contract.md §12.3 (danh mục, thương hiệu). */

export interface AdminCategory {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
  /** Chỉ có ở GET cây; POST/PATCH không trả. */
  children?: AdminCategory[];
}

export interface CategoryInput {
  name?: string;
  slug?: string;
  parentId?: string | null;
  description?: string;
  imageUrl?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export interface AdminBrand {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  productCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface BrandInput {
  name?: string;
  slug?: string;
  logoUrl?: string | null;
}

/** Theo docs/api-contract.md §12.4 (sản phẩm, biến thể, ảnh, upload). */

export type AdminProductSort = "newest" | "updated" | "name";

export interface AdminProductListItem {
  id: string;
  slug: string;
  name: string;
  status: AdminProductStatus;
  isFeatured: boolean;
  category: { id: string; name: string };
  brand: { id: string; name: string } | null;
  primaryImageUrl: string | null;
  minPrice: number | null;
  variantCount: number;
  totalStock: number;
  inStock: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminProductQuery {
  q?: string;
  status?: AdminProductStatus[];
  categoryId?: string;
  brandId?: string;
  /** true = chỉ sản phẩm đã xóa mềm; không gửi khi false. */
  deleted?: boolean;
  sort?: AdminProductSort;
  page?: number;
  pageSize?: number;
}

export interface AdminVariant {
  id: string;
  sku: string;
  name: string;
  attributes: Record<string, string>;
  price: number;
  salePrice: number | null;
  saleStart: string | null;
  saleEnd: string | null;
  effectivePrice: number;
  isOnSale: boolean;
  stock: number;
  lowStockThreshold: number;
  stockStatus: AdminStockStatus;
  weightGram: number;
  /** YYYY-MM-DD */
  roastDate: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminImage {
  id: string;
  url: string;
  alt: string | null;
  sortOrder: number;
  isPrimary: boolean;
}

export interface AdminProduct {
  id: string;
  slug: string;
  name: string;
  shortDesc: string | null;
  description: string | null;
  status: AdminProductStatus;
  isFeatured: boolean;
  tags: string[];
  seoTitle: string | null;
  seoDesc: string | null;
  categoryId: string;
  brandId: string | null;
  coffee: CoffeeProfile | null;
  images: AdminImage[];
  variants: AdminVariant[];
  minPrice: number | null;
  inStock: boolean;
  soldCount: number;
  ratingAvg: number;
  ratingCount: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CoffeeInput {
  /** Trường vô hướng: bỏ qua = giữ nguyên (PATCH), null = xóa. */
  originCountry?: string | null;
  originRegion?: string | null;
  variety?: string | null;
  process?: CoffeeProcess | null;
  roastLevel?: RoastLevel | null;
  altitude?: number | null;
  tastingNotes: string[];
  brewMethods: BrewMethod[];
}

export interface ProductInput {
  name?: string;
  slug?: string;
  categoryId?: string;
  brandId?: string | null;
  shortDesc?: string;
  description?: string;
  status?: AdminProductStatus;
  isFeatured?: boolean;
  tags?: string[];
  seoTitle?: string | null;
  seoDesc?: string | null;
  /** null = xóa hồ sơ cà phê */
  coffee?: CoffeeInput | null;
}

export interface VariantInput {
  sku?: string;
  name?: string;
  attributes?: Record<string, string>;
  price?: number;
  salePrice?: number | null;
  /** ISO UTC */
  saleStart?: string | null;
  saleEnd?: string | null;
  /** Chỉ khi tạo; PATCH bỏ qua. */
  stock?: number;
  lowStockThreshold?: number;
  weightGram?: number;
  roastDate?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export interface ImageInput {
  url: string;
  alt?: string;
  isPrimary?: boolean;
}

export interface UploadResult {
  url: string;
  contentType: string;
  size: number;
}

/** Theo docs/api-contract.md §13.8 (mã giảm giá). */

export type CouponType = "PERCENT" | "FIXED" | "FREESHIP";
export type CouponState = "ACTIVE" | "SCHEDULED" | "EXPIRED" | "INACTIVE" | "EXHAUSTED";

export interface CouponScope {
  categoryIds?: string[];
  productIds?: string[];
}

export interface AdminCoupon {
  id: string;
  code: string;
  description: string | null;
  type: CouponType;
  value: number;
  maxDiscount: number | null;
  minOrder: number;
  /** ISO UTC */
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  perUserLimit: number | null;
  usedCount: number;
  scope: CouponScope | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /** Tính tại thời điểm gọi. */
  state: CouponState;
}

export interface CouponInput {
  /** Chỉ khi tạo; PATCH không được gửi code/type. */
  code?: string;
  type?: CouponType;
  value?: number;
  maxDiscount?: number | null;
  minOrder?: number;
  startsAt?: string | null;
  endsAt?: string | null;
  usageLimit?: number | null;
  perUserLimit?: number | null;
  scope?: CouponScope | null;
  isActive?: boolean;
  description?: string | null;
}

export interface AdminCouponQuery {
  q?: string;
  type?: CouponType;
  state?: CouponState;
  page?: number;
  pageSize?: number;
}
