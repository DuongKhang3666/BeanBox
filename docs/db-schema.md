# BeanBox – Thiết kế cơ sở dữ liệu

> Phiên bản 0.1 · 2026-11-10 · PostgreSQL + Prisma 6.x. Khối schema ở §2 sẽ được copy gần như nguyên văn vào `backend/prisma/schema.prisma`.
> Quy ước: id `String @default(cuid())`; tiền là `Int` VND; mọi bảng có `createdAt` (và `updatedAt` nếu có sửa); thời gian lưu UTC.

## Mục lục
1. [Quy ước chung](#1-quy-ước-chung)
2. [Prisma schema](#2-prisma-schema)
3. [Giải thích model](#3-giải-thích-model)
4. [Ràng buộc & index viết bằng raw SQL](#4-ràng-buộc--index-viết-bằng-raw-sql)
5. [Quy tắc dữ liệu denormalize](#5-quy-tắc-dữ-liệu-denormalize)
6. [Seed](#6-seed)
7. [Câu hỏi mở / Giả định](#7-câu-hỏi-mở--giả-định)

## 1. Quy ước chung

- Email lưu **lowercase** (service chuẩn hóa), unique.
- Soft delete: `Product.deletedAt`, `ProductVariant.deletedAt`. Mọi query công khai lọc `deletedAt IS NULL`. Slug của sản phẩm đã xóa mềm vẫn bị giữ (unique), muốn dùng lại phải đổi slug.
- Token (refresh, reset, verify, cart) **chỉ lưu SHA-256 hash**, không lưu bản rõ.
- `OrderItem` giữ snapshot (tên, SKU, giá, ảnh) nên đơn cũ không đổi khi sản phẩm sửa; FK tới variant/product dùng `Restrict` để không hard-delete được thứ đã có đơn.
- Bảng giữ dữ liệu nghiệp vụ (Order, Payment, Review...) không cascade từ User; bảng "của phiên/tiện ích" (RefreshToken, Address, Cart, Wishlist, token) cascade theo User.
- Tên bảng/cột giữ mặc định của Prisma (PascalCase bảng, camelCase cột, cần dấu nháy kép trong raw SQL).

## 2. Prisma schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ───────────── Enums ─────────────

enum Role {
  CUSTOMER
  STAFF
  ADMIN
}

enum UserStatus {
  ACTIVE
  DISABLED // admin khóa vĩnh viễn; khóa tạm do đăng nhập sai dùng User.lockedUntil
}

enum ProductStatus {
  DRAFT
  ACTIVE
  ARCHIVED
}

enum RoastLevel {
  LIGHT
  MEDIUM
  MEDIUM_DARK
  DARK
}

enum CoffeeProcess {
  WASHED
  NATURAL
  HONEY
  ANAEROBIC
  OTHER
}

enum BrewMethod {
  PHIN
  ESPRESSO
  POUR_OVER
  COLD_BREW
  FRENCH_PRESS
  AEROPRESS
  MOKA
}

enum OrderStatus {
  PENDING_PAYMENT
  PENDING
  CONFIRMED
  PROCESSING
  SHIPPING
  DELIVERED
  FAILED_DELIVERY
  CANCELLED
  RETURN_REQUESTED
  RETURNED
}

enum PaymentStatus {
  UNPAID
  PAID
  FAILED
  REFUNDED
}

enum PaymentMethod {
  COD
  VNPAY
  STRIPE
}

enum PaymentProvider {
  VNPAY
  STRIPE
}

enum PaymentTxnStatus {
  PENDING
  SUCCEEDED
  FAILED
  REFUNDED
}

enum ShippingMethod {
  STANDARD
  EXPRESS
}

enum CouponType {
  PERCENT
  FIXED
  FREESHIP
}

enum InventoryReason {
  ORDER_RESERVE
  ORDER_RELEASE
  RESTOCK
  DAMAGE
  STOCKTAKE
  ADJUSTMENT
}

enum ReviewStatus {
  PUBLISHED
  HIDDEN
}

// ───────────── Người dùng & phiên ─────────────

model User {
  id                String     @id @default(cuid())
  email             String     @unique
  passwordHash      String
  fullName          String
  phone             String?
  birthDate         DateTime?  @db.Date
  avatarUrl         String?
  role              Role       @default(CUSTOMER)
  status            UserStatus @default(ACTIVE)
  emailVerifiedAt   DateTime?
  failedLoginCount  Int        @default(0)
  lastFailedLoginAt DateTime?
  lockedUntil       DateTime?
  lastLoginAt       DateTime?
  createdAt         DateTime   @default(now())
  updatedAt         DateTime   @updatedAt

  addresses               Address[]
  refreshTokens           RefreshToken[]
  passwordResetTokens     PasswordResetToken[]
  emailVerificationTokens EmailVerificationToken[]
  cart                    Cart?
  wishlist                Wishlist[]
  orders                  Order[]
  orderStatusChanges      OrderStatusHistory[]
  inventoryMovements      InventoryMovement[]
  couponRedemptions       CouponRedemption[]
  reviews                 Review[]
  auditLogs               AuditLog[]

  @@index([role])
  @@index([createdAt])
}

model Address {
  id           String   @id @default(cuid())
  userId       String
  fullName     String
  phone        String
  provinceCode String
  provinceName String
  wardCode     String
  wardName     String
  line1        String
  isDefault    Boolean  @default(false)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

model RefreshToken {
  id           String    @id @default(cuid())
  userId       String
  familyId     String // mọi token cùng chuỗi rotation chung familyId
  tokenHash    String    @unique // SHA-256 hex
  expiresAt    DateTime
  revokedAt    DateTime?
  replacedById String? // token mới sinh ra khi rotation
  userAgent    String?
  ip           String?
  createdAt    DateTime  @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([familyId])
  @@index([expiresAt])
}

model PasswordResetToken {
  id        String    @id @default(cuid())
  userId    String
  tokenHash String    @unique
  expiresAt DateTime // now + 30 phút
  usedAt    DateTime?
  createdAt DateTime  @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
}

model EmailVerificationToken {
  id        String    @id @default(cuid())
  userId    String
  tokenHash String    @unique
  expiresAt DateTime // now + 24 giờ
  usedAt    DateTime?
  createdAt DateTime  @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
}

// ───────────── Catalog ─────────────

model Category {
  id          String   @id @default(cuid())
  parentId    String?
  name        String
  slug        String   @unique
  description String?
  imageUrl    String?
  sortOrder   Int      @default(0)
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  parent   Category?  @relation("CategoryTree", fields: [parentId], references: [id], onDelete: Restrict)
  children Category[] @relation("CategoryTree")
  products Product[]

  @@index([parentId, sortOrder])
}

model Brand {
  id        String   @id @default(cuid())
  name      String
  slug      String   @unique
  logoUrl   String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  products Product[]
}

model Product {
  id          String        @id @default(cuid())
  categoryId  String
  brandId     String?
  name        String
  slug        String        @unique
  shortDesc   String        @default("")
  description String        @default("") // Markdown
  status      ProductStatus @default(DRAFT)
  isFeatured  Boolean       @default(false)
  tags        String[]      @default([])
  seoTitle    String?
  seoDesc     String?

  // Denormalized – xem mục 5
  searchText  String        @default("")
  minPrice    Int           @default(0)
  inStock     Boolean       @default(false)
  soldCount   Int           @default(0)
  ratingAvg   Float         @default(0)
  ratingCount Int           @default(0)

  deletedAt DateTime?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  category Category        @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  brand    Brand?          @relation(fields: [brandId], references: [id], onDelete: SetNull)
  coffee   CoffeeProfile?
  images   ProductImage[]
  variants ProductVariant[]
  wishlist Wishlist[]
  orderItems OrderItem[]
  reviews  Review[]

  @@index([categoryId, status])
  @@index([brandId])
  @@index([status, createdAt])
  @@index([status, minPrice])
  @@index([status, soldCount])
  @@index([status, ratingAvg])
  @@index([isFeatured, status])
  @@index([deletedAt])
  // Tìm kiếm không dấu: GIN trigram. Cần CREATE EXTENSION pg_trgm trước (migration raw SQL đầu tiên).
  @@index([searchText(ops: raw("gin_trgm_ops"))], type: Gin)
}

model CoffeeProfile {
  productId     String         @id
  originCountry String? // lọc theo origin: "Việt Nam", "Ethiopia", "Colombia"...
  originRegion  String? // "Cầu Đất", "Yirgacheffe"...
  variety       String? // "Arabica", "Robusta", "Typica"...
  process       CoffeeProcess?
  roastLevel    RoastLevel?
  altitude      Int? // mét so với mực nước biển
  tastingNotes  String[]       @default([])
  brewMethods   BrewMethod[]   @default([])

  product Product @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@index([roastLevel])
  @@index([originCountry])
  @@index([process])
}

model ProductImage {
  id        String   @id @default(cuid())
  productId String
  url       String
  alt       String   @default("")
  sortOrder Int      @default(0)
  isPrimary Boolean  @default(false)
  createdAt DateTime @default(now())

  product Product @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@index([productId, sortOrder])
}

model ProductVariant {
  id                String    @id @default(cuid())
  productId         String
  sku               String    @unique
  name              String // "500 g - Xay phin"
  attributes        Json      @default("{}") // {"weight":"500g","grind":"phin"} | {"color":"Đen"}
  price             Int // giá niêm yết
  salePrice         Int? // giá khuyến mãi (< price)
  saleStart         DateTime?
  saleEnd           DateTime?
  stock             Int       @default(0)
  lowStockThreshold Int       @default(5)
  weightGram        Int       @default(0)
  roastDate         DateTime? @db.Date
  sortOrder         Int       @default(0)
  isActive          Boolean   @default(true)
  deletedAt         DateTime?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  product            Product             @relation(fields: [productId], references: [id], onDelete: Cascade)
  inventoryMovements InventoryMovement[]
  cartItems          CartItem[]
  orderItems         OrderItem[]

  @@index([productId, isActive])
  @@index([stock])
}

model InventoryMovement {
  id         String          @id @default(cuid())
  variantId  String
  change     Int // âm = xuất, dương = nhập
  stockAfter Int
  reason     InventoryReason
  orderId    String?
  actorId    String? // null = hệ thống (đặt hàng, job hết hạn)
  note       String?
  createdAt  DateTime        @default(now())

  variant ProductVariant @relation(fields: [variantId], references: [id], onDelete: Restrict)
  order   Order?         @relation(fields: [orderId], references: [id], onDelete: SetNull)
  actor   User?          @relation(fields: [actorId], references: [id], onDelete: SetNull)

  @@index([variantId, createdAt])
  @@index([orderId])
}

// ───────────── Giỏ hàng & yêu thích ─────────────

model Cart {
  id             String   @id @default(cuid())
  userId         String?  @unique
  tokenHash      String?  @unique // SHA-256 của cart token (giỏ guest)
  couponCode     String?
  lastActivityAt DateTime @default(now())
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  user  User?      @relation(fields: [userId], references: [id], onDelete: Cascade)
  items CartItem[]

  @@index([lastActivityAt])
}

model CartItem {
  id               String   @id @default(cuid())
  cartId           String
  variantId        String
  quantity         Int
  unitPriceAtAdd   Int // giá hiệu lực lúc thêm, để cảnh báo đổi giá (FR-CART-07)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  cart    Cart           @relation(fields: [cartId], references: [id], onDelete: Cascade)
  variant ProductVariant @relation(fields: [variantId], references: [id], onDelete: Cascade)

  @@unique([cartId, variantId])
  @@index([variantId])
}

model Wishlist {
  userId    String
  productId String
  createdAt DateTime @default(now())

  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  product Product @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@id([userId, productId])
  @@index([productId])
}

// ───────────── Đơn hàng & thanh toán ─────────────

model Order {
  id              String         @id @default(cuid())
  code            String         @unique // BB-YYMMDD-XXXX
  userId          String? // null = khách vãng lai
  contactEmail    String // luôn có: guest nhập, user lấy từ tài khoản/form
  contactPhone    String
  status          OrderStatus    @default(PENDING)
  paymentStatus   PaymentStatus  @default(UNPAID)
  paymentMethod   PaymentMethod
  shippingMethod  ShippingMethod
  shippingAddress Json // snapshot: fullName, phone, provinceCode/Name, wardCode/Name, line1
  totalWeightGram Int            @default(0)
  subtotal        Int
  discountTotal   Int            @default(0) // giảm trên hàng hóa (mã PERCENT/FIXED)
  shippingFee     Int // phí ship gốc, đã gồm phụ phí khối lượng
  shippingDiscount Int           @default(0) // freeship ngưỡng / mã FREESHIP
  grandTotal      Int
  couponId        String?
  couponCode      String?
  note            String?
  trackingNumber  String?
  carrier         String?
  cancelReason    String?
  expiresAt       DateTime? // hạn thanh toán của PENDING_PAYMENT
  paidAt          DateTime?
  confirmedAt     DateTime?
  deliveredAt     DateTime?
  cancelledAt     DateTime?
  idempotencyKey     String @unique
  requestFingerprint String // SHA-256 của payload chuẩn hóa, phát hiện cùng key khác nội dung
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  user       User?                @relation(fields: [userId], references: [id], onDelete: SetNull)
  coupon     Coupon?              @relation(fields: [couponId], references: [id], onDelete: SetNull)
  items      OrderItem[]
  history    OrderStatusHistory[]
  payments   Payment[]
  movements  InventoryMovement[]
  redemption CouponRedemption?

  @@index([userId, createdAt])
  @@index([status, createdAt])
  @@index([status, expiresAt])
  @@index([paymentStatus])
  @@index([contactEmail])
  @@index([contactPhone])
  @@index([createdAt])
}

model OrderItem {
  id          String  @id @default(cuid())
  orderId     String
  productId   String
  variantId   String
  productName String
  variantName String
  sku         String
  imageUrl    String?
  weightGram  Int     @default(0)
  unitPrice   Int // giá hiệu lực tại thời điểm đặt
  quantity    Int
  lineTotal   Int

  order   Order          @relation(fields: [orderId], references: [id], onDelete: Cascade)
  product Product        @relation(fields: [productId], references: [id], onDelete: Restrict)
  variant ProductVariant @relation(fields: [variantId], references: [id], onDelete: Restrict)
  review  Review?

  @@index([orderId])
  @@index([productId])
  @@index([variantId])
}

model OrderStatusHistory {
  id         String       @id @default(cuid())
  orderId    String
  fromStatus OrderStatus? // null = lúc tạo đơn
  toStatus   OrderStatus
  note       String?
  actorId    String? // null = hệ thống hoặc khách vãng lai
  createdAt  DateTime     @default(now())

  order Order @relation(fields: [orderId], references: [id], onDelete: Cascade)
  actor User? @relation(fields: [actorId], references: [id], onDelete: SetNull)

  @@index([orderId, createdAt])
}

model Payment {
  id            String           @id @default(cuid())
  orderId       String
  provider      PaymentProvider
  providerTxnId String? // vnp_TransactionNo / Stripe payment_intent id
  providerRef   String? // vnp_TxnRef / Stripe checkout session id
  amount        Int
  status        PaymentTxnStatus @default(PENDING)
  rawPayload    Json?
  createdAt     DateTime         @default(now())
  updatedAt     DateTime         @updatedAt

  order Order @relation(fields: [orderId], references: [id], onDelete: Restrict)

  @@unique([provider, providerTxnId])
  @@index([orderId])
  @@index([providerRef])
}

// ───────────── Khuyến mãi ─────────────

model Coupon {
  id           String     @id @default(cuid())
  code         String     @unique // lưu UPPERCASE; so khớp không phân biệt hoa thường
  description  String?
  type         CouponType
  value        Int // PERCENT: 1-100; FIXED: số tiền VND; FREESHIP: 0
  maxDiscount  Int? // PERCENT: trần giảm; FREESHIP: trần giảm phí ship (null = miễn toàn bộ)
  minOrder     Int        @default(0)
  startsAt     DateTime?
  endsAt       DateTime?
  usageLimit   Int?
  perUserLimit Int?
  usedCount    Int        @default(0)
  scope        Json? // {"categoryIds":[...],"productIds":[...]}; null/rỗng = toàn bộ
  isActive     Boolean    @default(true)
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt

  orders      Order[]
  redemptions CouponRedemption[]

  @@index([isActive, endsAt])
}

model CouponRedemption {
  id         String    @id @default(cuid())
  couponId   String
  orderId    String    @unique
  userId     String?
  email      String // định danh lượt dùng của guest (perUserLimit)
  releasedAt DateTime? // đơn bị hủy -> hoàn lượt
  createdAt  DateTime  @default(now())

  coupon Coupon @relation(fields: [couponId], references: [id], onDelete: Restrict)
  order  Order  @relation(fields: [orderId], references: [id], onDelete: Cascade)
  user   User?  @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([couponId, userId])
  @@index([couponId, email])
}

// ───────────── Đánh giá, cấu hình, audit ─────────────

model Review {
  id          String       @id @default(cuid())
  productId   String
  userId      String
  orderItemId String       @unique
  rating      Int // 1..5
  content     String       @default("")
  images      String[]     @default([])
  status      ReviewStatus @default(PUBLISHED)
  reply       String?
  repliedAt   DateTime?
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  product   Product   @relation(fields: [productId], references: [id], onDelete: Cascade)
  user      User      @relation(fields: [userId], references: [id], onDelete: Restrict)
  orderItem OrderItem @relation(fields: [orderItemId], references: [id], onDelete: Restrict)

  @@index([productId, status, createdAt])
  @@index([userId])
}

model Setting {
  key       String   @id
  value     Json
  updatedAt DateTime @updatedAt
}

model AuditLog {
  id        String   @id @default(cuid())
  actorId   String?
  action    String // "product.update", "order.status", "user.role"...
  entity    String
  entityId  String?
  diff      Json?
  ip        String?
  createdAt DateTime @default(now())

  actor User? @relation(fields: [actorId], references: [id], onDelete: SetNull)

  @@index([entity, entityId])
  @@index([actorId, createdAt])
  @@index([createdAt])
}
```

## 3. Giải thích model

| Model | Mục đích / ghi chú |
|---|---|
| `User` | Tài khoản. `failedLoginCount/lastFailedLoginAt/lockedUntil` phục vụ khóa tạm (FR-AUTH-08): sai quá 5 lần trong 15 phút -> `lockedUntil = now+15'`; đăng nhập đúng reset về 0. `status=DISABLED` do admin. `passwordHash` không bao giờ ra API |
| `Address` | Sổ địa chỉ 2 cấp (tỉnh/thành – phường/xã); tên được lưu kèm mã để hiển thị không cần tra lại. Tối đa 10 địa chỉ/user (service). Đúng 1 địa chỉ mặc định/user (xem §4) |
| `RefreshToken` | Hash SHA-256 của refresh token, `familyId` để thu hồi cả chuỗi khi phát hiện reuse, `replacedById` truy vết rotation |
| `PasswordResetToken`, `EmailVerificationToken` | Token dùng 1 lần (`usedAt`), hết hạn 30 phút / 24 giờ; tạo token mới thì vô hiệu token cũ chưa dùng |
| `Category` | Cây 2 cấp (service từ chối tạo cấp 3); `isActive` để ẩn khỏi storefront |
| `Brand` | Thương hiệu, tùy chọn trên sản phẩm |
| `Product` | Thông tin chung; các cột denormalize ở §5; `tags` và `description` (Markdown) |
| `CoffeeProfile` | 1-1 với Product loại cà phê hạt; `originCountry` là giá trị lọc `origin`; `brewMethods`/`tastingNotes` là mảng |
| `ProductImage` | Nhiều ảnh, đúng 1 ảnh `isPrimary` khi có ảnh (partial unique §4) |
| `ProductVariant` | SKU bán được: giá, giá sale theo khung giờ, tồn kho, cân nặng, ngày rang theo lô. Giá hiệu lực = `salePrice` nếu `salePrice` không null và `now` trong `[saleStart, saleEnd]` (bound null = mở), ngược lại `price` |
| `InventoryMovement` | Sổ cái kho bất biến: mọi thay đổi `stock` đều ghi 1 dòng (`stockAfter` để đối soát). `ORDER_RESERVE` khi đặt, `ORDER_RELEASE` khi hủy/hết hạn |
| `Cart`, `CartItem` | Giỏ server-side. Giỏ user: `userId`; giỏ guest: `tokenHash`. `couponCode` lưu mã đang áp. `unique(cartId, variantId)`: thêm trùng thì cộng dồn |
| `Wishlist` | Khóa phức hợp (userId, productId) |
| `Order` | `userId` null = khách vãng lai. `contactEmail/contactPhone` luôn có (khác requirements §7 chỉ có `guestEmail?/guestPhone?`, xem §7). `shippingAddress` là snapshot JSON. Tách `discountTotal` (giảm hàng) và `shippingDiscount` (giảm ship) để `grandTotal = subtotal - discountTotal + shippingFee - shippingDiscount`. `expiresAt` chỉ dùng cho `PENDING_PAYMENT`. `idempotencyKey` unique; `requestFingerprint` phát hiện cùng key khác payload |
| `OrderItem` | Snapshot dòng hàng; `productId` kèm theo để review/báo cáo không cần join qua variant |
| `OrderStatusHistory` | Mỗi lần đổi trạng thái 1 dòng (kể cả lúc tạo, `fromStatus=null`), có ai/khi nào/ghi chú |
| `Payment` | Mỗi lần thử thanh toán online 1 dòng. COD không tạo Payment (trạng thái nằm ở `Order.paymentStatus`, chuyển `PAID` khi giao thành công). `unique(provider, providerTxnId)` chống xử lý IPN trùng |
| `Coupon` | `code` lưu UPPERCASE. `usedCount` denormalize; chỉ tăng khi đơn `CONFIRMED` (§5.5 requirements) |
| `CouponRedemption` | 1 dòng/đơn đã tính lượt; `email` để áp `perUserLimit` cho guest; `releasedAt` khi hủy đơn (đồng thời giảm `usedCount`) |
| `Review` | `unique(orderItemId)` = mỗi dòng hàng đã mua 1 đánh giá. Chỉ khi đơn `DELIVERED` (service kiểm tra) |
| `Setting` | Key-value JSON (phí ship, ngưỡng freeship, banner...) |
| `AuditLog` | Nhật ký thao tác admin/staff (`diff` chỉ chứa trường thay đổi, không chứa dữ liệu nhạy cảm) |

## 4. Ràng buộc & index viết bằng raw SQL

Prisma không biểu diễn được các mục dưới đây; đặt trong migration raw SQL (migration đầu tiên có `CREATE EXTENSION` phải chạy **trước** migration tạo index GIN, vì schema khai báo `gin_trgm_ops`).

```sql
-- Migration 0000 (tạo bằng --create-only, chạy trước migration sinh bảng)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Sau khi có bảng: CHECK constraints
ALTER TABLE "ProductVariant"
  ADD CONSTRAINT "ProductVariant_stock_nonneg"   CHECK ("stock" >= 0),
  ADD CONSTRAINT "ProductVariant_price_pos"      CHECK ("price" > 0),
  ADD CONSTRAINT "ProductVariant_sale_lt_price"  CHECK ("salePrice" IS NULL OR ("salePrice" > 0 AND "salePrice" < "price")),
  ADD CONSTRAINT "ProductVariant_sale_window"    CHECK ("saleStart" IS NULL OR "saleEnd" IS NULL OR "saleStart" < "saleEnd"),
  ADD CONSTRAINT "ProductVariant_weight_nonneg"  CHECK ("weightGram" >= 0);

ALTER TABLE "CartItem"
  ADD CONSTRAINT "CartItem_quantity_range" CHECK ("quantity" BETWEEN 1 AND 20);

ALTER TABLE "Cart"
  ADD CONSTRAINT "Cart_owner_present" CHECK ("userId" IS NOT NULL OR "tokenHash" IS NOT NULL);

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_amounts_nonneg" CHECK (
    "subtotal" >= 0 AND "discountTotal" >= 0 AND "shippingFee" >= 0
    AND "shippingDiscount" >= 0 AND "grandTotal" >= 0),
  ADD CONSTRAINT "Order_discount_le_subtotal"  CHECK ("discountTotal" <= "subtotal"),
  ADD CONSTRAINT "Order_shipdiscount_le_fee"   CHECK ("shippingDiscount" <= "shippingFee"),
  ADD CONSTRAINT "Order_grand_total_formula"   CHECK (
    "grandTotal" = "subtotal" - "discountTotal" + "shippingFee" - "shippingDiscount");

ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_qty_pos"        CHECK ("quantity" > 0),
  ADD CONSTRAINT "OrderItem_price_nonneg"   CHECK ("unitPrice" >= 0),
  ADD CONSTRAINT "OrderItem_line_formula"   CHECK ("lineTotal" = "unitPrice" * "quantity");

ALTER TABLE "Coupon"
  ADD CONSTRAINT "Coupon_value_valid" CHECK (
    ("type" = 'PERCENT'  AND "value" BETWEEN 1 AND 100) OR
    ("type" = 'FIXED'    AND "value" > 0) OR
    ("type" = 'FREESHIP' AND "value" = 0)),
  ADD CONSTRAINT "Coupon_minorder_nonneg" CHECK ("minOrder" >= 0),
  ADD CONSTRAINT "Coupon_used_nonneg"     CHECK ("usedCount" >= 0),
  ADD CONSTRAINT "Coupon_window"          CHECK ("startsAt" IS NULL OR "endsAt" IS NULL OR "startsAt" < "endsAt");

ALTER TABLE "Review"
  ADD CONSTRAINT "Review_rating_range" CHECK ("rating" BETWEEN 1 AND 5);

-- Partial unique index
CREATE UNIQUE INDEX "Address_one_default_per_user" ON "Address" ("userId") WHERE "isDefault";
CREATE UNIQUE INDEX "ProductImage_one_primary"     ON "ProductImage" ("productId") WHERE "isPrimary";
```

Ghi chú:
- Index GIN trigram khai báo bằng `@@index([searchText(ops: raw("gin_trgm_ops"))], type: Gin)` trong schema để Prisma không đề xuất xóa nó ở lần `migrate dev` sau. Nếu phiên bản Prisma thực tế không chấp nhận cú pháp này, bỏ dòng đó khỏi schema và tạo index bằng raw SQL: `CREATE INDEX "Product_searchText_trgm" ON "Product" USING GIN ("searchText" gin_trgm_ops);`.
- Chưa chắc: CHECK constraint và partial unique index tạo thủ công có thể bị `prisma migrate dev` coi là drift (đề xuất DROP INDEX cho partial unique). **Task scaffold phải kiểm tra bằng cách chạy `migrate dev` lần 2**; nếu Prisma đòi xóa partial index thì ghi chú trong migration, dùng `prisma migrate deploy` ở môi trường thật, và vẫn enforce trong service (xem câu hỏi mở).
- **Kết quả kiểm tra drift (Prisma 6.19.3, Postgres 17, đã chạy):** cú pháp `gin_trgm_ops` trong schema được chấp nhận (index sinh ra trong migration init). Sau khi áp đủ 3 migration (`enable_pg_trgm`, `init`, `constraints_and_partial_indexes`), `prisma migrate dev` lần 2 báo "Already in sync" – **Prisma KHÔNG đòi DROP** partial unique index hay CHECK constraint. Raw SQL được giữ nguyên trong migration `constraints_and_partial_indexes`. Schema ở §2 không phải sửa gì (`prisma validate` pass nguyên văn).
- Các ràng buộc service (không có trong DB): Category tối đa 2 cấp; tối đa 10 địa chỉ/user; tối đa 3 ảnh/review; chỉ một `Coupon` áp mỗi đơn (đã đúng bởi cấu trúc `Order.couponId`).
- Tổng "không âm" và công thức `grandTotal` đã có CHECK; service vẫn tính trước, CHECK là lưới an toàn.

## 5. Quy tắc dữ liệu denormalize

Service phải cập nhật các cột này **trong cùng transaction** với thay đổi nguồn:

| Cột | Cập nhật khi | Cách tính |
|---|---|---|
| `Product.searchText` | Tạo/sửa product (name, tags, shortDesc) | `normalize(name + ' ' + tags.join(' ') + ' ' + shortDesc)`: lowercase, NFD, bỏ dấu kết hợp, `đ->d`, gộp khoảng trắng |
| `Product.minPrice` | Tạo/sửa/xóa/bật tắt variant; đổi giá/sale; đổi trạng thái product | Min giá hiệu lực của variant `isActive AND deletedAt IS NULL` (không loại variant hết hàng). Không có variant -> 0 |
| `Product.inStock` | Mỗi lần `stock` variant đổi (đặt đơn, hủy, nhập kho) | `EXISTS(variant active, chưa xóa, stock > 0)` |
| `Product.soldCount` | Đơn chuyển `DELIVERED` (+qty); `RETURNED` (-qty) | Tổng `quantity` theo `productId` |
| `Product.ratingAvg/ratingCount` | Review tạo/sửa/ẩn/hiện | Trung bình và số lượng review `PUBLISHED` |
| `Coupon.usedCount` | Đơn `CONFIRMED` (+1, tạo `CouponRedemption`); hủy sau đó (-1, đặt `releasedAt`) | Dùng `UPDATE ... SET usedCount = usedCount + 1 WHERE usageLimit IS NULL OR usedCount < usageLimit` |

Hạn chế: `minPrice` không phản ánh realtime flash sale theo khung giờ (xem `architecture.md` §6).

Mã đơn: `BB-` + `YYMMDD` (giờ Việt Nam, UTC+7) + `-` + 4 ký tự ngẫu nhiên từ `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (bỏ `0 O 1 I L`; 31 ký tự). Dựa vào unique constraint `Order.code`, bắt lỗi trùng (Prisma `P2002` trên `code`) và thử lại tối đa 5 lần.

## 6. Seed

`backend/prisma/seed.ts` (idempotent: dùng `upsert` theo slug/sku/email/code; từ chối chạy khi `NODE_ENV=production`).

**Tài khoản** (mật khẩu đọc từ `.env`, giá trị dev đặt trong `.env.example`):

| Email | Vai trò | Mật khẩu từ biến |
|---|---|---|
| `admin@beanbox.local` | ADMIN | `SEED_ADMIN_PASSWORD` |
| `staff@beanbox.local` | STAFF | `SEED_STAFF_PASSWORD` |
| `customer@beanbox.local` | CUSTOMER (kèm 2 địa chỉ, 1 mặc định) | `SEED_CUSTOMER_PASSWORD` |

Cả ba đã `emailVerifiedAt = now`. Mật khẩu dev phải thỏa chính sách (>= 8 ký tự, chữ + số); không dùng lại ở môi trường thật.

**Danh mục** (theo requirements §3.1; slug bỏ dấu): `ca-phe-hat` (specialty, ca-phe-viet, blend, decaf), `dung-cu-pha-che` (phin, pour-over, french-press-aeropress-moka-pot, may-xay, am-rot-can-nhiet-ke), `phu-kien` (giay-loc, ly-coc-binh-giu-nhiet, hop-bao-quan-ve-sinh), `qua-tang-combo`.

**Thương hiệu** (dữ liệu mẫu): BeanBox Roastery (nhãn riêng cho cà phê hạt), Hario, Kalita, Chemex, AeroPress, Bialetti, Timemore; sản phẩm phin/ly cốc phổ thông có thể để `brandId = null`.

**Sản phẩm (>= 30)**, mỗi sản phẩm có >= 1 ảnh placeholder (`/uploads/seed/<slug>.jpg`, file ảnh đặt trong repo hoặc dùng một ảnh chung), mô tả tiếng Việt tự nhiên, không bịa thông số kỹ thuật chưa kiểm chứng (chỉ dùng thông tin chung; ghi rõ đây là dữ liệu mẫu cho dev):

| Nhóm | Sản phẩm mẫu | Biến thể |
|---|---|---|
| Specialty (5) | Ethiopia Yirgacheffe Washed; Colombia Huila Natural; Kenya AA; Việt Nam Cầu Đất Honey; Brazil Cerrado | 250 g / 500 g × nguyên hạt / xay pour-over |
| Cà phê Việt (5) | Robusta Buôn Ma Thuột; Arabica Cầu Đất Medium; Arabica Sơn La; Culi Rang Đậm; Moka Cầu Đất | 250 g / 500 g / 1 kg × nguyên hạt / xay phin |
| Blend (3) | Blend Phin Truyền Thống; Blend Espresso Cân Bằng; Blend Cold Brew | 250 g / 500 g × nguyên hạt / xay |
| Decaf (2) | Decaf Colombia; Decaf Brazil | 250 g |
| Phin (2) | Phin nhôm 1 ngăn; Phin inox | kích thước |
| Pour-over (4) | Hario V60 02 (nhựa/sứ); Kalita Wave 185; Chemex 3 cup; Bộ phễu + ly chia | màu / dung tích |
| French press / AeroPress / Moka (3) | Bình French Press 600 ml; AeroPress Original; Bialetti Moka Express 3 cup | dung tích / màu |
| Máy xay (3) | Timemore C2 (tay); Máy xay tay inox phổ thông; Máy xay điện dùng gia đình | màu |
| Ấm rót, cân, nhiệt kế (3) | Ấm rót cổ ngỗng 600 ml; Cân điện tử pha cà phê; Nhiệt kế dùng cho pha chế | màu |
| Giấy lọc (2) | Giấy lọc V60 02 (100 tờ); Giấy lọc Chemex | số lượng |
| Ly, cốc, bình (2) | Ly sứ espresso; Bình giữ nhiệt 500 ml | màu / dung tích |
| Hộp bảo quản, vệ sinh (2) | Hộp bảo quản hạt có van một chiều; Bột vệ sinh máy xay | dung tích |
| Quà tặng & Combo (2) | Gift box Pour-over Starter; Combo Phin + 250 g Robusta | cố định |

Tổng >= 38 sản phẩm. Các trường hợp cần có để test UI/logic (cố định, không ngẫu nhiên):
- Ít nhất 3 variant `stock = 0` (hiển thị "Hết hàng"), 3 variant `stock <= lowStockThreshold`, còn lại 10–80.
- 2 variant có `salePrice` đang hiệu lực, 1 variant có sale đã hết hạn, 1 variant có sale chưa bắt đầu.
- 1 sản phẩm `DRAFT`, 1 `ARCHIVED`, 1 xóa mềm (không hiện ở storefront); 6 sản phẩm `isFeatured`.
- Cà phê hạt có `CoffeeProfile` đủ (origin, roast, process, notes, brew methods) để test mọi bộ lọc; `roastDate` trong 30 ngày gần nhất.
- `soldCount`, `ratingAvg`, `ratingCount` điền giá trị mẫu để sắp xếp có kết quả khác nhau (đánh dấu là dữ liệu giả cho dev).
- `searchText`, `minPrice`, `inStock` tính bằng cùng hàm service (không viết tay).

**Mã giảm giá mẫu:** `WELCOME10` (PERCENT 10%, tối đa 50.000đ, đơn tối thiểu 200.000đ), `FREESHIP30` (FREESHIP, giảm phí ship tối đa 30.000đ), `GIAM50K` (FIXED 50.000đ, đơn tối thiểu 500.000đ), `HETHAN` (đã hết hạn, để test lỗi).

**Setting mặc định** (§5.3 requirements):

```json
{
  "shipping.rates": {
    "inner":  { "STANDARD": 20000, "EXPRESS": 35000 },
    "other":  { "STANDARD": 35000, "EXPRESS": 55000 }
  },
  "shipping.innerCityProvinceCodes": ["01", "79"],
  "shipping.freeShippingThreshold": 500000,
  "shipping.weightSurcharge": { "freeGram": 2000, "stepGram": 1000, "feePerStep": 5000 },
  "order.paymentExpiryMinutes": 15,
  "store.contact": { "name": "BeanBox", "phone": "", "email": "hello@beanbox.local", "address": "" },
  "home.banners": []
}
```

Dữ liệu địa chỉ **không** nằm trong DB: `backend/prisma/data/provinces-wards.json` (nguồn dữ liệu hành chính 2 cấp từ 01/07/2025), nạp vào bộ nhớ khi khởi động.

## 7. Câu hỏi mở / Giả định

1. **`Order.contactEmail/contactPhone` luôn bắt buộc** thay cho `guestEmail?/guestPhone?` trong requirements §7: cần email để gửi xác nhận cho cả user lẫn guest và để tra cứu đơn. Cần xác nhận.
2. **Phân biệt giảm hàng vs. giảm ship:** thêm `Order.shippingDiscount` (requirements chỉ có `discountTotal`, `shippingFee`). Công thức `grandTotal` ghi rõ ở trên.
3. **`ProductStatus` không có trạng thái "hết hàng"** – hết hàng suy ra từ tồn kho (`inStock`).
4. **Mã tỉnh:** giả định mã Hà Nội = `"01"`, TP.HCM = `"79"` trong bộ dữ liệu 2 cấp; task nạp dữ liệu phải đối chiếu lại và cập nhật `shipping.innerCityProvinceCodes` nếu khác. "Nội thành" được xấp xỉ bằng cả tỉnh/thành (TP.HCM, Hà Nội) vì không còn cấp quận/huyện.
5. **Thiếu trong requirements:** bảng cho newsletter/liên hệ (FR-CNT-03, mức S) và blog (v2) chưa có; thêm ở milestone tương ứng. `Subscription` để v2 theo chỉ đạo.
6. **Xóa user:** chưa có luồng xóa tài khoản; nếu cần sẽ ẩn danh hóa thay vì hard-delete (FK `Restrict` ở Review).
7. **Partial index/CHECK vs Prisma drift** (§4): cần kiểm chứng khi scaffold; phương án dự phòng là chỉ enforce trong service.
8. **Review thêm ràng buộc "1 đánh giá/sản phẩm/đơn"** (FR-REV-02): `unique(orderItemId)` chỉ chặn trùng theo dòng hàng; nếu đơn có 2 variant của cùng sản phẩm thì service phải chặn đánh giá lần 2 (chưa có unique trong DB).
9. **Phân quyền `Setting`/`Coupon` đọc công khai:** giá trị setting chỉ lộ qua endpoint `GET /settings/public` (whitelist key), không lộ toàn bảng.
