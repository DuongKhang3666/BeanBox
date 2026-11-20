# BeanBox – API Contract

> Phiên bản 0.16 · 2026-11-20 · **Nguồn sự thật cho FE và BE.** Đổi contract phải sửa file này trước và nêu trong báo cáo.
> Thay đổi 0.16 (D-052, phân tích kinh doanh Bước 3): §16.3 thành đặc tả đầy đủ cho `GET /admin/analytics/customers?from&to`, `GET /admin/analytics/operations?from&to`, `GET /admin/analytics/inventory?slowDays` (chỉ ADMIN, no-store; hai endpoint đầu dùng cùng khoảng ngày và kỳ trước với §16.1, endpoint tồn kho là ảnh chụp hiện tại); phần "dự kiến" Bước 4 dời sang §16.4. Không đổi §14.3, §16.1, §16.2 hay shape hiện có; không cần migration (đã kiểm `EXPLAIN`, chưa thêm index).
> Thay đổi 0.15 (D-051, phân tích kinh doanh Bước 2): §16.2 thành đặc tả đầy đủ cho `GET /admin/analytics/breakdown?dimension&from&to`, `GET /admin/analytics/top-products?from&to&sort&limit`, `GET /admin/analytics/top-customers?from&to&sort&limit` (chỉ ADMIN, no-store, cùng khoảng ngày và kỳ trước với §16.1); §16.3 ghi dự kiến Bước 3-4. Không đổi §14.3, §16.1 hay shape hiện có; không cần migration.
> Thay đổi 0.14 (D-049, D-050, phân tích kinh doanh): thêm §16 "Phân tích kinh doanh (Admin)": `GET /admin/analytics/overview?from&to&granularity` (§16.1, chỉ ADMIN, KPI so với kỳ trước + chuỗi theo ngày/tuần/tháng); §16.2 ghi dự kiến các endpoint Bước 2-4 (Bước 2 đã triển khai ở 0.15). Không đổi §14.3 hay shape hiện có; cần migration index (`Order(paidAt)`, `Payment(refundedAt)`, không đổi cột).
> Thay đổi 0.13 (D-047, so sánh sản phẩm): thêm `GET /products/compare?slugs=a,b,c` (§4.7, công khai, 2–4 slug, trả `items` + `missing`); slug sản phẩm `compare` được dành riêng (admin tạo/đổi slug bị từ chối 400, §12.4); `/products/compare` thuộc nhóm GET công khai không bị ép `no-store` (§1). Không đổi shape response hiện có, không cần migration.
> Thay đổi 0.12 (D-046, gợi ý sản phẩm): `related` ở §4.4 chấm điểm theo nội dung (cùng danh mục, danh mục cha, brand, tag, thuộc tính cà phê, khoảng giá), không đổi shape; thêm `GET /products/:slug/bought-together` (§4.6, công khai, có ngưỡng riêng tư >= 2 khách). Không cần migration.
> Thay đổi 0.11 (D-045, rà soát bảo mật): mọi response `/api/v1` mặc định có `Cache-Control: no-store`, trừ GET công khai (§1 "Cache"); access token mất hiệu lực ngay khi phiên bị thu hồi (§1, §5.4, §5.6, đổi mật khẩu); biến `AUTH_RATE_LIMIT_PER_MIN` cho nhóm nhạy cảm (§1). Không đổi shape response.
> Thay đổi 0.10 (M8): §14.12 đổi từ CSP report-only sang CSP thực thi (storefront không nonce; admin nonce + strict-dynamic), bỏ header `Content-Security-Policy-Report-Only`.
> Thay đổi 0.9 (M7, D-025..D-034): thêm `GET /health/live` (liveness) và ghi rõ `GET /health` là readiness (§3, §15 mục 12); captcha tùy chọn cho form liên hệ: `contactCaptcha` ở `GET /settings/public` (§14.9), trường `captchaToken` và mã lỗi `400 CAPTCHA_FAILED` (§2, §14.11; `503 SERVICE_UNAVAILABLE` khi gọi Turnstile lỗi); job tự xóa tin liên hệ `RESOLVED`/`SPAM` theo `CONTACT_RETENTION_DAYS` (§14.11, §15 mục 15, D-029); CSP thêm header thực thi tập con và Turnstile ở report-only (§14.12, D-032). Rate limit ở edge (Caddy, D-026) không đổi shape API; lỗi do edge sinh ra ở `/api/v1/*` (429, 413, 502-504) trả JSON theo format lỗi §1 (xem phần Rate limit ở §1). Không cần migration.
> Thay đổi 0.8: chi tiết hóa M6b (D-021..D-024): thay "14.9 Hoãn sau M6" bằng 14.9 Cài đặt cửa hàng (`GET/PUT /admin/settings`, `GET /settings/public`), 14.10 Quản lý người dùng (`/admin/users`), 14.11 Liên hệ (`POST /contact`, `/admin/contact-messages`), 14.12 CSP report-only (`POST /csp-report`); newsletter còn hoãn (14.13). Thêm mã lỗi `CANNOT_MODIFY_SELF`, `LAST_ADMIN` (§2); thêm action audit `settings.update`, `user.status`, `user.role`, `contact.update` (§12.0). Chốt thêm: settings chỉ Admin, ràng buộc ghi chặt/đọc nới, `innerCityWardCount` ở `/settings/public`, banner chỉ ảnh `/uploads/` và `href` nội bộ; khóa dòng + kiểm lại người thao tác ở quản lý người dùng; làm rõ liên hệ và `POST /csp-report`; thêm §15 mục 15–16. Cần migration `m6b_contact_message` (`db-schema.md`).
> Thay đổi 0.7.1: ghi nhận khi triển khai M6: `Review` có thêm unique `(userId, productId)` (chống tạo trùng khi gửi đồng thời; trùng -> 409 `REVIEW_NOT_ALLOWED` `ALREADY_REVIEWED`); `requirements.md` đổi `POST /products/:id/reviews` thành `:slug`, FR-REV-01 bỏ ảnh ở M6 và FR-REV-02 thành 1 đánh giá/người dùng/sản phẩm; Enter ở ô tìm kiếm tới `/tim-kiem?q=` (§14.8). Không đổi shape API.
> Thay đổi 0.7: chi tiết hóa M6 (D-017..D-020): §14 đổi thành "Hoàn thiện v1 (M6)" gồm đánh giá (14.1; `POST` dùng `:slug` thay vì `:productId`, `PUT|DELETE /admin/reviews/:id/reply` thay cho `POST .../reply`), wishlist (14.2), dashboard (14.3), audit log (14.4), redirect slug + `GET /categories/:slug` (14.5), khôi phục sản phẩm (14.6), hủy đơn và Payment Stripe (14.7), gợi ý tìm kiếm ở FE (14.8); Settings, Users, Nội dung (contact/newsletter) chuyển vào 14.9 "Hoãn sau M6" (dự kiến M6b). Thêm mã lỗi `REVIEW_NOT_ALLOWED`, `REVIEW_EDIT_EXPIRED`, `WISHLIST_LIMIT` (§2); §4.4 ghi chú slug cũ -> 404 + `details.movedTo`. Cần migration `m6_slug_redirect` (`db-schema.md`). Câu hỏi mở §15 mục 14 đã chốt.
> Thay đổi 0.6.1: triển khai Stripe (§13.2, §13.4), hoàn tiền, email: `TrackedOrder.expiresAt` (§9.5); `AdminOrderListItem.needsRefund` (§12.1); `POST /admin/orders/:code/refunds` chỉ Admin (§13.7, trước đó ghi Staff); `expires_at` của phiên Stripe = now + 31 phút (đệm 60 giây so với mức tối thiểu 30 phút của Stripe, §13.2); sync Stripe chỉ hỏi Stripe với session id do hệ thống tạo (§13.4).
> Thay đổi 0.6: chi tiết hóa M5 (D-014, D-015, D-016): thêm §13 Thanh toán online (VNPay, Stripe), mã giảm giá admin, hoàn tiền thủ công, job hết hạn, email đổi trạng thái; `canPay` ở Order/TrackedOrder (§9); `payments[]`/`needsRefund` ở AdminOrder (§12.1); mã lỗi `PAYMENT_NOT_ALLOWED`, `PAYMENT_SIGNATURE_INVALID`, `COUPON_CODE_TAKEN` (§2); rate limit đặt đơn/áp mã/quote cấu hình qua env (§1). Phần M6 chuyển thành §14, câu hỏi mở thành §15 (đã đánh số lại các tham chiếu). Cần migration `m5_payment_refund` (`db-schema.md`).
> Thay đổi 0.5.1: làm rõ sau khi triển khai M4 (không đổi shape chính), xem cuối §12.
> Thay đổi 0.5: chi tiết hóa M4 Admin cơ bản (D-013): thêm §12 Admin (đơn hàng, tồn kho, danh mục/thương hiệu, sản phẩm/biến thể/ảnh, upload, audit log); bỏ endpoint `/admin/orders/:id/print` (phiếu giao là trang FE); định danh đơn admin bằng `code`; thêm mã lỗi `SLUG_TAKEN`, `SKU_TAKEN`, `PAYLOAD_TOO_LARGE` (§2); bảng M5–M6 chuyển thành §13, câu hỏi mở thành §14 (đã đánh số lại các tham chiếu).
> Thay đổi 0.4.1: rate limit riêng cho `POST /cart/apply-coupon` (10/phút), `POST /checkout/quote` (30/phút), `POST /orders` (10/phút) (D-011); `coupon.minOrder` trong Cart/quote khi `invalidReason = MIN_ORDER`; thêm 429 vào §8.7 và §9.1.
> Thay đổi 0.4: chi tiết hóa M3 Cart/Checkout/Orders (D-010): thêm `wardCode` cho quote và setting `shipping.innerCityWardCodes` (§9.1, §10 mục 3), `details` của `PRICE_CHANGED`/`OUT_OF_STOCK`/`ITEM_UNAVAILABLE`, idempotency gắn người gọi, quy tắc hủy đơn guest, `canCancel`/`cancelReason` ở tra cứu, CORS expose `X-Cart-Token`, phạm vi mã giảm giá, email xác nhận đơn, response hủy đơn guest là `TrackedOrder` (không lộ PII); `GET /me/orders`: `itemCount` = tổng `quantity` của mọi dòng (§6.4).
> Thay đổi 0.2: áp dụng D-001..D-007 ([`decisions.md`](decisions.md)): giữ lượt mã khi tạo đơn, tra cứu/hủy đơn guest bằng SĐT chuẩn hóa, chuẩn hóa SĐT, chốt các mục §15.1–8.
> Thay đổi 0.2.1: làm rõ §4 sau khi triển khai M1 (không đổi shape).
> Thay đổi 0.3: chi tiết hóa M2 Auth & Tài khoản, D-008, D-009.
> Thay đổi 0.3.1: nạp danh mục hành chính thật (D-006), đóng D-008: triển khai §7 Locations, đối chiếu mã tỉnh/phường khi tạo/sửa địa chỉ (§6.3), thay mã/tên ví dụ bằng mã thật (79/26740 "Phường Sài Gòn").
> Base URL: `/api/v1` (trình duyệt: same-origin qua Next rewrites; backend: `http://localhost:4000/api/v1`).
> Chi tiết đầy đủ cho M1–M6b; chỉ còn hoãn newsletter (§14.13).

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
12. [Admin (M4)](#12-admin-m4)
13. [Thanh toán online, mã giảm giá admin, hoàn tiền (M5)](#13-thanh-toán-online-mã-giảm-giá-admin-hoàn-tiền-m5)
14. [Hoàn thiện v1 (M6, M6b)](#14-hoàn-thiện-v1-m6-m6b)
    - 14.9 Cài đặt cửa hàng · 14.10 Quản lý người dùng · 14.11 Liên hệ · 14.12 CSP · 14.13 Còn hoãn
15. [Câu hỏi mở / Giả định](#15-câu-hỏi-mở--giả-định)
16. [Phân tích kinh doanh (Admin)](#16-phân-tích-kinh-doanh-admin)
    - 16.1 Tổng quan · 16.2 Cơ cấu doanh thu, top sản phẩm, top khách hàng · 16.3 Khách hàng, vận hành, tồn kho · 16.4 Dự kiến

## 1. Quy ước chung

**Định dạng.** JSON UTF-8 (`Content-Type: application/json`). Tên trường camelCase. ID là chuỗi cuid. Tiền là **số nguyên VND** (không float, không chuỗi). Thời gian ISO 8601 UTC (`2026-11-10T08:30:00.000Z`); ngày thuần `YYYY-MM-DD`. Trường tùy chọn không có giá trị trả `null` (không bỏ trường), trừ khi ghi chú khác. Mọi response `/api/v1/*` có header `X-Request-Id`.

**Phản hồi thành công**

```json
{ "data": {} }
```

Danh sách có phân trang:

```json
{
  "data": [],
  "meta": { "page": 1, "pageSize": 20, "total": 134, "totalPages": 7 }
}
```

Phân trang: query `page` (>= 1, mặc định 1), `pageSize` (1–100, mặc định 20). Giá trị ngoài khoảng -> 400 `VALIDATION_ERROR`. `page` vượt tổng trả `data: []`. Ngoại lệ không phân trang (tập nhỏ, cố định): `GET /categories`, `GET /brands`, `GET /me/addresses`, `GET /locations/*`.

**Phản hồi lỗi** (message tiếng Việt, hiển thị được cho người dùng)

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Dữ liệu không hợp lệ",
    "details": [{ "field": "email", "message": "Email không đúng định dạng" }]
  }
}
```

`details` tùy lỗi (mảng lỗi field cho `VALIDATION_ERROR`, object ngữ cảnh cho lỗi nghiệp vụ). Không lộ stack trace.

**Xác thực**

- `Authorization: Bearer <accessToken>` (JWT HS256, 15 phút; claims `sub`, `role`, `sid` (= `familyId` của phiên refresh), `iat`, `exp`, `iss`, `aud`). Thiếu/hết hạn/sai -> 401 `UNAUTHORIZED` (FE gọi refresh rồi thử lại). Từ 0.11 access token còn gắn với phiên: server kiểm còn ít nhất một refresh token chưa thu hồi, chưa hết hạn thuộc đúng `sid` của user đó; không còn (đã logout, đặt lại/đổi mật khẩu, dùng lại refresh token bị phát hiện, admin đổi role/khóa user thu hồi phiên) -> 401 `UNAUTHORIZED` ngay, không chờ hết 15 phút. User bị khóa vẫn trả 403 `ACCOUNT_DISABLED` (kiểm trước phiên). Refresh thành công (xoay token cùng family) không làm mất hiệu lực access token đang dùng.
- Với endpoint **Auth/Optional**: nếu CÓ header `Authorization` mà token sai/hết hạn -> 401 `UNAUTHORIZED` (không âm thầm coi là guest).
- User không còn tồn tại -> 401 `UNAUTHORIZED`; user `DISABLED` -> 403 `ACCOUNT_DISABLED`. `role` luôn đọc lại từ DB mỗi request đã xác thực (không tin claim).
- Refresh token ở cookie `bb_rt` (httpOnly, SameSite=Strict, Path=/api/v1/auth), FE không đọc được.
- Ký hiệu quyền: **Public** (không cần), **Optional** (có token thì là user, không thì guest; kèm `X-Cart-Token` nếu có), **Auth** (mọi user đăng nhập), **Staff** (STAFF hoặc ADMIN), **Admin** (chỉ ADMIN).

**Giỏ khách vãng lai.** Header `X-Cart-Token: <token>`. Server cấp token khi guest tạo giỏ lần đầu (xem §8). Có Bearer thì dùng giỏ của user và bỏ qua `X-Cart-Token` (trừ `POST /cart/merge`).

**Idempotency.** `POST /orders` bắt buộc `Idempotency-Key: <UUID v4>` (chỉ chấp nhận UUID v4, so khớp không phân biệt hoa thường, lưu lowercase). Thiếu/sai định dạng -> 400 `VALIDATION_ERROR` (`details[0].field = "Idempotency-Key"`). Quy tắc `requestFingerprint` và replay: xem §9.2.

**Rate limit.** Chung 100 req/phút/IP (mặc định; chỉnh được bằng env `GENERAL_RATE_LIMIT_PER_MIN`, số nguyên dương; E2E/CI đặt 1000, production giữ mặc định). Nhóm nhạy cảm 5 req/phút/IP (chỉnh được bằng env `AUTH_RATE_LIMIT_PER_MIN`, số nguyên dương, mặc định 5; E2E/CI đặt 30, production giữ 5): `POST /auth/login`, `/auth/register`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/change-password`, `POST /orders/:code/cancel` (guest), `GET /orders/track` (10/phút). Ba limiter riêng cho mã giảm giá và đặt đơn (D-011): `POST /cart/apply-coupon` 10/phút, `POST /checkout/quote` 30/phút, `POST /orders` 10/phút (từ 0.6 cấu hình được qua env `COUPON_RATE_LIMIT_PER_MIN`, `QUOTE_RATE_LIMIT_PER_MIN`, `ORDER_RATE_LIMIT_PER_MIN`, mặc định giữ nguyên, D-016); endpoint thanh toán có limiter riêng (§13); mỗi limiter có store riêng, theo IP, kể cả request có Bearer (và không miễn `X-Internal-Secret`), đặt trước bước xác thực. Vượt -> 429 `RATE_LIMITED` + header `Retry-After` (giây) và `error.details: { "retryAfterSec": <int> }` (cùng giá trị với header). Response có `RateLimit-Limit/Remaining/Reset`. IP client xác định theo `TRUST_PROXY` (D-009); request SSR nội bộ có `X-Internal-Secret` hợp lệ được miễn rate limit chung, không miễn nhóm nhạy cảm (xem `architecture.md` §3).

**Cache.** Mọi response dưới `/api/v1` mặc định có `Cache-Control: no-store` (kể cả lỗi 4xx/5xx), để dữ liệu riêng tư (`/auth/*`, `/me*`, `/cart*`, `/checkout/*`, `/orders*`, `/payments/*`, `/contact`, `/admin/*`, `GET /products/:slug/reviews/me`, wishlist...) không bị cache trung gian/trình duyệt. Ngoại lệ: các GET/HEAD công khai không phụ thuộc người dùng không bị ép header: `/categories`, `/categories/:slug`, `/brands`, `/products`, `/products/:slug`, `GET /products/compare`, `GET /products/:slug/reviews` (danh sách công khai), `/search/suggest`, `/locations/*`, `/settings/public`, `/health*`; các route này tự quyết `Cache-Control` (ví dụ `public, max-age=300` ở `/settings/public`), và Next.js ISR của storefront dựa vào đó. `/uploads` (ảnh tĩnh) không thuộc nhóm này (`max-age` 1 giờ).

Ở production có thêm rate limit ở edge (Caddy, D-026) theo IP, độc lập với các limiter trên (mặc định `POST /auth/*` 30/phút, `/api/v1/*` 300/phút). Lỗi do chính edge sinh ra ở `/api/v1/*` cũng theo format lỗi ở trên: 429 `RATE_LIMITED` (giữ `Retry-After`), 413 `PAYLOAD_TOO_LARGE` ở `/api/v1/admin/uploads*` và `VALIDATION_ERROR` ở các path khác khi thân request quá lớn, 502/503/504 `SERVICE_UNAVAILABLE` khi backend không phản hồi. Chi tiết: `deployment.md`.

**CORS / CSRF.** CORS chỉ cho origin trong `FRONTEND_ORIGINS`, `credentials: true`; header `X-Cart-Token` được expose qua `Access-Control-Expose-Headers` (FE đọc được token mới cấp). `POST /auth/refresh` và `POST /auth/logout` dùng cookie nên bắt buộc header `Origin` khớp CHÍNH XÁC một giá trị trong `FRONTEND_ORIGINS`; thiếu hoặc `null` -> 403 `INVALID_ORIGIN`.

**Chuẩn hóa input.** Chuỗi được `trim`; email lowercase; SĐT được chuẩn hóa (D-007): bỏ khoảng trắng, dấu chấm, gạch ngang; `+84` đầu -> `0`; sau đó phải khớp `^0(3|5|7|8|9)\d{8}$`, sai -> 400 `VALIDATION_ERROR`. Mọi nơi lưu SĐT (`User.phone`, `Address.phone`, `Order.contactPhone`, `shippingAddress.phone`) lưu dạng chuẩn hóa `0xxxxxxxxx`; response trả đúng dạng đã lưu. Trường lạ trong body bị bỏ qua.

**Phân quyền theo tài nguyên (chống IDOR).** Tài nguyên của người khác (đơn hàng, địa chỉ, giỏ, dòng giỏ) luôn trả **404 `NOT_FOUND`**, không bao giờ 403, để không lộ sự tồn tại. 403 chỉ dùng khi thiếu vai trò ở endpoint admin hoặc tài khoản bị khóa. `GET /orders/:code` chỉ cho chủ đơn (kể cả STAFF/ADMIN cũng nhận 404, họ dùng `/admin/orders`).

## 2. Bảng mã lỗi

| HTTP | `code`                       | Ý nghĩa                                                                                                                                                                                      |
| ---- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400  | `VALIDATION_ERROR`           | Input sai (kèm `details[]`)                                                                                                                                                                  |
| 400  | `TOKEN_INVALID`              | Token reset/verify sai, hết hạn hoặc đã dùng                                                                                                                                                 |
| 400  | `INVALID_PASSWORD`           | Mật khẩu hiện tại không đúng (đổi mật khẩu)                                                                                                                                                  |
| 400  | `PAYMENT_SIGNATURE_INVALID`  | Chữ ký VNPay return / Stripe webhook sai hoặc quá hạn (§13.3, §13.4)                                                                                                                         |
| 400  | `CAPTCHA_FAILED`             | Captcha form liên hệ thiếu hoặc không hợp lệ (§14.11, D-028)                                                                                                                                 |
| 401  | `UNAUTHORIZED`               | Thiếu/hết hạn/sai access token                                                                                                                                                               |
| 401  | `INVALID_CREDENTIALS`        | Sai email hoặc mật khẩu (thông báo chung, không nói cái nào sai)                                                                                                                             |
| 401  | `INVALID_REFRESH_TOKEN`      | Refresh token thiếu/sai/hết hạn/đã thu hồi (kể cả phát hiện reuse); cookie bị xóa                                                                                                            |
| 403  | `FORBIDDEN`                  | Không đủ quyền (endpoint admin)                                                                                                                                                              |
| 403  | `ACCOUNT_LOCKED`             | Khóa tạm do sai mật khẩu nhiều lần; `details.lockedUntil`                                                                                                                                    |
| 403  | `ACCOUNT_DISABLED`           | Tài khoản bị admin khóa                                                                                                                                                                      |
| 403  | `INVALID_ORIGIN`             | Origin không thuộc whitelist (endpoint dùng cookie)                                                                                                                                          |
| 404  | `NOT_FOUND`                  | Không tồn tại hoặc không thuộc quyền truy cập                                                                                                                                                |
| 409  | `CONFLICT`                   | Xung đột chung: trạng thái đơn đã đổi (admin), tồn kho không đủ để giảm, xóa danh mục/thương hiệu còn tham chiếu, vượt giới hạn ảnh, ngừng bán biến thể cuối cùng của sản phẩm đang hiển thị |
| 409  | `SLUG_TAKEN`                 | Slug danh mục/thương hiệu/sản phẩm đã tồn tại; `details.field = "slug"`                                                                                                                      |
| 409  | `SKU_TAKEN`                  | SKU biến thể đã tồn tại (kể cả biến thể đã xóa mềm); `details.field = "sku"`                                                                                                                 |
| 409  | `EMAIL_TAKEN`                | Email đã được sử dụng                                                                                                                                                                        |
| 409  | `OUT_OF_STOCK`               | Không đủ tồn kho; `details.items[]` `{variantId, requested, available}`                                                                                                                      |
| 409  | `QUANTITY_LIMIT_EXCEEDED`    | Quá 20 sản phẩm/dòng                                                                                                                                                                         |
| 409  | `ITEM_UNAVAILABLE`           | Biến thể/sản phẩm ngừng bán hoặc không tồn tại                                                                                                                                               |
| 409  | `CART_EMPTY`                 | Giỏ trống khi checkout                                                                                                                                                                       |
| 409  | `COUPON_INVALID`             | Mã không hợp lệ; `details.reason` (xem §8.7)                                                                                                                                                 |
| 409  | `PRICE_CHANGED`              | Giá tổng khác `expectedTotal` client gửi; `details.expectedTotal/grandTotal/quote` (§9.2)                                                                                                    |
| 409  | `IDEMPOTENCY_CONFLICT`       | Cùng `Idempotency-Key` nhưng nội dung hoặc người gọi khác                                                                                                                                    |
| 409  | `INVALID_STATUS_TRANSITION`  | Chuyển trạng thái đơn không hợp lệ; `details.from/to/allowed`                                                                                                                                |
| 409  | `ADDRESS_LIMIT_REACHED`      | Quá 10 địa chỉ                                                                                                                                                                               |
| 409  | `PAYMENT_METHOD_UNAVAILABLE` | Phương thức thanh toán chưa bật (VNPay/Stripe thiếu cấu hình env, §13.0)                                                                                                                     |
| 409  | `PAYMENT_NOT_ALLOWED`        | Không tạo được phiên thanh toán cho đơn; `details.reason` = `STATUS` \| `METHOD_MISMATCH` \| `EXPIRED` \| `UNAVAILABLE` (§13.2)                                                              |
| 409  | `COUPON_CODE_TAKEN`          | Mã giảm giá đã tồn tại (admin tạo mã, §13.8); `details.field = "code"`                                                                                                                       |
| 409  | `REVIEW_NOT_ALLOWED`         | Không được viết đánh giá; `details.reason` = `NOT_PURCHASED` \| `ALREADY_REVIEWED` (§14.1)                                                                                                   |
| 409  | `REVIEW_EDIT_EXPIRED`        | Quá 30 ngày kể từ lúc tạo, không sửa được đánh giá (§14.1)                                                                                                                                   |
| 409  | `WISHLIST_LIMIT`             | Danh sách yêu thích đã đủ 100 sản phẩm (§14.2)                                                                                                                                               |
| 409  | `CANNOT_MODIFY_SELF`         | Admin không được khóa hoặc đổi vai trò của chính mình (§14.10)                                                                                                                               |
| 409  | `LAST_ADMIN`                 | Thao tác sẽ làm hệ thống không còn ADMIN `ACTIVE` nào (§14.10)                                                                                                                               |
| 413  | `PAYLOAD_TOO_LARGE`          | Body vượt giới hạn (upload ảnh > 5 MB)                                                                                                                                                       |
| 429  | `RATE_LIMITED`               | Vượt giới hạn tần suất                                                                                                                                                                       |
| 500  | `INTERNAL_ERROR`             | Lỗi hệ thống                                                                                                                                                                                 |
| 503  | `SERVICE_UNAVAILABLE`        | DB/dịch vụ phụ thuộc không sẵn sàng                                                                                                                                                          |

## 3. Health

### `GET /health` – Public (readiness)

200:

```json
{
  "data": {
    "status": "ok",
    "db": "up",
    "version": "0.1.0",
    "uptimeSec": 1234,
    "time": "2026-11-10T08:30:00.000Z"
  }
}
```

503 `SERVICE_UNAVAILABLE` khi không truy vấn được DB (`SELECT 1`). Không yêu cầu auth, không rate limit chung (dùng cho healthcheck Docker).

### `GET /health/live` – Public (liveness)

200 `{ "data": { "status": "ok" } }`. Không chạm DB nên luôn 200 khi tiến trình còn sống. Không yêu cầu auth, không rate limit chung, không log truy cập (D-030).

## 4. Catalog

Tất cả **Public**; chỉ trả sản phẩm `status=ACTIVE` và `deletedAt IS NULL`.

**Kiểu dùng chung**

```jsonc
// ProductListItem
{
  "id": "ckp1",
  "slug": "ethiopia-yirgacheffe-washed",
  "name": "Ethiopia Yirgacheffe Washed",
  "shortDesc": "Hương hoa và cam chanh, hậu vị sạch.",
  "brand": {
    "id": "ckb1",
    "name": "BeanBox Roastery",
    "slug": "beanbox-roastery",
  }, // hoặc null
  "category": { "id": "ckc1", "name": "Specialty", "slug": "specialty" },
  "primaryImage": {
    "url": "/uploads/seed/ethiopia.jpg",
    "alt": "Túi cà phê Ethiopia",
  }, // hoặc null
  "minPrice": 185000, // giá hiệu lực thấp nhất (tính lại lúc đọc từ variant)
  "compareAtPrice": 210000, // giá niêm yết của variant đạt minPrice nếu đang sale, ngược lại null
  "inStock": true,
  "isFeatured": true,
  "ratingAvg": 4.6,
  "ratingCount": 18,
  "coffee": {
    "originCountry": "Ethiopia",
    "roastLevel": "LIGHT",
    "process": "WASHED",
  }, // null nếu không phải cà phê hạt
}
```

```jsonc
// Variant (trong chi tiết sản phẩm)
{
  "id": "ckv1",
  "sku": "ETH-250-WB",
  "name": "250 g - Nguyên hạt",
  "attributes": { "weight": "250g", "grind": "Nguyên hạt" },
  "price": 210000,
  "salePrice": 185000,
  "effectivePrice": 185000,
  "isOnSale": true,
  "saleEndsAt": "2026-11-30T16:59:59.000Z",
  "stockStatus": "IN_STOCK", // IN_STOCK | LOW_STOCK (stock <= lowStockThreshold) | OUT_OF_STOCK
  "maxQuantity": 20, // min(stock, 20)
  "weightGram": 250,
  "roastDate": "2026-11-01",
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
{
  "data": [
    {
      "id": "ckc0",
      "name": "Cà phê hạt",
      "slug": "ca-phe-hat",
      "imageUrl": null,
      "productCount": 15,
      "children": [
        {
          "id": "ckc1",
          "name": "Specialty",
          "slug": "specialty",
          "imageUrl": null,
          "productCount": 5
        }
      ]
    }
  ]
}
```

### 4.2 `GET /brands`

```json
{
  "data": [
    {
      "id": "ckb1",
      "name": "Hario",
      "slug": "hario",
      "logoUrl": null,
      "productCount": 4
    }
  ]
}
```

### 4.3 `GET /products`

Query (tất cả tùy chọn). Nhiều giá trị cách nhau dấu phẩy = OR trong cùng trường; các trường khác nhau = AND.

| Param                  | Kiểu / ràng buộc                                                                              | Ý nghĩa                                                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `q`                    | string 1–100                                                                                  | Tìm không dấu, không phân biệt hoa thường; tách token, mọi token phải khớp (tên, tag, mô tả ngắn)                             |
| `category`             | slug                                                                                          | Danh mục; slug cha bao gồm mọi danh mục con. Không tồn tại -> `data: []`                                                      |
| `brand`                | slug[]                                                                                        | Thương hiệu                                                                                                                   |
| `minPrice`, `maxPrice` | int >= 0; `minPrice <= maxPrice`                                                              | Lọc theo `minPrice` của sản phẩm (xem hạn chế flash sale ở `architecture.md` §6)                                              |
| `inStock`              | `true`                                                                                        | Chỉ sản phẩm còn hàng                                                                                                         |
| `origin`               | string[]                                                                                      | `originCountry` (khớp chính xác, không phân biệt hoa thường)                                                                  |
| `roast`                | enum[] `LIGHT,MEDIUM,MEDIUM_DARK,DARK`                                                        | Mức rang                                                                                                                      |
| `process`              | enum[] `WASHED,NATURAL,HONEY,ANAEROBIC,OTHER`                                                 | Sơ chế                                                                                                                        |
| `brew`                 | enum[] `PHIN,ESPRESSO,POUR_OVER,COLD_BREW,FRENCH_PRESS,AEROPRESS,MOKA`                        | Phù hợp cách pha (sản phẩm có ít nhất 1 giá trị trong danh sách)                                                              |
| `featured`             | `true`                                                                                        | Chỉ sản phẩm nổi bật                                                                                                          |
| `sort`                 | `newest` (mặc định) \| `price_asc` \| `price_desc` \| `bestseller` \| `rating` \| `relevance` | `relevance` chỉ hợp lệ khi có `q` (mặc định là `relevance` nếu có `q` mà không gửi `sort`). Đồng hạng -> `createdAt DESC, id` |
| `page`, `pageSize`     | như §1                                                                                        | Gợi ý FE: 12–24                                                                                                               |

Giá trị enum sai -> 400 `VALIDATION_ERROR`.

200:

```json
{
  "data": [{ "...": "ProductListItem" }],
  "meta": { "page": 1, "pageSize": 20, "total": 3, "totalPages": 1 }
}
```

Ví dụ: `GET /products?category=ca-phe-hat&roast=LIGHT,MEDIUM&origin=Ethiopia&minPrice=100000&inStock=true&sort=price_asc&page=1&pageSize=12`.

### 4.4 `GET /products/:slug`

200:

```json
{
  "data": {
    "id": "ckp1",
    "slug": "ethiopia-yirgacheffe-washed",
    "name": "Ethiopia Yirgacheffe Washed",
    "shortDesc": "...",
    "description": "Markdown...",
    "tags": ["specialty", "hoa", "cam chanh"],
    "brand": {
      "id": "ckb1",
      "name": "BeanBox Roastery",
      "slug": "beanbox-roastery"
    },
    "category": { "id": "ckc1", "name": "Specialty", "slug": "specialty" },
    "breadcrumbs": [
      { "name": "Cà phê hạt", "slug": "ca-phe-hat" },
      { "name": "Specialty", "slug": "specialty" }
    ],
    "images": [
      {
        "id": "cki1",
        "url": "/uploads/seed/ethiopia.jpg",
        "alt": "...",
        "isPrimary": true
      }
    ],
    "variants": [{ "...": "Variant" }],
    "minPrice": 185000,
    "inStock": true,
    "coffee": {
      "originCountry": "Ethiopia",
      "originRegion": "Yirgacheffe",
      "variety": "Arabica",
      "process": "WASHED",
      "roastLevel": "LIGHT",
      "altitude": 1900,
      "tastingNotes": ["Hoa nhài", "Cam chanh"],
      "brewMethods": ["POUR_OVER", "AEROPRESS"]
    },
    "ratingAvg": 4.6,
    "ratingCount": 18,
    "seo": { "title": "...", "description": "..." },
    "related": [
      { "...": "ProductListItem (tối đa 8, chấm điểm theo nội dung, loại trừ chính nó)" }
    ],
    "createdAt": "2026-10-01T00:00:00.000Z"
  }
}
```

Chỉ trả variant `isActive` và chưa xóa, sắp theo `sortOrder`. Lỗi: 404 `NOT_FOUND` (slug không tồn tại, DRAFT/ARCHIVED, đã xóa mềm). Từ 0.7: nếu slug là slug cũ của một sản phẩm đang hiển thị (đã đổi slug) thì 404 `NOT_FOUND` kèm `details: { "movedTo": "<slug hiện tại>" }` để FE chuyển hướng (§14.5).

**Quy tắc `related` (từ 0.12, D-046).** Ứng viên là sản phẩm hiển thị (ACTIVE, chưa xóa mềm), khác chính nó, thỏa ít nhất một: cùng danh mục, cùng danh mục cha, cùng brand, có tag chung; lấy tối đa 100 theo `soldCount` giảm dần rồi chấm điểm:

| Tiêu chí | Điểm |
|---|---|
| Cùng danh mục | +4 |
| Khác danh mục nhưng cùng danh mục cha (cha khác null) | +2 |
| Cùng brand (khác null) | +2 |
| Mỗi tag trùng (không phân biệt hoa thường), tối đa | +1 mỗi tag, tối đa +3 |
| Cả hai là cà phê: cùng `roastLevel` / cùng `originCountry` (không phân biệt hoa thường) / cùng `process` / có ít nhất một `brewMethods` chung | +1 mỗi tiêu chí |
| `minPrice` ứng viên trong ±30% `minPrice` gốc (gốc > 0) | +1 |

Bỏ điểm 0. Sắp: còn hàng (`inStock`) trước, rồi điểm giảm dần, rồi `soldCount` giảm dần, rồi `id` tăng dần (xác định). Tối đa 8. Có thể ít hơn 8 hoặc rỗng; shape vẫn `ProductListItem[]`.

### 4.5 `GET /search/suggest?q=`

`q`: string 2–50 (ngắn hơn -> 400). `limit`: int 1–10, mặc định 6. Chuẩn hóa không dấu, ưu tiên khớp đầu tên.

```json
{
  "data": {
    "products": [
      {
        "slug": "robusta-buon-ma-thuot",
        "name": "Robusta Buôn Ma Thuột",
        "imageUrl": "/uploads/...",
        "minPrice": 95000
      }
    ],
    "categories": [{ "slug": "ca-phe-viet", "name": "Cà phê Việt" }]
  }
}
```

### 4.6 `GET /products/:slug/bought-together`

Công khai (từ 0.12, D-046). Sản phẩm thường xuất hiện cùng đơn với sản phẩm gốc.

Query: `limit` int 1–8, mặc định 4 (sai -> 400 `VALIDATION_ERROR`).

200:

```json
{
  "data": [
    { "...": "ProductListItem" }
  ]
}
```

Quy tắc:

- Đếm số **khách khác nhau** đã mua cả sản phẩm gốc lẫn sản phẩm đó trong cùng một đơn: khách đăng nhập tính theo `userId`, khách vãng lai theo `lower(contactEmail)`. Một khách mua nhiều đơn vẫn là một khách.
- Chỉ tính đơn có `status` KHÔNG thuộc `CANCELLED`, `PENDING_PAYMENT` và `createdAt` trong 365 ngày gần nhất.
- **Ngưỡng riêng tư:** chỉ trả sản phẩm có từ **2 khách trở lên** (không để một đơn lẻ lộ ra "ai đó đã mua X cùng Y").
- Chỉ trả sản phẩm hiển thị (ACTIVE, chưa xóa mềm) và còn hàng (`inStock`).
- Sắp: số khách giảm dần, `soldCount` giảm dần, `id` tăng dần. Không đủ thì trả ít hơn, kể cả `[]`; KHÔNG lấp bằng sản phẩm phổ biến.
- Lỗi: 404 `NOT_FOUND` khi slug sai định dạng, không tồn tại hoặc sản phẩm không hiển thị (không có `movedTo`).
- Cache: GET công khai, không bị ép `no-store` (có trong `PUBLIC_CACHEABLE`); chỉ áp limiter chung. Kết quả tính trực tiếp từ DB mỗi request (không cache phía server); FE gọi ở server với revalidate 60 giây như dữ liệu sản phẩm.

### 4.7 `GET /products/compare?slugs=a,b,c`

Công khai (từ 0.13, D-047). Dữ liệu cho bảng so sánh 2–4 sản phẩm, gộp trong một request (không phải gọi N lần chi tiết).

Query: `slugs` bắt buộc, danh sách phân tách dấu phẩy; mỗi slug theo định dạng `^[a-z0-9]+(?:-[a-z0-9]+)*$` (<= 200 ký tự). Tham số lặp (`slugs=a&slugs=b`) được gộp như `a,b`. Slug trùng bị bỏ (giữ thứ tự lần xuất hiện đầu); **sau khi bỏ trùng phải còn 2–4 slug**. Vi phạm (thiếu, rỗng, 1 slug, 5 slug trở lên, slug sai định dạng) -> 400 `VALIDATION_ERROR` với `details: [{ "field": "slugs", "message": "..." }]`.

200:

```json
{
  "data": {
    "items": [
      {
        "id": "ckp3",
        "slug": "kenya-aa",
        "name": "Kenya AA",
        "shortDesc": "Chua sáng như nho đen, hậu vị ngọt đường nâu.",
        "brand": { "id": "ckb1", "name": "BeanBox Roastery", "slug": "beanbox-roastery" },
        "category": { "id": "ckc2", "name": "Specialty", "slug": "specialty" },
        "primaryImage": { "url": "/uploads/seed/ca-phe-hat.svg", "alt": "Túi cà phê hạt Kenya AA" },
        "minPrice": 240000,
        "compareAtPrice": null,
        "inStock": true,
        "isFeatured": false,
        "ratingAvg": 4.7,
        "ratingCount": 9,
        "tags": ["specialty", "kenya", "chua sáng", "trái cây"],
        "priceRange": { "min": 240000, "max": 455000 },
        "variants": [
          {
            "name": "250 g - Nguyên hạt",
            "attributes": { "grind": "Nguyên hạt", "weight": "250g" },
            "price": 240000,
            "effectivePrice": 240000,
            "isOnSale": false,
            "stockStatus": "LOW_STOCK",
            "weightGram": 250
          }
        ],
        "coffee": {
          "originCountry": "Kenya",
          "originRegion": "Nyeri",
          "variety": "Arabica",
          "process": "WASHED",
          "roastLevel": "MEDIUM",
          "altitude": null,
          "tastingNotes": ["Nho đen", "Cà chua chín", "Đường nâu"],
          "brewMethods": ["POUR_OVER", "ESPRESSO"]
        }
      }
    ],
    "missing": ["khong-co-sp"]
  }
}
```

Quy tắc:

- `items` theo ĐÚNG thứ tự `slugs` đã yêu cầu, chỉ gồm sản phẩm hiển thị (ACTIVE, chưa xóa mềm). Slug không tồn tại, không hiển thị (DRAFT, ARCHIVED, đã xóa mềm) hoặc là slug cũ đã đổi đều nằm trong `missing` (cùng thứ tự yêu cầu); KHÔNG trả 404 cho cả request và KHÔNG tra redirect slug cũ. Mọi slug đều thiếu thì vẫn 200 với `items: []`.
- `CompareItem` = các trường của `ProductListItem` (§4) + `tags`, `priceRange`, `variants`, và `coffee` đầy đủ như §4.4 (hoặc `null`). `coffee` ở đây có đủ 8 trường của `CoffeeProfile`, nhiều hơn 3 trường ở `ProductListItem`. KHÔNG có `description`.
- `priceRange = { min, max }`: giá hiệu lực (§10.1) thấp nhất và cao nhất của các biến thể đang bán, tính lại lúc đọc. `minPrice`/`compareAtPrice` giữ nghĩa như ở `ProductListItem`.
- `variants`: chỉ biến thể đang bán (`isActive`, chưa xóa mềm), sắp `sortOrder`. Quy tắc §4 "Làm rõ M1" giữ nguyên: KHÔNG trả `stock` chính xác (chỉ `stockStatus`), và KHÔNG trả `salePrice` (chỉ `price`, `effectivePrice`, `isOnSale`), nên đợt sale chưa bắt đầu hoặc đã hết không lộ giá.
- Truy vấn: một `findMany` cho cả danh sách slug (không N+1).
- Cache: GET công khai, không bị ép `no-store` (có trong `PUBLIC_CACHEABLE`, §1); chỉ áp limiter chung.
- **Slug dành riêng.** Vì route này khai báo trước `/products/:slug`, `GET /products/compare` không bao giờ trả chi tiết sản phẩm có slug `compare`. Do đó admin không được đặt slug `compare` (§12.4).

## 5. Auth

Lược đồ User trả ra (không bao giờ có `passwordHash`):

```json
{
  "id": "cku1",
  "email": "an@example.com",
  "fullName": "Nguyễn Văn An",
  "phone": null,
  "birthDate": null,
  "avatarUrl": null,
  "role": "CUSTOMER",
  "emailVerified": false,
  "createdAt": "2026-11-10T08:30:00.000Z"
}
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

Không body. Thu hồi token hiện tại (cả family), xóa cookie; access token cùng phiên bị 401 ngay từ đó. Idempotent: luôn 204 (kể cả không có cookie), trừ 403 `INVALID_ORIGIN`.

### 5.5 `POST /auth/forgot-password` – Public (5/phút/IP)

Body: `{ "email": "an@example.com" }`. Luôn 200 (không lộ email có tồn tại):

```json
{
  "data": {
    "message": "Nếu email tồn tại, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu."
  }
}
```

Token hết hạn 30 phút, dùng 1 lần; link trỏ `/dat-lai-mat-khau?token=...`. Email không tồn tại hoặc tài khoản `DISABLED`: không gửi mail, vẫn 200 cùng message. Tạo token mới thì vô hiệu các token reset cũ chưa dùng. Email gửi bất đồng bộ (không chờ) để thời gian phản hồi không lộ email có tồn tại. Lỗi: 400, 429.

### 5.6 `POST /auth/reset-password` – Public (5/phút/IP)

Body: `{ "token": "...", "newPassword": "Matkhau456" }`. 200 `{ "data": { "message": "Đã đặt lại mật khẩu." } }`; đánh dấu token đã dùng và vô hiệu mọi token reset khác của user; thu hồi mọi refresh token của user (mọi access token đang sống của user bị 401 ngay), reset `failedLoginCount/lockedUntil`. Lỗi: 400 `VALIDATION_ERROR`, 400 `TOKEN_INVALID`.

### 5.7 `POST /auth/verify-email` – Public

Body: `{ "token": "..." }` (từ link email, FE trang xác thực gọi API). 200 `{ "data": { "emailVerified": true } }`. Token đã dùng nhưng email đã xác thực: vẫn 200 (idempotent). Lỗi: 400 `TOKEN_INVALID`.
Bổ sung: `POST /auth/resend-verification` – Auth, không body, 204; 409 `CONFLICT` nếu đã xác thực; gửi lại trong 60 giây -> 429 `RATE_LIMITED` + header `Retry-After` và `error.details: { "retryAfterSec": <int> }` (cùng giá trị). Tạo token mới vô hiệu token xác thực cũ chưa dùng.

### 5.8 `POST /auth/change-password` – Auth

Body: `{ "currentPassword": "...", "newPassword": "..." }` (khác mật khẩu cũ). 204; thu hồi mọi refresh token **trừ family hiện tại** (xác định bằng claim `sid` của access token); access token của các phiên khác bị 401 ngay, phiên hiện tại vẫn dùng được. `newPassword` trùng `currentPassword` -> 400 `VALIDATION_ERROR` (field `newPassword`). Rate limit 5/phút/IP. Lỗi: 400 `VALIDATION_ERROR`, 400 `INVALID_PASSWORD`, 401, 429.

## 6. Me (hồ sơ & địa chỉ)

### 6.1 `GET /me` – Auth

200: `{ "data": { ...User } }`.

### 6.2 `PATCH /me` – Auth

Body (ít nhất 1 trường hợp lệ, nếu không -> 400): `fullName` string 2–100; `phone` string \| null (chuẩn hóa theo §1 / D-007; `null` để xóa); `birthDate` `YYYY-MM-DD` \| null (không ở tương lai, năm >= 1900); `avatarUrl` string URL http(s) <= 500 \| null. Không đổi được `email`, `role`. 200 `{ "data": User }`. Lỗi: 400, 401.

### 6.3 Địa chỉ

Kiểu:

```json
{
  "id": "cka1",
  "fullName": "Nguyễn Văn An",
  "phone": "0901234567",
  "provinceCode": "79",
  "provinceName": "Thành phố Hồ Chí Minh",
  "wardCode": "26740",
  "wardName": "Phường Sài Gòn",
  "line1": "12 Lê Lợi",
  "isDefault": true,
  "createdAt": "..."
}
```

Quy tắc body (danh mục tỉnh/phường: §7):

- POST: `fullName` 2–100, `phone` (regex §1), `provinceCode` (`^\d{2}$`), `wardCode` (`^\d{5}$`), `line1` 5–200, `isDefault` boolean tùy chọn. `provinceName`/`wardName` do client gửi bị BỎ QUA; server tự điền tên từ danh mục.
- PATCH: gửi `provinceCode` thì bắt buộc kèm `wardCode` (400 nếu thiếu). Gửi chỉ `wardCode` thì phường phải thuộc `provinceCode` HIỆN TẠI của địa chỉ.
- Lỗi đối chiếu danh mục -> 400 `VALIDATION_ERROR` với `details` là một trong: `[{ "field": "provinceCode", "message": "Tỉnh/thành không tồn tại" }]`, `[{ "field": "wardCode", "message": "Phường/xã không tồn tại" }]`, `[{ "field": "wardCode", "message": "Phường/xã không thuộc tỉnh/thành đã chọn" }]`.
- Thứ tự PATCH: kiểm quyền sở hữu (404) TRƯỚC, rồi mới đối chiếu danh mục (user khác sửa địa chỉ không phải của mình với mã sai vẫn nhận 404).

Làm rõ: danh sách sắp theo `isDefault DESC, createdAt DESC`; `isDefault:false` gửi lên chỉ bị bỏ qua (muốn đổi mặc định thì đặt địa chỉ khác làm mặc định); địa chỉ đầu tiên luôn là mặc định; tối đa 10 địa chỉ.

| Endpoint                         | Mô tả                                                                                                           | Thành công                | Lỗi                                   |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------- |
| `GET /me/addresses`              | Danh sách, sắp `isDefault DESC, createdAt DESC`                                                                 | 200 `{ data: [Address] }` | 401                                   |
| `POST /me/addresses`             | Tạo; địa chỉ đầu tiên tự là mặc định; `isDefault:true` bỏ mặc định cũ                                           | 201 `{ data: Address }`   | 400, 401, 409 `ADDRESS_LIMIT_REACHED` |
| `PATCH /me/addresses/:id`        | Sửa một phần (>= 1 trường); đổi `provinceCode` kéo theo `wardCode`, đối chiếu danh mục: xem quy tắc body ở trên | 200 `{ data: Address }`   | 400, 401, 404                         |
| `DELETE /me/addresses/:id`       | Xóa; nếu là mặc định thì địa chỉ tạo gần nhất còn lại thành mặc định                                            | 204                       | 401, 404                              |
| `POST /me/addresses/:id/default` | Đặt làm mặc định                                                                                                | 200 `{ data: Address }`   | 401, 404                              |

Địa chỉ của người khác -> 404.

### 6.4 `GET /me/orders` – Auth

Query: `status` (OrderStatus, nhiều giá trị cách dấu phẩy), `page`, `pageSize`. Sắp `createdAt DESC`. Chỉ đơn của user.

```json
{
  "data": [
    {
      "code": "BB-261110-K7QP",
      "status": "PENDING",
      "paymentStatus": "UNPAID",
      "paymentMethod": "COD",
      "grandTotal": 405000,
      "itemCount": 3,
      "createdAt": "2026-11-10T08:30:00.000Z",
      "items": [
        {
          "productName": "Robusta Buôn Ma Thuột",
          "variantName": "500 g - Xay phin",
          "imageUrl": "/uploads/...",
          "quantity": 2
        },
        {
          "productName": "Phin nhôm 8 cm",
          "variantName": "Bạc",
          "imageUrl": "/uploads/...",
          "quantity": 1
        }
      ]
    }
  ],
  "meta": { "page": 1, "pageSize": 20, "total": 1, "totalPages": 1 }
}
```

`itemCount` = **tổng `quantity`** của mọi dòng (ví dụ trên: 2 + 1 = 3). `items` tối đa 3 dòng đầu. Chi tiết dùng `GET /orders/:code`. Đơn guest đặt trước khi đăng ký **không** tự gắn vào tài khoản (D-005, xem §15 mục 2).

## 7. Locations

**Public**, dữ liệu tĩnh 2 cấp (hành chính từ 01/07/2025), nạp từ `backend/data/provinces-wards.json` (nguồn: `backend/data/README.md`, D-006). Mọi response thành công có `Cache-Control: public, max-age=86400` (và ETag mặc định của Express); response lỗi không gắn Cache-Control public. Vẫn chịu rate limit chung.

### `GET /locations/provinces`

200, đủ 34 tỉnh/thành, sắp theo `code` tăng dần; chỉ trả `code`, `name`.

```json
{
  "data": [
    { "code": "01", "name": "Thành phố Hà Nội" },
    { "code": "79", "name": "Thành phố Hồ Chí Minh" }
  ]
}
```

### `GET /locations/provinces/:code/wards`

200, sắp theo `name` (so sánh tiếng Việt, `Intl.Collator('vi')`).

```json
{
  "data": [
    { "code": "00070", "name": "Phường Hoàn Kiếm" },
    { "code": "26740", "name": "Phường Sài Gòn" }
  ]
}
```

(Ví dụ rút gọn: hai phường trên thuộc hai tỉnh khác nhau, thực tế mỗi tỉnh trả toàn bộ phường/xã của mình.)

Lỗi: `:code` sai định dạng (không phải 2 chữ số) hoặc không tồn tại -> 404 `NOT_FOUND` ("Không tìm thấy tỉnh/thành").

## 8. Cart

**Nhận diện giỏ:** có Bearer -> giỏ user (tạo lười khi cần). Không có Bearer -> giỏ guest theo `X-Cart-Token`. Token thiếu/không tồn tại/hết hạn (30 ngày không hoạt động): `GET` trả giỏ rỗng (không tạo giỏ); các thao tác ghi tạo giỏ mới và trả token mới.

**Kiểu Cart** (mọi endpoint giỏ trả kiểu này):

```json
{
  "data": {
    "cartToken": "q3Zk...43chars",
    "items": [
      {
        "id": "ckci1",
        "variantId": "ckv1",
        "quantity": 2,
        "product": {
          "id": "ckp1",
          "slug": "robusta-buon-ma-thuot",
          "name": "Robusta Buôn Ma Thuột",
          "imageUrl": "/uploads/..."
        },
        "variant": {
          "id": "ckv1",
          "sku": "ROB-500-PHIN",
          "name": "500 g - Xay phin",
          "attributes": { "weight": "500g", "grind": "Xay phin" },
          "weightGram": 500
        },
        "unitPrice": 165000,
        "listPrice": 165000,
        "lineTotal": 330000,
        "unitPriceAtAdd": 175000,
        "maxQuantity": 20,
        "stockStatus": "IN_STOCK",
        "warnings": ["PRICE_CHANGED"]
      }
    ],
    "itemCount": 2,
    "subtotal": 330000,
    "coupon": {
      "code": "WELCOME10",
      "type": "PERCENT",
      "discount": 33000,
      "valid": true,
      "invalidReason": null
    },
    "discountTotal": 33000,
    "totalWeightGram": 1000,
    "shippingEstimate": {
      "standardFrom": 20000,
      "freeShippingThreshold": 500000,
      "freeShippingRemaining": 203000
    }
  }
}
```

- `cartToken`: **chỉ có giá trị khi vừa cấp mới** (guest tạo giỏ); các lần sau là `null`. Đồng thời gửi header `X-Cart-Token`. Giỏ user luôn `null`.
- `warnings` (mảng, có thể rỗng): `PRICE_CHANGED` (`unitPrice != unitPriceAtAdd`), `INSUFFICIENT_STOCK` (quantity > tồn), `OUT_OF_STOCK`, `UNAVAILABLE` (variant/sản phẩm ngừng bán). `maxQuantity = min(stock, 20)`.
- `subtotal` chỉ cộng các dòng không có `OUT_OF_STOCK`/`UNAVAILABLE`. `itemCount` = tổng `quantity` các dòng đó.
- `coupon` = `null` nếu chưa áp. Nếu mã đã áp nhưng không còn hợp lệ (hết hạn, không đủ điều kiện sau khi giỏ đổi): `valid:false`, `invalidReason` có giá trị, `discount: 0`. Phần giảm FREESHIP không nằm trong `discountTotal` (tính ở quote).
- `coupon.minOrder` (int) chỉ xuất hiện khi `invalidReason = MIN_ORDER` (ngoại lệ của quy ước null), là giá trị đơn tối thiểu để FE hiển thị. Cũng áp cho `coupon` trong quote (§9.1).
- `shippingEstimate.standardFrom` = phí Tiêu chuẩn thấp nhất (khu nội thành) + phụ phí khối lượng, hoặc 0 nếu đã đủ freeship; `freeShippingRemaining` = `max(0, ngưỡng - (subtotal - discountTotal))`.
- Thứ tự dòng: `createdAt` tăng dần.
- `lastActivityAt` của giỏ được cập nhật ở mọi thao tác ghi và ở `GET` (tối đa 1 lần/giờ). Giỏ user bỏ qua `X-Cart-Token` (trừ `POST /cart/merge`).
- `coupon.discount` chỉ là phần giảm trên hàng: mã FREESHIP luôn có `discount: 0` ở giỏ; phần giảm ship nằm ở `shippingOptions[].shippingDiscount` của quote (§9.1).
- Phạm vi mã (`scope`, `{categoryIds?, productIds?}`): một dòng đủ điều kiện nếu `productId ∈ productIds` HOẶC `categoryId ∈ categoryIds` HOẶC danh mục cha của danh mục sản phẩm `∈ categoryIds`; `scope` null/rỗng = mọi dòng. `MIN_ORDER` so với `subtotal` (toàn giỏ, không chỉ phần đủ điều kiện).

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
{
  "data": { "...": "Cart" },
  "meta": {
    "merged": true,
    "adjustments": [
      {
        "variantId": "ckv1",
        "requested": 25,
        "final": 20,
        "reason": "QUANTITY_LIMIT"
      }
    ]
  }
}
```

`reason`: `QUANTITY_LIMIT` | `STOCK_LIMIT` | `UNAVAILABLE`. FE xóa `cartToken` local sau khi merge.

### 8.7 Mã giảm giá

**`POST /cart/apply-coupon`** – Optional. Body `{ "code": "welcome10" }` (không phân biệt hoa thường, 1–50 ký tự). Thay mã cũ nếu có. 200 Cart (kèm `coupon`). Giỏ rỗng -> 409 `CART_EMPTY`. Rate limit 10/phút/IP (D-011) -> 429 `RATE_LIMITED`.
Lỗi 409 `COUPON_INVALID`, `details.reason` ∈ `NOT_FOUND`, `INACTIVE`, `NOT_STARTED`, `EXPIRED`, `USAGE_LIMIT`, `PER_USER_LIMIT`, `MIN_ORDER` (kèm `details.minOrder`), `NOT_APPLICABLE` (không có sản phẩm đủ điều kiện). Giới hạn theo khách của guest chỉ kiểm khi đặt đơn (có email).
**Lưu ý (D-004):** `USAGE_LIMIT` và `PER_USER_LIMIT` ở giỏ/quote chỉ là kiểm tra tham khảo (đọc không khóa). Quyết định cuối và việc giữ lượt xảy ra ở `POST /orders` (§9.2); tại đó mã vẫn có thể bị từ chối với `COUPON_INVALID` dù giỏ đã báo hợp lệ.
**`DELETE /cart/coupon`** – Optional. 200 Cart (`coupon: null`).

## 9. Checkout & Orders

**Kiểu Order**

```json
{
  "code": "BB-261110-K7QP",
  "status": "PENDING",
  "paymentStatus": "UNPAID",
  "paymentMethod": "COD",
  "shippingMethod": "STANDARD",
  "contact": { "email": "an@example.com", "phone": "0901234567" },
  "shippingAddress": {
    "fullName": "Nguyễn Văn An",
    "phone": "0901234567",
    "provinceCode": "79",
    "provinceName": "Thành phố Hồ Chí Minh",
    "wardCode": "26740",
    "wardName": "Phường Sài Gòn",
    "line1": "12 Lê Lợi"
  },
  "items": [
    {
      "id": "ckoi1",
      "productId": "ckp2",
      "variantId": "ckv1",
      "productName": "Robusta Buôn Ma Thuột",
      "variantName": "500 g - Xay phin",
      "sku": "ROB-500-PHIN",
      "imageUrl": "/uploads/...",
      "unitPrice": 165000,
      "quantity": 2,
      "lineTotal": 330000
    }
  ],
  "subtotal": 330000,
  "discountTotal": 33000,
  "shippingFee": 20000,
  "shippingDiscount": 0,
  "grandTotal": 317000,
  "couponCode": "WELCOME10",
  "note": "Gọi trước khi giao",
  "trackingNumber": null,
  "carrier": null,
  "cancelReason": null,
  "expiresAt": null,
  "paidAt": null,
  "deliveredAt": null,
  "createdAt": "2026-11-10T08:30:00.000Z",
  "history": [
    {
      "fromStatus": null,
      "toStatus": "PENDING",
      "note": null,
      "createdAt": "2026-11-10T08:30:00.000Z"
    }
  ],
  "canCancel": true,
  "canPay": false
}
```

`canCancel` = trạng thái hiện tại cho phép khách hủy (§11). `canPay` (0.6) = đơn đang chờ thanh toán và còn thanh toán được (§13.1). Không lộ `actorId`, `idempotencyKey`.

### 9.1 `POST /checkout/quote` – Optional

Tính giá từ giỏ hiện tại (không tạo đơn, không giữ kho). Body:

| Trường         | Kiểu / ràng buộc                          | Ghi chú                                                                                                                                                        |
| -------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provinceCode` | string, bắt buộc nếu không có `addressId` | Quyết định vùng ship                                                                                                                                           |
| `wardCode`     | string `^\d{5}$`, tùy chọn                | Nếu có thì phải thuộc `provinceCode` (đối chiếu danh mục, lỗi 400 giống §6.3). FE nên luôn gửi khi đã biết (dùng cho `shipping.innerCityWardCodes`, §10 mục 3) |
| `addressId`    | string, chỉ khi đã đăng nhập              | Địa chỉ của user (người khác -> 404); thay cho `provinceCode`/`wardCode` (tỉnh và phường lấy từ địa chỉ)                                                       |
| `couponCode`   | string, tùy chọn                          | Ghi đè mã đang áp trong giỏ cho lần tính này                                                                                                                   |
| `contactEmail` | email, tùy chọn                           | Dùng kiểm `perUserLimit` cho guest                                                                                                                             |

200:

```json
{
  "data": {
    "items": [{ "...": "dòng giỏ như Cart.items" }],
    "subtotal": 330000,
    "discountTotal": 33000,
    "coupon": {
      "code": "WELCOME10",
      "type": "PERCENT",
      "discount": 33000,
      "valid": true,
      "invalidReason": null
    },
    "totalWeightGram": 1000,
    "shippingZone": "INNER",
    "shippingOptions": [
      {
        "method": "STANDARD",
        "label": "Tiêu chuẩn",
        "estimatedDays": "3-5",
        "baseFee": 20000,
        "weightSurcharge": 0,
        "fee": 20000,
        "freeShippingApplied": false,
        "shippingDiscount": 0,
        "payableFee": 20000,
        "grandTotal": 317000
      },
      {
        "method": "EXPRESS",
        "label": "Nhanh",
        "estimatedDays": "1-2",
        "baseFee": 35000,
        "weightSurcharge": 0,
        "fee": 35000,
        "freeShippingApplied": false,
        "shippingDiscount": 0,
        "payableFee": 35000,
        "grandTotal": 332000
      }
    ],
    "paymentMethods": [
      { "method": "COD", "enabled": true },
      { "method": "VNPAY", "enabled": false },
      { "method": "STRIPE", "enabled": false }
    ],
    "issues": [{ "variantId": "ckv9", "type": "OUT_OF_STOCK", "available": 0 }]
  }
}
```

`fee` = `baseFee + weightSurcharge` (trước giảm); `shippingDiscount` gồm freeship ngưỡng hoặc mã FREESHIP; `payableFee = fee - shippingDiscount`; `grandTotal = subtotal - discountTotal + payableFee`. `issues.type`: `OUT_OF_STOCK` | `INSUFFICIENT_STOCK` | `UNAVAILABLE`; quote vẫn trả 200 để UI hiển thị, nhưng `POST /orders` sẽ từ chối. Mã không hợp lệ không làm quote lỗi: `coupon.valid=false` và `discount=0`; khi `invalidReason = MIN_ORDER` thì `coupon.minOrder` (int) có mặt như ở §8.
Lỗi: 400 (thiếu `provinceCode`/`addressId`, mã tỉnh sai); 404 (`addressId` không thuộc user); 409 `CART_EMPTY`; 429 `RATE_LIMITED` (30/phút/IP, D-011).

### 9.2 `POST /orders` – Optional

Header bắt buộc: `Idempotency-Key: <uuid v4>`. Lấy item từ giỏ server; **không nhận giá từ client**.

| Trường            | Kiểu / ràng buộc                                                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contact.email`   | email; bắt buộc với guest; user mặc định email tài khoản                                                                                           |
| `contact.phone`   | SĐT hợp lệ; bắt buộc với guest; user mặc định SĐT địa chỉ nhận                                                                                     |
| `addressId`       | string, chỉ user đăng nhập; thay cho `shippingAddress` (người khác -> 404; guest gửi -> 401 `UNAUTHORIZED`)                                        |
| `shippingAddress` | object `{ fullName 2–100, phone, provinceCode, wardCode, line1 5–200 }`; bắt buộc nếu không có `addressId`; `provinceName/wardName` do server điền |
| `shippingMethod`  | `STANDARD` \| `EXPRESS` (bắt buộc)                                                                                                                 |
| `paymentMethod`   | `COD` \| `VNPAY` \| `STRIPE` (bắt buộc); phương thức online chưa bật -> 409 `PAYMENT_METHOD_UNAVAILABLE` (xem §13.0, §13.1)                        |
| `couponCode`      | string, tùy chọn; không gửi thì dùng mã trong giỏ                                                                                                  |
| `note`            | string <= 500, tùy chọn                                                                                                                            |
| `acceptTerms`     | phải là `true`                                                                                                                                     |
| `expectedTotal`   | int, tùy chọn; khác `grandTotal` server tính -> 409 `PRICE_CHANGED` (`details`: xem dưới)                                                          |

Ví dụ:

```json
{
  "contact": { "email": "an@example.com", "phone": "0901234567" },
  "shippingAddress": {
    "fullName": "Nguyễn Văn An",
    "phone": "0901234567",
    "provinceCode": "79",
    "wardCode": "26740",
    "line1": "12 Lê Lợi"
  },
  "shippingMethod": "STANDARD",
  "paymentMethod": "COD",
  "couponCode": "WELCOME10",
  "note": "Gọi trước khi giao",
  "acceptTerms": true,
  "expectedTotal": 317000
}
```

**Hành vi:** trong 1 transaction: kiểm tra lại giá/tồn/mã -> tạo Order + OrderItem (snapshot) + `OrderStatusHistory` -> trừ kho (`stock >= qty`) + `InventoryMovement(ORDER_RESERVE)` -> **giữ lượt mã** (nếu có mã, D-004; xem dưới) -> xóa giỏ (và mã). COD -> `PENDING`. Online -> `PENDING_PAYMENT`, `expiresAt = now + order.paymentExpiryMinutes` (mặc định 15); sau đó FE gọi endpoint tạo phiên thanh toán (§13.1, §13.2).
**Giữ lượt mã (D-004)** – chạy trong cùng transaction, sau bước trừ kho, chỉ khi đơn có mã:

- a. `UPDATE "Coupon" SET "usedCount" = "usedCount" + 1 WHERE "id" = $id AND "isActive" AND ("usageLimit" IS NULL OR "usedCount" < "usageLimit")`. Số dòng = 0 -> rollback toàn bộ (kể cả trừ kho), 409 `COUPON_INVALID` (`details.reason = USAGE_LIMIT`).
- b. Sau bước a (transaction đang giữ khóa dòng coupon nên các đơn đồng thời dùng cùng mã bị tuần tự hóa): đếm `CouponRedemption` của coupon chưa `releasedAt`, theo `userId` (user) hoặc `email` lowercase (guest). Nếu >= `perUserLimit` -> rollback, 409 `COUPON_INVALID` (`details.reason = PER_USER_LIMIT`). Thứ tự a rồi b bảo đảm `perUserLimit` không bị vượt khi đồng thời (Postgres READ COMMITTED: lệnh đếm chạy sau khi giao dịch trước commit).
- c. Tạo `CouponRedemption(couponId, orderId, userId?, email)`.

**201** `{ "data": Order }` (đơn mới). **200** `{ "data": Order }` nếu `Idempotency-Key` đã dùng với cùng nội dung và cùng người gọi (trả lại đơn cũ ở trạng thái mới nhất, không tạo thêm, không trừ kho lần nữa).
**Idempotency (làm rõ 0.4):**

- `requestFingerprint` = SHA-256 của body đã chuẩn hóa (sau zod, khóa sắp xếp ổn định) + định danh người gọi: `u:<userId>` (đã đăng nhập), `g:<sha256 của X-Cart-Token>` (guest), hoặc `g:-` (guest không có token).
- Cùng key: fingerprint khớp -> 200 trả đơn hiện tại; khác (kể cả khác người gọi) -> 409 `IDEMPOTENCY_CONFLICT`. Không bao giờ trả đơn cho người khác.
- Kiểm tra replay xảy ra TRƯỚC kiểm giỏ trống: gọi lại sau khi giỏ đã bị xóa vẫn 200.
  **Chi tiết lỗi nghiệp vụ (0.4):**
- `PRICE_CHANGED`: `details: { "expectedTotal": int, "grandTotal": int, "quote": <object giống data của POST /checkout/quote cho cùng địa chỉ/mã> }`.
- `OUT_OF_STOCK`: liệt kê MỌI dòng thiếu, `details.items[] {variantId, requested, available}`. `ITEM_UNAVAILABLE`: `details.items[] {variantId}`. Dòng giỏ có issue bất kỳ (`OUT_OF_STOCK`/`INSUFFICIENT_STOCK`/`UNAVAILABLE`) -> từ chối cả đơn.
- Mã giảm giá không hợp lệ vì BẤT KỲ lý do nào ở `POST /orders` -> 409 `COUPON_INVALID` (`details.reason`), không âm thầm bỏ mã.
  **Email xác nhận (0.4):** sau commit, gửi nền email xác nhận đơn tới `contactEmail`; lỗi mail không ảnh hưởng đơn. Link: user -> `${WEB_APP_URL}/tai-khoan/don-hang/<code>`; guest -> `${WEB_APP_URL}/tra-cuu-don-hang?code=<code>` (KHÔNG đưa SĐT vào URL).
  Lỗi: 400 `VALIDATION_ERROR` (gồm thiếu header key, `acceptTerms` false); 401 (guest dùng `addressId`); 404 (`addressId` lạ); 409 `CART_EMPTY`, `OUT_OF_STOCK` (rollback; `details.items[]`), `ITEM_UNAVAILABLE`, `COUPON_INVALID` (kể cả `reason` `USAGE_LIMIT`/`PER_USER_LIMIT` phát sinh ở bước giữ lượt, rollback cả trừ kho), `PRICE_CHANGED`, `IDEMPOTENCY_CONFLICT`, `PAYMENT_METHOD_UNAVAILABLE`; 429.
  Lưu ý (D-005): đơn guest không có endpoint xem lại ngoài `GET /orders/track` (mã đơn + SĐT); FE lưu response vừa nhận (sessionStorage) để hiển thị trang thành công, mất thì hướng dẫn dùng trang `/tra-cuu-don-hang`.

### 9.3 `GET /orders/:code` – Auth (chỉ chủ đơn)

200 `{ "data": Order }`. Đơn không tồn tại, của người khác, hoặc đơn guest -> 404 `NOT_FOUND`. Lỗi: 401.

### 9.4 `POST /orders/:code/cancel` – Optional

Body: `{ "reason": "Đặt nhầm", "phone": "0901234567" }`. `reason` string <= 255, tùy chọn. `phone` **bắt buộc khi không đăng nhập** (chuẩn hóa theo §1 rồi so khớp `contactPhone`).
Quyền (0.4): đã đăng nhập -> chỉ chủ đơn (`order.userId = user`), `phone` bị bỏ qua. KHÔNG đăng nhập -> chỉ đơn guest (`order.userId IS NULL`) VÀ `phone` (chuẩn hóa) khớp `contactPhone`. Mọi trường hợp khác -> 404 cùng thông báo. Rate limit 5/phút/IP áp cho request không có header `Authorization` (store riêng, không dùng chung với login).
Cho phép khi `status ∈ {PENDING_PAYMENT, PENDING, CONFIRMED}` (§11). Hoàn kho (`ORDER_RELEASE`) và hoàn lượt mã (luôn, D-004). 200 `{ "data": Order }` khi đã đăng nhập; khách không đăng nhập nhận `{ "data": TrackedOrder }` (cùng shape §9.5, `canCancel: false`) để không lộ dữ liệu cá nhân. Status `CANCELLED`.
Lỗi: 400; 404 (không tìm thấy hoặc không phải chủ / SĐT không khớp); 409 `INVALID_STATUS_TRANSITION` (`details: { from, to: "CANCELLED", allowed: [...] }`, `allowed` = danh sách trạng thái CUSTOMER được chuyển tới từ trạng thái hiện tại, thường `[]`); 429. Hủy lại đơn đã `CANCELLED` -> 409 `INVALID_STATUS_TRANSITION`: hoàn kho/hoàn lượt chỉ xảy ra đúng 1 lần nhờ `UPDATE ... WHERE status = from`.
Đơn đã `PAID` online bị hủy: `paymentStatus` giữ `PAID` cho tới khi admin ghi nhận hoàn tiền thủ công (§13.7).

### 9.5 `GET /orders/track` – Public (10/phút/IP)

Query: `code` (bắt buộc) và `phone` (bắt buộc; chuẩn hóa theo §1, sai định dạng -> 400 `VALIDATION_ERROR`). Chỉ trả khi `phone` khớp `contactPhone` (dạng chuẩn hóa); sai/không thấy -> 404 `NOT_FOUND` (cùng thông báo, D-005). Khai báo route này **trước** `/orders/:code`.
Làm rõ 0.4: `code` được trim + uppercase; sai định dạng `^BB-\d{6}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$` -> 404 cùng thông báo như không tìm thấy; `phone` sai định dạng -> 400. Rate limit 10/phút/IP (store riêng). Response thêm `canCancel` (true chỉ khi trạng thái cho phép khách hủy VÀ đơn là đơn guest, khớp quy tắc §9.4) và `cancelReason`.
200 (rút gọn dữ liệu cá nhân):

```json
{
  "data": {
    "code": "BB-261110-K7QP",
    "status": "SHIPPING",
    "paymentStatus": "UNPAID",
    "paymentMethod": "COD",
    "shippingMethod": "STANDARD",
    "shippingAddress": {
      "provinceName": "Thành phố Hồ Chí Minh",
      "wardName": "Phường Sài Gòn"
    },
    "items": [
      {
        "productName": "...",
        "variantName": "...",
        "imageUrl": "...",
        "unitPrice": 165000,
        "quantity": 2,
        "lineTotal": 330000
      }
    ],
    "subtotal": 330000,
    "discountTotal": 33000,
    "shippingFee": 20000,
    "shippingDiscount": 0,
    "grandTotal": 317000,
    "trackingNumber": "GHN123",
    "carrier": "GHN",
    "cancelReason": null,
    "expiresAt": null,
    "createdAt": "...",
    "history": [
      { "fromStatus": "PROCESSING", "toStatus": "SHIPPING", "createdAt": "..." }
    ],
    "canCancel": false,
    "canPay": false
  }
}
```

`canPay` (0.6): quy tắc riêng cho tra cứu ở §13.1 (chỉ đơn guest). `expiresAt` (0.6.1): hạn thanh toán của đơn (ISO) hoặc `null` (đơn COD hoặc đã qua giai đoạn chờ thanh toán); không phải dữ liệu cá nhân, để khách vãng lai thấy đồng hồ đếm ngược khi `canPay = true`.

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
   - Vùng (0.4): `INNER` nếu `provinceCode ∈ shipping.innerCityProvinceCodes` (mặc định `["01","79"]` = Hà Nội, TP.HCM) HOẶC (`wardCode` có giá trị VÀ `wardCode ∈ shipping.innerCityWardCodes`, mảng mã phường 5 chữ số, mặc định `[]`), ngược lại `OTHER`. Để thu hẹp nội thành TP.HCM về phường cũ, admin bỏ `"79"` khỏi `innerCityProvinceCodes` và liệt kê mã phường vào `innerCityWardCodes`, không sửa code (D-006). Đã chốt D-006: "nội thành" = toàn bộ tỉnh/thành Hà Nội và TP.HCM vì không còn cấp quận/huyện; đối chiếu mã khi có dữ liệu hành chính chính thức.
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

**Nguồn sự thật cho `canTransition(from, to, actor)`.** Actor: `CUSTOMER` (chủ đơn hoặc guest đã xác thực qua SĐT), `STAFF`, `ADMIN` (STAFF/ADMIN gọi chung là _Staff+_), `SYSTEM` (job, IPN/webhook). Mọi chuyển trạng thái ghi `OrderStatusHistory`, và dùng `UPDATE ... WHERE status = from` (optimistic) để an toàn khi đồng thời. Chuyển sai (kể cả cùng trạng thái) -> 409 `INVALID_STATUS_TRANSITION`.

| #   | Từ                 | Đến                | Ai                                         | Điều kiện / tác dụng phụ                                                                                                                      |
| --- | ------------------ | ------------------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | (tạo)              | `PENDING`          | SYSTEM (khi `POST /orders`, COD)           | Trừ kho; giữ lượt mã (nếu có)                                                                                                                 |
| 0'  | (tạo)              | `PENDING_PAYMENT`  | SYSTEM (online)                            | Trừ kho, giữ lượt mã (nếu có), `expiresAt = now + 15'`                                                                                        |
| 1   | `PENDING_PAYMENT`  | `CONFIRMED`        | SYSTEM                                     | IPN/return VNPay có chữ ký, webhook hoặc sync Stripe hợp lệ (số tiền khớp): `paymentStatus=PAID`, `paidAt`. Thực hiện ở hàm xử lý chung §13.5 |
| 2   | `PENDING_PAYMENT`  | `CANCELLED`        | SYSTEM (quá `expiresAt`), CUSTOMER, Staff+ | Hoàn kho (`ORDER_RELEASE`); hoàn lượt mã                                                                                                      |
| 3   | `PENDING`          | `CONFIRMED`        | Staff+                                     | `confirmedAt`                                                                                                                                 |
| 4   | `PENDING`          | `CANCELLED`        | CUSTOMER, Staff+                           | Hoàn kho; hoàn lượt mã; `cancelReason`                                                                                                        |
| 5   | `CONFIRMED`        | `PROCESSING`       | Staff+                                     | Đang đóng gói                                                                                                                                 |
| 6   | `CONFIRMED`        | `CANCELLED`        | CUSTOMER, Staff+                           | Hoàn kho; hoàn lượt mã; nếu đã `PAID` online cần hoàn tiền thủ công                                                                           |
| 7   | `PROCESSING`       | `SHIPPING`         | Staff+                                     | Bắt buộc `trackingNumber` (`carrier` tùy chọn)                                                                                                |
| 8   | `PROCESSING`       | `CANCELLED`        | Staff+ (bắt buộc `note`)                   | Hoàn kho; hoàn lượt mã                                                                                                                        |
| 9   | `SHIPPING`         | `DELIVERED`        | Staff+                                     | `deliveredAt`; COD -> `paymentStatus=PAID`, `paidAt`; `soldCount += qty`                                                                      |
| 10  | `SHIPPING`         | `FAILED_DELIVERY`  | Staff+                                     | Ghi lý do                                                                                                                                     |
| 11  | `FAILED_DELIVERY`  | `SHIPPING`         | Staff+                                     | Giao lại; có thể cập nhật `trackingNumber`/`carrier` (D-002)                                                                                  |
| 12  | `FAILED_DELIVERY`  | `CANCELLED`        | Staff+                                     | Hoàn kho (hàng hoàn về); hoàn lượt mã                                                                                                         |
| 13  | `DELIVERED`        | `RETURN_REQUESTED` | CUSTOMER (trong 7 ngày)                    | **v2** – chưa triển khai                                                                                                                      |
| 14  | `RETURN_REQUESTED` | `RETURNED`         | Staff+                                     | **v2**; `soldCount -= qty`, hoàn kho nếu hàng nhập lại                                                                                        |
| 15  | `RETURN_REQUESTED` | `DELIVERED`        | Staff+                                     | **v2** – từ chối đổi trả                                                                                                                      |

Mọi chuyển sang `CANCELLED`: hoàn kho + hoàn lượt mã trong cùng transaction.

Trạng thái cuối: `CANCELLED`, `RETURNED`. Khách chỉ được hủy ở #2, #4, #6 (`canCancel`); sau `PROCESSING` khách không hủy được. `paymentStatus` tách riêng (D-001): `UNPAID -> PAID` (IPN hoặc COD giao xong), `UNPAID -> FAILED` (cổng báo lỗi; đơn vẫn `PENDING_PAYMENT` cho tới `expiresAt` để thử lại, quá hạn job mới hủy), `FAILED -> PAID` (thử lại thành công, đơn -> `CONFIRMED`), `PAID -> REFUNDED` (admin ghi nhận hoàn tiền thủ công, §13.7). Thanh toán muộn sau khi đơn đã `CANCELLED` không đổi trạng thái đơn (§13.5).

## 12. Admin (M4)

Quyền: S = Staff+ (STAFF hoặc ADMIN), AD = Admin. Quyết định nền: D-013. Xem audit log (`GET /admin/audit-logs`): §14.4. Dashboard, đánh giá, khôi phục sản phẩm: §14.

### 12.0 Quy ước chung admin

- **Chặn quyền ở cấp router.** Mọi `/admin/*` mount dưới một router dùng `requireAuth` + `requireStaff`; role luôn đọc lại từ DB mỗi request (§1). Thiếu/sai token -> 401 `UNAUTHORIZED`; CUSTOMER -> 403 `FORBIDDEN`; user DISABLED -> 403 `ACCOUNT_DISABLED`. Endpoint ghi chú **Admin** thêm `requireAdmin` (STAFF -> 403 `FORBIDDEN`).
- Admin xem được `stock` chính xác và `id` nội bộ. Phân trang theo §1. Tài nguyên không tồn tại -> 404 `NOT_FOUND`. ID trong path phải là chuỗi 1–50 ký tự `[a-z0-9]` (cuid), sai định dạng -> 404.
- **Audit log (FR-ADM-11).** MỌI thao tác ghi của admin ghi 1 dòng `AuditLog` trong CÙNG transaction với thay đổi: `actorId`, `action`, `entity`, `entityId`, `diff`, `ip` (`req.ip`). `diff` chỉ chứa trường thay đổi, dạng `{ "field": [old, new] }`; tạo mới: `{ "field": [null, new] }` cho các trường chính. Không chứa mật khẩu/token; với đơn hàng không ghi địa chỉ/SĐT. Danh sách `action`: `order.status`, `inventory.adjust`, `product.create|update|delete`, `variant.create|update|delete`, `image.create|update|delete|reorder`, `category.create|update|delete`, `brand.create|update|delete`, `upload.create`; từ 0.6 thêm `coupon.create|update|delete`, `payment.refund` (§13) và `payment.late` (actorId null, hệ thống ghi, §13.5); từ 0.7 thêm `review.hide|show|reply|reply_delete` (§14.1) và `product.restore` (§14.6); từ 0.8 thêm `settings.update` (§14.9), `user.status|role` (§14.10) và `contact.update` (§14.11).
- **Rate limit.** Chung 100/phút/IP (§1); `POST /admin/uploads` thêm 30/phút/IP (store riêng).
- **Không cache.** Mọi response admin có `Cache-Control: no-store`.
- Ngày lọc `from`, `to` dạng `YYYY-MM-DD`, tính theo giờ Việt Nam (UTC+7), bao gồm cả hai đầu, yêu cầu `from <= to`, sai -> 400 `VALIDATION_ERROR`.

### 12.1 Đơn hàng (Staff)

Đơn được định danh bằng `code` trong path (không dùng `id`).

#### `GET /admin/orders`

Query: `status` (OrderStatus[], phân cách phẩy), `paymentStatus` (PaymentStatus[]), `paymentMethod` (PaymentMethod[]), `needsRefund` (`true`, 0.6: chỉ đơn cần hoàn tiền, §13.7), `from`, `to`, `q` (2–50 ký tự), `sort` = `newest` (mặc định) | `oldest`, `page`, `pageSize`.

`q` khớp một trong: `code` chứa chuỗi (không phân biệt hoa thường); `contactPhone` chứa các chữ số của `q` (chỉ khi `q` có >= 3 chữ số; `q` dạng `+84...` được chuẩn hóa về `0` trước); `contactEmail` chứa `q` lowercase.

Item `AdminOrderListItem`:

```json
{
  "code": "BB-261110-A2B3",
  "status": "PENDING",
  "paymentStatus": "UNPAID",
  "paymentMethod": "COD",
  "shippingMethod": "STANDARD",
  "customerName": "Nguyễn Văn A",
  "contactPhone": "0901234567",
  "contactEmail": "a@example.com",
  "isGuest": false,
  "provinceName": "Thành phố Hồ Chí Minh",
  "grandTotal": 317000,
  "itemCount": 3,
  "createdAt": "2026-11-10T08:30:00.000Z",
  "needsRefund": false
}
```

`customerName` = `shippingAddress.fullName`; `itemCount` = tổng `quantity`. `meta` ngoài các trường phân trang có thêm `statusCounts: { [OrderStatus]: int }` đếm theo mọi bộ lọc TRỪ `status` (để dựng tab), luôn đủ key mọi trạng thái (0 nếu không có).

#### `GET /admin/orders/:code`

`code` được trim + uppercase; sai định dạng -> 404. `AdminOrder` = mọi trường của `Order` (§9) TRỪ `canCancel`, thêm:

- `id`, `isGuest`, `customer: { id, email, fullName } | null`, `confirmedAt`, `cancelledAt`, `updatedAt`, `totalWeightGram`.
- Mỗi dòng `history[]` thêm `actor: { id, fullName, role } | null` (null khi SYSTEM).
- `allowedTransitions: OrderStatus[]` = `allowedTransitions(status, role người gọi)` (§11), loại các đích v2 (`RETURN_REQUESTED`, `RETURNED`).
- (0.6) `payments[]` (mới nhất trước) và `needsRefund` cấp đơn: shape ở §13.7. `AdminOrderListItem` thêm `needsRefund` (boolean, cấp đơn, 0.6.1).

#### `PATCH /admin/orders/:code/status`

Body: `toStatus` (OrderStatus, bắt buộc), `fromStatus` (OrderStatus, bắt buộc – trạng thái admin đang thấy), `note` (string <= 500, tùy chọn), `trackingNumber` (1–50, `^[A-Za-z0-9-]+$`), `carrier` (1–50).

Quy tắc, kiểm theo thứ tự:

1. `fromStatus` khác trạng thái hiện tại -> 409 `CONFLICT` "Đơn hàng vừa được cập nhật, vui lòng tải lại", `details: { currentStatus }`.
2. `canTransition(fromStatus, toStatus, role)` sai (§11) -> 409 `INVALID_STATUS_TRANSITION`, `details: { from, to, allowed }`. `PENDING_PAYMENT -> CONFIRMED` là SYSTEM nên staff cũng nhận lỗi này.
3. Trường bắt buộc theo chuyển (thiếu -> 400 `VALIDATION_ERROR` đúng field):
   - `PROCESSING -> SHIPPING`: `trackingNumber` bắt buộc; `carrier` tùy chọn.
   - `FAILED_DELIVERY -> SHIPPING`: `trackingNumber`/`carrier` tùy chọn, có thì ghi đè.
   - `-> FAILED_DELIVERY`: `note` (lý do) bắt buộc.
   - `PROCESSING -> CANCELLED`: `note` bắt buộc.

Tác dụng phụ (cùng transaction):

- `-> CANCELLED`: gọi hàm dùng chung `cancelOrderTx` (actor = role, `actorId`, `reason` = `note` hoặc mặc định "Cửa hàng hủy đơn"): hoàn kho `ORDER_RELEASE`, hoàn lượt mã (D-004). Đơn online đã `PAID`: `paymentStatus` giữ `PAID` cho tới khi admin ghi nhận hoàn tiền (§13.7).
- `-> CONFIRMED`: `confirmedAt = now`.
- `-> DELIVERED`: `deliveredAt = now`; đơn COD -> `paymentStatus = PAID`, `paidAt = now`; `Product.soldCount += quantity` theo `productId` (khóa Product theo `id` tăng dần).
- Mọi chuyển dùng `UPDATE ... WHERE id AND status = fromStatus` (0 dòng -> 409 `CONFLICT` như bước 1), ghi `OrderStatusHistory` (`actorId`, `note`) và AuditLog `order.status` với diff `{ "status": [from, to], "trackingNumber"?: [...], "carrier"?: [...] }`.

200 `{ data: AdminOrder }`. Từ M5 hệ thống gửi email đổi trạng thái nền sau commit (§13.9, D-016); M4 không gửi.

#### Phiếu giao hàng

Không có endpoint `/print`. Phiếu giao là trang FE `/admin/don-hang/[code]/in`, dùng dữ liệu `GET /admin/orders/:code` và `window.print()`.

### 12.2 Tồn kho (Staff)

Quy tắc nền: `stock` CHỈ thay đổi qua đặt/hủy đơn, endpoint adjust (dưới đây) và tồn ban đầu khi tạo biến thể (§12.4). `PATCH /admin/variants/:id` không nhận `stock`. `InventoryMovement` là sổ cái bất biến (chỉ thêm).

#### `GET /admin/inventory`

Query: `q` (1–100, khớp `sku` hoặc tên sản phẩm, không dấu, không phân biệt hoa thường), `stockStatus` (nhiều giá trị, phẩy): `OUT_OF_STOCK` (stock = 0) | `LOW_STOCK` (0 < stock <= `lowStockThreshold`) | `IN_STOCK` (stock > `lowStockThreshold`); `productId`; `sort` = `stock_asc` (mặc định) | `name` | `updated`; `page`, `pageSize`. Chỉ gồm biến thể và sản phẩm chưa xóa mềm (kể cả biến thể `isActive = false` và sản phẩm `DRAFT`/`ARCHIVED`).

Item `InventoryItem`:

```json
{
  "variantId": "clx...",
  "sku": "ETH-YIRG-250",
  "variantName": "Gói 250 g",
  "productId": "clx...",
  "productName": "Ethiopia Yirgacheffe",
  "productStatus": "ACTIVE",
  "imageUrl": "/uploads/products/2026/11/ab12....webp",
  "stock": 12,
  "lowStockThreshold": 5,
  "stockStatus": "IN_STOCK",
  "isActive": true,
  "updatedAt": "2026-11-10T08:30:00.000Z"
}
```

`imageUrl` là ảnh chính của sản phẩm (hoặc `null`).

#### `POST /admin/inventory/adjust`

Body: `{ variantId, reason, change?, newStock?, note?, expectedStock? }`.

| `reason`     | Yêu cầu                                                                    |
| ------------ | -------------------------------------------------------------------------- |
| `RESTOCK`    | `change` > 0                                                               |
| `DAMAGE`     | `change` < 0, `note` bắt buộc                                              |
| `ADJUSTMENT` | `change` != 0, `note` bắt buộc                                             |
| `STOCKTAKE`  | `newStock` >= 0 bắt buộc (kiểm kê, đặt tồn tuyệt đối), không dùng `change` |

`change` là int, `|change| <= 100000`; `newStock` 0–100000; `note` <= 255. `reason = ORDER_RESERVE` hoặc `ORDER_RELEASE` -> 400 `VALIDATION_ERROR`. `expectedStock` (tùy chọn) khác tồn hiện tại -> 409 `CONFLICT`, `details: { currentStock }`.

Thực thi trong transaction: khóa biến thể (`SELECT ... FOR UPDATE`); biến thể không tồn tại/đã xóa mềm -> 404; tồn sau điều chỉnh < 0 -> 409 `CONFLICT` "Tồn kho không đủ để giảm", `details: { currentStock }`; `STOCKTAKE` không đổi số -> 200 với `movement: null` (không ghi movement/audit). Ngược lại: ghi `InventoryMovement` (`change`, `stockAfter`, `reason`, `actorId`, `note`), cập nhật denormalize `Product.inStock` (khóa Product SAU Variant – cùng thứ tự với đặt/hủy đơn), ghi AuditLog `inventory.adjust` với diff `{ "stock": [old, new], "reason": [null, reason] }`.

200 `{ data: { item: InventoryItem, movement: InventoryMovementDto | null } }`.

#### `GET /admin/inventory/movements`

Query: `variantId`, `reason` (InventoryReason[]), `from`, `to`, `page`, `pageSize`. Sắp `createdAt DESC, id DESC`.

`InventoryMovementDto`:

```json
{
  "id": "clx...",
  "variantId": "clx...",
  "sku": "ETH-YIRG-250",
  "productName": "Ethiopia Yirgacheffe",
  "variantName": "Gói 250 g",
  "change": -2,
  "stockAfter": 10,
  "reason": "ORDER_RESERVE",
  "orderCode": "BB-261110-A2B3",
  "actor": { "id": "clx...", "fullName": "Trần B" },
  "note": null,
  "createdAt": "2026-11-10T08:30:00.000Z"
}
```

`orderCode` và `actor` là `null` khi không áp dụng (điều chỉnh tay không có đơn; hệ thống không có actor).

### 12.3 Danh mục & thương hiệu

**Quy tắc URL ảnh** (áp dụng cho `imageUrl`, `logoUrl`, `url` ảnh sản phẩm): chuỗi <= 500 ký tự, và là (a) đường dẫn tương đối bắt đầu `/uploads/` (không chứa `..`, `\`, `//`), hoặc (b) URL `https://`. Mọi scheme khác (`javascript:`, `data:`, `http:`...) -> 400 `VALIDATION_ERROR`.

**Slug.** Khi tạo, không gửi `slug` thì sinh từ `name`: bỏ dấu tiếng Việt, `đ -> d`, lowercase, nối bằng gạch ngang. Định dạng `^[a-z0-9]+(?:-[a-z0-9]+)*$`, 2–120 ký tự. Trùng -> 409 `SLUG_TAKEN` (`details: { field: "slug" }`).

#### Danh mục

- `GET /admin/categories` (Staff) – cây 2 cấp gồm cả danh mục inactive, sắp `sortOrder, name`, không phân trang:

```json
{
  "data": [
    {
      "id": "clx...",
      "parentId": null,
      "name": "Dụng cụ pha chế",
      "slug": "dung-cu-pha-che",
      "description": null,
      "imageUrl": null,
      "sortOrder": 0,
      "isActive": true,
      "productCount": 0,
      "children": [
        {
          "id": "clx...",
          "parentId": "clx...",
          "name": "Phễu V60",
          "slug": "pheu-v60",
          "description": null,
          "imageUrl": null,
          "sortOrder": 0,
          "isActive": true,
          "productCount": 7,
          "children": []
        }
      ]
    }
  ]
}
```

`productCount` = số sản phẩm chưa xóa mềm (mọi status), chỉ của chính danh mục đó (không cộng con).

- `POST /admin/categories` (Staff) – `name` 2–100; `slug` tùy chọn; `parentId` tùy chọn (phải là danh mục gốc, nếu không -> 400 field `parentId` "Chỉ hỗ trợ danh mục 2 cấp"); `description` <= 1000; `imageUrl` (quy tắc URL ảnh) hoặc `null`; `sortOrder` 0–9999 (mặc định 0); `isActive` (mặc định true). 201 `AdminCategory` (như node trên, không có `children`).
- `PATCH /admin/categories/:id` (Staff) – các trường như trên, đều tùy chọn (>= 1 trường). `parentId: null` để đưa thành danh mục gốc. Không cho tự làm cha của chính nó; danh mục đang có con không được gán `parentId` (400 field `parentId`). 200 `AdminCategory`.
- `DELETE /admin/categories/:id` (**Admin**) – chỉ khi không có danh mục con VÀ không có sản phẩm nào (kể cả đã xóa mềm, vì FK Restrict). Ngược lại 409 `CONFLICT` "Danh mục còn danh mục con hoặc sản phẩm; hãy ẩn danh mục thay vì xóa", `details: { childCount, productCount }`. 204.

#### Thương hiệu

`AdminBrand`: `{ id, name, slug, logoUrl, productCount, createdAt, updatedAt }`.

- `GET /admin/brands` (Staff) – mọi brand, sắp `name`, không phân trang; `productCount` = sản phẩm chưa xóa mềm.
- `POST /admin/brands` (Staff) – `name` 2–100; `slug` tùy chọn; `logoUrl` hoặc `null`. 201 `AdminBrand`.
- `PATCH /admin/brands/:id` (Staff) – như trên, tùy chọn (>= 1). 200.
- `DELETE /admin/brands/:id` (**Admin**) – còn sản phẩm chưa xóa mềm tham chiếu -> 409 `CONFLICT`, `details: { productCount }`. 204.

**Ghi chú cache.** Storefront dùng SSR/ISR nên thay đổi danh mục/sản phẩm có thể hiện chậm tới hết thời gian revalidate hiện có.

### 12.4 Sản phẩm, biến thể, ảnh, upload

Staff làm được mọi thao tác dưới đây, trừ `DELETE /admin/products/:id` (Admin).

#### Sản phẩm

- `GET /admin/products` (Staff) – query: `q` (tên/slug, không dấu), `status` (ProductStatus[]), `categoryId`, `brandId`, `deleted` (`false` mặc định | `true` = chỉ đã xóa mềm), `sort` = `newest` (mặc định) | `updated` | `name`, phân trang. Item:

```json
{
  "id": "clx...",
  "slug": "ethiopia-yirgacheffe",
  "name": "Ethiopia Yirgacheffe",
  "status": "ACTIVE",
  "isFeatured": false,
  "category": { "id": "clx...", "name": "Cà phê hạt" },
  "brand": { "id": "clx...", "name": "BeanBox" },
  "primaryImageUrl": "/uploads/...",
  "minPrice": 165000,
  "variantCount": 2,
  "totalStock": 30,
  "inStock": true,
  "deletedAt": null,
  "createdAt": "2026-11-10T08:30:00.000Z",
  "updatedAt": "2026-11-10T08:30:00.000Z"
}
```

`brand` có thể `null`; `variantCount` chỉ đếm biến thể chưa xóa; `totalStock` = tổng tồn các biến thể chưa xóa.

- `GET /admin/products/:id` (Staff) – `AdminProduct`: `{ id, slug, name, shortDesc, description, status, isFeatured, tags, seoTitle, seoDesc, categoryId, brandId, coffee, images, variants, minPrice, inStock, soldCount, ratingAvg, ratingCount, deletedAt, createdAt, updatedAt }`, trong đó `coffee` = `CoffeeProfile` đủ trường hoặc `null`; `images` = `[{ id, url, alt, sortOrder, isPrimary }]` sắp `sortOrder`; `variants` = `AdminVariant[]` chưa xóa mềm, sắp `sortOrder`. Trả cả sản phẩm đã xóa mềm (để xem).
- `AdminVariant`: `{ id, sku, name, attributes, price, salePrice, saleStart, saleEnd, effectivePrice, isOnSale, stock, lowStockThreshold, stockStatus, weightGram, roastDate, sortOrder, isActive, createdAt, updatedAt }`.
- `POST /admin/products` (Staff) – `name` 2–200; `slug` (như §12.3; từ 0.13 không được là slug dành riêng `compare`, kể cả khi sinh từ tên, vi phạm -> 400 `VALIDATION_ERROR` field `slug` "Slug này được hệ thống dành riêng, vui lòng chọn slug khác", vì `GET /products/compare` che `GET /products/:slug`, §4.7); `categoryId` (phải tồn tại, không thì 400 field `categoryId`); `brandId` hoặc `null`; `shortDesc` <= 300; `description` <= 20000 (Markdown; storefront render không cho HTML thô); `status` (mặc định `DRAFT`); `isFeatured`; `tags` (<= 20 phần tử, mỗi tag 1–30 ký tự, trim, lowercase, bỏ trùng); `seoTitle` <= 120 hoặc `null`; `seoDesc` <= 300 hoặc `null`; `coffee` hoặc `null`: `{ originCountry? (<= 60), originRegion? (<= 60), variety? (<= 60), process?, roastLevel?, altitude? (0–3000), tastingNotes (<= 10 phần tử, mỗi 1–40), brewMethods (BrewMethod[]) }`. 201 `AdminProduct`. Cập nhật denormalize `searchText`, `minPrice`, `inStock`.
- **Quy tắc hiển thị.** `status = ACTIVE` yêu cầu có >= 1 biến thể `isActive` chưa xóa; vi phạm -> 400 field `status` "Cần ít nhất 1 biến thể đang bán để hiển thị sản phẩm". Vì vậy tạo mới nên luôn là `DRAFT`/`ARCHIVED` (tạo mới với `ACTIVE` luôn vi phạm vì chưa có biến thể).
- `PATCH /admin/products/:id` (Staff) – mọi trường của POST đều tùy chọn (>= 1 trường); đổi `slug` sang `compare` bị từ chối như POST; `coffee: null` xóa hồ sơ cà phê. Sản phẩm đã xóa mềm -> 404. Ghi AuditLog với diff. 200 `AdminProduct`.
- `DELETE /admin/products/:id` (**Admin**) – xóa mềm: `deletedAt = now`, `status = ARCHIVED`; slug vẫn bị giữ; giỏ chứa biến thể của nó sẽ hiện `UNAVAILABLE`. Đã xóa -> 404. 204. M4 không có khôi phục.

#### Biến thể

- `POST /admin/products/:id/variants` (Staff) – `sku` (trim, uppercase, `^[A-Z0-9][A-Z0-9-]{1,39}$`, duy nhất kể cả biến thể đã xóa -> 409 `SKU_TAKEN`); `name` 1–100; `attributes` object string->string (<= 10 key, key 1–30, value 1–50); `price` 1–100.000.000; `salePrice` hoặc `null` (> 0 và < `price`); `saleStart`, `saleEnd` ISO datetime hoặc `null` (`saleStart < saleEnd`); `stock` 0–100000 (mặc định 0; tồn ban đầu: nếu > 0 ghi `InventoryMovement` `reason = STOCKTAKE`, `note = "Tồn kho ban đầu"`); `lowStockThreshold` 0–1000 (mặc định 5); `weightGram` 0–100000; `roastDate` `YYYY-MM-DD` hoặc `null`; `sortOrder` 0–9999; `isActive` (mặc định true). 201 `AdminVariant`. Cập nhật denormalize của sản phẩm.
- `PATCH /admin/variants/:id` (Staff) – các trường như trên TRỪ `stock` (bị bỏ qua; đổi tồn dùng §12.2); kiểm `salePrice < price` theo giá trị SAU cập nhật. Biến thể đã xóa -> 404. 200 `AdminVariant`.
- `DELETE /admin/variants/:id` (Staff) – xóa mềm (`deletedAt = now`, `isActive = false`). 204.
- **Chặn biến thể đang bán cuối cùng.** Nếu sản phẩm đang `ACTIVE` và thao tác (DELETE hoặc PATCH `isActive: false`) làm sản phẩm không còn biến thể active nào -> 409 `CONFLICT` "Hãy chuyển sản phẩm sang Nháp trước khi ngừng bán biến thể cuối cùng".

#### Ảnh sản phẩm

Mọi thao tác ảnh trả 200 `{ data: images[] }` (danh sách ảnh mới nhất, sắp `sortOrder`); riêng POST trả 201. Ảnh không thuộc sản phẩm -> 404.

- `POST /admin/products/:id/images` – `{ url, alt?, isPrimary? }`: `url` theo quy tắc §12.3, `alt` <= 200. Tối đa 10 ảnh/sản phẩm (vượt -> 409 `CONFLICT`). Ảnh đầu tiên tự là ảnh chính; `sortOrder` = cuối danh sách.
- `PATCH /admin/products/:id/images/:imageId` – `{ alt?, isPrimary?: true }`. Đặt ảnh chính: bỏ cờ ảnh cũ trước rồi đặt ảnh mới trong cùng transaction (do partial unique index).
- `PUT /admin/products/:id/images/order` – `{ imageIds: string[] }` phải đúng bằng tập ảnh hiện có (thiếu/thừa/trùng -> 400); `sortOrder` = vị trí trong mảng.
- `DELETE /admin/products/:id/images/:imageId` – xóa bản ghi; nếu là ảnh chính thì ảnh có `sortOrder` nhỏ nhất còn lại thành ảnh chính; file trên đĩa giữ nguyên.

#### `POST /admin/uploads` – Staff (30/phút/IP)

Body là file nhị phân thô; header `Content-Type` ∈ `image/jpeg`, `image/png`, `image/webp`; tối đa 5 MB. Server kiểm magic bytes khớp `Content-Type` (JPEG `FF D8 FF`; PNG `89 50 4E 47 0D 0A 1A 0A`; WebP `RIFF....WEBP`). Sai loại/không khớp -> 400 `VALIDATION_ERROR` (field `file`, "Chỉ chấp nhận ảnh JPG, PNG hoặc WebP"); quá 5 MB -> 413 `PAYLOAD_TOO_LARGE`. File lưu tại `backend/uploads/products/<yyyy>/<mm>/<32 hex ngẫu nhiên>.<jpg|png|webp>` (không dùng tên file client). Response 201:

```json
{
  "data": {
    "url": "/uploads/products/2026/11/9f2c1a7e4b3d4c0a8e5f6a7b8c9d0e1f.webp",
    "contentType": "image/webp",
    "size": 183420
  }
}
```

Ghi AuditLog `upload.create`. Upload xong chưa gắn vào sản phẩm nào; gắn qua `POST /admin/products/:id/images`.

### Làm rõ sau khi triển khai M4 (0.5.1)

- PATCH `coffee` là merge theo trường: không gửi = giữ nguyên, `null` = xóa trường; `coffee: null` xóa cả hồ sơ cà phê. `AdminProduct.coffee` không có `productId`.
- `q` ở `GET /admin/products` khớp `searchText` (tên, tags, mô tả ngắn, không dấu) hoặc slug; mọi `q` ở admin đều escape ký tự `%` và `_`.
- DELETE ảnh trả 200 `{ "data": images[] }`; DELETE product/variant/category/brand trả 204.
- Inventory adjust: reason `STOCKTAKE` mà gửi `change` -> 400; reason khác mà gửi `newStock` -> 400. Thứ tự kiểm: 404 -> `expectedStock` (409) -> tồn âm (409). Tồn sau điều chỉnh > 1.000.000.000 -> 400.
- ID trong query (`productId`, `variantId`, `categoryId`, `brandId`) sai định dạng -> 400; ID trong path sai định dạng -> 404.
- URL ảnh `/uploads/...` bị từ chối nếu sau khi giải mã `%xx` chứa `..`, `\`, `//`, khoảng trắng hoặc ký tự điều khiển.
- Upload: `Content-Type` không phân biệt hoa thường và cho phép kèm tham số; đúng 5 MB được nhận; 413 `PAYLOAD_TOO_LARGE` chỉ ở route upload (body JSON quá lớn ở route khác vẫn là 413 `VALIDATION_ERROR` như cũ).
- Đổi slug (category/brand/product) được phép; FE cảnh báo link cũ sẽ hỏng (chưa có redirect).
- PATCH không thay đổi gì thì không ghi AuditLog; mô tả sản phẩm trong audit chỉ ghi độ dài hoặc "(đã sửa)", không ghi toàn văn.
- Chuyển đơn sang DELIVERED: chỉ đặt `paymentStatus = PAID`/`paidAt` nếu đơn COD chưa PAID.

## 13. Thanh toán online, mã giảm giá admin, hoàn tiền (M5)

Quyết định nền: D-014 (thanh toán online), D-015 (hoàn tiền thủ công, job hết hạn), D-016 (email đổi trạng thái, rate limit cấu hình). Quy ước chung §1, mã lỗi §2, máy trạng thái §11, quy ước admin §12.0 áp dụng nguyên. Hướng dẫn cấu hình sandbox: [`payments-setup.md`](payments-setup.md).

### 13.0 Cấu hình và bật phương thức

- **VNPAY** bật khi có cả `VNPAY_TMN_CODE` và `VNPAY_HASH_SECRET`. **STRIPE** bật khi có `STRIPE_SECRET_KEY`; khóa bắt buộc dạng `sk_test_`, khóa `sk_live_` -> backend từ chối khởi động (D-014).
- Thiếu cấu hình -> phương thức tắt: `POST /checkout/quote` trả `paymentMethods[].enabled = false` (§9.1); `POST /orders` với phương thức đó -> 409 `PAYMENT_METHOD_UNAVAILABLE`.
- `STRIPE_WEBHOOK_SECRET` tùy chọn. Thiếu thì `POST /payments/stripe/webhook` trả 503 `SERVICE_UNAVAILABLE`; đơn vẫn xác nhận được qua `POST /payments/stripe/sync` (§13.4).
- Env khác: `VNPAY_PAYMENT_URL` (mặc định `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html`, bắt buộc https), `VNPAY_RETURN_URL` (mặc định `${WEB_APP_URL}/thanh-toan/ket-qua?provider=vnpay`).
- Rate limit cấu hình qua env (D-016): `ORDER_RATE_LIMIT_PER_MIN` (mặc định 10), `COUPON_RATE_LIMIT_PER_MIN` (10), `QUOTE_RATE_LIMIT_PER_MIN` (30); giới hạn chung toàn API `GENERAL_RATE_LIMIT_PER_MIN` (100, M8). Danh sách đầy đủ biến môi trường: `architecture.md` §8.

### 13.1 Tạo đơn online

`POST /orders` (§9.2) với `paymentMethod` = `VNPAY` hoặc `STRIPE` (đã bật) -> đơn `PENDING_PAYMENT`, `paymentStatus = UNPAID`, `expiresAt = now + order.paymentExpiryMinutes` (Setting, mặc định 15), `OrderStatusHistory` `null -> PENDING_PAYMENT`. Trừ kho và giữ lượt mã giống COD (D-004). Email xác nhận ghi "vui lòng thanh toán trước <giờ VN>" (định dạng `HH:mm dd/MM/yyyy`, múi giờ Việt Nam).

`canPay` (boolean, thêm vào `Order` §9 và `TrackedOrder` §9.5) = `status = PENDING_PAYMENT` VÀ `expiresAt > now` VÀ phương thức của đơn đang bật. Với `TrackedOrder` thêm điều kiện là đơn guest (`userId IS NULL`), cùng tinh thần quy tắc hủy đơn D-010 (đơn của tài khoản được thanh toán lại trong "Đơn hàng của tôi"). `Order.expiresAt` đã có từ trước.

### 13.2 Tạo phiên thanh toán

`POST /payments/vnpay/create` và `POST /payments/stripe/create-session` – Optional, rate limit 10/phút/IP (store riêng, đặt trước xác thực như D-011). Body:

```json
{ "code": "BB-261110-K7QP", "phone": "0901234567" }
```

- Quyền giống hủy đơn (§9.4): đã đăng nhập -> chỉ chủ đơn (`phone` bị bỏ qua); không đăng nhập -> chỉ đơn guest VÀ `phone` (chuẩn hóa) khớp `contactPhone`; các trường hợp khác (kể cả `code` sai định dạng) -> 404 `NOT_FOUND` cùng thông báo.
- Điều kiện: `status = PENDING_PAYMENT`, `paymentMethod` khớp provider của endpoint, `expiresAt > now`, phương thức đang bật. Vi phạm -> 409 `PAYMENT_NOT_ALLOWED` với `details.reason` = `STATUS` | `METHOD_MISMATCH` | `EXPIRED` | `UNAVAILABLE`.
- Mỗi lần gọi tạo 1 dòng `Payment` (`provider`, `amount = grandTotal`, `status = PENDING`). `providerRef` = `Payment.id` (VNPay, chính là `vnp_TxnRef`) hoặc Stripe Checkout Session id (cập nhật sau khi Stripe trả về).
- 200 `{ "data": { "redirectUrl": "https://...", "paymentId": "ckpay1", "expiresAt": "2026-11-11T08:45:00.000Z" } }`. URL do server dựng, FE chỉ chuyển hướng (`window.location.assign`), không tự ghép tham số. `expiresAt` là hạn của đơn.
- Lỗi: 400 `VALIDATION_ERROR`; 404; 409 `PAYMENT_NOT_ALLOWED`; 429; 502/503 nếu gọi Stripe lỗi (Payment vừa tạo đặt `FAILED`, lỗi `SERVICE_UNAVAILABLE`, không lộ chi tiết nhà cung cấp).

**VNPay 2.1.0.** Tham số gửi sang cổng:

| Tham số          | Giá trị                                                        |
| ---------------- | -------------------------------------------------------------- |
| `vnp_Version`    | `2.1.0`                                                        |
| `vnp_Command`    | `pay`                                                          |
| `vnp_TmnCode`    | `VNPAY_TMN_CODE`                                               |
| `vnp_Amount`     | `grandTotal * 100`                                             |
| `vnp_CurrCode`   | `VND`                                                          |
| `vnp_TxnRef`     | `Payment.id`                                                   |
| `vnp_OrderInfo`  | `Thanh toan don hang <code>` (ASCII, không dấu)                |
| `vnp_OrderType`  | `other`                                                        |
| `vnp_Locale`     | `vn`                                                           |
| `vnp_ReturnUrl`  | `VNPAY_RETURN_URL`                                             |
| `vnp_IpAddr`     | `req.ip` (theo `TRUST_PROXY`, D-009)                           |
| `vnp_CreateDate` | thời điểm tạo, định dạng `yyyyMMddHHmmss` giờ Việt Nam (UTC+7) |
| `vnp_ExpireDate` | `order.expiresAt`, cùng định dạng và múi giờ                   |

Chữ ký (`vnp_SecureHash`): lấy mọi tham số `vnp_*` (bỏ `vnp_SecureHash`, `vnp_SecureHashType`), sắp theo khóa tăng dần, mã hóa mỗi giá trị bằng `encodeURIComponent` rồi thay `%20` bằng `+`, nối `k=v&k=v...`, tính HMAC-SHA512 bằng `VNPAY_HASH_SECRET`, lấy hex. Khi xác minh dữ liệu từ VNPay dùng đúng cách này trên các tham số nhận được, so sánh bằng `timingSafeEqual` (hex không phân biệt hoa thường; độ dài khác -> sai). URL cuối: `VNPAY_PAYMENT_URL?<chuỗi đã ký>&vnp_SecureHash=<hex>`.

**Stripe Checkout** (gọi REST API bằng `fetch`, KHÔNG dùng SDK `stripe`, D-014): `POST https://api.stripe.com/v1/checkout/sessions`, `Content-Type: application/x-www-form-urlencoded`, `Authorization: Bearer <STRIPE_SECRET_KEY>`, header `Idempotency-Key: <Payment.id>`. Tham số:

- `mode=payment`; 1 line item với `currency=vnd` (VND là đơn vị không thập phân nên `unit_amount = grandTotal`, không nhân 100), `quantity=1`, tên "Đơn hàng <code>".
- `client_reference_id = Payment.id`; `metadata[orderCode]`, `metadata[paymentId]`.
- `success_url = ${WEB_APP_URL}/thanh-toan/ket-qua?provider=stripe&session_id={CHECKOUT_SESSION_ID}`; `cancel_url = ${WEB_APP_URL}/thanh-toan/ket-qua?provider=stripe&cancelled=1&code=<code>`.
- `expires_at = now + 30 phút` (mức tối thiểu Stripe cho phép, dài hơn hạn đơn; hệ quả thanh toán muộn xem §13.5, D-014). Triển khai đặt `now + 31 phút` để không bị Stripe từ chối do độ trễ mạng (0.6.1).
- KHÔNG gửi email, SĐT hay địa chỉ khách sang Stripe.

### 13.3 Xác nhận VNPay

**`GET /payments/vnpay/ipn`** – Public (xác thực bằng chữ ký). Luôn HTTP 200, body JSON `{ "RspCode": "00", "Message": "Confirm Success" }`:

| `RspCode` | Khi nào                                                          |
| --------- | ---------------------------------------------------------------- |
| `97`      | Sai chữ ký                                                       |
| `01`      | Không tìm thấy `Payment` theo `vnp_TxnRef`                       |
| `04`      | Sai số tiền (`vnp_Amount != amount * 100`)                       |
| `02`      | Đã xử lý trước đó (Payment không còn `PENDING` và kết quả trùng) |
| `00`      | Xử lý thành công                                                 |
| `99`      | Lỗi khác                                                         |

Giao dịch thành công khi `vnp_ResponseCode = "00"` VÀ `vnp_TransactionStatus = "00"`; còn lại là thất bại. Kết quả đưa vào hàm xử lý chung §13.5.

**`GET /payments/vnpay/return`** – Public, rate limit 30/phút/IP (store riêng). Trang kết quả của FE (`/thanh-toan/ket-qua?provider=vnpay&vnp_...`) chuyển NGUYÊN query `vnp_*` sang endpoint này. Server xác minh chữ ký; hợp lệ thì chạy CÙNG hàm xử lý idempotent như IPN (môi trường localhost không nhận được IPN, mà dữ liệu đã được VNPay ký nên tương đương IPN; D-014). Sai chữ ký -> 400 `PAYMENT_SIGNATURE_INVALID`. Không tìm thấy Payment -> 404; sai số tiền -> 400 `VALIDATION_ERROR`. 200 `PaymentResult`. Tham số redirect chưa ký không bao giờ được tin.

**`PaymentResult`** (không chứa PII):

```json
{
  "data": {
    "orderCode": "BB-261110-K7QP",
    "result": "SUCCEEDED",
    "orderStatus": "CONFIRMED",
    "paymentStatus": "PAID",
    "canPay": false,
    "expiresAt": "2026-11-11T08:45:00.000Z"
  }
}
```

`result` ∈ `SUCCEEDED` | `FAILED` | `PENDING` (Payment đang chờ, chưa có kết quả ký). `orderStatus`, `paymentStatus`, `canPay`, `expiresAt` là trạng thái đơn hiện tại (`expiresAt` có thể `null` khi không còn áp dụng).

### 13.4 Xác nhận Stripe

**`POST /payments/stripe/webhook`** – Public (xác thực bằng chữ ký). Route nhận RAW body (không qua `express.json`; chữ ký tính trên đúng chuỗi byte gốc).

- Header `Stripe-Signature: t=<timestamp>,v1=<hex>[,v1=<hex>...]`. Tính HMAC-SHA256 của chuỗi `${t}.${rawBody}` bằng `STRIPE_WEBHOOK_SECRET`; khớp BẤT KỲ `v1` nào (so sánh `timingSafeEqual`) là hợp lệ. `|now - t| > 300` giây -> từ chối (chống replay). Thiếu header, sai chữ ký hoặc quá hạn -> 400 `PAYMENT_SIGNATURE_INVALID`.
- Sự kiện xử lý: `checkout.session.completed` (chỉ coi là thành công khi `payment_status = "paid"`; ngược lại bỏ qua chờ sự kiện async), `checkout.session.async_payment_succeeded` (thành công), `checkout.session.async_payment_failed` và `checkout.session.expired` (thất bại).
- Đối chiếu trước khi xử lý: tìm Payment theo `client_reference_id` (hoặc `metadata.paymentId`) VÀ `providerRef = session.id`; `currency = "vnd"`; `amount_total = Payment.amount`. Không khớp -> 200 bỏ qua và ghi log (không báo lỗi để Stripe không retry vô ích).
- Sự kiện loại khác -> 200 bỏ qua. Đã xử lý hoặc trùng -> 200 `{ "received": true }`.
- Không cấu hình `STRIPE_WEBHOOK_SECRET` -> 503 `SERVICE_UNAVAILABLE`.

**`POST /payments/stripe/sync`** – Public, rate limit 30/phút/IP (store riêng). Body `{ "sessionId": "cs_test_..." }`, `sessionId` khớp `^cs_(test_)?[A-Za-z0-9]+$` (sai -> 400 `VALIDATION_ERROR`). Server chỉ gọi Stripe cho `sessionId` đã có `Payment` (`providerRef`), không có -> 404 mà không gọi Stripe. Server TỰ GỌI Stripe `GET /v1/checkout/sessions/:id` (server-to-server, không tin dữ liệu từ client); lỗi Stripe -> 503 `SERVICE_UNAVAILABLE`; Stripe chưa cấu hình -> 409 `PAYMENT_NOT_ALLOWED` (`reason = UNAVAILABLE`), đối chiếu như webhook (kèm `providerRef = sessionId`) rồi chạy hàm xử lý chung §13.5. Không tìm thấy Payment -> 404 `NOT_FOUND`. Phiên chưa thanh toán và chưa hết hạn -> `result = PENDING`. 200 `PaymentResult`. Dùng ở trang kết quả khi người dùng quay về từ Stripe (không phụ thuộc webhook).

### 13.5 Hàm xử lý kết quả chung

Dùng cho VNPay IPN/return và Stripe webhook/sync. Idempotent, chạy trong 1 transaction, khóa `Order` `FOR UPDATE` rồi `Payment` `FOR UPDATE` (thứ tự cố định, tránh deadlock với job hết hạn và hủy đơn).

**Máy trạng thái `Payment`:** `PENDING -> SUCCEEDED | FAILED`; `FAILED -> SUCCEEDED` (thành công muộn đã xác thực); `SUCCEEDED -> REFUNDED` (admin, §13.7). Kết quả trùng với trạng thái hiện tại -> no-op, coi là đã xử lý (`02` ở IPN, `received: true` ở webhook). Chuyển khác (ví dụ `SUCCEEDED -> FAILED`) bị bỏ qua.

**Thành công:** Payment `SUCCEEDED`, lưu `providerTxnId` (`vnp_TransactionNo` hoặc Stripe `payment_intent`) và `rawPayload` (bỏ các trường chữ ký). Tiếp theo:

- Đơn đang `PENDING_PAYMENT` -> `CONFIRMED` (actor SYSTEM, chuyển #1 §11): `paymentStatus = PAID`, `paidAt = now`, `confirmedAt = now`, `OrderStatusHistory` với note "Thanh toán <VNPay|Stripe> thành công". Gửi email §13.9 sau commit.
- Đơn đã `CANCELLED` (thanh toán muộn) HOẶC đã `PAID` bởi Payment khác (trả trùng): KHÔNG đổi trạng thái đơn; đặt `paymentStatus = PAID` nếu đang khác `PAID`/`REFUNDED`; Payment này được tính là cần hoàn tiền (`needsRefund`, §13.7); ghi AuditLog `payment.late` (`actorId = null`, `entity = "Order"`).

**Thất bại:** Payment `FAILED`. Nếu đơn `PENDING_PAYMENT` và `paymentStatus` chưa `PAID` -> `paymentStatus = FAILED` (D-001: đơn vẫn chờ tới hạn để thử lại). Không đổi gì khác.

Ràng buộc unique `(provider, providerTxnId)` trong schema chống xử lý trùng cùng một giao dịch.

### 13.6 Job hết hạn

Chạy trong tiến trình backend mỗi 60 giây (cùng module job dọn dẹp, `pg_try_advisory_xact_lock` với khóa riêng; bật/tắt bằng `JOBS_ENABLED`). Mỗi lượt chọn tối đa 50 đơn `status = PENDING_PAYMENT` và `expiresAt < now` (kể cả `paymentStatus = FAILED`). Mỗi đơn xử lý trong 1 transaction riêng: khóa `Order`, kiểm lại điều kiện (đã đổi trạng thái hoặc đã gia hạn thì bỏ qua), gọi `cancelOrderTx` (actor SYSTEM, `reason` = "Quá hạn thanh toán": hoàn kho, hoàn lượt mã), đặt mọi Payment `PENDING` của đơn thành `FAILED`. Lỗi một đơn không chặn các đơn khác.

Sau commit từng đơn: gửi email hủy (§13.9); best-effort gọi Stripe `POST /v1/checkout/sessions/:id/expire` cho các phiên Stripe còn mở (lỗi chỉ log, không retry).

### 13.7 Hoàn tiền thủ công (Admin)

**`POST /admin/orders/:code/refunds`** – Admin (0.6.1; STAFF nhận 403). Body:

```json
{
  "paymentId": "ckpay1",
  "note": "Đã hoàn qua cổng VNPay sandbox, mã tham chiếu ..."
}
```

`note` bắt buộc, 5–500 ký tự. Điều kiện (kiểm trong transaction, khóa Order rồi Payment):

- Payment thuộc đơn `:code` và đang `SUCCEEDED`, nếu không -> 404 (không thuộc đơn) hoặc 409 `CONFLICT` (không còn `SUCCEEDED`).
- Nếu đơn chưa `CANCELLED` và đây là Payment `SUCCEEDED` duy nhất -> 409 `CONFLICT` "Hãy hủy đơn trước khi hoàn tiền".

Thực hiện: Payment -> `REFUNDED`, ghi `refundedAt = now`, `refundNote = note`, `refundedById = admin`. Nếu đơn không còn Payment `SUCCEEDED` nào -> `Order.paymentStatus = REFUNDED`. AuditLog `payment.refund` (diff gồm `status`, không chứa dữ liệu thẻ). Hệ thống KHÔNG gọi API hoàn tiền của cổng: admin tự hoàn trên cổng/sandbox rồi ghi nhận ở đây (D-015). 200 `{ "data": AdminOrder }`. Lỗi: 400, 404, 409.

**`AdminOrder.payments[]`** (mới nhất trước):

```json
{
  "id": "ckpay1",
  "provider": "VNPAY",
  "amount": 317000,
  "status": "SUCCEEDED",
  "providerTxnId": "14012345",
  "providerRef": "ckpay1",
  "createdAt": "...",
  "updatedAt": "...",
  "refundedAt": null,
  "refundNote": null,
  "needsRefund": false
}
```

`needsRefund` (Payment) = `status = SUCCEEDED` VÀ (đơn `CANCELLED` HOẶC đã có Payment `SUCCEEDED` khác của cùng đơn được tạo trước nó). `AdminOrder.needsRefund` (cấp đơn) = có ít nhất một Payment `needsRefund`. `GET /admin/orders?needsRefund=true` lọc các đơn này (kết hợp AND với bộ lọc khác; `statusCounts` vẫn tính theo quy ước §12.1). `rawPayload` không trả ra API.

### 13.8 Mã giảm giá (Admin)

Quyền Staff; xóa chỉ Admin. Phân trang theo §1. ID trong path theo §12.0.

**`GET /admin/coupons`** – query: `q` (khớp `code`, không phân biệt hoa thường, escape `%`/`_`), `type` (CouponType[], phân cách phẩy), `state` ∈ `ACTIVE` | `SCHEDULED` | `EXPIRED` | `INACTIVE` | `EXHAUSTED`, `page`, `pageSize`. Item gồm mọi trường `Coupon` (`db-schema.md`) cộng `state` tính tại thời điểm gọi theo thứ tự ưu tiên: `INACTIVE` (`isActive = false`) > `EXHAUSTED` (`usageLimit` có giá trị và `usedCount >= usageLimit`) > `EXPIRED` (`endsAt < now`) > `SCHEDULED` (`startsAt > now`) > `ACTIVE`.

**`GET /admin/coupons/:id`** – 200 `{ "data": AdminCoupon }` (cùng shape item danh sách, `scope` giữ nguyên `{ categoryIds, productIds }`).

**`POST /admin/coupons`** – body:

| Trường                       | Ràng buộc                                                                                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `code`                       | trim + uppercase, `^[A-Z0-9_-]{3,30}$`; trùng -> 409 `COUPON_CODE_TAKEN`                                                                                                  |
| `type`                       | `PERCENT` \| `FIXED` \| `FREESHIP`                                                                                                                                        |
| `value`                      | int, theo CHECK `Coupon_value_valid` (`db-schema.md` §4): PERCENT 1–100; FIXED > 0 và <= 100.000.000 (trần do tầng ứng dụng, CHECK DB chỉ yêu cầu > 0); FREESHIP luôn `0` |
| `maxDiscount`                | int > 0 hoặc `null`; chỉ cho PERCENT/FREESHIP, gửi với FIXED -> 400 `VALIDATION_ERROR`                                                                                    |
| `minOrder`                   | int >= 0 (mặc định 0)                                                                                                                                                     |
| `startsAt`, `endsAt`         | ISO 8601 hoặc `null`; nếu cả hai có thì `startsAt < endsAt`                                                                                                               |
| `usageLimit`, `perUserLimit` | int >= 1 hoặc `null`                                                                                                                                                      |
| `scope`                      | `{ categoryIds?: string[], productIds?: string[] }`, mỗi loại tối đa 50; id phải tồn tại (không -> 400 `VALIDATION_ERROR`, nêu field); rỗng -> lưu `null`                 |
| `isActive`                   | boolean (mặc định `true`)                                                                                                                                                 |
| `description`                | string <= 200, tùy chọn                                                                                                                                                   |

201 `{ "data": AdminCoupon }`. `usedCount` luôn khởi tạo 0.

**`PATCH /admin/coupons/:id`** – các trường như trên (merge theo trường; `null` xóa trường nullable). KHÔNG đổi `code`, `type` (gửi -> 400). `usageLimit` nhỏ hơn `usedCount` hiện tại -> 400 `VALIDATION_ERROR`. Kiểm tra ràng buộc chéo (`startsAt < endsAt`, `maxDiscount` với FIXED) trên giá trị sau khi gộp. 200 `AdminCoupon`.

**`DELETE /admin/coupons/:id`** – Admin. Mã đã có `CouponRedemption` hoặc `Order` tham chiếu -> 409 `CONFLICT` "Mã đã được dùng, hãy tắt mã thay vì xóa". Thành công 204.

AuditLog `coupon.create|update|delete` (§12.0). Thay đổi có hiệu lực ngay ở giỏ và quote vì giá/mã tính lại mỗi lần (§10); đơn đã tạo không đổi.

### 13.9 Email đổi trạng thái đơn

Sau commit, gửi nền tới `contactEmail` khi đơn sang: `CONFIRMED`; `SHIPPING` (kèm mã vận đơn và đơn vị vận chuyển nếu có); `DELIVERED`; `CANCELLED` (kèm lý do; áp dụng cho khách tự hủy, staff hủy và hết hạn thanh toán). Không gửi cho các chuyển khác (`PROCESSING`, `FAILED_DELIVERY`...). Áp dụng cho mọi nguồn chuyển trạng thái (admin, khách, SYSTEM từ thanh toán, job). Link trong email giống email xác nhận đơn (§9.2): user -> `${WEB_APP_URL}/tai-khoan/don-hang/<code>`, guest -> `${WEB_APP_URL}/tra-cuu-don-hang?code=<code>`, KHÔNG đưa SĐT vào URL. Lỗi gửi mail chỉ ghi log, không ảnh hưởng đơn (D-016).

## 14. Hoàn thiện v1 (M6, M6b)

Mục 14.1–14.8 thuộc M6; 14.9–14.12 thuộc M6b (D-021..D-024); chỉ newsletter còn hoãn (14.13). Quyền: P = Public, O = Optional, A = Auth, S = Staff+, AD = Admin. Quyết định nền: D-017..D-020. Quy ước chung ở §1, mã lỗi ở §2, máy trạng thái ở §11, quy ước admin (không cache, audit, ngày lọc giờ VN) ở §12.0 áp dụng nguyên cho các endpoint dưới đây.

### 14.1 Đánh giá sản phẩm (FR-REV)

**Quy tắc (D-017)**

- Chỉ người đã mua mới được đánh giá: user có `OrderItem` của sản phẩm thuộc đơn của mình ở trạng thái `DELIVERED`.
- Mỗi user tối đa **1 đánh giá/sản phẩm** (kể cả mua nhiều lần). Server tự gắn `orderItemId` = dòng `DELIVERED` sớm nhất của user cho sản phẩm đó mà chưa có review (client không gửi `orderItemId`).
- Đăng ngay với `status = PUBLISHED`; staff ẩn sau (hậu kiểm). Review `HIDDEN` không hiện ở API công khai và không tính vào điểm trung bình.
- Sửa được trong **30 ngày kể từ `createdAt`** (chỉ `rating`, `content`). M6 KHÔNG nhận ảnh: `images` luôn là `[]`.
- `content` là văn bản thuần (không HTML/Markdown), FE hiển thị dạng text và giữ xuống dòng; server `trim`, không diễn giải thẻ.
- Tên hiển thị `authorName` được che bớt: từ cuối của `fullName` giữ nguyên, các từ trước chỉ lấy chữ cái đầu viết hoa kèm dấu chấm, ví dụ "Nguyễn Văn An" -> "An N. V."; tên một từ giữ nguyên. API công khai không trả email, `userId`.
- Rate limit ghi đánh giá (`POST /products/:slug/reviews`, `PATCH /reviews/:id`): 10/phút/IP, store riêng, đặt trước bước xác thực như các limiter ở §1.

**Shape `Review` (công khai)**

```json
{
  "id": "ckr1",
  "rating": 5,
  "content": "Thơm, hậu ngọt.",
  "authorName": "An N. V.",
  "verifiedPurchase": true,
  "createdAt": "2026-11-11T03:00:00.000Z",
  "updatedAt": "2026-11-11T03:00:00.000Z",
  "reply": "Cảm ơn bạn đã ủng hộ BeanBox.",
  "repliedAt": "2026-11-12T02:00:00.000Z"
}
```

`verifiedPurchase` luôn `true` (mọi review đều từ đơn đã giao). `reply`, `repliedAt` là `null` khi chưa trả lời. `MyReview` = `Review` + `status` (`PUBLISHED` | `HIDDEN`) và `images: []`.

**`GET /products/:slug/reviews` – Public.** Chỉ review `PUBLISHED`. Query: `rating` (1–5, nhiều giá trị phân cách phẩy, ví dụ `rating=4,5`), `sort` = `newest` (mặc định) | `highest` | `lowest` (cùng điểm thì mới nhất trước; tie-break `id DESC`), `page`, `pageSize` (§1). Response phân trang kèm `meta.summary` (tính trên TẤT CẢ review `PUBLISHED`, không bị ảnh hưởng bởi lọc `rating`):

```json
{
  "data": [{ "...": "Review" }],
  "meta": {
    "page": 1,
    "pageSize": 10,
    "total": 18,
    "totalPages": 2,
    "summary": {
      "ratingAvg": 4.6,
      "ratingCount": 18,
      "distribution": { "1": 0, "2": 1, "3": 1, "4": 4, "5": 12 }
    }
  }
}
```

`ratingAvg` làm tròn 1 chữ số thập phân (0 khi chưa có review); `distribution` luôn đủ 5 khóa. Slug không tồn tại hoặc sản phẩm không hiển thị (DRAFT/ARCHIVED/đã xóa) -> 404 `NOT_FOUND`; slug cũ -> 404 kèm `details.movedTo` (§14.5).

**`GET /products/:slug/reviews/me` – Auth.** Cho FE quyết định hiện form:

```json
{
  "data": {
    "canReview": false,
    "reason": "ALREADY_REVIEWED",
    "review": { "...": "MyReview" },
    "canEdit": true
  }
}
```

`reason` = `null` (được viết) | `"NOT_PURCHASED"` | `"ALREADY_REVIEWED"`. `review` là `MyReview` hoặc `null` (kể cả khi đang `HIDDEN`, để tác giả biết). `canEdit` = có review và còn trong 30 ngày. Sản phẩm không hiển thị -> 404.

**`POST /products/:slug/reviews` – Auth** (từ 0.7 dùng `:slug` thay cho `:productId` cho nhất quán với storefront). Body: `{ "rating": 1–5 (int), "content": string 0–2000 (trim, có thể rỗng) }`. Thành công 201 `MyReview`. Lỗi: 400 `VALIDATION_ERROR`; 404 `NOT_FOUND` (sản phẩm không hiển thị); 409 `REVIEW_NOT_ALLOWED` với `details.reason` = `NOT_PURCHASED` | `ALREADY_REVIEWED`; 429 `RATE_LIMITED`.

**`PATCH /reviews/:id` – Auth**, chỉ tác giả (review của người khác hoặc không tồn tại -> 404 `NOT_FOUND`, §1). Body `{ "rating"?, "content"? }`, ít nhất 1 trường, ràng buộc như POST. Quá 30 ngày kể từ `createdAt` -> 409 `REVIEW_EDIT_EXPIRED`. Review đang `HIDDEN` vẫn sửa được nhưng giữ nguyên `HIDDEN` (tác giả không tự hiện lại được). Thành công 200 `MyReview`; `updatedAt` đổi.

**Denormalize.** `Product.ratingAvg/ratingCount` = trung bình / số review `PUBLISHED`, tính lại trong CÙNG transaction khi tạo, sửa `rating`, ẩn, hiện review (khóa dòng Product trước để tuần tự hóa; dùng luôn khóa này để chặn 2 request đồng thời cùng tạo review cho một cặp user + sản phẩm). Ghi chú: dữ liệu seed có `ratingAvg/ratingCount` giả cho dev; khi sản phẩm có review thật đầu tiên, giá trị được tính lại từ review thật (giá trị giả biến mất).

**Admin (Staff)**

- `GET /admin/reviews`: lọc `status` (`PUBLISHED` | `HIDDEN`), `rating` (1–5), `productId`, `q` (tìm trong nội dung, không phân biệt hoa thường, escape ký tự `%`, `_`, `\` của LIKE), `hasReply` (`true` | `false`); phân trang; sắp `createdAt DESC, id DESC`. Item = `Review` + `status`, `images: []`, `product: { id, name, slug }`, `author: { id, fullName, email }` (admin thấy tên đầy đủ; `authorName` đã che vẫn có sẵn).
- `PATCH /admin/reviews/:id` body `{ "status": "PUBLISHED" | "HIDDEN" }` -> 200 item admin. Trạng thái không đổi thì trả 200 (idempotent, không ghi audit). Tính lại `ratingAvg/ratingCount`.
- `PUT /admin/reviews/:id/reply` body `{ "reply": string 1–1000 (trim) }` -> 200 item admin; ghi đè câu trả lời cũ, đặt `repliedAt = now`.
- `DELETE /admin/reviews/:id/reply` -> 200 item admin (`reply`, `repliedAt` = `null`); chưa có reply thì vẫn 200.
- AuditLog `review.hide|show|reply|reply_delete` (`entity = "Review"`, `diff` chỉ ghi trạng thái, không chép nội dung đánh giá). Thay cho `POST /admin/reviews/:id/reply` ở bảng M6 cũ.

### 14.2 Wishlist (FR-WISH)

- **`GET /me/wishlist` – Auth.** Danh sách `ProductListItem` (§4) kèm `addedAt` (= `Wishlist.createdAt`), sắp `addedAt DESC`. Chỉ sản phẩm `ACTIVE` chưa xóa mềm (sản phẩm bị ẩn/xóa không hiện nhưng KHÔNG tự bị xóa khỏi bảng, hiện lại nếu sản phẩm hiển thị trở lại). Tối đa 100, không phân trang (`data` là mảng).
- **`GET /me/wishlist/ids` – Auth.** `{ "data": { "productIds": ["ckp1", "..."] } }` (cùng điều kiện hiển thị) để FE tô trái tim ở danh sách sản phẩm.
- **`POST /me/wishlist` – Auth.** Body `{ "productId": string }`. Sản phẩm phải `ACTIVE` chưa xóa, ngược lại 404 `NOT_FOUND`. Đã có -> 200 (idempotent); mới -> 201. Trả `{ "data": { "productId", "addedAt" } }`. Đã đủ 100 mục (đếm cả mục của sản phẩm đang ẩn) và thêm mục mới -> 409 `WISHLIST_LIMIT`.
- **`DELETE /me/wishlist/:productId` – Auth.** 204, idempotent (không có hoặc sản phẩm không tồn tại vẫn 204).

### 14.3 Dashboard (FR-ADM-01)

`GET /admin/dashboard` – Staff. Mọi mốc ngày theo giờ Việt Nam (UTC+7); "hôm nay" tính từ 00:00 VN; `last7Days` gồm hôm nay và 6 ngày trước; `last30Days` gồm hôm nay và 29 ngày trước.

```json
{
  "data": {
    "revenue": {
      "today": 1250000,
      "last7Days": 8420000,
      "last30Days": 31200000
    },
    "orders": { "today": 4, "last7Days": 31, "last30Days": 120 },
    "dailyRevenue": [{ "date": "2026-10-13", "revenue": 0, "orders": 2 }],
    "ordersByStatus": {
      "PENDING_PAYMENT": 1,
      "PENDING": 3,
      "CONFIRMED": 0,
      "PROCESSING": 2,
      "SHIPPING": 1,
      "DELIVERED": 40,
      "CANCELLED": 5,
      "FAILED_DELIVERY": 0,
      "RETURN_REQUESTED": 0,
      "RETURNED": 0
    },
    "topProducts": [
      {
        "productId": "ckp1",
        "name": "Ethiopia Yirgacheffe Washed",
        "slug": "ethiopia-yirgacheffe-washed",
        "quantity": 12,
        "revenue": 2220000
      }
    ],
    "lowStock": [
      {
        "variantId": "ckv1",
        "sku": "ETH-250-WB",
        "productName": "Ethiopia Yirgacheffe Washed",
        "variantName": "250 g / Nguyên hạt",
        "stock": 2,
        "lowStockThreshold": 5
      }
    ],
    "attention": { "pendingOrders": 3, "needsRefund": 1 },
    "generatedAt": "2026-11-11T04:00:00.000Z"
  }
}
```

- `revenue.*` = Σ `grandTotal` của đơn có `paymentStatus = PAID` và `status` không thuộc {`CANCELLED`, `RETURNED`}, với `paidAt` nằm trong khoảng. Tính theo `paidAt`, không theo `createdAt` (D-019). Đơn COD chỉ tính khi đã `PAID` (giao thành công, §11). Đơn đã hoàn tiền (`paymentStatus = REFUNDED`) không tính.
- `orders.*` = số đơn có `createdAt` trong khoảng (mọi trạng thái).
- `dailyRevenue`: đúng 30 phần tử, tăng dần theo `date` (`YYYY-MM-DD`, giờ VN), ngày không có dữ liệu = `revenue: 0, orders: 0`. `revenue` theo định nghĩa `paidAt` ở trên, `orders` theo `createdAt`, nhóm theo ngày VN.
- `ordersByStatus`: toàn thời gian, đủ khóa cho mọi giá trị `OrderStatus` (thiếu = 0).
- `topProducts`: tối đa 5 sản phẩm, xếp theo tổng `quantity` của `OrderItem` thuộc đơn tạo trong 30 ngày qua có `status` không thuộc {`CANCELLED`, `PENDING_PAYMENT`}, giảm dần (hòa thì `revenue` giảm dần, rồi `productId`); `revenue` = Σ `lineTotal`. `name`/`slug` lấy từ Product hiện tại.
- `lowStock`: tối đa 10 biến thể `isActive` chưa xóa, thuộc sản phẩm chưa xóa, có `stock <= lowStockThreshold`, sắp `stock` tăng dần (hòa thì `sku`).
- `attention`: chỉ `pendingOrders` (số đơn `PENDING` hiện tại) và `needsRefund` (số đơn cần hoàn tiền, định nghĩa như §12.1). Chưa có chỉ số đánh giá bị ẩn.
- Có `Cache-Control: no-store` (§12.0). FE vẽ biểu đồ bằng CSS (không thêm thư viện biểu đồ).

### 14.4 Nhật ký thao tác (FR-ADM-11)

`GET /admin/audit-logs` – **Admin** (Staff nhận 403 `FORBIDDEN`). Query (đều tùy chọn): `action` (một hoặc nhiều giá trị phân cách phẩy, khớp chính xác), `actionPrefix` (ví dụ `order.`; khớp đầu chuỗi, escape LIKE; dùng cùng `action` thì lấy hợp), `entity`, `entityId`, `actorId`, `from`, `to` (`YYYY-MM-DD` giờ VN, bao gồm hai đầu, §12.0), `page`, `pageSize`. Sắp `createdAt DESC, id DESC`.

```json
{
  "data": [
    {
      "id": "cka1",
      "action": "order.status",
      "entity": "Order",
      "entityId": "cko1",
      "diff": { "status": ["PENDING", "CONFIRMED"] },
      "ip": "127.0.0.1",
      "createdAt": "2026-11-11T03:00:00.000Z",
      "actor": {
        "id": "cku1",
        "fullName": "Nhân viên",
        "email": "staff@beanbox.local",
        "role": "STAFF"
      }
    }
  ],
  "meta": { "page": 1, "pageSize": 20, "total": 1, "totalPages": 1 }
}
```

`actor` là `null` khi hệ thống ghi (`actorId` null) hoặc tài khoản đã bị xóa. Chỉ Admin xem (D-019); `diff` đã không chứa bí mật/PII theo §12.0, API trả nguyên.

### 14.5 Redirect khi đổi slug (D-018)

Bảng `SlugRedirect` (`db-schema.md`, migration `m6_slug_redirect`): `{ entity: PRODUCT | CATEGORY, fromSlug, targetId }`, unique `(entity, fromSlug)`.

**Ghi.** Khi admin đổi slug sản phẩm hoặc danh mục (`PATCH /admin/products/:id`, `PATCH /admin/categories/:id`), trong cùng transaction:

1. Upsert redirect `(entity, fromSlug = slug cũ) -> targetId`.
2. Nếu slug MỚI trùng một `fromSlug` đã lưu của cùng `entity` thì xóa redirect đó (slug cũ của đối tượng khác nay được dùng lại).
3. Không tạo chuỗi: redirect lưu theo id nên luôn dẫn tới slug hiện tại; đổi slug lần nữa chỉ thêm `fromSlug` mới, các redirect cũ vẫn trỏ cùng id. Đổi về đúng slug đã từng dùng của chính đối tượng đó thì xóa redirect tương ứng (trường hợp riêng của bước 2).
4. Xóa vĩnh viễn danh mục -> xóa redirect của nó (service). Sản phẩm chỉ xóa mềm nên giữ redirect; khi sản phẩm không hiển thị thì tra cứu theo redirect cũng trả 404 thường (không `movedTo`).

**Tra cứu.** Khớp slug trực tiếp luôn được ưu tiên. Nếu không khớp trực tiếp nhưng có redirect tới đối tượng đang hiển thị (sản phẩm `ACTIVE` chưa xóa; danh mục `isActive`):

- `GET /products/:slug`, `GET /products/:slug/reviews`, `GET /products/:slug/reviews/me`, `GET /categories/:slug` -> 404 `NOT_FOUND` kèm `details: { "movedTo": "<slug hiện tại>" }`.
- `GET /products?category=<slug>` KHÔNG redirect (slug cũ không khớp danh mục nào -> kết quả rỗng như hiện tại).

**`GET /categories/:slug` – Public** (mới, 0.7). Chỉ danh mục `isActive` (con của danh mục bị ẩn vẫn theo quy tắc `GET /categories` §4.1):

```json
{
  "data": {
    "id": "ckc1",
    "name": "Specialty",
    "slug": "specialty",
    "description": "...",
    "imageUrl": null,
    "parent": { "name": "Cà phê hạt", "slug": "ca-phe-hat" },
    "children": [{ "name": "Pour-over", "slug": "pour-over" }]
  }
}
```

`parent` là `null` với danh mục gốc; `children` chỉ gồm danh mục con `isActive`, sắp `sortOrder`. Không tồn tại hoặc ẩn -> 404 (kèm `movedTo` nếu là slug cũ).

**Lý do 404 + `movedTo` thay vì 301 ở API.** API là JSON; FE (Next) tự quyết định chuyển hướng. Khi nhận 404 có `details.movedTo`, trang `/san-pham/[slug]` và `/danh-muc/[slug]` (SSR) gọi `permanentRedirect` (HTTP 308) tới URL mới để giữ SEO; trường hợp khác trả `notFound()`. Trang đánh giá nằm trong trang chi tiết nên không cần redirect riêng.

### 14.6 Khôi phục sản phẩm xóa mềm (D-018)

`POST /admin/products/:id/restore` – **Admin**. Không body. Chỉ áp dụng cho sản phẩm đã xóa mềm; sản phẩm chưa xóa -> 409 `CONFLICT`; không tồn tại -> 404. Trong một transaction: `deletedAt = null`, `status = DRAFT` (admin tự bật `ACTIVE` sau khi kiểm tra), biến thể đã xóa mềm GIỮ NGUYÊN (admin tạo lại hoặc sửa nếu cần), tính lại các cột denormalize (`minPrice`, `inStock`, `ratingAvg/ratingCount`, `searchText`, `db-schema.md` §5). AuditLog `product.restore`. Slug của sản phẩm đã xóa vẫn được giữ nguyên nên không xung đột. Thành công 200 `AdminProduct` (§12.4).

### 14.7 Hủy đơn thủ công và phiên Stripe

Khi admin hoặc khách hủy đơn (§9.4, §12.1) mà đơn có `Payment` `PENDING` (đơn `PENDING_PAYMENT` đã tạo phiên thanh toán): TRONG cùng transaction hủy, chuyển mọi `Payment` `PENDING` của đơn sang `FAILED` (khóa Order trước Payment như D-015). Sau commit, best-effort expire phiên Stripe Checkout tương ứng (cùng cách job hết hạn §13.6); lỗi chỉ ghi log, không ảnh hưởng kết quả hủy. Phiên VNPay không có thao tác expire. Mục đích: không để khách tiếp tục thanh toán một đơn đã hủy; nếu thanh toán vẫn thành công muộn thì xử lý theo §13.5 (`payment.late`, `needsRefund`).

### 14.8 Gợi ý tìm kiếm (FR-CAT-06)

Không đổi API. FE dùng `GET /search/suggest` (§4.5) ở ô tìm kiếm trên header: combobox (a11y `role="combobox"`, `aria-expanded`, điều hướng bàn phím), chỉ gọi khi đủ tối thiểu 2 ký tự (sau trim), debounce khoảng 250 ms, hủy request cũ khi gõ tiếp, `limit` mặc định; Enter không chọn mục nào thì chuyển tới `/tim-kiem?q=...` (không phải `/san-pham?q=`).

### 14.9 Cài đặt cửa hàng (FR-ADM-09)

Quyết định: D-021. Chỉ **Admin** (cả `GET` và `PUT /admin/settings`; Staff nhận 403 `FORBIDDEN`). Mọi giá trị nằm trong bảng `Setting` (key-value JSON). Key quản lý và ràng buộc khi GHI (`PUT`):

| Key                               | Giá trị / ràng buộc                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `shipping.rates`                  | `{ inner: { STANDARD, EXPRESS }, other: { STANDARD, EXPRESS } }`, mỗi giá trị số nguyên 0–1.000.000                                                                                                                                                                                                                                                                                                                                                                                                          |
| `shipping.innerCityProvinceCodes` | Mảng tối đa 34 phần tử, mỗi mã `^\d{2}$` và phải tồn tại trong danh mục tỉnh (§7); server bỏ trùng; có thể rỗng                                                                                                                                                                                                                                                                                                                                                                                              |
| `shipping.innerCityWardCodes`     | Mảng tối đa 500 phần tử, mỗi mã `^\d{5}$` và phải tồn tại trong danh mục phường; server bỏ trùng                                                                                                                                                                                                                                                                                                                                                                                                             |
| `shipping.freeShippingThreshold`  | Số nguyên 0–100.000.000                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `shipping.weightSurcharge`        | `{ freeGram 0–100.000, stepGram 1–100.000, feePerStep 0–1.000.000 }` (số nguyên; shape như `db-schema.md` §6)                                                                                                                                                                                                                                                                                                                                                                                                |
| `order.paymentExpiryMinutes`      | Số nguyên 5–120                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `store.contact`                   | `{ name 1–100, email hợp lệ <= 254 (lowercase), phone "" hoặc SĐT chuẩn hóa D-007, address 0–300 }`; `name`/`address` không chứa ký tự điều khiển (CR/LF...)                                                                                                                                                                                                                                                                                                                                                 |
| `home.banners`                    | Mảng tối đa 5 phần tử `{ imageUrl, alt 1–200, title 0–100, subtitle 0–200, href, isActive }`. `imageUrl` CHỈ chấp nhận đường dẫn tương đối `/uploads/...` theo quy tắc (a) của §12.3 (không nhận `https://` ngoài vì CSP `img-src 'self'` và `next/image` chỉ cho ảnh nội bộ). `href` là `null` hoặc đường dẫn tương đối bắt đầu bằng `/`, không bắt đầu bằng `//`, không chứa `\` hay ký tự điều khiển, <= 300 ký tự (không nhận URL ngoài để tránh open redirect/link lạ từ trang chủ). `isActive` boolean |

Giá trị ĐỌC từ DB được kiểm theo schema nới hơn (giá trị cũ hợp lệ trước đây không làm hỏng tính giá); giá trị DB sai định dạng thì dùng mặc định và log cảnh báo (chỉ tên key).

**`GET /admin/settings` – Admin.** `{ data: { "<key>": value, ... }, meta: { updatedAt: { "<key>": "<iso>" | null } } }`. `data` luôn đủ mọi key ở bảng trên; key chưa có trong DB hoặc có giá trị sai định dạng trả giá trị mặc định (`db-schema.md` §6) và `updatedAt` của key đó là `null`.

**`PUT /admin/settings` – Admin.** Body là object chỉ chứa các key cần đổi (>= 1 key). Key lạ (ngoài bảng trên) -> 400 `VALIDATION_ERROR` với `details[].field` = tên key. Mỗi key validate theo bảng ràng buộc ghi ở trên; lỗi lồng nhau báo `details[].field` là đường dẫn đầy đủ, ví dụ `shipping.rates.inner.STANDARD`, `home.banners.0.imageUrl`. Key có giá trị mới giống hệt giá trị hiện tại thì bỏ qua; không có key nào đổi -> 200, không ghi audit. Ghi trong 1 transaction cùng 1 dòng AuditLog `settings.update` cho cả request (`entity = "Setting"`, `entityId = null`, `diff = { "<key>": [old, new] }` chỉ gồm key đổi; không chứa dữ liệu nhạy cảm). Ghi đè theo key, người ghi sau thắng (không có khóa lạc quan; chấp nhận vì ít admin). Thành công 200, response giống `GET /admin/settings`. Tính giá (quote/đặt đơn) có hiệu lực ngay: `getShopSettings` không cache giữa các request.

**`GET /settings/public` – Public** (không cần auth). Chỉ trả whitelist:

```json
{
  "data": {
    "shipping": {
      "rates": {
        "inner": { "STANDARD": 20000, "EXPRESS": 35000 },
        "other": { "STANDARD": 35000, "EXPRESS": 55000 }
      },
      "freeShippingThreshold": 500000,
      "innerCityWardCount": 0,
      "weightSurcharge": {
        "freeGram": 2000,
        "stepGram": 1000,
        "feePerStep": 5000
      },
      "innerCityProvinces": [
        { "code": "01", "name": "Thành phố Hà Nội" },
        { "code": "79", "name": "Thành phố Hồ Chí Minh" }
      ]
    },
    "order": { "paymentExpiryMinutes": 15 },
    "store": {
      "contact": {
        "name": "BeanBox",
        "email": "hello@beanbox.local",
        "phone": "",
        "address": ""
      }
    },
    "home": { "banners": [] },
    "contactCaptcha": { "provider": "turnstile", "siteKey": "<site key>" }
  }
}
```

`contactCaptcha` (D-028): `{ "provider": "turnstile", "siteKey": "<site key>" }` khi backend có ĐỦ cả `TURNSTILE_SITE_KEY` và `TURNSTILE_SECRET_KEY`; thiếu một hoặc cả hai thì captcha tắt và trả `null` (mặc định). FE đọc giá trị lúc chạy, không nhúng lúc build; secret không bao giờ xuất hiện trong response.

`innerCityProvinces` được dựng từ `innerCityProvinceCodes` + tên trong danh mục tỉnh. `home.banners` chỉ gồm phần tử `isActive`. `innerCityWardCount` là số nguyên, bằng số mã trong `innerCityWardCodes`, để trang chính sách nói đúng khi nội thành gồm thêm phường riêng; vẫn KHÔNG trả danh sách mã phường hay bất kỳ key nào khác. Header `Cache-Control: public, max-age=300`. FE dùng cho trang chính sách vận chuyển, footer, trang liên hệ và banner trang chủ (SSR, revalidate 300 giây); API lỗi thì FE dùng nội dung mặc định viết sẵn. Do cache, trang storefront (chính sách, footer, liên hệ, banner) cập nhật chậm tối đa khoảng 5 phút sau khi admin lưu.

### 14.10 Quản lý người dùng (FR-ADM-07)

Quyết định: D-022. Toàn bộ endpoint dưới đây chỉ **Admin** (Staff nhận 403 `FORBIDDEN`).

- `GET /admin/users`: query `q` (2–100 ký tự; khớp email/họ tên/SĐT, escape LIKE), `role` (một hoặc nhiều, phân cách phẩy), `status` (một hoặc nhiều), `sort` = `newest` (mặc định) | `oldest` | `lastLogin` (`lastLoginAt DESC NULLS LAST`, rồi `createdAt DESC`), `page`, `pageSize`. Item: `{ id, email, fullName, phone, role, status, emailVerified, lastLoginAt, lockedUntil, createdAt, orderCount }`.
- `GET /admin/users/:id`: item như trên cộng `addressCount`, `orders: { count, paidTotal, recent }` (`paidTotal` = Σ `grandTotal` của đơn `paymentStatus = PAID` có `status` không thuộc `CANCELLED`/`RETURNED`; `recent` = 5 đơn mới nhất `{ code, status, grandTotal, createdAt }`) và `activeSessions` (số refresh token chưa thu hồi, chưa hết hạn). Không bao giờ trả `passwordHash` hay token.
- `PATCH /admin/users/:id/status` body `{ status: "ACTIVE" | "DISABLED", reason?: 0–255 ký tự }`.
- `PATCH /admin/users/:id/role` body `{ role: "CUSTOMER" | "STAFF" | "ADMIN" }`.

Quy tắc (hai PATCH), thực hiện trong 1 transaction. Thứ tự kiểm: 404 (user không tồn tại) -> `CANNOT_MODIFY_SELF` -> 403 người thao tác -> `LAST_ADMIN` -> no-op. 0. Đọc lại người thao tác bằng `SELECT ... FOR UPDATE` cùng các ADMIN `ACTIVE`; nếu người thao tác không còn là ADMIN `ACTIVE` -> 403 `FORBIDDEN`. Lý do: hai admin khóa chéo nhau đồng thời; nhờ khóa dòng và kiểm lại người thao tác, yêu cầu thứ hai bị chặn, hệ thống luôn còn >= 1 ADMIN `ACTIVE`.

1. Không thao tác lên chính mình (khóa hoặc đổi role) -> 409 `CANNOT_MODIFY_SELF`.
2. Thao tác khiến hệ thống không còn ADMIN `ACTIVE` nào (khóa admin cuối, hạ role admin cuối) -> 409 `LAST_ADMIN`.
3. Đặt giá trị bằng giá trị hiện tại -> 200, không ghi audit, không thu hồi phiên. Ngoại lệ: `PATCH status` với `ACTIVE` trên user đang `ACTIVE` nhưng còn khóa tạm (`lockedUntil > now`) thì xóa khóa tạm (`failedLoginCount = 0`, `lockedUntil = null`), ghi audit `user.status` với `diff = { lockedUntil: ["<iso cũ>", null] }`, không thu hồi phiên.
4. Khóa (`DISABLED`) hoặc đổi role -> thu hồi MỌI refresh token của user (phải đăng nhập lại). Access token còn hạn bị chặn ngay vì middleware đọc `role`/`status` từ DB mỗi request (§1).
5. Mở khóa (`ACTIVE`) đồng thời đặt lại `failedLoginCount = 0`, `lockedUntil = null`.
6. AuditLog trong cùng transaction: `user.status` (`entity = "User"`, `diff = { status: [old, new], reason?: [null, "<reason>"] }`) và `user.role` (`diff = { role: [old, new] }`).

Ghi chú: `LAST_ADMIN` là kiểm tra phòng thủ: qua API, người thao tác luôn là ADMIN `ACTIVE` khác đích nên thực tế không thể kích hoạt; khi hai admin khóa/hạ quyền chéo nhau đồng thời, yêu cầu thua bị chặn bằng 403 (`FORBIDDEN` nếu bị chặn trong transaction, hoặc `ACCOUNT_DISABLED` nếu middleware xác thực đã thấy người gọi bị khóa). Body sai -> 400 được kiểm trước 404.

Thành công 200 trả item chi tiết (như `GET /admin/users/:id`). Không tồn tại -> 404. Không có xóa user, không đặt lại mật khẩu, không sửa email/họ tên từ admin ở M6b.

### 14.11 Liên hệ (FR-CNT-03, phần form liên hệ)

Quyết định: D-023. Bảng `ContactMessage` (`db-schema.md`, migration `m6b_contact_message`).

**`POST /contact` – Public** (Optional auth: có Bearer hợp lệ thì gắn `userId`; Bearer sai -> 401 như §1). Rate limit riêng 3 request/10 phút/IP (store riêng, đặt trước bước xác thực). Body:

| Trường         | Quy tắc                                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------------------- |
| `name`         | 2–100 ký tự, không chứa ký tự điều khiển (CR/LF, tab...) -> 400                                                   |
| `email`        | Email hợp lệ, <= 254 ký tự (lowercase)                                                                            |
| `phone`        | Tùy chọn; chuẩn hóa D-007; rỗng lưu `null`                                                                        |
| `subject`      | Tùy chọn, 0–150 ký tự, không chứa ký tự điều khiển (CR/LF, tab...) -> 400; rỗng lưu `null`                        |
| `message`      | 10–2000 ký tự; cho phép xuống dòng                                                                                |
| `website`      | Honeypot (ô ẩn, người thật để trống); chuỗi tùy chọn tối đa 200 ký tự                                             |
| `captchaToken` | Chuỗi tùy chọn, tối đa 2048 ký tự; bắt buộc khi captcha bật (`contactCaptcha` khác `null`, §14.9), bỏ qua khi tắt |

- Lỗi: 400 `VALIDATION_ERROR`, 400 `CAPTCHA_FAILED`, 401 (Bearer sai), 429 `RATE_LIMITED`, 503 `SERVICE_UNAVAILABLE` (chỉ khi captcha bật).
- Thứ tự xử lý `POST /contact`: rate limit -> xác thực tùy chọn -> validate (400) -> honeypot (201 giả) -> captcha (khi bật; 400 `CAPTCHA_FAILED` hoặc 503) -> lưu.
- Captcha (D-028): thiếu `captchaToken` hoặc Cloudflare trả `success: false` -> 400 `CAPTCHA_FAILED`; gọi siteverify lỗi mạng, quá 5 giây hoặc phản hồi không hợp lệ -> 503 `SERVICE_UNAVAILABLE` (fail closed). Honeypot dính trả 201 giả trước bước captcha, không gọi Cloudflare. Server không gửi IP client và không log token/secret.
- `website` có giá trị khác rỗng -> trả 201 giống thành công nhưng KHÔNG lưu và KHÔNG gửi mail. Honeypot dính vẫn bị tính vào rate limit (limiter đứng trước).
- Nội dung lưu dạng text thuần (không diễn giải HTML); FE hiển thị bằng text (không `dangerouslySetInnerHTML`).
- 201 `{ "data": { "received": true } }` (không trả `id`).
- Sau commit, gửi nền email thông báo tới `store.contact.email`, `Reply-To` = email người gửi, nội dung đã escape HTML; lỗi gửi chỉ ghi log, không ảnh hưởng 201. KHÔNG gửi email tự động cho người gửi (tránh bị lợi dụng để gửi thư rác tới địa chỉ của người khác).
- Không lưu IP.

**Admin (Staff+):**

- `GET /admin/contact-messages`: query `status` (`NEW` | `IN_PROGRESS` | `RESOLVED` | `SPAM`; nhiều giá trị phân cách phẩy), `q` (khớp tên/email/tiêu đề/nội dung, escape LIKE), `page`, `pageSize`; sắp `createdAt DESC`. Item đầy đủ: `{ id, userId, name, email, phone, subject, message, status, adminNote, handledBy: { id, fullName } | null, handledAt, createdAt, updatedAt }`.
- `GET /admin/contact-messages/:id`: một item như trên.
- `PATCH /admin/contact-messages/:id` body `{ status?, adminNote?: 0–1000 ký tự }`, ít nhất 1 trường. Mỗi khi `status` đổi sang giá trị khác hiện tại (kể cả đổi về `NEW`), đặt `handledById` = người thao tác và `handledAt` = now. `status` giống hiện tại và `adminNote` không đổi -> 200, không ghi audit. AuditLog `contact.update` (`entity = "ContactMessage"`, `diff` gồm `status: [old, new]` nếu đổi và `adminNote: [null, "đã cập nhật"]` nếu có sửa (đúng chuỗi này, không chép ghi chú thật); KHÔNG chép nội dung tin nhắn hay ghi chú). 200 trả item.
- Admin `PATCH` body không có `status` lẫn `adminNote` (kể cả chỉ có trường lạ) -> 400.
- Admin không xóa thủ công; job nền tự xóa cứng tin `RESOLVED`/`SPAM` quá `CONTACT_RETENTION_DAYS` ngày (D-029, §15 mục 15).

### 14.12 CSP (thực thi) và `POST /csp-report`

Quyết định: D-024, D-032; từ M8 CSP đầy đủ ở chế độ THỰC THI (cập nhật decisions.md do Tech Lead). Không còn header `Content-Security-Policy-Report-Only`.

**Header ở frontend.** Mỗi response HTML có đúng một header `Content-Security-Policy`:

1. Storefront (mọi route trừ `/admin` và `/admin/...`; đặt ở `next.config.ts`, không nonce nên giữ static/ISR). `'unsafe-inline'` cho script còn tồn tại vì script của Next chứa payload RSC không thể hash:

```
default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self' https://challenges.cloudflare.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; report-uri /api/v1/csp-report
```

2. Admin (`/admin`, `/admin/...`; đặt ở `src/proxy.ts`, nonce 16 byte ngẫu nhiên base64 theo request, trang admin render động). Không có `'unsafe-inline'` ở `script-src` và không có Turnstile ở `script-src`; `frame-src` cho phép Turnstile (khớp `buildCspAdmin`):

```
default-src 'self'; script-src 'self' 'nonce-<nonce>' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self' https://challenges.cloudflare.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; report-uri /api/v1/csp-report
```

Vào `/admin` từ storefront dùng tải trang đầy đủ (link `<a>`, chuyển hướng sau đăng nhập bằng `location.assign`) vì CSP gắn với tài liệu, không đổi được khi điều hướng phía client.

Chỉ khi chạy development thêm `'unsafe-eval'` vào `script-src` (cả hai policy). Policy thực thi nên trình duyệt CHẶN vi phạm và vẫn gửi báo cáo tới `report-uri` (FE chỉ dùng `report-uri`, chưa dùng `report-to`/`Reporting-Endpoints`); vì không còn report-only nên endpoint chỉ nhận báo cáo vi phạm thật.

**`POST /csp-report` – Public.**

- Chấp nhận `Content-Type` `application/csp-report`, `application/reports+json` hoặc `application/json`; body tối đa 10 KB. Body sai định dạng, quá lớn hoặc sai Content-Type -> bỏ qua, vẫn 204.
- Rate limit riêng 20 request/phút/IP (store riêng, đặt trước mọi xử lý); vượt -> 429 `RATE_LIMITED` như §1 (trình duyệt bỏ qua phản hồi).
- Thành công luôn 204, không body.
- Chỉ ghi log mức `warn` các trường đã làm sạch: `effectiveDirective`, origin của `blockedUri` (bỏ path và query; giá trị `inline`, `eval`, `data` giữ nguyên), pathname của `documentUri` (bỏ query và hash), `disposition`. Không lưu DB; không log IP, user agent, `script-sample` hay query.
- Ghi chú làm sạch: `blockedUri` chỉ giữ origin (hoặc từ khóa `inline`/`eval`/`data`..., hoặc `scheme:`); `documentPath` là pathname; báo cáo rỗng sau làm sạch thì không log; `effectiveDirective` lấy token đầu.

### 14.13 Còn hoãn: newsletter (FR-CNT-03 phần bản tin)

`POST /newsletter/subscribe` chưa làm (cần thêm bảng); chưa xếp milestone.

## 15. Câu hỏi mở / Giả định

1. **Đã chốt – xem decisions.md D-005.** Guest xem đơn qua `/tra-cuu-don-hang` (`GET /orders/track`, mã đơn + SĐT chuẩn hóa), không `viewToken`. Trang `/dat-hang-thanh-cong/[code]` của guest dựa vào response `POST /orders` (sessionStorage); mất thì hướng dẫn dùng tra cứu.
2. **Đã chốt – xem decisions.md D-005.** Đơn guest không tự gắn vào tài khoản khi đăng ký/đăng nhập sau.
3. **Đã chốt – xem decisions.md D-001.** Thanh toán thất bại: giữ `PENDING_PAYMENT` + `paymentStatus=FAILED`, thử lại tới `expiresAt`, quá hạn job mới hủy.
4. **Đã chốt – xem decisions.md D-002.** Có chuyển `FAILED_DELIVERY -> SHIPPING` (giao lại, Staff+).
5. **Đã chốt – xem decisions.md D-002.** Khách được hủy đơn `PENDING_PAYMENT`. Hoàn tiền đơn online đã `PAID` bị hủy: thủ công, admin ghi nhận ở M5 (§13.7, D-015).
6. **Đã chốt – xem decisions.md D-004.** Giữ lượt mã ngay khi tạo đơn bằng UPDATE có điều kiện; hoàn lượt khi `CANCELLED`; không vượt `usageLimit`/`perUserLimit`.
7. **Đã chốt – xem decisions.md D-003.** Phụ phí `5.000 × ceil(max(0, g − 2000) / 1000)`; freeship Tiêu chuẩn miễn cả phụ phí, Nhanh không.
8. **Đã chốt – xem decisions.md D-006.** Nội thành = toàn bộ Hà Nội (`01`) + TP.HCM (`79`); dữ liệu tỉnh/phường do chủ dự án cung cấp, nạp ở M2; mã/tên trong ví dụ chỉ minh họa.
9. **Không có `facets` (đếm theo bộ lọc)** trong `GET /products`; FE lấy thương hiệu từ `/brands`, các giá trị enum cố định. Thêm `GET /products/filters` nếu UI cần số đếm.
10. **Concurrent refresh:** không có grace window; FE bắt buộc single-flight trong tab và khóa giữa các tab bằng Web Locks API (`architecture.md` §4). Hai request đồng thời cùng token thì bên thua bị thu hồi cả family (§5.3). Nếu vẫn gây đăng xuất ngoài ý muốn, cân nhắc grace 10 giây cho token vừa xoay.
11. **Đã chốt ở M2:** đã thêm trang FE xác thực email `/xac-thuc-email` vào sitemap (requirements §9). Đăng nhập Google, loyalty, subscription, blog, đổi/trả: v2, ngoài contract này.
12. **`GET /health`** (readiness) và `GET /health/live` (liveness) nằm dưới `/api/v1` theo chỉ đạo (D-030); Docker healthcheck backend gọi `/api/v1/health` trong mạng Docker (cổng 4000, không publish). Frontend có `/healthz` là route của Next, không thuộc API contract.
13. **Đã chốt – xem decisions.md D-016.** Email đổi trạng thái đơn gửi từ M5 cho `CONFIRMED`, `SHIPPING`, `DELIVERED`, `CANCELLED` (§13.9).
14. **Đã chốt – xem decisions.md D-018.** Redirect khi đổi slug và khôi phục sản phẩm xóa mềm làm ở M6 (§14.5, §14.6).
15. **Đã chốt – xem decisions.md D-029.** Job xóa cứng tin `RESOLVED`/`SPAM` quá `CONTACT_RETENTION_DAYS` ngày (mặc định 365; 0 = tắt); tin `NEW`/`IN_PROGRESS` giữ tới khi xử lý; không lưu IP.
16. **Newsletter** vẫn hoãn (§14.13).

## 16. Phân tích kinh doanh (Admin)

Từ 0.14 (D-049, D-050; kế hoạch: [`admin-dashboard-plan.md`](admin-dashboard-plan.md)). Router `/admin/analytics/*` chỉ ADMIN: `requireAdmin` ở cấp router (chưa đăng nhập 401 `UNAUTHORIZED`, STAFF/CUSTOMER 403 `FORBIDDEN`), mọi response `Cache-Control: no-store` (§12.0). Không đổi §14.3 (`GET /admin/dashboard` vẫn dành cho Staff+). Tiền là `Int` VND. Mọi ngày là ngày lịch Việt Nam (UTC+7, không DST).

### 16.1 Tổng quan (Bước 1, đã triển khai)

`GET /admin/analytics/overview?from=YYYY-MM-DD&to=YYYY-MM-DD&granularity=day|week|month` – Admin.

Tham số (đều tùy chọn):

- `to`: ngày kết thúc (gồm cả ngày đó). Mặc định hôm nay (VN).
- `from`: ngày bắt đầu (gồm cả ngày đó). Mặc định `to - 29 ngày`. Nếu chỉ có `from` (không có `to`) thì `to = min(from + 29 ngày, hôm nay)`; tức là thiếu một đầu thì khoảng mặc định dài 30 ngày.
- `granularity`: mặc định `day` nếu khoảng <= 62 ngày, `week` nếu <= 184 ngày, còn lại `month`.

Kiểm tra (400 `VALIDATION_ERROR`, `details: [{ field, message }]`, định dạng §1): `from`/`to` sai định dạng hoặc ngày không tồn tại (ví dụ `2026-02-30`); `from > to` (field `from`); `to` sau hôm nay VN (field `to`); khoảng > 366 ngày (field `to`); `from` trước `2020-01-01` (field `from`); `granularity` không thuộc `day|week|month`. Tham số lặp (`from=a&from=b`) cũng là 400.

```json
{
  "data": {
    "range": {
      "from": "2026-10-22",
      "to": "2026-11-20",
      "days": 30,
      "granularity": "day",
      "timezone": "Asia/Ho_Chi_Minh"
    },
    "previousRange": { "from": "2026-09-22", "to": "2026-10-21" },
    "kpis": {
      "revenue": { "current": 5000000, "previous": 4444444, "changePct": 12.5 },
      "paidOrders": { "current": 10, "previous": 8, "changePct": 25 },
      "aov": { "current": 500000, "previous": 555555, "changePct": -10 },
      "ordersPlaced": { "current": 14, "previous": 14, "changePct": 0 },
      "cancelledOrders": { "current": 2, "previous": 1, "changePct": 100 },
      "cancelRate": { "current": 0.1429, "previous": 0.0714, "changePts": 7.1 },
      "discountTotal": { "current": 150000, "previous": 0, "changePct": null },
      "refundedAmount": { "current": 40000, "previous": 0, "changePct": null },
      "newCustomers": { "current": 3, "previous": 2, "changePct": 50 }
    },
    "series": [{ "start": "2026-10-22", "end": "2026-10-22", "revenue": 0, "paidOrders": 0, "ordersPlaced": 0 }],
    "previousSeries": [{ "start": "2026-09-22", "end": "2026-09-22", "revenue": 0, "paidOrders": 0, "ordersPlaced": 0 }],
    "generatedAt": "2026-11-20T05:00:00.000Z"
  }
}
```

- `range.days` = số ngày của khoảng; `previousRange` = kỳ liền trước cùng độ dài (`to = from - 1 ngày`, `from = to - (days - 1)`).
- Định nghĩa (D-049): `revenue` = Σ `grandTotal` đơn `paymentStatus = PAID`, `status` không thuộc {`CANCELLED`, `RETURNED`}, theo `paidAt`; `paidOrders` = số đơn đó; `aov` = `round(revenue / paidOrders)`, 0 nếu `paidOrders = 0`; `ordersPlaced` = số đơn theo `createdAt`, mọi trạng thái (đơn COD chưa thu có ở đây nhưng không có ở `revenue`); `cancelledOrders` = số đơn tạo trong kỳ có `status = CANCELLED`; `cancelRate.current` = `cancelledOrders / ordersPlaced` (0..1, làm tròn 4 chữ số; 0 nếu không có đơn); `discountTotal` = Σ `discountTotal` của đơn tính doanh thu; `refundedAmount` = Σ `Payment.amount` có `refundedAt` trong kỳ; `newCustomers` = số `User` role `CUSTOMER` có `createdAt` trong kỳ.
- So sánh (D-050): `changePct = round((current - previous) / previous x 100, 1)`, `null` khi `previous = 0`. `cancelRate.changePts = round((current - previous) x 100, 1)` (điểm phần trăm), `null` khi kỳ trước không có đơn đã đặt.
- `series`: liên tục theo `granularity`, điền 0 cho bucket không có dữ liệu, tăng dần theo `start`. `day`: một bucket mỗi ngày; `week`: bắt đầu thứ Hai theo ngày VN; `month`: tháng lịch VN. Bucket đầu và cuối bị cắt theo khoảng (`start >= from`, `end <= to`), tổng `revenue` của `series` luôn bằng `kpis.revenue.current`. `revenue` và `paidOrders` gom theo ngày `paidAt`, `ordersPlaced` theo ngày `createdAt`. `previousSeries` có cấu trúc giống `series` cho `previousRange` với cùng `granularity`; số phần tử có thể khác `series` (FE căn theo chỉ số bucket). Tối đa 366 phần tử mỗi chuỗi.
- Biên ngày: 23:59:59.999 VN thuộc ngày đó, 00:00:00 VN thuộc ngày kế tiếp.

### 16.2 Cơ cấu doanh thu, top sản phẩm, top khách hàng (Bước 2, đã triển khai)

Từ 0.15 (D-051). Cả ba endpoint chỉ ADMIN, `no-store`, dùng **cùng `from`/`to`, mặc định, giới hạn và kỳ trước** với §16.1 (D-050) và **cùng tập đơn nguồn**: `paymentStatus = PAID`, `status` không thuộc {`CANCELLED`, `RETURNED`}, tính theo `paidAt` (ngày VN). Đơn COD chưa thu, đơn hủy, đơn trả hàng bị loại. Khác với "top sản phẩm" của `GET /admin/dashboard` (§14.3, theo `createdAt`, không đổi). Lỗi 400 theo §1, `details: [{ field, message }]`; tham số lặp (`limit=1&limit=2`) cũng là 400. Phản hồi có `range: { from, to, days, timezone }` (không có `granularity`).

#### 16.2.1 `GET /admin/analytics/breakdown?dimension=...&from=&to=`

- `dimension` **bắt buộc**: `category | brand | paymentMethod | shippingMethod | province` (thiếu/sai -> 400, field `dimension`).
- Hai loại chiều, báo bằng `basis`:
  - `basis: "order"` (`paymentMethod`, `shippingMethod`, `province`): `revenue` = Σ `grandTotal`, `orders` = số đơn, `quantity` = `null`. Mỗi đơn thuộc đúng một nhóm nên tổng các nhóm = `kpis.revenue.current` của §16.1 cùng khoảng, và Σ `orders` = `total.orders`.
  - `basis: "item"` (`category`, `brand`): `revenue` = Σ `OrderItem.lineTotal` ("doanh thu hàng hóa": chưa trừ giảm giá cấp đơn, không gồm phí vận chuyển nên khác doanh thu §16.1), `quantity` = Σ `quantity`, `orders` = số đơn **khác nhau** có dòng hàng thuộc nhóm. Một đơn có thể thuộc nhiều nhóm nên Σ `orders` của các nhóm có thể lớn hơn `total.orders`. Tổng `revenue` các nhóm = `total.revenue` = Σ `lineTotal` của tập đơn nguồn.
- Phân loại: danh mục/thương hiệu lấy theo `Product` **hiện tại** (không cuộn lên danh mục cha; `OrderItem` không lưu snapshot nên đổi danh mục sản phẩm làm số liệu quá khứ đổi theo, D-049/D-051). Sản phẩm xóa mềm vẫn tính. Tỉnh/thành lấy từ snapshot `shippingAddress` (`provinceCode`, `provinceName`).
- Nhãn: `label` do backend trả bằng tiếng Việt cho mọi chiều (FE không map): thanh toán `COD` "Thanh toán khi nhận hàng (COD)", `VNPAY` "VNPay (ATM/QR/thẻ)", `STRIPE` "Thẻ quốc tế (Stripe)"; giao hàng `STANDARD` "Tiêu chuẩn", `EXPRESS` "Nhanh"; `key` luôn là mã enum/id.

```json
{
  "data": {
    "range": { "from": "2026-10-22", "to": "2026-11-20", "days": 30, "timezone": "Asia/Ho_Chi_Minh" },
    "previousRange": { "from": "2026-09-22", "to": "2026-10-21" },
    "dimension": "category",
    "basis": "item",
    "total": { "revenue": 660000, "orders": 5, "quantity": 10 },
    "previousTotal": { "revenue": 200000, "orders": 2, "quantity": 3 },
    "groups": [
      {
        "key": "cmabc123",
        "label": "Máy pha cà phê",
        "revenue": 500000,
        "orders": 4,
        "quantity": 5,
        "share": 0.7576,
        "previousRevenue": 100000,
        "changePct": 400
      }
    ],
    "generatedAt": "2026-11-20T05:00:00.000Z"
  }
}
```

- `total`/`previousTotal`: `{ revenue, orders, quantity }`; `quantity` = `null` ở chiều `order`. Ở chiều `item`, `total.orders` là số đơn khác nhau của cả tập (không bằng Σ nhóm).
- `groups[]`: `key` (`string | null`), `label`, `revenue`, `orders`, `quantity` (`number | null`), `share` = `revenue / total.revenue` (0..1, làm tròn 4 chữ số; 0 khi tổng = 0), `previousRevenue` (doanh thu cùng nhóm ở kỳ trước), `changePct` (§16.1; `null` khi `previousRevenue = 0`).
- Nhóm đặc biệt: thương hiệu rỗng -> `key: null`, `label: "Không có thương hiệu"`; tỉnh thiếu `provinceCode` -> `key: null`, `label: "Không xác định"`; dòng hàng không join được sản phẩm -> `key: "__unknown__"`, `label: "Không xác định"` (không xảy ra với dữ liệu hiện tại vì `OrderItem.productId` là `Restrict`).
- Sắp xếp `revenue` giảm dần rồi `label` (so sánh tiếng Việt). Chỉ liệt kê nhóm có đơn trong kỳ hiện tại (nhóm chỉ có ở kỳ trước không liệt kê, nhưng vẫn nằm trong `previousTotal`).
- Tối đa **50** nhóm: nếu nhiều hơn, 49 nhóm đầu + 1 nhóm cuối `key: "__other__"`, `label: "Khác"` gộp phần còn lại để tổng vẫn khớp. Ở chiều `item`, `orders` của "Khác" là tổng `orders` các nhóm gộp (có thể đếm trùng một đơn).
- Thực thi: một truy vấn nhóm (kỳ này và kỳ trước cùng truy vấn, `FILTER` theo `paidAt`) + một truy vấn tổng ở chiều `item`; SQL tham số hóa, câu SQL cố định theo từng chiều.

#### 16.2.2 `GET /admin/analytics/top-products?from=&to=&sort=revenue|quantity&limit=`

- `sort` mặc định `revenue`; `limit` số nguyên 1..50, mặc định 10 (`0`, `51`, `abc`, `1.5`, `-1` -> 400, field `limit`). Hòa thì: `revenue` -> `quantity` giảm dần; `quantity` -> `revenue` giảm dần; rồi `productId`.
- Gộp theo `productId` (mọi biến thể cộng chung) trên tập đơn nguồn.

```json
{
  "data": {
    "range": { "from": "2026-10-22", "to": "2026-11-20", "days": 30, "timezone": "Asia/Ho_Chi_Minh" },
    "sort": "revenue",
    "limit": 10,
    "items": [
      {
        "productId": "cmabc123",
        "name": "Phin nhôm số 1",
        "slug": "phin-nhom-so-1",
        "deleted": false,
        "categoryName": "Phin pha cà phê",
        "revenue": 300000,
        "quantity": 3,
        "orders": 2
      }
    ],
    "generatedAt": "2026-11-20T05:00:00.000Z"
  }
}
```

- `name` là tên hiện tại của sản phẩm (thiếu thì `OrderItem.productName` đã lưu); `slug` `null` nếu không còn sản phẩm; `deleted` = `true` khi sản phẩm xóa mềm (vẫn được tính); `categoryName` là danh mục hiện tại (`null` nếu không có); `revenue` = Σ `lineTotal` (hàng hóa, như `basis: "item"`); `quantity` = Σ `quantity`; `orders` = số đơn khác nhau.

#### 16.2.3 `GET /admin/analytics/top-customers?from=&to=&sort=revenue|orders&limit=`

- `sort` mặc định `revenue`; `limit` như trên (mặc định 10, tối đa 50). Hòa thì: `revenue` -> số đơn giảm dần; `orders` -> doanh thu giảm dần; rồi lần mua gần nhất.
- Gộp theo `Order.userId` khi có; khách vãng lai (`userId = null`) gộp theo `lower(contactEmail)`. Đánh đổi (D-051): một người vừa có tài khoản vừa từng mua vãng lai bằng cùng email sẽ là **hai dòng** (không đoán danh tính).

```json
{
  "data": {
    "range": { "from": "2026-10-22", "to": "2026-11-20", "days": 30, "timezone": "Asia/Ho_Chi_Minh" },
    "sort": "revenue",
    "limit": 10,
    "items": [
      {
        "customerType": "guest",
        "userId": null,
        "name": "Trần Thị Bình",
        "email": "binh@example.com",
        "orders": 2,
        "revenue": 370000,
        "aov": 185000,
        "lastPaidAt": "2026-11-12T03:00:00.000Z"
      }
    ],
    "generatedAt": "2026-11-20T05:00:00.000Z"
  }
}
```

- `customerType`: `registered` | `guest`. `name`: `User.fullName` (registered) hoặc `fullName` trong `shippingAddress` của đơn mới nhất (guest; thiếu thì dùng email). `email`: `User.email` hoặc `contactEmail` đã `lower`. `revenue` = Σ `grandTotal`, `orders` = số đơn, `aov = round(revenue / orders)`, `lastPaidAt` = `paidAt` mới nhất (ISO UTC).
- **Không trả SĐT hay địa chỉ** (chỉ tên + email). Dữ liệu cá nhân nên chỉ ADMIN; xuất CSV có audit ở Bước 4 (§16.3).

### 16.3 Khách hàng, vận hành, tồn kho (Bước 3, đã triển khai)

Từ 0.16 (D-052). Ba endpoint chỉ ADMIN, `no-store`, lỗi 400 theo §1 (`details: [{ field, message }]`, tham số lặp cũng là 400). `customers` và `operations` dùng **cùng `from`/`to`, mặc định, giới hạn và kỳ trước** với §16.1 (D-050); `inventory` là ảnh chụp hiện tại, không có khoảng ngày và không có kỳ trước. Mọi chỉ số theo kỳ có `previous` và `changePct`/`changePts` như §16.1 (`null` khi kỳ trước = 0; tỷ lệ so sánh bằng điểm phần trăm). Không trả dữ liệu cá nhân (email, tên, SĐT, địa chỉ); chỉ có mã đơn trong danh sách "đơn chờ xác nhận".

**Khóa khách hàng** = `userId` nếu có, ngược lại `lower(contactEmail)` (như D-051). **Đơn tính doanh thu** = định nghĩa D-019/§16.1 (PAID, không `CANCELLED`/`RETURNED`) tính theo `paidAt`.

#### `GET /admin/analytics/customers?from&to`

```json
{
  "data": {
    "range": { "from": "2026-10-22", "to": "2026-11-20", "days": 30, "timezone": "Asia/Ho_Chi_Minh" },
    "previousRange": { "from": "2026-09-22", "to": "2026-10-21" },
    "buyers": { "current": 40, "previous": 32, "changePct": 25 },
    "firstTime": { "current": 25, "previous": 20, "changePct": 25 },
    "returning": { "current": 15, "previous": 12, "changePct": 25 },
    "repeatRate": { "current": 0.175, "previous": 0.15, "changePts": 2.5 },
    "firstTimeRevenue": { "current": 9000000, "previous": 0, "changePct": null },
    "returningRevenue": { "current": 6000000, "previous": 5000000, "changePct": 20 },
    "generatedAt": "2026-11-20T05:00:00.000Z"
  }
}
```

- `buyers` = số khách có ít nhất một đơn tính doanh thu trong kỳ. `firstTime` = khách mua trong kỳ mà đơn tính doanh thu **sớm nhất mọi thời điểm** của khách nằm trong kỳ. `returning` = `buyers - firstTime` = khách mua trong kỳ đã có đơn tính doanh thu trước `from`. Đơn đã bị hủy/hoàn trả không tính vào lịch sử mua: khách có đơn cũ nhưng đã `CANCELLED` vẫn là khách lần đầu.
- `repeatRate` = số khách có >= 2 đơn tính doanh thu trong kỳ / `buyers` (0..1, 4 chữ số; 0 khi không có khách); `changePts` `null` khi kỳ trước không có khách.
- `firstTimeRevenue`/`returningRevenue` = Σ `grandTotal` của các đơn tính doanh thu trong kỳ của hai nhóm khách.
- **Bất biến:** `firstTime + returning = buyers` (cả hai kỳ); `firstTimeRevenue + returningRevenue = kpis.revenue` của §16.1 cùng khoảng ngày.
- Đánh đổi: người vừa có tài khoản vừa mua vãng lai cùng email tính là hai khách; hai email khác nhau của một người cũng là hai khách (như D-051).

#### `GET /admin/analytics/operations?from&to`

```json
{
  "data": {
    "range": { "from": "2026-10-22", "to": "2026-11-20", "days": 30, "timezone": "Asia/Ho_Chi_Minh" },
    "previousRange": { "from": "2026-09-22", "to": "2026-10-21" },
    "cancellations": {
      "total": { "current": 10, "previous": 5, "changePct": 100 },
      "byType": [
        { "type": "customer", "label": "Khách hủy", "current": 4, "previous": 2 },
        { "type": "store", "label": "Cửa hàng hủy", "current": 3, "previous": 1 },
        { "type": "expired", "label": "Hết hạn thanh toán", "current": 2, "previous": 2 },
        { "type": "unknown", "label": "Không rõ", "current": 1, "previous": 0 }
      ]
    },
    "returns": {
      "delivered": { "current": 20, "previous": 10, "changePct": 100 },
      "returned": { "current": 2, "previous": 0, "changePct": null },
      "rate": { "current": 0.1, "previous": 0, "changePts": 10 }
    },
    "refunds": {
      "count": { "current": 3, "previous": 1, "changePct": 200 },
      "amount": { "current": 450000, "previous": 100000, "changePct": 350 }
    },
    "fulfillment": {
      "confirmHours": { "avg": 3.5, "median": 2, "n": 12, "previousAvg": null },
      "deliveryHours": { "avg": 54, "median": 48, "n": 8, "previousAvg": 30.5 }
    },
    "attention": {
      "pendingOver24h": {
        "count": 2,
        "oldest": [
          { "code": "BB-261101-AAAA", "createdAt": "2026-11-18T03:00:00.000Z", "grandTotal": 320000, "waitingHours": 50 }
        ]
      },
      "needsRefund": 1,
      "returnRequested": 3,
      "failedDelivery": 0
    },
    "generatedAt": "2026-11-20T05:00:00.000Z"
  }
}
```

- **`cancellations`**: đơn **tạo** trong kỳ đang `CANCELLED` (nên `total.current` = `kpis.cancelledOrders.current` của §16.1; `byType` luôn đủ 4 phần tử theo thứ tự `customer`, `store`, `expired`, `unknown` và tổng `current` = `total.current`). Loại đọc từ dòng `OrderStatusHistory` có `toStatus = CANCELLED` **mới nhất** của đơn:
  - `expired`: `actorId` null, `fromStatus = PENDING_PAYMENT` và `note` = "Quá hạn thanh toán" (đúng như job hết hạn §13.6 ghi; hằng `EXPIRE_REASON` dùng chung);
  - `store`: người thao tác hiện có role `STAFF` hoặc `ADMIN`;
  - `customer`: các trường hợp còn lại có dòng lịch sử (khách có tài khoản, khách vãng lai, hoặc người thao tác đã bị xóa);
  - `unknown`: đơn `CANCELLED` không có dòng lịch sử.
  - Đánh đổi: dựa vào role **hiện tại** của người thao tác (đổi role sau này làm số liệu cũ đổi); tài khoản người hủy bị xóa (`actorId` về null) rơi vào `customer`; một khách vãng lai hủy đơn `PENDING_PAYMENT` và tự nhập đúng lý do "Quá hạn thanh toán" sẽ bị tính là `expired` (chấp nhận, chỉ ảnh hưởng phân loại).
- **`returns`**: `delivered` = số đơn có `deliveredAt` trong kỳ; `returned` = trong số đó, đơn hiện đang `RETURNED`; `rate` = `returned / delivered` (0 khi không có đơn giao; `changePts` `null` khi kỳ trước không có đơn giao).
- **`refunds`**: `count` = số `Payment` có `refundedAt` trong kỳ; `amount` = Σ `Payment.amount` (bằng `kpis.refundedAmount` của §16.1).
- **`fulfillment`** (đơn vị: giờ, làm tròn 1 chữ số thập phân; `n` = số mẫu của kỳ này; `avg`/`median` `null` khi `n = 0`; `previousAvg` `null` khi kỳ trước không có mẫu):
  - `confirmHours` = `createdAt -> confirmedAt` chỉ cho đơn **COD** có `confirmedAt` trong kỳ (đơn online tự xác nhận khi thanh toán nên bị loại);
  - `deliveryHours` = `confirmedAt -> deliveredAt` cho đơn có `deliveredAt` trong kỳ (và có `confirmedAt`);
  - `median` = `percentile_cont(0.5)`.
- **`attention`** là ảnh chụp hiện tại, không theo khoảng ngày và không có kỳ trước: `pendingOver24h.count` = số đơn `PENDING` tạo cách đây hơn 24 giờ; `oldest` = tối đa 10 đơn cũ nhất (`code`, `createdAt`, `grandTotal`, `waitingHours` = số giờ đã chờ, làm tròn xuống; không có thông tin cá nhân); `needsRefund` = số đơn cần hoàn tiền (cùng định nghĩa §13.7 và `attention.needsRefund` của §14.3); `returnRequested` = số đơn `RETURN_REQUESTED`; `failedDelivery` = số đơn `FAILED_DELIVERY`.

#### `GET /admin/analytics/inventory?slowDays=30`

`slowDays`: số nguyên 7..365, mặc định 30 (chuỗi chữ số; `6`, `366`, `abc`, `7.5`, `-30`, tham số lặp -> 400, `field: "slowDays"`).

```json
{
  "data": {
    "summary": {
      "variants": 30, "outOfStock": 2, "lowStock": 1, "stockUnits": 400,
      "stockValue": 38000000, "slowMovers": 1, "slowMoversValue": 2000000
    },
    "outOfStock": [
      {
        "variantId": "cm...", "productId": "cm...", "productName": "Phin nhôm số 1", "variantName": "Size M",
        "sku": "PHIN-M", "stock": 0, "lowStockThreshold": 5, "price": 100000, "stockValue": 0, "lastSoldAt": null
      }
    ],
    "lowStock": [],
    "slowMovers": [],
    "slowDays": 30,
    "generatedAt": "2026-11-20T05:00:00.000Z"
  }
}
```

- **Phạm vi biến thể** như `lowStock` của §14.3: `isActive = true`, `deletedAt` null, sản phẩm chưa xóa mềm. `variants` = số biến thể trong phạm vi.
- `outOfStock` = `stock <= 0`; `lowStock` = `0 < stock <= lowStockThreshold` (số đếm đủ ở `summary`); `stockUnits` = Σ `stock` của biến thể còn hàng; `stockValue` = Σ `stock x price` của biến thể còn hàng, **dùng giá niêm yết `price`, không dùng `salePrice`**.
- `slowMovers` = biến thể còn hàng (`stock > 0`) **không bán được** trong `slowDays` ngày gần nhất và **không được tạo** trong khoảng đó (hàng mới). "Bán" = có `OrderItem` thuộc đơn tạo (`createdAt`) với `status` không phải `CANCELLED`/`PENDING_PAYMENT` (cùng quy ước top sản phẩm §14.3). `slowMovers`/`slowMoversValue` ở `summary` là tổng toàn bộ, không bị cắt ở 20.
- Mỗi danh sách tối đa **20** phần tử. Sắp xếp: `outOfStock` theo tên sản phẩm rồi tên biến thể; `lowStock` theo `stock` tăng dần; `slowMovers` theo `stockValue` giảm dần.
- Item: `stockValue` = `stock x price` khi `stock > 0`, ngược lại 0; `lastSoldAt` = `createdAt` của đơn bán gần nhất của biến thể (mọi thời điểm), `null` nếu chưa từng bán.
- `slowDays` tính từ thời điểm gọi (không theo ngày lịch VN).

### 16.4 Dự kiến (chưa triển khai; Bước 4 chờ duyệt)

Chỉ để định hướng, chưa phải contract: đặc tả đầy đủ sẽ thêm khi triển khai.

- Bước 4: hiệu quả mã giảm giá và `GET /admin/analytics/export?report=overview|breakdown|top-products|top-customers|coupons&from&to` (CSV UTF-8 có BOM, chống CSV injection, ghi audit `analytics.export`, rate limit riêng).
