# Kiểm thử BeanBox

## Yêu cầu chung
- Node >= 22, đã `npm install` trong `backend/` và `frontend/`.
- Docker Postgres chạy (`docker compose up -d db`), đã migrate: `npm run prisma:migrate` (hoặc `prisma migrate deploy`) trong `backend/`.
- Dữ liệu seed cho E2E: `npm run prisma:seed` trong `backend/` (idempotent; từ chối chạy khi `NODE_ENV=production`).
- `backend/.env` có `SEED_ADMIN_PASSWORD`, `SEED_STAFF_PASSWORD`, `SEED_CUSTOMER_PASSWORD` (xem `.env.example`).

## Unit / integration
| Phần | Lệnh (trong thư mục tương ứng) | Ghi chú |
|---|---|---|
| Backend | `npm run lint`, `npm run typecheck`, `npm test` | Test integration dùng DB Postgres thật (cần Docker chạy). |
| Frontend | `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` | Vitest + jsdom; `testTimeout`/`hookTimeout` = 15 s; loại trừ `e2e/**`. |

### Ma trận phân quyền tự động

`backend/tests/securityAuthz.integration.test.ts` liệt kê mọi route theo nhóm PUBLIC / OPTIONAL / ADMIN_ONLY (và Staff+) và kiểm đáp ứng 401/403 đúng. Khi thêm hoặc đổi route (ví dụ `/admin/settings`, `/admin/users`, `/admin/contact-messages`, `/settings/public`, `/contact`, `/csp-report`) phải cập nhật ma trận này trong cùng thay đổi.

## E2E (Playwright, chỉ chromium; chạy cục bộ và trong CI)
Cài trình duyệt một lần: `npx playwright install chromium` (trong `frontend/`).

Chạy: `npm run test:e2e` trong `frontend/`.

**Trong CI (D-033, job `e2e`).** Chạy sau khi `backend` và `frontend` xanh, trên runner Linux với Chromium do Playwright cài (`npx playwright install --with-deps chromium`). Postgres và Mailpit là service của job; job `npm ci` cả hai phía, chạy `prisma generate`, `migrate deploy` và seed bằng mật khẩu GIẢ chỉ dành cho CI (đặt trong env của job, không dùng ở nơi khác). Rate limit đặt hàng/mã/quote nới lên 200/phút để E2E không chạm giới hạn. Khi `CI` được đặt, Playwright không dùng lại server có sẵn, thử lại 1 lần (`retries: 1`) và xuất báo cáo HTML; job tải `playwright-report` và `test-results` lên artifact khi lỗi (giữ 7 ngày).
- `playwright.config.ts` tự khởi động backend (`npm run dev` ở `backend/`, chờ `http://127.0.0.1:4000/api/v1/health`, `JOBS_ENABLED=false`) và frontend (`npm run dev`, cổng 3000); nếu cổng đã có server thì dùng lại (`reuseExistingServer`).
- Mật khẩu tài khoản seed được đọc từ `backend/.env` ngay trong config, không hardcode và không in ra.
- Kịch bản (`frontend/e2e/`): khách vãng lai mua COD, tra cứu và hủy đơn; customer xem đơn hàng, bị chặn ở `/admin`, đăng xuất; staff xác nhận rồi hủy đơn (hoàn kho).
- Kịch bản M6b (`frontend/e2e/m6b.spec.ts`, thêm 1 lượt đăng nhập admin, tổng 3 lượt/lần chạy): khách gửi form `/lien-he` và thấy lời cảm ơn; admin tìm tin nhắn đó ở `/admin/lien-he`, đổi trạng thái sang "Đã xử lý" và lưu; `/admin/cai-dat` hiển thị các section (không lưu); `/admin/nguoi-dung` có `customer@beanbox.local`, chi tiết chính admin hiện ghi chú không thể tự khóa; `/chinh-sach/van-chuyen` hiển thị phí vận chuyển và trang chủ có cả header `content-security-policy-report-only` lẫn header `content-security-policy` thực thi tập con (`frame-ancestors 'none'; base-uri 'self'; object-src 'none'`, D-032). Các bước vào chi tiết trong bảng admin dùng click vào link thật (không `goto`), nên phát hiện được lỗi điều hướng bị debounce kéo lại (D-035). Tin nhắn liên hệ do E2E tạo được để lại ở trạng thái "Đã xử lý" (không xóa, chấp nhận được).
- Form liên hệ giới hạn 3 lần/10 phút/IP: chạy E2E quá 3 lần trong 10 phút sẽ gặp 429 ở kịch bản liên hệ; khởi động lại backend để xóa bộ đếm.
- Test dùng DB dev: mỗi lần chạy tạo đơn mới (dùng email/SĐT ngẫu nhiên) và hủy lại để hoàn kho. Nếu test chết giữa chừng có thể còn đơn `CONFIRMED`/`PENDING`: hủy ở `/admin/don-hang`.
- Máy chặn chạy file tải về (Windows "Application Control policy has blocked this file"): đặt `E2E_BROWSER_CHANNEL=msedge` (hoặc `chrome`) để dùng trình duyệt Chromium đã cài sẵn.

### Lưu ý rate limit
Đăng nhập giới hạn 5 lần/phút/IP (`api-contract.md` §1); tra cứu đơn guest 10/phút; đặt đơn 10/phút. E2E chạy tuần tự (`workers: 1`) và chỉ đăng nhập 2 lần mỗi lượt. Chạy lại liên tiếp nhiều lần có thể gặp `429 RATE_LIMITED`: chờ khoảng 1 phút hoặc khởi động lại backend (bộ đếm nằm trong bộ nhớ). Form liên hệ (`POST /contact`) giới hạn 3 lần/10 phút/IP: kịch bản nào gửi form liên hệ thì chạy lặp lại sẽ gặp 429, cần chờ hoặc khởi động lại backend. CSP đầy đủ chỉ ở chế độ report-only (D-024) nên không chặn gì trong E2E; vi phạm chỉ hiện trong console trình duyệt và log `warn` của backend. Header `Content-Security-Policy` thực thi tập con (D-032) không ảnh hưởng tới việc chạy trang.

## Kiểm thử Docker production cục bộ

Kiểm bản production (`docker-compose.prod.yml`) trên máy dev trước khi deploy; cách dựng và các lưu ý (cổng 8080/8443, `-p beanbox-local`, `curl -k`, `MSYS_NO_PATHCONV=1` trên Git Bash) xem [`deployment.md`](deployment.md) mục 15. Đặt thêm `EDGE_RATE_API_PER_MIN=20` trong `.env.production` để thử rate limit nhanh. Các bước smoke (thay cổng nếu khác):

1. **Health:** `docker compose -p beanbox-local --env-file .env.production -f docker-compose.prod.yml ps` thấy `db`, `backend`, `frontend`, `caddy` đều `healthy`. `curl -k https://localhost:8443/api/v1/health` trả 200 (`db: "up"`), `curl -k https://localhost:8443/api/v1/health/live` trả 200, `curl -k https://localhost:8443/healthz` trả `{"status":"ok"}`.
2. **Header:** `curl -kI https://localhost:8443/` có `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`, `Content-Security-Policy` (tập con thực thi) và `Content-Security-Policy-Report-Only`; KHÔNG có header `Server`; mọi response có `X-Request-Id`.
3. **Rate limit edge:** gửi liên tiếp vượt ngưỡng tới endpoint không bị limiter backend, ví dụ với `EDGE_RATE_API_PER_MIN=20`:
   ```bash
   for i in $(seq 1 40); do curl -sk -o /dev/null -w "%{http_code}\n" https://localhost:8443/api/v1/health/live; done | sort | uniq -c
   ```
   Kỳ vọng khoảng 20 phản hồi 200 rồi các phản hồi 429; xem `curl -ski https://localhost:8443/api/v1/health/live` trong lúc bị chặn: 429 có `Retry-After` và thân JSON `RATE_LIMITED` theo format lỗi §1. Chờ 1 phút (hoặc `restart caddy`) để bộ đếm về 0.
4. **XFF giả:** `curl -sk -o /dev/null -w "%{http_code}\n" -H 'X-Forwarded-For: 1.2.3.4' https://localhost:8443/api/v1/health/live` lặp lại vượt ngưỡng: đổi giá trị `X-Forwarded-For` KHÔNG làm bộ đếm reset (Caddy bỏ XFF do client gửi và dùng IP kết nối thật). Đối chiếu log: `logs caddy` và `logs backend` cho cùng một request qua `request_id` (Caddy) và `reqId` (backend); IP trong log là IP kết nối thật, không phải `1.2.3.4`.
5. **Giới hạn body:** `POST` thân hơn 1 MB tới `/api/v1/...` bị Caddy chặn (JSON `VALIDATION_ERROR`), tới `/api/v1/admin/uploads*` ngưỡng là 6 MB (`PAYLOAD_TOO_LARGE`).
6. **Backup/restore:** chạy `backup.sh` một lần (xem `deployment.md` mục 11), kiểm có `backups/db/beanbox-*.dump` và `backups/uploads/uploads-*.tar.gz`, rồi restore vào DB tạm `beanbox_restore_test` và `\dt` thấy bảng (lệnh đầy đủ ở mục 11); xóa DB tạm sau khi kiểm.
7. **Dọn dẹp:** `docker compose -p beanbox-local --env-file .env.production -f docker-compose.prod.yml down -v`.

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

Job `backend` chạy `prisma migrate diff` để bắt trường hợp sửa `schema.prisma` mà quên tạo migration. Chạy cục bộ với một Postgres tạm làm DB shadow (không đụng DB dev):

```bash
docker run -d --name bb-drift -e POSTGRES_PASSWORD=drift -p 55432:5432 postgres:17
# chờ vài giây cho Postgres sẵn sàng, rồi:
docker exec bb-drift psql -U postgres -c 'CREATE DATABASE beanbox_shadow'
cd backend
DATABASE_URL=postgresql://postgres:drift@localhost:55432/beanbox_shadow \
npx prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url postgresql://postgres:drift@localhost:55432/beanbox_shadow \
  --exit-code
echo "exit=$?"
docker rm -f bb-drift
```

Mã thoát `0` là khớp; `2` là drift (migrations khác `schema.prisma`: tạo migration mới bằng `npm run prisma:migrate`); mã khác là lỗi chạy lệnh. Mật khẩu `drift` chỉ dành cho container tạm này.
