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

/** Theo docs/api-contract.md §14.3 (dashboard). */

export interface DashboardDay {
  /** YYYY-MM-DD, giờ Việt Nam */
  date: string;
  revenue: number;
  orders: number;
}

export interface DashboardTopProduct {
  productId: string;
  name: string;
  slug: string;
  quantity: number;
  revenue: number;
}

export interface DashboardLowStock {
  variantId: string;
  sku: string;
  productName: string;
  variantName: string;
  stock: number;
  lowStockThreshold: number;
}

export interface AdminDashboard {
  revenue: { today: number; last7Days: number; last30Days: number };
  orders: { today: number; last7Days: number; last30Days: number };
  /** Đúng 30 phần tử, tăng dần theo ngày. */
  dailyRevenue: DashboardDay[];
  ordersByStatus: OrderStatusCounts;
  topProducts: DashboardTopProduct[];
  lowStock: DashboardLowStock[];
  attention: { pendingOrders: number; needsRefund: number };
  generatedAt: string;
}

/** Theo docs/api-contract.md §14.4 (nhật ký thao tác, chỉ Admin). */

export interface AuditActor {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
}

export interface AuditLogItem {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  /** `{ field: [trước, sau] }`; có thể null/rỗng. */
  diff: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
  /** null = hệ thống ghi hoặc tài khoản đã bị xóa. */
  actor: AuditActor | null;
}

export interface AuditLogQuery {
  actionPrefix?: string;
  entity?: string;
  entityId?: string;
  actorId?: string;
  /** YYYY-MM-DD, giờ Việt Nam */
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

/** Theo docs/api-contract.md §14.1 (kiểm duyệt đánh giá). */

export type ReviewStatus = "PUBLISHED" | "HIDDEN";

export interface AdminReview {
  id: string;
  rating: number;
  /** Văn bản thuần. */
  content: string;
  authorName: string;
  verifiedPurchase: boolean;
  createdAt: string;
  updatedAt: string;
  reply: string | null;
  repliedAt: string | null;
  status: ReviewStatus;
  images: string[];
  product: { id: string; name: string; slug: string };
  author: { id: string; fullName: string; email: string };
}

export interface AdminReviewQuery {
  status?: ReviewStatus;
  rating?: number;
  productId?: string;
  q?: string;
  hasReply?: boolean;
  page?: number;
  pageSize?: number;
}

/** Theo docs/api-contract.md §16.1 (phân tích kinh doanh, chỉ Admin). */

export type AnalyticsGranularity = "day" | "week" | "month";

export interface AnalyticsCompared {
  current: number;
  previous: number;
  /** % thay đổi, 1 chữ số thập phân; null khi kỳ trước = 0. */
  changePct: number | null;
}

export interface AnalyticsComparedRate {
  /** Tỷ lệ 0..1. */
  current: number;
  previous: number;
  /** Chênh lệch tính bằng điểm phần trăm; null khi kỳ trước không có đơn đặt. */
  changePts: number | null;
}

export interface AnalyticsPoint {
  /** YYYY-MM-DD (ngày VN), bucket đã cắt theo khoảng. */
  start: string;
  end: string;
  revenue: number;
  paidOrders: number;
  ordersPlaced: number;
}

export interface AnalyticsKpis {
  revenue: AnalyticsCompared;
  paidOrders: AnalyticsCompared;
  aov: AnalyticsCompared;
  ordersPlaced: AnalyticsCompared;
  cancelledOrders: AnalyticsCompared;
  cancelRate: AnalyticsComparedRate;
  discountTotal: AnalyticsCompared;
  refundedAmount: AnalyticsCompared;
  newCustomers: AnalyticsCompared;
}

export interface AnalyticsOverview {
  range: {
    from: string;
    to: string;
    days: number;
    granularity: AnalyticsGranularity;
    timezone: string;
  };
  previousRange: { from: string; to: string };
  kpis: AnalyticsKpis;
  series: AnalyticsPoint[];
  previousSeries: AnalyticsPoint[];
  generatedAt: string;
}

/** Theo docs/api-contract.md §16.2 (Bước 2: cơ cấu doanh thu, top sản phẩm, top khách hàng). */

export type BreakdownDimension =
  "category" | "brand" | "paymentMethod" | "shippingMethod" | "province";

export interface AnalyticsRangeInfo {
  from: string;
  to: string;
  days: number;
  timezone: string;
}

export interface BreakdownGroup {
  /** null = "Không có thương hiệu" / "Không xác định"; "__other__" = "Khác"; "__unknown__" = sản phẩm không xác định. */
  key: string | null;
  label: string;
  revenue: number;
  orders: number;
  /** null ở chiều cấp đơn. */
  quantity: number | null;
  /** 0..1, 4 chữ số. */
  share: number;
  previousRevenue: number;
  changePct: number | null;
}

export interface BreakdownTotal {
  revenue: number;
  orders: number;
  quantity: number | null;
}

export interface AnalyticsBreakdown {
  range: AnalyticsRangeInfo;
  previousRange: { from: string; to: string };
  dimension: BreakdownDimension;
  /** "order": revenue = Σ grandTotal; "item": revenue = Σ lineTotal (hàng hóa). */
  basis: "order" | "item";
  total: BreakdownTotal;
  previousTotal: BreakdownTotal;
  groups: BreakdownGroup[];
  generatedAt: string;
}

export type TopProductsSort = "revenue" | "quantity";
export type TopCustomersSort = "revenue" | "orders";

export interface AnalyticsTopProduct {
  productId: string;
  name: string;
  slug: string | null;
  deleted: boolean;
  categoryName: string | null;
  revenue: number;
  quantity: number;
  orders: number;
}

export interface AnalyticsTopProducts {
  range: AnalyticsRangeInfo;
  sort: TopProductsSort;
  limit: number;
  items: AnalyticsTopProduct[];
  generatedAt: string;
}

export interface AnalyticsTopCustomer {
  customerType: "registered" | "guest";
  userId: string | null;
  name: string;
  email: string;
  orders: number;
  revenue: number;
  aov: number;
  lastPaidAt: string | null;
}

export interface AnalyticsTopCustomers {
  range: AnalyticsRangeInfo;
  sort: TopCustomersSort;
  limit: number;
  items: AnalyticsTopCustomer[];
  generatedAt: string;
}
