# BeanBox – Hướng dẫn cấu hình thanh toán sandbox

> Áp dụng cho M5 (D-014). Chỉ dùng môi trường thử nghiệm (VNPay sandbox, Stripe Test mode). Thiết kế chi tiết: [`api-contract.md`](api-contract.md) §13.
> Khi chưa cấu hình, ứng dụng vẫn chạy bình thường với COD; phương thức online sẽ bị tắt.

## 1. Cảnh báo an toàn

- KHÔNG commit file `backend/.env` hay bất kỳ khóa/secret nào. Chỉ sửa `backend/.env.example` khi thêm tên biến mới (giá trị để trống).
- KHÔNG dùng khóa live. Backend từ chối khởi động nếu `STRIPE_SECRET_KEY` bắt đầu bằng `sk_live_`.
- Không dán khóa vào issue, ảnh chụp màn hình hay log. Nếu lỡ lộ, vào Dashboard của nhà cung cấp tạo lại khóa mới.

## 2. VNPay (sandbox)

1. Đăng ký tài khoản sandbox tại cổng dành cho nhà phát triển của VNPay: https://sandbox.vnpayment.vn/devreg/. VNPay gửi qua email **TMN Code** (mã website) và **Hash Secret** (chuỗi bí mật).
2. Tài liệu tích hợp, bảng mã lỗi và thông tin thẻ/tài khoản thử nghiệm nằm ở https://sandbox.vnpayment.vn/apis/ (lấy thẻ test trong tài liệu chính thức của VNPay, không lưu vào repo).
3. Điền vào `backend/.env`:
   ```
   VNPAY_TMN_CODE=<mã nhận qua email>
   VNPAY_HASH_SECRET=<chuỗi bí mật nhận qua email>
   # Tùy chọn, đã có mặc định:
   # VNPAY_PAYMENT_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
   # VNPAY_RETURN_URL=http://localhost:3000/thanh-toan/ket-qua?provider=vnpay
   ```
4. Khởi động lại backend.
5. **IPN:** VNPay gọi `GET /api/v1/payments/vnpay/ipn` từ internet nên cần URL công khai. Trong trang quản trị merchant sandbox, đặt URL IPN trỏ tới backend của bạn; khi chạy local có thể dùng tunnel như cloudflared hoặc ngrok để có URL công khai.
6. **Không có IPN vẫn dùng được:** sau thanh toán, VNPay chuyển trình duyệt về `VNPAY_RETURN_URL`; trang kết quả chuyển nguyên các tham số `vnp_*` sang `GET /api/v1/payments/vnpay/return`, backend xác minh chữ ký rồi xử lý giống IPN (xử lý idempotent, không bị trùng nếu IPN đến sau).

## 3. Stripe (Test mode)

1. Mở Stripe Dashboard, bật **Test mode**, vào Developers -> API keys, copy **Secret key** dạng `sk_test_...`.
2. Điền vào `backend/.env`:
   ```
   STRIPE_SECRET_KEY=sk_test_...
   ```
3. **Webhook khi chạy local:** cài Stripe CLI, đăng nhập rồi chạy:
   ```
   stripe listen --forward-to localhost:4000/api/v1/payments/stripe/webhook
   ```
   Lệnh in ra signing secret dạng `whsec_...`; điền vào `backend/.env`:
   ```
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```
   Giữ cửa sổ `stripe listen` mở trong lúc thử. Khi triển khai thật, tạo endpoint webhook trong Dashboard (Developers -> Webhooks) với các sự kiện `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`.
4. **Không có webhook vẫn dùng được:** khi quay về từ Stripe, trang kết quả gọi `POST /api/v1/payments/stripe/sync`; backend tự hỏi Stripe trạng thái phiên rồi cập nhật đơn.
5. Thẻ thử nghiệm: số `4242 4242 4242 4242`, ngày hết hạn bất kỳ trong tương lai, CVC bất kỳ 3 chữ số, các trường còn lại điền tùy ý. Thẻ này chỉ hoạt động ở Test mode.
6. Tiền tệ VND không có đơn vị thập phân: số tiền gửi cho Stripe bằng đúng số đồng của đơn (ví dụ đơn 317.000đ gửi `317000`). Stripe có mức tối thiểu cho mỗi giao dịch, đơn quá nhỏ có thể bị từ chối.

## 4. Kiểm tra phương thức đã bật

Gọi `POST /api/v1/checkout/quote` (giỏ không rỗng, kèm `provinceCode`) và xem `data.paymentMethods`:

```json
[ { "method": "COD", "enabled": true }, { "method": "VNPAY", "enabled": true }, { "method": "STRIPE", "enabled": false } ]
```

`enabled: false` nghĩa là thiếu biến môi trường tương ứng (xem `architecture.md` §8). Trong giao diện, trang thanh toán chỉ cho chọn phương thức đang bật. Đặt đơn bằng phương thức tắt trả 409 `PAYMENT_METHOD_UNAVAILABLE`.

## 5. Quy trình thử nhanh

1. Chạy DB, backend, frontend (xem README gốc), thêm sản phẩm vào giỏ, chọn VNPay hoặc Stripe ở bước thanh toán, đặt đơn.
2. Hoàn tất thanh toán trên trang của nhà cung cấp; trình duyệt quay lại `/thanh-toan/ket-qua`; đơn chuyển `CONFIRMED`, `paymentStatus = PAID`. Email xác nhận xem ở Mailpit (http://localhost:8025).
3. Thử hủy giữa chừng hoặc để quá hạn (mặc định 15 phút, đổi bằng setting `order.paymentExpiryMinutes`): job chạy mỗi 60 giây sẽ hủy đơn, hoàn kho và gửi email hủy.
4. Trường hợp thanh toán thành công sau khi đơn đã bị hủy: đơn giữ nguyên `CANCELLED`, Payment hiện cờ "cần hoàn tiền" ở trang chi tiết đơn của admin. Hoàn tiền thủ công trên Dashboard/cổng sandbox rồi ghi nhận tại đó.

## 6. Sự cố thường gặp

| Triệu chứng | Nguyên nhân thường gặp |
|---|---|
| Phương thức hiện "chưa khả dụng" | Thiếu `VNPAY_TMN_CODE`/`VNPAY_HASH_SECRET` hoặc `STRIPE_SECRET_KEY`; chưa khởi động lại backend sau khi sửa `.env` |
| Backend không khởi động, báo khóa Stripe | `STRIPE_SECRET_KEY` không phải dạng `sk_test_` |
| VNPay báo sai chữ ký | Sai `VNPAY_HASH_SECRET`, hoặc có khoảng trắng/dấu nháy thừa trong `.env` |
| Stripe webhook trả 503 | Chưa đặt `STRIPE_WEBHOOK_SECRET`; vẫn dùng được qua sync ở trang kết quả |
| Stripe webhook trả 400 chữ ký | `whsec_...` không khớp phiên `stripe listen` hiện tại, hoặc đồng hồ máy lệch quá 5 phút |
| Trang kết quả cứ "đang chờ" | Chưa có IPN/webhook và trang chưa gọi được return/sync (kiểm tra log backend); đơn sẽ tự hủy khi quá hạn |
