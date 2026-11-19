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

| Service | Vai trò | Publish cổng ra host |
|---|---|---|
| `caddy` | Reverse proxy, TLS, rate limit edge | `${HTTP_PORT:-80}`, `${HTTPS_PORT:-443}` (TCP và UDP cho HTTP/3). DUY NHẤT |
| `frontend` | Next.js (standalone) | Không (chỉ `3000` trong mạng Docker) |
| `backend` | Express API, chạy `prisma migrate deploy` rồi `node dist/server.js` | Không (chỉ `4000` trong mạng Docker) |
| `db` | PostgreSQL 17, volume `pgdata` | Không |
| `backup` (profile `backup`) | Sao lưu định kỳ | Không |
| `seed` (profile `tools`) | Chạy một lần để nạp dữ liệu demo | Không |

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

| Biến | Bắt buộc | Ý nghĩa |
|---|---|---|
| `PUBLIC_URL` | Có | URL công khai đầy đủ, `https://...`, không có `/` cuối. Compose gán cho `WEB_APP_URL` (gốc link trong email) và `FRONTEND_ORIGINS` (CORS + kiểm tra Origin) của backend nên ba giá trị luôn bằng nhau; cũng là `NEXT_PUBLIC_SITE_URL` của frontend (sitemap, Open Graph). `NEXT_PUBLIC_SITE_URL` được nhúng lúc BUILD: đổi domain thì phải build lại image frontend (mục 12) |
| `SITE_ADDRESS` | Có | Tên miền để Caddy xin chứng chỉ Let's Encrypt (phải trỏ DNS về VPS). `localhost` để thử cục bộ |
| `ACME_EMAIL` | Không | Email đăng ký ACME (nhận thông báo hết hạn chứng chỉ) |
| `HTTP_PORT`, `HTTPS_PORT` | Không | Cổng publish trên host, mặc định 80/443 |
| `POSTGRES_USER`, `POSTGRES_DB` | Có | Tên user và DB (mẫu: `beanbox`) |
| `POSTGRES_PASSWORD` | Có | Mật khẩu DB; dùng chuỗi hex |
| `JWT_ACCESS_SECRET` | Có | Khóa ký access token, >= 32 ký tự ngẫu nhiên |
| `INTERNAL_API_SECRET` | Có | >= 32 ký tự. Dùng CHUNG hai phía: compose truyền cùng một giá trị cho backend và frontend (SSR gửi `X-Internal-Secret` để không bị rate limit chung dồn vào một IP). Không bao giờ để dạng `NEXT_PUBLIC_` |
| `COOKIE_SECURE` | Không | Mặc định `true`. Giữ `true` khi chạy sau HTTPS; đặt `false` chỉ khi thử qua HTTP thuần (xem mục 14) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Nên có | SMTP thật (Mailpit không có ở production). Để trống `SMTP_HOST` thì email (xác nhận đơn, đặt lại mật khẩu, thông báo liên hệ) không gửi được; backend ghi log lỗi gửi mail nhưng không làm hỏng đơn. Mặc định cổng 587 |
| `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET` | Không | Có đủ cả hai thì bật VNPay; trống thì tắt (mục 5) |
| `VNPAY_PAYMENT_URL`, `VNPAY_RETURN_URL` | Không | Trống = URL sandbox mặc định và `${PUBLIC_URL}/thanh-toan/ket-qua?provider=vnpay` |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Không | Chỉ `sk_test_...`; có khóa thì bật Stripe. Webhook secret `whsec_...` (mục 5) |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Không | Captcha form liên hệ; phải có ĐỦ CẢ HAI hoặc để trống cả hai (mục 6) |
| `CONTACT_RETENTION_DAYS` | Không | Số ngày giữ tin liên hệ đã xử lý/spam trước khi job xóa cứng (D-029); mặc định 365, `0` = tắt. Đổi khác 365 thì sửa trang chính sách bảo mật cho khớp |
| `JOBS_ENABLED` | Không | Mặc định `true`: bật job nền dọn dẹp và hủy đơn quá hạn thanh toán. Chỉ đặt `false` khi chủ ý tắt (đơn `PENDING_PAYMENT` quá hạn sẽ không tự hủy, kho không tự hoàn) |
| `LOG_LEVEL` | Không | Mặc định `info` |
| `ORDER_RATE_LIMIT_PER_MIN`, `COUPON_RATE_LIMIT_PER_MIN`, `QUOTE_RATE_LIMIT_PER_MIN` | Không | Rate limit backend theo IP (mặc định 10/10/30) |
| `EDGE_RATE_AUTH_PER_MIN`, `EDGE_RATE_API_PER_MIN`, `EDGE_RATE_WEB_PER_MIN` | Không | Rate limit ở Caddy theo IP (mặc định 30/300/600) |
| `BACKUP_RETENTION_DAYS`, `BACKUP_INTERVAL_SECONDS` | Không | Xoay vòng backup (mặc định 7 ngày) và chu kỳ của service `backup` (mặc định 86400 giây) |
| `SEED_ADMIN_PASSWORD`, `SEED_STAFF_PASSWORD`, `SEED_CUSTOMER_PASSWORD` | Chỉ khi seed | Mỗi mật khẩu >= 12 ký tự, có chữ và số, khác giá trị mẫu trong `backend/.env.example` |

Backend kiểm tra env bằng zod khi khởi động và DỪNG ngay (log nêu tên biến, không in giá trị) khi:

- thiếu `INTERNAL_API_SECRET` ở production, hoặc `JWT_ACCESS_SECRET`/`INTERNAL_API_SECRET` ngắn hơn 32 ký tự;
- `JWT_ACCESS_SECRET` hoặc `INTERNAL_API_SECRET` bắt đầu bằng `dev-` (giá trị mẫu dev);
- chỉ đặt một trong hai khóa Turnstile;
- `STRIPE_SECRET_KEY` bắt đầu bằng `sk_live_` (chỉ chấp nhận `sk_test_`);
- `TRUST_PROXY=true` (compose đã đặt `uniquelocal`, không sửa), `VNPAY_PAYMENT_URL` không phải https, v.v.

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

| Endpoint | Ý nghĩa |
|---|---|
| `GET /api/v1/health` | Readiness của backend: kiểm DB, 503 khi DB lỗi. Dùng cho healthcheck container backend |
| `GET /api/v1/health/live` | Liveness: không chạm DB, luôn 200 khi tiến trình sống |
| `GET /healthz` | Liveness của frontend (không gọi backend, `Cache-Control: no-store`), dùng cho healthcheck container frontend |

Xem log:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f backend
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f caddy
```

- Backend log JSON (pino) có trường `reqId`; Caddy log JSON truy cập có `request_id`. Caddy gửi `X-Request-Id` (UUID) lên upstream và backend dùng lại nó, nên lọc cùng một giá trị ở cả hai log để lần ra một request; response cũng có header `X-Request-Id`.
- Log truy cập của Caddy bỏ query string (token đặt lại mật khẩu, chữ ký VNPay nằm trong query) và không ghi cookie, `Authorization`, `X-Internal-Secret`, `Set-Cookie`.
- Docker xoay vòng log theo driver `json-file`: tối đa 10 MB x 5 file mỗi service.
- Không có metrics/APM hay cảnh báo tự động (D-030). Nên đặt một uptime monitor bên ngoài gọi `https://<domain>/api/v1/health`.

Lỗi do chính Caddy sinh ra ở `/api/v1/*` (vượt rate limit, body quá lớn, backend chưa sẵn sàng) trả JSON theo format lỗi chuẩn của `api-contract.md` §1: 429 `RATE_LIMITED` (giữ `Retry-After`), 413 `PAYLOAD_TOO_LARGE` ở `/api/v1/admin/uploads*` và `VALIDATION_ERROR` ở các path khác, 502/503/504 `SERVICE_UNAVAILABLE`.

## 10. Rate limit

Có hai lớp:

1. **Edge (Caddy, D-026)**, theo IP, cửa sổ 1 phút, chỉnh qua `EDGE_RATE_*`: `POST /api/v1/auth/*` mặc định 30 (zone `auth`); `/api/v1/*` mặc định 300 (zone `api`); mọi request tới frontend trừ `/_next/static/*` mặc định 600 (zone `web`, gồm SSR và `/_next/image`). Một request khớp zone `auth` cũng được tính vào zone `api`. `/uploads/*` và `/_next/static/*` không giới hạn ở edge. Vượt -> 429 kèm `Retry-After`.
2. **Backend (D-009, D-011)**, chi tiết theo từng nhóm endpoint (đăng nhập 5/phút, đặt đơn, mã giảm giá, liên hệ 3 lần/10 phút...; xem `api-contract.md` §1). Request SSR có `X-Internal-Secret` hợp lệ được miễn rate limit chung của backend (không miễn nhóm nhạy cảm), vì vậy lớp edge là lớp chính cho lưu lượng SSR.

Bộ đếm của cả hai lớp nằm trong bộ nhớ và bị xóa khi restart (`caddy` hoặc `backend`). Vì dùng MemoryStore nên chỉ chạy MỘT instance backend (D-027); scale ngang cần store dùng chung (ví dụ Redis), ngoài phạm vi demo.

IP client: Caddy không tin `X-Forwarded-For` do client gửi (không khai báo `trusted_proxies`) và tự đặt bằng IP kết nối thật; backend chỉ tin hop trong mạng Docker (`TRUST_PROXY=uniquelocal`). Đổi hành vi này (Cloudflare) xem mục 3.

## 11. Backup và restore

Cơ chế (D-034): `pg_dump -Fc` và nén thư mục uploads thành `tar.gz`, xoay vòng theo `BACKUP_RETENTION_DAYS` (mặc định 7). Backup lỗi thì script thoát mã khác 0 và không để lại file dở. File backup được tạo với quyền chỉ chủ sở hữu đọc (umask 077; chủ sở hữu là root vì container chạy root, nên đọc/sao chép bằng `sudo`).

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

Backup nằm CÙNG máy với DB nên không chống được mất VPS. Hãy sao chép ra ngoài (off-site) định kỳ, ví dụ `rsync -a --delete-after user@vps:/home/<user>/beanbox/backups/ ./beanbox-backups/` từ máy khác hoặc đẩy lên object storage. Lưu ý backup cũ còn chứa dữ liệu đã bị job dọn dẹp xóa (D-029) cho tới khi xoay vòng hết.

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
- [ ] Backup chạy (có file trong `backups/`) và đã thử restore vào DB tạm thành công; có sao chép off-site
- [ ] Firewall chỉ mở 22/80/443; `docker compose ... ps` không thấy cổng 4000/5432 publish ra host
- [ ] Header bảo mật: `curl -I https://<domain>` có `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`, `Content-Security-Policy` (tập con thực thi) và `Content-Security-Policy-Report-Only`; không có header `Server`
- [ ] Rate limit edge hoạt động (mục 15 và `testing.md`: nhiều request liên tiếp tới `/api/v1/health/live` ra 429 kèm `Retry-After`)
- [ ] Log đọc được (`logs -f backend`, `logs -f caddy`), lọc được theo `request_id`/`reqId`
- [ ] CI xanh ở commit/tag sắp deploy (backend, frontend, e2e, secret-scan, docker)
- [ ] Đã mở lướt các trang tĩnh để làm mới ISR (mục 8)

## 14. Sự cố thường gặp

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| Container `backend` thoát/khởi động lại liên tục | Env không hợp lệ (secret `dev-`, thiếu `INTERNAL_API_SECRET`, chỉ một khóa Turnstile, `sk_live_`) | `docker compose ... logs backend` đọc dòng "Cấu hình môi trường không hợp lệ", sửa `.env.production`, `up -d backend` |
| `docker compose` báo "Đặt ... trong .env.production" | Thiếu biến bắt buộc, hoặc quên `--env-file .env.production` | Điền biến, luôn truyền `--env-file` |
| Caddy không xin được chứng chỉ | DNS chưa trỏ đúng, cổng 80/443 bị firewall/nhà cung cấp chặn, `SITE_ADDRESS` sai, vượt giới hạn Let's Encrypt | `logs caddy` xem lỗi ACME; kiểm DNS và cổng; chờ rồi `up -d caddy`; không bấm khởi động lại liên tục |
| 429 hàng loạt khi dùng Cloudflare proxy | Caddy thấy mọi kết nối cùng IP Cloudflare | Bật `trusted_proxies` + `CF-Connecting-IP` (mục 3) hoặc tắt proxy (đám mây xám) |
| 502/503 ngay sau khi `up -d` | Backend chưa `healthy` (đang migrate/khởi động) hoặc đã dừng vì env | `ps` xem trạng thái, `logs backend`; chờ healthy. Với `/api/v1/*`, phản hồi lỗi từ Caddy là JSON `SERVICE_UNAVAILABLE` |
| Script `.sh` lỗi `\r: command not found` hoặc `no such file` | File bị chuyển CRLF khi checkout trên Windows | `.gitattributes` ép `*.sh`, `Caddyfile`, `Dockerfile` về LF; checkout lại (`git add --renormalize .` rồi checkout) hoặc `sed -i 's/\r$//' deploy/backup/*.sh` |
| Đăng nhập xong vẫn như chưa đăng nhập, cookie không lưu | Truy cập qua HTTP thuần trong khi `COOKIE_SECURE=true` (cookie `Secure` chỉ lưu qua HTTPS) | Truy cập bằng HTTPS; chỉ thử qua HTTP thì đặt `COOKIE_SECURE=false` (KHÔNG dùng cho production thật) |
| Link trong email trỏ sai domain | `PUBLIC_URL` sai lúc khởi động backend | Sửa `PUBLIC_URL`, `up -d` lại; build lại frontend nếu đổi domain |
| Trang tĩnh còn hiện cài đặt mặc định | ISR chưa làm mới sau build | Mở lại trang sau vài phút (mục 8) |
| Form liên hệ trả 429 | Giới hạn 3 lần/10 phút/IP | Chờ hoặc restart backend (xóa bộ đếm) khi thử |
| Backup lỗi quyền hoặc không thấy file | Thư mục `backups/` thuộc root | Đọc bằng `sudo`, hoặc `sudo chown` theo nhu cầu sao chép |

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
```

Ghi chú:

- Container `caddy` chạy user `caddy` (uid 100), không phải root; healthcheck gọi admin API của Caddy ở `127.0.0.1:2019` bên trong container (không publish ra ngoài). Với `SITE_ADDRESS=localhost`, log có dòng `failed to install root certificate` vì user thường không ghi được kho tin cậy của container; vô hại, chỉ ảnh hưởng CA nội bộ khi thử cục bộ.
- Nâng cấp từ bản Caddy chạy root: volume `caddy_data`/`caddy_config` cũ có thể thuộc root. Nếu log Caddy báo `permission denied` khi ghi `/data` hoặc `/config`, chown một lần: `docker compose --env-file .env.production -f docker-compose.prod.yml run --rm --no-deps --user root --entrypoint chown caddy -R caddy:caddy /data /config`.
- `SITE_ADDRESS=localhost` làm Caddy dùng CA nội bộ nên trình duyệt báo chứng chỉ không tin cậy và `curl` cần `-k`.
- Redirect http -> https của Caddy bỏ mất cổng khi dùng cổng khác 443: truy cập `http://localhost:8080` bị chuyển tới `https://localhost` (cổng 443, không phải 8443). Hãy vào thẳng `https://localhost:8443`.
- Trên Git Bash của Windows, đường dẫn bắt đầu bằng `/` trong tham số lệnh (ví dụ `/deploy/backup/backup.sh`) bị chuyển đổi nhầm. Đặt `MSYS_NO_PATHCONV=1` trước lệnh: `MSYS_NO_PATHCONV=1 docker compose -p beanbox-local ... run --rm --entrypoint sh backup /deploy/backup/backup.sh`.
- Dọn dẹp: `docker compose -p beanbox-local --env-file .env.production -f docker-compose.prod.yml down -v` (cờ `-v` xóa cả volume của project thử).
- Các bước smoke test đầy đủ (health, header, rate limit edge, XFF giả, backup/restore) nằm ở [`testing.md`](testing.md).
