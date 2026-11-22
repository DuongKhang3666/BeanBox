# BeanBox – Kiến trúc hệ thống

> Phiên bản 0.9 · 2026-11-21 · Nguồn: `docs/requirements.md` + quyết định của Tech Lead.
> Thay đổi 0.9 (D-046..D-054, không đổi kiến trúc tổng thể, không thêm dịch vụ): gợi ý sản phẩm (`related` chấm điểm nội dung trong `lib/related.ts`, endpoint công khai `GET /products/:slug/bought-together` dùng SQL tham số hóa, ngưỡng riêng tư >= 2 khách, D-046); so sánh sản phẩm (danh sách ở localStorage, `GET /products/compare?slugs=`, trang `/so-sanh` noindex, D-047); quy ước vùng cuộn ngang `relative` và kiểm `/admin` ở 390/768 (D-048); khu phân tích kinh doanh chỉ Admin (`requireAdmin` ở cấp router `/admin/analytics/*`, FE `/admin/phan-tich`, biểu đồ SVG tự vẽ, D-049..D-052), xuất CSV có audit, fail-closed và limiter riêng sau `requireAdmin` (`lib/csv.ts`, D-053); đo hiệu năng trên 100.000 đơn, không thêm index, công cụ sinh dữ liệu demo ngoài build/image, bản in (D-054). Chi tiết: [`decisions.md`](decisions.md).
> Thay đổi 0.8 (D-045, rà soát bảo mật): access token gắn với phiên, thu hồi có hiệu lực ngay (§4); `Cache-Control: no-store` mặc định cho `/api/v1` trừ GET công khai (§4); cấm `COOKIE_SECURE=false` ở production và thêm `AUTH_RATE_LIMIT_PER_MIN` (§8).
> Thay đổi 0.7 (M8, D-036..D-040): nâng Prisma 7 với driver adapter `pg` và `prisma.config.ts`, client sinh ra ở `backend/src/generated` (không commit) (§1, §2, §10); entrypoint backend kiểm env trước `migrate deploy` và Caddy redirect đúng cổng (D-037, §1); backup off-site mã hóa tùy chọn (rclone + age, D-038) và giám sát uptime bằng tài liệu + `deploy/monitoring/check.sh` (D-039) ở §2; CSP đầy đủ chuyển sang thực thi, `/admin` dùng nonce qua `src/proxy.ts` (D-040, §4, ADR 13).
> Thay đổi 0.6 (M7, D-025..D-035): triển khai production bằng Docker Compose với Caddy (TLS tự động, rate limit edge) ở §1, §2, §3; job dọn dẹp thêm xóa tin liên hệ cũ (D-029, §7); biến môi trường mới (Turnstile, `CONTACT_RETENTION_DAYS`, `SEED_ALLOW_PRODUCTION`, `INTERNAL_API_SECRET` bắt buộc ở production, biến compose prod) ở §8; thêm ADR 11-13 ở §9 (Caddy + edge rate limit, một instance không Redis, CSP tập con thực thi). Hướng dẫn vận hành: [`deployment.md`](deployment.md).
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
| Backend | Express + TypeScript + Prisma 7 (driver adapter `pg`) + zod | 4000 |
| Database | PostgreSQL (extension `pg_trgm`) | 5432 |

**Production / demo (D-025, D-026)** chạy bằng `docker-compose.prod.yml`; chỉ Caddy publish cổng ra host, các service còn lại chỉ nằm trong mạng Docker:

```
Internet ──► Caddy :80/:443 ──┬─ /api/v1/*, /uploads/* ──────────────► Express :4000 ──► PostgreSQL :5432
 (TLS tự động,                └─ còn lại (trang, /_next/*, /healthz) ─► Next.js :3000
  rate limit edge)                                                          │
                                                                            └─ SSR gọi backend qua API_INTERNAL_URL (http://backend:4000)
```

Chi tiết triển khai và vận hành: [`deployment.md`](deployment.md).

Entrypoint backend: `node dist/checkEnv.js` -> `prisma migrate deploy` -> `exec node dist/server.js` (env sai thì dừng trước khi áp migration, D-037). Caddy nhận cổng qua `HTTP_PORT`/`HTTPS_PORT` (mặc định 80/443; đổi chỉ để thử cục bộ). Backup: `pg_dump` + uploads cục bộ, tùy chọn đẩy off-site mã hóa age bằng rclone (D-038); uptime do monitor ngoài VPS kiểm (D-039, `deploy/monitoring/check.sh`).

- Node >= 22 LTS, package manager `npm`. `frontend/` và `backend/` là hai project độc lập (không workspace, mỗi nơi có `package.json` + `package-lock.json` riêng).
- Dev chạy bằng Docker Compose (Postgres bắt buộc; app tùy chọn). Email dev: Mailpit. Thanh toán: COD, VNPay sandbox, Stripe test.

## 2. Cấu trúc thư mục

```
BeanBox/
├─ docs/
├─ frontend/
│  └─ src/
│     ├─ proxy.ts       # chỉ /admin: nonce + CSP thực thi (Next 16, D-040); policy dựng ở lib/csp.ts
│     ├─ app/           # App Router: route theo sitemap (/danh-muc/[slug], /san-pham/[slug], /admin/...)
│     ├─ components/    # UI dùng chung (Button, Input, ProductCard, Skeleton...)
│     ├─ features/      # theo nghiệp vụ: catalog, cart, checkout, account, admin (component + hook + api calls)
│     └─ lib/           # api client (fetch wrapper, refresh single-flight), format tiền/ngày, utils
├─ backend/
│  ├─ prisma.config.ts  # cấu hình Prisma CLI: nạp .env, SHADOW_DATABASE_URL, seed (D-036)
│  ├─ prisma/           # schema.prisma, migrations/, seed.ts, seed-data/
│  ├─ data/             # provinces-wards.json + README.md (nguồn) – danh mục hành chính 2 cấp, đọc lúc khởi động (D-006)
│  ├─ src/
│  │  ├─ generated/     # Prisma Client sinh bởi `npx prisma generate` (KHÔNG commit, D-036)
│  │  ├─ config/        # env (zod-validated), constants; paths.ts (UPLOADS_DIR; AppOptions.uploadsDir cho test)
│  │  ├─ lib/           # prisma client, logger (pino), errors (AppError), mailer, tokens, money, text (bỏ dấu), audit.ts (ghi AuditLog trong transaction, M4)
│  │  ├─ middlewares/   # requestId, auth, requireRole, validate(zod), rateLimit, originCheck, errorHandler
│  │  └─ modules/<module>/{<module>.routes,.controller,.service,.schema}.ts
│  │        # modules: health, catalog, auth, me, locations, cart, checkout, orders, admin (M4), payments (M5), reviews, wishlist (M6)
│  │        # modules/admin/: orders, inventory, catalog (categories/brands), products (gồm variants, images, restore), uploads; một router duy nhất mount /admin
│  │        # M6 thêm: modules/reviews (công khai + của tôi), modules/wishlist (/me/wishlist), modules/admin/dashboard, modules/admin/audit (chỉ Admin), modules/admin/reviews; slug redirect nằm trong catalog + admin/catalog + admin/products (bảng SlugRedirect)
│  │        # M6b thêm (D-021..D-024): modules/settings (`GET /settings/public`), modules/contact (`POST /contact`), `POST /csp-report`; modules/admin/settings (chỉ Admin), modules/admin/users (chỉ Admin), modules/admin/contact-messages (Staff+)
│  └─ tests/            # unit (pricing, shipping, state machine) + integration (supertest)
├─ deploy/
│  ├─ caddy/            # Caddyfile (TLS, rate limit edge, header, log JSON) + Dockerfile (xcaddy + caddy-ratelimit), D-026
│  ├─ backup/           # Dockerfile (postgres:17 + rclone + age), backup.sh, restore.sh, loop.sh, fetch-remote.sh, selftest-offsite.sh (D-034, D-038)
│  └─ monitoring/       # check.sh: kiểm health, trang chủ, hạn TLS cho monitor ngoài/cron (D-039)
├─ docker-compose.yml           # dev: db, mailpit; profile app: backend + frontend
├─ docker-compose.prod.yml      # production/demo: caddy, frontend, backend, db; profile backup, tools (D-025)
├─ .env.production.example      # mẫu biến production (sao chép thành .env.production, không commit)
├─ .env.example, .github/workflows/ci.yml, .gitleaks.toml
```

Quy tắc phân lớp backend: `routes` (khai báo + middleware) -> `controller` (parse request/format response, mỏng) -> `service` (nghiệp vụ, transaction, không biết Express) -> Prisma. Logic thuần (tính giá, phí ship, state machine) tách thành hàm thuần để test unit không cần DB.

## 3. Luồng gọi API

- **Trình duyệt** luôn gọi đường dẫn tương đối `/api/v1/...` (same-origin). `next.config` có `rewrites`: `/api/v1/:path*` -> `http://localhost:4000/api/v1/:path*` (hoặc biến môi trường khi chạy Docker). Nhờ đó cookie refresh là first-party, không cần `credentials: include` cross-site.
- **SSR / Server Components** (trang danh mục, chi tiết sản phẩm, SEO) gọi thẳng `${API_INTERNAL_URL}/api/v1/...`, chỉ cho dữ liệu công khai (catalog). Dữ liệu cần đăng nhập (giỏ, tài khoản, đơn) lấy ở client component.
- Backend **vẫn bật CORS** với whitelist origin (`FRONTEND_ORIGINS`) để phòng khi gọi trực tiếp (test, Postman, tương lai tách domain).
- **IP client & rate limit (D-009).** Backend lắng nghe `HOST` (mặc định `127.0.0.1`; docker-compose bind cổng 4000, 5432, 1025, 8025 vào `127.0.0.1`). `trust proxy` đọc từ env `TRUST_PROXY` (mặc định `loopback`, Docker dùng `uniquelocal`; cấm giá trị `true`). Next rewrites tự thêm `X-Forwarded-For` nên IP thật của trình duyệt đi qua được tới backend. Request SSR gửi header `X-Internal-Secret` (= `INTERNAL_API_SECRET`) để được MIỄN rate limit chung (không miễn nhóm nhạy cảm auth); không chuyển tiếp IP client từ SSR vì làm trang thành dynamic và phân mảnh cache fetch của Next. Rủi ro còn lại: lưu lượng SSR không bị giới hạn ở backend nên khi deploy (M7) phải đặt rate limit ở reverse proxy/edge trước Next; lộ `INTERNAL_API_SECRET` cho phép lách rate limit chung (không lách được nhóm auth).
- **Production (D-026).** Trình duyệt chỉ nói chuyện với Caddy. Caddy định tuyến `/api/v1/*` và `/uploads/*` THẲNG tới `backend:4000` (không đi qua rewrites của Next), còn lại tới `frontend:3000`; SSR của Next vẫn gọi backend nội bộ bằng `API_INTERNAL_URL` kèm `X-Internal-Secret`. Caddy đặt `X-Forwarded-For` = IP kết nối thật (bỏ XFF do client gửi, trừ khi cấu hình `trusted_proxies` sau Cloudflare), backend tin hop Docker bằng `TRUST_PROXY=uniquelocal`, nên cookie vẫn first-party. Rate limit edge theo IP bảo vệ cả lưu lượng SSR mà backend miễn (đóng rủi ro còn lại của D-009). Lỗi do chính Caddy sinh ra ở `/api/v1/*` trả JSON theo format lỗi chuẩn (`api-contract.md` §1).

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
| CSP (D-024, D-040) | Frontend gửi `Content-Security-Policy` THỰC THI (không còn report-only). Storefront: `headers()` trong `next.config.ts`, `script-src` còn `'unsafe-inline'` để giữ static/ISR. `/admin`: `src/proxy.ts` sinh nonce theo request + `'strict-dynamic'`, admin layout ép render động; vào `/admin` bằng tải trang đầy đủ. Policy dựng ở `src/lib/csp.ts`. Trình duyệt báo vi phạm tới `POST /api/v1/csp-report` (rate limit 20/phút/IP, log `warn` đã làm sạch, không lưu DB, không PII). Backend API vẫn giữ CSP mặc định của helmet cho response JSON. Chi tiết: api-contract §14.12 |
| Admin | Router `/admin` áp `requireAuth` + `requireStaff` ở cấp router (mọi endpoint con tự động được bảo vệ); xóa sản phẩm/danh mục/brand cần thêm `requireAdmin`. Mọi thao tác ghi ghi `AuditLog` cùng transaction (`lib/audit.ts`) |
| Frontend | Fetch wrapper tự gắn Bearer; gặp 401 -> refresh **single-flight** trong tab (nhiều request chờ chung 1 lần refresh) -> retry 1 lần. Giữa các tab: khóa bằng Web Locks API (`navigator.locks`) nếu trình duyệt hỗ trợ |
| Gắn access token với phiên (D-045) | `authenticate` đọc user và, trong CÙNG truy vấn, kiểm tra tồn tại refresh token của user với `familyId = sid`, `revokedAt IS NULL`, `expiresAt > now` (index `familyId`). Không có -> 401 `UNAUTHORIZED`. Logout, đặt lại/đổi mật khẩu (trừ phiên hiện tại), phát hiện dùng lại refresh token, admin khóa/đổi role user đều thu hồi refresh token nên access token bị chặn NGAY. Thứ tự: user không tồn tại 401 -> `DISABLED` 403 -> phiên 401. Rotation (`refresh()`) thu hồi token cũ và tạo token mới trong một transaction nên family luôn còn một token sống, không đổi hành vi refresh. Chi phí: không thêm truy vấn (gộp vào truy vấn user, dạng subselect có index) |
| Cache-Control (D-045) | Middleware `apiCacheControl` (sau `requestId`, chỉ cho `/api/v1`): mặc định `Cache-Control: no-store` cho mọi response, kể cả lỗi; bỏ qua GET/HEAD công khai: `/categories*`, `/brands`, `/products`, `/products/:slug`, `/products/:slug/reviews`, `/products/:slug/bought-together`, `/search/suggest`, `/locations/*`, `/settings/public`, `/health*` (giữ ISR của Next cho catalog; route tự đặt header nào thì giữ nguyên). `/products/:slug/reviews/me` (cần đăng nhập) vẫn `no-store`. Thêm endpoint GET công khai mới thì phải thêm vào regex `PUBLIC_CACHEABLE` trong `app.ts` nếu muốn cho cache |
| Hạn chế đã chấp nhận | Access token trong memory vẫn đọc được nếu có XSS (giảm nhẹ bằng CSP, D-040); thu hồi phiên chỉ chặn từ lúc đó trở đi (token đã bị đánh cắp dùng được tới lúc phát hiện) |

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
- **Gợi ý tìm kiếm (M6, FR-CAT-06):** FE gọi `GET /search/suggest` (api-contract §4.5) từ ô tìm kiếm header dạng combobox: tối thiểu 2 ký tự, debounce, hủy request cũ; không đổi API.
- **Gợi ý sản phẩm (D-046):** `related` trong `GET /products/:slug` chấm điểm nội dung (hàm thuần `backend/src/lib/related.ts`, ứng viên lấy bằng một truy vấn). `GET /products/:slug/bought-together` (api-contract §4.6) đếm số khách khác nhau mua cùng sản phẩm bằng một truy vấn `$queryRaw` tham số hóa trên `OrderItem`/`Order` (index `OrderItem(productId)`, `OrderItem(orderId)` đã có), ngưỡng riêng tư >= 2 khách, không cache phía server; FE lấy ở server với revalidate 60 giây và ẩn section khi rỗng/lỗi.
- **So sánh sản phẩm (D-047):** `GET /products/compare?slugs=` (api-contract §4.7) trả 2–4 sản phẩm trong một `findMany` (không N+1, không `description`/`stock`), route khai báo trước `/products/:slug` nên slug `compare` được dành riêng (admin từ chối). FE: `features/compare/` (store localStorage `bb_compare_v1` + hook `useSyncExternalStore`, `CompareButton` trên thẻ và trang sản phẩm, `CompareBar` cố định đáy gắn ở `app/layout.tsx`, `CompareView`/`CompareTable` cho trang `/so-sanh` noindex đọc `?sp=`, gọi API phía client). Không có bảng DB mới.
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
  - Job dọn dẹp (M3): xóa giỏ guest không hoạt động > 30 ngày; xóa `RefreshToken`/`PasswordResetToken`/`EmailVerificationToken` đã hết hạn; xóa cứng `ContactMessage` có `status` `RESOLVED`/`SPAM` và `createdAt` cũ hơn `CONTACT_RETENTION_DAYS` ngày (D-029, mặc định 365, `0` = tắt). Chạy mỗi 60 phút, dùng `pg_try_advisory_xact_lock` để chỉ 1 instance chạy mỗi lượt; bật/tắt bằng env `JOBS_ENABLED` (mặc định `true`, luôn tắt khi `NODE_ENV=test`).
  - Job hết hạn thanh toán (M5, D-015): chạy mỗi 60 giây, advisory lock riêng, tối đa 50 đơn `PENDING_PAYMENT` có `expiresAt < now` mỗi lượt (kể cả `paymentStatus=FAILED`); mỗi đơn 1 transaction: `cancelOrderTx` (actor SYSTEM, hoàn kho, hoàn lượt mã), Payment `PENDING` -> `FAILED`; sau commit gửi email hủy và best-effort expire phiên Stripe (lỗi chỉ log). Cùng cờ `JOBS_ENABLED`.
  - Job hủy đơn COD khách vãng lai quá hạn xác nhận (D-057): chạy cùng nhịp 60 giây và dùng cùng advisory lock với job hết hạn thanh toán (chạy nối tiếp nhau); tối đa 50 đơn `PENDING`, `userId` null, COD, tạo trước `now - GUEST_COD_HOLD_HOURS` giờ mỗi lượt; mỗi đơn 1 transaction, `cancelOrderTx` actor `SYSTEM`, lý do `GUEST_COD_EXPIRE_REASON`, hoàn kho + hoàn lượt mã, gửi email trạng thái sau commit.
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
| `INTERNAL_API_SECRET` (backend + frontend server) | chuỗi >= 32 ký tự; SSR gửi qua `X-Internal-Secret`; chỉ ở server, không bao giờ `NEXT_PUBLIC_` (D-009). Tùy chọn ở dev, BẮT BUỘC khi `NODE_ENV=production` (thiếu thì backend không khởi động; D-026) |
| `TOTP_ENCRYPTION_KEY` | khóa AES-256-GCM (32 byte, dạng hex 64 ký tự hoặc base64) mã hóa secret TOTP của 2FA (D-063). Tùy chọn ở dev: thiếu thì setup 2FA trả 503 `TWO_FACTOR_UNAVAILABLE` và user đã bật 2FA không đăng nhập được. BẮT BUỘC ở production; khóa mẫu bắt đầu bằng `beanbox-dev-` bị từ chối. Không đổi/mất khóa sau khi có người bật 2FA (chưa hỗ trợ xoay khóa) |
| `WEB_APP_URL` | gốc link trong email, mặc định `http://localhost:3000`; không dựng link từ header Host/Origin |
| `JOBS_ENABLED` | mặc định `true`; bật/tắt job nền dọn dẹp (§7); luôn tắt khi `NODE_ENV=test` |
| `COOKIE_SECURE` | mặc định `true` khi production; `false` ở production bị từ chối lúc khởi động (D-045) |
| `AUTH_RATE_LIMIT_PER_MIN` | mặc định `5`; số nguyên dương; limiter nhóm auth (register, login, forgot/reset/change-password). E2E/CI đặt `30`; production giữ 5 (D-045) |
| `JWT_ACCESS_SECRET` | chuỗi >= 32 ký tự ngẫu nhiên; khi `NODE_ENV=production`, `JWT_ACCESS_SECRET`/`INTERNAL_API_SECRET` bắt đầu bằng `dev-` bị từ chối lúc khởi động (D-020) |
| `ACCESS_TOKEN_TTL` / `REFRESH_TOKEN_TTL_DAYS` | `15m` / `7` |
| `API_INTERNAL_URL` (frontend) | `http://localhost:4000` (Docker: `http://backend:4000`) |
| `SMTP_HOST/PORT/USER/PASS`, `MAIL_FROM` | Mailpit dev |
| `SMTP_SECURE`, `SMTP_REQUIRE_TLS` | `SMTP_SECURE` mặc định `false` (`true` = TLS ngầm định, cổng 465); `SMTP_REQUIRE_TLS` mặc định `true` khi production, `false` còn lại (D-056) |
| `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET` | Có cả hai thì bật VNPay; thiếu thì tắt (quote `enabled:false`, đặt đơn -> 409 `PAYMENT_METHOD_UNAVAILABLE`). Lấy từ tài khoản sandbox, xem `payments-setup.md` |
| `VNPAY_PAYMENT_URL` | mặc định `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html`; bắt buộc https |
| `VNPAY_RETURN_URL` | mặc định `${WEB_APP_URL}/thanh-toan/ket-qua?provider=vnpay` |
| `PAYMENT_MOCKS_ENABLED`, `PAYMENT_MOCK_SECRET` | (D-060) mặc định tắt; bật cổng VNPay giả và MoMo giả. Từ chối khi `NODE_ENV=production` hoặc có `VNPAY_TMN_CODE`; secret >= 16 ký tự, trống thì sinh ngẫu nhiên mỗi lần khởi động |
| `BANK_TRANSFER_ENABLED`, `BANK_TRANSFER_HOLD_HOURS` | (D-061) mặc định tắt; bật chuyển khoản VietQR; thời gian giữ đơn 1..72 giờ, mặc định 24 |
| `STRIPE_SECRET_KEY` | Có thì bật Stripe; CHỈ dạng `sk_test_...` (`sk_live_` -> backend từ chối khởi động) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...`, tùy chọn; thiếu thì webhook trả 503, vẫn xác nhận qua `POST /payments/stripe/sync` |
| `ORDER_RATE_LIMIT_PER_MIN`, `COUPON_RATE_LIMIT_PER_MIN`, `QUOTE_RATE_LIMIT_PER_MIN` | mặc định `10`, `10`, `30` (D-011, D-016); số nguyên dương |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | captcha form liên hệ (D-028); có ĐỦ cả hai mới bật, chỉ một trong hai thì backend không khởi động; trống = tắt |
| `CONTACT_RETENTION_DAYS` | mặc định `365`; số ngày giữ tin liên hệ `RESOLVED`/`SPAM` trước khi job xóa cứng; `0` = tắt (D-029) |
| `GUEST_COD_HOLD_HOURS`, `GUEST_COD_MAX_OPEN` | mặc định `48` (1..720) và `3` (1..100): hạn giữ kho và số đơn COD khách vãng lai đang chờ xác nhận tối đa theo SĐT/email (D-057) |
| `DATABASE_POOL_MAX`, `ANALYTICS_POOL_MAX`, `ANALYTICS_STATEMENT_TIMEOUT_MS` | mặc định `10`, `4`, `15000` (1000..120000): pool chính, pool riêng cho analytics, `statement_timeout` của pool analytics (D-058) |
| `SEED_ADMIN_PASSWORD`, `SEED_STAFF_PASSWORD`, `SEED_CUSTOMER_PASSWORD` | mật khẩu cho seed; mặc định seed từ chối chạy khi `NODE_ENV=production` |
| `SEED_ALLOW_PRODUCTION` | `true` để cho phép seed ở production (D-031); khi đó cả 3 mật khẩu phải >= 12 ký tự, có chữ và số, khác giá trị mẫu |
| Biến compose production (`PUBLIC_URL`, `SITE_ADDRESS`, `ACME_EMAIL`, `HTTP_PORT`, `HTTPS_PORT`, `POSTGRES_*`, `EDGE_RATE_*`, `BACKUP_*`) | chỉ dùng ở `docker-compose.prod.yml` / `.env.production`; `PUBLIC_URL` được compose gán cho `WEB_APP_URL`, `FRONTEND_ORIGINS` và `NEXT_PUBLIC_SITE_URL` (nhúng lúc build frontend). Bảng đầy đủ: [`deployment.md`](deployment.md) §4. Cấu hình backup off-site (`BACKUP_REMOTE`, `RCLONE_CONFIG_*`, `BACKUP_AGE_RECIPIENTS`...) nằm riêng ở `.env.backup` (mẫu `.env.backup.example`, D-038), xem [`deployment.md`](deployment.md) §11 |

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
| 11 | Caddy làm reverse proxy + rate limit ở edge (D-026) | TLS Let's Encrypt tự động, một chỗ đặt header bảo mật/giới hạn body/log JSON, rate limit theo IP cho cả lưu lượng SSR; đánh đổi: plugin `caddy-ratelimit` bên thứ ba (ghim commit), bộ đếm trong bộ nhớ, reset khi restart |
| 12 | Một instance backend, MemoryStore, không Redis (D-027) | Đủ cho demo, ít thành phần phải vận hành; job nền đã an toàn nhiều instance nhờ advisory lock, nhưng rate limit thì chưa, nên scale ngang cần store dùng chung |
| 13 | CSP thực thi: storefront không nonce, `/admin` có nonce (D-040, thay D-032) | Nonce cho toàn site buộc mọi trang render động (mất ISR/cache catalog) và hash không khả thi vì script inline của Next chứa payload RSC đổi theo trang/build. Storefront: CSP đầy đủ thực thi với `script-src 'unsafe-inline'` (chưa chặn XSS inline, chấp nhận). `/admin`: nonce + `'strict-dynamic'` ở `src/proxy.ts`, chỉ `/admin/*` render động. Bỏ header report-only; Caddy không được đặt thêm CSP |

## 10. Câu hỏi mở / Giả định

- Prisma phiên bản: **Prisma 7** (D-036), URL DB và shadow DB cấu hình ở `backend/prisma.config.ts`, client sinh vào `backend/src/generated/prisma` bằng `npx prisma generate` (không commit; chạy sau mỗi `npm install`). Prisma 8 đang RC, chưa nâng.
- Job nền chạy trong tiến trình API là đủ cho MVP một instance; khi scale ngang cần advisory lock (đã nêu) hoặc tách worker.
- Chia sẻ type FE/BE: chưa làm (không monorepo). Có thể sinh type từ zod/OpenAPI sau.
- Các điểm mở khác xem cuối `db-schema.md` và `api-contract.md`.
