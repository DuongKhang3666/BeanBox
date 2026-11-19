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
- [D-017 Đánh giá sản phẩm](#d-017-đánh-giá-sản-phẩm)
- [D-018 Redirect slug và khôi phục sản phẩm](#d-018-redirect-slug-và-khôi-phục-sản-phẩm)
- [D-019 Dashboard và audit log](#d-019-dashboard-và-audit-log)
- [D-020 Phạm vi M6, E2E và audit bảo mật](#d-020-phạm-vi-m6-e2e-và-audit-bảo-mật)
- [D-021 Cài đặt cửa hàng](#d-021-cài-đặt-cửa-hàng)
- [D-022 Quản lý người dùng](#d-022-quản-lý-người-dùng)
- [D-023 Form liên hệ](#d-023-form-liên-hệ)
- [D-024 CSP report-only](#d-024-csp-report-only)
- [D-025 Mô hình triển khai demo](#d-025-mô-hình-triển-khai-demo)
- [D-026 Reverse proxy Caddy và rate limit ở edge](#d-026-reverse-proxy-caddy-và-rate-limit-ở-edge)
- [D-027 Rate limit khi nhiều instance](#d-027-rate-limit-khi-nhiều-instance)
- [D-028 Captcha tùy chọn cho form liên hệ (Cloudflare Turnstile)](#d-028-captcha-tùy-chọn-cho-form-liên-hệ-cloudflare-turnstile)
- [D-029 Thời hạn lưu tin nhắn liên hệ](#d-029-thời-hạn-lưu-tin-nhắn-liên-hệ)
- [D-030 Health và quan sát tối thiểu](#d-030-health-và-quan-sát-tối-thiểu)
- [D-031 Seed dữ liệu demo trên production (opt-in)](#d-031-seed-dữ-liệu-demo-trên-production-opt-in)
- [D-032 CSP ở M7](#d-032-csp-ở-m7)
- [D-033 CI (GitHub Actions)](#d-033-ci-github-actions)
- [D-034 Backup và khôi phục](#d-034-backup-và-khôi-phục)
- [D-035 Sửa hai rủi ro tồn đọng trước deploy](#d-035-sửa-hai-rủi-ro-tồn-đọng-trước-deploy)

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
- **Cập nhật 2026-11-19:** từ M6b, trang chính sách vận chuyển và trang liên hệ đọc số liệu thật từ `/settings/public` (D-021).
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

## D-017 Đánh giá sản phẩm

- **Ngày:** 2026-11-11 · **Người chốt:** Tech Lead theo ủy quyền chủ dự án
- **Trạng thái:** Áp dụng.
- **Bối cảnh:** FR-REV-01..04 cần quy tắc cụ thể trước khi code: ai được đánh giá, bao nhiêu lần, kiểm duyệt thế nào, hiển thị tên ra sao.
- **Quyết định:**
  1. **Điều kiện:** chỉ user có `OrderItem` của sản phẩm thuộc đơn `DELIVERED` của chính mình. Mỗi user tối đa 1 đánh giá/sản phẩm (kể cả mua nhiều lần). Server tự gắn `orderItemId` = dòng `DELIVERED` sớm nhất chưa có review.
  2. **Hậu kiểm:** đăng ngay (`PUBLISHED`), staff ẩn/hiện sau và có thể trả lời (một câu trả lời, ghi đè được). Review `HIDDEN` không tính vào điểm.
  3. **Sửa:** trong 30 ngày kể từ lúc tạo; review đang `HIDDEN` vẫn sửa được nhưng giữ `HIDDEN`.
  4. **Không ảnh ở M6:** `images` luôn `[]`; nội dung là văn bản thuần (không HTML/Markdown) để loại rủi ro XSS/upload.
  5. **Che tên:** `authorName` = từ cuối của họ tên + chữ cái đầu các từ trước ("Nguyễn Văn An" -> "An N. V."); không trả email/userId ở API công khai.
  6. **Denormalize:** `Product.ratingAvg/ratingCount` tính lại trong cùng transaction (khóa Product). Giá trị seed là dữ liệu giả cho dev; khi sản phẩm có review thật đầu tiên, giá trị được tính lại từ review thật.
  7. Rate limit ghi đánh giá 10/phút/IP, store riêng.
- **Hệ quả:** Không có unique DB `(userId, productId)`; tính duy nhất dựa vào khóa Product trong service (cần test đồng thời). FR-REV-01 "tối đa 3 ảnh" và FR-REV-02 "1 đánh giá/sản phẩm/đơn" được thu hẹp/đổi theo quyết định này. Điểm sản phẩm seed sẽ "nhảy" khi có review thật.
- **Docs bị ảnh hưởng:** `api-contract.md` §2, §12.0, §14.1; `db-schema.md` §2–3, §4, §5; `requirements.md` §11 (FR-REV-01/02 ở §4 giữ nguyên văn bản gốc, quyết định này ghi đè phần ảnh và phạm vi "1 đánh giá/sản phẩm").

## D-018 Redirect slug và khôi phục sản phẩm

- **Ngày:** 2026-11-11 · **Người chốt:** Tech Lead theo ủy quyền chủ dự án
- **Trạng thái:** Áp dụng (thay quyết định hoãn ở D-016 mục 2).
- **Bối cảnh:** Đổi slug làm hỏng link cũ và SEO; sản phẩm xóa mềm chưa có cách khôi phục.
- **Quyết định:**
  1. **Bảng `SlugRedirect`** (`entity`, `fromSlug`, `targetId`, unique `(entity, fromSlug)`) ghi khi admin đổi slug sản phẩm/danh mục; lưu theo id nên không có chuỗi redirect; slug mới trùng `fromSlug` cũ cùng loại thì xóa redirect đó; khớp trực tiếp luôn được ưu tiên.
  2. **API trả 404 `NOT_FOUND` + `details.movedTo`, không trả 301.** Lý do: API là JSON, không phải trang; để FE (Next, SSR) quyết định chuyển hướng 308 vĩnh viễn nhằm giữ SEO, và các client khác không bị chuyển hướng ngầm. Thêm `GET /categories/:slug`.
  3. **Khôi phục sản phẩm** `POST /admin/products/:id/restore` (Admin): `deletedAt = null`, `status = DRAFT`, biến thể đã xóa mềm giữ nguyên, AuditLog `product.restore`.
  4. **Hủy đơn và Payment:** hủy đơn thủ công chuyển Payment `PENDING` -> `FAILED` trong cùng transaction, sau commit best-effort expire phiên Stripe (§14.7).
- **Hệ quả:** Thêm migration `m6_slug_redirect`. Sản phẩm đã xóa vẫn giữ slug; link cũ trỏ tới sản phẩm đã xóa/ẩn trả 404 thường. FE phải xử lý `movedTo` ở trang sản phẩm và danh mục.
- **Docs bị ảnh hưởng:** `api-contract.md` §4.4, §14.5–14.7, §15 mục 14; `db-schema.md` §2–3.

## D-019 Dashboard và audit log

- **Ngày:** 2026-11-11 · **Người chốt:** Tech Lead theo ủy quyền chủ dự án
- **Trạng thái:** Áp dụng.
- **Bối cảnh:** FR-ADM-01 và FR-ADM-11 cần định nghĩa chỉ số và quyền xem.
- **Quyết định:**
  1. **Doanh thu theo `paidAt`** của đơn `paymentStatus = PAID` và `status` không thuộc `CANCELLED`/`RETURNED` (đơn COD chỉ tính khi đã giao và thu tiền); số đơn theo `createdAt`, mọi trạng thái. Tính theo ngày giờ VN (UTC+7).
  2. Top sản phẩm theo số lượng trong 30 ngày (loại đơn `CANCELLED`/`PENDING_PAYMENT`); sắp hết hàng theo `stock <= lowStockThreshold`.
  3. **Không thêm thư viện biểu đồ:** FE vẽ bằng CSS để giữ bundle nhỏ và giảm bề mặt phụ thuộc.
  4. **Audit log chỉ Admin xem** (Staff thao tác nhưng không đọc nhật ký); lọc theo action/prefix/entity/actor/khoảng ngày.
- **Hệ quả:** Doanh thu một ngày có thể đổi nếu đơn sau đó bị hủy/hoàn (số liệu quá khứ không đóng băng). Các truy vấn tổng hợp chạy trực tiếp trên bảng Order (chưa có bảng tổng hợp); đủ cho quy mô demo.
- **Docs bị ảnh hưởng:** `api-contract.md` §12.0, §14.3–14.4.

## D-020 Phạm vi M6, E2E và audit bảo mật

- **Ngày:** 2026-11-11 · **Người chốt:** Tech Lead theo ủy quyền chủ dự án
- **Trạng thái:** Áp dụng.
- **Bối cảnh:** M6 ("Hoàn thiện v1") gồm nhiều hạng mục; cần giới hạn để kịp deploy demo.
- **Quyết định:**
  1. **Làm trong M6:** `api-contract.md` §14.1–14.8 (đánh giá, wishlist, dashboard, audit log, redirect slug, khôi phục sản phẩm, hủy đơn + Stripe, gợi ý tìm kiếm), SEO (requirements §6.4), E2E, audit bảo mật.
  2. **E2E:** Playwright, chỉ chromium, cài làm devDependency của `frontend/`, chạy cục bộ; CHƯA đưa vào CI.
  3. **Audit bảo mật:** rà soát theo checklist và chạy `npm audit`; chỉ nâng cấp phụ thuộc khi an toàn (không phá build/test, không nâng major khi chưa kiểm).
  4. **Hoãn M6b (dự kiến trước deploy M7):** settings admin (`/admin/settings`, `/settings/public`), quản lý người dùng, contact/newsletter (§14.9). Cập nhật 2026-11-19: M6b đã chi tiết hóa ở D-021..D-024 (newsletter vẫn hoãn).
  5. **Nợ kỹ thuật ghi nhận:** gộp các hàm `dateOnly` trùng lặp; thêm file dữ liệu hành chính (`backend/data/provinces-wards.json`) vào `.prettierignore`.
- **Hệ quả:** Trang vận chuyển vẫn là nội dung tĩnh tới khi có settings công khai (D-013). Quản lý user/khóa tài khoản chưa có UI trong M6. E2E chưa chặn merge.
- **Cập nhật 2026-11-20:** E2E đã chạy trong CI từ M7, xem D-033.
- **Docs bị ảnh hưởng:** `api-contract.md` §14.9; `requirements.md` §11; `architecture.md` §2, §6.

## D-021 Cài đặt cửa hàng

- **Ngày:** 2026-11-19 · **Người chốt:** Tech Lead theo ủy quyền chủ dự án
- **Trạng thái:** Áp dụng.
- **Bối cảnh:** FR-ADM-09 cần cho admin chỉnh phí ship, vùng nội thành, thông tin liên hệ và banner; trang chính sách vận chuyển còn là nội dung tĩnh (D-012, D-020).
- **Quyết định:**
  1. **Chỉ Admin** xem và sửa (`GET/PUT /admin/settings`).
  2. **Whitelist key và ràng buộc ghi** theo `api-contract.md` §14.9; key lạ bị từ chối. Banner chỉ nhận ảnh `/uploads/...` và `href` nội bộ (không URL ngoài) để khớp CSP và tránh open redirect.
  3. **Đọc nới, ghi chặt:** giá trị đọc từ DB kiểm theo schema nới hơn; sai định dạng thì dùng mặc định và log cảnh báo tên key.
  4. **Tính giá không cache phía server** nên đổi setting có hiệu lực ngay cho quote/đặt đơn. `GET /settings/public` cache 300 giây; FE ISR 300 giây và có nội dung mặc định khi API lỗi.
  5. Trang chính sách vận chuyển, footer, trang liên hệ và banner trang chủ đọc số liệu thật từ `/settings/public` (đóng hệ quả còn treo của D-012 và D-020).
- **Hệ quả/rủi ro:** Ghi đè theo key, người ghi sau thắng (không khóa lạc quan; ít admin). Storefront cập nhật chậm tới khoảng 5 phút. Admin có thể đặt phí bất thường; các giới hạn trần đã chặn bớt.
- **Docs bị ảnh hưởng:** `api-contract.md` §12.0, §14.9; `db-schema.md` §3, §6; `architecture.md`.

## D-022 Quản lý người dùng

- **Ngày:** 2026-11-19 · **Người chốt:** Tech Lead theo ủy quyền chủ dự án
- **Trạng thái:** Áp dụng.
- **Bối cảnh:** FR-ADM-07 cần khóa/mở khóa tài khoản và đổi vai trò; rủi ro chính là admin tự khóa mình hoặc hệ thống mất hết admin.
- **Quyết định:**
  1. **Chỉ ADMIN** dùng `/admin/users` (Staff nhận 403).
  2. Không tự khóa hoặc đổi role chính mình (`CANNOT_MODIFY_SELF`).
  3. Không làm mất ADMIN `ACTIVE` cuối (`LAST_ADMIN`). Trong transaction: khóa dòng người thao tác và các ADMIN `ACTIVE` bằng `SELECT ... FOR UPDATE`, rồi kiểm lại người thao tác còn là ADMIN `ACTIVE` (không thì 403). Cách này chặn trường hợp hai admin khóa chéo nhau đồng thời.
  4. Khóa hoặc đổi role thu hồi mọi refresh token; access token bị chặn ngay vì middleware đọc DB mỗi request.
  5. Mở khóa xóa luôn khóa tạm do đăng nhập sai (`failedLoginCount`, `lockedUntil`).
  6. Audit `user.status` và `user.role`. Không có xóa user và không đặt lại mật khẩu ở M6b.
- **Hệ quả/rủi ro:** User bị hạ quyền vẫn còn access token nhưng mất quyền ngay ở request tiếp theo; phiên làm mới bị thu hồi nên phải đăng nhập lại.
- **Docs bị ảnh hưởng:** `api-contract.md` §2, §12.0, §14.10.

## D-023 Form liên hệ

- **Ngày:** 2026-11-19 · **Người chốt:** Tech Lead theo ủy quyền chủ dự án
- **Trạng thái:** Áp dụng.
- **Bối cảnh:** FR-CNT-03 cần form liên hệ; trang `/lien-he` hiện chỉ có email (D-012). Cần chống spam mà không lưu dữ liệu định danh thừa.
- **Quyết định:**
  1. Bảng `ContactMessage` (migration `m6b_contact_message`).
  2. `POST /contact` rate limit 3 request/10 phút/IP; honeypot `website` có giá trị thì trả 201 giả, không lưu, không gửi mail; không lưu IP.
  3. Email thông báo gửi nền tới `store.contact.email` với `Reply-To` là email người gửi, nội dung escape HTML; KHÔNG gửi email tự động cho người gửi.
  4. Staff+ xem và xử lý (trạng thái, ghi chú), không xóa; audit `contact.update` không chép nội dung.
  5. Newsletter vẫn hoãn.
- **Hệ quả/rủi ro:** Spam qua nhiều IP không bị chặn (chấp nhận cho demo; M7 cân nhắc captcha hoặc rate limit ở edge). Thời hạn lưu chưa tự động (`api-contract.md` §15 mục 15).
- **Docs bị ảnh hưởng:** `api-contract.md` §14.11, §15 mục 15–16; `db-schema.md` §2–3, §7.

## D-024 CSP report-only

- **Ngày:** 2026-11-19 · **Người chốt:** Tech Lead theo ủy quyền chủ dự án
- **Trạng thái:** Áp dụng.
- **Bối cảnh:** Frontend chưa có CSP; bật thực thi ngay có thể làm vỡ trang vì Next chèn inline script không nonce.
- **Quyết định:**
  1. Header `Content-Security-Policy-Report-Only` đặt ở Next (`next.config.ts`), không thực thi.
  2. `'unsafe-inline'` cho script và style là tạm thời.
  3. `POST /csp-report` chỉ log gọn các trường đã làm sạch, không PII, không lưu DB, rate limit 20 request/phút/IP.
  4. Kế hoạch M7: thu thập vi phạm, chuyển sang nonce và chế độ thực thi.
  5. Backend API vẫn giữ CSP mặc định của helmet cho response JSON.
- **Hệ quả/rủi ro:** Chưa có bảo vệ thực sự từ CSP cho đến M7; log `warn` có thể nhiều ở dev (đã giới hạn bằng rate limit).
- **Cập nhật 2026-11-20:** kế hoạch nonce ở M7 đã được thay đổi, xem D-032.
- **Docs bị ảnh hưởng:** `api-contract.md` §14.12; `architecture.md`; `testing.md`.

## D-025 Mô hình triển khai demo

- **Ngày:** 2026-11-19 · **Người chốt:** Tech Lead theo ủy quyền chủ dự án
- **Trạng thái:** Áp dụng.
- **Bối cảnh:** M7 chuẩn bị deploy demo lên một VPS; cần mô hình đơn giản, tách hẳn môi trường dev.
- **Quyết định:**
  1. Một VPS Linux chạy Docker Compose bằng `docker-compose.prod.yml` có `name: beanbox-prod`. Service: `db` (postgres:17, KHÔNG publish cổng), `backend`, `frontend` (Next standalone), `caddy` (service DUY NHẤT publish 80/443); tùy chọn `backup` (profile `backup`) và `seed` (profile `tools`).
  2. Image build ngay trên VPS (`docker compose build`), không registry, không deploy tự động. Mailpit không có ở production; SMTP thật qua env.
  3. Volume: `pgdata`, `uploads` (gắn `/app/uploads` của backend), `caddy_data`, `caddy_config`; backup ghi ra thư mục bind `./backups`.
  4. Backend khởi động: `prisma migrate deploy` rồi `exec node dist/server.js`; container chạy user không phải root, `init: true`; MỘT instance backend.
  5. Biến môi trường production lấy từ `.env.production` (không commit; mẫu `.env.production.example`). Log Docker driver json-file xoay vòng (10 MB x 5 file).
- **Hệ quả/rủi ro:** `NEXT_PUBLIC_SITE_URL` và URL rewrites của Next được nhúng lúc build nên đổi domain phải build lại image frontend. Build trên VPS tốn tài nguyên và không có rollback tự động.
- **Docs bị ảnh hưởng:** `docs/deployment.md`; `architecture.md`.

## D-026 Reverse proxy Caddy và rate limit ở edge

- **Ngày:** 2026-11-19 · **Người chốt:** Tech Lead theo ủy quyền chủ dự án
- **Trạng thái:** Áp dụng. Đóng phần "M7 đặt rate limit ở edge" của D-009, D-011, D-023.
- **Bối cảnh:** Rate limit trong backend không bảo vệ lưu lượng SSR của Next và dùng bộ nhớ từng tiến trình; cần lớp edge và TLS tự động.
- **Quyết định:**
  1. Caddy 2 build kèm plugin `github.com/mholt/caddy-ratelimit` qua xcaddy (ghim phiên bản). Chọn Caddy vì TLS tự động Let's Encrypt khi có domain; nginx cần certbot riêng.
  2. Định tuyến: `/api/v1/*` và `/uploads/*` -> `backend:4000` trực tiếp; còn lại -> `frontend:3000`.
  3. IP client: Caddy không tin `X-Forwarded-For` từ client (không khai báo `trusted_proxies`) và tự đặt XFF = IP kết nối; backend `TRUST_PROXY=uniquelocal` (backend không publish cổng, chỉ Caddy/Next trong mạng Docker gọi tới). Nếu đặt Cloudflare (proxy cam) phía trước thì phải cấu hình `trusted_proxies` + header IP của Cloudflare, nếu không mọi khách chung một IP.
  4. Rate limit edge theo IP, cửa sổ 1 phút, chỉnh qua env: `POST /api/v1/auth/*` 30; `/api/v1/*` 300; mọi request tới frontend trừ `/_next/static/*` 600 (gồm SSR và `/_next/image`). `/uploads/*`, `/_next/static/*` không giới hạn ở edge. Vượt -> 429 kèm `Retry-After`. Backend vẫn giữ các limiter chi tiết (D-009, D-011).
  5. Header: `Strict-Transport-Security: max-age=31536000` (không preload), `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy` chỉ đặt khi upstream chưa có; bỏ header `Server`.
  6. Giới hạn body 1 MB, riêng `/api/v1/admin/uploads*` 6 MB. Nén zstd/gzip. `/_next/static/*` giữ `Cache-Control` immutable của Next.
  7. Access log JSON ra stdout, URI bỏ query string (chứa token đặt lại mật khẩu, chữ ký VNPay), không log cookie/Authorization. Caddy gửi `X-Request-Id` = UUID của request lên upstream và ghi vào log để đối chiếu với log backend.
- **Hệ quả/rủi ro:** Plugin rate limit là bên thứ ba; bộ đếm trong bộ nhớ của Caddy, reset khi restart.
- **Docs bị ảnh hưởng:** `docs/deployment.md`; `api-contract.md` §1 (rate limit); `architecture.md` §3.

## D-027 Rate limit khi nhiều instance

- **Ngày:** 2026-11-19 · **Người chốt:** Tech Lead theo ủy quyền chủ dự án
- **Trạng thái:** Áp dụng.
- **Bối cảnh:** `express-rate-limit` mặc định dùng MemoryStore, không chia sẻ giữa nhiều instance.
- **Quyết định:** Giữ MemoryStore, chạy 1 instance backend; rate limit ở edge (D-026) là lớp chính cho lưu lượng SSR. KHÔNG thêm Redis ở M7.
- **Hệ quả/rủi ro:** Scale ngang cần store dùng chung (ví dụ Redis) cho cả backend và edge; ngoài phạm vi demo. Restart backend xóa bộ đếm. Job nền đã an toàn nhiều instance nhờ advisory lock.
- **Docs bị ảnh hưởng:** `docs/deployment.md`; `architecture.md`.

## D-028 Captcha tùy chọn cho form liên hệ (Cloudflare Turnstile)

- **Ngày:** 2026-11-19 · **Người chốt:** Tech Lead theo ủy quyền chủ dự án
- **Trạng thái:** Áp dụng.
- **Bối cảnh:** D-023 chấp nhận spam qua nhiều IP và để ngỏ captcha cho M7; không muốn bắt buộc khóa bên thứ ba.
- **Quyết định:**
  1. Env backend `TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY`: có ĐỦ cả hai mới bật; thiếu một hoặc cả hai thì tắt (mặc định tắt, repo không chứa khóa nào). Khi bật, `GET /settings/public` trả `contactCaptcha: { provider: "turnstile", siteKey }`, khi tắt trả `null` (FE đọc site key lúc chạy, không nhúng lúc build).
  2. `POST /contact` nhận thêm `captchaToken` (chuỗi tùy chọn, tối đa 2048 ký tự). Thứ tự: rate limit -> xác thực tùy chọn -> validate (400) -> honeypot (201 giả, không gọi Cloudflare) -> captcha (khi bật) -> lưu.
  3. Captcha bật mà thiếu token hoặc Cloudflare trả `success: false` -> 400 `CAPTCHA_FAILED`. Gọi siteverify lỗi mạng/timeout 5 giây/phản hồi không hợp lệ -> 503 `SERVICE_UNAVAILABLE` (fail closed). Server gọi `https://challenges.cloudflare.com/turnstile/v0/siteverify` bằng `fetch` (POST form `secret`, `response`), KHÔNG gửi IP client, không log token/secret.
  4. FE: chỉ trang `/lien-he` tải script Turnstile khi `contactCaptcha` khác `null`; CSP report-only thêm `https://challenges.cloudflare.com` vào `script-src` và `frame-src`.
- **Hệ quả/rủi ro:** Dữ liệu phản hồi captcha đi qua Cloudflare; khi bật, người dùng chặn script bên thứ ba không gửi được form (hiện thông báo dùng email cửa hàng).
- **Docs bị ảnh hưởng:** `api-contract.md` §2, §14.9, §14.11, §14.12; `backend/.env.example`.

## D-029 Thời hạn lưu tin nhắn liên hệ

- **Ngày:** 2026-11-19 · **Người chốt:** Tech Lead theo ủy quyền chủ dự án
- **Trạng thái:** Áp dụng. Đóng `api-contract.md` §15 mục 15.
- **Bối cảnh:** `ContactMessage` chứa dữ liệu cá nhân (tên, email, SĐT) nhưng chưa có thời hạn lưu.
- **Quyết định:** Env `CONTACT_RETENTION_DAYS` (số nguyên >= 0, mặc định 365; 0 = tắt). Job dọn dẹp mỗi 60 phút (cùng advisory lock của job dọn dẹp) XÓA CỨNG `ContactMessage` có `status` thuộc `RESOLVED`/`SPAM` và `createdAt` < now - N ngày. Tin `NEW`/`IN_PROGRESS` giữ tới khi được xử lý. Không ẩn danh hóa (xóa hẳn đơn giản hơn); AuditLog `contact.update` không chứa nội dung nên giữ nguyên.
- **Hệ quả/rủi ro:** Trang chính sách bảo mật nêu thời hạn 12 tháng; đổi env khác 365 thì phải sửa trang cho khớp. Backup cũ vẫn chứa dữ liệu đã xóa tới khi xoay vòng hết (D-034).
- **Docs bị ảnh hưởng:** `api-contract.md` §14.11, §15 mục 15; `backend/.env.example`; trang chính sách bảo mật.

## D-030 Health và quan sát tối thiểu

- **Ngày:** 2026-11-19 · **Người chốt:** Tech Lead theo ủy quyền chủ dự án
- **Trạng thái:** Áp dụng.
- **Bối cảnh:** Docker healthcheck cần phân biệt tiến trình sống với phụ thuộc DB sẵn sàng; demo chưa cần metrics.
- **Quyết định:**
  1. `GET /api/v1/health` giữ nguyên = readiness (kiểm DB, 503 khi DB lỗi), dùng cho healthcheck container backend. Thêm `GET /api/v1/health/live` = liveness (không chạm DB, luôn 200 `{ data: { status: "ok" } }`). Cả hai miễn rate limit chung, không log truy cập.
  2. Frontend có route `GET /healthz` (Next route handler, không gọi backend, `Cache-Control: no-store`) cho healthcheck container frontend.
  3. Log: backend pino JSON có `reqId` (đã có, nhận `X-Request-Id` hợp lệ từ Caddy), Caddy JSON access log; xem bằng `docker compose logs`. Không có metrics/APM ở M7.
- **Hệ quả/rủi ro:** Không có cảnh báo tự động; chủ dự án tự theo dõi (uptime monitor ngoài nếu cần).
- **Docs bị ảnh hưởng:** `api-contract.md` §3, §15 mục 12; `docs/deployment.md`.

## D-031 Seed dữ liệu demo trên production (opt-in)

- **Ngày:** 2026-11-19 · **Người chốt:** Tech Lead theo ủy quyền chủ dự án
- **Trạng thái:** Áp dụng.
- **Bối cảnh:** Seed hiện bị từ chối ở production; demo cần dữ liệu mẫu nhưng không được lọt mật khẩu mặc định.
- **Quyết định:**
  1. Seed vẫn bị từ chối khi `NODE_ENV=production` TRỪ KHI `SEED_ALLOW_PRODUCTION=true`.
  2. Khi opt-in: cả 3 mật khẩu `SEED_*_PASSWORD` phải >= 12 ký tự, có chữ và số, và KHÔNG trùng giá trị mẫu trong `backend/.env.example`.
  3. Chạy qua service `seed` (profile `tools`) dùng stage `tools` của Dockerfile backend (có tsx + dev deps); image runtime không chứa tsx.
- **Hệ quả/rủi ro:** Dữ liệu demo gồm tài khoản `@beanbox.local`, sản phẩm mẫu, coupon mẫu; chủ dự án đổi mật khẩu/khóa tài khoản mẫu nếu mở demo công khai.
- **Docs bị ảnh hưởng:** `docs/deployment.md`; `backend/.env.example`.

## D-032 CSP ở M7

- **Ngày:** 2026-11-19 · **Người chốt:** Tech Lead theo ủy quyền chủ dự án
- **Trạng thái:** Áp dụng. Cập nhật kế hoạch M7 của D-024.
- **Bối cảnh:** D-024 dự kiến chuyển sang nonce ở M7; nonce buộc mọi trang render động, mất ISR/cache của catalog.
- **Quyết định:**
  1. KHÔNG chuyển sang nonce ở M7. Giữ `Content-Security-Policy-Report-Only` đầy đủ như D-024 (thêm Turnstile theo D-028).
  2. Thêm header `Content-Security-Policy` THỰC THI một tập con không cần nonce: `frame-ancestors 'none'; base-uri 'self'; object-src 'none'`.
- **Hệ quả/rủi ro:** Chưa chặn XSS bằng `script-src`; xem lại khi có nhu cầu (nonce + dynamic hoặc hash).
- **Docs bị ảnh hưởng:** `api-contract.md` §14.12; `architecture.md`.

## D-033 CI (GitHub Actions)

- **Ngày:** 2026-11-19 · **Người chốt:** Tech Lead theo ủy quyền chủ dự án
- **Trạng thái:** Áp dụng. Thay đổi phần "E2E chỉ cục bộ" của D-020.
- **Bối cảnh:** Cần kiểm tra tự động trước khi deploy; chưa muốn deploy tự động.
- **Quyết định:** Các job:
  1. `backend`: Postgres service; `npm ci`, `prisma generate`, `migrate deploy` trên DB trống, kiểm drift bằng `prisma migrate diff --from-migrations ... --to-schema-datamodel ... --shadow-database-url ... --exit-code`, lint, typecheck, test, build.
  2. `frontend`: lint, typecheck, test, build.
  3. `e2e`: Playwright chromium của runner Linux, Postgres service, migrate + seed DB, chạy sau backend/frontend.
  4. `secret-scan`: gitleaks chạy bằng Docker image ghim phiên bản, quét lịch sử git.
  5. `audit`: `npm audit` cả hai phía, chỉ báo cáo, không làm fail.
  6. `docker`: build image backend/frontend/caddy, không push.
  7. Cache npm. KHÔNG có deploy tự động.
- **Hệ quả/rủi ro:** E2E chuyển từ "chỉ cục bộ" (D-020) sang chạy trong CI; E2E có thể chậm/flaky hơn. `audit` không chặn nên cần xem báo cáo thủ công.
- **Docs bị ảnh hưởng:** `testing.md`; `.github/workflows/`.

## D-034 Backup và khôi phục

- **Ngày:** 2026-11-19 · **Người chốt:** Tech Lead theo ủy quyền chủ dự án
- **Trạng thái:** Áp dụng.
- **Bối cảnh:** Demo có dữ liệu thật (đơn, người dùng, ảnh upload) cần sao lưu tối thiểu.
- **Quyết định:**
  1. Script trong `deploy/backup/`: `pg_dump -Fc` hằng ngày, xoay vòng giữ `BACKUP_RETENTION_DAYS` (mặc định 7) ngày; nén thư mục uploads (`tar.gz`) cùng lịch; khôi phục bằng `pg_restore --clean --if-exists --no-owner` vào DB đích (hướng dẫn trong `docs/deployment.md`).
  2. Chạy tùy chọn bằng service `backup` (profile `backup`, vòng lặp ngủ 24 giờ) hoặc cron của VPS gọi `docker compose run --rm backup ...`. Ghi ra `./backups` trên VPS.
- **Hệ quả/rủi ro:** Backup nằm cùng máy với DB; chủ dự án phải tự sao chép ra ngoài (off-site). Phải thử khôi phục định kỳ.
- **Docs bị ảnh hưởng:** `docs/deployment.md`; `deploy/backup/`.

## D-035 Sửa hai rủi ro tồn đọng trước deploy

- **Ngày:** 2026-11-20 · **Người chốt:** Tech Lead theo ủy quyền chủ dự án
- **Trạng thái:** Áp dụng.
- **Bối cảnh:** Rà soát cuối M7 trước khi deploy còn hai rủi ro: slug không tồn tại trả HTTP 200 thay vì 404, và click link trong bảng admin đôi khi không điều hướng.
- **Quyết định:**
  1. **404 trả 200 ở slug không tồn tại.** Nguyên nhân: `loading.tsx` ở gốc (`app/loading.tsx`), `san-pham/[slug]` và `danh-muc/[slug]` tạo Suspense boundary nên response được stream với mã 200 trước khi `notFound()` chạy (Next chỉ chèn meta `noindex` vào trang, không đổi được mã). Đã xóa 3 file này; `tim-kiem/loading.tsx` giữ nguyên. Kết quả đo trên bản build: `/san-pham/<slug lạ>` và `/danh-muc/<slug lạ>` đổi từ 200 sang 404 cho cả user agent thường lẫn Googlebot; slug hợp lệ vẫn 200; redirect 308 cho slug cũ (D-018) giữ nguyên. Đánh đổi: khi chuyển trang phía client tới các trang server động, không còn skeleton ở cấp gốc (người dùng thấy trang cũ cho tới khi trang mới sẵn sàng).
  2. **Click link trong bảng admin không điều hướng.** Đây là lỗi thật, không phải lỗi test: 8 bảng admin dùng ô lọc debounce 400 ms rồi gọi `router.replace` để cập nhật query; timer bắn khi trang danh sách còn mounted trong lúc đang chuyển sang trang chi tiết và kéo người dùng về danh sách. Sửa bằng hook dùng chung `frontend/src/features/admin/useDebouncedUrlInput.ts` (hủy debounce đang chờ khi người dùng click link nội bộ). E2E đổi sang click link thật thay vì điều hướng thẳng bằng URL để bắt được lỗi này.
- **Rủi ro còn lại (đã chấp nhận):**
  - Các trang tĩnh đọc `/settings/public` (giới thiệu, liên hệ, chính sách, footer...) được prerender lúc build bằng cài đặt mặc định vì lúc build image không có backend; tự lành sau ISR 300 giây kể từ lần truy cập đầu tiên sau mốc đó (D-021). Build chậm thêm khoảng 1-2 phút do fetch thất bại. Sau deploy nên mở lướt các trang chính (xem `deployment.md` mục 8).
  - Form liên hệ lấy `contactCaptcha` mới nhất phía client (không dựa vào giá trị prerender) để bật/tắt Turnstile (D-028) có hiệu lực ngay mà không phải chờ ISR.
- **Docs bị ảnh hưởng:** `docs/deployment.md` (mục 8); `docs/testing.md` (E2E).
