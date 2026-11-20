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
- [D-036 Nâng Prisma 7](#d-036-nâng-prisma-7)
- [D-037 Kiểm env trước migrate và redirect cổng Caddy](#d-037-kiểm-env-trước-migrate-và-redirect-cổng-caddy)
- [D-038 Backup off-site](#d-038-backup-off-site)
- [D-039 Giám sát uptime](#d-039-giám-sát-uptime)
- [D-040 CSP ở M8](#d-040-csp-ở-m8)
- [D-041 Ghim rclone trong image backup](#d-041-ghim-rclone-trong-image-backup)
- [D-042 Khóa chống hai backup chạy chồng](#d-042-khóa-chống-hai-backup-chạy-chồng)
- [D-043 Selftest backup trong CI](#d-043-selftest-backup-trong-ci)
- [D-044 Khả năng truy cập và Lighthouse](#d-044-khả-năng-truy-cập-và-lighthouse)
- [D-045 Rà soát bảo mật sau M8](#d-045-rà-soát-bảo-mật-sau-m8)
- [D-046 Gợi ý sản phẩm liên quan và mua cùng](#d-046-gợi-ý-sản-phẩm-liên-quan-và-mua-cùng)
- [D-047 So sánh sản phẩm](#d-047-so-sánh-sản-phẩm)
- [D-048 Kiểm tra giao diện /admin trên mobile (390 và 768)](#d-048-kiểm-tra-giao-diện-admin-trên-mobile-390-và-768)
- [D-049 Khu phân tích kinh doanh chỉ Admin](#d-049-khu-phân-tích-kinh-doanh-chỉ-admin)
- [D-050 Khoảng ngày, kỳ so sánh và gom nhóm của phân tích kinh doanh](#d-050-khoảng-ngày-kỳ-so-sánh-và-gom-nhóm-của-phân-tích-kinh-doanh)
- [D-051 Cơ cấu doanh thu, top sản phẩm, top khách hàng (Bước 2)](#d-051-cơ-cấu-doanh-thu-top-sản-phẩm-top-khách-hàng-bước-2)
- [D-052 Khách hàng, vận hành, tồn kho (Bước 3)](#d-052-khách-hàng-vận-hành-tồn-kho-bước-3)
- [D-053 Hiệu quả mã giảm giá và xuất CSV (Bước 4)](#d-053-hiệu-quả-mã-giảm-giá-và-xuất-csv-bước-4)

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
- **Cập nhật 2026-11-20 (M8):** thêm `GENERAL_RATE_LIMIT_PER_MIN` (mặc định 100) cho rate limit chung; E2E/CI đặt 1000 để chạy liền mạch không chạm giới hạn chung, production giữ mặc định.

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
- **Cập nhật 2026-11-20 (M8):** CSP đầy đủ đã chuyển sang thực thi và không còn header report-only; `/admin` dùng nonce, xem D-040.
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
- **Cập nhật 2026-11-20 (M8):** đã có hướng dẫn giám sát uptime và `deploy/monitoring/check.sh`, xem D-039 (stack vẫn không tự gửi cảnh báo).
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
- **Cập nhật 2026-11-20 (M8):** quyết định không dùng nonce cho toàn site vẫn giữ, nhưng CSP đầy đủ nay được thực thi (storefront giữ `'unsafe-inline'`, `/admin` dùng nonce) và header report-only đã bỏ, xem D-040.
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
- **Cập nhật 2026-11-20 (M8):** lệnh kiểm drift dùng `--to-schema` và bỏ `--shadow-database-url` theo Prisma 7 (D-036); job `docker` build thêm image backup và có thêm job `ops-lint` (shellcheck, `docker compose config`), xem `testing.md`.
- **Docs bị ảnh hưởng:** `testing.md`; `.github/workflows/`.

## D-034 Backup và khôi phục

- **Ngày:** 2026-11-19 · **Người chốt:** Tech Lead theo ủy quyền chủ dự án
- **Trạng thái:** Áp dụng.
- **Bối cảnh:** Demo có dữ liệu thật (đơn, người dùng, ảnh upload) cần sao lưu tối thiểu.
- **Quyết định:**
  1. Script trong `deploy/backup/`: `pg_dump -Fc` hằng ngày, xoay vòng giữ `BACKUP_RETENTION_DAYS` (mặc định 7) ngày; nén thư mục uploads (`tar.gz`) cùng lịch; khôi phục bằng `pg_restore --clean --if-exists --no-owner` vào DB đích (hướng dẫn trong `docs/deployment.md`).
  2. Chạy tùy chọn bằng service `backup` (profile `backup`, vòng lặp ngủ 24 giờ) hoặc cron của VPS gọi `docker compose run --rm backup ...`. Ghi ra `./backups` trên VPS.
- **Hệ quả/rủi ro:** Backup nằm cùng máy với DB; chủ dự án phải tự sao chép ra ngoài (off-site). Phải thử khôi phục định kỳ.
- **Cập nhật 2026-11-20 (M8):** thêm backup off-site mã hóa (tùy chọn, mặc định tắt) thay cho việc chủ dự án tự sao chép, xem D-038.
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

## D-036 Nâng Prisma 7

- **Ngày:** 2026-11-20 · **Người chốt:** Tech Lead theo ủy quyền chủ dự án
- **Trạng thái:** Áp dụng.
- **Bối cảnh:** `npm audit` báo 3 lỗi high theo chuỗi `deepmerge-ts@7.1.5` (GHSA-ggr8-5vv4-36mx) -> `@prisma/config` 6.19.3 -> `prisma` 6.19.3.
- **Quyết định:**
  1. `prisma`, `@prisma/client`, `@prisma/adapter-pg` ~7.10.1.
  2. Generator `prisma-client`, output `src/generated/prisma`, ESM, import có đuôi `.js`. Thư mục sinh ra KHÔNG commit: phải chạy `npx prisma generate` sau mỗi `npm install`/`npm ci`.
  3. `backend/prisma.config.ts`: nạp `.env` bằng dotenv; URL đọc trực tiếp từ `process.env` (không dùng helper `env()` để `generate` chạy được khi không có DB); shadow DB qua `SHADOW_DATABASE_URL`; seed khai báo ở `migrations.seed`.
  4. Driver adapter `pg` (`backend/src/lib/prisma.ts`): `connectionTimeoutMillis` 5000; pool pg mặc định 10 kết nối (Prisma 6 là `num_cpus*2+1`).
  5. CLI `prisma` chuyển sang `dependencies` để `migrate deploy` lúc khởi động container dùng bản cài từ lockfile (bỏ `npm i --no-save`).
  6. CI kiểm drift dùng `--to-schema` thay `--to-schema-datamodel` và bỏ `--shadow-database-url`. Script npm `postprisma:migrate`, `postdb:reset` giữ hành vi generate/seed như cũ (Prisma 7 không còn tự chạy).
  7. Khác biệt hành vi đã xử lý: lỗi P2002 qua adapter không còn `meta.target` mà nằm ở `meta.driverAdapterError.cause.constraint` (`fields` hoặc `index`); `uniqueTarget` (`orders.service.ts`) đọc cả hai, có test `orderUnique.integration.test.ts`.
  8. Schema model và migration không đổi.
- **Hệ quả/rủi ro:** `pg` in cảnh báo deprecation về `client.query()` gọi đồng thời (nằm trong `adapter-pg`, sẽ lỗi ở pg@9): theo dõi bản adapter mới. Prisma 8 đang ở bản RC, chưa nâng. Sau nâng: `npm audit` backend 0 high (còn 7 moderate chỉ ở dev, chuỗi minimatch trong typescript-eslint); `--omit=dev` 0 lỗi.
- **Docs bị ảnh hưởng:** `architecture.md` (bảng stack, §2, §10); `testing.md` (Yêu cầu chung, kiểm drift).

## D-037 Kiểm env trước migrate và redirect cổng Caddy

- **Ngày:** 2026-11-20 · **Người chốt:** Tech Lead theo ủy quyền chủ dự án
- **Trạng thái:** Áp dụng. Đóng rủi ro tồn đọng của M7.
- **Quyết định:**
  1. Entrypoint backend: `node dist/checkEnv.js` -> `prisma migrate deploy` -> `exec node dist/server.js`. Env sai thì dừng TRƯỚC khi áp migration (cập nhật D-025 mục 4).
  2. Caddy: `http_port {$HTTP_PORT:80}` và địa chỉ site `{$SITE_ADDRESS}:{$HTTPS_PORT:443}`; compose map cổng host = cổng container. KHÔNG dùng `https_port`: Caddy coi đó là cổng nội bộ và bỏ cổng khỏi `Location` khi redirect (đã kiểm mã nguồn autohttps). Production vẫn 80/443; `SITE_ADDRESS` chỉ là tên miền.
- **Hệ quả:** Thử cục bộ ở cổng 8080/8443 redirect đúng (`http://localhost:8080` -> `https://localhost:8443/`). Đổi cổng thì phải tạo lại container `caddy`.
- **Docs bị ảnh hưởng:** `deployment.md` mục 4, 15; `testing.md`.

## D-038 Backup off-site

- **Ngày:** 2026-11-20 · **Người chốt:** Tech Lead theo ủy quyền chủ dự án
- **Trạng thái:** Áp dụng. Thay đổi hệ quả "chủ dự án tự sao chép" của D-034.
- **Bối cảnh:** Backup cục bộ cùng máy với DB không chống được mất VPS.
- **Quyết định:**
  1. rclone + age, MẶC ĐỊNH TẮT (chỉ chạy khi `BACKUP_REMOTE` khác rỗng). Cấu hình trong `.env.backup` riêng (mẫu `.env.backup.example`); không nạp `.env.production` vào container backup.
  2. Image `deploy/backup/Dockerfile`: postgres:17 + rclone 1.60.1 + age 1.2.1 từ apt Debian (không ghim).
  3. Mã hóa bằng public key age; VPS không giữ private key. Thiếu recipient hợp lệ thì từ chối đẩy (mã thoát 4), trừ khi `BACKUP_REMOTE_ENCRYPTION=none`.
  4. Tạo `SHA256SUMS`, kiểm bằng `rclone check --one-way` (tùy chọn `download`). Layout `<remote>/<TS>/`.
  5. Xoay vòng remote theo tên thư mục: 30 ngày, luôn giữ tối thiểu 3 bản, chỉ xóa thư mục đúng mẫu TS. Heartbeat tùy chọn.
  6. Khôi phục: `fetch-remote.sh` (kiểm checksum trước khi giải mã) rồi `restore.sh`. Mã thoát `backup.sh`: 0 thành công, 2 cấu hình sai, 3 đẩy/kiểm thất bại, 4 cấu hình off-site sai; bản cục bộ vẫn được giữ với mã 3 và 4.
  7. `deploy/backup/selftest-offsite.sh` tự kiểm toàn luồng bằng remote local.
- **Hệ quả/rủi ro:**
  - Key trên VPS có quyền xóa (script xoay vòng cần): nên bật versioning/object lock ở bucket.
  - Mất private key age = mất mọi bản off-site.
  - rclone/age từ Debian không ghim: chạy lại `selftest-offsite.sh` sau khi build lại image.
  - `SHA256SUMS` nằm cùng remote nên chỉ phát hiện hỏng/thiếu dữ liệu; tính xác thực nội dung dựa vào AEAD của age. Người có quyền ghi remote vẫn có thể thay bằng bản mã hóa khác cho cùng public key (chấp nhận cho demo).
  - Không có khóa chống hai backup chạy chồng.
- **Docs bị ảnh hưởng:** `deployment.md` mục 11; `.env.backup.example`; `testing.md`.
- **Cập nhật 2026-11-20:** mục 2 (apt không ghim) được thay bằng D-041: rclone đã ghim, chỉ age còn từ apt; rủi ro "không có khóa chống chạy chồng" đã xử lý ở D-042; rủi ro "rclone/age không ghim" nay chỉ còn đúng với age (rclone đã ghim).

## D-039 Giám sát uptime

- **Ngày:** 2026-11-20 · **Người chốt:** Tech Lead theo ủy quyền chủ dự án
- **Trạng thái:** Áp dụng. Cập nhật hệ quả "không có cảnh báo tự động" của D-030.
- **Quyết định:** Chỉ tài liệu và `deploy/monitoring/check.sh`; KHÔNG thêm Uptime Kuma vào `docker-compose.prod.yml` (monitor cùng VPS không phát hiện VPS chết; thêm một giao diện web phải bảo vệ). Khuyến nghị dịch vụ ngoài hoặc Uptime Kuma ở máy khác. Bốn monitor: (1) `/api/v1/health` trả 200 và có `"db":"up"`; (2) trang chủ trả 200 có từ khóa; (3) TLS còn >= 14 ngày; (4) heartbeat backup chu kỳ 24 giờ. Cảnh báo sau 2-3 lần lỗi liên tiếp.
- **Hệ quả:** Cảnh báo phụ thuộc dịch vụ ngoài do chủ dự án cấu hình; `check.sh` không tự thử lại.
- **Docs bị ảnh hưởng:** `deployment.md` mục 16; `testing.md`.

## D-040 CSP ở M8

- **Ngày:** 2026-11-20 · **Người chốt:** Tech Lead theo ủy quyền chủ dự án
- **Trạng thái:** Áp dụng. Thay D-032; cập nhật D-024.
- **Bối cảnh:** Nonce cho toàn site buộc mọi trang render động, mất static/ISR (D-032). Hash không khả thi vì script inline của Next chứa payload RSC khác nhau theo trang và theo build.
- **Quyết định:**
  1. **Storefront:** CSP đầy đủ chuyển sang THỰC THI; `script-src` giữ `'unsafe-inline'` (thêm `'unsafe-eval'` chỉ ở dev) và cho `https://challenges.cloudflare.com` (Turnstile).
  2. **`/admin`:** CSP thực thi với nonce theo request + `'strict-dynamic'`, đặt ở `frontend/src/proxy.ts` (Next 16, matcher chỉ `/admin`); admin layout gọi `connection()` để ép render động. Bảng route storefront không đổi, chỉ `/admin/*` thành dynamic. Hàm dựng policy dùng chung nằm ở `frontend/src/lib/csp.ts`.
  3. **Bỏ `Content-Security-Policy-Report-Only`.** Phần còn lại (bỏ `'unsafe-inline'` ở storefront) nếu để report-only sẽ báo vi phạm ở mọi lượt xem, chỉ là nhiễu. Policy thực thi có `report-uri /api/v1/csp-report` (D-024 mục 3 giữ nguyên).
  4. **Vào `/admin` từ storefront (link, và chuyển hướng sau đăng nhập) bằng tải trang đầy đủ, không client-side**, vì CSP gắn với tài liệu lúc tải.
  5. **Admin `frame-src 'self' https://challenges.cloudflare.com`** để điều hướng ngược từ admin về storefront không làm vỡ form liên hệ (Turnstile).
- **Hệ quả/rủi ro:**
  - Storefront chưa chặn XSS inline (`'unsafe-inline'` cho script) và style.
  - Nếu có đường vào `/admin` bằng điều hướng client-side chưa phát hiện thì trang admin chạy với CSP của storefront cho tới khi tải lại.
  - Caddy không được đặt thêm header CSP (sẽ chồng policy).
- **Kiểm thử:** `frontend/e2e/csp.spec.ts` (0 vi phạm CSP trên các trang storefront và admin chính), xem `testing.md`.
- **Docs bị ảnh hưởng:** `api-contract.md` §14.12; `architecture.md` (§4, ADR 13); `testing.md`; `deployment.md`.

## D-041 Ghim rclone trong image backup

- **Ngày:** 2026-11-20 · **Người chốt:** Tech Lead theo ủy quyền chủ dự án
- **Trạng thái:** Áp dụng. Thay mục 2 của D-038.
- **Bối cảnh:** rclone từ apt Debian (1.60.1) cũ và đổi theo lần build; một công cụ ghi/xóa trên remote backup cần phiên bản biết trước.
- **Quyết định:** `deploy/backup/Dockerfile` đa tầng. Tầng tải (FROM postgres:17) lấy zip chính thức `https://downloads.rclone.org/v${RCLONE_VERSION}/rclone-v${RCLONE_VERSION}-linux-${ARCH}.zip` và kiểm `sha256sum -c` với checksum GHI CỨNG trong Dockerfile (`RCLONE_SHA256_AMD64`, `RCLONE_SHA256_ARM64`, chọn theo `TARGETARCH`; kiến trúc khác thì build lỗi). Không tải `SHA256SUMS` lúc build để tự so (cùng nguồn nên vô nghĩa về toàn vẹn). Hiện ghim v1.76.0 (amd64 `b00f00b3266c3764413afe599d3ec316f6f43b3e0ea8a0bc1d186d2133e46df7`, arm64 `ee169016675e23a69d77240565133ff7dbc9b33d16fa8f7053d4af39f1eaeb78`); checksum lấy từ `SHA256SUMS` của bản đó, chữ ký GPG của file này đã kiểm bằng khóa công khai của rclone (vân tay `FBF7 37EC E9F8 AB18 604B D2AC 9393 5E02 FF3B 54FA`, trùng trang `rclone.org/release_signing`), và zip amd64 đã được tải riêng để tính sha256 đối chiếu. Tầng cuối: postgres:17 + `age curl ca-certificates` từ apt, `COPY` binary vào `/usr/local/bin/rclone`. **Nâng bản:** đổi `RCLONE_VERSION` + hai checksum (kiểm chữ ký `SHA256SUMS` như trên), build lại, chạy `selftest-offsite.sh` (CI cũng chạy, D-043).
- **Hệ quả/rủi ro:**
  - age vẫn từ apt Debian, không ghim (ngoài phạm vi).
  - Build cần truy cập `downloads.rclone.org`; nếu bản bị gỡ khỏi máy chủ thì build lỗi cho tới khi nâng bản.
  - Không có kiểm chữ ký GPG TRONG lúc build (chỉ khi nâng bản, thủ công); tính toàn vẹn dựa vào checksum đã commit.
  - Chỉ amd64/arm64 (thêm kiến trúc phải thêm checksum).
- **Docs bị ảnh hưởng:** `deployment.md` mục 11; `testing.md`; comment trong `docker-compose.prod.yml`.

## D-042 Khóa chống hai backup chạy chồng

- **Ngày:** 2026-11-20 · **Người chốt:** Tech Lead theo ủy quyền chủ dự án
- **Trạng thái:** Áp dụng. Đóng rủi ro "không có khóa chống chạy chồng" của D-038.
- **Bối cảnh:** Vòng lặp của service `backup`, cron và `docker compose run --rm backup ...` có thể chạy cùng lúc, tạo hai bản chồng nhau và xoay vòng remote lẫn nhau.
- **Quyết định:** Khóa nằm trong `backup.sh`: sau kiểm cấu hình (mã 2) và `mkdir -p "$BACKUP_DIR"`, trước `pg_dump`, `exec 9>"$BACKUP_DIR/.backup.lock"` rồi `flock -n 9`. Không lấy được khóa thì ghi log "đã có backup khác đang chạy, bỏ qua lần này", thoát mã MỚI `5`, không tạo dump, không xóa gì, KHÔNG gọi heartbeat (cả ok lẫn fail; lần chạy đang giữ khóa sẽ báo, và cờ riêng chứ không dựa vào mã thoát để tránh nhầm với mã của `pg_dump`/`tar`). `loop.sh` in mã 5 như thông tin, không phải "LỖI". Không có lệnh `flock` thì cảnh báo và chạy không khóa. `selftest-offsite.sh` có mục (h).
- **Hệ quả/rủi ro:**
  - Chỉ có hiệu lực giữa các tiến trình/container dùng chung `./backups` trên cùng một host Linux (kiểm bằng hai container với bind mount trên Docker Desktop và named volume; không bảo đảm trên NFS/SMB hay nhiều host).
  - `restore.sh` KHÔNG lấy khóa: restore khi backup đang chạy vẫn có thể xảy ra (rủi ro còn lại, đã dặn trong `deployment.md`).
  - Backup bị treo giữ khóa mãi thì các lần sau đều bị bỏ qua với mã 5 và không có heartbeat, nên monitor heartbeat (D-039) sẽ báo thiếu ping.
- **Docs bị ảnh hưởng:** `deployment.md` mục 11; `testing.md`.

## D-043 Selftest backup trong CI

- **Ngày:** 2026-11-20 · **Người chốt:** Tech Lead theo ủy quyền chủ dự án
- **Trạng thái:** Áp dụng.
- **Bối cảnh:** Selftest chỉ chạy tay nên đổi phiên bản rclone ghim (D-041) hoặc sửa `backup.sh` có thể hỏng mà không ai biết.
- **Quyết định:** Job `docker` của `.github/workflows/ci.yml` có `services: postgres` (postgres:17, giá trị giả chỉ dành cho CI, health-cmd `pg_isready`) và step sau "Smoke image backup" chạy `selftest-offsite.sh` trong image `beanbox-backup:ci` (`--network host`, `PG*` trỏ `localhost:5432`, mount `deploy/backup` chỉ đọc, `timeout-minutes: 5`). Mô phỏng cục bộ (network + container Postgres tạm) cho 46 PASS, 0 FAIL qua 3 lần chạy liên tiếp.
- **Hệ quả/rủi ro:** Thêm khoảng 20 giây (đo cục bộ) cho job `docker`; selftest cần mạng nội bộ tới Postgres, nếu service lỗi thì step fail (không bị che). `.sh` phải là LF (`.gitattributes` đã đặt).
- **Docs bị ảnh hưởng:** `testing.md` (mục CI).

## D-044 Khả năng truy cập và Lighthouse

- **Ngày:** 2026-11-20 · **Người chốt:** Tech Lead theo ủy quyền chủ dự án
- **Trạng thái:** Áp dụng.
- **Bối cảnh:** Chưa có kiểm tra a11y tự động; chưa có số đo Lighthouse. Cần một chuẩn rõ và một lưới chống hồi quy trước khi mở cho khách thật.
- **Quyết định:**
  1. **Chuẩn:** WCAG 2.1 mức AA cho storefront (không gồm `/admin`, vốn dành cho nhân viên nội bộ).
  2. **Axe tự động** (`frontend/e2e/a11y.spec.ts`, `@axe-core/playwright` ghim 4.14.0, tag `wcag2a/2aa/21a/21aa`) chạy trong E2E và CI cho 16 trang storefront. FAIL khi có vi phạm `serious`/`critical`; `moderate`/`minor` chỉ in ra (axe hay báo nhầm ở mức này và chúng không chặn người dùng). Spec dùng thêm 1 lượt đăng nhập customer.
  3. **Lỗi tìm được và đã sửa:** (a) trang chủ, nút "Khám phá cà phê hạt" chữ nâu đậm trên nền xanh rêu (contrast 1.88:1, `serious`): class `bg-cream-100` thua `bg-moss-700` của variant primary, đổi thành `!bg-cream-100` đúng như thiết kế dự định (`app/page.tsx`); (b) chi tiết sản phẩm, 5 nút lọc theo sao có `aria-label` không chứa chữ hiển thị (`label-content-name-mismatch`, `serious`): bỏ `aria-label`, dùng đoạn `sr-only` làm tên (`ReviewSummaryPanel.tsx`). Rà mã nguồn (axe không bắt) bổ sung: ô mã giảm giá và ghi chú đơn có `aria-invalid` nhưng thiếu `aria-describedby` tới thông báo lỗi; ô tìm kiếm không đóng gợi ý khi Tab ra ngoài; `<main>` thêm `tabIndex={-1}` để skip link đặt focus chắc chắn.
  4. **Lighthouse** (13.6.0, đo trên production build, Edge headless, cả mobile và desktop): sửa `favicon.ico` 404 làm Best Practices 96 (thêm `app/icon.svg`), `fetchPriority="high"` cho ảnh ưu tiên (LCP) ở `ProductImage`, `<h2>` ẩn trước lưới sản phẩm để thứ tự tiêu đề h1 -> h2 -> h3 đúng, và lỗi contrast ở trang chủ. Trước -> sau: Accessibility trang chủ 96 -> 100, danh mục/tìm kiếm mobile 98 -> 100; Best Practices mọi trang 96 -> 100; Performance danh mục mobile 91 -> 92, tìm kiếm mobile 91 -> 95 (trong biên dao động); các ô khác không đổi (đã 100). Bảng điểm sau khi sửa và điều kiện đo ở `testing.md`.
  5. **Lighthouse đo thủ công, KHÔNG đưa vào CI:** điểm Performance dao động vài điểm giữa các lần đo (throttling mô phỏng, tải máy runner chia sẻ), nên ngưỡng cứng sẽ làm CI chập chờn; còn lỗi a11y thật đã có axe chặn. Đo lại trước mỗi lần phát hành lớn bằng lệnh ở `testing.md`.
  6. **Không sửa / chấp nhận:**
     - SEO 66 ở `/tim-kiem`: chủ ý `noindex` (tránh lập chỉ mục kết quả tìm kiếm vô hạn).
     - `bf-cache` (2 lý do "Not actionable"): tài liệu chính và một request JS trả `Cache-Control: no-store` (Lighthouse gắn nhãn "Not actionable"); chưa điều tra nguồn, đổi header cache có thể ảnh hưởng dữ liệu phiên nên để ngoài phạm vi.
     - `unused-javascript` (~25 KiB), `legacy-javascript-insight` (~14 KiB), `render-blocking-insight` (CSS của Next, ~120 ms mô phỏng), `network-dependency-tree`, `cache-insight`: thuộc runtime/bundle của Next.js và cấu hình cache tĩnh; không có thay đổi rủi ro thấp trong phạm vi (không đổi kiến trúc render, không thêm nonce).
     - LCP mobile 3.0 đến 3.5 giây ở trang danh sách: do mô phỏng Slow 4G + CPU 4x cộng CSS chặn render; phần thật (tải ảnh, trễ hiển thị) chỉ khoảng 0.14 giây.
     - Ảnh sản phẩm seed dùng SVG dùng chung (`unoptimized`), nên chưa đánh giá được `sizes`/định dạng ảnh thật; đo lại khi có ảnh thật.
- **Hệ quả/rủi ro:**
  - Tổng lượt đăng nhập của bộ E2E là 5, đúng bằng giới hạn 5/phút/IP; thêm lượt hoặc CI thử lại cả bộ trong vòng 1 phút có thể gặp 429.
  - Axe chỉ bắt được khoảng một phần vấn đề a11y; kiểm bằng bàn phím/trình đọc màn hình thật vẫn cần khi thêm thành phần tương tác mới.
  - Thêm 1 devDependency (`@axe-core/playwright`), không đổi runtime.
- **Cập nhật 2026-11-20:** rủi ro 429 đăng nhập E2E đã xử lý ở D-045 (mục 5, `AUTH_RATE_LIMIT_PER_MIN=30` cho E2E/CI); `a11y.spec.ts` nay quét 18 trang (thêm `/so-sanh` và danh mục khi thanh so sánh hiện, D-047).
- **Docs bị ảnh hưởng:** `testing.md` (mục "Khả năng truy cập và Lighthouse", mục rate limit).

## D-045 Rà soát bảo mật sau M8

- **Ngày:** 2026-11-20 · **Người chốt:** Tech Lead theo ủy quyền chủ dự án
- **Trạng thái:** Áp dụng.
- **Bối cảnh:** Sau M8 cần một lượt rà soát bảo mật toàn diện trước khi mở cho khách thật. Phần lớn đã tốt; còn bốn điểm cần sửa (B1 đến B4).
- **Quyết định:**
  1. **Phạm vi đã rà (không có lỗ hổng nghiêm trọng):** xác thực/phiên (argon2id, JWT cố định HS256, rotation + reuse detection); RBAC (router `/admin` áp `requireAuth` + `requireStaff`, `requireAdmin` cho thao tác xóa/hoàn tiền, ma trận `securityAuthz`); IDOR (đơn, địa chỉ, giỏ, review, wishlist, tra cứu đơn guest đều lọc theo chủ sở hữu hoặc mã + SĐT); validate input (zod, giới hạn body 100kb, 1MB cho webhook, 6MB cho upload); upload (kiểm magic bytes, tên file ngẫu nhiên, `nosniff`); webhook thanh toán (chữ ký HMAC so sánh hằng thời gian, chống replay 300 giây, đối chiếu số tiền và providerRef); CSP (D-040); rate limit; secrets (env qua zod, chặn giá trị `dev-` và `sk_live_` ở production, gitleaks); XSS (JSON-LD escape, review là văn bản thuần); open redirect (`safeRedirect`, `href` banner chỉ nội bộ); email (escape HTML).
  2. **B1 `Cache-Control: no-store`:** middleware `apiCacheControl` trong `backend/src/app.ts` (sau `requestId`, chỉ `/api/v1`) đặt `no-store` mặc định cho mọi response, trừ GET/HEAD công khai (`/categories*`, `/brands`, `/products`, `/products/:slug`, `/products/:slug/reviews`, `/search/suggest`, `/locations/*`, `/settings/public`, `/health*`). `/products/:slug/reviews/me` (cần đăng nhập) vẫn `no-store`. Route tự đặt header (locations, settings/public, admin) giữ nguyên. `npm run build` frontend cho bảng route và `prerender-manifest` giống hệt trước khi sửa (ISR catalog không đổi, vì mọi `serverGet` của SSR chỉ gọi các path được loại trừ). Test: `cacheControl.integration.test.ts`.
  3. **B2 access token gắn với phiên:** `authenticate` (`middlewares/auth.ts`) đọc user kèm một refresh token còn sống của family `sid` (chưa thu hồi, chưa hết hạn) trong cùng truy vấn; không có -> 401 `UNAUTHORIZED`. Thứ tự: user không tồn tại 401, `DISABLED` 403 `ACCOUNT_DISABLED`, rồi phiên 401. Logout, reset/đổi mật khẩu, phát hiện dùng lại refresh token, admin khóa/đổi role user nên chặn access token ngay (trước đây tối đa 15 phút). Đã xác nhận `refresh()` thu hồi token cũ và tạo token mới trong cùng transaction, nên family luôn còn một token sống; không đổi hành vi refresh. Fetch wrapper frontend đã đúng (401 `UNAUTHORIZED` -> refresh single-flight -> thất bại thì xóa token, xóa cờ phiên, gọi `onLogout`), không cần sửa. Test: `sessionRevocation.integration.test.ts` và cập nhật `authMiddleware`, `securityHardening`, `adminUsers` (token của user bị đổi role giờ trả 401 thay vì 403; ở hai test đua "A khóa B và B khóa A" bên thua có thể nhận 401).
  4. **B3:** `NODE_ENV=production` với `COOKIE_SECURE=false` là lỗi cấu hình (thông báo không in secret), cùng mẫu `superRefine` với chặn `dev-`. Test: `envSecrets.test.ts`; `authLib.test.ts` cập nhật.
  5. **B4:** env `AUTH_RATE_LIMIT_PER_MIN` (số nguyên dương, mặc định 5) cho `limiters.sensitive`; `AppOptions.authRateLimit` vẫn ưu tiên. Playwright và job `e2e` của CI đặt 30 để bộ E2E (5 lượt đăng nhập) không dính 429 khi CI thử lại; production giữ 5.
  6. **Chấp nhận, không sửa:**
     - (a) Lộ sự tồn tại tài khoản qua `ACCOUNT_LOCKED` (đăng nhập) và `EMAIL_TAKEN` (đăng ký): đăng ký vốn đã lộ, ưu tiên UX; có rate limit.
     - (b) Khóa tài khoản 15 phút (FR-AUTH-08) có thể bị lợi dụng để khóa người khác; giảm nhẹ bằng rate limit IP.
     - (c) Storefront `script-src 'unsafe-inline'` (D-040) để giữ static/ISR.
     - (d) Ảnh polyglot vì không re-encode (D-013); phục vụ với `nosniff`.
     - (e) Rate limit dùng MemoryStore, một instance (D-027); chạy nhiều instance phải đổi store.
     - (f) Access token trong memory vẫn đọc được nếu có XSS (giảm nhẹ bằng CSP); thu hồi phiên có hiệu lực ngay nhưng không chặn kẻ đã lấy token trước đó.
     - (g) `npm audit`: backend 10 cảnh báo (7 moderate, 3 high), frontend 7 moderate. Phụ thuộc production có lỗi chỉ ở backend: 3 high trong chuỗi `prisma` -> `@prisma/config` -> `effect` (ReDoS ở `Schema.TemplateLiteral`), nằm ở CLI/cấu hình Prisma (chạy khi migrate/generate), không nằm trên đường xử lý request; bản "sửa" npm đề xuất là hạ `prisma` xuống 6.12 (major, sai hướng) nên không áp dụng. Phần còn lại là `typescript-eslint`/`minimatch` (devDependency, chỉ lint) mà bản vá cần `minimatch` 10 -> 11 (major) nên không nâng. Theo dõi khi có bản Prisma mới. Frontend `--omit=dev`: 0 cảnh báo.
     - (h) Các GET công khai không có `Cache-Control` riêng nên trung gian có thể cache theo heuristic; chấp nhận vì là dữ liệu công khai. Lỗi (4xx/5xx) của các GET này cũng không có `no-store`.
     - (i) Logout khi không còn cookie refresh (đã mất) không thu hồi phiên phía server; chỉ phiên có cookie mới bị thu hồi.
- **Kết quả kiểm tra bổ sung:** gitleaks 8.30.0 (lệnh trong `testing.md`) quét 11 commit: không có phát hiện. `git ls-files` không chứa `.env` hay khóa riêng (chỉ `.env.example` và `.env.production.example`).
- **Hệ quả/rủi ro:**
  - Mỗi request đã xác thực thêm một điều kiện (subselect có index `familyId`) vào truy vấn user hiện có, không thêm round-trip.
  - Admin khóa/đổi role user nay trả 401 (không còn 403 khi đổi role) cho access token cũ của user đó; FE xử lý như hết phiên.
  - Endpoint GET công khai mới phải được thêm vào `PUBLIC_CACHEABLE` (`backend/src/app.ts`) nếu muốn cho phép cache; mặc định là `no-store` (an toàn).
  - Môi trường production đang đặt `COOKIE_SECURE=false` sẽ không khởi động được (chủ ý).
- **Docs bị ảnh hưởng:** `architecture.md` §4, §8 (0.8), `api-contract.md` §1, §5 (0.11), `deployment.md` (bảng env, sự cố thường gặp), `testing.md` (rate limit, test bảo mật), `.env.example`, `.env.production.example`.

## D-046 Gợi ý sản phẩm liên quan và mua cùng

- **Ngày:** 2026-11-20 · **Người chốt:** Tech Lead theo ủy quyền chủ dự án
- **Trạng thái:** Áp dụng.
- **Bối cảnh:** `related` ở trang sản phẩm chỉ lấy cùng danh mục theo `soldCount`, nên ít giá trị bán chéo. Cửa hàng bán dụng cụ, phụ kiện và hạt cà phê: người mua phin thường cần cà phê, người mua hạt cần dụng cụ pha. Trong các hướng có thể làm thêm ở lượt này, chọn gợi ý sản phẩm vì dùng dữ liệu đã có (sản phẩm, đơn hàng), không cần dịch vụ ngoài và tác động trực tiếp tới giá trị đơn. Không chọn đăng nhập Google (cần OAuth client thật của chủ dự án, chưa có) và blog (cần CMS và quy trình biên tập nội dung, không phải việc kỹ thuật thuần).
- **Quyết định:**
  1. **`related` theo điểm nội dung** (không đổi shape, tối đa 8). Ứng viên: sản phẩm hiển thị, khác chính nó, cùng danh mục/danh mục cha/brand hoặc có tag chung, lấy tối đa 100 theo `soldCount` rồi chấm trong bộ nhớ (một truy vấn, không N+1). Điểm: cùng danh mục +4; cùng danh mục cha (khác danh mục) +2; cùng brand +2; mỗi tag trùng +1 (tối đa +3, không phân biệt hoa thường); nếu cả hai là cà phê: cùng mức rang, cùng xuất xứ, cùng cách sơ chế, có chung cách pha, mỗi cái +1; giá trong ±30% +1. Bỏ điểm 0; sắp còn hàng trước, điểm giảm dần, `soldCount` giảm dần, `id` tăng dần. Hàm thuần `backend/src/lib/related.ts` có unit test.
  2. **`GET /products/:slug/bought-together`** (công khai, `limit` 1–8, mặc định 4) dựa trên đơn thật: đếm số khách khác nhau (user theo `userId`, guest theo `lower(contactEmail)`) có đơn chứa cả hai sản phẩm, trừ đơn `CANCELLED`/`PENDING_PAYMENT`, trong 365 ngày. Truy vấn tổng hợp bằng `$queryRaw` dạng tagged template (tham số hóa), rồi lấy chi tiết bằng `findMany` + `toListItem`. Index `OrderItem(productId)` và `OrderItem(orderId)` đã có nên không cần migration.
  3. **Ngưỡng riêng tư >= 2 khách** (hằng `BOUGHT_TOGETHER_MIN_CUSTOMERS`): một đơn lẻ không được lộ thành "có người mua X cùng Y". Một khách mua nhiều đơn vẫn chỉ là một khách.
  4. **Không lấp chỗ trống:** không đủ dữ liệu thì trả ít hơn hoặc rỗng, không chèn sản phẩm phổ biến (đã có "Sản phẩm liên quan" ngay bên dưới). FE không render section khi rỗng hoặc lỗi.
  5. Chỉ trả sản phẩm hiển thị và còn hàng. Endpoint thêm vào `PUBLIC_CACHEABLE` (D-045) vì là dữ liệu công khai đã qua ngưỡng; chỉ áp limiter chung.
  6. FE: section "Thường được mua cùng" (h2) đặt trước "Sản phẩm liên quan", lấy dữ liệu phía server cùng cơ chế revalidate 60 giây như dữ liệu sản phẩm; kiến trúc render trang sản phẩm không đổi (bảng route `npm run build` trước và sau giống hệt).
  7. **Cách ly cổng E2E:** `playwright.config.ts` nhận `E2E_API_PORT` (mặc định 4000) và `E2E_WEB_PORT` (mặc định 3000) để chạy E2E song song với backend/frontend dev đang chiếm cổng mặc định (xem `testing.md`). Mặc định không đổi hành vi, kể cả CI.
- **Hệ quả/rủi ro:**
  - Trên dữ liệu demo, section "Thường được mua cùng" **trống** cho tới khi có đơn thật từ ít nhất 2 khách khác nhau; seed không tạo đơn giả (chủ ý).
  - Truy vấn tổng hợp chạy mỗi request (join `OrderItem` hai lần), không cache phía server; chấp nhận ở quy mô hiện tại, và FE gọi qua revalidate 60 giây nên tải thực tế thấp. Cần theo dõi nếu số đơn lớn (có thể thêm bảng đồng xuất hiện hoặc cache).
  - Cửa sổ 365 ngày và ngưỡng 2 là hằng cố định, chưa cấu hình được qua settings.
  - Khách đăng nhập mua thêm với tư cách khách vãng lai (email khác) có thể bị đếm là hai khách; chấp nhận vì chỉ làm nới nhẹ ngưỡng.
  - Điểm `related` là heuristic cố định, chưa đo hiệu quả (chưa có phân tích click).
- **Docs bị ảnh hưởng:** `api-contract.md` §4.4, §4.6 (0.12), `architecture.md`, `testing.md` (E2E, test mới), `README.md`.

## D-047 So sánh sản phẩm

- **Ngày:** 2026-11-20 · **Người chốt:** Tech Lead theo ủy quyền chủ dự án
- **Trạng thái:** Áp dụng.
- **Bối cảnh:** Khách mua cà phê hạt thường phân vân giữa vài loại (xuất xứ, sơ chế, mức rang, hương vị, cách pha) và giữa các dụng cụ cùng nhóm (giá, biến thể, khối lượng). Hiện phải mở từng trang sản phẩm để đối chiếu. Dữ liệu đã có sẵn trong `Product`, `ProductVariant`, `CoffeeProfile`, nên chỉ cần thêm một endpoint đọc và giao diện.
- **Quyết định:**
  1. **Lưu danh sách ở localStorage trình duyệt** (khóa `bb_compare_v1`), không cần đăng nhập và không có bảng DB mới. Mỗi phần tử `{ slug, name, imageUrl, categoryName }` chỉ để vẽ thanh so sánh; parse an toàn (dữ liệu hỏng -> rỗng, bỏ phần tử sai, bỏ trùng), đồng bộ giữa tab bằng sự kiện `storage`.
  2. **Tối đa 4 sản phẩm** (tối thiểu 2 để xem bảng). Thêm món thứ 5 bị từ chối kèm thông báo "Chỉ so sánh tối đa 4 sản phẩm". Giới hạn 4 giữ bảng đọc được trên màn hình nhỏ.
  3. **Cho phép so sánh khác danh mục**, hiện ghi chú "Các sản phẩm thuộc danh mục khác nhau, một số thông số có thể không tương đương." thay vì chặn (người dùng có thể muốn so máy pha với hạt về giá). Nhóm "Thông tin cà phê" chỉ hiện khi có ít nhất một sản phẩm là cà phê; thiếu dữ liệu hiện "—".
  4. **URL chia sẻ được:** trang `/so-sanh?sp=slug1,slug2,...`. Không có `sp` thì lấy từ localStorage rồi `router.replace` sang URL tương ứng. Trang là `noindex`, nằm trong `PRIVATE_PATHS` của robots và không có trong sitemap (nội dung phụ thuộc tham số, không phải trang để lập chỉ mục).
  5. **Endpoint gộp `GET /products/compare?slugs=` thay vì gọi N lần chi tiết:** một request, một `findMany`, không N+1, không trả `description` (nặng, không cần cho bảng), không trả `stock` chính xác và không lộ `salePrice` của đợt sale chưa bắt đầu (cùng quy tắc §4 "Làm rõ M1"). Slug không hiển thị vào `missing` thay vì 404 cả request để trang so sánh vẫn hiển thị phần còn lại, và FE tự bỏ các slug đó khỏi danh sách đã chọn. Route công khai nên thêm vào `PUBLIC_CACHEABLE` (D-045; regex hiện có đã khớp), chỉ áp limiter chung.
  6. **Slug dành riêng `compare`:** route `/products/compare` khai báo trước `/products/:slug` nên sản phẩm có slug `compare` sẽ không bao giờ truy cập được. Admin tạo/đổi slug sản phẩm thành `compare` bị từ chối (400 `VALIDATION_ERROR`, field `slug`); seed không dùng slug này. Danh sách dành riêng là hằng `RESERVED_PRODUCT_SLUGS` ở `admin/products/products.service.ts`.
  7. **Giao diện:** nút "So sánh" (toggle, `aria-pressed`) trên thẻ sản phẩm và trang chi tiết; thanh cố định ở đáy (`<aside aria-label="So sánh sản phẩm">`) ẩn ở `/so-sanh`, `/thanh-toan*`, `/admin*` và chừa khoảng đệm cuối trang để không che footer; bảng `<table>` có `<caption>`, `th scope`, cột tiêu đề hàng dính trái, cuộn ngang trong vùng focus được; công tắc "Chỉ hiện điểm khác nhau".
- **Hệ quả/rủi ro:**
  - Danh sách so sánh không đồng bộ giữa thiết bị/trình duyệt và mất khi xóa dữ liệu trình duyệt (chủ ý, đổi lấy việc không cần đăng nhập).
  - Dữ liệu trong store (tên, ảnh) có thể cũ; trang `/so-sanh` luôn lấy dữ liệu mới từ API nên bảng luôn đúng, chỉ thanh so sánh có thể hiện tên/ảnh cũ cho tới khi vào trang so sánh. Tên sản phẩm bị đổi slug sẽ rơi vào `missing` (không tra slug cũ) và bị gỡ khỏi danh sách.
  - Trang so sánh gọi API phía client nên không có nội dung khi tắt JavaScript và không được SSR (chấp nhận vì `noindex`).
  - Mỗi lần xem là một request tới DB (không cache phía server); chỉ một `findMany` tối đa 4 sản phẩm nên tải thấp.
  - Một sản phẩm tên `compare` đã tồn tại sẵn trước khi triển khai sẽ bị che (không có trong seed; chưa có migration kiểm tra dữ liệu thật).
- **Docs bị ảnh hưởng:** `api-contract.md` §1, §4.7, §12.4 (0.13), `architecture.md`, `testing.md` (E2E `compare.spec.ts`), `README.md`.

## D-048 Kiểm tra giao diện /admin trên mobile (390 và 768)

- **Ngày:** 2026-11-20 · **Người chốt:** Tech Lead theo ủy quyền chủ dự án
- **Trạng thái:** Áp dụng.
- **Bối cảnh:** Ở M9 bảng so sánh gặp lỗi: phần tử `sr-only` (`position: absolute`) nằm trong vùng `overflow-x-auto` không có containing block định vị nên không bị vùng cuộn cắt, thò ra ngoài và làm cả trang cuộn ngang. Các bảng admin có cùng mẫu (cột "Thao tác" dùng `sr-only` trong `th`) và chưa ai kiểm admin ở màn hình nhỏ. Ở 768px (đúng breakpoint `md`) bảng `md:block` hiện ra nên dễ tràn nhất.
- **Quyết định:**
  1. **Quy ước vùng cuộn ngang phải `relative`:** mọi phần tử có `overflow-x-auto` (hoặc `overflow-auto`) chứa nội dung định vị tuyệt đối, kể cả `sr-only` trong `th`/`caption`, phải có thêm class `relative` để làm containing block. Áp dụng cho tất cả vùng cuộn bảng ở admin và `RevenueChart`.
  2. **Chuẩn kiểm viewport admin:** mọi trang `/admin/**` phải không cuộn ngang toàn trang (`documentElement.scrollWidth <= clientWidth`, không dung sai) ở **390x844** và **768x1024**. Kiểm tự động bằng `frontend/e2e/admin-mobile.spec.ts` (1 lượt đăng nhập admin, 20 trang chính + chi tiết, khẳng định mềm để một lần chạy liệt kê hết trang lỗi, kèm danh sách phần tử gây tràn). Bộ đo tính cả chữ dài không ngắt dòng tràn khỏi hộp của nó (không chỉ `getBoundingClientRect` của phần tử), và bỏ qua phần tử bị vùng overflow cắt thật (phần tử absolute chỉ bị cắt từ containing block của nó trở lên). Spec thêm kiểm khả dụng ở 390: menu "Menu quản trị" mở được, mọi link điều hướng nằm trong viewport và cao >= 40px, nút "Thêm sản phẩm" nằm trong viewport, hộp thoại điều chỉnh tồn kho vừa màn hình.
  3. **Đã sửa (chỉ CSS/markup, không đổi nghiệp vụ, API, chữ hay điều hướng):**
     - Thêm `relative` cho vùng cuộn bảng: `AdminAuditLog` (2 chỗ), `AdminBrands`, `AdminContactMessages`, `AdminCoupons`, `AdminInventory`, `AdminMovements`, `AdminOrders`, `AdminProducts`, `AdminUsers`, `VariantsSection`, `RevenueChart`. Lỗi tái hiện được ở `/admin/thuong-hieu` ở 768 khi tên/slug thương hiệu dài làm bảng rộng hơn khung (scrollWidth 2638 so với 768, phần tử `span.sr-only` "Thao tác" thò ra).
     - Chuỗi dài không ngắt dòng trong thẻ mobile và chi tiết: `min-w-0` cho ô lưới `Field` của `AdminContactDetail` và `AdminUserDetail` (email dài làm cột lưới `1fr` giãn theo min-content, `break-words` không đủ), `break-words`/`break-all` + `min-w-0` cho tên/slug/SKU/mã ở `AdminProducts` (thẻ và link tên), `AdminCategories`, `AdminBrands`, `AdminCoupons` (mã), `AdminContactMessages` (thẻ), `AdminOrders` (tên khách ở thẻ), `VariantsSection` (tên/SKU thẻ biến thể).
  4. Lỗi tương tự ở storefront (`overflow-x-auto` kèm `sr-only`): không có chỗ nào còn thiếu `relative` (đã rà `grep overflow-x-auto` trong `src`; `CompareTable` đã sửa ở M9; các vùng cuộn còn lại là danh sách ngang `ul` chỉ chứa link/ảnh tĩnh, không có phần tử absolute).
- **Phát hiện khi rà:** với dữ liệu seed sạch, mọi trang admin đã không tràn ở cả hai viewport; lỗi chỉ lộ khi dữ liệu có chuỗi dài không khoảng trắng (email, slug, SKU, mã giảm giá, tên). Vì vậy việc rà phải thực hiện trên DB tạm được chèn dữ liệu "xấu" (xem `testing.md`), không chỉ dữ liệu seed.
- **Hệ quả/rủi ro (giới hạn còn lại):**
  - `admin-mobile.spec.ts` chạy trên dữ liệu của DB E2E (seed + đơn do chính spec tạo), nên không tự bắt được lỗi chuỗi dài nếu DB không có dữ liệu như vậy; ca chuỗi dài đã được kiểm tay trên DB tạm, chưa tự động hóa (tránh để E2E ghi dữ liệu bẩn vào DB).
  - Chỉ kiểm chiều ngang ở 390 và 768; chưa kiểm 320px, chế độ ngang điện thoại, hay trình duyệt WebKit/Firefox (E2E chỉ chạy Chromium/Edge).
  - Trang `/admin/lien-he/[id]` chỉ được kiểm khi danh sách có tin nhắn (spec bỏ qua nếu rỗng, vì form liên hệ giới hạn 3 lần/10 phút/IP).
  - Các hộp thoại khác ngoài điều chỉnh tồn kho (đổi trạng thái đơn, hoàn tiền, biến thể, xóa) dùng chung `AdminModal` (`max-h-[90dvh]`, `max-w-md`) nhưng chưa có khẳng định riêng.
- **Docs bị ảnh hưởng:** `testing.md` (E2E `admin-mobile.spec.ts`, mục rate limit).

## D-049 Khu phân tích kinh doanh chỉ Admin

- **Ngày:** 2026-11-20 · **Người chốt:** Tech Lead theo ủy quyền chủ dự án
- **Trạng thái:** Áp dụng (Bước 1-2 đã triển khai; Bước 3-5 chờ duyệt, xem [`admin-dashboard-plan.md`](admin-dashboard-plan.md)).
- **Bối cảnh:** Dashboard `/admin` (§14.3, D-019) dành cho cả STAFF và ADMIN và chỉ trả số liệu vận hành 30 ngày cố định. Chủ cửa hàng cần phân tích theo khoảng ngày tùy chọn, so sánh kỳ trước, cơ cấu doanh thu và dữ liệu khách hàng; dữ liệu này nhạy cảm hơn mức nhân viên cần.
- **Quyết định:**
  1. **Tách khu mới, không đổi dashboard:** giữ `/admin` và `GET /admin/dashboard` nguyên như cũ cho STAFF + ADMIN. Thêm trang FE `/admin/phan-tich` ("Phân tích kinh doanh") và router BE `/api/v1/admin/analytics/*`.
  2. **Phân quyền hai lớp:** backend gắn `requireAdmin` ở cấp router analytics (STAFF 403 `FORBIDDEN`, chưa đăng nhập 401, mọi response `no-store`), không chỉ ẩn menu. Frontend: mục nav `adminOnly`; STAFF vào URL trực tiếp thấy thông báo không đủ quyền và không gọi API; 403 từ API cũng hiện thông báo đó. Dashboard chỉ cho ADMIN thấy link "Xem phân tích chi tiết".
  3. **Không thêm thư viện biểu đồ** (giữ D-019): biểu đồ SVG tự vẽ, luôn kèm bảng dữ liệu thay thế (`<details>` "Xem dạng bảng") để trình đọc màn hình và bàn phím dùng được.
  4. **Định nghĩa chỉ số** (một nguồn duy nhất, dùng cho mọi bước): doanh thu theo D-019 (`paidAt`, `paymentStatus = PAID`, `status` không thuộc {`CANCELLED`, `RETURNED`}, giờ VN); đơn đã thanh toán = số đơn thỏa định nghĩa doanh thu; AOV = `round(doanh thu / đơn đã thanh toán)` (0 nếu không có đơn); đơn đã đặt = theo `createdAt`, mọi trạng thái; tỷ lệ hủy = đơn tạo trong kỳ đang `CANCELLED` / đơn đã đặt (gồm đơn online hết hạn thanh toán, tách lý do ở Bước 3); giảm giá = tổng `discountTotal` của đơn tính doanh thu; hoàn tiền = tổng `Payment.amount` có `refundedAt` trong kỳ (tính theo ngày hoàn, không theo ngày đơn); khách mới = `User` role `CUSTOMER` có `createdAt` trong kỳ.
  5. **Hiệu năng:** truy vấn tổng hợp `GROUP BY` ngày bằng SQL tham số hóa (không nối chuỗi, không N+1, không tải đơn lên bộ nhớ), giới hạn 366 ngày, thêm index `Order(paidAt)` và `Payment(refundedAt)`. Chưa có bảng tổng hợp; Bước 5 đo `EXPLAIN ANALYZE` với khoảng 50k đơn.
- **Hệ quả/rủi ro:**
  - Doanh thu theo danh mục/thương hiệu (Bước 2) lấy theo `Product` hiện tại vì `OrderItem` không lưu snapshot category/brand: đổi danh mục của sản phẩm làm thay đổi số liệu quá khứ. Đây là đánh đổi chấp nhận để không đổi schema đơn hàng.
  - Số liệu quá khứ không đóng băng (như D-019): hủy/hoàn trả đơn cũ làm doanh thu kỳ đó giảm.
  - Hoàn tiền và doanh thu tính theo hai mốc khác nhau (`refundedAt` và `paidAt`), nên không cộng trừ trực tiếp để ra "doanh thu ròng".
  - Tỷ lệ hủy gồm cả đơn online hết hạn thanh toán, nên cao hơn tỷ lệ khách chủ động hủy.
  - Mỗi lần xem chạy 4 truy vấn tổng hợp trên Postgres thật (không cache); đủ cho quy mô hiện tại, đo lại ở Bước 5.
- **Docs bị ảnh hưởng:** `api-contract.md` §16 (0.14), `db-schema.md` (0.9), `admin-dashboard-plan.md`, `testing.md`.

## D-050 Khoảng ngày, kỳ so sánh và gom nhóm của phân tích kinh doanh

- **Ngày:** 2026-11-20 · **Người chốt:** Tech Lead theo ủy quyền chủ dự án
- **Trạng thái:** Áp dụng.
- **Bối cảnh:** D-049 cần quy tắc thống nhất cho tham số thời gian, kỳ so sánh và cách gom bucket để số liệu giữa API, biểu đồ và các bước sau không lệch nhau.
- **Quyết định:**
  1. **Tham số** `from`, `to` (`YYYY-MM-DD`, ngày lịch VN, tính cả hai đầu), `granularity` (`day|week|month`). Mặc định: `to` = hôm nay (VN), `from` = `to - 29 ngày`. Chỉ có `from`: `to = min(from + 29 ngày, hôm nay)`; chỉ có `to`: `from = to - 29 ngày`. `granularity` mặc định: `day` nếu khoảng <= 62 ngày, `week` nếu <= 184, còn lại `month`.
  2. **Giới hạn (400 `VALIDATION_ERROR`, có `field`):** sai định dạng hoặc ngày không tồn tại (ví dụ `2026-02-30`), `from > to`, `to` sau hôm nay (VN), khoảng > 366 ngày, `from` trước `2020-01-01`, `granularity` sai.
  3. **Múi giờ:** UTC+7 cố định (không DST); gom theo `(paidAt | createdAt | refundedAt) + 7 giờ`. Biên ngày: 23:59:59.999 VN thuộc ngày đó, 00:00:00 VN thuộc ngày kế tiếp.
  4. **Kỳ so sánh** là kỳ liền trước cùng độ dài: `previousTo = from - 1`, `previousFrom = previousTo - (days - 1)`; `series` và `previousSeries` dùng cùng `granularity`.
  5. **Bucket:** `day` = từng ngày; `week` bắt đầu từ thứ Hai theo ngày VN; `month` = tháng lịch VN. Bucket liên tục, điền 0; bucket đầu và cuối bị cắt theo khoảng (`start` = max(đầu bucket, `from`), `end` = min(cuối bucket, `to`)), nên `series.length` có thể khác `previousSeries.length`; FE căn hai chuỗi theo chỉ số bucket.
  6. **So sánh:** `changePct = round((hiện tại - trước) / trước x 100, 1)`, `null` khi kỳ trước = 0. Tỷ lệ (tỷ lệ hủy) so sánh bằng điểm phần trăm: `changePts = round((hiện tại - trước) x 100, 1)`, `null` khi kỳ trước không có đơn đã đặt; bản thân tỷ lệ lưu dạng 0..1 làm tròn 4 chữ số.
  7. **Index mới (migration `m10_analytics_indexes`):** `Order(paidAt)`, `Payment(refundedAt)`. `Order(createdAt)` và `User(createdAt)`, `User(role)` đã có.
- **Hệ quả/rủi ro:**
  - Kỳ trước của khoảng gần `2020-01-01` có thể nằm trước mốc đó; chấp nhận (chỉ trả 0), không validate.
  - `changePct` rất lớn khi kỳ trước nhỏ; FE chỉ hiển thị, không cắt.
  - Ngày "hôm nay" tính theo đồng hồ server; khoảng kết thúc hôm nay là kỳ chưa trọn ngày nên so với kỳ trước đã trọn sẽ thấp hơn (đúng bản chất, không điều chỉnh).
  - Hai chỉ số so sánh theo hai mốc khác nhau (xem D-049) không nên cộng trừ với nhau.
- **Docs bị ảnh hưởng:** `api-contract.md` §16.1, `db-schema.md`, `admin-dashboard-plan.md`.

## D-051 Cơ cấu doanh thu, top sản phẩm, top khách hàng (Bước 2)

- **Ngày:** 2026-11-20 · **Người chốt:** Tech Lead; chủ dự án đã duyệt Bước 2 và chấp nhận đánh đổi phân loại hiện tại
- **Trạng thái:** Áp dụng.
- **Bối cảnh:** Bước 2 của khu phân tích (D-049, D-050) cần cắt doanh thu theo danh mục, thương hiệu, thanh toán, giao hàng, tỉnh/thành, cùng top sản phẩm và top khách. Cần chốt tập đơn, ý nghĩa "doanh thu" của từng chiều và cách gộp khách để số liệu không lệch nhau giữa các màn.
- **Quyết định:**
  1. **Tập đơn nguồn** đúng định nghĩa doanh thu D-049/D-019 (`PAID`, không `CANCELLED`/`RETURNED`, theo `paidAt` ngày VN) và dùng chung `resolveRange` của Bước 1 (`from`/`to`, mặc định, giới hạn 366 ngày, kỳ trước). Khác "top sản phẩm" của dashboard §14.3 (theo `createdAt`, giữ nguyên, không đổi).
  2. **Hai loại chiều**, báo bằng `basis` trong response:
     - Cấp đơn (`paymentMethod`, `shippingMethod`, `province`): `revenue` = Σ `grandTotal`; tổng các nhóm = `kpis.revenue` của overview cùng khoảng.
     - Cấp dòng hàng (`category`, `brand`): `revenue` = Σ `OrderItem.lineTotal` ("doanh thu hàng hóa", chưa trừ giảm giá cấp đơn, không gồm phí ship nên khác doanh thu overview), `orders` = số đơn khác nhau (không cộng dồn được giữa các nhóm vì một đơn có thể thuộc nhiều nhóm; ghi chú trong contract và UI); tổng các nhóm = `total.revenue` = Σ `lineTotal`.
     - Danh mục/thương hiệu theo `Product` **hiện tại** (không cuộn lên danh mục cha). Brand null -> nhóm `key: null` "Không có thương hiệu"; tỉnh thiếu `provinceCode` -> `key: null` "Không xác định"; sản phẩm xóa mềm vẫn tính; LEFT JOIN nên dòng không join được sản phẩm vào nhóm `__unknown__`.
  3. **Breakdown**: `GET /admin/analytics/breakdown?dimension&from&to`, `dimension` bắt buộc; nhóm sắp theo `revenue` giảm dần rồi nhãn; tối đa 50 nhóm, phần dư gộp vào nhóm cuối `key: "__other__"` "Khác" để tổng vẫn khớp; `share` 0..1 (4 chữ số); `changePct` so với cùng nhóm ở kỳ trước (`null` khi kỳ trước = 0); nhóm chỉ có ở kỳ trước không liệt kê. Nhãn tiếng Việt do **backend** trả cho mọi chiều (FE không map enum).
  4. **Top sản phẩm**: `GET /admin/analytics/top-products?from&to&sort=revenue|quantity&limit` (mặc định `revenue`, 10; 1..50); gộp theo `productId`; tên hiện tại (thiếu thì `OrderItem.productName`), `deleted` cho sản phẩm xóa mềm, `categoryName` hiện tại.
  5. **Top khách**: `GET /admin/analytics/top-customers?from&to&sort=revenue|orders&limit`; gộp theo `userId` khi có, khách vãng lai theo `lower(contactEmail)`. Chỉ trả tên + email, không SĐT/địa chỉ. Chỉ ADMIN, `no-store`.
  6. **Truy vấn**: SQL `$queryRaw` tham số hóa, câu SQL cố định theo nhánh code (không chèn tên cột từ input), kỳ này và kỳ trước cùng một truy vấn (`FILTER` theo `paidAt`), mỗi endpoint 1-2 truy vấn, JOIN qua khóa có index, không N+1. Query validate bằng zod (tham số lặp -> 400, `limit` chỉ nhận chuỗi số nguyên 1..50).
  7. **Giao diện** (trong `/admin/phan-tich`, dưới phần Bước 1, dùng chung khoảng ngày trên URL): khối "Cơ cấu doanh thu" (chọn chiều bằng nhóm nút `aria-pressed`, lưu `?dim=`, sai -> `category`; bảng có caption, `th scope`, thanh ngang CSS kèm chữ số tỷ trọng, mũi tên + chữ so với kỳ trước), "Top sản phẩm", "Top khách hàng"; mỗi khối có loading/lỗi (thử lại)/rỗng riêng; bảng nằm trong vùng cuộn `relative overflow-x-auto` focus được (D-048).
- **Hệ quả/rủi ro (đánh đổi đã chấp nhận):**
  - **Phân loại hiện tại:** đổi danh mục/thương hiệu của sản phẩm làm số liệu quá khứ theo danh mục/thương hiệu đổi theo (UI có ghi chú). Muốn đóng băng cần snapshot trên `OrderItem` (đổi schema, chưa làm).
  - **Guest/registered tách dòng:** người vừa có tài khoản vừa mua vãng lai cùng email là hai dòng ở top khách; chưa đoán danh tính. Email khác hoa thường được gộp, nhưng hai email khác nhau của cùng một người thì không.
  - **Giới hạn 50 nhóm:** thực tế không chạm (danh mục, thương hiệu, tỉnh đều ít hơn); nếu chạm, `orders` của "Khác" ở chiều dòng hàng là tổng (có thể đếm trùng).
  - Tổng doanh thu chiều dòng hàng nhỏ hơn hoặc lớn hơn doanh thu overview tùy giảm giá và phí ship; UI ghi rõ cơ sở tính.
  - Mỗi lần xem chạy thêm 3 truy vấn nhóm/tổng trên Postgres thật (không cache); đo `EXPLAIN` ở Bước 5.
- **Docs bị ảnh hưởng:** `api-contract.md` §16.2 (0.15), `admin-dashboard-plan.md`, `testing.md`.


## D-052 Khách hàng, vận hành, tồn kho (Bước 3)

- **Ngày:** 2026-11-20 · **Người chốt:** Tech Lead; chủ dự án đã duyệt Bước 3 với 5 mặc định (mua lần đầu, phân loại hủy, đơn cần xử lý, giá trị tồn, hàng bán chậm)
- **Trạng thái:** Áp dụng.
- **Bối cảnh:** Bước 3 của khu phân tích (D-049, D-050, D-051) cần định nghĩa khách mua lần đầu so với quay lại, phân loại đơn hủy, thời gian xử lý, đơn cần xử lý và số liệu tồn kho, sao cho số liệu khớp với overview và không lệch giữa các màn.
- **Quyết định:**
  1. **Khóa khách** = `userId` nếu có, ngược lại `lower(contactEmail)` (như D-051). **Đơn tính doanh thu** = định nghĩa D-019 (PAID, không `CANCELLED`/`RETURNED`) theo `paidAt`.
  2. **Mua lần đầu / quay lại:** khách mua trong kỳ (có đơn tính doanh thu trong kỳ) là *lần đầu* nếu đơn tính doanh thu sớm nhất **mọi thời điểm** của khách nằm trong kỳ; ngược lại là *quay lại* (đã có đơn tính doanh thu trước `from`). Đơn cũ đã hủy/hoàn trả không tính nên khách đó vẫn là lần đầu. *Tỷ lệ mua lại* = khách có >= 2 đơn tính doanh thu trong kỳ / khách mua trong kỳ (0 khi không có khách). Bất biến: lần đầu + quay lại = khách mua; doanh thu hai nhóm = doanh thu overview. Một truy vấn gộp theo khách (CTE + `FILTER`) cho cả hai kỳ.
  3. **Phân loại hủy** (đơn tạo trong kỳ đang `CANCELLED`, để tổng = `kpis.cancelledOrders`), đọc từ dòng `OrderStatusHistory` `toStatus = CANCELLED` mới nhất (`LATERAL ... LIMIT 1`, dùng index `[orderId, createdAt]`): `expired` = `actorId` null, `fromStatus = PENDING_PAYMENT`, `note` = `EXPIRE_REASON` (hằng export từ `jobs/cleanup.ts`, dùng chung với job, không chép chuỗi); `store` = actor hiện có role `STAFF`/`ADMIN`; `customer` = các trường hợp còn lại có dòng lịch sử; `unknown` = không có dòng lịch sử. **Đánh đổi:** dựa role *hiện tại* của actor (đổi role sau này làm số liệu cũ đổi); actor bị xóa (`SetNull`) rơi về `customer`; khách vãng lai tự nhập đúng lý do "Quá hạn thanh toán" khi hủy đơn `PENDING_PAYMENT` sẽ bị tính `expired`.
  4. **Tỷ lệ trả hàng** = đơn có `deliveredAt` trong kỳ hiện đang `RETURNED` / đơn có `deliveredAt` trong kỳ (0 khi mẫu = 0).
  5. **Thời gian xử lý** (giờ, 1 chữ số thập phân, trung bình + trung vị `percentile_cont(0.5)`, số mẫu `n`, `null` khi `n = 0`): *xác nhận* = `createdAt -> confirmedAt` chỉ cho đơn **COD** có `confirmedAt` trong kỳ (đơn online tự xác nhận khi thanh toán nên bỏ); *giao* = `confirmedAt -> deliveredAt` cho đơn có `deliveredAt` trong kỳ. Kèm `previousAvg` của kỳ trước.
  6. **Đơn cần xử lý** (ảnh chụp hiện tại, không theo khoảng ngày): đơn `PENDING` tạo quá 24 giờ (đếm + tối đa 10 đơn cũ nhất: mã, `createdAt`, `grandTotal`, giờ chờ, không có thông tin cá nhân), đơn cần hoàn tiền (dùng lại `ordersNeedingRefund`), đơn `RETURN_REQUESTED`, đơn `FAILED_DELIVERY`.
  7. **Tồn kho** (ảnh chụp hiện tại; phạm vi biến thể như `lowStock` của dashboard: `isActive`, chưa xóa mềm, sản phẩm chưa xóa mềm): hết hàng = `stock <= 0`; sắp hết = `0 < stock <= lowStockThreshold`; **giá trị tồn** = Σ `stock x price` (giá niêm yết, không dùng `salePrice`), chỉ `stock > 0`; **bán chậm** = còn hàng, không bán được trong `slowDays` ngày (7..365, mặc định 30) và không tạo trong khoảng đó; "bán" = có `OrderItem` thuộc đơn tạo trong khoảng với `status` không phải `CANCELLED`/`PENDING_PAYMENT` (cùng quy ước top sản phẩm §14.3). Danh sách tối đa 20 mục, đếm và tổng giá trị ở `summary` là toàn bộ.
  8. **Truy vấn:** SQL `$queryRaw` tham số hóa (mảnh dùng chung bằng `Prisma.sql`, không nối chuỗi từ input), `Promise.all` giữa các truy vấn: customers 1, operations 7 (hủy, trả hàng, hoàn tiền, thời gian xử lý, đơn chờ, đếm trạng thái, đơn cần hoàn tiền), inventory 4. Không N+1.
  9. **Index:** kiểm `EXPLAIN ANALYZE` sơ bộ cho truy vấn "khách lần đầu" trên 50.000 đơn sinh trong DB tạm: quét tuần tự bảng `Order` (45.000 đơn PAID) mất khoảng 33 ms. Truy vấn buộc phải quét toàn bộ lịch sử đơn tính doanh thu (cần mốc đơn đầu tiên mọi thời điểm), index `paidAt` hiện có không giúp được, và khóa khách là biểu thức `lower(contactEmail)`/`userId` nên index đơn cột cũng không thay thế được quét. **Không thêm migration**; để Bước 5 đo lại với dữ liệu lớn hơn (và cân nhắc index biểu thức hoặc bảng tổng hợp nếu vượt ngưỡng).
  10. **Giao diện** (trong `/admin/phan-tich`, dưới các khối Bước 1-2): mục lục neo (Tổng quan, Cơ cấu doanh thu, Top, Khách hàng, Vận hành, Tồn kho; heading có `id`); khối "Khách hàng" (6 thẻ KPI có so sánh kỳ trước), "Vận hành" (đơn hủy theo loại bằng bảng + thanh CSS + %, tỷ lệ trả hàng, hoàn tiền, thời gian xử lý "x,y giờ" / "x ngày y giờ" / "Chưa có dữ liệu", "Cần xử lý ngay" có link `/admin/don-hang/[code]` và link lọc sẵn có `status=...`, `needsRefund=true`), "Tồn kho" (ghi rõ "Số liệu hiện tại, không theo khoảng ngày", thẻ tóm tắt, nhóm nút Hết hàng / Sắp hết / Bán chậm `aria-pressed`, chọn `slowDays` 30/60/90, bảng link `/admin/san-pham/[productId]`). Mỗi khối loading/lỗi (thử lại)/rỗng riêng; "Làm mới" tải lại tất cả; bảng trong vùng cuộn `relative overflow-x-auto` focus được (D-048).
- **Hệ quả/rủi ro (đánh đổi đã chấp nhận):**
  - Phân loại hủy phụ thuộc role hiện tại và lý do ghi trong lịch sử (xem mục 3); đơn hủy cũ không có lịch sử (trước khi có `OrderStatusHistory`) hiện là `unknown`.
  - Khách có tài khoản và khách vãng lai cùng email là hai khách; hai email của một người là hai khách (như D-051).
  - Truy vấn "khách lần đầu" quét toàn bộ lịch sử đơn tính doanh thu mỗi lần xem (không cache); đo lại ở Bước 5.
  - Giá trị tồn dùng giá niêm yết nên có thể cao hơn giá trị bán thực tế khi đang giảm giá; không phải giá vốn.
  - "Bán" dùng ngày tạo đơn (không phải ngày thanh toán), nên đơn COD chưa giao vẫn tính là đã bán; đơn `PENDING_PAYMENT` chưa thanh toán không tính.
  - Thời gian xác nhận chỉ đo đơn COD; thời gian giao đo từ lúc xác nhận (không gồm thời gian chờ xác nhận).
- **Docs bị ảnh hưởng:** `api-contract.md` §16.3 (0.16), `admin-dashboard-plan.md`, `testing.md`. Không đổi `db-schema.md` (không có migration).


## D-053 Hiệu quả mã giảm giá và xuất CSV (Bước 4)

- **Ngày:** 2026-11-20 · **Người chốt:** Tech Lead; chủ dự án đã duyệt Bước 4 với hai điểm chốt (CSV ghi tiền là số nguyên VND; CSV top khách có email, không có SĐT/địa chỉ)
- **Trạng thái:** Áp dụng.
- **Bối cảnh:** Bước 4 của khu phân tích (D-049..D-052) cần đo hiệu quả mã giảm giá và cho Admin xuất số liệu ra CSV để mở bằng Excel. File xuất có dữ liệu cá nhân (email khách), và nội dung ô lấy từ dữ liệu người dùng nhập (tên sản phẩm, tên khách) nên có nguy cơ CSV injection.
- **Quyết định:**
  1. **Tập đơn và kỳ** như D-049/D-050 (PAID, không `CANCELLED`/`RETURNED`, theo `paidAt`, cùng `resolveRange`). "Đơn có mã" = đơn có `couponId` hoặc `couponCode`; mã đã xóa (`couponId` về null do `SetNull`) gộp theo snapshot `couponCode`, `deleted: true`.
  2. **"Giảm" của mã** = `Order.discountTotal`, cộng `shippingDiscount` khi mã là `FREESHIP` (đọc `Coupon.type` hiện tại). Đánh đổi: `shippingDiscount` có thể gồm miễn phí ship theo ngưỡng của cửa hàng; mã đã xóa không biết loại nên chỉ tính `discountTotal`.
  3. **`GET /admin/analytics/coupons`**: `summary` (đơn có/không mã, tỷ lệ dùng mã, AOV có/không mã, tổng giảm, đều so với kỳ trước) trên toàn tập đơn; `items` theo mã có đơn trong kỳ này, `sort` revenue/uses/discount, `limit` 1..50 (mặc định 10). 2 câu SQL `$queryRaw` tham số hóa chạy song song, `ORDER BY` chọn từ mảnh `Prisma.sql` cố định.
  4. **`GET /admin/analytics/export?report=...`**: 9 báo cáo (overview, series, breakdown, top-products, top-customers, coupons, customers, operations, inventory). Dữ liệu lấy từ CHÍNH các hàm service JSON (không truy vấn thứ hai), ánh xạ sang hàng/cột bằng hàm thuần (`analytics.export.ts`); chỉ khác giới hạn dòng: xuất tới 200 dòng cho top/coupons (mặc định 100) và 1000 dòng cho mỗi danh sách tồn kho (tham số `listLimit` của `getInventory`, response JSON không đổi). Tham số kiểm chặt theo từng báo cáo bằng `z.discriminatedUnion` + `z.strictObject` (tham số không áp dụng hoặc lặp -> 400), vì tham số được ghi vào audit và để tránh nhầm lẫn khi FE gửi sai.
  5. **Định dạng CSV** (`lib/csv.ts`): UTF-8 có BOM, dấu phẩy, CRLF, RFC 4180. Tiền và số đếm là **số nguyên không định dạng** (ví dụ `1480000`); tỷ lệ là phần trăm thập phân dấu chấm (`16.7`); giá trị `null` -> ô trống; ngày `YYYY-MM-DD`, thời điểm ISO. Lưu ý: Excel có locale thập phân dấu phẩy có thể cần Data > From Text/CSV để đọc số thập phân; số nguyên không bị ảnh hưởng. Tiêu đề cột tiếng Việt, nhãn như UI.
  6. **Chống CSV injection**: ô có kiểu. Ô số (từ `number` hữu hạn do server sinh) ghi thẳng, nên số âm như `-12.5` vẫn là số; ô chuỗi nếu **ký tự đầu** là `=`, `+`, `-`, `@`, tab hoặc CR thì thêm tiền tố `'`, sau đó mới bọc ngoặc RFC 4180. Không trim dữ liệu: chỉ xét ký tự đầu của chuỗi gốc, chuỗi bắt đầu bằng khoảng trắng rồi tới ký tự nguy hiểm không bị đổi (Excel không coi là công thức). Đánh đổi: tên bắt đầu bằng `-` hay `+` (ví dụ "-Hết hàng") hiện thêm dấu `'` khi mở trong Excel.
  7. **Dữ liệu nhạy cảm**: top khách chỉ có loại khách, tên, email, số đơn, doanh thu, AOV, lần thanh toán gần nhất; **không** userId, SĐT, địa chỉ, mã đơn. Không có trường nào ngoài các trường của JSON tương ứng.
  8. **Header**: `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="beanbox-<report>[-<dimension|list>]-<from>_<to>.csv"`; tên file chỉ dựng từ enum + ngày đã validate và kiểm khớp `[a-z0-9_.-]` (ném lỗi nếu không, không bao giờ từ input thô); `inventory` dùng ngày hôm nay VN. `no-store` kế thừa router admin, `nosniff` do helmet. `Content-Disposition` được thêm vào `exposedHeaders` CORS.
  9. **Audit**: mỗi lần xuất thành công ghi 1 dòng `analytics.export` (entity `analytics`, entityId = báo cáo, actor, ip = `req.ip` như các audit khác), `diff` theo quy ước `{ "<tham số>": [null, <giá trị>] }` gồm tham số hiệu lực (`from`/`to` đã chuẩn hóa) và `rows`; không ghi email/tên. Ghi **trước** khi gửi body, **fail-closed** (audit lỗi -> 500, không trả file). Không đổi schema `AuditLog`. FE Nhật ký thêm nhãn "Xuất CSV phân tích", nhóm lọc `analytics.` và gợi ý entity `analytics`.
  10. **Rate limit riêng**: limiter `export` 10/phút/IP (`EXPORT_RATE_LIMIT_PER_MIN`, mặc định 10; `AppOptions.exportRateLimit` cho test), store riêng, áp đúng route `/export`. **Đặt sau `requireAdmin`**: request chưa xác thực hoặc STAFF/CUSTOMER bị 401/403 không tiêu hạn mức của admin (không thể dùng request rác khóa admin cùng IP khỏi việc xuất); lớp rate limit chung 100/phút vẫn chặn lũ request không xác thực. Request 400 vẫn tính vào hạn mức. 429 theo §1 kèm `Retry-After`.
  11. **Giao diện**: khối "Mã giảm giá" trong `/admin/phan-tich` (thêm vào mục lục neo, 7 mục): 5 thẻ KPI có so sánh kỳ trước, bảng theo mã với đổi sắp xếp, mã đã xóa nhãn "Đã xóa" không có link, mã còn tồn tại link `/admin/ma-giam-gia/[id]`, mã đã tắt nhãn "Đã tắt", loading/lỗi/rỗng riêng, bảng trong `relative overflow-x-auto`. Nút "Xuất CSV" cho từng khối (tổng quan, biểu đồ, cơ cấu theo chiều đang chọn, top sản phẩm, top khách, mã giảm giá, khách hàng, vận hành, tồn kho theo tab và `slowDays` đang chọn), dùng bộ lọc hiện tại; nhãn cho trình đọc màn hình có ngữ cảnh ("Xuất CSV top khách hàng"), đang xuất thì `disabled` + `aria-busy`, lỗi hiện tại chỗ (429: "Bạn xuất quá nhanh, thử lại sau N giây."). Tải file bằng `ApiClient.download(path, opts)`: dùng chung `send` với request JSON (Bearer từ memory, tự refresh khi 401 rồi thử lại một lần), **không bao giờ đặt token vào URL**; tên file lấy từ `Content-Disposition` chỉ khi khớp `[A-Za-z0-9_.-]` (còn lại dùng `beanbox-export.csv`); lưu bằng object URL + `<a download>` + `revokeObjectURL`. CSP (D-040) không cần đổi: `connect-src 'self'` đủ cho fetch cùng origin, tải blob qua `<a download>` không bị CSP hiện tại chặn (đã kiểm bằng E2E).
- **Hệ quả/rủi ro (đánh đổi đã chấp nhận):**
  - File CSV có email khách rời khỏi hệ thống: chỉ Admin xuất được, mỗi lần xuất có audit và bị rate limit; người nhận file chịu trách nhiệm bảo quản.
  - Chống injection bằng tiền tố `'` làm hiện thêm dấu nháy ở ô chuỗi bắt đầu bằng `-`, `+`, `=`, `@`; bù lại số âm vẫn là số. Không chặn được các cách tấn công không dựa vào ký tự đầu ô (chưa có trường hợp nào trong dữ liệu xuất).
  - Số thập phân dùng dấu chấm; Excel locale dấu phẩy có thể hiểu sai các cột tỷ lệ/giờ khi mở trực tiếp (cột tiền và số đếm là số nguyên nên không ảnh hưởng).
  - Xuất tới 1000 dòng tồn kho/200 dòng top nằm trọn trong bộ nhớ một request; chấp nhận ở quy mô cửa hàng này.
  - "Giảm" của mã FREESHIP có thể gồm cả miễn phí ship theo ngưỡng; mã FREESHIP đã xóa hiện giảm 0 (xem mục 2).
  - Hạn mức xuất tính theo IP (như các limiter khác); sau reverse proxy phụ thuộc `TRUST_PROXY` (D-009).
- **Docs bị ảnh hưởng:** `api-contract.md` §16.4, §14.4, §12.0, §1 (0.17), `admin-dashboard-plan.md`, `testing.md`, `deployment.md`, `.env.example`, `.env.production.example`. Không đổi `db-schema.md` (không có migration).
