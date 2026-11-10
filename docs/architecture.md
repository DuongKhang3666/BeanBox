# BeanBox – Kiến trúc hệ thống

> Phiên bản 0.2 · 2026-11-10 · Nguồn: `docs/requirements.md` + quyết định của Tech Lead.
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
│  ├─ prisma/           # schema.prisma, migrations/, seed.ts, data/ (provinces-wards.json – M2, file nguồn do chủ dự án cung cấp)
│  ├─ src/
│  │  ├─ config/        # env (zod-validated), constants
│  │  ├─ lib/           # prisma client, logger (pino), errors (AppError), mailer, tokens, money, text (bỏ dấu)
│  │  ├─ middlewares/   # requestId, auth, requireRole, validate(zod), rateLimit, originCheck, errorHandler
│  │  └─ modules/<module>/{<module>.routes,.controller,.service,.schema}.ts
│  │        # modules: health, catalog, auth, me, locations, cart, checkout, orders, (admin, payments, reviews... ở M4+)
│  └─ tests/            # unit (pricing, shipping, state machine) + integration (supertest)
├─ docker-compose.yml, .env.example, .github/workflows/ci.yml
```

Quy tắc phân lớp backend: `routes` (khai báo + middleware) -> `controller` (parse request/format response, mỏng) -> `service` (nghiệp vụ, transaction, không biết Express) -> Prisma. Logic thuần (tính giá, phí ship, state machine) tách thành hàm thuần để test unit không cần DB.

## 3. Luồng gọi API

- **Trình duyệt** luôn gọi đường dẫn tương đối `/api/v1/...` (same-origin). `next.config` có `rewrites`: `/api/v1/:path*` -> `http://localhost:4000/api/v1/:path*` (hoặc biến môi trường khi chạy Docker). Nhờ đó cookie refresh là first-party, không cần `credentials: include` cross-site.
- **SSR / Server Components** (trang danh mục, chi tiết sản phẩm, SEO) gọi thẳng `${API_INTERNAL_URL}/api/v1/...`, chỉ cho dữ liệu công khai (catalog). Dữ liệu cần đăng nhập (giỏ, tài khoản, đơn) lấy ở client component.
- Backend **vẫn bật CORS** với whitelist origin (`FRONTEND_ORIGINS`) để phòng khi gọi trực tiếp (test, Postman, tương lai tách domain).
- Backend đặt `trust proxy` đúng để rate limit theo IP thật khi đứng sau Next rewrites/reverse proxy.

## 4. Xác thực & phiên

| Thành phần | Quyết định |
|---|---|
| Mật khẩu | argon2id; chính sách >= 8 ký tự, có chữ và số; tối đa 72 ký tự |
| Access token | JWT 15 phút, claims `sub`, `role`, `iat`, `exp`; gửi `Authorization: Bearer`; FE giữ **trong memory** (không localStorage). Mất khi reload -> FE gọi `POST /auth/refresh` lúc khởi động |
| Refresh token | Chuỗi ngẫu nhiên 32 byte (base64url), **không phải JWT**; DB lưu SHA-256 hash; hạn 7 ngày |
| Cookie | `bb_rt`: httpOnly, `Secure` (prod), `SameSite=Strict`, `Path=/api/v1/auth` |
| Rotation | Mỗi lần refresh: thu hồi token cũ (`revokedAt`, `replacedById`), cấp token mới cùng `familyId` |
| Reuse detection | Dùng lại token đã thu hồi -> thu hồi **toàn bộ family** (đăng xuất thiết bị đó), trả 401 |
| CSRF | Endpoint dùng cookie (`/auth/refresh`, `/auth/logout`): `SameSite=Strict` + kiểm tra header `Origin` thuộc whitelist (thiếu hoặc sai -> 403) |
| Khóa tài khoản | 5 lần sai liên tiếp trong 15 phút -> `lockedUntil = now + 15 phút` (FR-AUTH-08) |
| RBAC | `CUSTOMER`, `STAFF`, `ADMIN`; middleware `requireRole`. Role lấy từ DB mỗi request admin (không tin hoàn toàn claim cũ) |
| Frontend | Fetch wrapper tự gắn Bearer; gặp 401 -> refresh **single-flight** (nhiều request chờ chung 1 lần refresh) -> retry 1 lần |

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
- Online (M5): đơn `PENDING_PAYMENT` + `expiresAt = now + 15 phút`; tạo link thanh toán; **chỉ IPN/webhook đã xác thực chữ ký + khớp số tiền** mới chuyển `CONFIRMED`/`PAID`. Trang return chỉ hiển thị.
- Tác vụ nền (trong tiến trình backend, `setInterval` 60 giây hoặc `node-cron`, dùng `pg_try_advisory_lock` để chỉ 1 instance chạy): (1) hủy đơn `PENDING_PAYMENT` quá `expiresAt` (kể cả đơn `paymentStatus=FAILED`) + hoàn kho + hoàn lượt mã; (2) xóa giỏ guest không hoạt động > 30 ngày; (3) xóa token hết hạn.
- Email: Nodemailer (Mailpit khi dev); gửi sau commit, lỗi gửi mail không làm hỏng đơn (log + retry đơn giản).

## 8. Cấu hình môi trường

`.env.example` (không commit `.env`). Biến chính:

| Biến | Ví dụ / ghi chú |
|---|---|
| `DATABASE_URL` | `postgresql://beanbox:beanbox@localhost:5432/beanbox` |
| `PORT` | `4000` |
| `FRONTEND_ORIGINS` | `http://localhost:3000` (phân tách dấu phẩy; dùng cho CORS + kiểm tra Origin) |
| `JWT_ACCESS_SECRET` | chuỗi >= 32 ký tự ngẫu nhiên |
| `ACCESS_TOKEN_TTL` / `REFRESH_TOKEN_TTL_DAYS` | `15m` / `7` |
| `API_INTERNAL_URL` (frontend) | `http://localhost:4000` (Docker: `http://backend:4000`) |
| `SMTP_HOST/PORT/USER/PASS`, `MAIL_FROM` | Mailpit dev |
| `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, `VNPAY_RETURN_URL` | M5 |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | M5 |
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

## 10. Câu hỏi mở / Giả định

- Prisma phiên bản: ghi nhận dùng **Prisma 6.x** (khối `datasource` còn `url = env(...)`). Nếu scaffold chọn Prisma 7, chuyển URL sang `prisma.config.ts`.
- Job nền chạy trong tiến trình API là đủ cho MVP một instance; khi scale ngang cần advisory lock (đã nêu) hoặc tách worker.
- Chia sẻ type FE/BE: chưa làm (không monorepo). Có thể sinh type từ zod/OpenAPI sau.
- Các điểm mở khác xem cuối `db-schema.md` và `api-contract.md`.
