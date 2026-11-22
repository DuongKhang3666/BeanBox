# BeanBox – Kế hoạch Đợt 3

> Ngày: 2026-11-23 · Người lập: Tech Lead · Tiếp nối Đợt 2 (`wave2-plan.md`, D-060..D-065; HEAD `55d25ef`, CI xanh).
> Dự án là portfolio chỉ chạy localhost: không deploy công khai, không demo online.

> **Trạng thái:** Đã làm, chờ commit (3B, 3A-1, 3A-2, 3A-3). Kết quả kiểm ở `testing.md` mục "Kết quả kiểm Đợt 3 (3B)" và "Kết quả kiểm tổng Đợt 3".

## Mục tiêu

Trình bày dự án cho CV (người xem clone về chạy được ngay, đọc README là hiểu) và gia cố nhỏ ở các điểm còn ghi nợ từ Đợt 2.

## Quyết định của chủ dự án

- Chỉ hỗ trợ "clone về chạy một lệnh" (Docker Compose), không dựng demo công khai.
- README dùng ảnh tĩnh, không GIF.
- Xác thực 2 lớp cho Admin là cờ `REQUIRE_ADMIN_2FA`, mặc định tắt.

## Thứ tự

3B (gia cố, Task 1) -> 3A-1 (demo một lệnh) -> 3A-2 và 3A-3 (README, overview) -> kiểm cuối.

## Mục 3A-1 – Demo một lệnh (D-066)

- **Phạm vi:** `docker-compose.demo.yml` tự chứa: `db` (postgres:17), bước khởi tạo (migrate + seed + dữ liệu demo), `backend`, `frontend` (build production), `mailpit` riêng cho demo. Tắt Stripe; chỉ cổng thanh toán giả (VNPay giả, MoMo giả) và chuyển khoản demo. Mọi giá trị "secret" dev có tiền tố `demo-only-` và chặn khi `NODE_ENV=production`. Cổng host không đụng môi trường dev (3000/4000).
- **Tiêu chí xong:** từ repo sạch, một lệnh `docker compose -f docker-compose.demo.yml up --build` đưa lên site có dữ liệu mẫu và tài khoản demo; đặt đơn bằng cổng giả end-to-end; tắt demo không để lại dữ liệu ngoài volume của nó; không động tới compose dev/prod.

**Đã làm (2026-11-23):** `docker-compose.demo.yml`, stage `demo-tools` + `backend/scripts/demo-init.sh`, cờ generator `--skip-if-exists`, logger tự bỏ pino-pretty khi thiếu, allowlist gitleaks, bước CI `config -q`, README mục chạy demo, D-066. Kết quả thử thật ở `testing.md` (mục "Kiểm demo một lệnh").

## Mục 3A-2 – README

- **Phạm vi:** tour tính năng kèm ảnh tĩnh mới, mục "Điểm kỹ thuật nổi bật", mục "Kịch bản demo 5 phút", hướng dẫn chạy một lệnh (3A-1).
- **Tiêu chí xong:** ảnh khớp giao diện hiện tại (kể cả 2FA, thanh toán giả, hành trình vận chuyển); mọi lệnh trong README đã chạy thử; không số liệu bịa.

**Đã làm (2026-11-23):** README viết lại (chạy một lệnh, kịch bản demo 5 phút, tour tính năng, điểm kỹ thuật nổi bật), 20 ảnh mới trong `docs/screenshots/` và script chụp tái lập được (`frontend/scripts/screenshots/capture.spec.ts`).

## Mục 3A-3 – `docs/overview.md`

- **Phạm vi:** mục lục quyết định theo chủ đề (D-001..D-070 gom theo thanh toán, giao hàng, bảo mật, SEO, CI, ...) và hai sơ đồ mermaid: luồng thanh toán (cổng giả, IPN) và đăng nhập 2 bước.
- **Tiêu chí xong:** sơ đồ render được trên GitHub, khớp contract (`api-contract.md` §5.2, §5.9, §13); mọi liên kết trong mục lục đúng.

**Đã làm (2026-11-23):** `docs/overview.md` (bảng quyết định theo chủ đề, sơ đồ luồng thanh toán giả và đăng nhập 2 bước).

## Mục 3B – Gia cố (Task 1)

| Quyết định | Phạm vi | Tiêu chí xong |
| --- | --- | --- |
| D-067 CI supply-chain | Ghim mọi `uses:` vào full SHA kèm comment phiên bản (đúng tag đang dùng); Dependabot `github-actions` vẫn cập nhật được; Trivy trong job `docker` chỉ báo cáo (HIGH/CRITICAL, `--ignore-unfixed`, Job Summary, `continue-on-error`) | actionlint 0 lỗi; Trivy chạy thử cục bộ trên image build tạm, ghi số phát hiện |
| D-068 `trackingNumber` unique | Migration chuẩn hóa `''` -> NULL, kiểm trùng dữ liệu cũ bằng `DO $$ ... RAISE EXCEPTION` có hướng dẫn, unique index; ứng dụng bắt P2002 -> 409 `TRACKING_NUMBER_TAKEN`, mã giả lập thử lại tối đa 8 lần | `prisma migrate diff` không drift; test: trùng -> 409, rỗng -> không nhập, sinh mã giả còn chạy, migration trên dữ liệu trùng báo lỗi rõ |
| D-069 robots.txt | `robots.txt` chỉ chặn `/admin` và `/api/`; trang noindex không bị chặn để crawler đọc được noindex; rà mọi trang private có `robots: { index: false }` | Test robots và noindex cập nhật, xanh |
| D-070 `REQUIRE_ADMIN_2FA` | Env mặc định `false`; bật thì ADMIN chưa bật 2FA nhận 403 `ADMIN_TWO_FACTOR_REQUIRED` ở `/admin/*`; `User.twoFactorRequired` cho FE; `AdminGuard` hiện màn hình "Cần bật xác thực 2 lớp" | Test tích hợp (cờ tắt/bật, Admin có/không 2FA, Staff, `/me/2fa/setup`), Vitest `AdminGuard`; E2E giữ cờ tắt |

Cập nhật docs đi kèm: `decisions.md`, `api-contract.md` (0.25), `db-schema.md` (0.14), `testing.md`, `deployment.md`, `architecture.md`, `.env.example`, `.env.production.example`, `roadmap-next.md` (R-07, R-11, R-22).

## Kiểm cuối

Backend và frontend lint, typecheck, format, test kèm coverage (ngưỡng D-055), build; migration deploy + kiểm drift trên Postgres tạm; actionlint; gitleaks; E2E đại diện (tài khoản, admin mobile, a11y, đơn khách vãng lai) trên DB tạm; kiểm `docker compose config` cho compose demo.
