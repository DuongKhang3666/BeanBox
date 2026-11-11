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
- [D-010 Quy tắc nghiệp vụ checkout M3](#d-010-quy-tắc-nghiệp-vụ-checkout-m3)
- [D-011 Rate limit cho mã giảm giá và đặt đơn](#d-011-rate-limit-cho-mã-giảm-giá-và-đặt-đơn)
- [D-012 Nội dung trang chính sách và điều khoản mua hàng](#d-012-nội-dung-trang-chính-sách-và-điều-khoản-mua-hàng)
- [D-013 Quy tắc nghiệp vụ Admin M4](#d-013-quy-tắc-nghiệp-vụ-admin-m4)
- [D-014 Thanh toán online M5](#d-014-thanh-toán-online-m5)
- [D-015 Hoàn tiền thủ công và job hết hạn](#d-015-hoàn-tiền-thủ-công-và-job-hết-hạn)
- [D-016 Chốt 3 câu hỏi sau M4](#d-016-chốt-3-câu-hỏi-sau-m4)

---

## D-001 Thanh toán online thất bại

- **Ngày:** 2026-11-10 · **Người chốt:** Chủ dự án
- **Bối cảnh:** `requirements.md` 0.1 §5.1 ghi "hết hạn / thất bại -> CANCELLED", trong khi contract 0.1 chọn giữ đơn để thử lại. Cần chốt một cách.
- **Quyết định:** Khi thanh toán online thất bại, GIỮ đơn ở `PENDING_PAYMENT`, đặt `paymentStatus=FAILED`; khách được thử lại tới hết `expiresAt` (15 phút). Quá hạn thì job hủy đơn -> `CANCELLED`, hoàn kho, hoàn lượt mã. Thử lại thành công: `paymentStatus` `FAILED -> PAID`, đơn -> `CONFIRMED`.
- **Hệ quả:** Kho và lượt mã bị giữ tới hết hạn kể cả khi thanh toán đã thất bại. Job hết hạn phải xử lý cả đơn có `paymentStatus=FAILED`. FE cần nút "Thanh toán lại" trên đơn `PENDING_PAYMENT`.
- **Docs bị ảnh hưởng:** `requirements.md` §5.1; `api-contract.md` §11 (đoạn `paymentStatus`), §15 mục 3; `architecture.md` §7.

## D-002 Giao lại và khách hủy đơn PENDING_PAYMENT

- **Ngày:** 2026-11-10 · **Người chốt:** Chủ dự án
- **Bối cảnh:** Sơ đồ 0.1 thiếu đường giao lại sau giao thất bại và không nói rõ khách có được hủy đơn đang chờ thanh toán.
- **Quyết định:** (1) Thêm chuyển `FAILED_DELIVERY -> SHIPPING` (giao lại), actor Staff+, có thể cập nhật `trackingNumber`/`carrier` mới. (2) Khách được tự hủy đơn `PENDING_PAYMENT` (ngoài `PENDING`, `CONFIRMED`).
- **Hệ quả:** `canCancel` đúng với `PENDING_PAYMENT`, `PENDING`, `CONFIRMED`. Đơn online đã `PAID` bị hủy vẫn cần hoàn tiền thủ công (M5).
- **Docs bị ảnh hưởng:** `requirements.md` FR-ORD-03, §5.1; `api-contract.md` §9.4, §11 (#11), §15 mục 4, 5.

## D-003 Phụ phí khối lượng và freeship

- **Ngày:** 2026-11-10 · **Người chốt:** Chủ dự án
- **Bối cảnh:** Requirements chỉ ghi "+5.000đ mỗi 1 kg vượt quá 2 kg", chưa nói cách làm tròn và quan hệ với freeship.
- **Quyết định:** `weightSurcharge = 5.000 × ceil(max(0, totalWeightGram − 2000) / 1000)` (mỗi kg hoặc phần lẻ vượt 2 kg). Freeship ngưỡng (STANDARD, đơn >= 500.000 sau giảm) miễn cả phụ phí này. EXPRESS không được freeship ngưỡng.
- **Hệ quả:** Công thức nằm trong hàm thuần tính phí ship, cần test biên (2000 g, 2001 g, 3000 g, 3001 g).
- **Docs bị ảnh hưởng:** `requirements.md` §5.3; `api-contract.md` §10 mục 3, §15 mục 7.

## D-004 Giữ lượt mã giảm giá khi tạo đơn

- **Ngày:** 2026-11-10 · **Người chốt:** Chủ dự án (THAY ĐỔI so với bản 0.1, vốn tính lượt khi đơn sang `CONFIRMED`)
- **Bối cảnh:** Tính lượt ở `CONFIRMED` khiến COD có thể vượt `usageLimit` (nhiều đơn `PENDING` cùng dùng lượt cuối).
- **Quyết định:** Lượt dùng mã được giữ chỗ NGAY KHI TẠO ĐƠN, trong cùng transaction tạo đơn/trừ kho, để không bao giờ vượt `usageLimit`. Cơ chế:
  - a. `UPDATE "Coupon" SET "usedCount" = "usedCount" + 1 WHERE "id" = $id AND "isActive" AND ("usageLimit" IS NULL OR "usedCount" < "usageLimit")`. Số dòng = 0 -> rollback toàn bộ, 409 `COUPON_INVALID` (`reason: USAGE_LIMIT`).
  - b. SAU bước a (lúc này transaction đang giữ khóa dòng coupon nên các đơn đồng thời dùng cùng mã bị tuần tự hóa), đếm `CouponRedemption` chưa `releasedAt` của coupon đó theo `userId` (user) hoặc `email` lowercase (guest). Nếu >= `perUserLimit` -> rollback, 409 `COUPON_INVALID` (`reason: PER_USER_LIMIT`). Thứ tự a rồi b giúp `perUserLimit` cũng không bị vượt khi đồng thời (Postgres READ COMMITTED: lệnh đếm chạy sau khi giao dịch trước commit).
  - c. Tạo `CouponRedemption(couponId, orderId, userId?, email)`.
- **Hoàn lượt:** mọi lần đơn chuyển sang `CANCELLED` (khách hủy, staff hủy, job hết hạn `PENDING_PAYMENT` – gồm cả trường hợp thanh toán thất bại tới hết hạn, `FAILED_DELIVERY -> CANCELLED`) thì trong cùng transaction: `UPDATE "CouponRedemption" SET "releasedAt" = now() WHERE "orderId" = $id AND "releasedAt" IS NULL`; nếu cập nhật 1 dòng thì `usedCount − 1`. Idempotent. Đơn `RETURNED` (v2) không hoàn lượt. Mã FREESHIP khi đơn đã đạt freeship ngưỡng vẫn giữ lượt (giữ quy tắc cũ).
- **Hệ quả:** Kiểm tra `USAGE_LIMIT` ở giỏ/quote chỉ mang tính tham khảo; quyết định cuối ở `POST /orders`. Chấp nhận: đơn COD bị bỏ lửng ở `PENDING` giữ lượt cho tới khi staff hủy. Mô hình Prisma hiện tại đủ, không đổi schema.
- **Docs bị ảnh hưởng:** `requirements.md` §5.5; `api-contract.md` §8.7, §9.2, §9.4, §10 mục 2.2 và 4, §11, §15 mục 6; `db-schema.md` §3 (`Coupon`, `CouponRedemption`), §5 (`Coupon.usedCount`); `architecture.md` §5, §7, §9 (ADR 9).

## D-005 Khách vãng lai xem đơn qua trang tra cứu

- **Ngày:** 2026-11-10 · **Người chốt:** Chủ dự án
- **Bối cảnh:** Guest không có tài khoản nên cần cách xem lại đơn; đã cân nhắc `viewToken` ngắn hạn.
- **Quyết định:** Guest xem đơn qua trang `/tra-cuu-don-hang` bằng mã đơn + SĐT đã chuẩn hóa (`GET /orders/track?code=&phone=`). Không có `viewToken`. Đơn guest KHÔNG tự gắn vào tài khoản khi đăng ký/đăng nhập sau. Trang đặt hàng thành công của guest dựa vào response `POST /orders` (sessionStorage); mất thì hướng dẫn dùng trang tra cứu.
- **Hệ quả:** Bỏ tra cứu bằng email. Bảo vệ bằng rate limit 10 req/phút/IP và 404 cùng thông báo khi sai. Người dùng đăng ký sau không thấy đơn guest cũ trong "Đơn hàng của tôi".
- **Docs bị ảnh hưởng:** `requirements.md` FR-CHK-10, §8 (Checkout); `api-contract.md` §6.4, §9.2 (lưu ý), §9.5, §15 mục 1, 2.

## D-006 Vùng ship nội thành và dữ liệu hành chính

- **Ngày:** 2026-11-10 · **Người chốt:** Chủ dự án
- **Trạng thái:** Đã chốt 2026-11-11 (Tech Lead theo ủy quyền chủ dự án): giữ nội thành = toàn bộ 01 và 79 cho MVP; thu hẹp bằng setting innerCityWardCodes khi cần, không sửa code.
- **Bối cảnh:** Đơn vị hành chính 2 cấp không còn quận/huyện nên không phân biệt được "nội thành" theo quận; chưa có nguồn dữ liệu chính thức trong repo.
- **Quyết định:** Vùng ship nội thành = toàn bộ Hà Nội (`01`) và TP.HCM (`79`) (setting `shipping.innerCityProvinceCodes`), sẽ đối chiếu khi có dữ liệu hành chính chính thức. Dữ liệu tỉnh/phường 2 cấp chỉ nạp ở M2, từ file nguồn do chủ dự án cung cấp; developer không tự tạo/bịa dữ liệu. Chưa có file thì endpoint `/locations` và validate địa chỉ chưa làm.
- **Hệ quả:** Các ví dụ mã tỉnh/phường trong docs chỉ để minh họa. Phần checkout cần địa chỉ (M3) phụ thuộc file này; nếu chưa có file thì dùng tạm theo thỏa thuận riêng với Tech Lead, không tự bịa dữ liệu.
- **Docs bị ảnh hưởng:** `requirements.md` §5.3, §11 (M2), §12; `api-contract.md` §7, §10 mục 3, §15 mục 8; `db-schema.md` §6, §7 mục 4; `architecture.md` §2.

- **Cập nhật 2026-11-11:** Dữ liệu đã nạp: `backend/data/provinces-wards.json` (34 tỉnh/thành, 3.321 phường/xã). Nguồn (theo `backend/data/README.md`): ThangLeQuoc/vietnamese-provinces-database (MIT), v5.2.0, theo QĐ 19/2025/QĐ-TTg và NQ 388/NQ-UBTVQH16. Mã `01` = Thành phố Hà Nội, `79` = Thành phố Hồ Chí Minh đã đối chiếu khớp với file; ví dụ cũ `26734` "Phường Bến Nghé" không còn tồn tại, thay bằng `26740` "Phường Sài Gòn".
- **Rủi ro về phạm vi `79` (đã xử lý, xem mục "Cập nhật 2026-11-11 (M3)" bên dưới):** sau sáp nhập, mã `79` gồm cả địa bàn Bình Dương và Bà Rịa–Vũng Tàu cũ (ví dụ "Phường Thủ Dầu Một" thuộc `79`), nên "nội thành = toàn bộ `79`" rộng hơn ý định ban đầu.
- **Vận hành dữ liệu:** đối chiếu định kỳ với danh mục chính thức (Cục Thống kê) khi có nghị quyết mới. Quy trình cập nhật: thay file -> chạy test (SHA-256 ghim và số lượng sẽ fail) -> kiểm dữ liệu -> cập nhật hằng số `EXPECTED_*` trong `locations.data.ts` và SHA trong `tests/locations.data.test.ts`.
- **Cập nhật 2026-11-11 (M3):** GIỮ "nội thành = toàn bộ tỉnh `01` và `79`" cho MVP (chốt bởi Tech Lead theo uỷ quyền của chủ dự án; chủ dự án có thể xem lại). **Hạn chế đã biết:** dữ liệu 2 cấp không tách được phường cũ, nên `79` gồm cả địa bàn Bình Dương và Bà Rịa–Vũng Tàu cũ, và `01` gồm toàn bộ Hà Nội mở rộng; các địa chỉ đó được tính phí nội thành. Hướng xử lý không cần sửa code: setting mới `shipping.innerCityWardCodes` (mảng mã phường, mặc định `[]`); để thu hẹp, admin bỏ `"79"` khỏi `shipping.innerCityProvinceCodes` và liệt kê mã phường nội thành vào `innerCityWardCodes`. Quy tắc vùng: `INNER` nếu tỉnh thuộc danh sách tỉnh HOẶC phường thuộc danh sách phường (`api-contract.md` §10 mục 3). Trạng thái "rủi ro cần xác nhận trước M3": đã xử lý.
- **Giấy phép dữ liệu:** dữ liệu hành chính theo giấy phép MIT; thông báo bản quyền nằm ở `backend/data/NOTICE.md` (phải giữ khi phân phối lại).

## D-007 Chuẩn hóa số điện thoại

- **Ngày:** 2026-11-10 · **Người chốt:** Tech Lead đề xuất (phái sinh từ D-005) · **Chủ dự án đã duyệt 2026-11-10**
- **Trạng thái:** Đã duyệt.
- **Bối cảnh:** Tra cứu đơn bằng SĐT đòi hỏi so khớp ổn định, nhưng 0.1 lưu SĐT theo dạng người dùng nhập.
- **Quyết định:** Chuẩn hóa SĐT: bỏ khoảng trắng, dấu chấm, gạch ngang; `+84` đầu -> `0`; sau chuẩn hóa phải khớp `^0(3|5|7|8|9)\d{8}$`. Mọi nơi lưu SĐT (`User.phone`, `Address.phone`, `Order.contactPhone`, `shippingAddress.phone`) lưu dạng chuẩn hóa; so khớp tra cứu dùng dạng chuẩn hóa. Hủy đơn guest (`POST /orders/:code/cancel` khi không đăng nhập) xác minh bằng `phone` (thay cho `email`) để cùng thông tin với trang tra cứu. FR-CHK-10 nâng ưu tiên S -> M vì là cách duy nhất để guest xem lại đơn.
- **Hệ quả:** Dữ liệu SĐT cũ (nếu có) cần chuẩn hóa. Hủy đơn guest không còn cần email.
- **Docs bị ảnh hưởng:** `requirements.md` FR-CHK-10; `api-contract.md` §1 (Chuẩn hóa input), §9.4, §9.5; `db-schema.md` §2 (comment `contactPhone`, `Address.phone`).

## D-008 Sổ địa chỉ khi chưa có dữ liệu hành chính

- **Ngày:** 2026-11-10 · **Người chốt:** Tech Lead
- **Trạng thái:** Đã đóng 2026-11-11 (thay bằng đối chiếu danh mục, D-006).
- **Bối cảnh:** M2 cần sổ địa chỉ nhưng chưa có file tỉnh/phường 2 cấp; không được bịa dữ liệu.
- **Quyết định:** `Address` vẫn lưu `provinceCode/provinceName/wardCode/wardName` dạng chuỗi. Trong lúc chưa có file: body tạo/sửa địa chỉ nhận thêm `provinceName`, `wardName` (2–100 ký tự) do client nhập; server chỉ validate ĐỊNH DẠNG mã (`provinceCode` `^\d{2}$`, `wardCode` `^\d{5}$` – định dạng tạm, đối chiếu lại khi có file) và KHÔNG đối chiếu mã/tên với danh mục. `GET /locations/*` chưa triển khai (bị chặn). Seed chưa tạo địa chỉ mẫu cho customer (cần mã/tên thật).
- **Hệ quả:** Dữ liệu địa chỉ nhập trong giai đoạn này có thể sai mã/tên, cần rà lại khi nạp file. Form FE tạm dùng ô nhập tay, sẽ thay bằng dropdown. Khi có file: server tự điền tên, bỏ qua `provinceName/wardName` từ client, bật validate đối chiếu, làm `/locations`. Phí ship M3 dựa `provinceCode` nên M3 cũng phụ thuộc file này.
- **Đóng 2026-11-11:** server tự điền tên, bỏ qua `provinceName/wardName` của client, đối chiếu mã (400 nếu sai), `/locations` đã triển khai, seed có 2 địa chỉ mẫu. Hệ quả: địa chỉ tạo trong giai đoạn D-008 (chỉ dữ liệu dev) có thể mang mã/tên sai và không được tự sửa; PATCH chỉ `wardCode` trên địa chỉ có `provinceCode` cũ không hợp lệ sẽ bị 400, người dùng chọn lại tỉnh/thành.
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

## D-010 Quy tắc nghiệp vụ checkout M3

- **Ngày:** 2026-11-11 · **Người chốt:** Tech Lead
- **Trạng thái:** Đã chốt 2026-11-11 (Tech Lead theo ủy quyền chủ dự án).
- **Bối cảnh:** Thiết kế chi tiết M3 (giỏ, quote, đặt đơn, hủy, tra cứu) lộ ra các điểm mơ hồ có thể gây lộ đơn của người khác hoặc hoàn kho hai lần.
- **Quyết định:**
  1. **Idempotency gắn người gọi:** `requestFingerprint` = SHA-256(body chuẩn hóa + `u:<userId>` | `g:<sha256 X-Cart-Token>` | `g:-`). Cùng key + khác fingerprint (kể cả khác người gọi) -> 409 `IDEMPOTENCY_CONFLICT`; không bao giờ trả đơn của người khác. Replay kiểm TRƯỚC kiểm giỏ trống. Key chỉ nhận UUID v4, lưu lowercase.
  2. **Hủy đơn guest chỉ cho đơn guest:** không đăng nhập -> chỉ đơn có `userId IS NULL` và `phone` chuẩn hóa khớp; đã đăng nhập -> chỉ chủ đơn; còn lại 404 cùng thông báo. Hủy lại đơn đã `CANCELLED` -> 409 `INVALID_STATUS_TRANSITION` (hoàn kho/hoàn lượt đúng 1 lần nhờ `UPDATE ... WHERE status = from`).
  3. **Tra cứu trả `canCancel`:** `GET /orders/track` trả `canCancel` (trạng thái cho phép khách hủy VÀ là đơn guest) và `cancelReason`.
  4. **Mã không hợp lệ khi đặt đơn -> 409:** `POST /orders` với mã không hợp lệ vì bất kỳ lý do nào trả 409 `COUPON_INVALID`, không âm thầm bỏ mã. `PRICE_CHANGED` kèm `expectedTotal`, `grandTotal`, `quote`; `OUT_OF_STOCK` liệt kê mọi dòng thiếu.
  5. **`PENDING_PAYMENT` hết hạn để M5:** COD không tạo đơn `PENDING_PAYMENT` nên job hủy quá hạn làm ở M5; hàm hủy đơn dùng chung (hoàn kho + hoàn lượt mã) được viết sẵn ở M3.
  6. **Hủy đơn guest không lộ PII:** response của `POST /orders/:code/cancel` khi không đăng nhập là `TrackedOrder` (cùng shape `GET /orders/track`), không phải `Order`; người dùng đã đăng nhập vẫn nhận `Order`.
  7. **Hủy đơn của tài khoản:** đơn đặt bằng tài khoản chỉ hủy được khi đăng nhập đúng chủ đơn (Order/tài khoản); người đã đăng nhập không hủy được đơn guest bằng Bearer (404). Trang tra cứu `/tra-cuu-don-hang` là luồng guest: FE gửi yêu cầu hủy KHÔNG kèm Authorization (xác minh bằng mã đơn + SĐT, chỉ đơn guest), nên người đang đăng nhập vẫn hủy được đơn guest của mình qua trang tra cứu. Với đơn tài khoản, tra cứu trả `canCancel=false`; FE hiển thị gợi ý đăng nhập để hủy trong Đơn hàng của tôi.
- **Hệ quả:** Cần rate limit riêng (store tách khỏi login) cho hủy đơn guest và tra cứu; rate limit cho áp mã, quote và đặt đơn xem D-011. Test phải phủ trường hợp key dùng chéo người gọi.
- **Docs bị ảnh hưởng:** `api-contract.md` §1, §9.2, §9.4, §9.5; `architecture.md` §7.

## D-011 Rate limit cho mã giảm giá và đặt đơn

- **Ngày:** 2026-11-11 · **Người chốt:** Tech Lead theo ủy quyền
- **Trạng thái:** Đã chốt.
- **Bối cảnh:** Mã giảm giá có thể bị dò bằng cách thử liên tục (`POST /cart/apply-coupon`, và `POST /checkout/quote` vì quote nhận `couponCode` ghi đè). Spam `POST /orders` có thể giữ kho và giữ lượt dùng mã của đơn chưa xử lý.
- **Quyết định:** Ba limiter riêng, mỗi cái một store, tính theo IP, đặt TRƯỚC `optionalAuth`, áp cho mọi request (kể cả có Bearer, không miễn `X-Internal-Secret`): `POST /cart/apply-coupon` 10 req/phút; `POST /checkout/quote` 30 req/phút; `POST /orders` 10 req/phút. Vượt -> 429 `RATE_LIMITED` kèm `Retry-After` và `details.retryAfterSec`.
- **Hệ quả:** Nhiều người sau cùng một NAT có thể chạm 10 đơn/phút: chấp nhận cho MVP. Replay Idempotency-Key cũng bị tính vào hạn mức. M7 cần đặt thêm rate limit ở edge.
- **Docs bị ảnh hưởng:** `api-contract.md` §1 (Rate limit).

## D-012 Nội dung trang chính sách và điều khoản mua hàng

- **Ngày:** 2026-11-11 · **Người chốt:** Tech Lead theo ủy quyền
- **Trạng thái:** Đã chốt.
- **Bối cảnh:** Footer và checkout cần các trang chính sách/điều khoản, nhưng BeanBox không phải cửa hàng thật nên không có thông tin pháp lý để điền.
- **Quyết định:** BeanBox là dự án demo, không phải cửa hàng thật. Các trang tĩnh `/chinh-sach/van-chuyen`, `/chinh-sach/doi-tra`, `/chinh-sach/bao-mat`, `/chinh-sach/dieu-khoan`, `/gioi-thieu`, `/lien-he` là bản ngắn tiếng Việt, có ghi chú "dự án demo"; không bịa mã số doanh nghiệp, địa chỉ, hotline; liên hệ chỉ dùng email trong setting `store.contact` (`hello@beanbox.local`). Nội dung phải khớp quy tắc nghiệp vụ hiện hành: phí ship theo `requirements.md` §5.3, freeship từ 500.000đ sau giảm giá cho giao Tiêu chuẩn, phụ phí khối lượng (D-003), khách tự hủy được ở `PENDING_PAYMENT`/`PENDING`/`CONFIRMED`; đổi trả online là v2 nên đổi trả do cửa hàng xử lý thủ công qua email trong 7 ngày cho hàng lỗi/giao sai; mỗi đơn dùng 1 mã giảm giá. Ô "đồng ý điều khoản" ở checkout có link tới `/chinh-sach/dieu-khoan` mở tab mới để không mất dữ liệu form.
- **Hệ quả:** Khi đổi setting phí ship phải cập nhật trang vận chuyển (nội dung tĩnh, chưa đọc từ `/settings/public`; để M6).
- **Docs bị ảnh hưởng:** `requirements.md` FR-CNT-01, FR-CHK-05.

## D-013 Quy tắc nghiệp vụ Admin M4

- **Ngày:** 2026-11-11 · **Người chốt:** Tech Lead theo ủy quyền chủ dự án
- **Trạng thái:** Áp dụng.
- **Bối cảnh:** M4 mở quyền ghi vào đơn hàng, tồn kho và danh mục sản phẩm; cần quy tắc để nhiều người thao tác đồng thời không làm sai kho/đơn, không lộ quyền và có dấu vết kiểm toán.
- **Quyết định:**
  1. **Chặn quyền ở cấp router:** mọi `/admin/*` dưới một router áp `requireAuth` + `requireStaff`; role đọc lại từ DB mỗi request. Xóa sản phẩm/danh mục/thương hiệu thêm `requireAdmin`.
  2. **Đơn admin định danh bằng `code`** (không lộ/không dùng `id` trong URL).
  3. **`fromStatus` bắt buộc** khi đổi trạng thái đơn để chống thao tác trên dữ liệu cũ: lệch trạng thái hiện tại -> 409 `CONFLICT`; kèm `UPDATE ... WHERE status = fromStatus`.
  4. **Phiếu giao là trang FE in** (`/admin/don-hang/[code]/in`, `window.print()`); bỏ endpoint `/admin/orders/:id/print`.
  5. **Tồn kho:** `stock` chỉ đổi qua đặt/hủy đơn và `POST /admin/inventory/adjust`; `InventoryMovement` là sổ cái bất biến. `STOCKTAKE` đặt tồn tuyệt đối; tồn ban đầu khi tạo biến thể ghi movement `STOCKTAKE`. `PATCH` biến thể không nhận `stock`.
  6. **Hiển thị sản phẩm:** `ACTIVE` cần >= 1 biến thể đang bán; chặn ngừng bán/xóa biến thể đang bán cuối cùng của sản phẩm `ACTIVE`.
  7. **Xóa:** xóa sản phẩm là xóa mềm, chỉ Admin, không khôi phục ở M4; xóa danh mục/thương hiệu chỉ khi không còn tham chiếu (nếu còn thì ẩn).
  8. **Upload ảnh:** thân nhị phân thô, kiểm magic bytes theo `Content-Type`, tên file ngẫu nhiên, <= 5 MB, không thêm thư viện multipart, không xử lý lại ảnh (không resize/re-encode).
  9. **Audit log ghi từ M4** (cùng transaction, không chứa bí mật/PII đơn); giao diện xem `GET /admin/audit-logs` để M6.
  10. **Không gửi email khi đổi trạng thái đơn ở M4.**
  11. **Route FE admin đặt tên tiếng Việt** (`/admin/don-hang`, `/admin/ton-kho`, `/admin/san-pham`, `/admin/danh-muc`, `/admin/thuong-hieu`), noindex, ngoài sitemap.
- **Hệ quả / rủi ro:**
  - Không xử lý lại ảnh nên file polyglot (hợp lệ magic bytes nhưng chứa nội dung khác) vẫn có thể được lưu. Giảm nhẹ: header `X-Content-Type-Options: nosniff`, tên ngẫu nhiên do server đặt, thư mục upload chỉ phục vụ tĩnh (không thực thi), `Content-Type` phục vụ theo đuôi file.
  - Hoàn tiền đơn online `PAID` bị hủy vẫn thủ công (M5). Thay đổi danh mục/sản phẩm hiện chậm ở storefront tới hết thời gian revalidate ISR.
  - Khách không nhận email khi đơn đổi trạng thái ở M4; đã chốt gửi từ M5 (D-016, `api-contract.md` §13.9, §15 mục 13).
- **Docs bị ảnh hưởng:** `api-contract.md` §2, §12, §14, §15 mục 13; `requirements.md` §9, §11 (M4); `architecture.md` §2, §4; `db-schema.md` §5 (ghi chú denormalize; không đổi schema).

## D-014 Thanh toán online M5

- **Ngày:** 2026-11-11 · **Người chốt:** Tech Lead theo ủy quyền chủ dự án
- **Trạng thái:** Áp dụng.
- **Bối cảnh:** M5 thêm thanh toán VNPay (sandbox) và Stripe (test mode). Cần quy tắc để đơn chỉ được xác nhận từ dữ liệu đáng tin, chạy được trên localhost (VNPay IPN không gọi được vào máy dev), và không vô tình dùng khóa thật.
- **Quyết định:**
  1. **Không dùng SDK:** Stripe gọi REST API bằng `fetch` (form-urlencoded), VNPay tự ký HMAC-SHA512. Ít phụ thuộc, dễ kiểm thử bằng hàm thuần.
  2. **Chỉ tin dữ liệu có chữ ký hoặc truy vấn server-to-server:** IPN và return của VNPay (đều có `vnp_SecureHash`), webhook Stripe (`Stripe-Signature`, chống replay 300 giây) hoặc `POST /payments/stripe/sync` (server tự gọi Stripe lấy phiên). Không bao giờ tin tham số redirect chưa ký (ví dụ `session_id` hay cờ "thành công" trên URL).
  3. **Return VNPay đã ký xử lý như IPN:** `GET /payments/vnpay/return` xác minh chữ ký rồi chạy cùng hàm idempotent với IPN, vì môi trường localhost không nhận được IPN; dữ liệu đã được VNPay ký nên tương đương.
  4. **Khóa live bị từ chối:** `STRIPE_SECRET_KEY` phải dạng `sk_test_`, `sk_live_` -> backend không khởi động. VNPay chỉ trỏ tới URL sandbox mặc định (cấu hình được nhưng bắt buộc https).
  5. **Thanh toán muộn / trả trùng:** nếu kết quả thành công hợp lệ đến khi đơn đã `CANCELLED` hoặc đã `PAID` bởi Payment khác, KHÔNG đổi trạng thái đơn (kho và lượt mã đã hoàn); đánh dấu Payment cần hoàn tiền (`needsRefund`) và ghi AuditLog `payment.late` để admin xử lý.
  6. **Hạn phiên Stripe:** phiên Checkout tối thiểu 30 phút, dài hơn hạn đơn 15 phút. Chấp nhận rủi ro thanh toán muộn (mục 5); giảm thiểu bằng cách gọi expire phiên khi hủy/hết hạn đơn (best-effort, D-015). VNPay đặt `vnp_ExpireDate = order.expiresAt` nên không có khe hở này.
  7. Không gửi email/SĐT khách sang Stripe.
- **Hệ quả:** Một đơn có thể có nhiều dòng `Payment` (mỗi lần bấm thanh toán một dòng). Cần test: chữ ký sai/thiếu, số tiền lệch, replay webhook, xử lý trùng, thanh toán muộn, thành công sau thất bại. Trang kết quả FE phụ thuộc `return`/`sync`, không phụ thuộc IPN/webhook. Hạ tầng: webhook Stripe cần raw body.
- **Docs bị ảnh hưởng:** `api-contract.md` §2, §9, §11 (#1), §13.0–13.5; `db-schema.md` §2–3 (Payment); `architecture.md` §7, §8; `payments-setup.md`.

## D-015 Hoàn tiền thủ công và job hết hạn

- **Ngày:** 2026-11-11 · **Người chốt:** Tech Lead theo ủy quyền chủ dự án
- **Trạng thái:** Áp dụng.
- **Bối cảnh:** D-010 hoãn job hủy đơn quá hạn sang M5; D-002/D-013 để hoàn tiền đơn online đã `PAID` bị hủy ở dạng thủ công. Cần chốt cách làm và dấu vết.
- **Quyết định:**
  1. **Job hết hạn:** mỗi 60 giây trong tiến trình (cùng module job dọn dẹp, advisory lock riêng), tối đa 50 đơn `PENDING_PAYMENT` có `expiresAt < now` mỗi lượt; mỗi đơn một transaction (khóa Order, kiểm lại điều kiện, `cancelOrderTx` actor SYSTEM, lý do "Quá hạn thanh toán", Payment `PENDING` -> `FAILED`). Sau commit gửi email hủy và best-effort expire phiên Stripe (lỗi chỉ log).
  2. **Hoàn tiền thủ công:** admin tự hoàn trên cổng/sandbox rồi ghi nhận bằng `POST /admin/orders/:code/refunds` (bắt buộc `note` 5–500 ký tự). Hệ thống KHÔNG gọi API hoàn tiền của cổng. Payment -> `REFUNDED` kèm `refundedAt`, `refundNote`, `refundedById`; đơn không còn Payment `SUCCEEDED` -> `paymentStatus = REFUNDED`. Đơn chưa hủy mà chỉ có một Payment thành công thì phải hủy đơn trước.
  3. **Cờ `needsRefund`:** Payment `SUCCEEDED` mà đơn đã `CANCELLED` hoặc đã có Payment `SUCCEEDED` khác tạo trước; hiển thị ở AdminOrder và lọc `GET /admin/orders?needsRefund=true`.
  4. Ghi AuditLog `payment.refund` (staff) và `payment.late` (hệ thống).
- **Hệ quả:** Hoàn tiền phụ thuộc người vận hành; không đối soát tự động với cổng. Cần migration thêm cột vào `Payment` (`m5_payment_refund`). Job và hủy đơn bởi người dùng cùng khóa Order trước Payment để tránh deadlock.
- **Docs bị ảnh hưởng:** `api-contract.md` §11, §12, §13.5–13.7; `db-schema.md` §2–3; `architecture.md` §7; `requirements.md` §5.1 (hết hạn thanh toán).

## D-016 Chốt 3 câu hỏi sau M4

- **Ngày:** 2026-11-11 · **Người chốt:** Tech Lead theo ủy quyền chủ dự án
- **Trạng thái:** Áp dụng.
- **Bối cảnh:** Ba câu hỏi còn mở sau khi hoàn thành M4 cần chốt trước khi làm M5.
- **Quyết định:**
  1. **Email đổi trạng thái làm ở M5:** gửi nền sau commit tới `contactEmail` khi đơn sang `CONFIRMED`, `SHIPPING` (kèm mã vận đơn/đơn vị), `DELIVERED`, `CANCELLED` (kèm lý do, gồm khách tự hủy, staff hủy, hết hạn). Không gửi cho chuyển khác. Link như email xác nhận, không đưa SĐT vào URL. Lỗi mail chỉ log.
  2. **Hoãn M6:** redirect khi đổi slug và khôi phục sản phẩm xóa mềm.
  3. **Rate limit cấu hình qua env:** `ORDER_RATE_LIMIT_PER_MIN`, `COUPON_RATE_LIMIT_PER_MIN`, `QUOTE_RATE_LIMIT_PER_MIN`, mặc định giữ 10/10/30 (D-011); giúp chạy e2e/demo không chạm giới hạn mà không sửa code.
- **Hệ quả:** Phải thêm template email cho 4 trạng thái. Link cũ sau khi đổi slug vẫn hỏng tới M6. Giá trị env được validate bằng zod (số nguyên dương).
- **Docs bị ảnh hưởng:** `api-contract.md` §1, §12.1, §13.0, §13.9, §15 mục 13–14; `architecture.md` §8.
