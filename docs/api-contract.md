# BeanBox – API Contract

> Phiên bản 0.3 · 2026-11-10 · **Nguồn sự thật cho FE và BE.** Đổi contract phải sửa file này trước và nêu trong báo cáo.
> Thay đổi 0.2: áp dụng D-001..D-007 ([`decisions.md`](decisions.md)): giữ lượt mã khi tạo đơn, tra cứu/hủy đơn guest bằng SĐT chuẩn hóa, chuẩn hóa SĐT, chốt các mục §13.1–8.
> Thay đổi 0.2.1: làm rõ §4 sau khi triển khai M1 (không đổi shape).
> Thay đổi 0.3: chi tiết hóa M2 Auth & Tài khoản, D-008, D-009.
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
- `Authorization: Bearer <accessToken>` (JWT HS256, 15 phút; claims `sub`, `role`, `sid` (= `familyId` của phiên refresh), `iat`, `exp`, `iss`, `aud`). Thiếu/hết hạn/sai -> 401 `UNAUTHORIZED` (FE gọi refresh rồi thử lại).
- Với endpoint **Auth/Optional**: nếu CÓ header `Authorization` mà token sai/hết hạn -> 401 `UNAUTHORIZED` (không âm thầm coi là guest).
- User không còn tồn tại -> 401 `UNAUTHORIZED`; user `DISABLED` -> 403 `ACCOUNT_DISABLED`. `role` luôn đọc lại từ DB mỗi request đã xác thực (không tin claim).
- Refresh token ở cookie `bb_rt` (httpOnly, SameSite=Strict, Path=/api/v1/auth), FE không đọc được.
- Ký hiệu quyền: **Public** (không cần), **Optional** (có token thì là user, không thì guest; kèm `X-Cart-Token` nếu có), **Auth** (mọi user đăng nhập), **Staff** (STAFF hoặc ADMIN), **Admin** (chỉ ADMIN).

**Giỏ khách vãng lai.** Header `X-Cart-Token: <token>`. Server cấp token khi guest tạo giỏ lần đầu (xem §8). Có Bearer thì dùng giỏ của user và bỏ qua `X-Cart-Token` (trừ `POST /cart/merge`).

**Idempotency.** `POST /orders` bắt buộc `Idempotency-Key: <UUID v4>`. Thiếu/sai định dạng -> 400 `VALIDATION_ERROR` (`details[0].field = "Idempotency-Key"`).

**Rate limit.** Chung 100 req/phút/IP. Nhóm nhạy cảm 5 req/phút/IP: `POST /auth/login`, `/auth/register`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/change-password`, `POST /orders/:code/cancel` (guest), `GET /orders/track` (10/phút). Vượt -> 429 `RATE_LIMITED` + header `Retry-After` (giây) và `error.details: { "retryAfterSec": <int> }` (cùng giá trị với header). Response có `RateLimit-Limit/Remaining/Reset`. IP client xác định theo `TRUST_PROXY` (D-009); request SSR nội bộ có `X-Internal-Secret` hợp lệ được miễn rate limit chung, không miễn nhóm nhạy cảm (xem `architecture.md` §3).

**CORS / CSRF.** CORS chỉ cho origin trong `FRONTEND_ORIGINS`, `credentials: true`. `POST /auth/refresh` và `POST /auth/logout` dùng cookie nên bắt buộc header `Origin` khớp CHÍNH XÁC một giá trị trong `FRONTEND_ORIGINS`; thiếu hoặc `null` -> 403 `INVALID_ORIGIN`.

**Chuẩn hóa input.** Chuỗi được `trim`; email lowercase; SĐT được chuẩn hóa (D-007): bỏ khoảng trắng, dấu chấm, gạch ngang; `+84` đầu -> `0`; sau đó phải khớp `^0(3|5|7|8|9)\d{8}$`, sai -> 400 `VALIDATION_ERROR`. Mọi nơi lưu SĐT (`User.phone`, `Address.phone`, `Order.contactPhone`, `shippingAddress.phone`) lưu dạng chuẩn hóa `0xxxxxxxxx`; response trả đúng dạng đã lưu. Trường lạ trong body bị bỏ qua.

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

**Làm rõ sau khi triển khai M1 (0.2.1)**
- Variant: `salePrice` và `saleEndsAt` là `null` khi biến thể không đang sale (sale đã hết hạn hoặc chưa bắt đầu cũng trả `null`, để không lộ giá của đợt sale chưa công bố).
- `seo.title` / `seo.description` mặc định lấy `name` / `shortDesc` khi DB chưa có.
- Sản phẩm ACTIVE thuộc danh mục không active vẫn hiện ở `GET /products` (khi không lọc danh mục) và ở trang chi tiết, nhưng không tính vào `productCount` và không xuất hiện khi lọc theo danh mục cha.
- `q` rỗng hoặc chỉ có khoảng trắng -> 400 `VALIDATION_ERROR`; client không gửi `q` khi ô tìm kiếm trống.
- `inStock`: trong danh sách lấy từ cột denormalize; trong chi tiết được tính lại từ các variant.

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
Các endpoint cấp phiên trả `{ "data": { "user": {..}, "accessToken": "<jwt>", "expiresIn": 900 } }` và `Set-Cookie: bb_rt=...`. Cookie `bb_rt` có `Max-Age` 7 ngày; mỗi lần refresh cấp token mới hạn 7 ngày tính từ lúc refresh (hạn trượt). Đăng ký/đăng nhập tạo family mới.

### 5.1 `POST /auth/register` – Public (5/phút/IP)
Body: `fullName` string 2–100 (bắt buộc), `email` email <= 254 (bắt buộc), `password` (bắt buộc), `phone` string tùy chọn.
`phone` được chuẩn hóa theo §1 (sai định dạng -> 400 `VALIDATION_ERROR`).
201: phiên như trên (đăng ký xong đăng nhập luôn) và gửi email xác thực có link `/xac-thuc-email?token=...` (token hạn 24 giờ, dùng 1 lần). Email được gửi sau commit; lỗi gửi mail không làm hỏng đăng ký. Lỗi: 400 `VALIDATION_ERROR`, 409 `EMAIL_TAKEN` ("Email đã được sử dụng"), 429.

### 5.2 `POST /auth/login` – Public (5/phút/IP)
Body: `{ "email": "an@example.com", "password": "Matkhau123" }`.
200: phiên như trên. FE sau đó gọi `POST /cart/merge` nếu có cart token.
Lỗi: 400; 401 `INVALID_CREDENTIALS` (tăng `failedLoginCount`); 403 `ACCOUNT_LOCKED` (`details: { "lockedUntil": "..." }`) khi đã khóa, kể cả nhập đúng mật khẩu trong lúc khóa; 403 `ACCOUNT_DISABLED`; 429.
Quy tắc:
- **Chống dò email:** email không tồn tại và sai mật khẩu trả CÙNG 401 `INVALID_CREDENTIALS` với cùng message ("Email hoặc mật khẩu không đúng"); server vẫn chạy verify băm giả khi không có user để thời gian phản hồi tương đương.
- **Khóa tạm:** sai liên tiếp 5 lần; nếu lần sai cách lần sai trước > 15 phút thì đếm lại từ 1; lần sai thứ 5 đặt `lockedUntil = now + 15 phút` và vẫn trả 401. Mọi lần đăng nhập trong thời gian khóa trả 403 `ACCOUNT_LOCKED` (kể cả đúng mật khẩu).
- `ACCOUNT_DISABLED` chỉ trả khi mật khẩu đúng.
- Đăng nhập đúng: reset `failedLoginCount`, `lockedUntil` và cập nhật `lastLoginAt`.

### 5.3 `POST /auth/refresh` – Cookie `bb_rt` (kiểm tra Origin)
Không body. Xoay vòng refresh token. 200: `{ "data": { "user": {..}, "accessToken": "...", "expiresIn": 900 } }` + cookie mới.
Lỗi: 403 `INVALID_ORIGIN`; 401 `INVALID_REFRESH_TOKEN` (thiếu/sai/hết hạn/đã thu hồi; cookie bị xóa). Token đã thu hồi bị dùng lại, hoặc hai request dùng cùng một token đồng thời (bên thua) -> thu hồi cả family, 401. User `DISABLED` -> thu hồi family, 401 `INVALID_REFRESH_TOKEN`. FE phải gọi tuần tự (single-flight) vì token cũ bị vô hiệu ngay.

### 5.4 `POST /auth/logout` – Cookie (kiểm tra Origin)
Không body. Thu hồi token hiện tại (cả family), xóa cookie. Idempotent: luôn 204 (kể cả không có cookie), trừ 403 `INVALID_ORIGIN`.

### 5.5 `POST /auth/forgot-password` – Public (5/phút/IP)
Body: `{ "email": "an@example.com" }`. Luôn 200 (không lộ email có tồn tại):
```json
{ "data": { "message": "Nếu email tồn tại, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu." } }
```
Token hết hạn 30 phút, dùng 1 lần; link trỏ `/dat-lai-mat-khau?token=...`. Email không tồn tại hoặc tài khoản `DISABLED`: không gửi mail, vẫn 200 cùng message. Tạo token mới thì vô hiệu các token reset cũ chưa dùng. Email gửi bất đồng bộ (không chờ) để thời gian phản hồi không lộ email có tồn tại. Lỗi: 400, 429.

### 5.6 `POST /auth/reset-password` – Public (5/phút/IP)
Body: `{ "token": "...", "newPassword": "Matkhau456" }`. 200 `{ "data": { "message": "Đã đặt lại mật khẩu." } }`; đánh dấu token đã dùng và vô hiệu mọi token reset khác của user; thu hồi mọi refresh token của user, reset `failedLoginCount/lockedUntil`. Lỗi: 400 `VALIDATION_ERROR`, 400 `TOKEN_INVALID`.

### 5.7 `POST /auth/verify-email` – Public
Body: `{ "token": "..." }` (từ link email, FE trang xác thực gọi API). 200 `{ "data": { "emailVerified": true } }`. Token đã dùng nhưng email đã xác thực: vẫn 200 (idempotent). Lỗi: 400 `TOKEN_INVALID`.
Bổ sung: `POST /auth/resend-verification` – Auth, không body, 204; 409 `CONFLICT` nếu đã xác thực; gửi lại trong 60 giây -> 429 `RATE_LIMITED` + header `Retry-After` và `error.details: { "retryAfterSec": <int> }` (cùng giá trị). Tạo token mới vô hiệu token xác thực cũ chưa dùng.

### 5.8 `POST /auth/change-password` – Auth
Body: `{ "currentPassword": "...", "newPassword": "..." }` (khác mật khẩu cũ). 204; thu hồi mọi refresh token **trừ family hiện tại** (xác định bằng claim `sid` của access token). `newPassword` trùng `currentPassword` -> 400 `VALIDATION_ERROR` (field `newPassword`). Rate limit 5/phút/IP. Lỗi: 400 `VALIDATION_ERROR`, 400 `INVALID_PASSWORD`, 401, 429.

## 6. Me (hồ sơ & địa chỉ)

### 6.1 `GET /me` – Auth
200: `{ "data": { ...User } }`.

### 6.2 `PATCH /me` – Auth
Body (ít nhất 1 trường hợp lệ, nếu không -> 400): `fullName` string 2–100; `phone` string \| null (chuẩn hóa theo §1 / D-007; `null` để xóa); `birthDate` `YYYY-MM-DD` \| null (không ở tương lai, năm >= 1900); `avatarUrl` string URL http(s) <= 500 \| null. Không đổi được `email`, `role`. 200 `{ "data": User }`. Lỗi: 400, 401.

### 6.3 Địa chỉ
Kiểu:
```json
{ "id": "cka1", "fullName": "Nguyễn Văn An", "phone": "0901234567", "provinceCode": "79", "provinceName": "Thành phố Hồ Chí Minh",
  "wardCode": "26734", "wardName": "Phường Bến Nghé", "line1": "12 Lê Lợi", "isDefault": true, "createdAt": "..." }
```
Body tạo/sửa (đích cuối, khi đã có dữ liệu hành chính): `fullName` 2–100, `phone` (regex §1), `provinceCode` (mã hợp lệ trong §7), `wardCode` (phải thuộc `provinceCode`), `line1` 5–200, `isDefault` boolean tùy chọn. Server tự điền `provinceName/wardName` từ dữ liệu tĩnh.

**Tạm thời (D-008) – chưa có dữ liệu hành chính** (áp dụng cho tới khi chủ dự án cung cấp file nguồn, D-006):
- Body tạo bắt buộc thêm `provinceName` và `wardName` (2–100 ký tự, do client nhập).
- `provinceCode` khớp `^\d{2}$`, `wardCode` khớp `^\d{5}$` (chỉ là định dạng tạm, sẽ đối chiếu lại khi có file). Server CHƯA đối chiếu mã/tên với danh mục.
- PATCH: gửi `provinceCode` thì phải gửi kèm `provinceName`, `wardCode`, `wardName`; gửi `wardCode` thì phải kèm `wardName` (và ngược lại, tên đi kèm mã); thiếu -> 400 `VALIDATION_ERROR`.
- Khi có file: server tự điền tên, bỏ qua `provinceName/wardName` từ client, bật đối chiếu (mã không tồn tại hoặc phường không thuộc tỉnh -> 400).

Làm rõ: danh sách sắp theo `isDefault DESC, createdAt DESC`; `isDefault:false` gửi lên chỉ bị bỏ qua (muốn đổi mặc định thì đặt địa chỉ khác làm mặc định); địa chỉ đầu tiên luôn là mặc định; tối đa 10 địa chỉ.

| Endpoint | Mô tả | Thành công | Lỗi |
|---|---|---|---|
| `GET /me/addresses` | Danh sách, sắp `isDefault DESC, createdAt DESC` | 200 `{ data: [Address] }` | 401 |
| `POST /me/addresses` | Tạo; địa chỉ đầu tiên tự là mặc định; `isDefault:true` bỏ mặc định cũ | 201 `{ data: Address }` | 400, 401, 409 `ADDRESS_LIMIT_REACHED` |
| `PATCH /me/addresses/:id` | Sửa một phần (>= 1 trường); ràng buộc mã đi kèm tên (tạm thời) và đổi `provinceCode` kéo theo `wardCode`: xem khối D-008 ở trên | 200 `{ data: Address }` | 400, 401, 404 |
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
`items` tối đa 3 dòng đầu. Chi tiết dùng `GET /orders/:code`. Đơn guest đặt trước khi đăng ký **không** tự gắn vào tài khoản (D-005, xem §13 mục 2).

## 7. Locations

**BỊ CHẶN (D-006, D-008): chưa triển khai, chờ file nguồn của chủ dự án.**

**Public**, dữ liệu tĩnh 2 cấp, header `Cache-Control: public, max-age=86400`.
Dữ liệu chỉ nạp ở M2, từ file nguồn do chủ dự án cung cấp (D-006); developer không tự tạo dữ liệu. Chưa có file thì các endpoint này và việc validate địa chỉ (`provinceCode`/`wardCode`) chưa làm. Mã và tên trong các ví dụ dưới đây chỉ để minh họa.

### `GET /locations/provinces`
```json
{ "data": [ { "code": "01", "name": "Thành phố Hà Nội" }, { "code": "79", "name": "Thành phố Hồ Chí Minh" } ] }
```
### `GET /locations/provinces/:code/wards`
```json
{ "data": [ { "code": "26734", "name": "Phường Bến Nghé" } ] }
```
Lỗi: 404 `NOT_FOUND` nếu mã tỉnh không tồn tại. Mã/tên theo file nguồn của chủ dự án (xem §13 mục 8).

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
**Lưu ý (D-004):** `USAGE_LIMIT` và `PER_USER_LIMIT` ở giỏ/quote chỉ là kiểm tra tham khảo (đọc không khóa). Quyết định cuối và việc giữ lượt xảy ra ở `POST /orders` (§9.2); tại đó mã vẫn có thể bị từ chối với `COUPON_INVALID` dù giỏ đã báo hợp lệ.
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
**Hành vi:** trong 1 transaction: kiểm tra lại giá/tồn/mã -> tạo Order + OrderItem (snapshot) + `OrderStatusHistory` -> trừ kho (`stock >= qty`) + `InventoryMovement(ORDER_RESERVE)` -> **giữ lượt mã** (nếu có mã, D-004; xem dưới) -> xóa giỏ (và mã). COD -> `PENDING`. Online -> `PENDING_PAYMENT`, `expiresAt = now + 15 phút`; sau đó FE gọi endpoint tạo thanh toán (M5).
**Giữ lượt mã (D-004)** – chạy trong cùng transaction, sau bước trừ kho, chỉ khi đơn có mã:
- a. `UPDATE "Coupon" SET "usedCount" = "usedCount" + 1 WHERE "id" = $id AND "isActive" AND ("usageLimit" IS NULL OR "usedCount" < "usageLimit")`. Số dòng = 0 -> rollback toàn bộ (kể cả trừ kho), 409 `COUPON_INVALID` (`details.reason = USAGE_LIMIT`).
- b. Sau bước a (transaction đang giữ khóa dòng coupon nên các đơn đồng thời dùng cùng mã bị tuần tự hóa): đếm `CouponRedemption` của coupon chưa `releasedAt`, theo `userId` (user) hoặc `email` lowercase (guest). Nếu >= `perUserLimit` -> rollback, 409 `COUPON_INVALID` (`details.reason = PER_USER_LIMIT`). Thứ tự a rồi b bảo đảm `perUserLimit` không bị vượt khi đồng thời (Postgres READ COMMITTED: lệnh đếm chạy sau khi giao dịch trước commit).
- c. Tạo `CouponRedemption(couponId, orderId, userId?, email)`.

**201** `{ "data": Order }` (đơn mới). **200** `{ "data": Order }` nếu `Idempotency-Key` đã dùng với cùng nội dung (trả lại đơn cũ, không tạo thêm, không trừ kho lần nữa).
Lỗi: 400 `VALIDATION_ERROR` (gồm thiếu header key, `acceptTerms` false); 401 (guest dùng `addressId`); 404 (`addressId` lạ); 409 `CART_EMPTY`, `OUT_OF_STOCK` (rollback; `details.items[]`), `ITEM_UNAVAILABLE`, `COUPON_INVALID` (kể cả `reason` `USAGE_LIMIT`/`PER_USER_LIMIT` phát sinh ở bước giữ lượt, rollback cả trừ kho), `PRICE_CHANGED`, `IDEMPOTENCY_CONFLICT`, `PAYMENT_METHOD_UNAVAILABLE`; 429.
Lưu ý (D-005): đơn guest không có endpoint xem lại ngoài `GET /orders/track` (mã đơn + SĐT); FE lưu response vừa nhận (sessionStorage) để hiển thị trang thành công, mất thì hướng dẫn dùng trang `/tra-cuu-don-hang`.

### 9.3 `GET /orders/:code` – Auth (chỉ chủ đơn)
200 `{ "data": Order }`. Đơn không tồn tại, của người khác, hoặc đơn guest -> 404 `NOT_FOUND`. Lỗi: 401.

### 9.4 `POST /orders/:code/cancel` – Optional
Body: `{ "reason": "Đặt nhầm", "phone": "0901234567" }`. `reason` string <= 255, tùy chọn. `phone` **bắt buộc khi không đăng nhập** (chuẩn hóa theo §1 rồi so khớp `contactPhone`); đã đăng nhập thì phải là chủ đơn, `phone` bị bỏ qua.
Cho phép khi `status ∈ {PENDING_PAYMENT, PENDING, CONFIRMED}` (§11). Hoàn kho (`ORDER_RELEASE`) và hoàn lượt mã (luôn, D-004). 200 `{ "data": Order }` (status `CANCELLED`).
Lỗi: 400; 404 (không tìm thấy hoặc không phải chủ / SĐT không khớp); 409 `INVALID_STATUS_TRANSITION` (`details: { from, to: "CANCELLED", allowed: [...] }`); 429.
Đơn đã `PAID` online bị hủy: `paymentStatus` giữ `PAID` cho tới khi hoàn tiền thủ công (xử lý ở M5, xem §13).

### 9.5 `GET /orders/track` – Public (10/phút/IP)
Query: `code` (bắt buộc) và `phone` (bắt buộc; chuẩn hóa theo §1, sai định dạng -> 400 `VALIDATION_ERROR`). Chỉ trả khi `phone` khớp `contactPhone` (dạng chuẩn hóa); sai/không thấy -> 404 `NOT_FOUND` (cùng thông báo, D-005). Khai báo route này **trước** `/orders/:code`.
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
   - Điều kiện: `subtotal >= minOrder`; trong thời hạn; `isActive`; "còn lượt" và `perUserLimit` (theo `userId`, guest theo `contactEmail`) ở bước tính giá/quote/giỏ chỉ là kiểm tra tham khảo, kiểm tra cuối và giữ lượt thực hiện ở `POST /orders` (mục 4).
   - `eligible` = tổng `lineTotal` của các dòng thuộc `scope` (rỗng/null = tất cả; category bao gồm danh mục con). `eligible = 0` -> `NOT_APPLICABLE`.
   - PERCENT: `min(floor(eligible × value / 100), maxDiscount ?? ∞)`. FIXED: `min(value, eligible)`. Luôn `discountTotal <= subtotal`.
3. Phí ship:
   - Vùng: `INNER` nếu `provinceCode ∈ shipping.innerCityProvinceCodes` (mặc định `["01","79"]` = Hà Nội, TP.HCM), ngược lại `OTHER`. Đã chốt D-006: "nội thành" = toàn bộ tỉnh/thành Hà Nội và TP.HCM vì không còn cấp quận/huyện; đối chiếu mã khi có dữ liệu hành chính chính thức.
   - `baseFee`: INNER Tiêu chuẩn 20.000 / Nhanh 35.000; OTHER 35.000 / 55.000 (đọc từ Setting).
   - `weightSurcharge = 5.000 × ceil(max(0, totalWeightGram − 2000) / 1000)` (mỗi 1 kg hoặc phần lẻ vượt 2 kg). `totalWeightGram = Σ weightGram × quantity`.
   - `fee = baseFee + weightSurcharge`.
   - **Freeship ngưỡng:** nếu `subtotal − discountTotal >= 500.000` thì phương thức **STANDARD** có `shippingDiscount = fee` (miễn cả phụ phí). EXPRESS không được miễn.
   - **Mã FREESHIP:** `shippingDiscount = min(fee, maxDiscount ?? fee)` cho phương thức đang chọn (kể cả EXPRESS). Nếu đã freeship ngưỡng thì `shippingDiscount` vẫn là `fee` (không cộng dồn); mã vẫn được tính là đã dùng.
   - `payableFee = fee − shippingDiscount`.
4. `grandTotal = subtotal − discountTotal + fee − shippingDiscount = subtotal − discountTotal + payableFee`, luôn `>= 0`.

**3. Làm tròn:** chỉ PERCENT có phép chia, dùng `floor`. Không có VAT cộng thêm (giá đã gồm VAT).

**4. Mỗi đơn tối đa 1 mã; lượt dùng được giữ khi tạo đơn (D-004).**
- Giữ lượt trong transaction của `POST /orders` (sau trừ kho) theo 3 bước a, b, c ở §9.2: UPDATE có điều kiện `usedCount < usageLimit` (0 dòng -> 409 `COUPON_INVALID`/`USAGE_LIMIT`), đếm `CouponRedemption` chưa hoàn theo `userId`/`email` sau khi đã giữ khóa dòng coupon (>= `perUserLimit` -> 409 `PER_USER_LIMIT`), tạo `CouponRedemption`. Nhờ vậy `usageLimit` và `perUserLimit` không bao giờ bị vượt.
- Hoàn lượt: mọi lần đơn sang `CANCELLED` (khách hủy, staff hủy, job hết hạn `PENDING_PAYMENT` kể cả đã `paymentStatus=FAILED`, `FAILED_DELIVERY -> CANCELLED`), trong cùng transaction: `UPDATE "CouponRedemption" SET "releasedAt" = now() WHERE "orderId" = $id AND "releasedAt" IS NULL`; nếu cập nhật 1 dòng thì `usedCount − 1`. Idempotent. Đơn `RETURNED` (v2) không hoàn lượt.
- Mã FREESHIP khi đơn đã đạt freeship ngưỡng vẫn giữ lượt (mục 3).
- Chấp nhận: đơn COD bỏ lửng ở `PENDING` giữ lượt cho tới khi staff hủy.

**Ví dụ.** Giỏ 2 × 165.000 (500 g mỗi gói) = `subtotal 330.000`, mã `WELCOME10` -> `discountTotal 33.000` (10% = 33.000, trần 50.000), giao TP.HCM Tiêu chuẩn, 1 kg: `fee 20.000`, chưa đủ 500.000 sau giảm (297.000) nên không freeship -> `grandTotal = 330.000 − 33.000 + 20.000 = 317.000`.

## 11. Máy trạng thái đơn hàng

**Nguồn sự thật cho `canTransition(from, to, actor)`.** Actor: `CUSTOMER` (chủ đơn hoặc guest đã xác thực qua SĐT), `STAFF`, `ADMIN` (STAFF/ADMIN gọi chung là *Staff+*), `SYSTEM` (job, IPN/webhook). Mọi chuyển trạng thái ghi `OrderStatusHistory`, và dùng `UPDATE ... WHERE status = from` (optimistic) để an toàn khi đồng thời. Chuyển sai (kể cả cùng trạng thái) -> 409 `INVALID_STATUS_TRANSITION`.

| # | Từ | Đến | Ai | Điều kiện / tác dụng phụ |
|---|---|---|---|---|
| 0 | (tạo) | `PENDING` | SYSTEM (khi `POST /orders`, COD) | Trừ kho; giữ lượt mã (nếu có) |
| 0' | (tạo) | `PENDING_PAYMENT` | SYSTEM (online) | Trừ kho, giữ lượt mã (nếu có), `expiresAt = now + 15'` |
| 1 | `PENDING_PAYMENT` | `CONFIRMED` | SYSTEM | IPN/webhook hợp lệ (chữ ký + số tiền khớp): `paymentStatus=PAID`, `paidAt` |
| 2 | `PENDING_PAYMENT` | `CANCELLED` | SYSTEM (quá `expiresAt`), CUSTOMER, Staff+ | Hoàn kho (`ORDER_RELEASE`); hoàn lượt mã |
| 3 | `PENDING` | `CONFIRMED` | Staff+ | `confirmedAt` |
| 4 | `PENDING` | `CANCELLED` | CUSTOMER, Staff+ | Hoàn kho; hoàn lượt mã; `cancelReason` |
| 5 | `CONFIRMED` | `PROCESSING` | Staff+ | Đang đóng gói |
| 6 | `CONFIRMED` | `CANCELLED` | CUSTOMER, Staff+ | Hoàn kho; hoàn lượt mã; nếu đã `PAID` online cần hoàn tiền thủ công |
| 7 | `PROCESSING` | `SHIPPING` | Staff+ | Bắt buộc `trackingNumber` (`carrier` tùy chọn) |
| 8 | `PROCESSING` | `CANCELLED` | Staff+ (bắt buộc `note`) | Hoàn kho; hoàn lượt mã |
| 9 | `SHIPPING` | `DELIVERED` | Staff+ | `deliveredAt`; COD -> `paymentStatus=PAID`, `paidAt`; `soldCount += qty` |
| 10 | `SHIPPING` | `FAILED_DELIVERY` | Staff+ | Ghi lý do |
| 11 | `FAILED_DELIVERY` | `SHIPPING` | Staff+ | Giao lại; có thể cập nhật `trackingNumber`/`carrier` (D-002) |
| 12 | `FAILED_DELIVERY` | `CANCELLED` | Staff+ | Hoàn kho (hàng hoàn về); hoàn lượt mã |
| 13 | `DELIVERED` | `RETURN_REQUESTED` | CUSTOMER (trong 7 ngày) | **v2** – chưa triển khai |
| 14 | `RETURN_REQUESTED` | `RETURNED` | Staff+ | **v2**; `soldCount -= qty`, hoàn kho nếu hàng nhập lại |
| 15 | `RETURN_REQUESTED` | `DELIVERED` | Staff+ | **v2** – từ chối đổi trả |

Mọi chuyển sang `CANCELLED`: hoàn kho + hoàn lượt mã trong cùng transaction.

Trạng thái cuối: `CANCELLED`, `RETURNED`. Khách chỉ được hủy ở #2, #4, #6 (`canCancel`); sau `PROCESSING` khách không hủy được. `paymentStatus` tách riêng (D-001): `UNPAID -> PAID` (IPN hoặc COD giao xong), `UNPAID -> FAILED` (cổng báo lỗi; đơn vẫn `PENDING_PAYMENT` cho tới `expiresAt` để thử lại, quá hạn job mới hủy), `FAILED -> PAID` (thử lại thành công, đơn -> `CONFIRMED`), `PAID -> REFUNDED` (admin/hệ thống ở M5).

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
| Thanh toán | `POST /payments/vnpay/create` | Tạo URL thanh toán VNPay cho đơn `PENDING_PAYMENT` | O (chủ đơn / guest + SĐT) | M5 |
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

1. **Đã chốt – xem decisions.md D-005.** Guest xem đơn qua `/tra-cuu-don-hang` (`GET /orders/track`, mã đơn + SĐT chuẩn hóa), không `viewToken`. Trang `/dat-hang-thanh-cong/[code]` của guest dựa vào response `POST /orders` (sessionStorage); mất thì hướng dẫn dùng tra cứu.
2. **Đã chốt – xem decisions.md D-005.** Đơn guest không tự gắn vào tài khoản khi đăng ký/đăng nhập sau.
3. **Đã chốt – xem decisions.md D-001.** Thanh toán thất bại: giữ `PENDING_PAYMENT` + `paymentStatus=FAILED`, thử lại tới `expiresAt`, quá hạn job mới hủy.
4. **Đã chốt – xem decisions.md D-002.** Có chuyển `FAILED_DELIVERY -> SHIPPING` (giao lại, Staff+).
5. **Đã chốt – xem decisions.md D-002.** Khách được hủy đơn `PENDING_PAYMENT`. (Còn mở: hoàn tiền đơn online đã `PAID` bị hủy chưa có luồng tự động, thủ công ở M5.)
6. **Đã chốt – xem decisions.md D-004.** Giữ lượt mã ngay khi tạo đơn bằng UPDATE có điều kiện; hoàn lượt khi `CANCELLED`; không vượt `usageLimit`/`perUserLimit`.
7. **Đã chốt – xem decisions.md D-003.** Phụ phí `5.000 × ceil(max(0, g − 2000) / 1000)`; freeship Tiêu chuẩn miễn cả phụ phí, Nhanh không.
8. **Đã chốt – xem decisions.md D-006.** Nội thành = toàn bộ Hà Nội (`01`) + TP.HCM (`79`); dữ liệu tỉnh/phường do chủ dự án cung cấp, nạp ở M2; mã/tên trong ví dụ chỉ minh họa.
9. **Không có `facets` (đếm theo bộ lọc)** trong `GET /products`; FE lấy thương hiệu từ `/brands`, các giá trị enum cố định. Thêm `GET /products/filters` nếu UI cần số đếm.
10. **Concurrent refresh:** không có grace window; FE bắt buộc single-flight trong tab và khóa giữa các tab bằng Web Locks API (`architecture.md` §4). Hai request đồng thời cùng token thì bên thua bị thu hồi cả family (§5.3). Nếu vẫn gây đăng xuất ngoài ý muốn, cân nhắc grace 10 giây cho token vừa xoay.
11. **Đã chốt ở M2:** đã thêm trang FE xác thực email `/xac-thuc-email` vào sitemap (requirements §9). Đăng nhập Google, loyalty, subscription, blog, đổi/trả: v2, ngoài contract này.
12. **`GET /health`** nằm dưới `/api/v1` theo chỉ đạo; Docker healthcheck gọi `/api/v1/health` trực tiếp ở cổng 4000.
