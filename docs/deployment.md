# BeanBox – Hướng dẫn triển khai (demo trên một VPS)

> Áp dụng cho M7 (D-025..D-034). Mô hình: một VPS Linux chạy Docker Compose bằng `docker-compose.prod.yml`, build image ngay trên VPS, không registry, không deploy tự động. Đây là bản demo, không phải hệ thống nhiều instance (D-027).
> Mọi lệnh `docker compose` dưới đây chạy ở thư mục gốc repo trên VPS. Để ngắn gọn, ta đặt bí danh trong shell:
>
> ```bash
> alias dcp='docker compose --env-file .env.production -f docker-compose.prod.yml'
> ```
>
> Bí danh chỉ có tác dụng trong phiên shell hiện tại; trong tài liệu các lệnh vẫn viết đầy đủ ở những chỗ quan trọng.

## Mục lục

1. [Kiến trúc triển khai](#1-kiến-trúc-triển-khai)
2. [Chuẩn bị VPS](#2-chuẩn-bị-vps)
3. [DNS](#3-dns)
4. [Biến môi trường](#4-biến-môi-trường)
5. [Thanh toán sandbox](#5-thanh-toán-sandbox)
6. [Cloudflare Turnstile (tùy chọn)](#6-cloudflare-turnstile-tùy-chọn)
7. [Triển khai lần đầu](#7-triển-khai-lần-đầu)
8. [Lưu ý về trang tĩnh](#8-lưu-ý-về-trang-tĩnh)
9. [Health và log](#9-health-và-log)
10. [Rate limit](#10-rate-limit)
11. [Backup và restore](#11-backup-và-restore)
12. [Cập nhật phiên bản và rollback](#12-cập-nhật-phiên-bản-và-rollback)
13. [Checklist go-live](#13-checklist-go-live)
14. [Sự cố thường gặp](#14-sự-cố-thường-gặp)
15. [Chạy thử cục bộ bằng Docker](#15-chạy-thử-cục-bộ-bằng-docker)
16. [Giám sát uptime](#16-giám-sát-uptime)

## 1. Kiến trúc triển khai

```
Internet
   |
   v   :80 (HTTP, tự chuyển sang HTTPS) / :443 (HTTPS + HTTP/3 UDP)
+-------+
| caddy |  TLS Let's Encrypt tự động, rate limit edge, header bảo mật, access log JSON
+-------+
   |  /api/v1/*, /uploads/*            |  còn lại (trang, /_next/*, /healthz)
   v                                   v
+-----------+  <---- SSR (API_INTERNAL_URL) ----  +-------------+
| backend   |                                     | frontend    |
|  :4000    |                                     |  :3000      |
+-----------+                                     +-------------+
   |
   v
+------+
|  db  |  PostgreSQL 17 :5432 (chỉ trong mạng Docker)
+------+
```

| Service                     | Vai trò                                                                                                    | Publish cổng ra host                                                       |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `caddy`                     | Reverse proxy, TLS, rate limit edge                                                                        | `${HTTP_PORT:-80}`, `${HTTPS_PORT:-443}` (TCP và UDP cho HTTP/3). DUY NHẤT |
| `frontend`                  | Next.js (standalone)                                                                                       | Không (chỉ `3000` trong mạng Docker)                                       |
| `backend`                   | Express API, chạy `prisma migrate deploy` rồi `node dist/server.js`                                        | Không (chỉ `4000` trong mạng Docker)                                       |
| `db`                        | PostgreSQL 17, volume `pgdata`                                                                             | Không                                                                      |
| `backup` (profile `backup`) | Sao lưu định kỳ, tùy chọn đẩy off-site (image build từ `deploy/backup`: postgres:17 + rclone + age + curl) | Không                                                                      |
| `seed` (profile `tools`)    | Chạy một lần để nạp dữ liệu demo                                                                           | Không                                                                      |

Volume: `pgdata` (dữ liệu DB), `uploads` (ảnh tải lên, gắn `/app/uploads` của backend), `caddy_data` (chứng chỉ TLS), `caddy_config`. Backup ghi ra thư mục bind `./backups` trên host. Backend chạy đúng MỘT instance (D-027). Mailpit không có ở production.

## 2. Chuẩn bị VPS

- Hệ điều hành Linux (ví dụ Ubuntu LTS hoặc Debian). Có thể SSH bằng khóa.
- Cài **Docker Engine** và **Docker Compose plugin** (lệnh `docker compose`, không phải `docker-compose` bản cũ) theo hướng dẫn chính thức của Docker; kiểm tra bằng `docker --version` và `docker compose version`. Cần compose v2 đủ mới để hỗ trợ `name:` ở mức cao nhất của file và `depends_on.condition`.
- Tạo user thường (không dùng root cho thao tác hằng ngày), thêm vào nhóm `docker`: `sudo usermod -aG docker <user>`, đăng nhập lại. Lưu ý nhóm `docker` tương đương quyền root trên máy; chỉ cấp cho người tin cậy.
- Firewall chỉ mở 22 (SSH), 80, 443 (TCP) và 443/UDP (HTTP/3, tùy chọn). Ví dụ với `ufw`:

  ```bash
  sudo ufw default deny incoming
  sudo ufw allow 22/tcp
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp
  sudo ufw allow 443/udp
  sudo ufw enable
  ```

  Lưu ý: cổng Docker publish có thể đi vòng qua `ufw` (Docker tự thêm luật iptables). Trong compose prod chỉ `caddy` publish cổng nên rủi ro thấp; không tự thêm `ports:` cho `db`/`backend`.

- Cấu hình tối thiểu khuyến nghị (ước lượng, chưa đo): 2 vCPU, 2 GB RAM (nên thêm swap vì lúc build image Next.js và Caddy/xcaddy tốn RAM), 20 GB ổ đĩa trống. Build chạy ngay trên VPS nên lần đầu có thể mất vài phút đến hơn chục phút tùy máy.

## 3. DNS

1. Tạo bản ghi **A** (IPv4) và, nếu VPS có IPv6, **AAAA** trỏ tên miền (ví dụ `shop.example.com`) về IP của VPS.
2. Chờ DNS phân giải đúng trước khi bật Caddy: `dig +short shop.example.com` (hoặc `nslookup`) phải trả về IP VPS. Let's Encrypt cần truy cập được cổng 80/443 của đúng máy này để cấp chứng chỉ; xin chứng chỉ khi DNS chưa xong dễ dính giới hạn thử lại của Let's Encrypt.
3. Nếu dùng Cloudflare ở chế độ proxy (đám mây cam): mọi kết nối tới Caddy đến từ IP của Cloudflare nên rate limit và log IP sẽ sai (cả thế giới chung vài IP). Khi đó phải bật `trusted_proxies` + `client_ip_headers CF-Connecting-IP` trong khối global options của `deploy/caddy/Caddyfile` (hướng dẫn nằm sẵn trong phần comment đầu file, KHÔNG bật mặc định) và chỉ cho cổng 80/443 nhận lưu lượng từ dải IP Cloudflare. Cách an toàn nhất cho demo: để đám mây xám (chỉ DNS).

## 4. Biến môi trường

Sao chép mẫu rồi điền (file `.env.production` KHÔNG được commit):

```bash
cp .env.production.example .env.production
chmod 600 .env.production
```

Sinh secret mạnh, mỗi biến một giá trị riêng:

```bash
openssl rand -hex 32     # JWT_ACCESS_SECRET, INTERNAL_API_SECRET
openssl rand -hex 24     # POSTGRES_PASSWORD (chuỗi hex để không có ký tự đặc biệt làm hỏng DATABASE_URL)
```

| Biến                                                                                | Bắt buộc     | Ý nghĩa                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUBLIC_URL`                                                                        | Có           | URL công khai đầy đủ, `https://...`, không có `/` cuối. Compose gán cho `WEB_APP_URL` (gốc link trong email) và `FRONTEND_ORIGINS` (CORS + kiểm tra Origin) của backend nên ba giá trị luôn bằng nhau; cũng là `NEXT_PUBLIC_SITE_URL` của frontend (sitemap, Open Graph). `NEXT_PUBLIC_SITE_URL` được nhúng lúc BUILD: đổi domain thì phải build lại image frontend (mục 12) |
| `SITE_ADDRESS`                                                                      | Có           | Tên miền để Caddy xin chứng chỉ Let's Encrypt (phải trỏ DNS về VPS). `localhost` để thử cục bộ                                                                                                                                                                                                                                                                               |
| `ACME_EMAIL`                                                                        | Không        | Email đăng ký ACME (nhận thông báo hết hạn chứng chỉ)                                                                                                                                                                                                                                                                                                                        |
| `HTTP_PORT`, `HTTPS_PORT`                                                           | Không        | Cổng Caddy nghe, mặc định 80/443. Compose truyền hai biến này vào container và map cổng host = cổng container (`8080:8080`, `8443:8443`...), Caddy tự biết cổng nên redirect http -> https giữ đúng cổng (mục 15). Production thật giữ 80/443 vì Let's Encrypt chỉ kiểm tra 80/443 từ bên ngoài. `SITE_ADDRESS` chỉ là tên miền, không kèm cổng                              |
| `POSTGRES_USER`, `POSTGRES_DB`                                                      | Có           | Tên user và DB (mẫu: `beanbox`)                                                                                                                                                                                                                                                                                                                                              |
| `POSTGRES_PASSWORD`                                                                 | Có           | Mật khẩu DB; dùng chuỗi hex                                                                                                                                                                                                                                                                                                                                                  |
| `JWT_ACCESS_SECRET`                                                                 | Có           | Khóa ký access token, >= 32 ký tự ngẫu nhiên                                                                                                                                                                                                                                                                                                                                 |
| `INTERNAL_API_SECRET`                                                               | Có           | >= 32 ký tự. Dùng CHUNG hai phía: compose truyền cùng một giá trị cho backend và frontend (SSR gửi `X-Internal-Secret` để không bị rate limit chung dồn vào một IP). Không bao giờ để dạng `NEXT_PUBLIC_`                                                                                                                                                                    |
| `COOKIE_SECURE`                                                                     | Không        | Mặc định `true`. Giữ `true` (hoặc bỏ trống). Từ D-045, `COOKIE_SECURE=false` ở production (`NODE_ENV=production`) bị backend từ chối khởi động; chỉ dùng `false` ở dev/test (xem mục 14)                                                                                                                                                                                                                                                                          |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`                     | Nên có       | SMTP thật (Mailpit không có ở production). Để trống `SMTP_HOST` thì email (xác nhận đơn, đặt lại mật khẩu, thông báo liên hệ) không gửi được; backend ghi log lỗi gửi mail nhưng không làm hỏng đơn. Mặc định cổng 587                                                                                                                                                       |
| `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`                                               | Không        | Có đủ cả hai thì bật VNPay; trống thì tắt (mục 5)                                                                                                                                                                                                                                                                                                                            |
| `VNPAY_PAYMENT_URL`, `VNPAY_RETURN_URL`                                             | Không        | Trống = URL sandbox mặc định và `${PUBLIC_URL}/thanh-toan/ket-qua?provider=vnpay`                                                                                                                                                                                                                                                                                            |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`                                        | Không        | Chỉ `sk_test_...`; có khóa thì bật Stripe. Webhook secret `whsec_...` (mục 5)                                                                                                                                                                                                                                                                                                |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`                                        | Không        | Captcha form liên hệ; phải có ĐỦ CẢ HAI hoặc để trống cả hai (mục 6)                                                                                                                                                                                                                                                                                                         |
| `CONTACT_RETENTION_DAYS`                                                            | Không        | Số ngày giữ tin liên hệ đã xử lý/spam trước khi job xóa cứng (D-029); mặc định 365, `0` = tắt. Đổi khác 365 thì sửa trang chính sách bảo mật cho khớp                                                                                                                                                                                                                        |
| `JOBS_ENABLED`                                                                      | Không        | Mặc định `true`: bật job nền dọn dẹp và hủy đơn quá hạn thanh toán. Chỉ đặt `false` khi chủ ý tắt (đơn `PENDING_PAYMENT` quá hạn sẽ không tự hủy, kho không tự hoàn)                                                                                                                                                                                                         |
| `LOG_LEVEL`                                                                         | Không        | Mặc định `info`                                                                                                                                                                                                                                                                                                                                                              |
| `GENERAL_RATE_LIMIT_PER_MIN`                                                        | Không        | Rate limit chung toàn API của backend theo IP (mặc định 100); production giữ mặc định                                                                                                                                                                                                                                                                                        |
| `AUTH_RATE_LIMIT_PER_MIN`                                                           | Không        | Rate limit nhóm auth (đăng nhập, đăng ký, quên/đặt lại/đổi mật khẩu) theo IP, mặc định 5; production giữ mặc định (E2E/CI đặt 30) |
| `ORDER_RATE_LIMIT_PER_MIN`, `COUPON_RATE_LIMIT_PER_MIN`, `QUOTE_RATE_LIMIT_PER_MIN` | Không        | Rate limit backend theo IP (mặc định 10/10/30)                                                                                                                                                                                                                                                                                                                               |
| `EXPORT_RATE_LIMIT_PER_MIN` | Không | Rate limit xuất CSV phân tích (`GET /admin/analytics/export`) theo IP, mặc định 10; production giữ mặc định |
| `EDGE_RATE_AUTH_PER_MIN`, `EDGE_RATE_API_PER_MIN`, `EDGE_RATE_WEB_PER_MIN`          | Không        | Rate limit ở Caddy theo IP (mặc định 30/300/600)                                                                                                                                                                                                                                                                                                                             |
| `BACKUP_RETENTION_DAYS`, `BACKUP_INTERVAL_SECONDS`                                  | Không        | Xoay vòng backup cục bộ (mặc định 7 ngày) và chu kỳ của service `backup` (mặc định 86400 giây)                                                                                                                                                                                                                                                                               |
| `BACKUP_ENV_FILE`                                                                   | Không        | Đường dẫn file cấu hình off-site/heartbeat nạp riêng vào service `backup`, mặc định `.env.backup` (gitignored, mẫu `.env.backup.example`). Các biến off-site (`BACKUP_REMOTE`, `RCLONE_CONFIG_*`, `BACKUP_AGE_RECIPIENTS`...) nằm ở đó, KHÔNG nằm trong `.env.production` (mục 11)                                                                                           |
| `SEED_ADMIN_PASSWORD`, `SEED_STAFF_PASSWORD`, `SEED_CUSTOMER_PASSWORD`              | Chỉ khi seed | Mỗi mật khẩu >= 12 ký tự, có chữ và số, khác giá trị mẫu trong `backend/.env.example`                                                                                                                                                                                                                                                                                        |

Backend kiểm tra env bằng zod khi khởi động và DỪNG ngay (log nêu tên biến, không in giá trị) khi:

- thiếu `INTERNAL_API_SECRET` ở production, hoặc `JWT_ACCESS_SECRET`/`INTERNAL_API_SECRET` ngắn hơn 32 ký tự;
- `JWT_ACCESS_SECRET` hoặc `INTERNAL_API_SECRET` bắt đầu bằng `dev-` (giá trị mẫu dev);
- chỉ đặt một trong hai khóa Turnstile;
- `STRIPE_SECRET_KEY` bắt đầu bằng `sk_live_` (chỉ chấp nhận `sk_test_`);
- `TRUST_PROXY=true` (compose đã đặt `uniquelocal`, không sửa), `VNPAY_PAYMENT_URL` không phải https, v.v.

Ghi chú: service `backup` chỉ nhận biến từ `.env.backup` (tùy chọn, `env_file` với `required: false` nên cần Docker Compose >= 2.24) cộng với `PG*`, `BACKUP_RETENTION_DAYS` và `BACKUP_INTERVAL_SECONDS` do compose truyền; container này không thấy JWT hay secret khác của ứng dụng. Thiếu file `.env.backup` thì off-site tắt, không lỗi.

Ghi chú: compose dùng cú pháp `${BIEN:?...}` nên thiếu biến bắt buộc (`PUBLIC_URL`, `SITE_ADDRESS`, `POSTGRES_*`, `JWT_ACCESS_SECRET`, `INTERNAL_API_SECRET`) sẽ báo lỗi ngay ở bước `docker compose` mà chưa chạy container nào.

## 5. Thanh toán sandbox

Chỉ dùng khóa sandbox/test; hướng dẫn lấy khóa và thẻ thử nằm ở [`payments-setup.md`](payments-setup.md) (không lặp lại ở đây). Điền biến vào `.env.production` rồi khởi động lại backend: `docker compose --env-file .env.production -f docker-compose.prod.yml up -d backend`.

- **VNPay:** đặt `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`. Trong trang quản trị merchant sandbox, đặt URL IPN là `https://<domain>/api/v1/payments/vnpay/ipn`. URL return mặc định `https://<domain>/thanh-toan/ket-qua?provider=vnpay` (không cần đặt `VNPAY_RETURN_URL` nếu dùng mặc định). Không có IPN vẫn dùng được vì return đã ký được xử lý như IPN.
- **Stripe (Test mode):** đặt `STRIPE_SECRET_KEY=sk_test_...`. Trong Stripe Dashboard (Test mode, Developers -> Webhooks) tạo endpoint `https://<domain>/api/v1/payments/stripe/webhook` với các sự kiện `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`; copy signing secret `whsec_...` vào `STRIPE_WEBHOOK_SECRET`. Thiếu secret này thì webhook trả 503 nhưng đơn vẫn xác nhận được qua `POST /payments/stripe/sync` ở trang kết quả.
- Kiểm tra phương thức đã bật bằng `POST /api/v1/checkout/quote` (xem `payments-setup.md` mục 4).

## 6. Cloudflare Turnstile (tùy chọn)

Mặc định tắt. Bật để chống spam form `/lien-he` (D-028):

1. Đăng nhập Cloudflare dashboard, vào mục Turnstile, tạo widget mới và thêm hostname của site (domain công khai của bạn).
2. Lấy **site key** và **secret key** từ widget (không ghi vào repo, không dán vào issue/log).
3. Đặt CẢ HAI vào `.env.production`: `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`. Chỉ đặt một trong hai thì backend không khởi động.
4. Khởi động lại backend: `docker compose --env-file .env.production -f docker-compose.prod.yml up -d backend`.

Frontend đọc site key lúc chạy từ `GET /settings/public` (trường `contactCaptcha`), không nhúng lúc build, nên bật/tắt Turnstile không cần build lại frontend. Form liên hệ lấy `contactCaptcha` mới nhất phía client nên không phải chờ trang tĩnh làm mới (mục 8). Khi bật, người dùng chặn script bên thứ ba sẽ không gửi được form (trang hướng dẫn họ dùng email cửa hàng).

## 7. Triển khai lần đầu

```bash
# 1. Lấy mã nguồn
git clone <url-repo> beanbox && cd beanbox

# 2. Cấu hình (xem mục 4)
cp .env.production.example .env.production
chmod 600 .env.production
# sửa .env.production: PUBLIC_URL, SITE_ADDRESS, secret, SMTP...

# 3. Build image (lần đầu vài phút đến hơn chục phút)
docker compose --env-file .env.production -f docker-compose.prod.yml build

# 4. Khởi động (backend tự chạy prisma migrate deploy)
docker compose --env-file .env.production -f docker-compose.prod.yml up -d

# 5. Kiểm tra: mọi service phải "healthy" (db, backend, frontend, caddy)
docker compose --env-file .env.production -f docker-compose.prod.yml ps
curl https://<domain>/api/v1/health
```

Kết quả mong đợi của bước cuối: HTTP 200 với `{"data":{"status":"ok","db":"up",...}}`. Nếu chứng chỉ chưa sẵn sàng, xem log Caddy (mục 14).

**Dữ liệu demo (tùy chọn, D-031).** Không seed thì site có cấu hình mặc định nhưng không có tài khoản, sản phẩm. Để nạp tài khoản, danh mục, sản phẩm mẫu, coupon và cài đặt:

```bash
# Đặt SEED_ADMIN_PASSWORD, SEED_STAFF_PASSWORD, SEED_CUSTOMER_PASSWORD trong .env.production
# (>= 12 ký tự, có chữ và số, khác giá trị mẫu), service `seed` tự chờ backend healthy (backend đã migrate xong) rồi mới chạy
docker compose --env-file .env.production -f docker-compose.prod.yml --profile tools run --rm seed
```

Service `seed` build từ stage `tools` của `backend/Dockerfile` và đặt `SEED_ALLOW_PRODUCTION=true`; image `runtime` không chứa công cụ seed. Dữ liệu mẫu có tài khoản `admin@beanbox.local`, `staff@beanbox.local`, `customer@beanbox.local`. Nếu mở demo công khai: dùng mật khẩu mạnh riêng khi seed, và đổi mật khẩu/khóa các tài khoản mẫu qua `/admin/nguoi-dung` khi không còn cần. Sau khi seed, có thể xóa ba biến `SEED_*` khỏi `.env.production`.

## 8. Lưu ý về trang tĩnh

Lúc build image frontend không có backend, nên các trang tĩnh đọc `GET /settings/public` (giới thiệu, liên hệ, chính sách vận chuyển, footer, banner trang chủ...) được prerender bằng cài đặt MẶC ĐỊNH, và bước build mất thêm khoảng 1-2 phút vì các lần fetch thất bại. Các trang này dùng ISR 300 giây: sau khi chạy, nội dung tự cập nhật theo cài đặt thật trong khoảng 5 phút kể từ lần truy cập đầu tiên sau mốc đó (lần truy cập đó vẫn nhận bản cũ, bản mới phục vụ từ lần sau). Việc này cũng áp dụng khi admin đổi cài đặt cửa hàng: storefront cập nhật chậm tới khoảng 5 phút (D-021).

Sau khi deploy nên mở lướt các trang chính (trang chủ, giới thiệu, liên hệ, các trang chính sách) để kích hoạt làm mới. Báo giá, đặt đơn và phí ship luôn đọc cài đặt thật từ server nên không bị ảnh hưởng.

## 9. Health và log

| Endpoint                  | Ý nghĩa                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/health`      | Readiness của backend: kiểm DB, 503 khi DB lỗi. Dùng cho healthcheck container backend                        |
| `GET /api/v1/health/live` | Liveness: không chạm DB, luôn 200 khi tiến trình sống                                                         |
| `GET /healthz`            | Liveness của frontend (không gọi backend, `Cache-Control: no-store`), dùng cho healthcheck container frontend |

Xem log:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f backend
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f caddy
```

- Backend log JSON (pino) có trường `reqId`; Caddy log JSON truy cập có `request_id`. Caddy gửi `X-Request-Id` (UUID) lên upstream và backend dùng lại nó, nên lọc cùng một giá trị ở cả hai log để lần ra một request; chỉ response từ backend (`/api/v1/*`) có header `X-Request-Id`, trang HTML và `/healthz` do Caddy trả thì không.
- Log truy cập của Caddy bỏ query string (token đặt lại mật khẩu, chữ ký VNPay nằm trong query) và không ghi cookie, `Authorization`, `X-Internal-Secret`, `Set-Cookie`.
- Docker xoay vòng log theo driver `json-file`: tối đa 10 MB x 5 file mỗi service.
- Không có metrics/APM; stack này không tự cảnh báo (D-030). Cảnh báo khi site chết làm bằng uptime monitor đặt ở NGOÀI VPS, hướng dẫn và script kiểm tra ở [mục 16](#16-giám-sát-uptime).

Lỗi do chính Caddy sinh ra ở `/api/v1/*` (vượt rate limit, body quá lớn, backend chưa sẵn sàng) trả JSON theo format lỗi chuẩn của `api-contract.md` §1: 429 `RATE_LIMITED` (giữ `Retry-After`), 413 `PAYLOAD_TOO_LARGE` ở `/api/v1/admin/uploads*` và `VALIDATION_ERROR` ở các path khác, 502/503/504 `SERVICE_UNAVAILABLE`.

## 10. Rate limit

Có hai lớp:

1. **Edge (Caddy, D-026)**, theo IP, cửa sổ 1 phút, chỉnh qua `EDGE_RATE_*`: `POST /api/v1/auth/*` mặc định 30 (zone `auth`); `/api/v1/*` mặc định 300 (zone `api`); mọi request tới frontend trừ `/_next/static/*` mặc định 600 (zone `web`, gồm SSR và `/_next/image`). Một request khớp zone `auth` cũng được tính vào zone `api`. `/uploads/*` và `/_next/static/*` không giới hạn ở edge. Vượt -> 429 kèm `Retry-After`.
2. **Backend (D-009, D-011)**, giới hạn chung mặc định 100/phút/IP (`GENERAL_RATE_LIMIT_PER_MIN`), chi tiết theo từng nhóm endpoint (đăng nhập 5/phút, đặt đơn, mã giảm giá, liên hệ 3 lần/10 phút...; xem `api-contract.md` §1). Request SSR có `X-Internal-Secret` hợp lệ được miễn rate limit chung của backend (không miễn nhóm nhạy cảm), vì vậy lớp edge là lớp chính cho lưu lượng SSR.

Bộ đếm của cả hai lớp nằm trong bộ nhớ và bị xóa khi restart (`caddy` hoặc `backend`). Vì dùng MemoryStore nên chỉ chạy MỘT instance backend (D-027); scale ngang cần store dùng chung (ví dụ Redis), ngoài phạm vi demo.

IP client: Caddy không tin `X-Forwarded-For` do client gửi (không khai báo `trusted_proxies`) và tự đặt bằng IP kết nối thật; backend chỉ tin hop trong mạng Docker (`TRUST_PROXY=uniquelocal`). Đổi hành vi này (Cloudflare) xem mục 3.

## 11. Backup và restore

Cơ chế (D-034, M8): `pg_dump -Fc` và nén thư mục uploads thành `tar.gz`, xoay vòng cục bộ theo `BACKUP_RETENTION_DAYS` (mặc định 7). Tùy chọn đẩy bản sao MÃ HÓA lên object storage (off-site, rclone + age, xem phần "Backup off-site" bên dưới). Backup lỗi thì script thoát mã khác 0 và không để file dở. File backup được tạo với quyền chỉ chủ sở hữu đọc (umask 077; chủ sở hữu là root vì container chạy root, nên đọc/sao chép bằng `sudo`).

Mã thoát của `backup.sh`: `0` thành công; `2` biến cấu hình không hợp lệ (số nguyên sai...); `3` đẩy off-site hoặc kiểm toàn vẹn thất bại; `4` cấu hình off-site sai (thiếu/sai recipient age, image không có rclone/age); `5` đã có một backup khác đang chạy (khóa `flock`, bên dưới) nên lần này bị bỏ qua. Với mã 3 và 4 bản backup cục bộ VẪN được tạo và giữ. Mã 5 không tạo dump nào và KHÔNG gọi heartbeat (cả ok lẫn fail), vì lần chạy đang giữ khóa sẽ tự báo kết quả của nó.

**Khóa chống chạy chồng (D-042).** `backup.sh` lấy khóa `flock -n` trên `$BACKUP_DIR/.backup.lock` (tức `backups/.backup.lock` trên host) trước khi `pg_dump`, nên vòng lặp của service `backup`, cron và `docker compose run --rm backup ...` chạy đồng thời sẽ không tạo hai bản chồng nhau: bên đến sau in "đã có backup khác đang chạy, bỏ qua lần này" rồi thoát mã 5. `loop.sh` coi mã 5 là thông tin (không ghi "LỖI") và tiếp tục chu kỳ. Khóa chỉ có hiệu lực giữa các tiến trình/container dùng chung thư mục `backups/` trên CÙNG một host Linux; `restore.sh` không lấy khóa (đừng restore khi backup đang chạy). Không có lệnh `flock` (chạy ngoài image) thì script cảnh báo và chạy không khóa.

Image của service `backup` build từ `deploy/backup/Dockerfile` (cùng postgres:17 với DB, thêm rclone, age, curl). `... --profile backup up -d backup` hoặc `run` tự build lần đầu; build tay: `docker compose --env-file .env.production -f docker-compose.prod.yml --profile backup build backup`. rclone được GHIM (D-041): Dockerfile tải zip chính thức từ `downloads.rclone.org` (hiện là v1.76.0) và kiểm `sha256sum -c` với checksum ghi cứng trong Dockerfile (amd64, arm64; kiến trúc khác thì build lỗi). age vẫn cài từ apt của Debian 13 (trixie), không ghim (khi kiểm thử: age 1.2.1). **Nâng rclone:** lấy `SHA256SUMS` của bản mới ở `https://downloads.rclone.org/v<phiên bản>/SHA256SUMS`, kiểm chữ ký GPG của file đó (`gpg --verify SHA256SUMS`, khóa công khai của rclone theo `https://rclone.org/release_signing/`), đổi `RCLONE_VERSION` và hai checksum `RCLONE_SHA256_AMD64`/`RCLONE_SHA256_ARM64` trong `deploy/backup/Dockerfile`, build lại rồi chạy `selftest-offsite.sh` (bên dưới); selftest cũng chạy trong CI. Vì age không ghim, build lại image vẫn có thể đổi bản age.

**Bật service backup** (chạy ngay lúc `up`, sau đó lặp mỗi `BACKUP_INTERVAL_SECONDS`, mặc định 24 giờ):

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml --profile backup up -d backup
```

**Hoặc dùng cron của VPS** (không bật service `backup`), ví dụ chạy 03:00 mỗi ngày; đường dẫn repo thay cho phù hợp:

```
0 3 * * * cd /home/<user>/beanbox && docker compose --env-file .env.production -f docker-compose.prod.yml --profile backup run --rm --entrypoint sh backup /deploy/backup/backup.sh >> /home/<user>/beanbox/backups/cron.log 2>&1
```

Vị trí file (trên host, thư mục `./backups` ở gốc repo):

- `backups/db/beanbox-<YYYYMMDDTHHMMSSZ>.dump` (định dạng custom của `pg_dump`)
- `backups/uploads/uploads-<YYYYMMDDTHHMMSSZ>.tar.gz`

Backup cục bộ nằm CÙNG máy với DB nên không chống được mất VPS: hãy bật off-site (bên dưới) hoặc tự sao chép ra ngoài, ví dụ `rsync -a user@vps:/home/<user>/beanbox/backups/ ./beanbox-backups/` từ máy khác. Lưu ý backup cũ (cả cục bộ lẫn off-site) còn chứa dữ liệu đã bị job dọn dẹp xóa (D-029) cho tới khi xoay vòng hết. Thư mục `backups/restore/` (bản tải về để khôi phục, đã giải mã) không bị xoay vòng tự động: xóa tay sau khi khôi phục xong.

**Restore (ghi đè dữ liệu hiện tại).** Thay `<TS>` bằng dấu thời gian của file muốn khôi phục:

```bash
# 1. Dừng backend để không ghi vào DB trong lúc restore (frontend/caddy có thể để chạy)
docker compose --env-file .env.production -f docker-compose.prod.yml stop backend

# 2. Khôi phục DB (restore.sh bắt buộc cờ --yes; DB đích là biến POSTGRES_DB, mặc định beanbox)
docker compose --env-file .env.production -f docker-compose.prod.yml --profile backup run --rm --entrypoint sh backup \
  /deploy/backup/restore.sh --yes /backups/db/beanbox-<TS>.dump beanbox

# 3. Khôi phục uploads (service backup gắn uploads ở chế độ chỉ đọc nên giải nén qua container backend;
#    chạy bằng root vì file backup có quyền 0600 của root, rồi trả quyền sở hữu cho user `node`)
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm --no-deps --user root \
  -v "$PWD/backups:/backups:ro" --entrypoint sh backend \
  -c 'tar -xzf /backups/uploads/uploads-<TS>.tar.gz -C /app/uploads && chown -R node:node /app/uploads'

# 4. Khởi động lại
docker compose --env-file .env.production -f docker-compose.prod.yml up -d backend
```

Ghi chú: ở bước 2, đổi `beanbox` thành giá trị `POSTGRES_DB` nếu bạn đặt tên khác. `pg_restore` chạy với `--clean --if-exists --no-owner --exit-on-error` nên xóa và tạo lại đối tượng trong DB đích; `tar` chỉ ghi đè/bổ sung file, không xóa ảnh upload mới hơn bản backup.

**Thử restore định kỳ vào DB tạm** (không đụng DB đang chạy; nên làm ít nhất mỗi lần đổi quy trình và theo lịch):

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml --profile backup run --rm --entrypoint sh backup -c '
  createdb beanbox_restore_test &&
  sh /deploy/backup/restore.sh --yes /backups/db/beanbox-<TS>.dump beanbox_restore_test &&
  psql -d beanbox_restore_test -c "\dt" &&
  dropdb beanbox_restore_test'
```

Lệnh sẽ in danh sách bảng của DB tạm rồi xóa DB đó. Nếu `restore.sh` lỗi, DB tạm vẫn còn: chạy `dropdb beanbox_restore_test` thủ công.

### Backup off-site (rclone + age)

Sau khi backup cục bộ xong, nếu `BACKUP_REMOTE` khác rỗng thì `backup.sh`: (1) mã hóa từng file bằng age (khóa công khai) thành `beanbox-<TS>.dump.age`, `uploads-<TS>.tar.gz.age` trong thư mục tạm; (2) tạo `SHA256SUMS`; (3) `rclone copy` lên `<BACKUP_REMOTE>/<TS>/`; (4) `rclone check --one-way` để kiểm file trên remote khớp bản vừa mã hóa; (5) xoay vòng remote. Mặc định TẮT: không đặt `BACKUP_REMOTE` thì hành vi y như trước (không gọi rclone). VPS chỉ giữ khóa CÔNG KHAI của age nên kẻ chiếm được VPS hoặc nhà cung cấp storage không đọc được nội dung backup đã đẩy; khóa bí mật do bạn giữ offline.

Cấu hình nằm trong `.env.backup` (mẫu `.env.backup.example` có ví dụ AWS S3, Backblaze B2 qua S3-compatible, Cloudflare R2):

| Biến                                                | Mặc định    | Ý nghĩa                                                                                                                                                                                                     |
| --------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BACKUP_REMOTE`                                     | trống (tắt) | `<tên-remote>:<bucket>/<thư-mục>`, ví dụ `offsite:beanbox-backups/prod`                                                                                                                                     |
| `RCLONE_CONFIG_<TÊN>_*`                             |             | Khai báo remote rclone bằng env (`..._TYPE=s3`, `..._PROVIDER`, `..._ACCESS_KEY_ID`, `..._SECRET_ACCESS_KEY`, `..._ENDPOINT`, `..._NO_CHECK_BUCKET=true`...). `<TÊN>` khớp tên remote trong `BACKUP_REMOTE` |
| `BACKUP_AGE_RECIPIENTS`                             |             | Một hoặc nhiều public key `age1...`, cách nhau dấu phẩy/khoảng trắng                                                                                                                                        |
| `BACKUP_AGE_RECIPIENTS_FILE`                        |             | Thay thế/bổ sung: file recipient (mỗi dòng một khóa, `#` là chú thích), đường dẫn trong container                                                                                                           |
| `BACKUP_REMOTE_ENCRYPTION`                          | `age`       | `none` chỉ khi remote đã mã hóa ở lớp khác (ví dụ rclone crypt). Với `age` mà không có recipient hợp lệ thì từ chối đẩy (thoát 4), không bao giờ đẩy bản thô                                                |
| `BACKUP_REMOTE_VERIFY`                              | `hash`      | `hash`: so hash/kích thước backend lưu (rẻ; một số backend/đối tượng lớn có thể chỉ so kích thước, rclone sẽ cảnh báo). `download`: tải về so nội dung thật (tốn băng thông, chắc chắn hơn)                 |
| `BACKUP_REMOTE_RETENTION_DAYS`                      | `30`        | Xóa thư mục `<TS>` cũ hơn N ngày, tính theo TÊN thư mục (không dựa modtime)                                                                                                                                 |
| `BACKUP_REMOTE_MIN_KEEP`                            | `3`         | Luôn giữ ít nhất N bản mới nhất kể cả khi quá hạn (phòng đồng hồ sai hoặc backup ngừng lâu); >= 1                                                                                                           |
| `BACKUP_HEARTBEAT_URL`, `BACKUP_HEARTBEAT_FAIL_URL` | trống       | URL heartbeat gọi khi toàn bộ backup (gồm off-site nếu bật) thành công / thất bại (mục 16). URL chứa token nên không bao giờ được ghi vào log                                                               |

Xoay vòng remote chỉ xóa (bằng `rclone purge`) thư mục có tên đúng mẫu `YYYYMMDDTHHMMSSZ/`; thư mục hay file lạ trên remote không bị đụng. Lỗi xoay vòng chỉ cảnh báo, không làm backup thất bại.

**Thiết lập:**

1. Tạo bucket riêng cho backup. Tạo access key CHỈ có quyền trên đúng bucket đó (B2: Application Key giới hạn theo bucket; R2: API token theo bucket với quyền đọc/ghi object; AWS: IAM user/policy chỉ cho bucket). Khuyến nghị bật thêm lớp chống xóa nếu nhà cung cấp hỗ trợ (versioning, object lock/retention) để kẻ chiếm VPS không xóa sạch bản off-site. Lưu ý xoay vòng của script cần quyền xóa nên key trên VPS xóa được; lớp versioning/lock phía bucket mới là chỗ cứu bạn (tính năng và cách bật khác nhau theo nhà cung cấp, xem tài liệu của họ).
2. Sinh cặp khóa age trên MÁY CỦA BẠN (không phải VPS). Nếu chưa có `age-keygen`, dùng image backup:

   ```bash
   docker run --rm -v "$PWD:/k" --entrypoint age-keygen beanbox-backup:local -o /k/beanbox-age.key
   # In ra dòng "Public key: age1..." (lấy lại sau này: age-keygen -y beanbox-age.key)
   ```

   Giữ file `beanbox-age.key` (khóa bí mật) OFFLINE ở ít nhất hai nơi độc lập (ví dụ trình quản lý mật khẩu và USB cất kỹ). MẤT khóa bí mật = không giải mã được bất kỳ bản off-site nào. Chỉ dán public key (`age1...`) vào `.env.backup`. Muốn đổi khóa: thêm public key mới vào `BACKUP_AGE_RECIPIENTS` (cách nhau dấu phẩy) cho các bản mới; bản cũ vẫn cần khóa cũ để giải mã.

3. Tạo `.env.backup` từ mẫu, điền remote và recipient, rồi `chmod 600 .env.backup`.
4. Chạy thử một vòng và kiểm remote có thư mục `<TS>/` gồm hai file `.age` và `SHA256SUMS`:

   ```bash
   docker compose --env-file .env.production -f docker-compose.prod.yml --profile backup run --rm --entrypoint sh backup /deploy/backup/backup.sh
   docker compose --env-file .env.production -f docker-compose.prod.yml --profile backup run --rm --no-deps --entrypoint sh backup /deploy/backup/fetch-remote.sh --list
   ```

5. (Tùy chọn) Tự kiểm toàn bộ luồng bằng remote giả cục bộ, không đụng remote thật: `docker compose ... --profile backup run --rm --entrypoint sh backup /deploy/backup/selftest-offsite.sh`. Script in PASS/FAIL từng mục (upload đủ file, giải mã khớp bản cục bộ, sửa 1 byte thì checksum bắt được, xoay vòng giữ tối thiểu `MIN_KEEP` và không đụng thư mục lạ, thiếu recipient bị từ chối, tắt off-site thì không gọi rclone, heartbeat, khóa chống chạy chồng: thoát 5, không dump, không heartbeat) và thoát khác 0 nếu có FAIL. Cần service `db` (tự khởi động).
6. Bật service `backup` hoặc cron như ở trên; thêm heartbeat (mục 16) để biết khi backup ngừng chạy.

**Khôi phục từ remote:**

```bash
# 1. Liệt kê các bản trên remote (mới nhất trước). --no-deps: chỉ tải, chưa cần DB
docker compose --env-file .env.production -f docker-compose.prod.yml --profile backup run --rm --no-deps --entrypoint sh backup /deploy/backup/fetch-remote.sh --list

# 2. Tải, kiểm SHA256SUMS, giải mã. Mount khóa bí mật chỉ đọc (đưa file khóa lên VPS tạm, tốt nhất vào /dev/shm,
#    và xóa ngay sau khi xong). Thay <TS> bằng giá trị ở bước 1 hoặc dùng `latest`
docker compose --env-file .env.production -f docker-compose.prod.yml --profile backup run --rm --no-deps \
  -v /dev/shm/beanbox-age.key:/run/secrets/age-identity:ro --entrypoint sh backup /deploy/backup/fetch-remote.sh <TS>
```

Kết quả ở `./backups/restore/<TS>/` (host) gồm `beanbox-<TS>.dump` và `uploads-<TS>.tar.gz`, quyền 0600. Nếu `sha256sum -c` báo sai, script dừng (thoát 3) và KHÔNG giải mã: thử bản khác. Script không tự restore; làm tiếp đúng như phần "Restore" ở trên, chỉ khác đường dẫn file:

- DB: `... run --rm --entrypoint sh backup /deploy/backup/restore.sh --yes /backups/restore/<TS>/beanbox-<TS>.dump beanbox` (sau khi `stop backend`);
- uploads: lệnh `tar` qua container backend như bước 3 ở trên, với `/backups/restore/<TS>/uploads-<TS>.tar.gz`;
- xong thì `sudo rm -rf backups/restore/<TS>` (đang chứa bản đã giải mã) và xóa file khóa bí mật khỏi VPS.

Mất cả VPS: trên máy mới chỉ cần clone repo, tạo `.env.backup` chỉ có `BACKUP_REMOTE` và `RCLONE_CONFIG_*`, một file env tạm cho các biến bắt buộc của compose (`POSTGRES_*`, `PUBLIC_URL`...), chạy bước 1-2 rồi dựng lại stack (mục 7) và restore. Bản không mã hóa (`BACKUP_REMOTE_ENCRYPTION=none`) được tự nhận ra và bỏ qua bước giải mã.

**Thử khôi phục định kỳ:** ít nhất mỗi tháng và mỗi khi đổi cấu hình/phiên bản image backup, chạy `fetch-remote.sh latest` rồi thử restore vào DB tạm `beanbox_restore_test` như ở trên (dùng file trong `/backups/restore/<TS>/`). Backup chưa từng được thử khôi phục thì chưa thể coi là có backup.

## 12. Cập nhật phiên bản và rollback

**Cập nhật:**

```bash
# 1. Backup trước (migration không tự rollback)
docker compose --env-file .env.production -f docker-compose.prod.yml --profile backup run --rm --entrypoint sh backup /deploy/backup/backup.sh

# 2. Lấy mã mới, build, khởi động lại
git pull
docker compose --env-file .env.production -f docker-compose.prod.yml build
docker compose --env-file .env.production -f docker-compose.prod.yml up -d

# 3. Kiểm tra
docker compose --env-file .env.production -f docker-compose.prod.yml ps
curl https://<domain>/api/v1/health
```

Migration DB tự chạy (`prisma migrate deploy`) mỗi khi backend khởi động. Đổi `PUBLIC_URL`/domain thì phải build lại image frontend (`NEXT_PUBLIC_SITE_URL` nhúng lúc build). Backend nhận env mới khi container được tạo lại (`up -d`).

**Rollback:** checkout tag hoặc commit cũ rồi build lại và `up -d`:

```bash
git checkout <tag-hoặc-commit-cũ>
docker compose --env-file .env.production -f docker-compose.prod.yml build
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
```

Migration KHÔNG tự rollback. Nếu phiên bản mới đã áp migration làm đổi/phá cấu trúc dữ liệu mà phiên bản cũ không đọc được, hãy khôi phục backup trước khi cập nhật (mục 11) rồi chạy phiên bản cũ. Khuyến nghị gắn tag git cho mỗi lần deploy (`git tag deploy-YYYYMMDD && git push --tags`) để biết chính xác phiên bản đang chạy và quay lại được. Không có rollback tự động hay blue/green (D-025); mỗi lần `up -d` có khoảng ngắn dịch vụ khởi động lại.

## 13. Checklist go-live

- [ ] DNS A/AAAA trỏ đúng VPS, `dig +short <domain>` trả về IP VPS
- [ ] HTTPS hợp lệ (`curl -I https://<domain>` không báo lỗi chứng chỉ; http chuyển sang https)
- [ ] Mọi secret là chuỗi ngẫu nhiên riêng (không bắt đầu `dev-`), `.env.production` chỉ chủ sở hữu đọc (`chmod 600`), không commit
- [ ] `COOKIE_SECURE=true`; đăng nhập xong cookie `bb_rt` có cờ `Secure`
- [ ] `PUBLIC_URL` = `SITE_ADDRESS` (cùng domain, có `https://`) và image frontend được build sau khi đặt giá trị này
- [ ] SMTP thật đã gửi thử (đặt lại mật khẩu hoặc xác nhận đơn, kiểm hộp thư/spam)
- [ ] Khóa thanh toán là khóa sandbox/test (VNPay sandbox, Stripe `sk_test_`)
- [ ] URL IPN VNPay và webhook Stripe đã cấu hình và thử một đơn thanh toán
- [ ] Turnstile (nếu dùng): cả hai khóa đã đặt, form `/lien-he` hiển thị widget và gửi được
- [ ] Đã seed hoặc tạo dữ liệu; mật khẩu admin/staff/customer mẫu đã đổi hoặc tài khoản mẫu đã khóa nếu demo công khai
- [ ] Backup chạy (có file trong `backups/`) và đã thử restore vào DB tạm thành công
- [ ] Off-site bật (`.env.backup` chmod 600, access key giới hạn theo bucket), khóa bí mật age cất offline ở >= 2 nơi, đã thử `fetch-remote.sh latest` + giải mã + restore vào DB tạm; `selftest-offsite.sh` toàn PASS
- [ ] Uptime monitor ở ngoài VPS đã cấu hình (health, trang chủ, TLS < 14 ngày, heartbeat backup) và đã thử nhận cảnh báo (mục 16)
- [ ] Firewall chỉ mở 22/80/443; `docker compose ... ps` không thấy cổng 4000/5432 publish ra host
- [ ] Header bảo mật: `curl -I https://<domain>` có `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`, và đúng một header `Content-Security-Policy` (thực thi; `/admin` có nonce khác nhau mỗi request; không còn report-only); không có header `Server`
- [ ] Rate limit edge hoạt động (mục 15 và `testing.md`: nhiều request liên tiếp tới `/api/v1/health/live` ra 429 kèm `Retry-After`)
- [ ] Log đọc được (`logs -f backend`, `logs -f caddy`), lọc được theo `request_id`/`reqId`
- [ ] CI xanh ở commit/tag sắp deploy (backend, frontend, e2e, secret-scan, docker)
- [ ] Đã mở lướt các trang tĩnh để làm mới ISR (mục 8)

## 14. Sự cố thường gặp

| Triệu chứng                                                  | Nguyên nhân thường gặp                                                                                        | Cách xử lý                                                                                                                                                    |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Container `backend` thoát/khởi động lại liên tục             | Env không hợp lệ (secret `dev-`, thiếu `INTERNAL_API_SECRET`, chỉ một khóa Turnstile, `sk_live_`)             | `docker compose ... logs backend` đọc dòng "Cấu hình môi trường không hợp lệ", sửa `.env.production`, `up -d backend`                                         |
| `docker compose` báo "Đặt ... trong .env.production"         | Thiếu biến bắt buộc, hoặc quên `--env-file .env.production`                                                   | Điền biến, luôn truyền `--env-file`                                                                                                                           |
| Caddy không xin được chứng chỉ                               | DNS chưa trỏ đúng, cổng 80/443 bị firewall/nhà cung cấp chặn, `SITE_ADDRESS` sai, vượt giới hạn Let's Encrypt | `logs caddy` xem lỗi ACME; kiểm DNS và cổng; chờ rồi `up -d caddy`; không bấm khởi động lại liên tục                                                          |
| 429 hàng loạt khi dùng Cloudflare proxy                      | Caddy thấy mọi kết nối cùng IP Cloudflare                                                                     | Bật `trusted_proxies` + `CF-Connecting-IP` (mục 3) hoặc tắt proxy (đám mây xám)                                                                               |
| 502/503 ngay sau khi `up -d`                                 | Backend chưa `healthy` (đang migrate/khởi động) hoặc đã dừng vì env                                           | `ps` xem trạng thái, `logs backend`; chờ healthy. Với `/api/v1/*`, phản hồi lỗi từ Caddy là JSON `SERVICE_UNAVAILABLE`                                        |
| Script `.sh` lỗi `\r: command not found` hoặc `no such file` | File bị chuyển CRLF khi checkout trên Windows                                                                 | `.gitattributes` ép `*.sh`, `Caddyfile`, `Dockerfile` về LF; checkout lại (`git add --renormalize .` rồi checkout) hoặc `sed -i 's/\r$//' deploy/backup/*.sh` |
| Đăng nhập xong vẫn như chưa đăng nhập, cookie không lưu      | Truy cập qua HTTP thuần trong khi `COOKIE_SECURE=true` (cookie `Secure` chỉ lưu qua HTTPS)                    | Truy cập bằng HTTPS (kể cả chứng chỉ tự ký, mục 15). `COOKIE_SECURE=false` không dùng được ở production (backend không khởi động, D-045)                                                          |
| Link trong email trỏ sai domain                              | `PUBLIC_URL` sai lúc khởi động backend                                                                        | Sửa `PUBLIC_URL`, `up -d` lại; build lại frontend nếu đổi domain                                                                                              |
| Trang tĩnh còn hiện cài đặt mặc định                         | ISR chưa làm mới sau build                                                                                    | Mở lại trang sau vài phút (mục 8)                                                                                                                             |
| Form liên hệ trả 429                                         | Giới hạn 3 lần/10 phút/IP                                                                                     | Chờ hoặc restart backend (xóa bộ đếm) khi thử                                                                                                                 |
| Backup lỗi quyền hoặc không thấy file                        | Thư mục `backups/` thuộc root                                                                                 | Đọc bằng `sudo`, hoặc `sudo chown` theo nhu cầu sao chép                                                                                                      |
| `backup.sh` thoát mã 4, log "thiếu/sai recipient age"        | Đặt `BACKUP_REMOTE` mà thiếu `BACKUP_AGE_RECIPIENTS`/`_FILE`, hoặc recipient không phải `age1...`             | Điền public key (mục 11). Chỉ đặt `BACKUP_REMOTE_ENCRYPTION=none` khi remote đã được mã hóa ở lớp khác. Backup cục bộ vẫn có                                  |
| `backup.sh` thoát mã 4, log "image không có rclone"          | Service `backup` còn dùng image `postgres:17` cũ                                                              | Build lại: `... --profile backup build backup` rồi `up -d backup`                                                                                             |
| `backup.sh` thoát mã 5, log "đã có backup khác đang chạy"    | Một backup khác (vòng lặp của service `backup`, cron hoặc `run` tay) đang giữ `backups/.backup.lock`          | Bình thường, không phải lỗi, không tạo dump và không gọi heartbeat. Nếu lặp mãi, kiểm tiến trình backup treo: `docker ps`, `docker compose ... logs backup`   |
| `backup.sh` thoát mã 3 (rclone copy/check lỗi)               | Sai/hết hạn access key, sai endpoint/bucket, mất mạng, hết dung lượng bucket                                  | Đọc log (không chứa secret); sửa `.env.backup` rồi chạy tay `backup.sh` lại. Backup cục bộ vẫn có. Heartbeat báo lỗi nếu đã cấu hình                          |
| `fetch-remote.sh` thoát 3                                    | `sha256sum -c` sai: file trên remote hỏng hoặc bị sửa                                                         | Không dùng bản đó; `--list` rồi thử bản trước                                                                                                                 |
| `fetch-remote.sh` thoát 4 hoặc "giải mã thất bại"            | Chưa mount khóa bí mật ở `/run/secrets/age-identity`, hoặc khóa không khớp recipient lúc backup               | Mount đúng file khóa (mục 11); bản tạo trước khi đổi recipient cần khóa cũ                                                                                    |
| `docker compose` báo lỗi ở `env_file` / `required`           | Docker Compose cũ (< 2.24) không hiểu `required: false`                                                       | Nâng Docker Compose, hoặc tạo file `.env.backup` rỗng                                                                                                         |

## 15. Chạy thử cục bộ bằng Docker

Thử bản production trên máy dev mà không đụng project dev (`docker-compose.yml`): dùng tên project riêng bằng `-p` (ghi đè `name:` của file prod nên volume và container tách hẳn) và cổng host khác.

```bash
cp .env.production.example .env.production   # nếu chưa có; KHÔNG dùng lại file production thật
# Sửa .env.production cho thử cục bộ:
#   PUBLIC_URL=https://localhost:8443
#   SITE_ADDRESS=localhost
#   HTTP_PORT=8080
#   HTTPS_PORT=8443
#   POSTGRES_PASSWORD, JWT_ACCESS_SECRET, INTERNAL_API_SECRET: sinh bằng openssl rand -hex
#   (tùy chọn) EDGE_RATE_API_PER_MIN=20 để thử nhanh rate limit edge

docker compose -p beanbox-local --env-file .env.production -f docker-compose.prod.yml build
docker compose -p beanbox-local --env-file .env.production -f docker-compose.prod.yml up -d
docker compose -p beanbox-local --env-file .env.production -f docker-compose.prod.yml ps
curl -k https://localhost:8443/api/v1/health
sh deploy/monitoring/check.sh --insecure --min-tls-days 0 https://localhost:8443   # kiểm tra giống monitor ngoài (mục 16)
```

Ghi chú:

- Container `caddy` chạy user `caddy` (uid 100), không phải root; healthcheck gọi admin API của Caddy ở `127.0.0.1:2019` bên trong container (không publish ra ngoài). Với `SITE_ADDRESS=localhost`, log có dòng `failed to install root certificate` vì user thường không ghi được kho tin cậy của container; vô hại, chỉ ảnh hưởng CA nội bộ khi thử cục bộ.
- Nâng cấp từ bản Caddy chạy root: volume `caddy_data`/`caddy_config` cũ có thể thuộc root. Nếu log Caddy báo `permission denied` khi ghi `/data` hoặc `/config`, chown một lần: `docker compose --env-file .env.production -f docker-compose.prod.yml run --rm --no-deps --user root --entrypoint chown caddy -R caddy:caddy /data /config`.
- `SITE_ADDRESS=localhost` làm Caddy dùng CA nội bộ nên trình duyệt báo chứng chỉ không tin cậy và `curl` cần `-k`.
- `HTTP_PORT`/`HTTPS_PORT` được truyền vào container và host map cùng số cổng (`8080:8080`, `8443:8443`), Caddyfile ghi cổng HTTPS vào địa chỉ site, nên `curl -sI http://localhost:8080/` trả 308 với `Location: https://localhost:8443/` và vào `http://localhost:8080` trong trình duyệt chuyển đúng sang 8443 (đã sửa lỗi M7 redirect bỏ mất cổng; lưu ý `https_port` của Caddy là cổng nội bộ nên không dùng cho việc này). Cổng khác 80/443 chỉ để thử cục bộ vì Let's Encrypt chỉ kiểm tra 80/443; ở production giữ mặc định. Đổi cổng thì chạy lại `up -d` để tạo lại container `caddy`.
- Trên Git Bash của Windows, đường dẫn bắt đầu bằng `/` trong tham số lệnh (ví dụ `/deploy/backup/backup.sh`) bị chuyển đổi nhầm. Đặt `MSYS_NO_PATHCONV=1` trước lệnh: `MSYS_NO_PATHCONV=1 docker compose -p beanbox-local ... run --rm --entrypoint sh backup /deploy/backup/backup.sh`.
- Dọn dẹp: `docker compose -p beanbox-local --env-file .env.production -f docker-compose.prod.yml down -v` (cờ `-v` xóa cả volume của project thử).
- Các bước smoke test đầy đủ (health, header, rate limit edge, XFF giả, backup/restore) nằm ở [`testing.md`](testing.md).

## 16. Giám sát uptime

Quyết định (M8): chỉ có tài liệu và script kiểm, KHÔNG thêm công cụ giám sát vào `docker-compose.prod.yml`. Monitor chạy cùng VPS không phát hiện được chính VPS hoặc mạng của nó chết (sự cố phổ biến nhất), và thêm một giao diện web nữa phải bảo vệ/publish. Hãy dùng dịch vụ monitor bên ngoài (UptimeRobot, Better Stack, ...) hoặc tự chạy Uptime Kuma trên MÁY KHÁC (máy nhà, VPS khác), ví dụ `docker run -d --restart=always -p 127.0.0.1:3001:3001 -v uptime-kuma:/app/data louislam/uptime-kuma:<tag>` (chọn `<tag>` theo hướng dẫn trên trang chính thức của Uptime Kuma; chỉ truy cập giao diện qua localhost/tunnel/reverse proxy HTTPS, đặt mật khẩu mạnh, đừng mở cổng 3001 ra internet khi chưa bảo vệ).

Cách đặt cấu hình dưới đây dùng được cho cả ba dịch vụ; tên trường khác nhau chút theo giao diện. Hạn mức (số monitor, chu kỳ tối thiểu, kênh cảnh báo, theo dõi chứng chỉ) tùy gói của từng dịch vụ, hãy kiểm tra trước khi chọn.

| #   | Monitor         | Loại                  | Cấu hình                                                                                                                                         |
| --- | --------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Chính: API + DB | HTTP(S) keyword       | URL `https://<domain>/api/v1/health`; kỳ vọng HTTP 200 VÀ body chứa `"db":"up"`; chu kỳ 1-5 phút; timeout 10 giây; báo sau 2-3 lần lỗi liên tiếp |
| 2   | Trang chủ       | HTTP(S) keyword       | URL `https://<domain>/`; kỳ vọng 200 VÀ HTML chứa `BeanBox` (tên cửa hàng trong `<title>`); cùng chu kỳ/timeout/số lần lỗi như trên              |
| 3   | Chứng chỉ TLS   | SSL/chứng chỉ hết hạn | Host `<domain>` cổng 443; cảnh báo khi còn < 14 ngày                                                                                             |
| 4   | Backup          | Heartbeat/Push        | Chu kỳ kỳ vọng 24 giờ + ân hạn vài giờ (xem bên dưới)                                                                                            |

Chi tiết:

- **Monitor 1** là cảnh báo chính. Response thật của backend có dạng `{"data":{"status":"ok","db":"up","version":"...","uptimeSec":...,"time":"..."}}` (JSON gọn, không có dấu cách), nên keyword đúng là `"db":"up"` kèm cả dấu nháy kép. Khi DB lỗi endpoint trả 503 nên monitor báo ngay. Chỉ cảnh báo sau 2-3 lần lỗi liên tiếp để không báo nhầm lúc `up -d`/restart (backend mất vài chục giây để migrate và healthy). Kênh nhận: email là tối thiểu, thêm Telegram/Slack nếu muốn.
- Không dùng `/api/v1/health/live` làm cảnh báo chính vì nó không kiểm DB (luôn 200 khi tiến trình sống). Có thể thêm làm monitor phụ để phân biệt "backend chết" với "chỉ DB lỗi".
- **Monitor 2** bắt trường hợp Caddy hoặc frontend lỗi trong khi API vẫn sống. Từ khóa `BeanBox` ổn định vì là tên cửa hàng ở `<title>`; đừng dùng nội dung hay đổi (banner, sản phẩm).
- **Monitor 3**: Caddy tự gia hạn chứng chỉ khi còn khoảng 30 ngày; còn < 14 ngày nghĩa là gia hạn đang lỗi (thường do DNS hoặc cổng 80/443 bị chặn, xem mục 14) nhưng vẫn còn thời gian xử lý. Nếu dịch vụ không hỗ trợ theo dõi chứng chỉ thì dùng `deploy/monitoring/check.sh` bằng cron (bên dưới).
- **Monitor 4 (backup)**: đặt `BACKUP_HEARTBEAT_URL` (URL push/heartbeat của dịch vụ) trong `.env.backup`; service `backup` gọi bằng `GET` (curl, timeout 10 giây, thử lại 3 lần) khi TOÀN BỘ backup, gồm off-site nếu bật, thành công. Đặt chu kỳ kỳ vọng 24 giờ (khớp `BACKUP_INTERVAL_SECONDS=86400`, đổi chu kỳ thì đổi theo) cộng ân hạn vài giờ (backup có thể lâu hơn khi dữ liệu lớn). Tùy chọn `BACKUP_HEARTBEAT_FAIL_URL` để dịch vụ báo lỗi ngay khi backup thất bại thay vì chờ hết ân hạn (nhiều dịch vụ có URL riêng cho tín hiệu lỗi, ví dụ hậu tố `/fail` hoặc `?status=down`; xem tài liệu của dịch vụ). URL chứa token nên chỉ để trong `.env.backup` (chmod 600); script không ghi nó vào log, và lỗi gọi heartbeat chỉ in cảnh báo, không làm backup thất bại.

Lưu ý vận hành:

- Rate limit edge (mục 10): một monitor gọi 1 request/phút so với ngưỡng 300/phút (API) và 600/phút (web) là không đáng kể. `/api/v1/health` được miễn rate limit chung của backend.
- Nếu đặt Cloudflare proxy (đám mây cam), monitor tới site thấy chứng chỉ của Cloudflare chứ không phải của Caddy nên monitor 3 không phản ánh việc gia hạn của Caddy; khi origin chết Cloudflare trả lỗi 5xx nên monitor 1-2 vẫn báo được. Xem thêm mục 3.
- Bảo trì/deploy dự kiến (mục 12): tạm dừng (pause) monitor hoặc đặt maintenance window trong dịch vụ monitor, bật lại khi `ps` cho thấy mọi service healthy.
- Thử cảnh báo: sau khi cấu hình, `docker compose ... stop backend`, chờ nhận cảnh báo, rồi `up -d backend`.

**Script kiểm tay hoặc chạy cron từ máy khác:** `deploy/monitoring/check.sh` chỉ cần `curl` và `openssl`.

```bash
sh deploy/monitoring/check.sh https://<domain>
sh deploy/monitoring/check.sh --min-tls-days 21 --home-keyword BeanBox https://<domain>
sh deploy/monitoring/check.sh --insecure --min-tls-days 0 https://localhost:8443   # thử cục bộ với CA nội bộ của Caddy
```

Script kiểm (1) `GET /api/v1/health` = 200 và có `"db":"up"`, (2) `GET /` = 200 và có từ khóa, (3) chứng chỉ TLS còn >= `--min-tls-days` ngày (mặc định 14; kết nối trực tiếp tới host:cổng trong URL bằng `openssl s_client`, có kiểm chuỗi tin cậy và tên host trừ khi dùng `--insecure`). In `OK`/`FAIL` từng mục, thoát 0 nếu tất cả OK, 1 nếu có FAIL, 2 nếu sai cách dùng. Script không thử lại: một lần FAIL có thể chỉ là lúc đang deploy, nên dùng nó để kiểm sau deploy hoặc smoke test; cảnh báo "sau N lần lỗi" để dịch vụ monitor lo. Ví dụ cron ở máy khác (5 phút một lần, gửi thư qua `mail` khi có lỗi):

```
*/5 * * * * sh /path/to/check.sh https://<domain> > /tmp/bb-check.log 2>&1 || mail -s "BeanBox check FAIL" you@example.com < /tmp/bb-check.log
```
