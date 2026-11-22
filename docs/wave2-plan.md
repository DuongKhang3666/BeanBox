# BeanBox – Kế hoạch Đợt 2

> Ngày: 2026-11-22 · Người lập: Tech Lead · Tiếp nối Đợt 1 (`roadmap-next.md`, D-052..D-059).
> Dự án là portfolio chạy localhost: mọi thứ là **demo**, không dùng khóa/tài khoản thật nào. Chi tiết từng mục sẽ được bổ sung khi làm; mục 1 đã triển khai (D-060, D-061), mục 2 đã triển khai (D-062), mục 3 đã triển khai (D-063).

> **Trạng thái tổng (2026-11-22): Đã làm, chờ commit.** Mục 1-5 xong; kiểm tổng Đợt 2 và test chức năng thật ở `testing.md` mục "Kết quả kiểm tổng Đợt 2".

## Mục tiêu

Làm cho luồng mua hàng trông và chạy như một cửa hàng thật mà vẫn an toàn: thanh toán demo nhiều kênh, vận chuyển giả lập có thời gian giao dự kiến, đăng nhập 2 bước cho nhân viên, SEO sẵn sàng index, và quyền của khách với dữ liệu cá nhân (xóa/xuất tài khoản).

## Quy tắc chung

- Không dùng khóa/tài khoản thật. Cổng giả (mock) chỉ bật khi có cấu hình tường minh và **không bao giờ ở production** (backend từ chối khởi động).
- Không phá: giá tính ở server, idempotency đặt đơn, CSP storefront/admin (D-040), redirect slug 308/404 (D-018).
- Mỗi mục: migration (nếu có) kiểm drift trên DB tạm, test backend + frontend, E2E cho luồng chính, cập nhật contract/docs cùng thay đổi.
- Tránh test flaky: không dùng giá trị ngẫu nhiên không kiểm soát trong assertion (tiêm đồng hồ/seed, hoặc kiểm tính chất thay vì giá trị).

## Mục 1 – Thanh toán demo (D-060, D-061)

- **Phạm vi:** VNPay giả (tái dùng luồng sandbox), MoMo giả, VietQR/chuyển khoản; `PaymentProvider`/`PaymentMethod` thêm `MOMO`, `BANK_TRANSFER`.
- **Quyết định chính:** cờ `PAYMENT_MOCKS_ENABLED` (mặc định tắt, cấm ở production, cấm khi VNPay thật cũng được cấu hình); cổng giả ký bằng `PAYMENT_MOCK_SECRET`; cổng giả gọi đúng logic IPN thật + `applyPaymentResult` (không có đường tắt DB); chuyển khoản: khách chỉ "báo đã chuyển", nhân viên xác nhận mới PAID; BIN demo `999999` để app ngân hàng không chuyển được tiền thật.
- **API dự kiến:** `POST /payments/momo/create`, `POST /payments/momo/ipn`, `GET /payments/momo/return`, `POST /mock-gateway/{vnpay,momo}/complete`, `GET /orders/:code/bank-transfer`, `POST /orders/:code/bank-transfer/claim`, `POST /admin/orders/:code/bank-transfer/confirm`.
- **Test:** VietQR payload + CRC (vector cố định), chữ ký MoMo/VNPay giả, env validation, integration các luồng thành công/thất bại/hủy/idempotent/sửa số tiền, quá hạn chuyển khoản; Vitest FE; E2E VNPay/MoMo giả + chuyển khoản.
- **Tiêu chí xong:** đặt đơn bằng 3 kênh mới end-to-end trên localhost; tắt cờ thì hành vi cũ không đổi; mọi test/lint/build xanh, coverage đạt ngưỡng D-055.

## Mục 2 – Vận chuyển giả lập (D-062) – XONG

- **Phạm vi:** giữ nguyên phí theo vùng nội thành/ngoại tỉnh (D-003, D-006); thêm thời gian giao dự kiến.
- **Quyết định chính:** khoảng ngày (min-max) theo vùng x phương thức, cấu hình trong settings; lưu snapshot ngày dự kiến trên đơn; khi chuyển SHIPPING mà không nhập mã vận đơn thì sinh mã giả + hãng "giả lập"; trang theo dõi hiển thị mốc vận chuyển giả lập tính từ thời điểm SHIPPING (không thêm bảng nếu tránh được); không có điểm nhận hàng.
- **Test/xong:** test tính ngày dự kiến (đồng hồ tiêm), sinh mã vận đơn, hiển thị mốc; E2E không thêm lượt đăng nhập.
- **Đã làm (2026-11-22):** setting `shipping.eta` + quote `eta`; snapshot `Order.etaFrom/etaTo` (migration `d062_order_eta`); mã vận đơn giả `BBL|BBE-...` + hãng giả lập khi SHIPPING để trống (`trackingNumber` hết bắt buộc, đổi contract 0.21); `shipment.events` mô phỏng ở API khách/guest/admin; FE checkout, tra cứu, chi tiết đơn, admin, cài đặt; email xác nhận. Chi tiết: D-062, `testing.md`.

## Mục 3 – 2FA TOTP (D-063) – XONG

- **Phạm vi:** STAFF/ADMIN bật tùy chọn.
- **Quyết định chính:** TOTP RFC 6238 tự cài (HMAC-SHA1, 30 giây, 6 số, cửa sổ +-1, chống dùng lại bước), base32 tự cài, test vector RFC 6238; secret mã hóa AES-256-GCM bằng khóa env; mã dự phòng lưu băm; đăng nhập 2 bước bằng challenge ngắn hạn có giới hạn số lần thử; thu hồi phiên khác khi bật/tắt; audit; Admin tắt được 2FA của user khác. Dùng lại dependency `qrcode` đã thêm ở mục 1.
- **Test/xong:** test vector RFC, luồng bật/tắt/đăng nhập 2 bước, brute-force bị chặn, phiên bị thu hồi.
- **Đã làm (2026-11-22):** migration `d063_two_factor`; `/me/2fa/setup|enable|disable|backup-codes`, `POST /auth/login/2fa`, `POST /admin/users/:id/2fa/reset`, `GET /me.twoFactorEnabled`; UI trên `/tai-khoan` và bước 2 ở đăng nhập; env `TOTP_ENCRYPTION_KEY` (bắt buộc ở production). Chưa làm: bắt buộc 2FA cho Admin, xoay khóa mã hóa.

## Mục 4 – SEO (D-064) – XONG

- **Phạm vi và quyết định:** ISR trang chủ; ảnh OG mặc định + theo sản phẩm (`next/og`, font tiếng Việt cục bộ); sitemap có `lastmod` (thêm `updatedAt` vào API công khai - đổi contract cộng thêm); canonical tự trỏ khi phân trang + `noindex` cho URL có lọc; JSON-LD bổ sung; giữ nguyên 404/308.
- **Test/xong:** test metadata/sitemap/JSON-LD; kiểm production build.
- **Đã làm (2026-11-22):** `/` là ISR (`revalidate = 60`, build qua khi backend tắt); `opengraph-image`/`twitter-image` mặc định và theo sản phẩm (font Be Vietnam Pro cục bộ); `updatedAt` trong `ProductListItem` (contract 0.23) và sitemap `lastmod`, bỏ `changeFrequency`/`priority`; canonical `?page=N` + `noindex,follow` cho URL có lọc; JSON-LD (logo, itemCondition, ItemList danh mục). Không thêm `shippingDetails`/`hasMerchantReturnPolicy` (dữ liệu demo). 404/308 giữ nguyên (đo lại).

## Mục 5 – Xóa/xuất dữ liệu tài khoản (D-065) – XONG

- **Phạm vi:** khách (CUSTOMER) tự xóa tài khoản bằng mật khẩu + xác nhận; xuất dữ liệu cá nhân dạng JSON.
- **Quyết định chính:** ẩn danh hóa User + PII trên đơn (giữ số tiền, tỉnh/phường cho analytics); chặn xóa khi còn đơn đang xử lý; audit; không làm phần pháp lý.
- **Test/xong:** test ẩn danh hóa đầy đủ, chặn khi còn đơn mở, nội dung file xuất.
- **Đã làm (2026-11-22):** `DELETE /me` + `GET /me/export` (contract 0.24, migration `d065_user_deleted_at`); ẩn danh hóa trong một transaction, chặn khi còn đơn đang xử lý (409 `ACTIVE_ORDERS_EXIST`), analytics không đổi sau khi xóa; limiter xuất 5 lần/giờ theo userId; FE mục "Dữ liệu cá nhân" ở `/tai-khoan` + nhãn "Đã xóa" ở admin; test tích hợp, Vitest và E2E `account-data.spec.ts`. Kết quả số liệu ở `testing.md` (Đợt 2 mục 5).

## Thứ tự

1 -> 2 -> 3 -> 4 -> 5. Mục sau không bắt đầu khi mục trước chưa đạt tiêu chí xong.
