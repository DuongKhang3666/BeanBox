# BeanBox – API Contract

> Phiên bản 0.1 · 2026-11-10 · **Nguồn sự thật cho FE và BE.** Đổi contract phải sửa file này trước và nêu trong báo cáo.
> Base URL: `/api/v1` (trình duyệt: same-origin qua Next rewrites; backend: `http://localhost:4000/api/v1`).
> Chi tiết đầy đủ cho M1–M3; M4–M6 chỉ liệt kê endpoint (§12).

## Mục lục
1. [Quy ước chung](#1-quy-ước-chung)
2. [Bảng mã lỗi](#2-bảng-mã-lỗi)
3. [Health](#3-health)
4. [Catalog](#4-catalog)
5. [Auth](#5-auth)
6. [Me (hồ sơ & địa chỉ)](#6-me-hồ-sơ--địa-chỉ)
7. [Locations](#7-locations)
8. [Cart](#8-cart)
9. [Checkout & Orders](#9-checkout--orders)
10. [Quy tắc tính giá](#10-quy-tắc-tính-giá)
11. [Máy trạng thái đơn hàng](#11-máy-trạng-thái-đơn-hàng)
12. [Endpoint M4–M6 (chưa chi tiết)](#12-endpoint-m4m6-chưa-chi-tiết)
13. [Câu hỏi mở / Giả định](#13-câu-hỏi-mở--giả-định)

## 1. Quy ước chung

**Định dạng.** JSON UTF-8 (`Content-Type: application/json`). Tên trường camelCase. ID là chuỗi cuid. Tiền là **số nguyên VND** (không float, không chuỗi). Thời gian ISO 8601 UTC (`2026-11-10T08:30:00.000Z`); ngày thuần `YYYY-MM-DD`. Trường tùy chọn không có giá trị trả `null` (không bỏ trường), trừ khi ghi chú khác. Mọi response có header `X-Request-Id`.

**Phản hồi thành công**
```json
{ "data": { } }
```
Danh sách có phân trang:
```json
{ "data": [ ], "meta": { "page": 1, "pageSize": 20, "total": 134, "totalPages": 7 } }
```
Phân trang: query `page` (>= 1, mặc định 1), `pageSize` (1–100, mặc định 20). Giá trị ngoài khoảng -> 400 `VALIDATION_ERROR`. `page` vượt tổng trả `data: []`. Ngoại lệ không phân trang (tập nhỏ, cố định): `GET /categories`, `GET /brands`, `GET /me/addresses`, `GET /locations/*`.

**Phản hồi lỗi** (message tiếng Việt, hiển thị được cho người dùng)
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Dữ liệu không hợp lệ", "details": [ { "field": "email", "message": "Email không đúng định dạng" } ] } }
```
`details` tùy lỗi (mảng lỗi field cho `VALIDATION_ERROR`, object ngữ cảnh cho lỗi nghiệp vụ). Không lộ stack trace.

**Xác thực**
- `Authorization: Bearer <accessToken>` (JWT 15 phút). Thiếu/hết hạn/sai -> 401 `UNAUTHORIZED` (FE gọi refresh rồi thử lại).
- Refresh token ở cookie `bb_rt` (httpOnly, SameSite=Strict, Path=/api/v1/auth), FE không đọc được.
- Ký hiệu quyền: **Public** (không cần), **Optional** (có token thì là user, không thì guest; kèm `X-Cart-Token` nếu có), **Auth** (mọi user đăng nhập), **Staff** (STAFF hoặc ADMIN), **Admin** (chỉ ADMIN).

**Giỏ khách vãng lai.** Header `X-Cart-Token: <token>`. Server cấp token khi guest tạo giỏ lần đầu (xem §8). Có Bearer thì dùng giỏ của user và bỏ qua `X-Cart-Token` (trừ `POST /cart/merge`).

**Idempotency.** `POST /orders` bắt buộc `Idempotency-Key: <UUID v4>`. Thiếu/sai định dạng -> 400 `VALIDATION_ERROR` (`details[0].field = "Idempotency-Key"`).

**Rate limit.** Chung 100 req/phút/IP. Nhóm nhạy cảm 5 req/phút/IP: `POST /auth/login`, `/auth/register`, `/auth/forgot-password`, `/auth/reset-password`, `POST /orders/:code/cancel` (guest), `GET /orders/track` (10/phút). Vượt -> 429 `RATE_LIMITED` + header `Retry-After` (giây). Response có `RateLimit-Limit/Remaining/Reset`.

**CORS / CSRF.** CORS chỉ cho origin trong `FRONTEND_ORIGINS`, `credentials: true`. `POST /auth/refresh` và `POST /auth/logout` dùng cookie nên bắt buộc header `Origin` thuộc whitelist, nếu không -> 403 `INVALID_ORIGIN`.

**Chuẩn hóa input.** Chuỗi được `trim`; email lowercase; SĐT chấp nhận `0xxxxxxxxx` hoặc `+84xxxxxxxxx` (regex `^(0|\+84)(3|5|7|8|9)\d{8}$`), lưu dạng người dùng nhập đã bỏ khoảng trắng. Trường lạ trong body bị bỏ qua.

**Phân quyền theo tài nguyên (chống IDOR).** Tài nguyên của người khác (đơn hàng, địa chỉ, giỏ, dòng giỏ) luôn trả **404 `NOT_FOUND`**, không bao giờ 403, để không lộ sự tồn tại. 403 chỉ dùng khi thiếu vai trò ở endpoint admin hoặc tài khoản bị khóa. `GET /orders/:code` chỉ cho chủ đơn (kể cả STAFF/ADMIN cũng nhận 404, họ dùng `/admin/orders`).

## 2. Bảng mã lỗi

| HTTP | `code` | Ý nghĩa |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Input sai (kèm `details[]`) |
| 400 | `TOKEN_INVALID` | Token reset/verify sai, hết hạn hoặc đã dùng |
| 400 | `INVALID_PASSWORD` | Mật khẩu hiện tại không đúng (đổi mật khẩu) |
| 401 | `UNAUTHORIZED` | Thiếu/hết hạn/sai access token |
| 401 | `INVALID_CREDENTIALS` | Sai email hoặc mật khẩu (thông báo chung, không nói cái nào sai) |
| 401 | `INVALID_REFRESH_TOKEN` | Refresh token thiếu/sai/hết hạn/đã thu hồi (kể cả phát hiện reuse); cookie bị xóa |
| 403 | `FORBIDDEN` | Không đủ quyền (endpoint admin) |
| 403 | `ACCOUNT_LOCKED` | Khóa tạm do sai mật khẩu nhiều lần; `details.lockedUntil` |
| 403 | `ACCOUNT_DISABLED` | Tài khoản bị admin khóa |
| 403 | `INVALID_ORIGIN` | Origin không thuộc whitelist (endpoint dùng cookie) |
| 404 | `NOT_FOUND` | Không tồn tại hoặc không thuộc quyền truy cập |
| 409 | `CONFLICT` | Xung đột chung |
| 409 | `EMAIL_TAKEN` | Email đã được sử dụng |
| 409 | `OUT_OF_STOCK` | Không đủ tồn kho; `details.items[]` `{variantId, requested, available}` |
| 409 | `QUANTITY_LIMIT_EXCEEDED` | Quá 20 sản phẩm/dòng |
| 409 | `ITEM_UNAVAILABLE` | Biến thể/sản phẩm ngừng bán hoặc không tồn tại |
| 409 | `CART_EMPTY` | Giỏ trống khi checkout |
| 409 | `COUPON_INVALID` | Mã không hợp lệ; `details.reason` (xem §8.7) |
| 409 | `PRICE_CHANGED` | Giá tổng khác `expectedTotal` client gửi; `details.quote` |
| 409 | `IDEMPOTENCY_CONFLICT` | Cùng `Idempotency-Key` nhưng nội dung khác |
| 409 | `INVALID_STATUS_TRANSITION` | Chuyển trạng thái đơn không hợp lệ; `details.from/to/allowed` |
| 409 | `ADDRESS_LIMIT_REACHED` | Quá 10 địa chỉ |
| 409 | `PAYMENT_METHOD_UNAVAILABLE` | Phương thức thanh toán chưa bật (VNPay/Stripe trước M5) |
| 429 | `RATE_LIMITED` | Vượt giới hạn tần suất |
| 500 | `INTERNAL_ERROR` | Lỗi hệ thống |
| 503 | `SERVICE_UNAVAILABLE` | DB/dịch vụ phụ thuộc không sẵn sàng |

## 3. Health

### `GET /health` – Public
200:
```json
{ "data": { "status": "ok", "db": "up", "version": "0.1.0", "uptimeSec": 1234, "time": "2026-11-10T08:30:00.000Z" } }
```
503 `SERVICE_UNAVAILABLE` khi không truy vấn được DB (`SELECT 1`). Không yêu cầu auth, không rate limit chung (dùng cho healthcheck Docker).

## 4. Catalog

Tất cả **Public**; chỉ trả sản phẩm `status=ACTIVE` và `deletedAt IS NULL`.

**Kiểu dùng chung**
```jsonc
// ProductListItem
{
  "id": "ckp1", "slug": "ethiopia-yirgacheffe-washed", "name": "Ethiopia Yirgacheffe Washed",
  "shortDesc": "Hương hoa và cam chanh, hậu vị sạch.",
  "brand": { "id": "ckb1", "name": "BeanBox Roastery", "slug": "beanbox-roastery" },   // hoặc null
  "category": { "id": "ckc1", "name": "Specialty", "slug": "specialty" },
  "primaryImage": { "url": "/uploads/seed/ethiopia.jpg", "alt": "Túi cà phê Ethiopia" }, // hoặc null
  "minPrice": 185000,            // giá hiệu lực thấp nhất (tính lại lúc đọc từ variant)
  "compareAtPrice": 210000,      // giá niêm yết của variant đạt minPrice nếu đang sale, ngược lại null
  "inStock": true,
  "isFeatured": true,
  "ratingAvg": 4.6, "ratingCount": 18,
  "coffee": { "originCountry": "Ethiopia", "roastLevel": "LIGHT", "process": "WASHED" }  // null nếu không phải cà phê hạt
}
```
```jsonc
// Variant (trong chi tiết sản phẩm)
{
  "id": "ckv1", "sku": "ETH-250-WB", "name": "250 g - Nguyên hạt",
  "attributes": { "weight": "250g", "grind": "Nguyên hạt" },
  "price": 210000, "salePrice": 185000, "effectivePrice": 185000, "isOnSale": true, "saleEndsAt": "2026-11-30T16:59:59.000Z",
  "stockStatus": "IN_STOCK",     // IN_STOCK | LOW_STOCK (stock <= lowStockThreshold) | OUT_OF_STOCK
  "maxQuantity": 20,             // min(stock, 20)
  "weightGram": 250, "roastDate": "2026-11-01"
}
```
Không trả `stock` chính xác ra public.

### 4.1 `GET /categories`
Cây 2 cấp, sắp theo `sortOrder`, chỉ `isActive`. `productCount` = số sản phẩm ACTIVE (cha = tổng của con).
```json
{ "data": [ { "id": "ckc0", "name": "Cà phê hạt", "slug": "ca-phe-hat", "imageUrl": null, "productCount": 15,
  "children": [ { "id": "ckc1", "name": "Specialty", "slug": "specialty", "imageUrl": null, "productCount": 5 } ] } ] }
```

### 4.2 `GET /brands`
```json
{ "data": [ { "id": "ckb1", "name": "Hario", "slug": "hario", "logoUrl": null, "productCount": 4 } ] }
```

### 4.3 `GET /products`
Query (tất cả tùy chọn). Nhiều giá trị cách nhau dấu phẩy = OR trong cùng trường; các trường khác nhau = AND.

| Param | Kiểu / ràng buộc | Ý nghĩa |
|---|---|---|
| `q` | string 1–100 | Tìm không dấu, không phân biệt hoa thường; tách token, mọi token phải khớp (tên, tag, mô tả ngắn) |
| `category` | slug | Danh mục; slug cha bao gồm mọi danh mục con. Không tồn tại -> `data: []` |
| `brand` | slug[] | Thương hiệu |
| `minPrice`, `maxPrice` | int >= 0; `minPrice <= maxPrice` | Lọc theo `minPrice` của sản phẩm (xem hạn chế flash sale ở `architecture.md` §6) |
| `inStock` | `true` | Chỉ sản phẩm còn hàng |
| `origin` | string[] | `originCountry` (khớp chính xác, không phân biệt hoa thường) |
| `roast` | enum[] `LIGHT,MEDIUM,MEDIUM_DARK,DARK` | Mức rang |
| `process` | enum[] `WASHED,NATURAL,HONEY,ANAEROBIC,OTHER` | Sơ chế |
| `brew` | enum[] `PHIN,ESPRESSO,POUR_OVER,COLD_BREW,FRENCH_PRESS,AEROPRESS,MOKA` | Phù hợp cách pha (sản phẩm có ít nhất 1 giá trị trong danh sách) |
| `featured` | `true` | Chỉ sản phẩm nổi bật |
| `sort` | `newest` (mặc định) \| `price_asc` \| `price_desc` \| `bestseller` \| `rating` \| `relevance` | `relevance` chỉ hợp lệ khi có `q` (mặc định là `relevance` nếu có `q` mà không gửi `sort`). Đồng hạng -> `createdAt DESC, id` |
| `page`, `pageSize` | như §1 | Gợi ý FE: 12–24 |

Giá trị enum sai -> 400 `VALIDATION_ERROR`. 

200:
```json
{ "data": [ { "...": "ProductListItem" } ], "meta": { "page": 1, "pageSize": 20, "total": 3, "totalPages": 1 } }
```
Ví dụ: `GET /products?category=ca-phe-hat&roast=LIGHT,MEDIUM&origin=Ethiopia&minPrice=100000&inStock=true&sort=price_asc&page=1&pageSize=12`.

### 4.4 `GET /products/:slug`
200:
```json
{ "data": {
  "id": "ckp1", "slug": "ethiopia-yirgacheffe-washed", "name": "Ethiopia Yirgacheffe Washed",
  "shortDesc": "...", "description": "Markdown...", "tags": ["specialty", "hoa", "cam chanh"],
  "brand": { "id": "ckb1", "name": "BeanBox Roastery", "slug": "beanbox-roastery" },
  "category": { "id": "ckc1", "name": "Specialty", "slug": "specialty" },
  "breadcrumbs": [ { "name": "Cà phê hạt", "slug": "ca-phe-hat" }, { "name": "Specialty", "slug": "specialty" } ],
  "images": [ { "id": "cki1", "url": "/uploads/seed/ethiopia.jpg", "alt": "...", "isPrimary": true } ],
  "variants": [ { "...": "Variant" } ],
  "minPrice": 185000, "inStock": true,
  "coffee": { "originCountry": "Ethiopia", "originRegion": "Yirgacheffe", "variety": "Arabica", "process": "WASHED",
              "roastLevel": "LIGHT", "altitude": 1900, "tastingNotes": ["Hoa nhài", "Cam chanh"], "brewMethods": ["POUR_OVER", "AEROPRESS"] },
  "ratingAvg": 4.6, "ratingCount": 18,
  "seo": { "title": "...", "description": "..." },
  "related": [ { "...": "ProductListItem (tối đa 8, cùng danh mục, loại trừ chính nó)" } ],
  "createdAt": "2026-10-01T00:00:00.000Z"
} }
```
Chỉ trả variant `isActive` và chưa xóa, sắp theo `sortOrder`. Lỗi: 404 `NOT_FOUND` (slug không tồn tại, DRAFT/ARCHIVED, đã xóa mềm).

### 4.5 `GET /search/suggest?q=`
`q`: string 2–50 (ngắn hơn -> 400). `limit`: int 1–10, mặc định 6. Chuẩn hóa không dấu, ưu tiên khớp đầu tên.
```json
{ "data": { "products": [ { "slug": "robusta-buon-ma-thuot", "name": "Robusta Buôn Ma Thuột", "imageUrl": "/uploads/...", "minPrice": 95000 } ],
            "categories": [ { "slug": "ca-phe-viet", "name": "Cà phê Việt" } ] } }
```

## 5. Auth

Lược đồ User trả ra (không bao giờ có `passwordHash`):
```json
{ "id": "cku1", "email": "an@example.com", "fullName": "Nguyễn Văn An", "phone": null, "birthDate": null, "avatarUrl": null,
  "role": "CUSTOMER", "emailVerified": false, "createdAt": "2026-11-10T08:30:00.000Z" }
```
Ràng buộc mật khẩu: 8–72 ký tự, có ít nhất 1 chữ và 1 số.
Các endpoint cấp phiên trả `{ "data": { "user": {..}, "accessToken": "<jwt>", "expiresIn": 900 } }` và `Set-Cookie: bb_rt=...`.

### 5.1 `POST /auth/register` – Public (5/phút/IP)
Body: `fullName` string 2–100 (bắt buộc), `email` email <= 254 (bắt buộc), `password` (bắt buộc), `phone` string tùy chọn.
201: phiên như trên (đăng ký xong đăng nhập luôn) và gửi email xác thực. Lỗi: 400 `VALIDATION_ERROR`, 409 `EMAIL_TAKEN` ("Email đã được sử dụng"), 429.

### 5.2 `POST /auth/login` – Public (5/phút/IP)
Body: `{ "email": "an@example.com", "password": "Matkhau123" }`.
200: phiên như trên. FE sau đó gọi `POST /cart/merge` nếu có cart token.
Lỗi: 400; 401 `INVALID_CREDENTIALS` (tăng `failedLoginCount`); 403 `ACCOUNT_LOCKED` (`details: { "lockedUntil": "..." }`) khi đã khóa, kể cả nhập đúng mật khẩu trong lúc khóa; 403 `ACCOUNT_DISABLED`; 429.

### 5.3 `POST /auth/refresh` – Cookie `bb_rt` (kiểm tra Origin)
Không body. Xoay vòng refresh token. 200: `{ "data": { "user": {..}, "accessToken": "...", "expiresIn": 900 } }` + cookie mới.
Lỗi: 403 `INVALID_ORIGIN`; 401 `INVALID_REFRESH_TOKEN` (thiếu/sai/hết hạn/đã thu hồi; dùng lại token đã thu hồi -> thu hồi cả family; cookie bị xóa). FE phải gọi tuần tự (single-flight) vì token cũ bị vô hiệu ngay.

### 5.4 `POST /auth/logout` – Cookie (kiểm tra Origin)
Không body. Thu hồi token hiện tại (cả family), xóa cookie. Idempotent: luôn 204 (kể cả không có cookie), trừ 403 `INVALID_ORIGIN`.

### 5.5 `POST /auth/forgot-password` – Public (5/phút/IP)
Body: `{ "email": "an@example.com" }`. Luôn 200 (không lộ email có tồn tại):
```json
{ "data": { "message": "Nếu email tồn tại, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu." } }
```
Token hết hạn 30 phút, dùng 1 lần; link trỏ `/dat-lai-mat-khau?token=...`. Lỗi: 400, 429.

### 5.6 `POST /auth/reset-password` – Public (5/phút/IP)
Body: `{ "token": "...", "newPassword": "Matkhau456" }`. 200 `{ "data": { "message": "Đã đặt lại mật khẩu." } }`; thu hồi mọi refresh token của user, reset `failedLoginCount/lockedUntil`. Lỗi: 400 `VALIDATION_ERROR`, 400 `TOKEN_INVALID`.

### 5.7 `POST /auth/verify-email` – Public
Body: `{ "token": "..." }` (từ link email, FE trang xác thực gọi API). 200 `{ "data": { "emailVerified": true } }`. Token đã dùng nhưng email đã xác thực: vẫn 200 (idempotent). Lỗi: 400 `TOKEN_INVALID`.
Bổ sung: `POST /auth/resend-verification` – Auth, không body, 204; 409 `CONFLICT` nếu đã xác thực; giới hạn 1 lần/60 giây.

### 5.8 `POST /auth/change-password` – Auth
Body: `{ "currentPassword": "...", "newPassword": "..." }` (khác mật khẩu cũ). 204; thu hồi mọi refresh token **trừ family hiện tại**. Lỗi: 400 `VALIDATION_ERROR`, 400 `INVALID_PASSWORD`, 401.

## 6. Me (hồ sơ & địa chỉ)

### 6.1 `GET /me` – Auth
200: `{ "data": { ...User } }`.

### 6.2 `PATCH /me` – Auth
Body (ít nhất 1 trường): `fullName` string 2–100; `phone` string \| null; `birthDate` `YYYY-MM-DD` \| null (không ở tương lai, năm >= 1900); `avatarUrl` string URL http(s) <= 500 \| null. Không đổi được `email`, `role`. 200 `{ "data": User }`. Lỗi: 400, 401.

### 6.3 Địa chỉ
Kiểu:
```json
{ "id": "cka1", "fullName": "Nguyễn Văn An", "phone": "0901234567", "provinceCode": "79", "provinceName": "Thành phố Hồ Chí Minh",
  "wardCode": "26734", "wardName": "Phường Bến Nghé", "line1": "12 Lê Lợi", "isDefault": true, "createdAt": "..." }
```
Body tạo/sửa: `fullName` 2–100, `phone` (regex §1), `provinceCode` (mã hợp lệ trong §7), `wardCode` (phải thuộc `provinceCode`), `line1` 5–200, `isDefault` boolean tùy chọn. Server tự điền `provinceName/wardName` từ dữ liệu tĩnh.

| Endpoint | Mô tả | Thành công | Lỗi |
|---|---|---|---|
| `GET /me/addresses` | Danh sách, mặc định lên đầu | 200 `{ data: [Address] }` | 401 |
| `POST /me/addresses` | Tạo; địa chỉ đầu tiên tự là mặc định; `isDefault:true` bỏ mặc định cũ | 201 `{ data: Address }` | 400, 401, 409 `ADDRESS_LIMIT_REACHED` |
| `PATCH /me/addresses/:id` | Sửa một phần (>= 1 trường); nếu đổi `provinceCode` thì phải gửi lại `wardCode` | 200 `{ data: Address }` | 400, 401, 404 |
| `DELETE /me/addresses/:id` | Xóa; nếu là mặc định thì địa chỉ tạo gần nhất còn lại thành mặc định | 204 | 401, 404 |
| `POST /me/addresses/:id/default` | Đặt làm mặc định | 200 `{ data: Address }` | 401, 404 |

Địa chỉ của người khác -> 404.

### 6.4 `GET /me/orders` – Auth
Query: `status` (OrderStatus, nhiều giá trị cách dấu phẩy), `page`, `pageSize`. Sắp `createdAt DESC`. Chỉ đơn của user.
```json
{ "data": [ { "code": "BB-261110-K7QP", "status": "PENDING", "paymentStatus": "UNPAID", "paymentMethod": "COD",
  "grandTotal": 405000, "itemCount": 3, "createdAt": "2026-11-10T08:30:00.000Z",
  "items": [ { "productName": "Robusta Buôn Ma Thuột", "variantName": "500 g - Xay phin", "imageUrl": "/uploads/...", "quantity": 2 } ] } ],
  "meta": { "page": 1, "pageSize": 20, "total": 1, "totalPages": 1 } }
```
`items` tối đa 3 dòng đầu. Chi tiết dùng `GET /orders/:code`. Đơn guest đặt trước khi đăng ký **không** tự gắn vào tài khoản (xem §13).

## 7. Locations

**Public**, dữ liệu tĩnh 2 cấp, header `Cache-Control: public, max-age=86400`.

### `GET /locations/provinces`
```json
{ "data": [ { "code": "01", "name": "Thành phố Hà Nội" }, { "code": "79", "name": "Thành phố Hồ Chí Minh" } ] }
```
### `GET /locations/provinces/:code/wards`
```json
{ "data": [ { "code": "26734", "name": "Phường Bến Nghé" } ] }
```
Lỗi: 404 `NOT_FOUND` nếu mã tỉnh không tồn tại. Giả định mã/tên theo bộ dữ liệu hành chính 2 cấp (xem §13).

## 8. Cart

**Nhận diện giỏ:** có Bearer -> giỏ user (tạo lười khi cần). Không có Bearer -> giỏ guest theo `X-Cart-Token`. Token thiếu/không tồn tại/hết hạn (30 ngày không hoạt động): `GET` trả giỏ rỗng (không tạo giỏ); các thao tác ghi tạo giỏ mới và trả token mới.

**Kiểu Cart** (mọi endpoint giỏ trả kiểu này):
```json
{ "data": {
  "cartToken": "q3Zk...43chars",
  "items": [ {
    "id": "ckci1", "variantId": "ckv1", "quantity": 2,
    "product": { "id": "ckp1", "slug": "robusta-buon-ma-thuot", "name": "Robusta Buôn Ma Thuột", "imageUrl": "/uploads/..." },
    "variant": { "id": "ckv1", "sku": "ROB-500-PHIN", "name": "500 g - Xay phin", "attributes": { "weight": "500g", "grind": "Xay phin" }, "weightGram": 500 },
    "unitPrice": 165000, "listPrice": 165000, "lineTotal": 330000, "unitPriceAtAdd": 175000,
    "maxQuantity": 20, "stockStatus": "IN_STOCK",
    "warnings": [ "PRICE_CHANGED" ]
  } ],
  "itemCount": 2,
  "subtotal": 330000,
  "coupon": { "code": "WELCOME10", "type": "PERCENT", "discount": 33000, "valid": true, "invalidReason": null },
  "discountTotal": 33000,
  "totalWeightGram": 1000,
  "shippingEstimate": { "standardFrom": 20000, "freeShippingThreshold": 500000, "freeShippingRemaining": 203000 }
} }
```
- `cartToken`: **chỉ có giá trị khi vừa cấp mới** (guest tạo giỏ); các lần sau là `null`. Đồng thời gửi header `X-Cart-Token`. Giỏ user luôn `null`.
- `warnings` (mảng, có thể rỗng): `PRICE_CHANGED` (`unitPrice != unitPriceAtAdd`), `INSUFFICIENT_STOCK` (quantity > tồn), `OUT_OF_STOCK`, `UNAVAILABLE` (variant/sản phẩm ngừng bán). `maxQuantity = min(stock, 20)`.
- `subtotal` chỉ cộng các dòng không có `OUT_OF_STOCK`/`UNAVAILABLE`. `itemCount` = tổng `quantity` các dòng đó.
- `coupon` = `null` nếu chưa áp. Nếu mã đã áp nhưng không còn hợp lệ (hết hạn, không đủ điều kiện sau khi giỏ đổi): `valid:false`, `invalidReason` có giá trị, `discount: 0`. Phần giảm FREESHIP không nằm trong `discountTotal` (tính ở quote).
- `shippingEstimate.standardFrom` = phí Tiêu chuẩn thấp nhất (khu nội thành) + phụ phí khối lượng, hoặc 0 nếu đã đủ freeship; `freeShippingRemaining` = `max(0, ngưỡng - (subtotal - discountTotal))`.
- Thứ tự dòng: `createdAt` tăng dần.

### 8.1 `GET /cart` – Optional
200 Cart. Giỏ rỗng: `items: []`, các số = 0, `coupon: null`.

### 8.2 `POST /cart/items` – Optional
Body: `{ "variantId": "ckv1", "quantity": 2 }` (`quantity` int 1–20). Variant đã có trong giỏ -> cộng dồn. 201 Cart.
Lỗi: 400; 404 `NOT_FOUND` (variant không tồn tại); 409 `ITEM_UNAVAILABLE`; 409 `OUT_OF_STOCK` (tổng sau khi cộng > tồn; `details.items[0] = {variantId, requested, available}`); 409 `QUANTITY_LIMIT_EXCEEDED` (tổng > 20).

### 8.3 `PATCH /cart/items/:itemId` – Optional
Body: `{ "quantity": 3 }` (1–20; muốn xóa dùng DELETE). 200 Cart. Lỗi: 400, 404 (dòng không thuộc giỏ hiện tại), 409 `OUT_OF_STOCK`, 409 `QUANTITY_LIMIT_EXCEEDED`.

### 8.4 `DELETE /cart/items/:itemId` – Optional
200 Cart. Lỗi: 404.

### 8.5 `DELETE /cart` – Optional
Xóa mọi dòng và bỏ mã giảm giá. 200 Cart rỗng.

### 8.6 `POST /cart/merge` – Auth (+ header `X-Cart-Token` của giỏ guest)
Gộp giỏ guest vào giỏ user: cộng dồn theo variant, cắt về `min(tồn kho, 20)`, bỏ dòng hết hàng/ngừng bán; giữ mã giảm giá của user, nếu user chưa có thì lấy của guest; xóa giỏ guest. Không có header hoặc token không hợp lệ -> không gộp, trả giỏ user hiện tại. Idempotent (gọi lại khi giỏ guest đã xóa chỉ trả giỏ user). 200:
```json
{ "data": { "...": "Cart" }, "meta": { "merged": true, "adjustments": [ { "variantId": "ckv1", "requested": 25, "final": 20, "reason": "QUANTITY_LIMIT" } ] } }
```
`reason`: `QUANTITY_LIMIT` | `STOCK_LIMIT` | `UNAVAILABLE`. FE xóa `cartToken` local sau khi merge.

### 8.7 Mã giảm giá
**`POST /cart/apply-coupon`** – Optional. Body `{ "code": "welcome10" }` (không phân biệt hoa thường, 1–50 ký tự). Thay mã cũ nếu có. 200 Cart (kèm `coupon`). Giỏ rỗng -> 409 `CART_EMPTY`.
Lỗi 409 `COUPON_INVALID`, `details.reason` ∈ `NOT_FOUND`, `INACTIVE`, `NOT_STARTED`, `EXPIRED`, `USAGE_LIMIT`, `PER_USER_LIMIT`, `MIN_ORDER` (kèm `details.minOrder`), `NOT_APPLICABLE` (không có sản phẩm đủ điều kiện). Giới hạn theo khách của guest chỉ kiểm khi đặt đơn (có email).
**`DELETE /cart/coupon`** – Optional. 200 Cart (`coupon: null`).

## 9. Checkout & Orders

**Kiểu Order**
```json
{
  "code": "BB-261110-K7QP", "status": "PENDING", "paymentStatus": "UNPAID", "paymentMethod": "COD", "shippingMethod": "STANDARD",
  "contact": { "email": "an@example.com", "phone": "0901234567" },
  "shippingAddress": { "fullName": "Nguyễn Văn An", "phone": "0901234567", "provinceCode": "79", "provinceName": "Thành phố Hồ Chí Minh",
                       "wardCode": "26734", "wardName": "Phường Bến Nghé", "line1": "12 Lê Lợi" },
  "items": [ { "id": "ckoi1", "productId": "ckp2", "variantId": "ckv1", "productName": "Robusta Buôn Ma Thuột", "variantName": "500 g - Xay phin",
               "sku": "ROB-500-PHIN", "imageUrl": "/uploads/...", "unitPrice": 165000, "quantity": 2, "lineTotal": 330000 } ],
  "subtotal": 330000, "discountTotal": 33000, "shippingFee": 20000, "shippingDiscount": 0, "grandTotal": 317000,
  "couponCode": "WELCOME10", "note": "Gọi trước khi giao",
  "trackingNumber": null, "carrier": null, "cancelReason": null,
  "expiresAt": null, "paidAt": null, "deliveredAt": null, "createdAt": "2026-11-10T08:30:00.000Z",
  "history": [ { "fromStatus": null, "toStatus": "PENDING", "note": null, "createdAt": "2026-11-10T08:30:00.000Z" } ],
  "canCancel": true
}
```
`canCancel` = trạng thái hiện tại cho phép khách hủy (§11). Không lộ `actorId`, `idempotencyKey`.

### 9.1 `POST /checkout/quote` – Optional
Tính giá từ giỏ hiện tại (không tạo đơn, không giữ kho). Body:

| Trường | Kiểu / ràng buộc | Ghi chú |
|---|---|---|
| `provinceCode` | string, bắt buộc nếu không có `addressId` | Quyết định vùng ship |
| `addressId` | string, chỉ khi đã đăng nhập | Địa chỉ của user (người khác -> 404); thay cho `provinceCode` |
| `couponCode` | string, tùy chọn | Ghi đè mã đang áp trong giỏ cho lần tính này |
| `contactEmail` | email, tùy chọn | Dùng kiểm `perUserLimit` cho guest |

200:
```json
{ "data": {
  "items": [ { "...": "dòng giỏ như Cart.items" } ],
  "subtotal": 330000, "discountTotal": 33000,
  "coupon": { "code": "WELCOME10", "type": "PERCENT", "discount": 33000, "valid": true, "invalidReason": null },
  "totalWeightGram": 1000,
  "shippingZone": "INNER",
  "shippingOptions": [
    { "method": "STANDARD", "label": "Tiêu chuẩn", "estimatedDays": "3-5", "baseFee": 20000, "weightSurcharge": 0, "fee": 20000,
      "freeShippingApplied": false, "shippingDiscount": 0, "payableFee": 20000, "grandTotal": 317000 },
    { "method": "EXPRESS", "label": "Nhanh", "estimatedDays": "1-2", "baseFee": 35000, "weightSurcharge": 0, "fee": 35000,
      "freeShippingApplied": false, "shippingDiscount": 0, "payableFee": 35000, "grandTotal": 332000 }
  ],
  "paymentMethods": [ { "method": "COD", "enabled": true }, { "method": "VNPAY", "enabled": false }, { "method": "STRIPE", "enabled": false } ],
  "issues": [ { "variantId": "ckv9", "type": "OUT_OF_STOCK", "available": 0 } ]
} }
```
`fee` = `baseFee + weightSurcharge` (trước giảm); `shippingDiscount` gồm freeship ngưỡng hoặc mã FREESHIP; `payableFee = fee - shippingDiscount`; `grandTotal = subtotal - discountTotal + payableFee`. `issues.type`: `OUT_OF_STOCK` | `INSUFFICIENT_STOCK` | `UNAVAILABLE`; quote vẫn trả 200 để UI hiển thị, nhưng `POST /orders` sẽ từ chối. Mã không hợp lệ không làm quote lỗi: `coupon.valid=false` và `discount=0`.
Lỗi: 400 (thiếu `provinceCode`/`addressId`, mã tỉnh sai); 404 (`addressId` không thuộc user); 409 `CART_EMPTY`.

### 9.2 `POST /orders` – Optional
Header bắt buộc: `Idempotency-Key: <uuid v4>`. Lấy item từ giỏ server; **không nhận giá từ client**.

| Trường | Kiểu / ràng buộc |
|---|---|
| `contact.email` | email; bắt buộc với guest; user mặc định email tài khoản |
| `contact.phone` | SĐT hợp lệ; bắt buộc với guest; user mặc định SĐT địa chỉ nhận |
| `addressId` | string, chỉ user đăng nhập; thay cho `shippingAddress` (người khác -> 404; guest gửi -> 401 `UNAUTHORIZED`) |
| `shippingAddress` | object `{ fullName 2–100, phone, provinceCode, wardCode, line1 5–200 }`; bắt buộc nếu không có `addressId`; `provinceName/wardName` do server điền |
| `shippingMethod` | `STANDARD` \| `EXPRESS` (bắt buộc) |
| `paymentMethod` | `COD` \| `VNPAY` \| `STRIPE` (bắt buộc); online chỉ bật từ M5, trước đó -> 409 `PAYMENT_METHOD_UNAVAILABLE` |
| `couponCode` | string, tùy chọn; không gửi thì dùng mã trong giỏ |
| `note` | string <= 500, tùy chọn |
| `acceptTerms` | phải là `true` |
| `expectedTotal` | int, tùy chọn; khác `grandTotal` server tính -> 409 `PRICE_CHANGED` (`details.quote` = tổng mới) |

Ví dụ:
```json
{ "contact": { "email": "an@example.com", "phone": "0901234567" },
  "shippingAddress": { "fullName": "Nguyễn Văn An", "phone": "0901234567", "provinceCode": "79", "wardCode": "26734", "line1": "12 Lê Lợi" },
  "shippingMethod": "STANDARD", "paymentMethod": "COD", "couponCode": "WELCOME10", "note": "Gọi trước khi giao",
  "acceptTerms": true, "expectedTotal": 317000 }
```
**Hành vi:** trong 1 transaction: kiểm tra lại giá/tồn/mã -> tạo Order + OrderItem (snapshot) + `OrderStatusHistory` -> trừ kho (`stock >= qty`) + `InventoryMovement(ORDER_RESERVE)` -> xóa giỏ (và mã). COD -> `PENDING`. Online -> `PENDING_PAYMENT`, `expiresAt = now + 15 phút`; sau đó FE gọi endpoint tạo thanh toán (M5).
**201** `{ "data": Order }` (đơn mới). **200** `{ "data": Order }` nếu `Idempotency-Key` đã dùng với cùng nội dung (trả lại đơn cũ, không tạo thêm, không trừ kho lần nữa).
Lỗi: 400 `VALIDATION_ERROR` (gồm thiếu header key, `acceptTerms` false); 401 (guest dùng `addressId`); 404 (`addressId` lạ); 409 `CART_EMPTY`, `OUT_OF_STOCK` (rollback; `details.items[]`), `ITEM_UNAVAILABLE`, `COUPON_INVALID`, `PRICE_CHANGED`, `IDEMPOTENCY_CONFLICT`, `PAYMENT_METHOD_UNAVAILABLE`; 429.
Lưu ý: đơn guest không có endpoint xem lại ngoài `GET /orders/track`; FE lưu response vừa nhận để hiển thị trang thành công.

### 9.3 `GET /orders/:code` – Auth (chỉ chủ đơn)
200 `{ "data": Order }`. Đơn không tồn tại, của người khác, hoặc đơn guest -> 404 `NOT_FOUND`. Lỗi: 401.

### 9.4 `POST /orders/:code/cancel` – Optional
Body: `{ "reason": "Đặt nhầm", "email": "an@example.com" }`. `reason` string <= 255, tùy chọn. `email` **bắt buộc khi không đăng nhập** (phải khớp `contactEmail`, so sánh không phân biệt hoa thường); đã đăng nhập thì phải là chủ đơn, `email` bị bỏ qua.
Cho phép khi `status ∈ {PENDING_PAYMENT, PENDING, CONFIRMED}` (§11). Hoàn kho (`ORDER_RELEASE`), hoàn lượt mã nếu đã tính. 200 `{ "data": Order }` (status `CANCELLED`).
Lỗi: 400; 404 (không tìm thấy hoặc không phải chủ/ email không khớp); 409 `INVALID_STATUS_TRANSITION` (`details: { from, to: "CANCELLED", allowed: [...] }`); 429.
Đơn đã `PAID` online bị hủy: `paymentStatus` giữ `PAID` cho tới khi hoàn tiền thủ công (xử lý ở M5, xem §13).

### 9.5 `GET /orders/track` – Public (10/phút/IP)
Query: `code` (bắt buộc), và **đúng một** trong `email` | `phone`. Khớp `contactEmail`/`contactPhone` (đúng, chuẩn hóa) mới trả; sai/không thấy -> 404 `NOT_FOUND` (cùng thông báo). Khai báo route này **trước** `/orders/:code`.
200 (rút gọn dữ liệu cá nhân):
```json
{ "data": { "code": "BB-261110-K7QP", "status": "SHIPPING", "paymentStatus": "UNPAID", "paymentMethod": "COD", "shippingMethod": "STANDARD",
  "shippingAddress": { "provinceName": "Thành phố Hồ Chí Minh", "wardName": "Phường Bến Nghé" },
  "items": [ { "productName": "...", "variantName": "...", "imageUrl": "...", "unitPrice": 165000, "quantity": 2, "lineTotal": 330000 } ],
  "subtotal": 330000, "discountTotal": 33000, "shippingFee": 20000, "shippingDiscount": 0, "grandTotal": 317000,
  "trackingNumber": "GHN123", "carrier": "GHN", "createdAt": "...",
  "history": [ { "fromStatus": "PROCESSING", "toStatus": "SHIPPING", "createdAt": "..." } ] } }
```

## 10. Quy tắc tính giá

**Nguồn sự thật cho code** (hàm thuần, test unit). Tất cả số nguyên VND.

**1. Giá hiệu lực của variant** tại thời điểm `now`: `salePrice` nếu `salePrice != null` và `(saleStart == null || now >= saleStart) && (saleEnd == null || now <= saleEnd)`; ngược lại `price`.

**2. Thứ tự tính (requirements §5.4)**
1. `lineTotal = effectivePrice × quantity`; `subtotal = Σ lineTotal` (giảm giá sản phẩm/flash sale đã nằm trong `effectivePrice`).
2. Giảm giá mã (`discountTotal`), chỉ cho PERCENT/FIXED:
   - Điều kiện: `subtotal >= minOrder`; trong thời hạn; còn lượt; `perUserLimit` (theo `userId`, guest theo `contactEmail`); `isActive`.
   - `eligible` = tổng `lineTotal` của các dòng thuộc `scope` (rỗng/null = tất cả; category bao gồm danh mục con). `eligible = 0` -> `NOT_APPLICABLE`.
   - PERCENT: `min(floor(eligible × value / 100), maxDiscount ?? ∞)`. FIXED: `min(value, eligible)`. Luôn `discountTotal <= subtotal`.
3. Phí ship:
   - Vùng: `INNER` nếu `provinceCode ∈ shipping.innerCityProvinceCodes` (mặc định `["01","79"]` = Hà Nội, TP.HCM), ngược lại `OTHER`. (Giả định: "nội thành" xấp xỉ bằng cả tỉnh/thành vì không còn cấp quận/huyện.)
   - `baseFee`: INNER Tiêu chuẩn 20.000 / Nhanh 35.000; OTHER 35.000 / 55.000 (đọc từ Setting).
   - `weightSurcharge = 5.000 × ceil(max(0, totalWeightGram − 2000) / 1000)` (mỗi 1 kg hoặc phần lẻ vượt 2 kg). `totalWeightGram = Σ weightGram × quantity`.
   - `fee = baseFee + weightSurcharge`.
   - **Freeship ngưỡng:** nếu `subtotal − discountTotal >= 500.000` thì phương thức **STANDARD** có `shippingDiscount = fee` (miễn cả phụ phí). EXPRESS không được miễn.
   - **Mã FREESHIP:** `shippingDiscount = min(fee, maxDiscount ?? fee)` cho phương thức đang chọn (kể cả EXPRESS). Nếu đã freeship ngưỡng thì `shippingDiscount` vẫn là `fee` (không cộng dồn); mã vẫn được tính là đã dùng.
   - `payableFee = fee − shippingDiscount`.
4. `grandTotal = subtotal − discountTotal + fee − shippingDiscount = subtotal − discountTotal + payableFee`, luôn `>= 0`.

**3. Làm tròn:** chỉ PERCENT có phép chia, dùng `floor`. Không có VAT cộng thêm (giá đã gồm VAT).

**4. Mỗi đơn tối đa 1 mã.** Lượt dùng chỉ tính khi đơn sang `CONFIRMED`; hủy -> hoàn lượt (`CouponRedemption.releasedAt`, `usedCount − 1`). Hệ quả: với COD ở `PENDING`, nhiều đơn có thể cùng dùng lượt cuối cùng; đơn nào được xác nhận sau khi hết lượt vẫn xác nhận được (chấp nhận cho MVP, xem §13).

**Ví dụ.** Giỏ 2 × 165.000 (500 g mỗi gói) = `subtotal 330.000`, mã `WELCOME10` -> `discountTotal 33.000` (10% = 33.000, trần 50.000), giao TP.HCM Tiêu chuẩn, 1 kg: `fee 20.000`, chưa đủ 500.000 sau giảm (297.000) nên không freeship -> `grandTotal = 330.000 − 33.000 + 20.000 = 317.000`.

## 11. Máy trạng thái đơn hàng

**Nguồn sự thật cho `canTransition(from, to, actor)`.** Actor: `CUSTOMER` (chủ đơn hoặc guest đã xác thực qua email), `STAFF`, `ADMIN` (STAFF/ADMIN gọi chung là *Staff+*), `SYSTEM` (job, IPN/webhook). Mọi chuyển trạng thái ghi `OrderStatusHistory`, và dùng `UPDATE ... WHERE status = from` (optimistic) để an toàn khi đồng thời. Chuyển sai (kể cả cùng trạng thái) -> 409 `INVALID_STATUS_TRANSITION`.

| # | Từ | Đến | Ai | Điều kiện / tác dụng phụ |
|---|---|---|---|---|
| 0 | (tạo) | `PENDING` | SYSTEM (khi `POST /orders`, COD) | Trừ kho |
| 0' | (tạo) | `PENDING_PAYMENT` | SYSTEM (online) | Trừ kho, `expiresAt = now + 15'` |
| 1 | `PENDING_PAYMENT` | `CONFIRMED` | SYSTEM | IPN/webhook hợp lệ (chữ ký + số tiền khớp): `paymentStatus=PAID`, `paidAt`; tính lượt mã |
| 2 | `PENDING_PAYMENT` | `CANCELLED` | SYSTEM (quá `expiresAt`), CUSTOMER, Staff+ | Hoàn kho (`ORDER_RELEASE`) |
| 3 | `PENDING` | `CONFIRMED` | Staff+ | `confirmedAt`; tính lượt mã |
| 4 | `PENDING` | `CANCELLED` | CUSTOMER, Staff+ | Hoàn kho; `cancelReason` |
| 5 | `CONFIRMED` | `PROCESSING` | Staff+ | Đang đóng gói |
| 6 | `CONFIRMED` | `CANCELLED` | CUSTOMER, Staff+ | Hoàn kho; hoàn lượt mã; nếu đã `PAID` online cần hoàn tiền thủ công |
| 7 | `PROCESSING` | `SHIPPING` | Staff+ | Bắt buộc `trackingNumber` (`carrier` tùy chọn) |
| 8 | `PROCESSING` | `CANCELLED` | Staff+ (bắt buộc `note`) | Hoàn kho; hoàn lượt mã |
| 9 | `SHIPPING` | `DELIVERED` | Staff+ | `deliveredAt`; COD -> `paymentStatus=PAID`, `paidAt`; `soldCount += qty` |
| 10 | `SHIPPING` | `FAILED_DELIVERY` | Staff+ | Ghi lý do |
| 11 | `FAILED_DELIVERY` | `SHIPPING` | Staff+ | Giao lại (bổ sung, xem §13) |
| 12 | `FAILED_DELIVERY` | `CANCELLED` | Staff+ | Hoàn kho (hàng hoàn về); hoàn lượt mã |
| 13 | `DELIVERED` | `RETURN_REQUESTED` | CUSTOMER (trong 7 ngày) | **v2** – chưa triển khai |
| 14 | `RETURN_REQUESTED` | `RETURNED` | Staff+ | **v2**; `soldCount -= qty`, hoàn kho nếu hàng nhập lại |
| 15 | `RETURN_REQUESTED` | `DELIVERED` | Staff+ | **v2** – từ chối đổi trả |

Trạng thái cuối: `CANCELLED`, `RETURNED`. Khách chỉ được hủy ở #2, #4, #6 (`canCancel`); sau `PROCESSING` khách không hủy được. `paymentStatus` tách riêng: `UNPAID -> PAID` (IPN hoặc COD giao xong), `UNPAID -> FAILED` (cổng báo lỗi; đơn vẫn `PENDING_PAYMENT` cho tới `expiresAt` để thử lại), `FAILED -> PAID` (thử lại thành công), `PAID -> REFUNDED` (admin/hệ thống ở M5).

## 12. Endpoint M4–M6 (chưa chi tiết)

Quyền: P = Public, O = Optional, A = Auth, S = Staff+, AD = Admin.

| Nhóm | Endpoint | Mô tả | Quyền | Chốt ở |
|---|---|---|---|---|
| Admin–Sản phẩm | `GET/POST /admin/products`, `GET/PATCH/DELETE /admin/products/:id` | CRUD sản phẩm (xóa mềm) | S (xóa: AD) | M4 |
| | `POST /admin/products/:id/variants`, `PATCH/DELETE /admin/variants/:id` | CRUD biến thể | S | M4 |
| | `POST/PATCH/DELETE /admin/products/:id/images` | Ảnh: thêm, sắp xếp, chọn ảnh chính | S | M4 |
| Admin–Danh mục | `GET/POST/PATCH/DELETE /admin/categories`, `/admin/brands` | CRUD danh mục (2 cấp), thương hiệu | S (xóa: AD) | M4 |
| Admin–Tồn kho | `GET /admin/inventory`, `POST /admin/inventory/adjust`, `GET /admin/inventory/movements` | Xem tồn, điều chỉnh có lý do, lịch sử biến động | S | M4 |
| Admin–Đơn | `GET /admin/orders`, `GET /admin/orders/:id`, `PATCH /admin/orders/:id/status`, `GET /admin/orders/:id/print` | Danh sách lọc (trạng thái, ngày, thanh toán, mã/SĐT), chi tiết, chuyển trạng thái theo §11, phiếu giao | S | M4 |
| Uploads | `POST /admin/uploads` | Upload ảnh (jpg/png/webp, <= 5 MB, đổi tên file) | S | M4 |
| Thanh toán | `POST /payments/vnpay/create` | Tạo URL thanh toán VNPay cho đơn `PENDING_PAYMENT` | O (chủ đơn / guest + email) | M5 |
| | `GET /payments/vnpay/ipn` | IPN VNPay (xác thực checksum, đối chiếu số tiền) | P (chữ ký) | M5 |
| | `GET /payments/vnpay/return` | Trang return chỉ hiển thị kết quả | P | M5 |
| | `POST /payments/stripe/create-session` | Tạo Stripe Checkout Session (bổ sung ngoài requirements §8) | O | M5 |
| | `POST /payments/stripe/webhook` | Webhook Stripe (raw body + chữ ký) | P (chữ ký) | M5 |
| Coupons | `GET/POST/PATCH/DELETE /admin/coupons` | Quản lý mã giảm giá | S (xóa: AD) | M5 |
| Reviews | `GET /products/:slug/reviews` | Danh sách đánh giá + phân bố sao, lọc theo sao | P | M6 |
| | `POST /products/:productId/reviews`, `PATCH /reviews/:id` | Viết/sửa đánh giá (đã nhận hàng, sửa trong 30 ngày) | A | M6 |
| | `GET /admin/reviews`, `PATCH /admin/reviews/:id` (ẩn/hiện), `POST /admin/reviews/:id/reply` | Duyệt, trả lời | S | M6 |
| Wishlist | `GET/POST /me/wishlist`, `DELETE /me/wishlist/:productId` | Yêu thích | A | M6 |
| Dashboard | `GET /admin/dashboard` | Doanh thu 1/7/30 ngày, đơn theo trạng thái, top bán chạy, sắp hết hàng | S | M6 |
| Settings | `GET/PUT /admin/settings`, `GET /settings/public` | Phí ship, freeship, liên hệ, banner; bản công khai chỉ whitelist key | AD / P | M6 |
| Users | `GET /admin/users`, `PATCH /admin/users/:id/status`, `PATCH /admin/users/:id/role` | Quản lý người dùng | AD (đổi role) | M6 |
| Audit | `GET /admin/audit-logs` | Nhật ký thao tác | AD | M6 |
| Nội dung | `POST /contact`, `POST /newsletter/subscribe` | Form liên hệ, bản tin (cần thêm bảng) | P | M6 |

Chi tiết các endpoint trên sẽ chốt ở milestone tương ứng. Quy ước chung ở §1, mã lỗi ở §2, máy trạng thái ở §11 áp dụng nguyên cho các endpoint này.

## 13. Câu hỏi mở / Giả định

1. **Đơn guest sau khi đặt:** không có endpoint xem chi tiết ngoài `GET /orders/track` (code + email/SĐT). Trang `/dat-hang-thanh-cong/[code]` của guest phải dựa vào response `POST /orders` (lưu sessionStorage); reload mất thì hướng dẫn dùng tra cứu. Đề xuất nếu cần tốt hơn: trả thêm `viewToken` ngắn hạn. Cần quyết định.
2. **Đơn guest không tự gắn vào tài khoản** khi đăng ký/đăng nhập sau. Có thể thêm "liên kết đơn theo email đã xác thực" ở v1.x.
3. **Thanh toán thất bại (requirements §5.1 ghi "hết hạn / thất bại -> CANCELLED"):** contract chọn giữ `PENDING_PAYMENT` + `paymentStatus=FAILED` để thử lại tới `expiresAt`, rồi job mới hủy. Cần xác nhận.
4. **Thêm chuyển `FAILED_DELIVERY -> SHIPPING`** (giao lại); requirements chỉ có `FAILED_DELIVERY -> CANCELLED`.
5. **Khách hủy đơn `PENDING_PAYMENT`** được phép (requirements §FR-ORD-03 chỉ nêu `PENDING`/`CONFIRMED`); hoàn tiền đơn online đã `PAID` bị hủy chưa có luồng tự động (thủ công ở M5).
6. **`COUPON` lượt cuối:** do chỉ tính lượt khi `CONFIRMED`, `usageLimit` có thể bị vượt nhẹ với COD. Có thể chặn bằng việc "giữ lượt" lúc tạo đơn nếu cần chặt hơn.
7. **Phụ phí khối lượng:** làm tròn lên theo mỗi kg hoặc phần lẻ vượt 2 kg (requirements không nói rõ); và freeship Tiêu chuẩn miễn cả phụ phí. Cần xác nhận.
8. **Mã tỉnh/phường:** giả định `01` = Hà Nội, `79` = TP.HCM và mã phường 5 chữ số theo bộ dữ liệu hành chính 2 cấp; số liệu mẫu trong ví dụ chỉ để minh họa, task nạp dữ liệu phải đối chiếu nguồn chính thức.
9. **Không có `facets` (đếm theo bộ lọc)** trong `GET /products`; FE lấy thương hiệu từ `/brands`, các giá trị enum cố định. Thêm `GET /products/filters` nếu UI cần số đếm.
10. **Concurrent refresh:** không có grace window; FE bắt buộc single-flight. Nếu multi-tab gây đăng xuất ngoài ý muốn, cân nhắc grace 10 giây cho token vừa xoay.
11. **Trang FE xác thực email** (`/xac-thuc-email`) chưa có trong sitemap requirements §9; cần thêm. Đăng nhập Google, loyalty, subscription, blog, đổi/trả: v2, ngoài contract này.
12. **`GET /health`** nằm dưới `/api/v1` theo chỉ đạo; Docker healthcheck gọi `/api/v1/health` trực tiếp ở cổng 4000.
