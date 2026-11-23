# BeanBox - Lộ trình tiếp theo (roadmap-next)

- Ngày: 2026-11-21
- HEAD: 6fd1313
- Phạm vi rà soát: bảo mật, hiệu năng backend/DB, frontend UX/SEO/a11y, vận hành/CI/deploy, test, tài liệu, tính năng TMĐT.

## Cập nhật phạm vi (2026-11-21)

Chủ dự án chốt: BeanBox là dự án portfolio/CV, chỉ chạy localhost, không deploy thật, thanh toán chỉ ở chế độ demo. Hệ quả cho roadmap:

- Toàn bộ phần (b) R-25..R-37 là NGOÀI PHẠM VI (cột Ưu tiên ghi "Ngoài phạm vi"; các mô tả bên dưới giữ nguyên để tham khảo).
- Phần pháp lý của R-03 (đồng ý, chính sách bảo mật, thời hạn lưu theo luật) là NGOÀI PHẠM VI. Phần kỹ thuật của R-03 (xóa/xuất tài khoản) đã làm ở Đợt 2 (D-065).
- Vận chuyển nếu làm sẽ là giả lập (không tích hợp hãng thật); không làm nhận tại cửa hàng (R-37).
- R-08 không làm bảng tổng hợp (R-19).
- Ghim SHA cho GitHub Actions và Trivy chỉ báo cáo: đã làm ở Đợt 3 (D-067).

## Quy ước

Ưu tiên:
- P0: phải làm trước khi nhận khách/tiền thật.
- P1: nên làm sớm.
- P2: cải thiện.

Độ khó:
- S: tối đa 1 ngày.
- M: 2-4 ngày.
- L: từ 1 tuần trở lên.

Nhãn "(chưa xác minh)" nghĩa là chưa kiểm chứng được trong lần rà soát; cần kiểm tra trước khi làm.

## Điểm mạnh đã xác minh (để không làm trùng)

- Auth: argon2id, access JWT 15 phút trong bộ nhớ, refresh xoay vòng có phát hiện dùng lại, role/trạng thái đọc lại DB mỗi request, khóa tài khoản nguyên tử (`backend/src/middlewares/auth.ts`, `modules/auth/auth.service.ts`).
- AuthZ/IDOR: router `/admin` bắt buộc Staff+, analytics/users/audit/settings chỉ Admin; đơn/địa chỉ/review lọc theo userId; ma trận phân quyền tự động (`backend/tests/securityAuthz.integration.test.ts`).
- Tiền và kho: giá/phí tính ở server, idempotency đặt hàng, trừ kho có điều kiện `stock >= qty` + CHECK constraint; thanh toán xác thực chữ ký, đối chiếu số tiền, xử lý idempotent có khóa.
- SQL thô đều tham số hóa (không có `$queryRawUnsafe`); upload whitelist + magic bytes; CSV export chống injection + audit + rate limit (D-053).
- CI 7 job (lint/typecheck/test/E2E/gitleaks/audit/docker/ops-lint), kiểm drift migration, selftest backup off-site.
- Frontend: JSON-LD Product/Breadcrumb/Organization, canonical, sitemap, robots; Lighthouse 92-100 (`docs/testing.md`); axe trong E2E; token chỉ trong bộ nhớ; skip link; combobox tìm kiếm đúng ARIA.
- Analytics đã đo 100k đơn trên Postgres 17 (D-054).

## Bảng tóm tắt

| Mã | Tên | Nhóm | Ưu tiên | Độ khó | Cần hạ tầng? |
|---|---|---|---|---|---|
| R-01 | Sửa tài liệu lỗi thời và liên kết gãy | Tài liệu | P1 | S | Không |
| R-02 | Lớp lỗi và trạng thái tải ở frontend | UX/SEO | P1 | S | Không |
| R-03 | Quyền dữ liệu cá nhân (Nghị định 13/2023) | Pháp lý-dữ liệu | P0 | M | Không (cần nội dung pháp lý) |
| R-04 | Chống giữ kho bằng đơn COD khách vãng lai | Bảo mật | P1 | M | Không |
| R-05 | Bảo vệ thao tác khách vãng lai bằng mã đơn | Bảo mật | P2 | S-M | Không |
| R-06 | Mailer bền vững | Độ tin cậy/Bảo mật | P1 | M | Không (kiểm thật cần R-26) |
| R-07 | CI: coverage, kiểm format, Dependabot | CI/Test | P1 | S | Không |
| R-08 | Bảo vệ DB khỏi truy vấn nặng | Hiệu năng/Vận hành | P1 | S-M | Không |
| R-09 | Cache HTTP cho catalog, ảnh và cài đặt | Hiệu năng | P2 | S | Không |
| R-10 | Trang chủ ISR | Hiệu năng FE/SEO | P1 | M | Không |
| R-11 | SEO kỹ thuật | SEO | P1 | S-M | Không |
| R-12 | UX mobile và định dạng thời gian | UX | P1 (Mua lại: P2) | S-M | Không |
| R-13 | Hộp thoại dùng chung | A11y/Nợ kỹ thuật FE | P2 | M | Không |
| R-14 | Lấp khoảng trống kiểm thử | Test | P2 | M | Không |
| R-15 | Refresh token khi nhiều tab | Bảo mật/UX | P2 | S-M | Không |
| R-16 | Nợ kỹ thuật mã nguồn | Nợ kỹ thuật | P2 | M | Không |
| R-17 | Đúng đắn dữ liệu denorm | Hiệu năng/Dữ liệu | P2 | S | Không |
| R-18 | Upload và avatar | Bảo mật | P2 | M | Không |
| R-19 | Bảng tổng hợp analytics theo ngày | Hiệu năng | P2 | L | Không |
| R-20 | Thông tin xuất hóa đơn VAT | TMĐT/Pháp lý | P1 | M | Không |
| R-21 | Công cụ vận hành đơn và sản phẩm | Vận hành bán hàng | P1 | M | Không |
| R-22 | Xác thực 2 lớp cho Admin | Bảo mật | P1 | M | Không |
| R-23 | Giá vốn, nhập hàng và lợi nhuận | Vận hành bán hàng | P2 (P1 nếu cần biết lãi) | M-L | Không |
| R-24 | Tính năng nhỏ tăng tin cậy cho cà phê | TMĐT | P2 | S-M mỗi phần | Không |
| R-25 | Go-live thử trên VPS thật | Vận hành | Ngoài phạm vi | M | Có |
| R-26 | SMTP thật và xác thực domain gửi | Vận hành | Ngoài phạm vi | S-M | Có |
| R-27 | Backup off-site thật và diễn tập khôi phục | Vận hành | Ngoài phạm vi | S | Có |
| R-28 | Giám sát lỗi, đo thực tế và đồng ý cookie | Vận hành/FE | Ngoài phạm vi | M | Có |
| R-29 | Quy trình deploy bằng image, staging và quyền DB | Vận hành | Ngoài phạm vi | M-L | Có |
| R-30 | Thanh toán thật | Bảo mật/Vận hành | Ngoài phạm vi | M | Có |
| R-31 | Tích hợp vận chuyển (GHN hoặc GHTK) | Vận hành bán hàng | Ngoài phạm vi | L | Có |
| R-32 | Thanh toán phổ biến ở Việt Nam (VietQR, MoMo, ZaloPay) | TMĐT | Ngoài phạm vi | M / L | Có |
| R-33 | Đổi trả do khách khởi tạo và hoàn tiền qua cổng | TMĐT/Vận hành | Ngoài phạm vi | L | Có |
| R-34 | Email marketing có đồng ý | TMĐT | Ngoài phạm vi | M | Có |
| R-35 | Đăng ký mua cà phê định kỳ | TMĐT | Ngoài phạm vi | L | Có |
| R-36 | Nội dung và ảnh thật | TMĐT/SEO | Ngoài phạm vi | M | Có (nội dung/ảnh từ chủ dự án) |
| R-37 | Nhận tại cửa hàng | TMĐT | Ngoài phạm vi | S-M | Có (thông tin từ chủ dự án) |

---

# Phần (a) - Làm được ngay, không cần hạ tầng

### R-01 Sửa tài liệu lỗi thời và liên kết gãy
- **Trạng thái:** Đã làm (Đợt 1): các điểm nêu bên dưới đã được sửa trong docs (xem lịch sử git của `docs/`).
- **Nhóm:** Tài liệu.
- **Mô tả:** Sửa các điểm sau:
  - `docs/admin-dashboard-plan.md:91` trỏ `progress-m10-step5.md` không còn trong repo; trạng thái "Chờ chủ dự án duyệt và commit" đã lỗi thời.
  - `docs/db-schema.md:3` ghi "Prisma 6.x" trong khi dùng Prisma 7 (`backend/package.json`, D-036).
  - Thân D-033 còn lệnh `--to-schema-datamodel`/`--shadow-database-url` khác `ci.yml` và chưa liệt kê job `ops-lint`.
  - `docs/architecture.md` chưa có mục thay đổi cho D-046..D-054.
  - `docs/requirements.md:328` yêu cầu "coverage >= 70%" nhưng không đo (xem R-07).
  - Comment "Stub" lỗi thời ở `backend/src/modules/admin/admin.routes.ts` (~dòng 43-51).
- **Lý do / bằng chứng:** Các file:dòng nêu trên từ rà soát.
- **Ưu tiên:** P1.
- **Độ khó:** S.
- **Phụ thuộc:** Không.
- **Tiêu chí xong:** Mọi điểm trên được sửa hoặc đánh dấu lịch sử; không còn liên kết tới file không tồn tại.
- **Rủi ro:** Thấp.

### R-02 Lớp lỗi và trạng thái tải ở frontend
- **Trạng thái:** Đã làm (Đợt 1), xem D-059. Có: `global-error.tsx`, chỉ báo tải phía client cho danh mục/tìm kiếm khi đổi lọc/sắp xếp/trang (`aria-busy` + chữ ẩn "Đang tải..."), noindex ở nhánh API lỗi, test. KHÔNG dùng `loading.tsx` ở `/san-pham/[slug]` và `/danh-muc/[slug]` (làm slug không tồn tại trả 200 và đe dọa 308 của D-018; đã bỏ, đo lại 404/308 đúng). Đã kiểm: ErrorState không bị cache khi API sống lại. Chưa làm: noindex khi chỉ danh sách sản phẩm lỗi; dịch vụ thu lỗi.
- **Nhóm:** UX/SEO.
- **Mô tả:**
  - Thêm `app/global-error.tsx` (hiện chỉ có `app/error.tsx`, `app/not-found.tsx`; lỗi trong layout gốc làm trắng trang).
  - Thêm `loading.tsx` cho `/danh-muc/[slug]` dùng `ListingSkeleton` có sẵn (hiện chỉ có `/tim-kiem/loading.tsx`).
  - Khi API lỗi, trang sản phẩm/danh mục đang trả HTTP 200 với ErrorState và metadata không noindex (`app/san-pham/[slug]/page.tsx:75-84`, `app/danh-muc/[slug]/page.tsx:136-145`) -> chuyển sang lỗi 5xx hoặc `robots: { index: false }`.
  - Hành vi cache ISR của trang lỗi chưa xác minh.
- **Lý do / bằng chứng:** Các file:dòng nêu trên.
- **Ưu tiên:** P1.
- **Độ khó:** S.
- **Phụ thuộc:** Không.
- **Tiêu chí xong:** Có test render global-error; danh mục có skeleton khi đổi lọc/trang; trang lỗi không bị index.
- **Rủi ro:** Thấp.

### R-03 Quyền dữ liệu cá nhân (Nghị định 13/2023)
- **Trạng thái:** Đã làm phần kỹ thuật (Đợt 2, D-065): `DELETE /me` (ẩn danh hóa) và `GET /me/export`, kèm UI ở `/tai-khoan`. CHƯA làm (pháp lý/nội dung, ngoài phạm vi): ghi nhận đồng ý (`consentAt`/`consentVersion`), cập nhật chính sách bảo mật, thời hạn giữ AuditLog (có IP).
- **Nhóm:** Pháp lý-dữ liệu.
- **Mô tả:**
  - `DELETE /me`: xác nhận mật khẩu, ẩn danh hóa User, xóa địa chỉ/wishlist/giỏ, thu hồi phiên, giữ đơn ở dạng ẩn danh.
  - `GET /me/export`: JSON hồ sơ, địa chỉ, đơn, đánh giá.
  - Ghi nhận đồng ý (`consentAt`, `consentVersion`) ở đăng ký và checkout.
  - Cập nhật chính sách bảo mật (bên nhận dữ liệu như VNPay/Stripe, thời hạn lưu).
  - Quyết định thời hạn giữ AuditLog (có IP) và Payment.rawPayload.
- **Lý do / bằng chứng:**
  - `backend/src/modules/me/me.routes.ts` chỉ có GET/PATCH /me và địa chỉ.
  - Chính sách chỉ hướng dẫn gửi email để xóa (`frontend/src/features/content/policies.ts` ~dòng 200).
  - `Review.user` onDelete Restrict, `Order.user` SetNull (`schema.prisma`) nên phải ẩn danh chứ không xóa cứng.
  - Job dọn không có thời hạn cho AuditLog (`backend/src/jobs/cleanup.ts`).
- **Ưu tiên:** P0 trước khi nhận khách thật.
- **Độ khó:** M.
- **Phụ thuộc:** Nội dung pháp lý từ chủ dự án (có thể làm phần mã trước).
- **Tiêu chí xong:** Tài khoản đã xóa không đăng nhập được; PII không còn trong User/Address; đơn cũ vẫn tra nội bộ; có test; cập nhật contract + decision.
- **Rủi ro:** Xung đột nghĩa vụ lưu chứng từ; cần tư vấn pháp lý cho văn bản.

### R-04 Chống giữ kho bằng đơn COD khách vãng lai
- **Trạng thái:** Đã làm (Đợt 1), xem D-057. Có: hạn giữ kho 48 giờ + job tự hủy, giới hạn 3 đơn COD đang chờ theo SĐT/email (409 `TOO_MANY_PENDING_ORDERS`), Turnstile cho `POST /orders` của khách vãng lai khi có key, nhãn "Hết hạn tự động". Chưa làm: bộ lọc "đơn nghi vấn" cho staff; xác minh email.
- **Nhóm:** Bảo mật (lạm dụng nghiệp vụ).
- **Mô tả:** Đơn COD trừ kho ngay và không có hạn; đặt đơn guest không captcha, limiter chỉ theo IP; email nhập tùy ý nên có thể bị dùng gửi mail xác nhận tới người khác. Đề xuất:
  - Turnstile cho `POST /orders` của khách vãng lai khi có key (tái dùng `lib/turnstile.ts`, D-028).
  - Giới hạn số đơn COD chưa xác nhận theo SĐT/email trong 24 giờ.
  - Bộ lọc "đơn nghi vấn" cho staff.
- **Lý do / bằng chứng:** `expiresAt` chỉ đặt cho thanh toán online (`backend/src/modules/orders/orders.service.ts` ~337-339), trừ kho ~386-389; limiter theo IP ở `backend/src/app.ts` ~148-151.
- **Ưu tiên:** P1.
- **Độ khó:** M.
- **Phụ thuộc:** Không.
- **Tiêu chí xong:** Test vượt giới hạn bị từ chối; contract cập nhật.
- **Rủi ro:** Tăng ma sát checkout.

### R-05 Bảo vệ thao tác khách vãng lai bằng mã đơn
- **Trạng thái:** Đã làm (Đợt 4, nhóm 3), xem D-076. 5 lần sai trong 15 phút -> khóa mã đơn 15 phút (`429 ORDER_LOOKUP_LOCKED`) cho track, hủy, tạo thanh toán, GET/claim chuyển khoản; trạng thái trong RAM (1 instance).
- **Nhóm:** Bảo mật.
- **Mô tả:** Mã đơn `BB-YYMMDD-XXXX` chỉ có 4 ký tự ngẫu nhiên (31^4 ~ 923.521 mỗi ngày); cùng SĐT là đủ để tra cứu, hủy và tạo phiên thanh toán; giới hạn hiện chỉ theo IP. Đề xuất: khóa tạm theo mã đơn sau N lần sai, hoặc mã tra cứu dài hơn gửi qua email. Khả năng khai thác thực tế chưa xác minh.
- **Lý do / bằng chứng:** `backend/src/lib/orderCode.ts:5-6,19`.
- **Ưu tiên:** P2.
- **Độ khó:** S-M.
- **Phụ thuộc:** Không.
- **Tiêu chí xong:** Sau N lần sai, mã đơn bị khóa tạm (có test).
- **Rủi ro:** Đổi định dạng mã ảnh hưởng FE/email.

### R-06 Mailer bền vững
- **Trạng thái:** Đã làm (Đợt 1), xem D-056. Có: `SMTP_SECURE`/`SMTP_REQUIRE_TLS`, timeout, retry trong RAM 3 lần (1 giây, 4 giây) chỉ cho lỗi tạm thời, log có ngữ cảnh, test transport options. Chưa làm: outbox (bảng + job) và kiểm thật qua SMTP thật (cần R-26).
- **Nhóm:** Độ tin cậy/Bảo mật.
- **Mô tả:** Đề xuất biến `SMTP_SECURE`/requireTLS ở production, timeout, retry có giới hạn (bảng outbox + job), test transport options.
- **Lý do / bằng chứng:** `createSmtpMailer` cứng `secure: false`, không `requireTLS`, không timeout (`backend/src/lib/mailer.ts:24-36`, dòng 28); gửi fire-and-forget, lỗi chỉ log, không retry (~57-63); nhánh SMTP không có test (test dùng memoryMailer).
- **Ưu tiên:** P1.
- **Độ khó:** M.
- **Phụ thuộc:** Kiểm thật cần R-26.
- **Tiêu chí xong:** TLS/timeout cấu hình được qua env và có test transport options; lỗi gửi được retry có giới hạn.
- **Rủi ro:** Thêm bảng/migration nếu làm outbox.

### R-07 CI: coverage, kiểm format, Dependabot
- **Trạng thái:** Đã làm (Đợt 1), xem D-055 (coverage + ngưỡng, `format:check`, Dependabot). Đợt 3 (D-067): đã ghim SHA mọi `uses:` (kèm comment phiên bản) và thêm Trivy chỉ báo cáo (HIGH/CRITICAL, `--ignore-unfixed`, ghi Job Summary, `continue-on-error`); chưa chạy trên runner GitHub thật.
- **Nhóm:** CI/Test.
- **Mô tả:** Đề xuất `@vitest/coverage-v8` báo cáo + ngưỡng không cho tụt, `format:check` (`prettier --check`) trong CI, Dependabot (npm, Docker, Actions) gom nhóm; cân nhắc Trivy cho image ở chế độ báo cáo.
- **Lý do / bằng chứng:**
  - Không đo coverage (`backend/vitest.config.ts`, `frontend/vitest.config.mts` không có khối coverage) dù requirements yêu cầu.
  - CI không chạy `prettier --check` dù repo có `.prettierrc.json` (đã từng lọt file lệch định dạng).
  - Không có `.github/dependabot.yml`/renovate; Actions ghim theo tag.
  - `npm audit` chỉ báo cáo (`ci.yml` `continue-on-error: true`).
- **Ưu tiên:** P1.
- **Độ khó:** S.
- **Phụ thuộc:** Không.
- **Tiêu chí xong:** CI báo coverage và fail khi tụt dưới ngưỡng; CI chạy format check; có cấu hình Dependabot.
- **Rủi ro:** Lần đầu format hàng loạt, nhiều PR Dependabot.

### R-08 Bảo vệ DB khỏi truy vấn nặng
- **Trạng thái:** Đã làm (Đợt 1), xem D-058. Có: pool riêng cho analytics + `statement_timeout` (503 `ANALYTICS_TIMEOUT`), `DATABASE_POOL_MAX`, `mem_limit`/`cpus` trong compose prod (ước lượng, chưa đo trên VPS thật). Không làm theo quyết định: cache analytics 60 giây và bảng tổng hợp (R-19).
- **Nhóm:** Hiệu năng/Vận hành.
- **Mô tả:** Đề xuất `SET LOCAL statement_timeout` cho truy vấn analytics, kích thước pool qua env, cache trong bộ nhớ 60 giây cho analytics (ghi trên UI), giới hạn tài nguyên container dựa trên số đo.
- **Lý do / bằng chứng:** Analytics chạy trên DB giao dịch, không `statement_timeout`, không cache, không giới hạn đồng thời (chỉ export có limiter); pool pg mặc định 10 kết nối (`backend/src/lib/prisma.ts`); số đo D-054: breakdown 365 ngày ~0,8-0,9 s, top-products ~0,4 s ở 100k đơn; compose không có `mem_limit`/`cpus` cho service nào.
- **Ưu tiên:** P1.
- **Độ khó:** S-M.
- **Phụ thuộc:** Không.
- **Tiêu chí xong:** Truy vấn analytics có timeout; pool cấu hình được qua env; analytics có cache ngắn hạn; compose có giới hạn tài nguyên.
- **Rủi ro:** Đặt giới hạn quá thấp làm backend bị kill khi xuất CSV; cache làm số liệu trễ.

### R-09 Cache HTTP cho catalog, ảnh và cài đặt
- **Trạng thái:** Đã làm (Đợt 4, nhóm 3), xem D-075. Catalog `public, max-age=30, s-maxage=60, stale-while-revalidate=120` (lỗi luôn `no-store`), ảnh tên ngẫu nhiên `immutable` 1 năm, cache `getShopSettings` 30 giây.
- **Nhóm:** Hiệu năng.
- **Mô tả:** Đề xuất `public, max-age=30, s-maxage=60, stale-while-revalidate` cho catalog; `immutable` 1 năm cho ảnh sản phẩm; cache settings 30-60 giây, xóa khi admin lưu.
- **Lý do / bằng chứng:** GET catalog/suggest không đặt Cache-Control nên mỗi request trình duyệt chạm DB (`backend/src/app.ts` ~53-65; chỉ locations và settings/public có); `/uploads` maxAge 1 giờ dù tên file ngẫu nhiên bất biến (~208-216); `getShopSettings` đọc DB ở mọi thao tác giỏ/quote/đặt đơn (ghi "Không cache" trong `settings.service.ts`).
- **Ưu tiên:** P2.
- **Độ khó:** S.
- **Phụ thuộc:** Không.
- **Tiêu chí xong:** Header cache đúng cho catalog và ảnh; settings được cache và vô hiệu khi admin lưu; có test.
- **Rủi ro:** Giá/tồn hiển thị trễ vài chục giây (đặt hàng vẫn tính lại ở server).

### R-10 Trang chủ ISR
- **Trạng thái:** Đã làm (Đợt 2, D-064): `revalidate = 60`, bỏ `connection()`, build qua khi backend tắt; chưa đo lại TTFB.
- **Nhóm:** Hiệu năng FE/SEO.
- **Mô tả:** Đề xuất `revalidate=60` và cách build không cần backend.
- **Lý do / bằng chứng:** `frontend/src/app/page.tsx:11-15` gọi `await connection()` nên trang chủ render động mỗi request (TTFB phụ thuộc 5 lời gọi API); Lighthouse 100 đo với backend local, chưa đại diện production.
- **Ưu tiên:** P1.
- **Độ khó:** M.
- **Phụ thuộc:** Không.
- **Tiêu chí xong:** Trang chủ được cache và làm mới định kỳ; build không cần backend chạy; đo lại TTFB.
- **Rủi ro:** HTML cũ tối đa 60 giây.

### R-11 SEO kỹ thuật
- **Trạng thái:** Đã làm (Đợt 2, D-064): ảnh OG, canonical trang chủ và `?page=N`, noindex URL có lọc, sitemap `lastmod` (`updatedAt`), JSON-LD (`logo`, `itemCondition`, `ItemList`). Cố ý KHÔNG làm `shippingDetails`/`hasMerchantReturnPolicy` (dữ liệu demo). Chưa làm: logo thương hiệu riêng, Rich Results Test thực tế (cần domain công khai), Đợt 3 (D-069): `robots.txt` chỉ chặn `/admin` và `/api/`, không chặn trang noindex.
- **Nhóm:** SEO.
- **Mô tả:**
  - Thêm ảnh OG mặc định/`opengraph-image`; OG danh mục có ảnh; trang chủ thêm canonical.
  - Sitemap có `lastModified`: cần API công khai trả `updatedAt` (đổi contract).
  - Canonical trang `?page=N` hiện trỏ về trang 1 và URL có bộ lọc chưa noindex; cần xử lý.
  - JSON-LD: bổ sung `shippingDetails`/`hasMerchantReturnPolicy` (hiện dùng `AggregateOffer`), Organization thêm `logo`.
  - Robots hiện disallow các trang đã noindex.
- **Lý do / bằng chứng:** Metadata gốc `app/layout.tsx` ~35-47 có `summary_large_image` nhưng không ảnh; `app/sitemap.ts` ~45-46 và `types/catalog.ts` ~60-61 (API không trả `updatedAt`); `app/danh-muc/[slug]/page.tsx` ~96-123; `features/catalog/jsonld.ts`.
- **Ưu tiên:** P1.
- **Độ khó:** S-M.
- **Phụ thuộc:** Ảnh/logo thương hiệu (có thể dùng ảnh tạm).
- **Tiêu chí xong:** Kiểm bằng Rich Results Test/debug OG; test noindex cập nhật.
- **Rủi ro:** Dữ liệu cấu trúc lệch nội dung hiển thị.

### R-12 UX mobile và định dạng thời gian
- **Trạng thái:** Đã làm (Đợt 1, trừ "Mua lại"), xem D-059. "Mua lại" đã làm ở Đợt 4 nhóm 3, xem D-077. Header mobile 3 hàng/165 px -> 2 hàng/113 px (menu Danh mục thả xuống); formatter ngày giờ cố định `Asia/Ho_Chi_Minh` có test. Chưa làm: "Mua lại" (FR-ORD-07, P2).
- **Nhóm:** UX.
- **Mô tả:**
  - Rút gọn header mobile (hiện 3 hàng, sticky chiếm ~165/844 px; mục nav cuối bị cắt, không có gợi ý cuộn).
  - Formatter thời gian cố định `Asia/Ho_Chi_Minh` (hiện không chỉ định `timeZone` nên giờ SSR, server UTC, có thể lệch giờ trình duyệt; chưa xác minh trên production).
  - "Mua lại" (FR-ORD-07): đã có (D-077).
- **Lý do / bằng chứng:** `components/layout/Header.tsx`, ảnh `docs/screenshots/mobile-home.png`; `lib/format.ts` dùng `Intl.DateTimeFormat("vi-VN")`; `docs/requirements.md:178`.
- **Ưu tiên:** P1 (Mua lại: P2).
- **Độ khó:** S-M.
- **Phụ thuộc:** Không.
- **Tiêu chí xong:** Header mobile tối đa 2 hàng hoặc nav không sticky, vùng chạm 44 px; formatter cố định `Asia/Ho_Chi_Minh` có test.
- **Rủi ro:** Thấp.

### R-13 Hộp thoại dùng chung
- **Nhóm:** A11y/Nợ kỹ thuật FE.
- **Mô tả:** Đề xuất hook `useDialog` hoặc `<dialog>` native thay cho 5 hộp thoại tự viết.
- **Lý do / bằng chứng:** 5 hộp thoại lặp lại focus trap (`MiniCart.tsx`, `ConfirmDialog.tsx`, `AdminModal.tsx`, `StatusDialog.tsx`, `CancelOrderDialog.tsx`); chỉ MiniCart khóa cuộn nền; selector phần tử focus bỏ sót input/select/textarea (`MiniCart.tsx:9`); không dùng `inert` cho nền (ảnh hưởng trình đọc màn hình chưa xác minh).
- **Trạng thái:** Đã làm (Đợt 4, nhóm 2), xem D-074. `components/ui/Dialog.tsx` (`<dialog>` native + `showModal()`) thay cho 6 hộp thoại tự viết (MiniCart dạng ngăn kéo, ConfirmDialog, AdminModal, StatusDialog, CancelOrderDialog, DeleteAccountDialog): inert nền, focus trap do trình duyệt, khóa cuộn nền cho mọi hộp, trả focus, Escape chặn khi đang gửi, selector focus không còn sót input/select/textarea. Chưa kiểm Safari/Firefox.
- **Ưu tiên:** P2.
- **Độ khó:** M.
- **Phụ thuộc:** Không.
- **Tiêu chí xong:** Một cơ chế dialog chung có focus trap đủ loại phần tử và khóa cuộn nền; test hiện có vẫn qua.
- **Rủi ro:** Hồi quy hành vi dialog.

### R-14 Lấp khoảng trống kiểm thử
- **Nhóm:** Test.
- **Mô tả:**
  - Test riêng cho `CheckoutForm.tsx` (737 dòng).
  - Test/đo tải đặt hàng đồng thời cùng SKU bằng k6/autocannon trên DB tạm.
  - E2E: project mobile 390 px cho luồng mua, thêm WebKit smoke (hiện chỉ Chromium).
  - Cô lập DB test tốt hơn; test FE mock fetch nên không bắt lệch contract.
- **Lý do / bằng chứng:** Chưa có test tải đồng thời (khóa variant + `refreshProductDenorm` trong transaction, `orders.service.ts` ~241, ~405-408); DB test `beanbox_test` dùng chung, chạy tuần tự, cô lập bằng quy ước "năm riêng" và afterAll thủ công (`backend/vitest.config.ts` `fileParallelism: false`, `docs/testing.md`).
- **Ưu tiên:** P2.
- **Độ khó:** M.
- **Phụ thuộc:** Không.
- **Tiêu chí xong:** Có test CheckoutForm; số đo tải đồng thời ghi vào `testing.md`; project E2E mobile 390 + WebKit smoke; quy ước cô lập DB test được ghi hoặc DB riêng mỗi worker.
- **Rủi ro:** CI chậm hơn.

### R-15 Refresh token khi nhiều tab
- **Nhóm:** Bảo mật/UX.
- **Mô tả:** Đề xuất grace window 10-30 giây cho token vừa xoay.
- **Lý do / bằng chứng:** Hai refresh đồng thời cùng token bị coi là dùng lại và thu hồi cả family (`backend/src/modules/auth/auth.service.ts` ~230-248); FE single-flight + Web Locks giữa tab giảm khả năng nhưng retry mạng vẫn có thể gây đăng xuất oan (tần suất chưa xác minh).
- **Ưu tiên:** P2.
- **Độ khó:** S-M.
- **Phụ thuộc:** Không.
- **Tiêu chí xong:** Refresh lặp trong grace window không thu hồi family; dùng lại ngoài cửa sổ vẫn bị phát hiện (có test).
- **Rủi ro:** Nới phát hiện trộm token trong khoảng ngắn.

### R-16 Nợ kỹ thuật mã nguồn
- **Nhóm:** Nợ kỹ thuật.
- **Mô tả:**
  - Tách file lớn khi sửa tiếp.
  - Gom helper trùng.
  - `server.ts` bổ sung xử lý `unhandledRejection`/`uncaughtException` và shutdown chờ job đang chạy.
- **Lý do / bằng chứng:**
  - File lớn: frontend `AdminSettings.tsx` 923 dòng, `CheckoutForm.tsx` 737, `ProductForm.tsx` 677; backend `catalog.service.ts` 666, `orders.service.ts` 643, `cart.service.ts` 633.
  - Helper trùng: `escapeLike` ở `admin/orders/orders.service.ts` và `lib/text.ts`; `intParam` ở 3 schema; `emailSchema` ở 2 nơi; regex NUL lặp nhiều file.
  - `server.ts` không xử lý `unhandledRejection`/`uncaughtException`, shutdown không chờ job đang chạy.
- **Trạng thái:** Đã làm một phần (Đợt 4, nhóm 2), xem D-074: tách `AdminSettings.tsx` (1049 -> 97 dòng + `settings/`) và `CheckoutForm.tsx` (816 -> 194 dòng + component/hook); gom `escapeLike`, `emailSchema`, `intParam`, `NO_NUL` về `lib/text.ts`/`lib/validation.ts`. Chưa làm: tách các file còn > 500 dòng (danh sách ở D-074), `intParam` của `catalog.schema.ts`, `CONTROL_CHARS`, và `server.ts` (`unhandledRejection`/`uncaughtException`, shutdown chờ job).
- **Ưu tiên:** P2.
- **Độ khó:** M.
- **Phụ thuộc:** Không.
- **Tiêu chí xong:** Tách theo section/chức năng khi sửa tiếp, test giữ nguyên; handler tiến trình có log.
- **Rủi ro:** Refactor rộng; làm kèm tính năng.

### R-17 Đúng đắn dữ liệu denorm
- **Nhóm:** Hiệu năng/Dữ liệu.
- **Mô tả:** Job định kỳ làm mới sản phẩm có saleStart/saleEnd vừa qua mốc.
- **Lý do / bằng chứng:** `minPrice` chỉ tính lại khi có thao tác ghi nên lọc/sắp xếp theo giá dùng giá cũ khi khung sale bắt đầu/kết thúc mà không ai sửa sản phẩm (`backend/src/modules/catalog/catalog.denorm.ts`, đã ghi ở `docs/db-schema.md`).
- **Ưu tiên:** P2.
- **Độ khó:** S.
- **Phụ thuộc:** Không.
- **Tiêu chí xong:** Sau mốc sale, `minPrice` được cập nhật mà không cần sửa sản phẩm (có test).
- **Rủi ro:** Thấp.

### R-18 Upload và avatar
- **Nhóm:** Bảo mật.
- **Mô tả:** Re-encode bằng sharp, job dọn file không còn tham chiếu, avatar chỉ nhận `/uploads/...` hoặc https whitelist.
- **Lý do / bằng chứng:** Ảnh lưu nguyên (EXIF/GPS, không giới hạn số điểm ảnh, đã chấp nhận D-013), không dọn file mồ côi (`admin/uploads/uploads.service.ts`, không có bước dọn trong `cleanup.ts`); `avatarUrl` nhận mọi URL http/https (`modules/me/me.schema.ts` ~33-43; việc FE hiển thị chưa xác minh).
- **Ưu tiên:** P2.
- **Độ khó:** M.
- **Phụ thuộc:** Không.
- **Tiêu chí xong:** Ảnh upload bị loại metadata; file mồ côi được dọn; avatar bị giới hạn nguồn (có test).
- **Rủi ro:** Thêm dependency native vào image.

### R-19 Bảng tổng hợp analytics theo ngày
- **Nhóm:** Hiệu năng.
- **Mô tả:** Theo D-054, khi p50 vượt ~1 s (khoảng 150-200k đơn/năm) cần bảng tổng hợp theo ngày; hiện chưa cần.
- **Lý do / bằng chứng:** D-054.
- **Ưu tiên:** P2.
- **Độ khó:** L.
- **Phụ thuộc:** R-08.
- **Tiêu chí xong:** Số liệu khớp truy vấn gốc trên dữ liệu 100k đơn (dùng `backend/scripts/generate-demo-orders.ts`).
- **Rủi ro:** Cập nhật bảng khi đơn đổi trạng thái/hoàn tiền.

### R-20 Thông tin xuất hóa đơn VAT
- **Nhóm:** TMĐT/Pháp lý.
- **Mô tả:** Checkout có tùy chọn "Xuất hóa đơn công ty" (MST 10/13 số, tên, địa chỉ, email nhận), lưu snapshot trên đơn, admin xem/in và đánh dấu đã xuất; chưa tích hợp hóa đơn điện tử.
- **Lý do / bằng chứng:** FR-CHK-11 (`docs/requirements.md` ~167); Order không có trường này.
- **Ưu tiên:** P1.
- **Độ khó:** M.
- **Phụ thuộc:** Migration + đổi contract `POST /orders`.
- **Tiêu chí xong:** Đơn lưu snapshot thông tin hóa đơn; admin xem/in/đánh dấu đã xuất; validate MST; có test.
- **Rủi ro:** Chưa phải hóa đơn điện tử hợp lệ.

### R-21 Công cụ vận hành đơn và sản phẩm
- **Trạng thái:** Đã làm một phần (Đợt 4, D-071..D-073): ghi chú nội bộ trên đơn, in phiếu giao hàng loạt (tối đa 50 đơn), xuất/nhập CSV sản phẩm (xem trước rồi áp dụng). Chưa làm: xuất CSV danh sách đơn (đã có xuất CSV ở khu phân tích D-053).
- **Nhóm:** Vận hành bán hàng.
- **Mô tả:** Ghi chú nội bộ trên đơn (hiện `Order.note` là của khách); in phiếu giao hàng loạt (hiện in từng đơn, `app/admin/don-hang/[code]/in`); xuất CSV đơn/sản phẩm; nhập sản phẩm CSV có xem trước và báo lỗi từng dòng; tái dùng khuôn CSV an toàn của D-053.
- **Lý do / bằng chứng:** Các điểm hiện trạng nêu trong mô tả.
- **Ưu tiên:** P1.
- **Độ khó:** M.
- **Phụ thuộc:** Không.
- **Tiêu chí xong:** Test import/export, audit log, phân quyền đúng.
- **Rủi ro:** Dữ liệu import sai làm hỏng slug/biến thể.

### R-22 Xác thực 2 lớp cho Admin
- **Trạng thái:** Đã làm: TOTP tùy chọn cho Staff/Admin + mã dự phòng (Đợt 2, D-063); bắt buộc cho Admin bằng cờ `REQUIRE_ADMIN_2FA`, mặc định tắt (Đợt 3, D-070). Khuyến nghị bật khi chạy thật.
- **Nhóm:** Bảo mật.
- **Mô tả:** TOTP bắt buộc với ADMIN + mã khôi phục.
- **Lý do / bằng chứng:** User chưa có trường TOTP; chỉ 3 vai trò.
- **Ưu tiên:** P1.
- **Độ khó:** M.
- **Phụ thuộc:** Đổi luồng đăng nhập (contract §5).
- **Tiêu chí xong:** Admin phải qua TOTP khi đăng nhập; có mã khôi phục; có test; contract cập nhật.
- **Rủi ro:** Khóa chính chủ khi mất thiết bị.

### R-23 Giá vốn, nhập hàng và lợi nhuận
- **Nhóm:** Vận hành bán hàng.
- **Mô tả:** Thêm giá vốn (biến thể hoặc lô), nhà cung cấp, phiếu nhập gắn InventoryMovement RESTOCK, snapshot `unitCost` vào OrderItem, mục lợi nhuận gộp trong analytics (chỉ Admin).
- **Lý do / bằng chứng:** Hiện không có trường/model; D-052 ghi giá trị tồn dùng giá niêm yết.
- **Ưu tiên:** P2 (P1 nếu chủ dự án cần biết lãi).
- **Độ khó:** M-L.
- **Phụ thuộc:** Migration; chốt phương pháp giá vốn.
- **Tiêu chí xong:** Lợi nhuận gộp trong analytics khớp dữ liệu nhập/bán (có test).
- **Rủi ro:** Phải chốt phương pháp giá vốn.
- **Trạng thái (2026-11-23): Đã làm một phần theo D-078.** Chốt phương pháp bình quân gia quyền di động theo biến thể; nhập hàng ghi `unitCost`, snapshot `OrderItem.unitCost`, lợi nhuận gộp trong analytics (chỉ Admin), có test. CHƯA làm: nhà cung cấp, phiếu nhập, giá vốn theo lô, backfill đơn cũ, phí cổng thanh toán/ship trong lãi.

### R-24 Tính năng nhỏ tăng tin cậy cho cà phê
- **Nhóm:** TMĐT.
- **Mô tả:**
  - (a) Độ tươi hạt: đã hiển thị ngày rang; xác minh quy tắc §5.6 có được áp ở checkout không, rồi bổ sung nhãn/cảnh báo.
  - (b) Ảnh trong đánh giá (cột `Review.images` có sẵn nhưng luôn trả `[]`).
  - (c) "Mua lại" (xem R-12).
- **Lý do / bằng chứng:** `AddToCartPanel.tsx` ~81; `docs/requirements.md` ~287-288 (quy tắc §5.6, áp ở checkout chưa xác minh); `reviews.shared.ts` ~105.
- **Ưu tiên:** P2.
- **Độ khó:** S-M mỗi phần.
- **Phụ thuộc:** Không.
- **Tiêu chí xong:** Từng phần có test riêng; (a) sau khi xác minh quy tắc §5.6 (chưa xác minh).
- **Rủi ro:** (b) cần upload công khai có kiểm duyệt.

---

# Phần (b) - Cần chủ dự án cung cấp

Ngoài phạm vi (portfolio, chỉ localhost).

### R-25 Go-live thử trên VPS thật
- **Nhóm:** Vận hành.
- **Mô tả:** Deploy `docker-compose.prod.yml` lên VPS, chạy checklist go-live, đo RAM/thời gian build thật, quét SSL Labs/securityheaders, kiểm `trusted_proxies` nếu dùng Cloudflare.
- **Lý do / bằng chứng:** Checklist go-live trống (`docs/deployment.md` ~396-416); cấu hình 2 vCPU/2 GB chỉ là ước lượng (`docs/deployment.md` ~82).
- **Ưu tiên:** P0.
- **Độ khó:** M.
- **Phụ thuộc:** R-26, R-27.
- **Cần chủ dự án cung cấp:** VPS, domain, quyền DNS.
- **Tiêu chí xong:** Checklist go-live được điền; số đo RAM/build thật ghi vào docs; quét SSL/headers đạt.
- **Rủi ro:** Lỗi chỉ xuất hiện trên máy thật (ACME, quyền thư mục backup).

### R-26 SMTP thật và xác thực domain gửi
- **Nhóm:** Vận hành.
- **Mô tả:** Cấu hình SMTP thật, hướng dẫn SPF/DKIM/DMARC, gửi thử thật.
- **Lý do / bằng chứng:** `MAIL_FROM` mặc định `no-reply@beanbox.local` (`docker-compose.prod.yml`); chưa có hướng dẫn SPF/DKIM/DMARC; ô checklist gửi thử trống.
- **Ưu tiên:** P0.
- **Độ khó:** S-M.
- **Phụ thuộc:** R-06.
- **Cần chủ dự án cung cấp:** Nhà cung cấp SMTP (SES/Resend/Mailgun/Brevo...), quyền sửa DNS TXT.
- **Tiêu chí xong:** Mail đặt lại mật khẩu/xác nhận đơn tới hộp thư chính, không vào spam; hướng dẫn DNS ghi trong docs.
- **Rủi ro:** Mail vào spam, khách không nhận link đặt lại mật khẩu.

### R-27 Backup off-site thật và diễn tập khôi phục
- **Nhóm:** Vận hành.
- **Mô tả:** Bật backup off-site, diễn tập khôi phục từ bucket thật, ghi RPO/RTO.
- **Lý do / bằng chứng:** Service backup mặc định tắt (profile `backup`), mặc định chỉ lưu cục bộ cùng máy với DB; chưa có bản ghi restore thành công từ bucket thật; chưa có RPO/RTO.
- **Ưu tiên:** P0 trước khi có dữ liệu khách thật.
- **Độ khó:** S.
- **Phụ thuộc:** Không.
- **Cần chủ dự án cung cấp:** Bucket off-site (R2/B2/S3) + key giới hạn, cặp khóa age cất offline, URL heartbeat.
- **Tiêu chí xong:** Restore thành công từ bucket thật được ghi lại; RPO/RTO có trong docs.
- **Rủi ro:** Mất khóa age là mất backup.

### R-28 Giám sát lỗi, đo thực tế và đồng ý cookie
- **Nhóm:** Vận hành/FE.
- **Mô tả:** Thêm giám sát lỗi, đo Web Vitals thật, analytics hành vi (view_item, add_to_cart, purchase), mở CSP có chủ đích, banner đồng ý cookie nếu công cụ dùng cookie, cảnh báo khi job nền lỗi liên tiếp.
- **Lý do / bằng chứng:** Không có Sentry/APM/metrics (grep không có); `app/error.tsx` chỉ `console.error`; CSP `connect-src 'self'` (`frontend/src/lib/csp.ts`).
- **Ưu tiên:** P1.
- **Độ khó:** M.
- **Phụ thuộc:** R-03 (đồng ý).
- **Cần chủ dự án cung cấp:** Chọn công cụ (Sentry/GlitchTip, GA4/Plausible), DSN, kênh nhận cảnh báo.
- **Tiêu chí xong:** Lỗi FE/BE về công cụ giám sát; có cảnh báo job lỗi; PII được lọc; CSP chỉ mở cho domain cần thiết.
- **Rủi ro:** Lộ PII sang bên thứ ba (cần lọc).

### R-29 Quy trình deploy bằng image, staging và quyền DB
- **Nhóm:** Vận hành.
- **Mô tả:** Build image trong CI và push GHCR theo sha/tag, VPS chỉ pull; migrate là bước riêng có backup trước; staging bằng compose `-p`; role DB ứng dụng không phải superuser; nhúng GIT_SHA vào health.
- **Lý do / bằng chứng:** Hiện `git pull` -> build -> `up -d` trên VPS (có gián đoạn ngắn), rollback bằng build lại; migrate chạy tự động lúc backend khởi động (`backend/Dockerfile` entrypoint) nên migration hỏng gây crash-loop; backend dùng chính user Postgres của image (`docker-compose.prod.yml`); không có staging.
- **Ưu tiên:** P1.
- **Độ khó:** M-L.
- **Phụ thuộc:** R-25.
- **Cần chủ dự án cung cấp:** Registry (GHCR), quyết định có staging.
- **Tiêu chí xong:** Deploy và rollback bằng image tag; migrate tách bước có backup; app dùng role không phải superuser; health trả GIT_SHA.
- **Rủi ro:** Migration không tương thích ngược.

### R-30 Thanh toán thật
- **Nhóm:** Bảo mật/Vận hành.
- **Mô tả:** Cờ `PAYMENTS_LIVE` có chủ đích, bắt buộc webhook secret khi bật Stripe, đăng ký IPN VNPay, thử giao dịch thật giá trị nhỏ rồi hoàn.
- **Lý do / bằng chứng:** Env chỉ nhận `sk_test_` (`backend/src/config/env.ts` ~114-121); Stripe bật được khi thiếu webhook secret (`config/payments.ts` ~44-46), khi đó webhook 503 và đơn chỉ xác nhận qua sync từ trình duyệt, khách đóng tab có thể dẫn tới đơn quá hạn dù đã trả (`payments.apply.ts` nhánh trả muộn); hoàn tiền thủ công (D-015).
- **Ưu tiên:** P0 nếu nhận tiền online (P1 nếu chỉ COD).
- **Độ khó:** M.
- **Phụ thuộc:** Không (cần tài khoản merchant).
- **Cần chủ dự án cung cấp:** Tài khoản merchant VNPay/Stripe production, KYC, chính sách hoàn tiền.
- **Tiêu chí xong:** Giao dịch thật giá trị nhỏ thành công và hoàn được; thiếu webhook secret thì không bật Stripe live (có test).
- **Rủi ro:** Lệch tiền giữa DB và cổng.

### R-31 Tích hợp vận chuyển (GHN hoặc GHTK)
- **Nhóm:** Vận hành bán hàng.
- **Mô tả:** Tính phí theo hãng (giữ bảng phí hiện tại làm dự phòng), tạo vận đơn từ admin, webhook cập nhật trạng thái theo máy trạng thái §11, khách tra hành trình.
- **Lý do / bằng chứng:** `carrier/trackingNumber` hiện nhập tay; requirements ghi "để v2".
- **Ưu tiên:** P1.
- **Độ khó:** L.
- **Phụ thuộc:** Không.
- **Cần chủ dự án cung cấp:** Tài khoản hãng (token, ShopId, sandbox), địa chỉ kho lấy hàng.
- **Tiêu chí xong:** Tạo vận đơn từ admin; trạng thái cập nhật qua webhook; khách xem hành trình (test trên sandbox).
- **Rủi ro:** Ánh xạ địa danh 2 cấp với API hãng.

### R-32 Thanh toán phổ biến ở Việt Nam (VietQR, MoMo, ZaloPay)
- **Nhóm:** TMĐT.
- **Mô tả:** VietQR giai đoạn 1 là QR theo mã đơn + admin xác nhận đã nhận tiền, giai đoạn 2 đối soát tự động; ví điện tử theo khuôn VNPay sẵn có.
- **Lý do / bằng chứng:** `PaymentMethod`/`PaymentProvider` chỉ COD/VNPAY/STRIPE (`schema.prisma`).
- **Ưu tiên:** P1.
- **Độ khó:** M (VietQR thủ công) / L (ví có IPN).
- **Phụ thuộc:** Không.
- **Cần chủ dự án cung cấp:** Tài khoản ngân hàng nhận tiền, merchant MoMo/ZaloPay, dịch vụ đối soát nếu muốn.
- **Tiêu chí xong:** Khách chọn được phương thức mới; admin xác nhận/đối soát đúng số tiền; có test và contract cập nhật.
- **Rủi ro:** Đối soát sai tiền.

### R-33 Đổi trả do khách khởi tạo và hoàn tiền qua cổng
- **Nhóm:** TMĐT/Vận hành.
- **Mô tả:** Khách gửi yêu cầu trong thời hạn kèm lý do/ảnh, admin duyệt, hoàn kho tùy chọn, hoàn tiền qua API cổng.
- **Lý do / bằng chứng:** Trạng thái `RETURN_REQUESTED/RETURNED` trong contract là "v2 - chưa triển khai"; hoàn tiền chỉ ghi nhận thủ công (D-015).
- **Ưu tiên:** P1.
- **Độ khó:** L.
- **Phụ thuộc:** R-30.
- **Cần chủ dự án cung cấp:** Quy tắc đổi trả cụ thể (hạt đã mở, phí ship đổi trả).
- **Tiêu chí xong:** Luồng yêu cầu - duyệt - hoàn kho - hoàn tiền chạy đúng máy trạng thái; có test.
- **Rủi ro:** Gian lận đổi trả.

### R-34 Email marketing có đồng ý
- **Nhóm:** TMĐT.
- **Mô tả:** Nhắc giỏ bị bỏ quên (chỉ khách đăng nhập), báo khi có hàng lại, newsletter double opt-in.
- **Lý do / bằng chứng:** `Cart.lastActivityAt` hiện chỉ dùng để dọn; chưa có bảng cho báo có hàng lại; contract ghi newsletter chưa làm.
- **Ưu tiên:** P1.
- **Độ khó:** M.
- **Phụ thuộc:** R-26, R-03.
- **Cần chủ dự án cung cấp:** Dịch vụ gửi mail, nội dung, tần suất.
- **Tiêu chí xong:** Chỉ gửi cho người đã đồng ý; có hủy đăng ký; có test.
- **Rủi ro:** Vi phạm đồng ý, deliverability.

### R-35 Đăng ký mua cà phê định kỳ
- **Nhóm:** TMĐT.
- **Mô tả:** Tạo đơn tự động mỗi kỳ (idempotent), tạm dừng/bỏ qua/hủy.
- **Lý do / bằng chứng:** FR-SUB-01..03 mức C; requirements ghi là ưu tiên đầu tiên của v2.
- **Ưu tiên:** P1.
- **Độ khó:** L.
- **Phụ thuộc:** Luồng đặt hàng ổn định; R-30/R-32 nếu tự thu tiền.
- **Cần chủ dự án cung cấp:** Chu kỳ, ưu đãi, chính sách hủy, có thu tiền tự động không.
- **Tiêu chí xong:** Mỗi kỳ chỉ sinh đúng một đơn (idempotent); tạm dừng/bỏ qua/hủy hoạt động; có test.
- **Rủi ro:** Thu tiền định kỳ phức tạp.

### R-36 Nội dung và ảnh thật
- **Nhóm:** TMĐT/SEO.
- **Mô tả:** Blog/hướng dẫn pha gắn sản phẩm; chuyển trang chính sách từ code sang quản lý trong admin; ảnh sản phẩm thật thay SVG seed rồi đo lại Lighthouse và cấu hình ảnh.
- **Lý do / bằng chứng:** FR-CNT-02, chưa có route `/blog`; chính sách nằm trong `features/content/policies.ts`; `next.config.ts` chưa đặt `formats`/`minimumCacheTTL`; ProductImage bỏ tối ưu cho SVG.
- **Ưu tiên:** P2.
- **Độ khó:** M.
- **Phụ thuộc:** Không.
- **Cần chủ dự án cung cấp:** Bài viết, ảnh sản phẩm, logo.
- **Tiêu chí xong:** Có route blog và quản lý chính sách trong admin; Lighthouse đo lại với ảnh thật.
- **Rủi ro:** Chất lượng nội dung.

### R-37 Nhận tại cửa hàng
- **Nhóm:** TMĐT.
- **Mô tả:** Thêm phương thức PICKUP (phí 0, thông tin điểm nhận từ cài đặt).
- **Lý do / bằng chứng:** `ShippingMethod` hiện chỉ có kiểu giao.
- **Ưu tiên:** P2.
- **Độ khó:** S-M.
- **Phụ thuộc:** Không.
- **Cần chủ dự án cung cấp:** Có cửa hàng không, địa chỉ, giờ nhận.
- **Tiêu chí xong:** Khách chọn PICKUP với phí 0 và thấy thông tin điểm nhận; máy trạng thái xử lý đúng; có test.
- **Rủi ro:** Thêm nhánh máy trạng thái.

---

## Đề xuất thứ tự 3 đợt đầu

- **Đợt 1 - Gia cố không cần hạ tầng (đã làm, 2026-11-21; chưa commit):** R-01, R-02, R-07, R-06, R-04, R-08, R-12. Lý do: rẻ, tạo lưới an toàn (coverage, format, Dependabot) cho các đợt sau. Phần kỹ thuật của R-03 hoãn sang đợt sau.
- **Đợt 2 - Go-live có kiểm soát (cần chủ dự án cung cấp):** R-25, R-26, R-27, R-28, R-29, cùng R-10, R-11; thêm R-30 nếu quyết định nhận tiền online. Tiêu chí: site chạy trên domain thật, mail không vào spam, backup off-site đã diễn tập, có cảnh báo lỗi.
- **Đợt 3 - Vận hành bán hàng và doanh thu:** R-22, R-21, R-20, R-34, rồi R-31 hoặc R-32 theo quyết định của chủ dự án, R-24. Các mục L còn lại (R-33, R-35, R-19, R-23) lên kế hoạch sau khi có số liệu thật.

## Câu hỏi cần chủ dự án quyết

1. Mục tiêu giai đoạn tới là bán hàng thật hay dự án portfolio/demo? (quyết định P0 của R-03, R-25..R-27, R-30)
2. Khi nào có VPS, domain, nhà cung cấp SMTP, bucket backup off-site và công cụ giám sát lỗi; có ưu tiên nhà cung cấp nào không?
3. Phương thức thanh toán ưu tiên: chỉ COD, COD + VNPay thật, hay VietQR/MoMo/ZaloPay; có giữ Stripe không?
4. Dùng hãng vận chuyển nào (GHN/GHTK/khác), có điểm nhận tại cửa hàng không?
5. Thông tin pháp lý: pháp nhân/MST, có xuất hóa đơn VAT không, thời hạn lưu đơn/chứng từ và dữ liệu khách, người phụ trách dữ liệu cá nhân?
