#!/bin/sh
# Khởi tạo demo một lệnh (D-066, D-084): migrate -> seed cơ bản -> seed nhiều (idempotent) -> đơn demo (chỉ khi chưa có). Thoát 0 khi xong.
set -eu

if [ "${NODE_ENV:-}" = "production" ]; then
  echo "[demo-init] Từ chối chạy khi NODE_ENV=production: stack demo chỉ dành cho máy local." >&2
  exit 1
fi
: "${DATABASE_URL:?[demo-init] Thiếu DATABASE_URL}"

echo "[demo-init] 1/4 prisma migrate deploy"
node_modules/.bin/prisma migrate deploy

echo "[demo-init] 2/4 seed cơ bản (tài khoản, danh mục, sản phẩm; chạy lại an toàn)"
node_modules/.bin/tsx prisma/seed.ts

echo "[demo-init] 3/4 seed nhiều (khoảng 120 sản phẩm, 150 khách, 300 đơn, đánh giá; cộng thêm, chạy lại an toàn)"
node_modules/.bin/tsx prisma/seed-rich.ts

echo "[demo-init] 4/4 dữ liệu đơn hàng demo (bỏ qua nếu đã có)"
# Generator chỉ đọc DEMO_DATABASE_URL và từ chối nếu trùng DATABASE_URL, nên gỡ DATABASE_URL khỏi môi trường của nó.
env -u DATABASE_URL DEMO_DATABASE_URL="$DATABASE_URL" \
  node_modules/.bin/tsx scripts/generate-demo-orders.ts --orders 1500 --days 90 --seed 42 --skip-if-exists

echo "[demo-init] xong"
