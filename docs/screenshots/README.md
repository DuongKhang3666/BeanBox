# Chụp lại ảnh màn hình

Ảnh trong thư mục này được README gốc nhúng. Chúng được tạo bởi script Playwright tái lập được (`frontend/scripts/screenshots/capture.spec.ts`, config `frontend/playwright.screenshots.config.ts`), không chụp tay. Đây là công cụ tài liệu, không phải E2E và không chạy trong CI.

Script tạo đơn demo (tên, SĐT, email `@example.com` đều giả) và đổi trạng thái đơn qua API admin, nên **chỉ chạy trên DB tạm vừa migrate + seed**. Config từ chối chạy nếu thiếu `SCREENSHOT_DATABASE_URL`, nếu trùng `DATABASE_URL` trong `backend/.env`, hoặc nếu trỏ `localhost:5432` (DB dev). Script dùng cổng riêng (API 4100, web 3100; đổi bằng `SHOTS_API_PORT` / `SHOTS_WEB_PORT`) và không bao giờ dùng lại server đang chạy; không đụng server dev ở 4000/3000. Frontend chạy bản production (`next build` + `next start`) nên ảnh không có chỉ báo dev của Next.

## Yêu cầu

- Docker (container Postgres tạm), Node 22+, đã `npm install` ở `backend/` và `frontend/`.
- `backend/.env` có đủ biến bắt buộc và `SEED_*_PASSWORD` (script đọc mật khẩu seed từ đây, không in ra).
- Trình duyệt Chromium: máy bị chặn Chromium tải về thì dùng Edge qua `E2E_BROWSER_CHANNEL=msedge`.
- Cổng 4100, 3100 và 55434 đang trống.

## Các bước

Mật khẩu `tmp` bên dưới chỉ dành cho container tạm, sẽ bị xóa ở bước cuối.

### Git Bash

```bash
docker run -d --name bb-tmp-shots --shm-size=256m -e POSTGRES_USER=beanbox -e POSTGRES_PASSWORD=tmp   -e POSTGRES_DB=beanbox -p 127.0.0.1:55434:5432 postgres:17
sleep 10

cd backend
export DATABASE_URL=postgresql://beanbox:tmp@127.0.0.1:55434/beanbox   # chỉ trong shell này
npx prisma migrate deploy
npm run prisma:seed
unset DATABASE_URL

# Dữ liệu demo nhiều ngày cho trang /admin và /admin/phan-tich (cùng DB tạm)
DEMO_DATABASE_URL=postgresql://beanbox:tmp@127.0.0.1:55434/beanbox   npx tsx scripts/generate-demo-orders.ts --orders 1500 --days 90 --seed 42

cd ../frontend
export SCREENSHOT_DATABASE_URL=postgresql://beanbox:tmp@127.0.0.1:55434/beanbox
export E2E_BROWSER_CHANNEL=msedge
npm run screenshots

docker rm -fv bb-tmp-shots
```

### PowerShell

```powershell
docker run -d --name bb-tmp-shots --shm-size=256m -e POSTGRES_USER=beanbox -e POSTGRES_PASSWORD=tmp `
  -e POSTGRES_DB=beanbox -p 127.0.0.1:55434:5432 postgres:17
Start-Sleep 10

cd backend
$env:DATABASE_URL = "postgresql://beanbox:tmp@127.0.0.1:55434/beanbox"   # chỉ trong shell này
npx prisma migrate deploy
npm run prisma:seed
Remove-Item Env:DATABASE_URL

# Dữ liệu demo nhiều ngày cho trang /admin và /admin/phan-tich (cùng DB tạm)
$env:DEMO_DATABASE_URL = "postgresql://beanbox:tmp@127.0.0.1:55434/beanbox"
npx tsx scripts/generate-demo-orders.ts --orders 1500 --days 90 --seed 42
Remove-Item Env:DEMO_DATABASE_URL

cd ..rontend
$env:SCREENSHOT_DATABASE_URL = "postgresql://beanbox:tmp@127.0.0.1:55434/beanbox"
$env:E2E_BROWSER_CHANNEL = "msedge"
npm run screenshots

docker rm -fv bb-tmp-shots
```

Generator (`backend/scripts/generate-demo-orders.ts`, xem `docs/testing.md`) có rào an toàn riêng: chỉ đọc `DEMO_DATABASE_URL`, từ chối DB dev (cổng 5432) và production. Quy mô `--orders 1500 --days 90` cho khoảng 15-20 đơn mỗi ngày: biểu đồ 30 ngày có nhiều cột, KPI có so sánh với kỳ trước khác 0, trong khi số đơn (khoảng 1.500) vẫn gọn trong danh sách. Generator không đụng tồn kho, nên script ảnh vẫn tìm được sản phẩm còn hàng; đơn của script ảnh là đơn mới nhất nên nằm đầu danh sách đơn.

Lần chạy đầu mất khoảng 1-3 phút vì có bước `next build`. Script giả định DB **vừa seed** (có thể kèm dữ liệu demo từ generator): muốn chụp lại thì xóa container và làm lại từ đầu (chạy lần hai trên cùng DB sẽ có thêm đơn và có thể thiếu tồn kho).

## Kiểm ảnh

Mở từng file (kiểm cả số liệu hợp lý, không lộ thông tin thật): không trắng, không trang lỗi hoặc spinner, không toast che nội dung, không thông tin thật. Kích thước mục tiêu mỗi ảnh khoảng 500 KB trở xuống. Tổng cộng script đăng nhập 1 lần admin và 1 lần customer.

## Danh sách ảnh

`home`, `category`, `product`, `compare`, `cart`, `checkout`, `order-lookup`, `account-orders`, `admin-dashboard`, `admin-analytics`, `admin-analytics-breakdown`, `admin-orders`, `admin-product-edit`, `mobile-home`, `mobile-admin-orders`. Desktop 1440x900, mobile 390x844, chụp viewport (riêng `admin-orders` và `mobile-admin-orders` chụp cả trang vì bộ lọc chiếm gần hết màn hình đầu; `admin-analytics` chụp vùng từ đầu trang tới hết biểu đồ doanh thu, `admin-analytics-breakdown` chụp riêng khối cơ cấu doanh thu).
