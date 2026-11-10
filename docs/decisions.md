# BeanBox – Nhật ký quyết định

> Dạng ADR rút gọn. Ngày: 2026-11-10. Mỗi mục ghi: ID, người chốt, bối cảnh, quyết định, hệ quả, docs bị ảnh hưởng.
> Tài liệu liên quan: [`requirements.md`](requirements.md), [`api-contract.md`](api-contract.md), [`db-schema.md`](db-schema.md), [`architecture.md`](architecture.md).

## Mục lục
- [D-001 Thanh toán online thất bại](#d-001-thanh-toán-online-thất-bại)
- [D-002 Giao lại và khách hủy đơn PENDING_PAYMENT](#d-002-giao-lại-và-khách-hủy-đơn-pending_payment)
- [D-003 Phụ phí khối lượng và freeship](#d-003-phụ-phí-khối-lượng-và-freeship)
- [D-004 Giữ lượt mã giảm giá khi tạo đơn](#d-004-giữ-lượt-mã-giảm-giá-khi-tạo-đơn)
- [D-005 Khách vãng lai xem đơn qua trang tra cứu](#d-005-khách-vãng-lai-xem-đơn-qua-trang-tra-cứu)
- [D-006 Vùng ship nội thành và dữ liệu hành chính](#d-006-vùng-ship-nội-thành-và-dữ-liệu-hành-chính)
- [D-007 Chuẩn hóa số điện thoại](#d-007-chuẩn-hóa-số-điện-thoại)
- [D-008 Sổ địa chỉ khi chưa có dữ liệu hành chính](#d-008-sổ-địa-chỉ-khi-chưa-có-dữ-liệu-hành-chính)
- [D-009 Xác định IP client cho rate limit](#d-009-xác-định-ip-client-cho-rate-limit)

---

## D-001 Thanh toán online thất bại

- **Ngày:** 2026-11-10 · **Người chốt:** Chủ dự án
- **Bối cảnh:** `requirements.md` 0.1 §5.1 ghi "hết hạn / thất bại -> CANCELLED", trong khi contract 0.1 chọn giữ đơn để thử lại. Cần chốt một cách.
- **Quyết định:** Khi thanh toán online thất bại, GIỮ đơn ở `PENDING_PAYMENT`, đặt `paymentStatus=FAILED`; khách được thử lại tới hết `expiresAt` (15 phút). Quá hạn thì job hủy đơn -> `CANCELLED`, hoàn kho, hoàn lượt mã. Thử lại thành công: `paymentStatus` `FAILED -> PAID`, đơn -> `CONFIRMED`.
- **Hệ quả:** Kho và lượt mã bị giữ tới hết hạn kể cả khi thanh toán đã thất bại. Job hết hạn phải xử lý cả đơn có `paymentStatus=FAILED`. FE cần nút "Thanh toán lại" trên đơn `PENDING_PAYMENT`.
- **Docs bị ảnh hưởng:** `requirements.md` §5.1; `api-contract.md` §11 (đoạn `paymentStatus`), §13 mục 3; `architecture.md` §7.

## D-002 Giao lại và khách hủy đơn PENDING_PAYMENT

- **Ngày:** 2026-11-10 · **Người chốt:** Chủ dự án
- **Bối cảnh:** Sơ đồ 0.1 thiếu đường giao lại sau giao thất bại và không nói rõ khách có được hủy đơn đang chờ thanh toán.
- **Quyết định:** (1) Thêm chuyển `FAILED_DELIVERY -> SHIPPING` (giao lại), actor Staff+, có thể cập nhật `trackingNumber`/`carrier` mới. (2) Khách được tự hủy đơn `PENDING_PAYMENT` (ngoài `PENDING`, `CONFIRMED`).
- **Hệ quả:** `canCancel` đúng với `PENDING_PAYMENT`, `PENDING`, `CONFIRMED`. Đơn online đã `PAID` bị hủy vẫn cần hoàn tiền thủ công (M5).
- **Docs bị ảnh hưởng:** `requirements.md` FR-ORD-03, §5.1; `api-contract.md` §9.4, §11 (#11), §13 mục 4, 5.

## D-003 Phụ phí khối lượng và freeship

- **Ngày:** 2026-11-10 · **Người chốt:** Chủ dự án
- **Bối cảnh:** Requirements chỉ ghi "+5.000đ mỗi 1 kg vượt quá 2 kg", chưa nói cách làm tròn và quan hệ với freeship.
- **Quyết định:** `weightSurcharge = 5.000 × ceil(max(0, totalWeightGram − 2000) / 1000)` (mỗi kg hoặc phần lẻ vượt 2 kg). Freeship ngưỡng (STANDARD, đơn >= 500.000 sau giảm) miễn cả phụ phí này. EXPRESS không được freeship ngưỡng.
- **Hệ quả:** Công thức nằm trong hàm thuần tính phí ship, cần test biên (2000 g, 2001 g, 3000 g, 3001 g).
- **Docs bị ảnh hưởng:** `requirements.md` §5.3; `api-contract.md` §10 mục 3, §13 mục 7.

## D-004 Giữ lượt mã giảm giá khi tạo đơn

- **Ngày:** 2026-11-10 · **Người chốt:** Chủ dự án (THAY ĐỔI so với bản 0.1, vốn tính lượt khi đơn sang `CONFIRMED`)
- **Bối cảnh:** Tính lượt ở `CONFIRMED` khiến COD có thể vượt `usageLimit` (nhiều đơn `PENDING` cùng dùng lượt cuối).
- **Quyết định:** Lượt dùng mã được giữ chỗ NGAY KHI TẠO ĐƠN, trong cùng transaction tạo đơn/trừ kho, để không bao giờ vượt `usageLimit`. Cơ chế:
  - a. `UPDATE "Coupon" SET "usedCount" = "usedCount" + 1 WHERE "id" = $id AND "isActive" AND ("usageLimit" IS NULL OR "usedCount" < "usageLimit")`. Số dòng = 0 -> rollback toàn bộ, 409 `COUPON_INVALID` (`reason: USAGE_LIMIT`).
  - b. SAU bước a (lúc này transaction đang giữ khóa dòng coupon nên các đơn đồng thời dùng cùng mã bị tuần tự hóa), đếm `CouponRedemption` chưa `releasedAt` của coupon đó theo `userId` (user) hoặc `email` lowercase (guest). Nếu >= `perUserLimit` -> rollback, 409 `COUPON_INVALID` (`reason: PER_USER_LIMIT`). Thứ tự a rồi b giúp `perUserLimit` cũng không bị vượt khi đồng thời (Postgres READ COMMITTED: lệnh đếm chạy sau khi giao dịch trước commit).
  - c. Tạo `CouponRedemption(couponId, orderId, userId?, email)`.
- **Hoàn lượt:** mọi lần đơn chuyển sang `CANCELLED` (khách hủy, staff hủy, job hết hạn `PENDING_PAYMENT` – gồm cả trường hợp thanh toán thất bại tới hết hạn, `FAILED_DELIVERY -> CANCELLED`) thì trong cùng transaction: `UPDATE "CouponRedemption" SET "releasedAt" = now() WHERE "orderId" = $id AND "releasedAt" IS NULL`; nếu cập nhật 1 dòng thì `usedCount − 1`. Idempotent. Đơn `RETURNED` (v2) không hoàn lượt. Mã FREESHIP khi đơn đã đạt freeship ngưỡng vẫn giữ lượt (giữ quy tắc cũ).
- **Hệ quả:** Kiểm tra `USAGE_LIMIT` ở giỏ/quote chỉ mang tính tham khảo; quyết định cuối ở `POST /orders`. Chấp nhận: đơn COD bị bỏ lửng ở `PENDING` giữ lượt cho tới khi staff hủy. Mô hình Prisma hiện tại đủ, không đổi schema.
- **Docs bị ảnh hưởng:** `requirements.md` §5.5; `api-contract.md` §8.7, §9.2, §9.4, §10 mục 2.2 và 4, §11, §13 mục 6; `db-schema.md` §3 (`Coupon`, `CouponRedemption`), §5 (`Coupon.usedCount`); `architecture.md` §5, §7, §9 (ADR 9).

## D-005 Khách vãng lai xem đơn qua trang tra cứu

- **Ngày:** 2026-11-10 · **Người chốt:** Chủ dự án
- **Bối cảnh:** Guest không có tài khoản nên cần cách xem lại đơn; đã cân nhắc `viewToken` ngắn hạn.
- **Quyết định:** Guest xem đơn qua trang `/tra-cuu-don-hang` bằng mã đơn + SĐT đã chuẩn hóa (`GET /orders/track?code=&phone=`). Không có `viewToken`. Đơn guest KHÔNG tự gắn vào tài khoản khi đăng ký/đăng nhập sau. Trang đặt hàng thành công của guest dựa vào response `POST /orders` (sessionStorage); mất thì hướng dẫn dùng trang tra cứu.
- **Hệ quả:** Bỏ tra cứu bằng email. Bảo vệ bằng rate limit 10 req/phút/IP và 404 cùng thông báo khi sai. Người dùng đăng ký sau không thấy đơn guest cũ trong "Đơn hàng của tôi".
- **Docs bị ảnh hưởng:** `requirements.md` FR-CHK-10, §8 (Checkout); `api-contract.md` §6.4, §9.2 (lưu ý), §9.5, §13 mục 1, 2.

## D-006 Vùng ship nội thành và dữ liệu hành chính

- **Ngày:** 2026-11-10 · **Người chốt:** Chủ dự án
- **Bối cảnh:** Đơn vị hành chính 2 cấp không còn quận/huyện nên không phân biệt được "nội thành" theo quận; chưa có nguồn dữ liệu chính thức trong repo.
- **Quyết định:** Vùng ship nội thành = toàn bộ Hà Nội (`01`) và TP.HCM (`79`) (setting `shipping.innerCityProvinceCodes`), sẽ đối chiếu khi có dữ liệu hành chính chính thức. Dữ liệu tỉnh/phường 2 cấp chỉ nạp ở M2, từ file nguồn do chủ dự án cung cấp; developer không tự tạo/bịa dữ liệu. Chưa có file thì endpoint `/locations` và validate địa chỉ chưa làm.
- **Hệ quả:** Các ví dụ mã tỉnh/phường trong docs chỉ để minh họa. Phần checkout cần địa chỉ (M3) phụ thuộc file này; nếu chưa có file thì dùng tạm theo thỏa thuận riêng với Tech Lead, không tự bịa dữ liệu.
- **Docs bị ảnh hưởng:** `requirements.md` §5.3, §11 (M2), §12; `api-contract.md` §7, §10 mục 3, §13 mục 8; `db-schema.md` §6, §7 mục 4; `architecture.md` §2.

## D-007 Chuẩn hóa số điện thoại

- **Ngày:** 2026-11-10 · **Người chốt:** Tech Lead đề xuất (phái sinh từ D-005) · **Chủ dự án đã duyệt 2026-11-10**
- **Trạng thái:** Đã duyệt.
- **Bối cảnh:** Tra cứu đơn bằng SĐT đòi hỏi so khớp ổn định, nhưng 0.1 lưu SĐT theo dạng người dùng nhập.
- **Quyết định:** Chuẩn hóa SĐT: bỏ khoảng trắng, dấu chấm, gạch ngang; `+84` đầu -> `0`; sau chuẩn hóa phải khớp `^0(3|5|7|8|9)\d{8}$`. Mọi nơi lưu SĐT (`User.phone`, `Address.phone`, `Order.contactPhone`, `shippingAddress.phone`) lưu dạng chuẩn hóa; so khớp tra cứu dùng dạng chuẩn hóa. Hủy đơn guest (`POST /orders/:code/cancel` khi không đăng nhập) xác minh bằng `phone` (thay cho `email`) để cùng thông tin với trang tra cứu. FR-CHK-10 nâng ưu tiên S -> M vì là cách duy nhất để guest xem lại đơn.
- **Hệ quả:** Dữ liệu SĐT cũ (nếu có) cần chuẩn hóa. Hủy đơn guest không còn cần email.
- **Docs bị ảnh hưởng:** `requirements.md` FR-CHK-10; `api-contract.md` §1 (Chuẩn hóa input), §9.4, §9.5; `db-schema.md` §2 (comment `contactPhone`, `Address.phone`).

## D-008 Sổ địa chỉ khi chưa có dữ liệu hành chính

- **Ngày:** 2026-11-10 · **Người chốt:** Tech Lead
- **Trạng thái:** Tạm thời, chờ chủ dự án cung cấp file nguồn (D-006).
- **Bối cảnh:** M2 cần sổ địa chỉ nhưng chưa có file tỉnh/phường 2 cấp; không được bịa dữ liệu.
- **Quyết định:** `Address` vẫn lưu `provinceCode/provinceName/wardCode/wardName` dạng chuỗi. Trong lúc chưa có file: body tạo/sửa địa chỉ nhận thêm `provinceName`, `wardName` (2–100 ký tự) do client nhập; server chỉ validate ĐỊNH DẠNG mã (`provinceCode` `^\d{2}$`, `wardCode` `^\d{5}$` – định dạng tạm, đối chiếu lại khi có file) và KHÔNG đối chiếu mã/tên với danh mục. `GET /locations/*` chưa triển khai (bị chặn). Seed chưa tạo địa chỉ mẫu cho customer (cần mã/tên thật).
- **Hệ quả:** Dữ liệu địa chỉ nhập trong giai đoạn này có thể sai mã/tên, cần rà lại khi nạp file. Form FE tạm dùng ô nhập tay, sẽ thay bằng dropdown. Khi có file: server tự điền tên, bỏ qua `provinceName/wardName` từ client, bật validate đối chiếu, làm `/locations`. Phí ship M3 dựa `provinceCode` nên M3 cũng phụ thuộc file này.
- **Docs bị ảnh hưởng:** `api-contract.md` §6.3, §7; `db-schema.md` §6; `requirements.md` §11.

## D-009 Xác định IP client cho rate limit

- **Ngày:** 2026-11-10 · **Người chốt:** Tech Lead
- **Trạng thái:** Áp dụng.
- **Bối cảnh:** `trust proxy = 1` cũ cho phép ai gọi thẳng cổng 4000 giả `X-Forwarded-For` để lách rate limit đăng nhập; request SSR của Next dùng chung một IP nên có thể làm 429 lan ra mọi người.
- **Quyết định:**
  1. Backend lắng nghe `HOST` (mặc định `127.0.0.1`); docker-compose bind cổng 4000, 5432, 1025, 8025 vào `127.0.0.1`.
  2. `trust proxy` đọc từ env `TRUST_PROXY` (mặc định `loopback`; Docker dùng `uniquelocal`); cấm giá trị `true`.
  3. Request SSR của Next gửi header `X-Internal-Secret` (= env `INTERNAL_API_SECRET`, >= 32 ký tự, chỉ ở server, không bao giờ `NEXT_PUBLIC_`); backend so khớp hằng thời gian và MIỄN rate limit chung cho request đó (không miễn nhóm nhạy cảm auth). Không chuyển tiếp IP client từ SSR vì làm trang thành dynamic và phân mảnh cache fetch của Next.
- **Hệ quả / rủi ro còn lại:** Lưu lượng SSR không bị giới hạn ở backend, khi deploy (M7) phải đặt rate limit ở reverse proxy/edge trước Next. Nếu lộ `INTERNAL_API_SECRET` thì kẻ tấn công lách được rate limit chung (không lách được nhóm auth).
- **Docs bị ảnh hưởng:** `architecture.md` §3, §8, §9; `api-contract.md` §1.
