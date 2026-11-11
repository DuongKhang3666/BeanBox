# BeanBox – Kiến trúc hệ thống

> Phiên bản 0.5 · 2026-11-11 · Nguồn: `docs/requirements.md` + quyết định của Tech Lead.
> Thay đổi 0.5: M5 thanh toán online (D-014), hoàn tiền thủ công và job hết hạn mỗi 60 giây (D-015), biến môi trường mới và rate limit cấu hình được (D-016) ở §7, §8. Hướng dẫn cấu hình: [`payments-setup.md`](payments-setup.md).
> Thay đổi 0.4: M4 Admin (D-013): module backend `modules/admin/` và `lib/audit.ts`, FE `features/admin/` (§2); router `/admin` chặn quyền ở cấp router, xóa cần `requireAdmin` (§4).
> Thay đổi 0.3: xác định IP client & rate limit sau proxy (D-009, §3, §8, ADR 10); chi tiết hóa phiên/token và RBAC cho M2 (§4).
> Thay đổi 0.2: giữ lượt mã giảm giá khi tạo đơn và hoàn lượt khi hủy/hết hạn (D-004), ADR 9, ghi chú nguồn dữ liệu hành chính (D-006). Xem [`decisions.md`](decisions.md).
> Tài liệu liên quan: `docs/db-schema.md` (Prisma schema), `docs/api-contract.md` (nguồn sự thật cho API).

## Mục lục
1. [Tổng quan & cổng](#1-tổng-quan--cổng)
2. [Cấu trúc thư mục](#2-cấu-trúc-thư-mục)
3. [Luồng gọi API](#3-luồng-gọi-api)
4. [Xác thực & phiên](#4-xác-thực--phiên)
5. [Giỏ hàng, giá, đơn hàng](#5-giỏ-hàng-giá-đơn-hàng)
6. [Tìm kiếm & lọc](#6-tìm-kiếm--lọc)
7. [Thanh toán & tác vụ nền](#7-thanh-toán--tác-vụ-nền)
8. [Cấu hình môi trường](#8-cấu-hình-môi-trường)
9. [Quyết định kiến trúc (ADR rút gọn)](#9-quyết-định-kiến-trúc-adr-rút-gọn)
10. [Câu hỏi mở / Giả định](#10-câu-hỏi-mở--giả-định)

## 1. Tổng quan & cổng

```
Trình duyệt ──► Next.js :3000 ──(rewrites /api/v1/*)──► Express :4000 ──► PostgreSQL :5432
                   │                                        ▲
                   └── SSR / Server Components ─────────────┘  (gọi trực tiếp qua API_INTERNAL_URL)
```

| Thành phần | Công nghệ | Cổng |
|---|---|---|
| Frontend | Next.js (App Router) + TypeScript + Tailwind | 3000 |
| Backend | Express + TypeScript + Prisma + zod | 4000 |
| Database | PostgreSQL (extension `pg_trgm`) | 5432 |

- Node >= 22 LTS, package manager `npm`. `frontend/` và `backend/` là hai project độc lập (không workspace, mỗi nơi có `package.json` + `package-lock.json` riêng).
- Dev chạy bằng Docker Compose (Postgres bắt buộc; app tùy chọn). Email dev: Mailpit. Thanh toán: COD, VNPay sandbox, Stripe test.

## 2. Cấu trúc thư mục

```
BeanBox/
├─ docs/
├─ frontend/
│  └─ src/
│     ├─ app/           # App Router: route theo sitemap (/danh-muc/[slug], /san-pham/[slug], /admin/...)
│     ├─ components/    # UI dùng chung (Button, Input, ProductCard, Skeleton...)
│     ├─ features/      # theo nghiệp vụ: catalog, cart, checkout, account, admin (component + hook + api calls)
│     └─ lib/           # api client (fetch wrapper, refresh single-flight), format tiền/ngày, utils
├─ backend/
│  ├─ prisma/           # schema.prisma, migrations/, seed.ts, seed-data/
│  ├─ data/             # provinces-wards.json + README.md (nguồn) – danh mục hành chính 2 cấp, đọc lúc khởi động (D-006)
│  ├─ src/
│  │  ├─ config/        # env (zod-validated), constants; paths.ts (UPLOADS_DIR; AppOptions.uploadsDir cho test)
│  │  ├─ lib/           # prisma client, logger (pino), errors (AppError), mailer, tokens, money, text (bỏ dấu), audit.ts (ghi AuditLog trong transaction, M4)
│  │  ├─ middlewares/   # requestId, auth, requireRole, validate(zod), rateLimit, originCheck, errorHandler
│  │  └─ modules/<module>/{<module>.routes,.controller,.service,.schema}.ts
│  │        # modules: health, catalog, auth, me, locations, cart, checkout, orders, admin (M4), (payments, reviews... ở M5+)
│  │        # modules/admin/: orders, inventory, catalog (categories/brands), products (gồm variants, images), uploads; một router duy nhất mount /admin
│  └─ tests/            # unit (pricing, shipping, state machine) + integration (supertest)
├─ docker-compose.yml, .env.example, .github/workflows/ci.yml
```

Quy tắc phân lớp backend: `routes` (khai báo + middleware) -> `controller` (parse request/format response, mỏng) -> `service` (nghiệp vụ, transaction, không biết Express) -> Prisma. Logic thuần (tính giá, phí ship, state machine) tách thành hàm thuần để test unit không cần DB.

## 3. Luồng gọi API

- **Trình duyệt** luôn gọi đường dẫn tương đối `/api/v1/...` (same-origin). `next.config` có `rewrites`: `/api/v1/:path*` -> `http://localhost:4000/api/v1/:path*` (hoặc biến môi trường khi chạy Docker). Nhờ đó cookie refresh là first-party, không cần `credentials: include` cross-site.
- **SSR / Server Components** (trang danh mục, chi tiết sản phẩm, SEO) gọi thẳng `${API_INTERNAL_URL}/api/v1/...`, chỉ cho dữ liệu công khai (catalog). Dữ liệu cần đăng nhập (giỏ, tài khoản, đơn) lấy ở client component.
- Backend **vẫn bật CORS** với whitelist origin (`FRONTEND_ORIGINS`) để phòng khi gọi trực tiếp (test, Postman, tương lai tách domain).
- **IP client & rate limit (D-009).** Backend lắng nghe `HOST` (mặc định `127.0.0.1`; docker-compose bind cổng 4000, 5432, 1025, 8025 vào `127.0.0.1`). `trust proxy` đọc từ env `TRUST_PROXY` (mặc định `loopback`, Docker dùng `uniquelocal`; cấm giá trị `true`). Next rewrites tự thêm `X-Forwarded-For` nên IP thật của trình duyệt đi qua được tới backend. Request SSR gửi header `X-Internal-Secret` (= `INTERNAL_API_SECRET`) để được MIỄN rate limit chung (không miễn nhóm nhạy cảm auth); không chuyển tiếp IP client từ SSR vì làm trang thành dynamic và phân mảnh cache fetch của Next. Rủi ro còn lại: lưu lượng SSR không bị giới hạn ở backend nên khi deploy (M7) phải đặt rate limit ở reverse proxy/edge trước Next; lộ `INTERNAL_API_SECRET` cho phép lách rate limit chung (không lách được nhóm auth).

## 4. Xác thực & phiên

| Thành phần | Quyết định |
|---|---|
| Mật khẩu | argon2id; chính sách >= 8 ký tự, có chữ và số; tối đa 72 ký tự |
| Access token | JWT 15 phút, thuật toán cố định HS256, claims `sub`, `role`, `sid` (= `familyId` của phiên refresh), `iat`, `exp`, `iss=beanbox-api`, `aud=beanbox-web`; gửi `Authorization: Bearer`; FE giữ **trong memory** (không localStorage). Mất khi reload -> FE gọi `POST /auth/refresh` lúc khởi động, nhưng chỉ khi từng đăng nhập: FE lưu cờ không nhạy cảm `bb_has_session` trong localStorage để quyết định |
| Refresh token | Chuỗi ngẫu nhiên 32 byte (base64url), **không phải JWT**; DB lưu SHA-256 hash; hạn trượt 7 ngày (mỗi lần refresh cấp token mới hạn 7 ngày từ lúc refresh) |
| Cookie | `bb_rt`: httpOnly, `Secure` (prod), `SameSite=Strict`, `Path=/api/v1/auth` |
| Rotation | Mỗi lần refresh: thu hồi token cũ (`revokedAt`, `replacedById`), cấp token mới cùng `familyId` |
| Reuse detection | Dùng lại token đã thu hồi -> thu hồi **toàn bộ family** (đăng xuất thiết bị đó), trả 401 |
| CSRF | Endpoint dùng cookie (`/auth/refresh`, `/auth/logout`): `SameSite=Strict` + kiểm tra header `Origin` thuộc whitelist (thiếu hoặc sai -> 403) |
| Khóa tài khoản | 5 lần sai liên tiếp trong 15 phút -> `lockedUntil = now + 15 phút` (FR-AUTH-08) |
| RBAC | `CUSTOMER`, `STAFF`, `ADMIN`; middleware `requireAuth` đọc lại `role/status` từ DB MỌI request đã xác thực (không chỉ admin), `requireRole` dùng role đó. User không tồn tại -> 401; `DISABLED` -> 403 |
| Admin | Router `/admin` áp `requireAuth` + `requireStaff` ở cấp router (mọi endpoint con tự động được bảo vệ); xóa sản phẩm/danh mục/brand cần thêm `requireAdmin`. Mọi thao tác ghi ghi `AuditLog` cùng transaction (`lib/audit.ts`) |
| Frontend | Fetch wrapper tự gắn Bearer; gặp 401 -> refresh **single-flight** trong tab (nhiều request chờ chung 1 lần refresh) -> retry 1 lần. Giữa các tab: khóa bằng Web Locks API (`navigator.locks`) nếu trình duyệt hỗ trợ |
| Hạn chế đã chấp nhận | Đổi/đặt lại mật khẩu không vô hiệu access token đang sống (tối đa 15 phút); refresh token thì bị thu hồi ngay |

## 5. Giỏ hàng, giá, đơn hàng

- **Giỏ luôn ở server.** Khách vãng lai nhận `cartToken` ngẫu nhiên (32 byte) khi tạo giỏ lần đầu; FE lưu localStorage và gửi header `X-Cart-Token`; DB chỉ lưu SHA-256. Đăng nhập xong FE gọi `POST /cart/merge` (cộng dồn, cắt theo tồn kho và 20/dòng), xóa token local.
- **Server là nguồn giá duy nhất.** Checkout không nhận giá từ client; lấy item từ giỏ server, tính lại giá hiệu lực (giá sale theo khung giờ), mã giảm giá, phí ship. Quy tắc chi tiết: `api-contract.md` §Quy tắc tính giá.
- **Tiền** là `Int` VND ở DB và API. Làm tròn xuống (floor) cho phần trăm. Không float.
- **Tạo đơn** trong 1 transaction: validate -> tạo Order + OrderItem (snapshot) -> trừ kho `updateMany({ where: { id, stock: { gte: qty } } })` (count = 0 -> rollback `OUT_OF_STOCK`) -> ghi `InventoryMovement` -> giữ lượt mã nếu có (UPDATE có điều kiện `usedCount < usageLimit`, đếm `perUserLimit`, tạo `CouponRedemption`; D-004) -> xóa item giỏ. Mọi chuyển sang `CANCELLED` hoàn kho và hoàn lượt mã trong cùng transaction. Sắp xếp variantId tăng dần khi trừ kho để tránh deadlock.
- **Idempotency:** header `Idempotency-Key` (UUID) bắt buộc; `Order.idempotencyKey` unique + `requestFingerprint` (hash payload) để phân biệt replay (200, trả lại đơn) và xung đột (409).
- **Mã đơn** `BB-YYMMDD-XXXX` (alphabet bỏ `0 O 1 I L`), unique, retry tối đa 5 lần khi trùng.
- **Máy trạng thái** đơn hàng: bảng ở `api-contract.md`; code gồm 1 hàm thuần `canTransition(from, to, actorRole)`; cập nhật dùng optimistic check `updateMany where status = from`.

## 6. Tìm kiếm & lọc

- `Product.searchText` = lowercase + bỏ dấu tiếng Việt (NFD, bỏ combining marks, `đ -> d`) của `name + tags + shortDesc`, do service cập nhật mỗi lần ghi sản phẩm. Query người dùng chuẩn hóa cùng hàm, tách theo khoảng trắng, mỗi token là `contains` (AND).
- Index: `pg_trgm` + GIN trên `searchText` (xem `db-schema.md`). Sort `relevance` dùng `word_similarity` qua raw query.
- Lọc/sắp giá dùng cột denormalize `minPrice` (giá hiệu lực thấp nhất của variant active), `soldCount`, `ratingAvg`, `ratingCount`, `inStock`.
- **Hạn chế đã chấp nhận (MVP):** `minPrice` cập nhật khi variant đổi, nên flash sale theo khung giờ (`saleStart/saleEnd`) **chưa phản ánh realtime** trong lọc/sắp giá; giá hiển thị (card, chi tiết, giỏ, checkout) luôn tính lại từ variant nên đúng. Hướng xử lý sau: job mỗi phút recompute `minPrice` cho sản phẩm có sale sắp bắt đầu/kết thúc, hoặc tính `minPrice` trong query bằng `LEAST` trên variant.

## 7. Thanh toán & tác vụ nền

- COD: đơn `PENDING`; admin xác nhận. `paymentStatus` chuyển `PAID` khi `DELIVERED`.
- Online (M5, D-014; chi tiết `api-contract.md` §13): đơn `PENDING_PAYMENT` + `expiresAt = now + order.paymentExpiryMinutes` (mặc định 15 phút); server dựng URL thanh toán (VNPay tự ký HMAC-SHA512; Stripe Checkout gọi REST bằng `fetch`, không dùng SDK); FE chỉ chuyển hướng.
  - Chỉ **dữ liệu có chữ ký hoặc truy vấn server-to-server** mới chuyển `CONFIRMED`/`PAID`: IPN và return VNPay (đã xác minh chữ ký, số tiền khớp), webhook Stripe (raw body, `Stripe-Signature`, chống replay 300 giây) hoặc `POST /payments/stripe/sync` (server tự gọi Stripe). Tham số redirect chưa ký không được tin.
  - Mọi nguồn kết quả đi qua MỘT hàm xử lý idempotent (1 transaction, khóa Order rồi Payment `FOR UPDATE`); thanh toán muộn/trả trùng không đổi trạng thái đơn, đánh dấu cần hoàn tiền (`api-contract.md` §13.5).
  - VNPay/Stripe bật theo env (thiếu thì tắt, §8); khóa `sk_live_` bị từ chối khi khởi động.
  - Hoàn tiền: thủ công. Admin hoàn trên cổng rồi ghi nhận (`POST /admin/orders/:code/refunds`, D-015).
- Tác vụ nền (trong tiến trình backend, `setInterval`): 
  - Job dọn dẹp (M3): xóa giỏ guest không hoạt động > 30 ngày; xóa `RefreshToken`/`PasswordResetToken`/`EmailVerificationToken` đã hết hạn. Chạy mỗi 60 phút, dùng `pg_try_advisory_xact_lock` để chỉ 1 instance chạy mỗi lượt; bật/tắt bằng env `JOBS_ENABLED` (mặc định `true`, luôn tắt khi `NODE_ENV=test`).
  - Job hết hạn thanh toán (M5, D-015): chạy mỗi 60 giây, advisory lock riêng, tối đa 50 đơn `PENDING_PAYMENT` có `expiresAt < now` mỗi lượt (kể cả `paymentStatus=FAILED`); mỗi đơn 1 transaction: `cancelOrderTx` (actor SYSTEM, hoàn kho, hoàn lượt mã), Payment `PENDING` -> `FAILED`; sau commit gửi email hủy và best-effort expire phiên Stripe (lỗi chỉ log). Cùng cờ `JOBS_ENABLED`.
- Email: Nodemailer (Mailpit khi dev); gửi sau commit, lỗi gửi mail không làm hỏng đơn (log + retry đơn giản). Từ M5 gửi cả email đổi trạng thái (`CONFIRMED`, `SHIPPING`, `DELIVERED`, `CANCELLED`, D-016; `api-contract.md` §13.9).

## 8. Cấu hình môi trường

`.env.example` (không commit `.env`). Biến chính:

| Biến | Ví dụ / ghi chú |
|---|---|
| `DATABASE_URL` | `postgresql://beanbox:beanbox@localhost:5432/beanbox` |
| `PORT` | `4000` |
| `FRONTEND_ORIGINS` | `http://localhost:3000` (phân tách dấu phẩy; dùng cho CORS + kiểm tra Origin) |
| `HOST` | `127.0.0.1` (mặc định; địa chỉ backend lắng nghe, D-009) |
| `TRUST_PROXY` | mặc định `loopback`; Docker dùng `uniquelocal`; cấm `true` (D-009) |
| `INTERNAL_API_SECRET` (backend + frontend server, tùy chọn) | chuỗi >= 32 ký tự; SSR gửi qua `X-Internal-Secret`; chỉ ở server, không bao giờ `NEXT_PUBLIC_` (D-009) |
| `WEB_APP_URL` | gốc link trong email, mặc định `http://localhost:3000`; không dựng link từ header Host/Origin |
| `JOBS_ENABLED` | mặc định `true`; bật/tắt job nền dọn dẹp (§7); luôn tắt khi `NODE_ENV=test` |
| `COOKIE_SECURE` | mặc định `true` khi production |
| `JWT_ACCESS_SECRET` | chuỗi >= 32 ký tự ngẫu nhiên |
| `ACCESS_TOKEN_TTL` / `REFRESH_TOKEN_TTL_DAYS` | `15m` / `7` |
| `API_INTERNAL_URL` (frontend) | `http://localhost:4000` (Docker: `http://backend:4000`) |
| `SMTP_HOST/PORT/USER/PASS`, `MAIL_FROM` | Mailpit dev |
| `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET` | Có cả hai thì bật VNPay; thiếu thì tắt (quote `enabled:false`, đặt đơn -> 409 `PAYMENT_METHOD_UNAVAILABLE`). Lấy từ tài khoản sandbox, xem `payments-setup.md` |
| `VNPAY_PAYMENT_URL` | mặc định `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html`; bắt buộc https |
| `VNPAY_RETURN_URL` | mặc định `${WEB_APP_URL}/thanh-toan/ket-qua?provider=vnpay` |
| `STRIPE_SECRET_KEY` | Có thì bật Stripe; CHỈ dạng `sk_test_...` (`sk_live_` -> backend từ chối khởi động) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...`, tùy chọn; thiếu thì webhook trả 503, vẫn xác nhận qua `POST /payments/stripe/sync` |
| `ORDER_RATE_LIMIT_PER_MIN`, `COUPON_RATE_LIMIT_PER_MIN`, `QUOTE_RATE_LIMIT_PER_MIN` | mặc định `10`, `10`, `30` (D-011, D-016); số nguyên dương |
| `SEED_ADMIN_PASSWORD`, `SEED_STAFF_PASSWORD`, `SEED_CUSTOMER_PASSWORD` | mật khẩu dev cho seed; seed từ chối chạy khi `NODE_ENV=production` |

Backend validate toàn bộ env bằng zod khi khởi động, thiếu/sai thì dừng ngay.

## 9. Quyết định kiến trúc (ADR rút gọn)

| # | Quyết định | Lý do |
|---|---|---|
| 1 | Rewrites same-origin thay vì CORS cross-site | Cookie đơn giản, SameSite=Strict hoạt động, ít lỗi CORS |
| 2 | Access token trong memory, refresh qua cookie httpOnly | Giảm rủi ro XSS đánh cắp token dài hạn |
| 3 | Refresh token ngẫu nhiên + hash, không JWT | Thu hồi/rotation dễ, lộ DB không lộ token |
| 4 | Giỏ server-side cho cả guest | Một nguồn sự thật, merge đơn giản, kiểm tra tồn kho nhất quán |
| 5 | Denormalize `minPrice/soldCount/rating*/inStock/searchText` | Query list nhanh với index; đánh đổi: phải cập nhật đúng chỗ (service) |
| 6 | Trừ kho bằng điều kiện `stock >= qty` trong transaction | Không bán âm kể cả khi đồng thời, không cần khóa tường minh |
| 7 | Trừ kho khi tạo đơn, hết hạn thì hoàn | Theo requirements §5.2 |
| 8 | Hai project độc lập, không monorepo | Đơn giản CI/Docker; chấp nhận không chia sẻ type (type API viết tay ở FE theo contract) |
| 9 | Giữ lượt mã khi tạo đơn bằng UPDATE có điều kiện | Không bao giờ vượt `usageLimit`/`perUserLimit` kể cả khi đồng thời; hoàn lượt idempotent khi `CANCELLED` (D-004) |
| 10 | IP client & rate limit sau proxy (D-009) | `TRUST_PROXY` cấu hình được thay cho `trust proxy = 1`, backend bind `127.0.0.1`, SSR dùng `X-Internal-Secret` để không dồn chung một IP; chấp nhận rủi ro rate limit SSR phải đặt ở edge khi deploy |

## 10. Câu hỏi mở / Giả định

- Prisma phiên bản: ghi nhận dùng **Prisma 6.x** (khối `datasource` còn `url = env(...)`). Nếu scaffold chọn Prisma 7, chuyển URL sang `prisma.config.ts`.
- Job nền chạy trong tiến trình API là đủ cho MVP một instance; khi scale ngang cần advisory lock (đã nêu) hoặc tách worker.
- Chia sẻ type FE/BE: chưa làm (không monorepo). Có thể sinh type từ zod/OpenAPI sau.
- Các điểm mở khác xem cuối `db-schema.md` và `api-contract.md`.
