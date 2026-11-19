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

## E2E (Playwright, chỉ chromium, chạy cục bộ, chưa có trong CI)
Cài trình duyệt một lần: `npx playwright install chromium` (trong `frontend/`).

Chạy: `npm run test:e2e` trong `frontend/`.
- `playwright.config.ts` tự khởi động backend (`npm run dev` ở `backend/`, chờ `http://127.0.0.1:4000/api/v1/health`, `JOBS_ENABLED=false`) và frontend (`npm run dev`, cổng 3000); nếu cổng đã có server thì dùng lại (`reuseExistingServer`).
- Mật khẩu tài khoản seed được đọc từ `backend/.env` ngay trong config, không hardcode và không in ra.
- Kịch bản (`frontend/e2e/`): khách vãng lai mua COD, tra cứu và hủy đơn; customer xem đơn hàng, bị chặn ở `/admin`, đăng xuất; staff xác nhận rồi hủy đơn (hoàn kho).
- Test dùng DB dev: mỗi lần chạy tạo đơn mới (dùng email/SĐT ngẫu nhiên) và hủy lại để hoàn kho. Nếu test chết giữa chừng có thể còn đơn `CONFIRMED`/`PENDING`: hủy ở `/admin/don-hang`.
- Máy chặn chạy file tải về (Windows "Application Control policy has blocked this file"): đặt `E2E_BROWSER_CHANNEL=msedge` (hoặc `chrome`) để dùng trình duyệt Chromium đã cài sẵn.

### Lưu ý rate limit
Đăng nhập giới hạn 5 lần/phút/IP (`api-contract.md` §1); tra cứu đơn guest 10/phút; đặt đơn 10/phút. E2E chạy tuần tự (`workers: 1`) và chỉ đăng nhập 2 lần mỗi lượt. Chạy lại liên tiếp nhiều lần có thể gặp `429 RATE_LIMITED`: chờ khoảng 1 phút hoặc khởi động lại backend (bộ đếm nằm trong bộ nhớ).
