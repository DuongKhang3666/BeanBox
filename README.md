# BeanBox

Web bán đồ cà phê (hạt, dụng cụ pha chế, phụ kiện). UI tiếng Việt, tiền tệ VND.

Stack: Next.js + TypeScript + Tailwind (`frontend/`), Express + TypeScript + Prisma 6 (`backend/`), PostgreSQL.

## Yêu cầu hệ thống

- Node.js >= 22, npm
- Docker + Docker Compose (Postgres, Mailpit)

## Chạy môi trường dev

```bash
# 1. Hạ tầng: Postgres (cổng 5432, tự tạo thêm DB beanbox_test) + Mailpit (SMTP 1025, UI http://localhost:8025)
docker compose up -d db mailpit

# 2. Backend
cd backend
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
npm install
npx prisma migrate deploy   # hoặc: npm run prisma:migrate (dev, tạo migration khi đổi schema)
npm run prisma:seed         # tài khoản, danh mục, thương hiệu, sản phẩm mẫu, setting, coupon
npm run dev                 # http://localhost:4000/api/v1/health
```

Tài khoản seed (mật khẩu lấy từ `SEED_*` trong `backend/.env`; mặc định dev trong `.env.example`):
`admin@beanbox.local`, `staff@beanbox.local`, `customer@beanbox.local`. Seed từ chối chạy khi `NODE_ENV=production`, trừ khi opt-in có chủ ý (`SEED_ALLOW_PRODUCTION=true`, xem [Triển khai](docs/deployment.md)).

Chạy backend và frontend trong Docker (tùy chọn, profile `app`; cần `JWT_ACCESS_SECRET` và `INTERNAL_API_SECRET`, mỗi biến >= 32 ký tự, đặt trong `.env` ở thư mục gốc hoặc môi trường shell):

```bash
JWT_ACCESS_SECRET="<chuỗi >= 32 ký tự>" INTERNAL_API_SECRET="<chuỗi >= 32 ký tự khác>" \
  docker compose --profile app up -d --build
# Frontend http://localhost:3000, backend http://localhost:4000/api/v1/health
```

Reset DB dev: `npm run db:reset` (trong `backend/`, xóa sạch dữ liệu rồi chạy lại migration và seed).

## Test và kiểm tra chất lượng

Test backend dùng DB riêng `beanbox_test` (do `docker compose` tạo khi volume còn trống; test tự chạy `prisma migrate deploy` lên DB này). Nếu volume Postgres đã tồn tại từ trước, tạo DB thủ công:

```bash
docker compose exec db psql -U beanbox -c "CREATE DATABASE beanbox_test"
```

```bash
cd backend
npm run lint
npm run typecheck
npm test
npm run build
```

Có thể đổi DB test bằng biến `TEST_DATABASE_URL` (tên DB phải kết thúc bằng `_test`).

## CI

`.github/workflows/ci.yml` (chạy khi push lên `main` và trên pull request) gồm các job:

- `backend`: Postgres service, `prisma migrate deploy` trên DB trống, kiểm drift migration so với `schema.prisma`, lint, typecheck, test, build.
- `frontend`: lint, typecheck, test, build.
- `e2e`: Playwright (chromium) trên runner Linux với Postgres + Mailpit, migrate và seed bằng mật khẩu giả của CI; chạy sau `backend` và `frontend`.
- `secret-scan`: gitleaks (Docker, ghim phiên bản) quét lịch sử git.
- `audit`: `npm audit` cho cả hai phía, chỉ báo cáo, không làm fail.
- `docker`: build image backend, frontend và Caddy (không push).

Không có deploy tự động. Chi tiết kiểm thử: [docs/testing.md](docs/testing.md).

## Triển khai (demo)

Bản demo chạy trên một VPS bằng Docker Compose (`docker-compose.prod.yml`) với Caddy làm reverse proxy và HTTPS tự động. Hướng dẫn từng bước (VPS, DNS, biến môi trường, thanh toán sandbox, backup/restore, rollback, checklist go-live): [docs/deployment.md](docs/deployment.md). Mẫu cấu hình: `.env.production.example`.

## Cấu trúc repo

```
BeanBox/
├─ backend/        Express API (src/config, lib, middlewares, modules), prisma/ (schema, migrations, seed), tests/
├─ frontend/       Next.js
├─ docs/           Tài liệu thiết kế, kiểm thử, triển khai
├─ deploy/         caddy/ (Caddyfile, Dockerfile kèm plugin rate limit), backup/ (backup.sh, restore.sh, loop.sh)
├─ docker/         Script khởi tạo DB cho docker compose
├─ docker-compose.yml         Dev (db, mailpit; profile app: backend + frontend)
├─ docker-compose.prod.yml    Production/demo (caddy, frontend, backend, db; profile backup, tools)
├─ .env.production.example    Mẫu biến môi trường production (sao chép thành .env.production, không commit)
└─ .github/workflows/ci.yml
```

## Tài liệu

- [Kiến trúc](docs/architecture.md)
- [Nhật ký quyết định](docs/decisions.md)
- [Kiểm thử](docs/testing.md)
- [Triển khai](docs/deployment.md)
- [Cấu hình thanh toán sandbox](docs/payments-setup.md)
- [Thiết kế DB](docs/db-schema.md)
- [API contract](docs/api-contract.md) (nguồn sự thật cho FE và BE)
- [Yêu cầu](docs/requirements.md)
