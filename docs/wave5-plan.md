# BeanBox – Kế hoạch Đợt 5 (đợt cuối, chốt dự án)

> Ngày: 2026-11-23 · Người lập: Tech Lead · Tiếp nối Đợt 4 (`wave4-plan.md`; HEAD `de07b0d`, CI xanh).
> Dự án là portfolio chỉ chạy localhost: không deploy công khai, không thanh toán thật.

**Mục tiêu:** đóng gói và chốt dự án. Sau Đợt 5 dự án ở trạng thái "hoàn thiện, chỉ bảo trì" (sửa lỗi, cập nhật phụ thuộc); không mở tính năng mới.

> **Trạng thái tổng: Đã làm, chờ commit (2026-11-23).** Task 1 (R-16, R-17, R-18, R-24a), Task 2 (R-14 rút gọn, warm-up E2E) và Task cuối (đóng roadmap, README, ảnh, kiểm tổng, demo một lệnh) đã xong; kết quả ở `testing.md` mục "Kết quả kiểm tổng Đợt 5 (chốt dự án)". Dự án ở trạng thái hoàn thiện, chỉ bảo trì.

## Làm

| Mục | Phạm vi | Tiêu chí xong | Trạng thái |
| --- | --- | --- | --- |
| R-16 (D-079) | `server.ts`: `uncaughtException`/`unhandledRejection` -> log `fatal` rồi tắt êm, `exit(1)`; `SIGTERM`/`SIGINT` -> tắt êm `exit(0)`; tắt êm một lần, chờ job đang chạy (`stopBackgroundJobs()`), timeout tổng, `stop_grace_period: 30s` ở compose | Test đơn vị (thứ tự, chờ job, timeout, gọi 2 lần, exit code); `docker stop` image runtime thoát 0 trong < 1 s | Đã làm (chờ commit) |
| R-17 (D-080) | Job đối soát `minPrice` theo mốc sale: SQL tập hợp tìm sản phẩm lệch, gọi lại `refreshProductDenorm`; advisory lock riêng, mỗi 10 phút và 1 lần lúc khởi động | Test integration với đồng hồ tiêm (trước/sau `saleStart`, sau `saleEnd`, idempotent, sắp xếp/lọc theo giá), SQL khớp `refreshProductDenorm` | Đã làm (chờ commit) |
| R-14 rút gọn (D-083) | E2E luồng mua trên viewport 390 px, smoke WebKit, đo tải đặt hàng đồng thời cùng SKU | Có spec/số đo ghi vào `testing.md` | Đã làm (chờ commit): project `mobile-390` + `webkit-smoke`, warm-up khởi động nguội, đo tải 9/9 lượt đạt |
| R-18 (D-081) | `avatarUrl` chỉ nhận `/uploads/...` hoặc https có host trong `AVATAR_URL_HOSTS`; FE chỉ render khi qua cùng bộ kiểm. Bỏ phần sharp/job dọn file mồ côi | Test validator, PATCH `/me`, render FE | Đã làm (chờ commit) |
| R-24a (D-082) | Độ tươi hạt theo requirements §5.6: nhãn "Rang X ngày trước", cảnh báo > 30 ngày, ngừng bán > 90 ngày ở giỏ/quote/đặt đơn | Test đơn vị tính tuổi, integration giỏ/quote/đơn, FE | Đã làm (chờ commit) |
| Dọn tài liệu + README | Cập nhật README trạng thái "hoàn thiện, chỉ bảo trì", mục lục tài liệu, `roadmap-next.md` | Tài liệu khớp mã nguồn | Task sau |

## Không làm (lý do ngắn)

- **R-19** (bảng tổng hợp analytics): D-054 đo chưa cần; thêm bảng và job tổng hợp là rủi ro lớn cho đợt chốt.
- **R-23 phần mở rộng** (giá vốn theo lô/nhà cung cấp): D-078 đã đủ cho lợi nhuận gộp.
- **R-06 outbox** (email/hạ tầng gửi bền): quy mô localhost không cần; mailer đã retry (D-056).
- **R-24b** (ảnh trong đánh giá): cần upload công khai có kiểm duyệt, đi ngược hướng giảm bề mặt tấn công.
- **Tách thêm file chỉ để tách** (phần còn lại R-16): không đổi hành vi, chỉ tăng rủi ro hồi quy.
- **R-20** (VAT): ngoài phạm vi pháp lý/thuế của dự án portfolio.
- **R-15** (grace window refresh token): nới phát hiện trộm token, tần suất lỗi chưa xác minh.
- **R-04, R-02, R-11 phần còn lại**: đã làm đủ phần có giá trị ở các đợt trước; phần còn lại là mở rộng.
- **Xuất CSV đơn hàng (R-21 phần còn lại)**: đã có xuất CSV sản phẩm và phân tích; chưa có nhu cầu.
- **R-12/R-13 phần Safari/Firefox**: gộp vào smoke WebKit của R-14 (D-083).

## Quy ước

Mỗi mục: lint, typecheck, format:check, test:coverage (ngưỡng D-055), build; E2E khi đụng luồng người dùng. Kết quả ghi ở `testing.md` mục "Kết quả kiểm Đợt 5".
