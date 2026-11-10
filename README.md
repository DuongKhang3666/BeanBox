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
npm run prisma:seed         # tài khoản, danh mục, thương hiệu, setting, coupon (chưa có sản phẩm)
npm run dev                 # http://localhost:4000/api/v1/health
```

Tài khoản seed (mật khẩu lấy từ `SEED_*` trong `backend/.env`; mặc định dev trong `.env.example`):
`admin@beanbox.local`, `staff@beanbox.local`, `customer@beanbox.local`. Seed từ chối chạy khi `NODE_ENV=production`.

Chạy backend trong Docker (tùy chọn):

```bash
JWT_ACCESS_SECRET="<chuỗi >= 32 ký tự>" docker compose --profile app up -d --build
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

CI (`.github/workflows/ci.yml`): job `backend` và `frontend` (frontend cần có các script `lint`, `typecheck`, `test`, `build`).

## Cấu trúc repo

```
BeanBox/
├─ backend/        Express API (src/config, lib, middlewares, modules), prisma/ (schema, migrations, seed), tests/
├─ frontend/       Next.js
├─ docs/           Tài liệu thiết kế
├─ docker/         Script khởi tạo DB cho docker compose
├─ docker-compose.yml
└─ .github/workflows/ci.yml
```

## Tài liệu

- [Kiến trúc](docs/architecture.md)
- [Thiết kế DB](docs/db-schema.md)
- [API contract](docs/api-contract.md) (nguồn sự thật cho FE và BE)
- [Yêu cầu](docs/requirements.md)
