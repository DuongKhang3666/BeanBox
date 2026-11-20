# Kiểm thử BeanBox

## Yêu cầu chung

- Node >= 22, đã `npm install` trong `backend/` và `frontend/`.
- Prisma 7: sau mỗi lần `npm install`/`npm ci` (và khi sửa `schema.prisma`) chạy `npx prisma generate` trong `backend/` để sinh client vào `backend/src/generated/prisma` (thư mục bị ignore, không commit; không có thì typecheck/test/dev đều lỗi). Cấu hình CLI nằm ở `backend/prisma.config.ts` (tự nạp `.env`, không ghi đè biến đã đặt; `SHADOW_DATABASE_URL` tùy chọn).
- Docker Postgres chạy (`docker compose up -d db`), đã migrate: `npm run prisma:migrate` (hoặc `prisma migrate deploy`) trong `backend/`.
- Prisma 7 không còn tự generate hay seed sau `migrate dev`/`migrate reset`: `npm run prisma:migrate` đã nối thêm `prisma generate`, `npm run db:reset` nối thêm `prisma generate` và `prisma db seed`; nếu gọi `npx prisma migrate ...` trực tiếp thì tự chạy `npx prisma generate` và `npm run prisma:seed`.
- Dữ liệu seed cho E2E: `npm run prisma:seed` trong `backend/` (idempotent; từ chối chạy khi `NODE_ENV=production`).
- `backend/.env` có `SEED_ADMIN_PASSWORD`, `SEED_STAFF_PASSWORD`, `SEED_CUSTOMER_PASSWORD` (xem `.env.example`).

## Unit / integration

| Phần     | Lệnh (trong thư mục tương ứng)                                   | Ghi chú                                                                |
| -------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Backend  | `npm run lint`, `npm run typecheck`, `npm test`                  | Test integration dùng DB Postgres thật (cần Docker chạy).              |
| Frontend | `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` | Vitest + jsdom; `testTimeout`/`hookTimeout` = 15 s; loại trừ `e2e/**`. |

### Test bảo mật phiên và cache (D-045)

- `backend/tests/sessionRevocation.integration.test.ts`: access token gắn với phiên; logout, reset-password, change-password (phiên khác 401, phiên hiện tại 200), dùng lại refresh token, refresh hết hạn đều chặn access token ngay; user bị khóa vẫn 403. Test tự ký token (`authMiddleware`, `securityHardening`) phải tạo một `RefreshToken` thật với `familyId = sid`; thu hồi phiên của user (khóa/đổi role) làm access token cũ trả 401 (không còn 403).
- `backend/tests/cacheControl.integration.test.ts`: response riêng tư có `no-store`, GET catalog/`settings/public`/`locations` không bị ép.
- `backend/tests/envSecrets.test.ts`: `COOKIE_SECURE=false` ở production bị từ chối; `AUTH_RATE_LIMIT_PER_MIN`.

### Ma trận phân quyền tự động

`backend/tests/securityAuthz.integration.test.ts` liệt kê mọi route theo nhóm PUBLIC / OPTIONAL / ADMIN_ONLY (và Staff+) và kiểm đáp ứng 401/403 đúng. Khi thêm hoặc đổi route (ví dụ `/admin/settings`, `/admin/users`, `/admin/contact-messages`, `/settings/public`, `/contact`, `/csp-report`) phải cập nhật ma trận này trong cùng thay đổi.

## E2E (Playwright, chỉ chromium; chạy cục bộ và trong CI)

Cài trình duyệt một lần: `npx playwright install chromium` (trong `frontend/`).

Chạy: `npm run test:e2e` trong `frontend/`.

**Cách ly cổng (tùy chọn).** Mặc định Playwright dùng backend ở cổng 4000 và frontend ở 3000, và dùng lại server đang chạy ở các cổng đó (`reuseExistingServer`). Nếu cổng 4000/3000 đang bị một backend/frontend dev khác chiếm (có thể chạy thiếu `AUTH_RATE_LIMIT_PER_MIN=30` nên dính 429), đặt `E2E_API_PORT` và `E2E_WEB_PORT` để Playwright tự khởi động một cặp server riêng với đúng env E2E, không đụng tiến trình đang chạy:

```bash
cd frontend
E2E_API_PORT=4100 E2E_WEB_PORT=3100 npm run test:e2e
# PowerShell: $env:E2E_API_PORT=4100; $env:E2E_WEB_PORT=3100; npm run test:e2e
```

Khi đặt, backend chạy với `PORT`, `FRONTEND_ORIGINS` và `WEB_APP_URL` khớp cổng web; frontend chạy `next dev -p <E2E_WEB_PORT>` với `API_INTERNAL_URL` trỏ cổng API; `e2e/helpers.ts` gọi API ở `E2E_API_PORT`. Cặp server mới dùng chung DB dev nên phải chọn cổng chưa ai dùng. Lưu ý: nếu đã có một `next dev` khác đang chạy trong cùng thư mục `frontend/` thì Next có thể từ chối khởi động bản thứ hai (đã kiểm chứng khi cổng 3000 trống, chưa kiểm chứng khi có bản dev khác đang chạy); khi đó dừng bản dev đó hoặc chạy E2E trên bản đã dựng qua `E2E_BASE_URL`. Không đặt hai biến thì hành vi như cũ (CI không đổi).

**Trong CI (D-033, job `e2e`).** Chạy sau khi `backend` và `frontend` xanh, trên runner Linux với Chromium do Playwright cài (`npx playwright install --with-deps chromium`). Postgres và Mailpit là service của job; job `npm ci` cả hai phía, chạy `prisma generate`, `migrate deploy` và seed bằng mật khẩu GIẢ chỉ dành cho CI (đặt trong env của job, không dùng ở nơi khác). Rate limit đặt hàng/mã/quote nới lên 200/phút và nhóm auth lên 30/phút (`AUTH_RATE_LIMIT_PER_MIN`) để E2E không chạm giới hạn. Khi `CI` được đặt, Playwright không dùng lại server có sẵn, thử lại 1 lần (`retries: 1`) và xuất báo cáo HTML; job tải `playwright-report` và `test-results` lên artifact khi lỗi (giữ 7 ngày).

- `playwright.config.ts` tự khởi động backend (`npm run dev` ở `backend/`, chờ `http://127.0.0.1:4000/api/v1/health`, `JOBS_ENABLED=false`) và frontend (`npm run dev`, cổng 3000); nếu cổng đã có server thì dùng lại (`reuseExistingServer`).
- Mật khẩu tài khoản seed được đọc từ `backend/.env` ngay trong config, không hardcode và không in ra.
- Kịch bản (`frontend/e2e/`): khách vãng lai mua COD, tra cứu và hủy đơn; customer xem đơn hàng, bị chặn ở `/admin`, đăng xuất; staff xác nhận rồi hủy đơn (hoàn kho).
- Kịch bản M6b (`frontend/e2e/m6b.spec.ts`, thêm 1 lượt đăng nhập admin, tổng 3 lượt/lần chạy): khách gửi form `/lien-he` và thấy lời cảm ơn; admin tìm tin nhắn đó ở `/admin/lien-he`, đổi trạng thái sang "Đã xử lý" và lưu; `/admin/cai-dat` hiển thị các section (không lưu); `/admin/nguoi-dung` có `customer@beanbox.local`, chi tiết chính admin hiện ghi chú không thể tự khóa; `/chinh-sach/van-chuyen` hiển thị phí vận chuyển và trang chủ có header `content-security-policy` thực thi (D-040; không còn header report-only). Các bước vào chi tiết trong bảng admin dùng click vào link thật (không `goto`), nên phát hiện được lỗi điều hướng bị debounce kéo lại (D-035). Tin nhắn liên hệ do E2E tạo được để lại ở trạng thái "Đã xử lý" (không xóa, chấp nhận được).
- Kịch bản CSP (`frontend/e2e/csp.spec.ts`, D-040, thêm 1 lượt đăng nhập admin): storefront có CSP thực thi (`script-src 'self' 'unsafe-inline'`, không có header report-only); `/admin` có CSP với nonce theo request + `'strict-dynamic'`, không có `challenges.cloudflare.com` ở `script-src`. Chạy qua các trang chính (trang chủ, danh mục, chi tiết sản phẩm, giỏ hàng, đăng nhập, liên hệ, tra cứu đơn; dashboard, danh sách và chi tiết sản phẩm admin) và yêu cầu 0 sự kiện `securitypolicyviolation` và 0 lỗi console CSP. Chạy với bản production đã dựng bằng Docker (không khởi động webServer, bỏ qua lỗi chứng chỉ tự ký; cần `SEED_ADMIN_PASSWORD` khớp dữ liệu đã seed trên stack đó, đặt trong env hoặc `backend/.env`):
  ```bash
  cd frontend
  E2E_BASE_URL=https://localhost:8443 npx playwright test e2e/csp.spec.ts
  ```
- Kịch bản so sánh sản phẩm (`frontend/e2e/compare.spec.ts`, D-047, không đăng nhập): từ `/danh-muc/ca-phe-hat` thêm 2 sản phẩm (khác xuất xứ và mức rang, chọn từ API seed) vào so sánh, thanh đáy hiện "So sánh (2)", sang `/so-sanh?sp=...` thấy bảng 2 cột và hàng "Mức rang", bật "Chỉ hiện điểm khác nhau" (hàng "Thương hiệu" cùng giá trị biến mất), tải lại vẫn còn bảng, bỏ 1 sản phẩm thì hiện hướng dẫn chọn thêm, rồi "Xóa tất cả". Test backend tương ứng: `tests/productCompare.integration.test.ts` (thứ tự, bỏ trùng, 400, `missing`, không lộ `stock`/`description`/giá sale chưa bắt đầu, `priceRange`, header cache), cộng thêm ca slug dành riêng `compare` ở `adminProducts.integration.test.ts`.
- Kịch bản a11y (`frontend/e2e/a11y.spec.ts`, D-044, thêm 1 lượt đăng nhập customer): xem mục "Khả năng truy cập và Lighthouse".
- Form liên hệ giới hạn 3 lần/10 phút/IP: chạy E2E quá 3 lần trong 10 phút sẽ gặp 429 ở kịch bản liên hệ; khởi động lại backend để xóa bộ đếm.
- Test dùng DB dev: mỗi lần chạy tạo đơn mới (dùng email/SĐT ngẫu nhiên) và hủy lại để hoàn kho. Nếu test chết giữa chừng có thể còn đơn `CONFIRMED`/`PENDING`: hủy ở `/admin/don-hang`.
- Máy chặn chạy file tải về (Windows "Application Control policy has blocked this file"): đặt `E2E_BROWSER_CHANNEL=msedge` (hoặc `chrome`) để dùng trình duyệt Chromium đã cài sẵn.

### Lưu ý rate limit

Mỗi lần chạy E2E đầy đủ có khoảng 5 lượt đăng nhập (accounts 2, m6b 1, csp 1, a11y 1). Limiter nhóm auth mặc định 5/phút/IP (`AUTH_RATE_LIMIT_PER_MIN`, D-045) nên Playwright khởi động backend với `AUTH_RATE_LIMIT_PER_MIN=30` (CI job `e2e` cũng đặt 30): chạy lại liên tiếp hoặc CI thử lại cả bộ không còn dính 429 đăng nhập. Nếu dùng lại backend dev đang chạy sẵn (`reuseExistingServer`) thì backend đó phải chạy với biến này (đặt trong `backend/.env`), nếu không vẫn bị giới hạn 5/phút.
Ngoài ra backend có giới hạn chung 100 request/phút/IP cho `/api/v1` (`GENERAL_RATE_LIMIT_PER_MIN`). Playwright khởi động backend với `GENERAL_RATE_LIMIT_PER_MIN=1000` (CI cũng đặt) nên chạy cả bộ liền một mạch không chạm giới hạn này. Nếu dùng lại backend dev đang chạy sẵn (`reuseExistingServer`) thì backend đó phải được chạy với biến này (đặt trong `backend/.env`), nếu không `m6b.spec.ts` có thể gặp 429 ở `/admin/users`.

Đăng nhập giới hạn 5 lần/phút/IP ở production, E2E dùng 30 (`api-contract.md` §1); tra cứu đơn guest 10/phút; đặt đơn 10/phút. E2E chạy tuần tự (`workers: 1`) và chỉ đăng nhập ít lần mỗi spec (mỗi spec admin 1 lượt). Chạy lại liên tiếp nhiều lần có thể gặp `429 RATE_LIMITED`: chờ khoảng 1 phút hoặc khởi động lại backend (bộ đếm nằm trong bộ nhớ). Form liên hệ (`POST /contact`) giới hạn 3 lần/10 phút/IP: kịch bản nào gửi form liên hệ thì chạy lặp lại sẽ gặp 429, cần chờ hoặc khởi động lại backend. CSP đã thực thi từ M8 (D-040) nên vi phạm CSP làm vỡ trang thật và `csp.spec.ts` sẽ báo; log `warn` của backend (`POST /csp-report`) cũng ghi vi phạm.

## Khả năng truy cập và Lighthouse

Chuẩn: WCAG 2.1 mức AA cho storefront (không gồm `/admin`). Quyết định ở D-044.

### Axe tự động (chạy trong E2E và CI)

`frontend/e2e/a11y.spec.ts` dùng `@axe-core/playwright` (ghim 4.14.0) với tag `wcag2a, wcag2aa, wcag21a, wcag21aa`, quét 18 trang (thêm `/so-sanh?sp=<2 slug seed>` và danh mục khi thanh so sánh đang hiện): `/`, danh mục, chi tiết sản phẩm, `/tim-kiem?q=phin`, giỏ hàng (trống và có hàng), thanh toán (có hàng), đăng nhập, đăng ký, quên mật khẩu, tra cứu đơn, liên hệ, chính sách vận chuyển, giới thiệu, trang 404, và `/tai-khoan` + `/tai-khoan/don-hang` (1 lượt đăng nhập customer). Slug sản phẩm lấy từ API seed (`findStockedProduct`); giỏ có hàng tạo qua API rồi nạp token vào `localStorage`. Vi phạm impact `serious`/`critical` làm test FAIL (in rõ quy tắc, nút lỗi); `moderate`/`minor` chỉ `console.log` (dòng `a11y <trang>: ...`, xem bằng `--reporter=line` hoặc báo cáo HTML). Lệnh (trong `frontend/`, cần backend + seed như E2E):

```bash
npx playwright test e2e/a11y.spec.ts
```

Axe không bắt được thứ tự tiêu đề hợp lý, ngữ nghĩa combobox, focus trap và nội dung alt có ý nghĩa; những điểm đó đã rà bằng mã nguồn ở D-044 và nên rà lại khi thêm thành phần tương tác mới (dialog, combobox, form).

### Lighthouse (đo thủ công, không đưa vào CI)

Chạy trên BẢN PRODUCTION BUILD, không phải `npm run dev`:

```bash
# backend (một terminal): JOBS_ENABLED=false GENERAL_RATE_LIMIT_PER_MIN=1000 npm run dev  (trong backend/)
cd frontend && npm run build && npm start        # cổng 3000
# Windows + Edge cài sẵn (Chromium tải về có thể bị Application Control chặn):
export CHROME_PATH="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
npx lighthouse@13.6.0 "http://localhost:3000/danh-muc/ca-phe-hat"   --output=json --output=html --output-path=<thư-mục-tạm>/ten-bao-cao   --chrome-flags="--headless" --port=9333 --quiet            # mobile (mặc định)
# thêm --preset=desktop cho desktop
```

`--port=9333` (cổng debug cố định) là bắt buộc với Edge trên máy này: không có thì chrome-launcher báo "waiting for dynamic debugging port". Không thêm `lighthouse` vào `package.json`; lưu báo cáo ngoài repo. Lighthouse để lại thư mục `lighthouse.*` trong thư mục Temp của Windows (không xóa được ngay do Edge còn giữ), dọn tay sau.

Kết quả SAU khi sửa (đo 2026-11-20; máy local Windows 11, Node 24, Edge headless, production build, backend dev + Postgres Docker local + dữ liệu seed, throttling mặc định của Lighthouse 13.6.0: mobile = Slow 4G + CPU 4x, desktop = preset desktop; mỗi ô là 1 lần đo). Mỗi ô: Performance / Accessibility / Best Practices / SEO.

| Trang                             | Mobile            | Desktop           |
| --------------------------------- | ----------------- | ----------------- |
| `/`                               | 100 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| `/danh-muc/ca-phe-hat`            | 92 / 100 / 100 / 100  | 100 / 100 / 100 / 100 |
| `/san-pham/ethiopia-yirgacheffe-washed` | 100 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| `/tim-kiem?q=phin`                | 95 / 100 / 100 / 66   | 100 / 100 / 100 / 66  |
| `/lien-he`                        | 100 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |

SEO 66 ở `/tim-kiem` là chủ ý: trang có `noindex` (kiểm "không lập chỉ mục" ở `noindex.test.ts`), Lighthouse báo `is-crawlable`. Điểm Performance DAO ĐỘNG giữa các lần đo (vài điểm, LCP mobile của trang danh sách từ 2.9 đến 3.5 giây giữa các lần) do mô phỏng throttling, tải máy và cache; vì vậy không đặt ngưỡng cứng trong CI, chỉ dùng làm tham chiếu. Điểm trước khi sửa và các mục không sửa: D-044.

## Kiểm thử Docker production cục bộ

Kiểm bản production (`docker-compose.prod.yml`) trên máy dev trước khi deploy; cách dựng và các lưu ý (cổng 8080/8443, `-p beanbox-local`, `curl -k`, `MSYS_NO_PATHCONV=1` trên Git Bash) xem [`deployment.md`](deployment.md) mục 15. Đặt thêm `EDGE_RATE_API_PER_MIN=20` trong `.env.production` để thử rate limit nhanh. Các bước smoke (thay cổng nếu khác):

1. **Health:** `docker compose -p beanbox-local --env-file .env.production -f docker-compose.prod.yml ps` thấy `db`, `backend`, `frontend`, `caddy` đều `healthy`. `curl -k https://localhost:8443/api/v1/health` trả 200 (`db: "up"`), `curl -k https://localhost:8443/api/v1/health/live` trả 200, `curl -k https://localhost:8443/healthz` trả `{"status":"ok"}`.
2. **Header:** `curl -kI https://localhost:8443/` có `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy` và `Content-Security-Policy` (đầy đủ, thực thi, có `report-uri`); KHÔNG có `Content-Security-Policy-Report-Only` và KHÔNG có header `Server`; response từ backend (`/api/v1/*`) có `X-Request-Id`, còn trang HTML và `/healthz` KHÔNG có header này (Caddy chỉ gửi `X-Request-Id` lên upstream và ghi `request_id` vào log). `/admin` có CSP với `nonce-...` khác nhau mỗi request: `for i in 1 2; do curl -skI https://localhost:8443/admin | grep -i '^content-security-policy'; done` cho hai giá trị nonce khác nhau.
3. **Rate limit edge:** gửi liên tiếp vượt ngưỡng tới endpoint không bị limiter backend, ví dụ với `EDGE_RATE_API_PER_MIN=20`:
   ```bash
   for i in $(seq 1 40); do curl -sk -o /dev/null -w "%{http_code}\n" https://localhost:8443/api/v1/health/live; done | sort | uniq -c
   ```
   Kỳ vọng khoảng 20 phản hồi 200 rồi các phản hồi 429; xem `curl -ski https://localhost:8443/api/v1/health/live` trong lúc bị chặn: 429 có `Retry-After` và thân JSON `RATE_LIMITED` theo format lỗi §1. Chờ 1 phút (hoặc `restart caddy`) để bộ đếm về 0.
4. **XFF giả:** `curl -sk -o /dev/null -w "%{http_code}\n" -H 'X-Forwarded-For: 1.2.3.4' https://localhost:8443/api/v1/health/live` lặp lại vượt ngưỡng: đổi giá trị `X-Forwarded-For` KHÔNG làm bộ đếm reset (Caddy bỏ XFF do client gửi và dùng IP kết nối thật). Đối chiếu log: `logs caddy` và `logs backend` cho cùng một request qua `request_id` (Caddy) và `reqId` (backend); IP trong log là IP kết nối thật, không phải `1.2.3.4`.
5. **Giới hạn body:** `POST` thân hơn 1 MB tới `/api/v1/...` bị Caddy chặn (JSON `VALIDATION_ERROR`), tới `/api/v1/admin/uploads*` ngưỡng là 6 MB (`PAYLOAD_TOO_LARGE`).
6. **Backup/restore cục bộ:** chạy `backup.sh` một lần (xem `deployment.md` mục 11), kiểm có `backups/db/beanbox-*.dump` và `backups/uploads/uploads-*.tar.gz`, rồi restore vào DB tạm `beanbox_restore_test` và `\dt` thấy bảng (lệnh đầy đủ ở mục 11); xóa DB tạm sau khi kiểm.
7. **Backup off-site với remote local:** chạy `selftest-offsite.sh` (lệnh ở `deployment.md` mục 11, bước "Thiết lập" số 5): mọi mục phải PASS, thoát 0. Selftest gồm cả mục (h) khóa chống chạy chồng (D-042): có tiến trình giữ `backups/.backup.lock` thì `backup.sh` thoát 5, không tạo dump, không gọi heartbeat; nhả khóa thì chạy lại thoát 0. Rồi thử vòng thật với remote là một thư mục local (khai báo remote rclone kiểu `local`, một public key age tạo bằng `age-keygen` của image backup): `backup.sh` -> thư mục `<TS>/` có hai file `.age` và `SHA256SUMS` -> `fetch-remote.sh <TS>` kèm khóa bí mật -> `restore.sh` vào DB tạm như bước 6. Sửa 1 byte file `.age` trên remote thì `fetch-remote.sh` phải dừng (mã 3) và không giải mã.
8. **Redirect cổng:** `curl -sI http://localhost:8080/` trả 308 với `Location: https://localhost:8443/` (D-037).
9. **Giám sát:** `sh deploy/monitoring/check.sh --insecure --min-tls-days 0 https://localhost:8443` in `OK` cho cả ba mục (health có `"db":"up"`, trang chủ có từ khóa, TLS) và thoát 0 (`deployment.md` mục 16).
10. **CSP trên bản production:** chạy `e2e/csp.spec.ts` như ở mục E2E (`E2E_BASE_URL=https://localhost:8443`).
11. **Dọn dẹp:** `docker compose -p beanbox-local --env-file .env.production -f docker-compose.prod.yml down -v`.

## CI: ops-lint và image backup

- Job `docker` build thêm image backup (`deploy/backup`) bên cạnh backend, frontend, Caddy; không push. Job có service `postgres:17` (giá trị giả chỉ dành cho CI) và, sau bước smoke image, chạy `selftest-offsite.sh` BÊN TRONG image backup vừa build (`--network host`, PG* trỏ `localhost:5432`, mount `deploy/backup` chỉ đọc; D-043). Mọi mục phải PASS (hiện 46 PASS, 0 FAIL). Vì vậy đổi phiên bản rclone ghim trong Dockerfile (D-041) được CI kiểm tự động.
- Job `ops-lint` kiểm các file vận hành mà test code không phủ: `shellcheck` cho script shell trong `deploy/` và `docker compose config` cho các file compose. Xem định nghĩa chính xác trong `.github/workflows/ci.yml`. Chạy cục bộ tương đương: `shellcheck deploy/backup/*.sh deploy/monitoring/check.sh` và `docker compose --env-file .env.production -f docker-compose.prod.yml config -q`.

## Quét secret (gitleaks)

Job CI `secret-scan` quét toàn bộ lịch sử git bằng gitleaks (Docker image ghim phiên bản) với cấu hình `.gitleaks.toml` (rule mặc định cộng allowlist chỉ cho các giá trị mẫu/giả đã biết, theo cặp đường dẫn + giá trị). Chạy cục bộ tương đương (cần Docker; thư mục repo gắn chỉ đọc):

```bash
docker run --rm --entrypoint sh \
  -v "$PWD:/repo:ro" \
  zricethezav/gitleaks:v8.30.0 \
  -c 'git config --global --add safe.directory /repo && gitleaks git --config /repo/.gitleaks.toml --redact --no-banner --verbose /repo'
```

Trên Git Bash của Windows thêm `MSYS_NO_PATHCONV=1` trước `docker run`. Mã thoát khác 0 nghĩa là có phát hiện (giá trị đã được che bằng `--redact`). Chỉ thêm vào allowlist khi chắc đó là giá trị giả, và luôn theo cặp đường dẫn + giá trị.

## Kiểm drift migration

Job `backend` chạy `prisma migrate diff` để bắt trường hợp sửa `schema.prisma` mà quên tạo migration. Prisma 7 bỏ cờ `--shadow-database-url` và đổi `--to-schema-datamodel` thành `--to-schema`: DB shadow lấy từ biến `SHADOW_DATABASE_URL` qua `backend/prisma.config.ts` (phải khác DB chính, nếu trùng Prisma báo lỗi P3025). Chạy cục bộ với một Postgres tạm (không đụng DB dev):

```bash
docker run -d --name bb-drift -e POSTGRES_PASSWORD=drift -p 55432:5432 postgres:17
# chờ vài giây cho Postgres sẵn sàng, rồi:
docker exec bb-drift psql -U postgres -c 'CREATE DATABASE beanbox_main' -c 'CREATE DATABASE beanbox_shadow'
cd backend
DATABASE_URL=postgresql://postgres:drift@localhost:55432/beanbox_main \
SHADOW_DATABASE_URL=postgresql://postgres:drift@localhost:55432/beanbox_shadow \
npx prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema prisma/schema.prisma \
  --exit-code
echo "exit=$?"
docker rm -fv bb-drift
```

Mã thoát `0` là khớp; `2` là drift (migrations khác `schema.prisma`: tạo migration mới bằng `npm run prisma:migrate`); mã khác là lỗi chạy lệnh. Mật khẩu `drift` chỉ dành cho container tạm này.
