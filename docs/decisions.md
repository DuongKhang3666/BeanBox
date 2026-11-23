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
- [D-054 Hiệu năng, a11y và bản in khu phân tích (Bước 5, phần A)](#d-054-hiệu-năng-a11y-và-bản-in-khu-phân-tích-bước-5-phần-a)
- [D-055 CI: coverage, kiểm định dạng và Dependabot](#d-055-ci-coverage-kiểm-định-dạng-và-dependabot)
- [D-056 Mailer bền vững](#d-056-mailer-bền-vững)
- [D-057 Chống giữ kho bằng đơn COD khách vãng lai](#d-057-chống-giữ-kho-bằng-đơn-cod-khách-vãng-lai)
- [D-058 Bảo vệ DB khỏi truy vấn analytics nặng và giới hạn tài nguyên container](#d-058-bảo-vệ-db-khỏi-truy-vấn-analytics-nặng-và-giới-hạn-tài-nguyên-container)
- [D-059 Lớp lỗi, trạng thái tải, header mobile và múi giờ hiển thị](#d-059-lớp-lỗi-trạng-thái-tải-header-mobile-và-múi-giờ-hiển-thị)
- [D-060 Thanh toán giả lập cho demo (VNPay giả, MoMo giả)](#d-060-thanh-toán-giả-lập-cho-demo-vnpay-giả-momo-giả)
- [D-061 Chuyển khoản / VietQR demo](#d-061-chuyển-khoản--vietqr-demo)
- [D-062 Vận chuyển giả lập: thời gian giao dự kiến, mã vận đơn giả, hành trình mô phỏng](#d-062-vận-chuyển-giả-lập-thời-gian-giao-dự-kiến-mã-vận-đơn-giả-hành-trình-mô-phỏng)
- [D-063 Xác thực 2 lớp (TOTP) cho Staff và Admin](#d-063-xác-thực-2-lớp-totp-cho-staff-và-admin)
- [D-064 SEO kỹ thuật: trang chủ ISR, ảnh OG, sitemap lastmod, canonical/noindex, JSON-LD](#d-064-seo-kỹ-thuật-trang-chủ-isr-ảnh-og-sitemap-lastmod-canonicalnoindex-json-ld)
- [D-065 Quyền dữ liệu cá nhân: khách tự xóa (ẩn danh hóa) tài khoản và xuất dữ liệu](#d-065-quyền-dữ-liệu-cá-nhân-khách-tự-xóa-ẩn-danh-hóa-tài-khoản-và-xuất-dữ-liệu)
- [D-066 Demo chạy bằng một lệnh (docker-compose.demo.yml)](#d-066-demo-chạy-bằng-một-lệnh-docker-composedemoyml)
- [D-067 CI supply-chain: ghim SHA Actions và Trivy chỉ báo cáo](#d-067-ci-supply-chain-ghim-sha-actions-và-trivy-chỉ-báo-cáo)
- [D-068 Mã vận đơn duy nhất ở DB](#d-068-mã-vận-đơn-duy-nhất-ở-db)
- [D-069 robots.txt không chặn trang noindex](#d-069-robotstxt-không-chặn-trang-noindex)
- [D-070 Bắt buộc 2FA cho Admin bằng cờ REQUIRE_ADMIN_2FA](#d-070-bắt-buộc-2fa-cho-admin-bằng-cờ-require_admin_2fa)
- [D-071 Ghi chú nội bộ trên đơn hàng](#d-071-ghi-chú-nội-bộ-trên-đơn-hàng)
- [D-072 In phiếu giao hàng loạt](#d-072-in-phiếu-giao-hàng-loạt)
- [D-073 Xuất và nhập CSV sản phẩm](#d-073-xuất-và-nhập-csv-sản-phẩm)
- [D-074 Tách file lớn và hộp thoại dùng chung](#d-074-tách-file-lớn-và-hộp-thoại-dùng-chung)
- [D-075 Cache HTTP cho catalog, ảnh và cài đặt](#d-075-cache-http-cho-catalog-ảnh-và-cài-đặt)
- [D-076 Khóa tạm theo mã đơn cho khách vãng lai](#d-076-khóa-tạm-theo-mã-đơn-cho-khách-vãng-lai)
- [D-077 Mua lại](#d-077-mua-lại)
- [D-078 Giá vốn bình quân gia quyền di động và lợi nhuận gộp](#d-078-giá-vốn-bình-quân-gia-quyền-di-động-và-lợi-nhuận-gộp)
- [D-079 Tắt êm và lỗi tiến trình](#d-079-tắt-êm-và-lỗi-tiến-trình)
- [D-080 Làm mới minPrice theo mốc sale](#d-080-làm-mới-minprice-theo-mốc-sale)
- [D-081 Allowlist ảnh đại diện](#d-081-allowlist-ảnh-đại-diện)
- [D-082 Độ tươi hạt cà phê](#d-082-độ-tươi-hạt-cà-phê)
- [D-083 E2E mobile 390 px, smoke WebKit, warm-up khởi động nguội, đo tải đặt hàng đồng thời](#d-083-e2e-mobile-390-px-smoke-webkit-warm-up-khởi-động-nguội-đo-tải-đặt-hàng-đồng-thời)

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
  1. `backend`: Postgres service; `npm ci`, `prisma generate`, `migrate deploy` trên DB trống, kiểm drift bằng `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code` (shadow DB lấy từ `SHADOW_DATABASE_URL` qua `backend/prisma.config.ts`; exit 2 = drift), lint, typecheck, test, build.
  2. `frontend`: lint, typecheck, test, build.
  3. `e2e`: Playwright chromium của runner Linux, Postgres service, migrate + seed DB, chạy sau backend/frontend.
  4. `secret-scan`: gitleaks chạy bằng Docker image ghim phiên bản, quét lịch sử git.
  5. `audit`: `npm audit` cả hai phía, chỉ báo cáo, không làm fail.
  6. `docker`: build image backend/frontend/caddy/backup (không push), smoke image backup (rclone, age, pg_dump) và selftest backup off-site với Postgres service (D-043).
  7. `ops-lint`: shellcheck cho `deploy/backup` và `deploy/monitoring`, `docker compose config` cho `docker-compose.prod.yml` với env giả.
  8. Cache npm. KHÔNG có deploy tự động.
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
  4. Driver adapter `pg` (`backend/src/lib/prisma.ts`): `connectionTimeoutMillis` 5000; pool pg mặc định 10 kết nối (lịch sử, trước D-036: Prisma 6 là `num_cpus*2+1`).
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

## D-054 Hiệu năng, a11y và bản in khu phân tích (Bước 5, phần A)

- **Ngày:** 2026-11-21 · **Người chốt:** Tech Lead (phần README/ảnh thuộc phần B, đã làm)
- **Trạng thái:** Áp dụng.
- **Bối cảnh:** Bước 5 của khu phân tích (D-049..D-053) cần đo truy vấn ở quy mô lớn, rà a11y/mobile, thêm bản in và dọn việc nhỏ.
- **Quyết định:**
  1. **Không thêm index, không có migration.** Đo trên Postgres 17.11, 100.000 đơn/294.111 dòng hàng/365 ngày (số liệu ở `testing.md`). Điểm chậm còn lại (breakdown danh mục/thương hiệu ~0,9 s, top-products ~0,4 s ở 365 ngày) do `COUNT(DISTINCT)` sắp xếp ra đĩa trên khoảng chứa ~87% số đơn; hai index thử (một phần theo `paymentStatus = 'PAID'`, phủ trên `OrderItem`) không được planner dùng. Ba index ứng viên khác (`lower("contactEmail")`, `OrderStatusHistory(orderId, toStatus, createdAt)`, `Order(couponId, paidAt)`) phục vụ truy vấn đã dưới 250 ms, không đáng chi phí ghi trên bảng `Order` nóng.
  2. **Tối ưu truy vấn, kết quả không đổi:** tồn kho (lần bán cuối gộp một lần), đơn cần hoàn tiền (đi từ `Payment`), tổng cơ cấu danh mục/thương hiệu (đếm đơn bằng `EXISTS`); `shm_size: 256mb` cho `db` trong compose.
  3. **Giới hạn quy mô và khi nào cần bảng tổng hợp:** chấp nhận được tới ~100.000 đơn/năm; khi p50 breakdown/top-products ở 365 ngày vượt ~1 s (khoảng 150.000-200.000 đơn/năm) thêm bảng tổng hợp theo ngày.
  4. **Công cụ sinh dữ liệu demo** `backend/scripts/generate-demo-orders.ts` chạy tay trên DB tạm, có rào an toàn (chỉ `DEMO_DATABASE_URL`, từ chối DB dev/production), không vào build/image.
  5. **A11y:** quét axe cho khu phân tích mở rộng trong `m6b.spec.ts` (không thêm lượt đăng nhập vào `a11y.spec.ts`, D-044); heading đích của mục lục có `tabIndex={-1}`; `ErrorState` nhận `headingLevel` để không nhảy cấp heading.
  6. **Bản in** bằng biến thể `print:` và một khối `@media print`; không có nút "In".
  7. **Mã giảm giá không được bắt đầu bằng `-` khi tạo** (dễ bị hiểu nhầm là tùy chọn dòng lệnh/công thức bảng tính). `PATCH` vốn không nhận `code` (đổi mã luôn 400), nên mã cũ dạng `-...` vẫn hiển thị, sửa trường khác và áp dụng ở checkout như trước; không cần migrate dữ liệu, seed không có mã như vậy.
- **Hệ quả/rủi ro:** số đo từ một máy cá nhân (nhiễu ~30%); breakdown danh mục/thương hiệu và top-products gần 1 s ở 100.000 đơn/365 ngày; dữ liệu demo không khớp sổ kho.
- **Docs bị ảnh hưởng:** `api-contract.md` §13.8 (0.18), `testing.md`, `admin-dashboard-plan.md`. Không đổi `db-schema.md`.

## D-055 CI: coverage, kiểm định dạng và Dependabot

- **Ngày:** 2026-11-21 · **Người chốt:** Tech Lead (Đợt 1, R-07 của `roadmap-next.md`)
- **Trạng thái:** Áp dụng. Bổ sung D-033.
- **Bối cảnh:** CI chưa đo coverage dù `requirements.md` §6.6 yêu cầu, chưa kiểm định dạng (đã có lần file lệch Prettier lọt vào HEAD) và không có cơ chế báo cập nhật phụ thuộc. Phạm vi dự án là portfolio chạy localhost, nên chọn công cụ nhẹ, không cần dịch vụ ngoài.
- **Quyết định:**
  1. **Coverage:** `@vitest/coverage-v8` (cùng major với vitest 5) ở cả `backend/` và `frontend/`; script `test:coverage`; reporter `text-summary` + `json-summary` + `html` vào `coverage/`; đo `src/**`, loại file test, `.d.ts`, `src/generated` (backend), `src/types` (frontend). CI chạy `test:coverage` thay cho `test`, in bảng tóm tắt vào `$GITHUB_STEP_SUMMARY` và upload html (retention 7 ngày). Chi phí: instrument v8 làm test chậm hơn (chưa đo chính xác).
  2. **Ngưỡng = số đo làm tròn xuống trừ khoảng 2 điểm, KHÔNG đặt 70 %:** backend đo 96,56 / 89,36 / 97,65 / 97,93 (statements / branches / functions / lines) -> ngưỡng 94 / 87 / 95 / 95; frontend đo 83,55 / 77,73 / 83,67 / 86,12 -> 81 / 75 / 81 / 84. Con số 70 % của `requirements.md` thấp hơn xa thực tế nên không bắt được việc tụt; mục tiêu của ngưỡng là chống suy giảm, không phải đạt chỉ tiêu. Nâng ngưỡng khi coverage tăng có chủ đích. `requirements.md` §6.6 đã sửa theo hướng "đo trong CI, ngưỡng không cho tụt".
  3. **Frontend nới timeout khi `--coverage`** (60 s thay vì 15 s): instrument v8 làm vài test form dài (`AdminProductForm`, `AdminSettings`...) chạy quá 15 s ở lần đo đầu (2-5 test timeout, thay đổi giữa các lần chạy). Chạy thường giữ 15 s.
  4. **`format:check`** (`prettier --check .`) ở cả hai phía, bước riêng trong job `backend` và `frontend`. Thêm `endOfLine: "auto"` vào hai `.prettierrc.json`: working tree Windows (autocrlf) có file CRLF dù index là LF, mặc định `lf` làm `--check` báo hàng chục file lệch giả (49/50 file được báo chỉ vì CRLF). `auto` giữ nguyên kiểu xuống dòng hiện có nên kết quả như nhau trên CI Linux và máy Windows; đánh đổi: không còn bắt file CRLF lỡ được commit, nhưng index đang LF toàn bộ và `.gitattributes` chưa ép `eol` cho mã nguồn (việc để sau nếu cần). `frontend/.prettierignore` thêm `test-results`, `playwright-report`, `*.tsbuildinfo`. Lần đầu chạy chỉ có 1 file lệch thật (`frontend/e2e/compare.spec.ts`), đã format.
  5. **Dependabot** (`.github/dependabot.yml`, version 2): npm (`/backend`, `/frontend`), docker (`/backend`, `/frontend`, `/deploy/caddy`, `/deploy/backup`), github-actions (`/`); hằng tuần (thứ Hai), gộp minor/patch thành một PR mỗi mục, tối đa 5 PR mở mỗi mục, tiền tố commit `chore(deps)`/`chore(docker)`/`chore(ci)`. Bản major vẫn mở PR riêng. Không tự merge. Chưa ghim SHA cho Actions (vẫn theo tag; việc để sau, ghi ở `roadmap-next.md` R-07). Trivy chưa làm.
  6. **actionlint** kiểm `.github/workflows/*.yml` bằng Docker image chính thức (`rhysd/actionlint`, chạy tay, chưa đưa vào CI): `docker run --rm -v "<repo>:/repo" --workdir /repo rhysd/actionlint:latest -color` (Git Bash cần `MSYS_NO_PATHCONV=1`). Kết quả lần này: sạch (v1.7.12).
- **Hệ quả/rủi ro:** CI chậm hơn một chút và thêm artifact; ngưỡng có thể làm PR fail khi xóa test hoặc thêm mã khó test (cần nâng/hạ ngưỡng có ý thức); Dependabot tạo PR mỗi tuần dù dự án không deploy; `dependabot.yml` chưa kiểm được trên GitHub (chỉ kiểm cú pháp YAML bằng Prettier và đối chiếu schema thủ công).
- **Docs bị ảnh hưởng:** `testing.md`, `README.md`, `requirements.md` §6.6, `roadmap-next.md`; `.github/workflows/ci.yml`, `.github/dependabot.yml`.

## D-056 Mailer bền vững

- **Ngày:** 2026-11-21 · **Người chốt:** Tech Lead (Đợt 1, R-06 của `roadmap-next.md`)
- **Trạng thái:** Áp dụng.
- **Bối cảnh:** `createSmtpMailer` cứng `secure: false`, không `requireTLS`, không timeout (một SMTP treo giữ socket vô hạn), gửi fire-and-forget không retry, nhánh SMTP không có test. Phạm vi dự án là portfolio chạy localhost, nên chọn mức gia cố nhẹ, không thêm bảng/migration.
- **Quyết định:**
  1. **Env mới** (zod, `.env.example`, `.env.production.example`, compose prod): `SMTP_SECURE` (bool, mặc định `false`; `true` = TLS ngầm định, cổng 465) và `SMTP_REQUIRE_TLS` (bool; mặc định `false` khi không production, `true` khi `NODE_ENV=production` trừ khi đặt `false` tường minh). Giá trị khác `true`/`false` làm backend không khởi động; chuỗi rỗng coi như chưa đặt.
  2. **Timeout:** `connectionTimeout` 10 giây, `greetingTimeout` 10 giây, `socketTimeout` 20 giây (hằng trong `lib/mailer.ts`). Tùy chọn transport dựng bằng hàm thuần `buildSmtpTransportOptions(env)` để test không cần mở kết nối.
  3. **Retry trong tiến trình:** tối đa **3 lần thử** (gồm lần đầu), chờ 1 giây rồi 4 giây giữa các lần (mảng `[1s, 4s, 16s]`, phần tử 16 giây chỉ dùng nếu nâng số lần thử). Chỉ retry lỗi tạm thời: mã `ECONNECTION`, `ETIMEDOUT`, `ESOCKET`, `ECONNRESET`, `ECONNREFUSED`, `EPIPE`, `EAI_AGAIN`, `EDNS` hoặc SMTP `responseCode` 4xx. Lỗi vĩnh viễn (SMTP 5xx, `EAUTH`, `ETLS`, `EENVELOPE`, lỗi lạ) không retry. Hàm chờ tiêm được (`deliverWithRetry(msg, ctx, { delay })`) để test chạy nhanh. `sendMailInBackground(msg, ctx?)` không bao giờ ném lỗi ra luồng request.
  4. **Log:** mỗi lần thất bại log `error` với `mail` (loại: `order-confirmation`, `order-status`, `verify-email`, `reset-password`, `contact`), `orderCode` (nếu có), `attempt/maxAttempts`, `transient`, `willRetry` và đối tượng lỗi. **Không** log nội dung mail, token, link đặt lại mật khẩu; bỏ cả địa chỉ người nhận (trước đây có `to`) để giảm PII trong log.
- **Hệ quả/đánh đổi:**
  - Retry nằm trong RAM: backend restart giữa lúc chờ thì mail mất; mail bị bỏ cuộc sau 3 lần cũng mất (chỉ có log). Outbox (bảng + job) để sau, chưa cần ở localhost.
  - Tổng thời gian cố gắng tối đa ~5 giây chờ + 3 lần timeout (tới ~3x20 giây) giữ một promise nền, không chặn request.
  - `SMTP_REQUIRE_TLS=true` mặc định ở production: SMTP không hỗ trợ TLS bị từ chối (đúng ý đồ). Chạy production thử với Mailpit (không TLS) phải đặt `SMTP_REQUIRE_TLS=false`.
  - Kiểm bằng SMTP thật cần R-26 (chưa làm); nhánh SMTP chỉ được test ở mức tùy chọn transport, chưa có kiểm thử qua socket thật.
- **Docs bị ảnh hưởng:** `api-contract.md` (0.19, danh sách env), `architecture.md` §8, `deployment.md` (bảng biến env), `testing.md`, `backend/.env.example`, `.env.production.example`, `docker-compose.prod.yml`.

## D-057 Chống giữ kho bằng đơn COD khách vãng lai

- **Ngày:** 2026-11-21 · **Người chốt:** Tech Lead (Đợt 1, R-04 của `roadmap-next.md`)
- **Trạng thái:** Áp dụng. Bổ sung D-001, D-010, D-028, D-052.
- **Bối cảnh:** Đơn COD trừ kho ngay và không có hạn; khách vãng lai không cần tài khoản, chỉ bị giới hạn theo IP (10 đơn/phút). Một người có thể đặt nhiều đơn COD rồi để đó, giữ hết tồn kho, hoặc nhập email người khác để họ nhận mail xác nhận.
- **Quyết định:**
  1. **Hạn giữ kho:** đơn COD của khách vãng lai (`userId` null) `PENDING` tạo quá `GUEST_COD_HOLD_HOURS` giờ (env, 1..720, mặc định 48) bị job nền hủy: cùng nhịp 60 giây và cùng advisory lock `EXPIRE_PAYMENTS_LOCK_KEY` với job hết hạn thanh toán (chạy nối tiếp trong `safeRunExpire`), tối đa 50 đơn/lượt (index `[status, createdAt]`), mỗi đơn 1 transaction, khóa `Order` rồi kiểm lại điều kiện, `cancelOrderTx` với actor `SYSTEM`, `actorId` null, lý do hằng `GUEST_COD_EXPIRE_REASON` = "Quá hạn xác nhận đơn" (export từ `jobs/cleanup.ts`), hoàn kho + hoàn lượt mã, gửi email trạng thái hủy sau commit (`afterOrdersExpired`). Chạy lần hai không hủy/hoàn kho lần nữa (điều kiện trạng thái trong transaction). Không áp cho khách có tài khoản và đơn online (đã có `expiresAt`). Máy trạng thái §11 #4 thêm actor `SYSTEM` cho `PENDING -> CANCELLED` (hẹp: `PENDING -> CONFIRMED` và các trạng thái sau vẫn không có SYSTEM).
  2. **Phân loại hủy (D-052, §16.3):** loại `expired` gồm thêm (`actorId` null, `fromStatus = PENDING`, `note = GUEST_COD_EXPIRE_REASON`); nhãn đổi từ "Hết hạn thanh toán" thành "Hết hạn tự động" (API, UI, CSV, docs, fixture test). Đánh đổi như D-052: khách vãng lai tự nhập đúng lý do "Quá hạn xác nhận đơn" khi hủy đơn `PENDING` cũng bị tính `expired`.
  3. **Giới hạn đơn mở:** khi khách vãng lai đặt đơn COD, nếu đã có >= `GUEST_COD_MAX_OPEN` (env, 1..100, mặc định 3) đơn COD, `PENDING`, `userId` null cùng `contactPhone` (đã chuẩn hóa) HOẶC cùng `contactEmail` (lowercase) -> 409 `TOO_MANY_PENDING_ORDERS` (`details.max`). Kiểm SAU nhánh idempotency replay (gửi lại cùng key + cùng body vẫn trả đơn cũ). Đếm trong cùng transaction đặt đơn, sau hai khóa `pg_advisory_xact_lock(hashtextextended(...))` theo SĐT và email (sắp theo chuỗi để không deadlock; khóa theo giao dịch, tự nhả khi commit/rollback). **Mức đảm bảo:** các lần đặt song song cùng SĐT hoặc cùng email bị tuần tự hóa nên không vượt giới hạn (có test 6 request song song, đúng 3 thành công); hai request khác cả SĐT lẫn email không chờ nhau. Dùng index sẵn có (`contactPhone`, `contactEmail`, `[status, createdAt]`), không migration.
  4. **Captcha tùy chọn:** nếu Turnstile đã cấu hình (cùng env/`app.locals` của form liên hệ, D-028) thì `POST /orders` của khách vãng lai bắt buộc `captchaToken` (xác minh qua `lib/turnstile.ts`; hàm dùng chung mới `assertCaptcha`, form liên hệ cũng dùng lại: thiếu/sai 400 `CAPTCHA_FAILED`, Cloudflare lỗi 503 `SERVICE_UNAVAILABLE`); khách đăng nhập không cần. Token Turnstile dùng một lần nên: kiểm sau nhánh replay, và `captchaToken` bị loại khỏi `requestFingerprint` (gửi lại cùng đơn với token mới vẫn cùng `Idempotency-Key`). FE checkout hiện widget `TurnstileWidget` (tái dùng) cho khách vãng lai khi có site key, khóa nút Đặt hàng tới khi có token, reset widget sau mỗi lần gửi lỗi, `Idempotency-Key` tính trên payload không gồm token. Site key lấy từ `contactCaptcha` của `GET /settings/public` (giữ tên cũ để không đổi contract); trang `/thanh-toan` giờ là ISR 300 giây đọc cấu hình này, và nếu HTML cũ làm FE thiếu widget thì khi gặp `CAPTCHA_FAILED` FE nạp lại cấu hình. CSP storefront đã cho phép Turnstile (`script-src`, `default-src`/`frame-src` trong `frontend/src/lib/csp.ts`); admin không đổi.
- **Hệ quả/rủi ro (đánh đổi đã chấp nhận):**
  - Hạn 48 giờ chỉ đo từ `createdAt`: đơn chờ xác nhận lâu vì cửa hàng bận cũng bị hủy (cùng ngưỡng "quá 24 giờ" ở màn Vận hành chỉ là cảnh báo). Cửa hàng cần xác nhận kịp hoặc tăng `GUEST_COD_HOLD_HOURS`.
  - Giới hạn theo SĐT/email chặn luôn khách thật có nhiều đơn chờ (ví dụ mua cho nhiều người cùng SĐT); thông báo hướng dẫn chờ xác nhận hoặc liên hệ cửa hàng. Kẻ xấu dùng nhiều SĐT/email khác nhau vẫn qua được (không phải kiểm soát tuyệt đối, chỉ nâng chi phí); captcha và rate limit IP bổ sung.
  - Email nhập tùy ý vẫn có thể là của người khác: giới hạn chỉ hạn chế số mail xác nhận/hủy gửi tới một email, chưa có xác minh email (ngoài phạm vi).
  - Bộ lọc "đơn nghi vấn" cho staff (đề xuất ban đầu của R-04) chưa làm.
  - Test chung đặt `GUEST_COD_MAX_OPEN=100` trong `tests/testEnv.ts` vì nhiều test đặt hàng loạt đơn cùng một SĐT; test của giới hạn (`guestCod.integration.test.ts`) đặt lại 3.
  - Trang `/thanh-toan` chuyển từ tĩnh sang ISR 300 giây (gọi `GET /settings/public` lúc dựng); khi backend tắt lúc build rơi về mặc định (captcha tắt).
- **Docs bị ảnh hưởng:** `api-contract.md` §2, §9.2, §11, §14.9 (ghi chú), §16.3 (0.19), `architecture.md` §7-§8, `deployment.md`, `testing.md`, `backend/.env.example`, `.env.production.example`, `docker-compose.prod.yml`. Không đổi `db-schema.md` (không migration).

## D-058 Bảo vệ DB khỏi truy vấn analytics nặng và giới hạn tài nguyên container

- **Ngày:** 2026-11-21 · **Người chốt:** Tech Lead (Đợt 1, R-08 của `roadmap-next.md`)
- **Trạng thái:** Áp dụng. Bổ sung D-054.
- **Bối cảnh:** Analytics chạy trên DB giao dịch, không `statement_timeout`, dùng chung pool 10 kết nối với luồng đặt hàng; số đo D-054: breakdown 365 ngày ~0,8-0,9 giây ở 100.000 đơn. Compose không có giới hạn tài nguyên cho service nào.
- **Quyết định:**
  1. **Pool riêng cho analytics:** `PrismaClient` thứ hai `analyticsPrisma` (`lib/prisma.ts`, adapter `pg`) chỉ dùng cho truy vấn của `modules/admin/analytics/*` (overview, breakdown, top, customers, operations, inventory, coupons và export qua cùng service); `max` = `ANALYTICS_POOL_MAX` (1..50, mặc định 4). Ghi audit của export và `ordersNeedingRefund` (dùng chung với màn đơn hàng) vẫn ở pool chính. Pool chính `max` = `DATABASE_POOL_MAX` (1..100, mặc định 10, đúng mặc định cũ của `pg`).
  2. **Timeout ở mức kết nối:** tùy chọn `statement_timeout` của `pg` (`PoolConfig`, gửi lúc bắt tay kết nối, đã kiểm: `SHOW statement_timeout` trả `15s` ở pool analytics và `0` ở pool chính) = `ANALYTICS_STATEMENT_TIMEOUT_MS` (1000..120000, mặc định 15000). Không dùng `SET LOCAL` vì analytics không chạy trong transaction.
  3. **Ánh xạ lỗi:** Prisma 7 + adapter-pg ném `PrismaClientKnownRequestError` `P2010` với `meta.driverAdapterError.cause.code = '57014'` (query_canceled) (đã kiểm bằng `pg_sleep`); `isQueryCanceled` dò mã ở các tầng `cause/meta/driverAdapterError`. Middleware lỗi gắn cuối router analytics đổi thành 503 `ANALYTICS_TIMEOUT` ("Truy vấn phân tích quá lâu, hãy thu hẹp khoảng ngày"); lỗi khác chuyển tiếp nguyên vẹn (500). Có trong §2 và §16 của contract.
  4. **Shutdown:** `disconnectPrisma()` đóng cả hai client (`server.ts`).
  5. **Tài nguyên container** (`docker-compose.prod.yml`, cú pháp `mem_limit`/`cpus` ở mức service, `docker compose config -q` hợp lệ với env giả như job `ops-lint`): db 640m/1,0 cpu (gồm `/dev/shm` 256mb), backend 448m/1,0, frontend 320m/0,75, caddy 96m/0,25, backup 128m/0,25; tổng 1632m cho VPS 2 vCPU/2 GB. **Ước lượng, chưa đo trên VPS thật** (ghi trong comment compose). Dev `docker-compose.yml` không đổi.
  6. **Không làm** bảng tổng hợp (R-19) và cache analytics (để sau); R-08 trong roadmap hết hai nửa còn lại (pool/timeout, giới hạn container).
- **Hệ quả/rủi ro:**
  - Hai pool tối đa 10 + 4 = 14 kết nối tới Postgres (mặc định `max_connections` 100): đủ rộng.
  - Timeout 15 giây là ước lượng, nhiều hơn xa số đo hiện tại (< 1 giây ở 100.000 đơn); Admin chọn khoảng ngày rất lớn trên dữ liệu rất lớn sẽ nhận 503 thay vì treo.
  - Hạn mức bộ nhớ backend 448m chưa kiểm với export lớn; nếu bị OOM-kill thì nâng (hướng dẫn trong comment compose). Chưa có số đo `docker stats`.
  - Lỗi 57014 ở truy vấn trong `Promise.all` làm cả request thất bại; các truy vấn còn lại vẫn chạy tới hết hoặc tới timeout của chính chúng (không hủy chủ động).
- **Docs bị ảnh hưởng:** `api-contract.md` §2, §16 (0.19), `architecture.md` §8, `deployment.md`, `testing.md`, `backend/.env.example`, `.env.production.example`, `docker-compose.prod.yml`, `roadmap-next.md`.


## D-059 Lớp lỗi, trạng thái tải, header mobile và múi giờ hiển thị

- **Ngày:** 2026-11-21 · **Người chốt:** Tech Lead (Đợt 1, R-02 và R-12 của `roadmap-next.md`)
- **Trạng thái:** Áp dụng. Bổ sung D-040, D-044, D-048.
- **Bối cảnh:** Lỗi trong layout gốc làm trắng trang (chỉ có `error.tsx`); đổi lọc/trang ở danh mục không có phản hồi tải; khi API sập hai trang trả ErrorState với HTTP 200 và metadata không noindex; header mobile 3 hàng chiếm 165/844 px, mục nav cuối bị cắt không có gợi ý; formatter ngày giờ không chỉ định múi giờ nên SSR (server UTC) có thể lệch giờ trình duyệt.
- **Quyết định - phần 1 (R-02):**
  1. **`app/global-error.tsx`:** client component có `<html lang="vi"><body>`, tiếng Việt, nút "Thử lại" (`reset()`), link `<a href="/">` thường (không phụ thuộc router/Provider), hiện mã `digest` nếu có và `console.error("global-error", digest, error)` (chưa có dịch vụ thu lỗi, ngoài phạm vi). Chỉ import `globals.css` (thẻ `<link>`), không script inline mới nên CSP storefront (D-040) không cần đổi. Chưa kiểm bằng cách ép layout gốc ném lỗi trên trình duyệt thật (chỉ test render + build).
  2. **Chỉ báo tải của danh mục/tìm kiếm là phía client, KHÔNG dùng `loading.tsx` ở route slug.** `features/catalog/components/ListingNavigation.tsx`: `ListingNavigationProvider` (một `useTransition` chung, đặt quanh bộ lọc + lưới ở `/danh-muc/[slug]` và `/tim-kiem`), `useListingPush` (dùng ở `FilterPanel`, `SortSelect`), `ListingLink` (dùng ở `Pagination`; click có phím bổ trợ/giữa vẫn là link thật) và `ListingResultsRegion` (bọc lưới + phân trang trong `ProductResults`). Trong lúc chờ server trả trang mới: vùng kết quả có `aria-busy="true"`, mờ `opacity-60` và chữ ẩn "Đang tải..." (`role="status"`, `sr-only`); chỉ đổi opacity nên không CLS; trang cũ giữ trên màn hình tới khi trang mới sẵn sàng. Không đổi cơ chế điều hướng/debounce của bộ lọc nên không ảnh hưởng D-035. `/tim-kiem` vẫn giữ `loading.tsx` (`ListingSkeleton`, không phải route slug, không có 404/308 theo slug). `/san-pham/[slug]` không có chỉ báo tải (không bỏ lỡ gì: chuyển giữa các sản phẩm là điều hướng link thường); `ProductDetailSkeleton` đã xóa.
  3. **Bảng route `next build` trước/sau: không đổi.** Cả hai trang vốn đã là `ƒ` (Dynamic: đọc `searchParams`/không có `generateStaticParams`), dữ liệu cache ở tầng fetch (`revalidate`); `loading.tsx` không đổi kiểu route nào.
  4. **Đã bỏ `loading.tsx` ở `/san-pham/[slug]` và `/danh-muc/[slug]` (sửa hồi quy HTTP).** Bản đầu thêm hai file này; đo trên production build cho thấy chúng làm slug không tồn tại trả HTTP 200 (soft-404; shell đã flush trước khi trang biết là 404) và có nguy cơ biến redirect 308 slug cũ (D-018) thành redirect phía client. Quyết định: xóa cả hai, thay bằng chỉ báo tải phía client (mục 2). Đo lại trên production build (`next build` + `next start`, API + DB tạm; `GET` không theo redirect): slug sản phẩm không tồn tại -> 404; slug danh mục không tồn tại -> 404; slug sản phẩm cũ (đã đổi qua API admin) -> 308 `Location: /san-pham/<slug mới>`; slug danh mục cũ -> 308 `Location: /danh-muc/<slug mới>`; trang thường (`/`, danh mục có thật) -> 200. Lưu ý khi tự kiểm: cây danh mục và tra cứu sản phẩm được cache ở tầng fetch (`revalidate`), nên slug đã được truy cập TRƯỚC khi đổi vẫn trả trang cũ (200) tới khi hết TTL; muốn thấy 308 ngay phải đổi slug trước lần truy cập đầu (hoặc xóa `.next/cache/fetch-cache`). Test tự động `Skeletons.test.tsx` khẳng định hai file `loading.tsx` không tồn tại để không ai thêm lại.
  5. **Trang lỗi khi API sập:** giữ ErrorState với HTTP 200 (đã kiểm: Next không cho đặt 5xx khi shell đã stream) và `generateMetadata` nhánh lỗi trả `robots: { index: false, follow: false }` (đã kiểm HTML thật có `<meta name="robots" content="noindex, nofollow">`). **Cache:** trang là dynamic nên không có HTML cache; tầng fetch của Next chỉ lưu phản hồi 200 nên lỗi không bị giữ lại: đã kiểm bằng cách chạy `next start` khi API tắt (ErrorState + noindex), bật API, tải lại cùng tiến trình -> trang bình thường ngay, không noindex. Không chuyển sang `throw` (sẽ rơi `error.tsx` nhưng vẫn là 200 do streaming, không có lợi). Chưa xử lý: khi chỉ `getProducts` lỗi (danh mục vẫn tải được) trang danh mục hiện ErrorState mà metadata vẫn index (metadata không biết kết quả này).
- **Quyết định - phần 2 (R-12):**
  1. **Header mobile (< md) 2 hàng:** hàng 1 = logo + nút "Danh mục" (icon, chữ hiện từ 430 px, `sr-only` dưới đó) + giỏ + tài khoản; hàng 2 = ô tìm kiếm full-width. `<nav>` ngang chỉ hiện từ md. Nút (`MobileCategoryMenu`) có `aria-expanded`, `aria-controls`; bảng thả xuống `absolute` ngay dưới header (`<nav aria-label="Danh mục sản phẩm">`, thuộc tính `hidden` khi đóng), Escape đóng và trả focus về nút, bấm ra ngoài hoặc chọn link thì đóng; vùng chạm >= 44 px. Desktop (>= md) giữ nguyên bố cục (cùng DOM, đổi bằng `order`/`hidden`). Skip link, combobox tìm kiếm ARIA, MiniCart không đổi.
  2. **Chiều cao header ở 390x844 (đo bằng `getBoundingClientRect` trên production build, Edge):** trước 165 px (19,5 % viewport), sau 113 px (13,4 %). Cả hai hàng vẫn sticky (không làm kiểu "ô tìm kiếm cuộn đi" để tránh offset cố định dễ vỡ khi hàng 1 bị xuống dòng). Đo thêm (Edge, production build, `getBoundingClientRect`): 390x844 khách và staff 113 px (2 hàng); 360x800 khách 113 px, 360x800 staff đăng nhập 165 px (xuống 3 hàng, chấp nhận; không tràn ngang ở cả bốn ca); menu Danh mục dùng được bằng bàn phím (Enter mở, Tab vào bảng, Escape đóng và trả focus), axe 0 serious/critical khi menu mở. Trang chủ không tràn ngang (`scrollWidth` = `clientWidth` = 390).
  3. **Múi giờ:** `lib/format.ts` (`formatDate`, `formatDateTime`) cố định `timeZone: "Asia/Ho_Chi_Minh"` (cùng với `features/admin/format.ts` đã có sẵn). Test biên UTC: `2026-11-20T18:30:00Z` -> `21/11/2026 01:30`; chạy đúng với `TZ=UTC`, `America/Los_Angeles`, `Asia/Tokyo`. Các test cũ dùng `new Date(y, m, d, h)` (giờ máy) được đổi sang chuỗi ISO UTC.
  4. **Không làm** "Mua lại" (FR-ORD-07) trong đợt này.
- **Hệ quả/rủi ro:**
  - Không còn soft-404 (đã bỏ `loading.tsx` ở route slug). Đổi lại, vào `/san-pham/[slug]` lần đầu không có skeleton (chờ server); danh mục có chỉ báo khi đổi lọc/sắp xếp/trang.
  - Ảnh `docs/screenshots/mobile-home.png` đổi (header mới); `mobile-admin-orders.png` không đổi vì header admin riêng.
  - Hai `<nav>` cùng danh sách link tồn tại trong DOM (một cái ẩn bằng CSS/`hidden` theo breakpoint); phần tử ẩn không vào cây truy cập nên không bị đọc trùng.
- **Docs bị ảnh hưởng:** `testing.md`, `roadmap-next.md`, `docs/screenshots/mobile-home.png`.


## D-060 Thanh toán giả lập cho demo (VNPay giả, MoMo giả)

- **Ngày:** 2026-11-22 · **Người chốt:** Tech Lead (Đợt 2, mục 1)
- **Trạng thái:** Áp dụng. Bổ sung D-014 (thanh toán online), D-015 (`applyPaymentResult`).
- **Bối cảnh:** Dự án là portfolio chạy trên localhost, không có tài khoản sandbox hay khóa thật; không thể trình diễn luồng thanh toán online đầu-cuối. Cần luồng demo chạy được mà vẫn đi qua đúng logic xử lý thanh toán thật, và không thể vô tình bật ở môi trường thật.
- **Quyết định:**
  1. **Cờ `PAYMENT_MOCKS_ENABLED` (mặc định tắt)** + `PAYMENT_MOCK_SECRET` (khóa ký của cổng giả, >= 16 ký tự; trống thì sinh ngẫu nhiên mỗi lần khởi động và ghi cảnh báo). Backend **từ chối khởi động** khi bật cùng `NODE_ENV=production`, hoặc cùng `VNPAY_TMN_CODE` (không trộn giả với sandbox thật). Khởi động có cảnh báo to khi bật.
  2. **VNPay giả dùng lại nguyên luồng sandbox:** `vnp_TmnCode = BEANBOXDEMO`, hash secret = khóa mock, `paymentUrl` = trang FE `${WEB_APP_URL}/cong-thanh-toan-gia-lap/vnpay`, `vnp_ReturnUrl` luôn là `${WEB_APP_URL}/thanh-toan/ket-qua?provider=vnpay` (không theo `VNPAY_RETURN_URL` vì cổng giả nằm cùng origin với web). Không thay đổi `payments.providers` ngoài việc đổi cấu hình.
  3. **MoMo giả (`MOMO` thêm vào cả hai enum):** chữ ký HMAC-SHA256 trên chuỗi `k=v&k=v...` sắp theo khóa, giá trị thô; endpoint `POST /payments/momo/create`, `POST /payments/momo/ipn`, `GET /payments/momo/return` (chỉ đọc, IPN là nguồn sự thật như D-014). Chấp nhận mô phỏng: tên trường tự đặt, IPN trả 200 JSON (MoMo thật trả 204), không cam kết khớp tài liệu MoMo.
  4. **`POST /mock-gateway/{vnpay|momo}/complete`:** nhận `params` (nguyên tham số có chữ ký) và `result` = `success|failed|cancel`; kiểm chữ ký bằng khóa mock, dựng callback IPN giả rồi **gọi trực tiếp** `handleVnpayIpn`/`handleMomoIpn` (cùng hàm các route IPN thật dùng; tách khỏi controller vào `payments.ipn.ts`), trả `{ returnUrl }` đã ký. Không có đường tắt vào DB nên chữ ký, số tiền, idempotent, thanh toán muộn đều được thử thật. Router chỉ mount khi cờ bật (tắt thì 404 như route không tồn tại). `failed`/`cancel` -> Payment `FAILED`, đơn vẫn `PENDING_PAYMENT` (D-001).
  5. **FE:** trang `/cong-thanh-toan-gia-lap/{vnpay,momo}` (noindex, nằm trong `PRIVATE_PATHS`) với cảnh báo "Cổng thanh toán GIẢ LẬP, không trừ tiền thật", mã đơn, số tiền, ba nút. `goToPayment` giữ quy tắc https-only và chỉ thêm ngoại lệ cùng origin + `/cong-thanh-toan-gia-lap/*`; `returnUrl` chỉ được điều hướng khi cùng origin và đúng `/thanh-toan/ket-qua`. Checkout chỉ liệt kê `MOMO`/`BANK_TRANSFER` khi bật, và gắn chip "Giả lập, không trừ tiền thật" (`mock: true` ở `paymentMethods`); danh sách mặc định không đổi.
  6. **Nhãn analytics:** `MOMO` "MoMo (giả lập)", `BANK_TRANSFER` "Chuyển khoản / VietQR".
  7. **Playwright** bật hai cờ (`PAYMENT_MOCKS_ENABLED`, `BANK_TRANSFER_ENABLED`) cho backend trong `playwright.config.ts`, nên job `e2e` của CI không cần đổi.
- **Hệ quả/rủi ro:**
  - Khóa mock tự sinh đổi mỗi lần khởi động: phiên cổng giả đã mở trước đó báo chữ ký không hợp lệ (đặt `PAYMENT_MOCK_SECRET` cố định nếu muốn giữ).
  - `PaymentConfig.momo`/`bankTransfer`/`mocksEnabled` là trường tùy chọn để test dựng cấu hình bằng tay vẫn biên dịch; mặc định cấu hình vẫn là `{ vnpay: null, stripe: null }`.
  - Nếu ai đó chạy bản này trên môi trường công khai mà không đặt `NODE_ENV=production`, cờ vẫn có thể bật: cảnh báo khởi động là lớp chặn duy nhất (không phát hiện được "môi trường công khai" ở mức mã).
  - Cổng giả chỉ ký bằng một khóa chung: ai biết khóa mock có thể tự ký callback (khóa tự sinh không được ghi log); chấp nhận cho demo.
- **Docs bị ảnh hưởng:** `api-contract.md` 0.20 (§2, §9, §12.1, §13, §14.9, §16.2), `db-schema.md` 0.10, `payments-setup.md` mục 6, `architecture.md` §8, `testing.md`, `backend/.env.example`, `README.md`.


## D-061 Chuyển khoản / VietQR demo

- **Ngày:** 2026-11-22 · **Người chốt:** Tech Lead (Đợt 2, mục 1)
- **Trạng thái:** Áp dụng. Bổ sung D-060, D-057.
- **Bối cảnh:** Thanh toán chuyển khoản là phổ biến ở Việt Nam; cần trình diễn luồng QR VietQR + đối soát tay mà không đụng tiền thật và không có tích hợp ngân hàng.
- **Quyết định:**
  1. **`BANK_TRANSFER`** thêm vào `PaymentMethod` và `PaymentProvider`; bật bằng `BANK_TRANSFER_ENABLED`, thời gian giữ đơn `BANK_TRANSFER_HOLD_HOURS` (1..72, mặc định 24, thay cho `order.paymentExpiryMinutes`). Tạo đơn như đơn online: `PENDING_PAYMENT`, giữ kho và lượt mã; hết hạn thì job hết hạn tự hủy (D-015). `canPay` luôn `false`.
  2. **Tài khoản nhận tiền** nằm trong setting `payment.bankTransfer` (`bankBin`, `bankName`, `accountNo`, `accountName`; chỉ Admin sửa; không vào `GET /settings/public`). Mặc định **BIN 999999** (không tồn tại): ứng dụng ngân hàng không thể chuyển tiền thật tới QR này. `isDemo = (BIN = 999999) hoặc cổng giả bật` -> FE bắt buộc cảnh báo "Tài khoản demo, KHÔNG chuyển tiền thật".
  3. **QR VietQR/EMVCo** dựng ở server (`vietqr.ts`: TLV `00,01,38,53,54,58,62,63`, CRC16-CCITT, có test với vector chuẩn "123456789" -> `29B1`) và ảnh PNG data URL bằng thư viện `qrcode` (phụ thuộc mới, nhỏ và phổ biến; dự kiến dùng lại cho 2FA). Nội dung chuyển khoản = mã đơn. CSP storefront đã cho `img-src data:` nên không đổi CSP.
  4. **"Tôi đã chuyển khoản"** (`POST /orders/:code/bank-transfer/claim`, Optional, cùng quyền như thanh toán lại: chủ đơn hoặc guest + SĐT) chỉ ghi `Order.transferClaimedAt`; KHÔNG đổi `paymentStatus`. Lý do: không có bằng chứng ngân hàng; để khách tự bấm "đã trả" mà đơn thành PAID sẽ làm giả doanh thu và cho phép nhận hàng không trả tiền.
  5. **Xác nhận bởi nhân viên** (`POST /admin/orders/:code/bank-transfer/confirm`): đi qua `applyPaymentResult` (tạo hoặc dùng Payment `BANK_TRANSFER`, `providerRef` = mã đơn) nên idempotent và có nhánh thanh toán muộn (đơn đã hủy -> ghi nhận tiền + cần hoàn tiền, D-015). Ghi audit `payment.bank_transfer_confirm`. Danh sách đơn admin có bộ lọc `transferClaimed` và nhãn "Khách báo đã chuyển khoản"; chi tiết đơn có hộp xác nhận hai bước.
  6. **Quyền: Staff trở lên**, không chỉ Admin. Lý do: staff vốn xác nhận thu tiền COD và xử lý đơn hằng ngày (router admin đã `requireStaff`); đây là thao tác tương đương và có audit. Hoàn tiền vẫn chỉ Admin. Nếu cần siết, đổi sang Admin chỉ là thêm `requireAdmin` ở một route.
  7. **Mở rộng giới hạn khách vãng lai (ngoài yêu cầu gốc):** vì đơn chuyển khoản giữ kho tới 72 giờ mà không cần trả trước, `GUEST_COD_MAX_OPEN` (D-057) cũng áp dụng cho đơn `BANK_TRANSFER` `PENDING_PAYMENT` của khách vãng lai (cùng SĐT/email, cùng mã lỗi `TOO_MANY_PENDING_ORDERS`). Không thêm biến môi trường mới. Đơn của tài khoản đăng nhập không bị giới hạn (như D-057).
- **Hệ quả/rủi ro:**
  - Không có đối soát tự động: nhân viên phải tự kiểm sao kê; xác nhận nhầm là lỗi con người (có audit để truy vết). Thêm index `transferClaimedAt` không cần ở quy mô hiện tại.
  - Giữ kho tối đa `BANK_TRANSFER_HOLD_HOURS` cho mỗi đơn chưa trả; khách có tài khoản không bị giới hạn số đơn mở nên vẫn có thể giữ kho (cùng rủi ro đã chấp nhận ở D-057 cho đơn online).
  - Mã QR demo không quét ra giao dịch hợp lệ ở bất kỳ ngân hàng nào; nếu admin đổi BIN thật và tắt cổng giả thì cảnh báo demo biến mất: đó là lựa chọn có chủ ý của admin.
  - Thêm 2 giá trị enum bằng `ALTER TYPE ... ADD VALUE` (không rollback được trong transaction; Prisma xử lý trong migration riêng).
- **Docs bị ảnh hưởng:** như D-060, thêm `api-contract.md` §9.6 và `db-schema.md` (`Order.transferClaimedAt`).


## D-062 Vận chuyển giả lập: thời gian giao dự kiến, mã vận đơn giả, hành trình mô phỏng

- **Ngày:** 2026-11-22 · **Người chốt:** Tech Lead (Đợt 2, mục 2)
- **Trạng thái:** Áp dụng. Bổ sung D-003 (phí ship), D-006 (vùng nội thành), D-016 (email trạng thái), D-021 (cài đặt).
- **Bối cảnh:** Portfolio chạy localhost, không có hãng vận chuyển hay khóa thật. Cần luồng giao hàng trông như thật (ngày giao dự kiến, mã vận đơn, hành trình) mà không đổi cách tính giá và không thêm hạ tầng.
- **Quyết định:**
  1. **Giữ nguyên cách tính phí** (vùng nội thành/ngoại tỉnh theo settings + dataset địa chỉ, STANDARD/EXPRESS, phụ phí khối lượng, freeship). Không đổi giá, idempotency hay `requestFingerprint`.
  2. **Thời gian giao dự kiến:** setting `shipping.eta` = `{ inner|other: { STANDARD|EXPRESS: { minDays, maxDays } } }` (số nguyên 0..30, `min <= max`; tên vùng `inner`/`other` như `shipping.rates` thay vì `innerCity`, để đồng nhất). Mặc định nội thành Tiêu chuẩn 1-2, Nhanh 0-1; ngoài nội thành Tiêu chuẩn 3-5, Nhanh 1-3. Admin sửa ở `/admin/cai-dat` (khối "Phí vận chuyển"). Quote trả `eta: { minDays, maxDays, fromDate, toDate }` cho mỗi phương thức; **tính theo ngày lịch Việt Nam** từ ngày đặt (không loại chủ nhật/ngày lễ, ghi rõ là ước tính). Đơn lưu snapshot `etaFrom`/`etaTo` (`DATE`) do server tính lúc đặt bằng cùng hàm với quote; client không gửi; đổi settings sau đó không đổi đơn cũ. `estimatedDays` giữ lại (dẫn xuất từ settings) để FE cũ không vỡ.
  3. **Hãng giả lập + mã vận đơn:** hai hãng cố định trong code: `BeanBox Logistics (giả lập)` (`BBL`, STANDARD) và `BeanBox Express (giả lập)` (`BBE`, EXPRESS). Khi Staff chuyển `PROCESSING -> SHIPPING`: nhập mã/hãng thì giữ nguyên; để trống thì dùng mã đã có trên đơn, nếu chưa có thì server sinh `<BBL|BBE>-<YYYYMMDD VN>-<6 ký tự>` từ bảng `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (không 0/O/1/I/L), kiểm trùng trong DB, thử lại tối đa 8 lần, và đặt `carrier` = tên hãng giả lập (trừ khi staff nhập hãng). **Đổi hành vi so với contract 0.20:** `trackingNumber` không còn bắt buộc (trước đây thiếu -> 400).
  4. **Hành trình mô phỏng, không thêm bảng:** `shipment = { carrier, trackingNumber, simulated: true, events[] }` trong `Order`/`TrackedOrder`/`AdminOrder`, `null` khi đơn chưa từng `SHIPPING`. Hàm thuần `buildShipmentEvents({ history, etaTo, deliveredAt, now })` (api-contract §9.7): `HANDOVER` (lúc `SHIPPING`), `PICKED_UP` (+2 giờ), `IN_TRANSIT` (giữa), `OUT_FOR_DELIVERY` (08:00 VN ngày `etaTo`, tối thiểu +4 giờ); chỉ trả mốc có `at <= now`; mốc thật (giao thành công/không thành công/giao lại/hoàn/hủy) lấy từ lịch sử và cắt các mốc giả sau đó. Trạng thái đơn thật vẫn do Staff đổi, hệ thống không tự chuyển `DELIVERED`. FE luôn ghi "Hành trình mô phỏng (giả lập)".
  5. **FE:** checkout hiện "Dự kiến giao dd/MM – dd/MM" cho từng phương thức; trang thành công, chi tiết đơn tài khoản và tra cứu guest hiện dự kiến giao (ẩn khi đơn đã giao/hủy/hoàn) và khối "Hành trình vận chuyển" (`<ol>`, mới nhất ở trên, giờ Việt Nam, mã vận đơn có nút sao chép); admin chi tiết đơn hiện ETA + mã + hãng; hộp thoại SHIPPING gợi ý "Để trống để hệ thống tạo mã vận đơn giả lập". Email xác nhận đơn thêm dòng "Dự kiến giao".
  6. **Không làm** điểm nhận hàng tại cửa hàng.
- **Hệ quả/rủi ro:**
  - Ngày dự kiến theo ngày lịch nên có thể rơi vào chủ nhật/ngày lễ; chấp nhận vì chỉ là ước tính (không có lịch làm việc).
  - Đơn tạo trước migration có `etaFrom`/`etaTo` null: FE không hiện "Dự kiến giao", mốc `OUT_FOR_DELIVERY` tính theo `+24 giờ`.
  - (Cập nhật D-068: nay đã có chỉ mục unique ở DB.) Mã vận đơn giả không có ràng buộc unique ở DB (chỉ kiểm trùng ở ứng dụng trong transaction đang giữ khóa đơn); xác suất trùng giữa hai đơn cùng ngày ~ 1/887 triệu, chấp nhận cho demo. Chưa thêm index `trackingNumber`: kiểm trùng quét bảng `Order` tại thời điểm chuyển SHIPPING, đủ nhanh ở quy mô demo.
  - `shipment` tính theo đồng hồ máy chủ khi gọi API (không lưu): cùng một đơn hiện nhiều mốc hơn theo thời gian; test dùng đồng hồ tiêm.
  - Staff đã nhập mã/hãng thật vẫn thấy khối hành trình mô phỏng (cùng nhãn "giả lập").
- **Docs bị ảnh hưởng:** `api-contract.md` 0.21 (§9, §9.1, §9.5, §9.7, §10, §11, §12.1, §14.9), `db-schema.md` 0.11, `testing.md`, `wave2-plan.md`.


## D-063 Xác thực 2 lớp (TOTP) cho Staff và Admin

- **Ngày:** 2026-11-22 · **Người chốt:** Tech Lead (Đợt 2, mục 3)
- **Trạng thái:** Áp dụng. Bổ sung D-012/D-045 (phiên, xoay refresh, thu hồi), D-019 (audit), D-009 (limiter).
- **Bối cảnh:** Tài khoản Staff/Admin có quyền thao tác đơn hàng, hoàn tiền, người dùng và cài đặt; chỉ một mật khẩu là điểm yếu nhất của khu quản trị. Cần lớp thứ hai bằng ứng dụng xác thực (Google/Microsoft Authenticator, Authy) mà không thêm dịch vụ ngoài hay SMS.
- **Quyết định:**
  1. **TOTP tự cài, không thêm thư viện OTP** (`lib/totp.ts`): RFC 6238/4226, HMAC-SHA1, bước 30 giây, 6 chữ số, chấp nhận mã của bước hiện tại và +-1 bước (lệch đồng hồ), duyệt đủ cửa sổ và so sánh hằng thời gian (`timingSafeEqual`). Base32 RFC 4648 (bảng chữ cái chuẩn, không padding) tự cài. Kiểm bằng vector chuẩn: RFC 4226 Phụ lục D (HOTP, secret `12345678901234567890`, counter 0..9) và RFC 6238 Phụ lục B (SHA-1, thời điểm 59, 1111111109, 1111111111, 1234567890, 2000000000, 20000000000). **RFC 6238 liệt kê mã 8 chữ số; mã 6 chữ số của ta là 6 chữ số CUỐI của mã 8 chữ số** (cùng giá trị truncation, chỉ khác `mod 10^digits`), ví dụ t=59: `94287082` -> `287082`. Test cả hai dạng. Vector base32 RFC 4648 §10 (`foobar` -> `MZXW6YTBOI`, ...).
  2. **Chống dùng lại:** `User.twoFactorLastStep` (bước đã dùng gần nhất); chỉ nhận bước lớn hơn, ghi **nguyên tử** bằng `UPDATE ... WHERE lastStep IS NULL OR lastStep < step` (hai request song song chỉ một bên thắng). Mã dùng để bật 2FA cũng đặt `lastStep` nên không đăng nhập lại được bằng chính mã đó.
  3. **Phạm vi: chỉ STAFF/ADMIN, tùy chọn (không bắt buộc).** CUSTOMER gọi `/me/2fa/*` -> 403. Đây là lựa chọn cho bản demo để mọi luồng và E2E hiện có không đổi; **khi chạy thật nên bắt buộc với ADMIN** (cần thêm "bắt buộc thiết lập" ở lần đăng nhập đầu; chưa làm).
  4. **Lưu trữ secret:** 20 byte ngẫu nhiên, mã hóa **AES-256-GCM** (`lib/secretBox.ts`), IV 12 byte ngẫu nhiên mỗi lần, định dạng `v1:<iv>:<tag>:<ct>` (base64url), **AAD = userId** (không hoán đổi ciphertext giữa user). Khóa `TOTP_ENCRYPTION_KEY`: đúng 32 byte, 64 ký tự hex hoặc base64 (zod kiểm, thông báo lỗi không in khóa). Cột trên `User`: `twoFactorEnabledAt`, `twoFactorSecretEnc`, `twoFactorPendingSecretEnc` + `twoFactorPendingAt` (secret chờ xác nhận, hết hạn 10 phút), `twoFactorLastStep`. Secret dạng rõ chỉ trả đúng một lần ở `POST /me/2fa/setup`.
  5. **Thiếu khóa:** bật 2FA (`setup`) -> 503 `TWO_FACTOR_UNAVAILABLE`; user ĐÃ bật 2FA mà thiếu hoặc sai khóa (giải mã GCM lỗi) -> đăng nhập 503 (cả bước 1 lẫn bước 2), KHÔNG bỏ qua bước 2 và không phát challenge. **Production** yêu cầu khóa luôn được đặt và không phải khóa mẫu dev (khóa có byte đầu `beanbox-dev-`, kiểm trên byte nên cả dạng hex lẫn base64 đều bị chặn; thông báo không in giá trị), giống cách `env.ts` chặn secret `dev-`. `.env.example` có khóa mẫu dev ghi rõ chỉ dùng localhost; `docker-compose.prod.yml` dùng `${TOTP_ENCRYPTION_KEY:?...}`. Mất/đổi khóa = mọi user đã bật 2FA mất secret; Admin dùng "Đặt lại 2FA" để cứu (không có cơ chế xoay khóa tự động; `v1:` để dành cho đổi phiên bản sau).
  6. **Mã dự phòng:** 10 mã/lần, mỗi mã 10 ký tự định dạng `XXXXX-XXXXX`, bảng chữ cái 31 ký tự bỏ ký tự dễ nhầm (không I, L, O, 0, 1) -> ~49,5 bit entropy/mã nên lưu **SHA-256** của mã đã chuẩn hóa (viết hoa, bỏ gạch/khoảng trắng) là đủ, không cần băm chậm. Bảng `TwoFactorBackupCode(userId, codeHash, usedAt)`, unique `(userId, codeHash)`; dùng mã = `UPDATE ... SET usedAt WHERE usedAt IS NULL` (nguyên tử, một lần). Chọn bảng thay vì mảng JSON để đánh dấu đã dùng không cần đọc-sửa-ghi. Sinh lại mã xóa toàn bộ mã cũ. Mã chỉ trả một lần.
  7. **Luồng đăng nhập 2 bước:** `POST /auth/login` đúng mật khẩu + 2FA bật -> 200 `{ twoFactorRequired: true, challengeToken, expiresAt }`, **không cookie, không access token, không user** (response khác hình dạng nên FE phân biệt bằng `twoFactorRequired`). `challengeToken` = 32 byte ngẫu nhiên, DB chỉ giữ SHA-256 (`TwoFactorChallenge`), sống 5 phút. `POST /auth/login/2fa` `{ challengeToken, code | backupCode }` (đúng một trong hai) -> phát hành phiên y như login thường. Tạo challenge mới vô hiệu challenge chưa dùng trước đó. Sai mã -> `401 TWO_FACTOR_INVALID` (thông báo chung) và **tính vào `failedLoginCount`/khóa tạm hiện có** (5 lần -> `ACCOUNT_LOCKED` 15 phút); bước 1 KHÔNG reset `failedLoginCount` (chỉ hoàn tất bước 2 mới reset) để thử sai lặp qua nhiều lần đăng nhập vẫn dồn vào khóa. Mỗi challenge tối đa 5 lượt thử: **mỗi lượt được "đặt chỗ" nguyên tử trước khi kiểm mã** (`attempts + 1 WHERE attempts < 5`) nên gửi song song không vượt được 5; hết lượt/hết hạn/đã dùng -> `401 TWO_FACTOR_CHALLENGE_INVALID`. Đánh dấu challenge đã dùng và tiêu thụ mã nằm trong CÙNG một transaction (mã sai thì rollback). Dùng mã dự phòng ghi audit `user.2fa.backup_used`. Route mới dùng limiter nhóm auth hiện có (`AUTH_RATE_LIMIT_PER_MIN`, chung bộ đếm với login); như `/auth/login` không kiểm Origin (không dùng cookie ở bước này).
  8. **Quản lý 2FA của chính mình** (`/me/2fa/setup|enable|disable|backup-codes`, Staff+, cùng limiter auth): `setup` cần mật khẩu, trả `{ secret, otpauthUri (issuer "BeanBox", label email), qrDataUrl }` (PNG data URL, dùng lại `qrPngDataUrl` của `payments/vietqr.ts`/thư viện `qrcode` đã thêm ở D-061; CSP đã cho `img-src data:`); `enable` cần mã TOTP hợp lệ của secret chờ, sinh mã dự phòng và **thu hồi mọi phiên KHÁC** (giữ phiên hiện tại, theo `familyId` như đổi mật khẩu); `disable` và `backup-codes` cần mật khẩu + (mã TOTP hoặc mã dự phòng), `disable` xóa secret, mã dự phòng, challenge và thu hồi phiên khác, `backup-codes` không thu hồi phiên. Sai mật khẩu -> 400 `INVALID_PASSWORD`; sai mã -> 400 `TWO_FACTOR_INVALID` **và tính vào `failedLoginCount`** (chặn kẻ cầm access token đánh đoán mã); đã bật khi `setup`/`enable` -> 409 `CONFLICT`; chưa bật khi `disable`/`backup-codes` -> 409 `TWO_FACTOR_NOT_ENABLED`; chưa setup hoặc secret chờ quá 10 phút -> 409 `TWO_FACTOR_SETUP_REQUIRED`. Audit: `user.2fa.enable`, `user.2fa.disable`, `user.2fa.backup_regenerate`.
  9. **Admin đặt lại 2FA người khác** (`POST /admin/users/:id/2fa/reset`, chỉ Admin): tắt 2FA, xóa secret/mã dự phòng/challenge, thu hồi MỌI phiên của người đó, audit `user.2fa.reset`. Không áp cho chính mình (409 `CANNOT_MODIFY_SELF`; dùng luồng tự tắt); người đó chưa bật -> 409 `TWO_FACTOR_NOT_ENABLED`. Trang admin chi tiết người dùng hiện trạng thái 2FA và nút đặt lại (hộp xác nhận). `GET /admin/users` và `/admin/users/:id` thêm `twoFactorEnabled`.
  10. **`User` DTO** (mọi response cấp phiên, `GET/PATCH /me`) thêm `twoFactorEnabled: boolean`, không lộ thêm gì khác.
  11. **Không đổi:** user chưa bật 2FA đăng nhập như cũ; refresh/rotation, vai trò đọc lại mỗi request (D-045) không đổi. Job dọn dẹp xóa challenge hết hạn.
  12. **FE:** `/tai-khoan` (chỉ Staff/Admin) mục "Xác thực 2 lớp": nhập mật khẩu -> QR (`<img>` có `alt`) + secret nhóm 4 ký tự để nhập tay + ô mã 6 số (`inputmode="numeric"`, `autocomplete="one-time-code"`) -> 10 mã dự phòng hiện một lần (sao chép, tải `.txt`, cảnh báo, phải tích "đã lưu" mới Hoàn tất) -> trạng thái "Đã bật" với tắt/tạo lại mã (mật khẩu + mã). Trang đăng nhập có bước 2: focus vào ô mã, liên kết "Dùng mã dự phòng", đếm ngược hạn challenge (hết hạn thì yêu cầu đăng nhập lại), lỗi tiếng Việt `role="alert"`; `challengeToken` chỉ nằm trong state React, không localStorage/sessionStorage/URL.
- **Hệ quả/rủi ro:**
  - Tính năng tùy chọn: Admin không bật 2FA vẫn đăng nhập bằng mật khẩu như cũ. Chưa có chính sách bắt buộc (xem mục 3).
  - Mất điện thoại + mã dự phòng: chỉ Admin khác đặt lại được; nếu Admin DUY NHẤT mất cả hai thì phải can thiệp DB (xóa các cột 2FA của user đó) hoặc chạy lại seed. Chấp nhận cho demo; khi chạy thật cần quy trình khôi phục.
  - Người dùng bị hạ về CUSTOMER khi đang bật 2FA vẫn bị hỏi 2FA khi đăng nhập nhưng không tự tắt được (403 ở `/me/2fa/*`); Admin đặt lại hộ.
  - Quên mật khẩu (D-008) đặt lại được mật khẩu nhưng KHÔNG gỡ 2FA: kẻ chiếm hộp thư vẫn cần mã/mã dự phòng.
  - Đổi hoặc mất `TOTP_ENCRYPTION_KEY` làm hỏng secret đã lưu (đăng nhập của user đó trả 503 cho tới khi Admin đặt lại); không có xoay khóa.
  - Mã sai ở `disable`/`backup-codes` cũng cộng `failedLoginCount`: người dùng gõ sai nhiều lần có thể bị khóa đăng nhập tạm 15 phút (cân bằng với việc chặn đoán mã).
  - Cửa sổ +-1 bước nghĩa là mã sống tối đa ~90 giây; `lastStep` chỉ chặn dùng lại bước đã dùng, không chặn dùng bước kế tiếp từ máy khác.
  - E2E có thể phải chờ tới ~30 giây cho bước TOTP kế tiếp (do chống dùng lại); đã giảm bằng cách dùng bước hiện tại hoặc bước kế (trong cửa sổ).
- **Docs bị ảnh hưởng:** `api-contract.md` 0.22 (§2, §5, §5.2, §5.9, §6.5, §12.0, §14.4, §14.10), `db-schema.md` 0.12, `architecture.md` §8, `deployment.md` (biến môi trường), `testing.md`, `wave2-plan.md`, `README.md`, `backend/.env.example`, `.env.production.example`, `docker-compose*.yml`, `.gitleaks.toml`.

## D-064 SEO kỹ thuật: trang chủ ISR, ảnh OG, sitemap lastmod, canonical/noindex, JSON-LD

- **Ngày:** 2026-11-22 · **Người chốt:** Tech Lead (Đợt 2, mục 4; R-10, R-11)
- **Trạng thái:** Áp dụng. Bổ sung D-018 (slug cũ 308), D-040 (CSP storefront), D-044, D-059 (404/308 hiện đúng).
- **Quyết định:**
  1. **Trang chủ ISR:** bỏ `connection()`, `export const revalidate = 60`. Cả 5 nguồn dữ liệu dùng `Promise.allSettled` (và `getPublicSettings` tự lùi về mặc định) nên backend tắt lúc build chỉ làm các mục hiện `ErrorState`, KHÔNG làm build hỏng. Xác nhận bằng `next build` khi backend TẮT (pass, `/` là `○` Revalidate 1m) và khi BẬT (pass, `/` là `○` 1m; `curl -I /` có `x-nextjs-cache: HIT`, `Cache-Control: s-maxage=60, stale-while-revalidate=...`). **HTML trang chủ có thể cũ tới ~60 giây** (giá/tồn hiển thị trễ; đặt hàng vẫn tính lại ở server). Nếu build lúc backend tắt, bản dựng đầu có các mục lỗi tới khi hết 60 giây và có request đầu tiên làm mới nền. CSP D-040 không đổi (storefront vẫn tĩnh được vì dùng `'unsafe-inline'`, không nonce).
  2. **Ảnh OG** bằng `next/og` (`ImageResponse`, runtime nodejs): `app/opengraph-image.tsx` + `app/twitter-image.tsx` (mặc định 1200x630: tên BeanBox, khẩu hiệu tiếng Việt, nền nâu `coffee-800/900`, chữ kem, thanh rêu `moss-500`), `app/san-pham/[slug]/opengraph-image.tsx` + `twitter-image.tsx` (tên, "Từ <giá hiệu lực thấp nhất VND>", thương hiệu · danh mục, nhãn BeanBox). Ảnh sản phẩm chỉ được vẽ khi tải được từ backend nội bộ (`API_INTERNAL_URL` + đường dẫn `/uploads/...`, tối đa 2 MB, timeout 3 giây) VÀ magic bytes là PNG/JPEG/WebP; SVG (ảnh seed), 404, URL ngoài `/uploads`, đường dẫn có `..` đều bỏ ảnh (chống SSRF). Dựng ảnh được đọc hết trong try/catch: ảnh hỏng thì lùi về bản không ảnh, rồi ảnh mặc định; lỗi API hoặc slug lạ -> ảnh mặc định, không 500 (trả 200 `image/png`, `Cache-Control: s-maxage=3600, stale-while-revalidate`). Danh mục dùng ảnh mặc định: metadata con thay hẳn `openGraph` của cha nên `generateMetadata` của danh mục nêu lại `images: ["/opengraph-image"]` (đường dẫn không băm cũng trả 200). Trang sản phẩm bỏ `openGraph.images` thủ công (ảnh seed là SVG, nhiều nền tảng không hiển thị) để ảnh file-convention được dùng; `twitter.card` luôn `summary_large_image`. Alt của ảnh là hằng ("Sản phẩm tại BeanBox") vì `alt` của file-convention không động theo sản phẩm; chấp nhận.
  3. **Font tiếng Việt:** Be Vietnam Pro (SIL OFL 1.1) Regular 400 + Bold 700 dạng `.ttf` trong `frontend/src/assets/fonts/` (133 KB + 140 KB, không subset) kèm `OFL.txt` và `README.txt` ghi nguồn (`google/fonts`, `ofl/bevietnampro`). Satori không đọc woff2 và `next/font/google` không để lại file dùng được lúc chạy nên phải nhúng riêng. Turbopack gộp file vào `.next/server/assets` và standalone (đã kiểm có trong `.next/standalone`). Không ảnh hưởng bundle trình duyệt.
  4. **Sitemap `lastmod`:** `GET /products` (và mọi endpoint dùng `ProductListItem`) thêm `updatedAt` ISO (= `Product.updatedAt`); contract 0.23, cộng thêm, không migration. Sản phẩm dùng `updatedAt`; danh mục dùng `updatedAt` mới nhất của sản phẩm trong danh mục (cha gồm cả con), tính từ cùng danh sách sản phẩm đã tải nên không thêm lời gọi API; trang tĩnh không có `lastmod` (không có nguồn thật). **Bỏ `changeFrequency`/`priority`**: Google bỏ qua cả hai và giá trị cứng trước đây ("weekly", 0.5-1) không phản ánh dữ liệu. Hạn chế: `Product.updatedAt` chỉ đổi khi sửa bản ghi sản phẩm, không đổi khi chỉ đổi giá/tồn của biến thể hay thêm đánh giá. Sitemap vẫn dùng `connection()` (dựng lúc có request, build không cần backend).
  5. **Canonical/robots trang danh sách** (`features/catalog/listingSeo.ts`): trang 1 canonical = `/danh-muc/slug`; trang N>1 canonical tự trỏ `?page=N` và được index; có BẤT KỲ tham số lọc/sắp xếp hợp lệ (brand, origin, roast, process, brew, minPrice, maxPrice, inStock, sort, q, pageSize khác mặc định) -> `robots: { index: false, follow: true }` + canonical về URL không lọc cùng số trang. Tham số lạ/giá trị sai (`utm_*`, `roast=SAI`) bị `parseFilters` bỏ nên không làm mất index. `rel=prev/next` của `Pagination` giữ nguyên. Trang chủ `alternates.canonical: "/"`. Lưu ý (chưa đổi): `robots.txt` không disallow `/danh-muc?...` nên crawler vẫn thấy được `noindex`; các đường dẫn riêng tư vẫn bị disallow như trước (một số cũng noindex: chồng lớp, vô hại).
  6. **JSON-LD:** Organization thêm `logo` (`<SITE_URL>/opengraph-image`, ảnh OG mặc định, chưa có file logo riêng) và `url`; Product có `url`, `image` tuyệt đối (bỏ khóa khi không có ảnh), `brand`, `sku`, `offers` AggregateOffer (`lowPrice`, `highPrice`, `offerCount`, `availability`, `priceCurrency: VND`, thêm `itemCondition: NewCondition`), `aggregateRating` chỉ khi `ratingCount > 0`; BreadcrumbList giữ; danh mục thêm `ItemList` (`position` liên tục theo trang, `url` tuyệt đối, `name`) cho các sản phẩm trên trang. **KHÔNG** thêm `shippingDetails`/`hasMerchantReturnPolicy`: phí/thời gian vận chuyển và đổi trả là dữ liệu demo (D-062), khai báo sai trong dữ liệu có cấu trúc rủi ro hơn lợi; thêm khi có chính sách thật. `<` vẫn được escape thành `\u003c`.
  7. **Không đổi:** 404 cho slug không tồn tại và 308 cho slug cũ (đo lại bằng production build + `curl -sI`: sản phẩm/danh mục lạ 404, slug cũ 308 `location` đúng, slug đúng 200); không thêm `loading.tsx` ở route slug (D-059); CSP và security header không đổi (meta OG không chịu CSP, route ảnh cùng origin).
- **Hệ quả/rủi ro:** HTML trang chủ cũ tối đa ~60 giây; ảnh OG sản phẩm có thể cũ tới 1 giờ ở CDN/cache; dữ liệu OG lấy qua `getProduct` (cache 60 giây); thêm ~273 KB font vào repo; `updatedAt` công khai lộ thời điểm sửa sản phẩm (không nhạy cảm).
- **Docs bị ảnh hưởng:** `api-contract.md` 0.23 (§4), `testing.md`, `roadmap-next.md` (R-10, R-11), `wave2-plan.md`, `README.md`.

## D-065 Quyền dữ liệu cá nhân: khách tự xóa (ẩn danh hóa) tài khoản và xuất dữ liệu

- **Ngày:** 2026-11-22 · **Người chốt:** Tech Lead (Đợt 2, mục 5; phần kỹ thuật của R-03)
- **Trạng thái:** Áp dụng. Phần pháp lý (đồng ý, chính sách bảo mật, thời hạn lưu theo luật) vẫn NGOÀI PHẠM VI. Bổ sung D-045 (phiên), D-063 (2FA).
- **Quyết định:**
  1. **Ai được xóa:** chỉ CUSTOMER tự xóa (`DELETE /me`); STAFF/ADMIN 403 (tài khoản nội bộ do Admin quản lý, tránh mất quyền quản trị). Cần mật khẩu + gõ đúng `XOA TAI KHOAN` (so sánh chính xác). Sai mật khẩu đi qua cùng bộ đếm/khóa tạm như đổi mật khẩu (`recordFailedLogin`) và limiter nhóm auth.
  2. **Chặn khi còn đơn đang xử lý** (`PENDING_PAYMENT`, `PENDING`, `CONFIRMED`, `PROCESSING`, `SHIPPING`, `FAILED_DELIVERY`, `RETURN_REQUESTED`): 409 `ACTIVE_ORDERS_EXIST` kèm tối đa 10 mã đơn và `total`. Kiểm trong cùng transaction với khóa dòng `User FOR UPDATE`.
  3. **Ẩn danh hóa, không xóa cứng** (vì `Review.user` Restrict và đơn cần giữ để đối soát/analytics): User giữ `id`, `role`, `createdAt`; `email` -> `deleted-<id>@deleted.invalid`, tên -> "Người dùng đã xóa", SĐT/ngày sinh/avatar null, `passwordHash` = hash chuỗi ngẫu nhiên, `status = DISABLED` + `deletedAt`, cột 2FA null. Xóa Address, Wishlist, Cart(+items), RefreshToken, token đặt lại mật khẩu/xác thực email, mã dự phòng và thử thách 2FA. Đơn: giữ `userId`, số tiền, items, trạng thái, lịch sử, tỉnh/phường; `contactEmail` -> email ẩn danh, `contactPhone` -> `""`, `note` null, `shippingAddress` {tên "Người dùng đã xóa", phone "", line1 "[đã xóa]"}; `CouponRedemption.email` ẩn danh. Tin liên hệ cùng `userId` hoặc cùng email cũ: ẩn danh tên/email/SĐT, giữ nội dung. Review và AuditLog giữ nguyên (tác giả hiển thị "Người dùng đã xóa").
  4. **`contactPhone = ""`** thay vì null/giá trị giả: cột `String` NOT NULL, không có CHECK/regex ở DB, và validate số điện thoại chỉ chạy ở lớp đầu vào nên chuỗi rỗng hợp lệ với ràng buộc hiện có; không tạo số trông như thật.
  5. **`Payment.rawPayload` giữ nguyên:** đã đọc mọi chỗ ghi (VNPay: mã phản hồi/tham số cổng đã bỏ chữ ký; Stripe: `id`, `payment_status`, `amount_total`, `currency`, `payment_intent`; MoMo/cổng giả tương tự; xác nhận tay: `confirmedBy`, `confirmedAt`): không chứa email/tên/SĐT/địa chỉ.
  6. **Đăng nhập lại bị chặn nhiều lớp:** email cũ không còn tồn tại, login coi `deletedAt` như không có user, `status = DISABLED`, mật khẩu ngẫu nhiên, RefreshToken đã xóa; middleware auth trả 401 `UNAUTHORIZED` (cùng thông báo phiên hết hạn, không lộ khác biệt) nên access token cũ mất hiệu lực ngay (cơ chế D-045). Email cũ đăng ký lại được thành tài khoản mới hoàn toàn.
  7. **Xuất dữ liệu `GET /me/export`** (mọi role): file JSON `formatVersion: 1` (profile, addresses, orders kèm items/lịch sử/payments tóm tắt không `rawPayload`, reviews, wishlist, contactMessages, `exportedAt`, `truncated`), tối đa 1000 đơn; không có `passwordHash`, cột 2FA, token. `Content-Disposition` tên theo ngày Việt Nam, `Cache-Control: no-store`. Limiter riêng 5 lần/giờ khóa theo `userId` (đặt sau `requireAuth`; `createRateLimiter` nhận `keyGenerator`), fallback IP. Audit `user.export`; `user.self_delete` không chứa email cũ.
  8. **FE:** `/tai-khoan` thêm mục "Dữ liệu cá nhân" (nút tải; nút "Xóa tài khoản" chỉ CUSTOMER mở hộp thoại nêu hậu quả, ô mật khẩu + ô gõ cụm xác nhận, nút bật khi khớp, lỗi `ACTIVE_ORDERS_EXIST` liệt kê mã đơn có liên kết). Thành công: dọn phiên cục bộ (`endSession`, không gọi lại `/auth/logout`) và về `/?tai-khoan=da-xoa` hiện thông báo đóng được. Admin danh sách/chi tiết người dùng hiện nhãn "Đã xóa" (thay "Đã khóa"), ẩn các nút khóa/đổi vai trò; thao tác ghi của Admin trên tài khoản đã xóa -> 409 `ACCOUNT_DELETED`.
- **Hệ quả/rủi ro:** doanh thu/số khách/cơ cấu tỉnh trong analytics KHÔNG đổi (kiểm bằng test so trước/sau), top khách hiện "Người dùng đã xóa"; đơn guest cùng SĐT cũ không bị chạm (không có liên kết tài khoản); bản sao lưu DB cũ vẫn chứa dữ liệu trước khi xóa (ngoài phạm vi); `AuditLog.ip` giữ nguyên (chưa có chính sách thời hạn, thuộc phần pháp lý của R-03); GET /me/export dùng bộ nhớ khi có nhiều đơn nên giới hạn 1000.
- **Docs bị ảnh hưởng:** `api-contract.md` 0.24 (§2, §6.6, §14.4, §14.10), `db-schema.md` 0.13, `testing.md`, `roadmap-next.md` (R-03), `wave2-plan.md`, `README.md`.


## D-066 Demo chạy bằng một lệnh (docker-compose.demo.yml)

- **Ngày:** 2026-11-23 · **Người chốt:** Tech Lead
- **Trạng thái:** Áp dụng.
- **Bối cảnh:** Người xem portfolio cần thấy site có dữ liệu mà không cài Node/Postgres, không đụng môi trường dev của tác giả.
- **Quyết định:**
  1. **Một lệnh:** `docker compose -f docker-compose.demo.yml up --build` (dừng và xóa: `down -v`). File có `name: beanbox-demo` nên container, network, volume (`beanbox-demo_pgdata`) tách hẳn dev/prod. Cổng host: web `127.0.0.1:3300`, Mailpit UI `127.0.0.1:8026`; DB và backend không publish cổng.
  2. **Dịch vụ:** `db` (postgres:17, `shm_size: 256mb`), `mailpit`, `init` (chạy một lần, `restart: "no"`), `backend` (target `runtime`, `depends_on: init: service_completed_successfully`), `frontend` (build production, `API_INTERNAL_URL=http://backend:4000`, `NEXT_PUBLIC_SITE_URL=http://localhost:3300`). Frontend build được khi backend chưa chạy nhờ ISR chịu lỗi (D-064).
  3. **`init`:** stage mới `demo-tools` trong `backend/Dockerfile` (từ `tools`, thêm `COPY scripts ./scripts`), chạy `scripts/demo-init.sh`: từ chối nếu `NODE_ENV=production`; `prisma migrate deploy`; seed (upsert, chạy lại được); generator `--orders 1500 --days 90 --seed 42 --skip-if-exists`. Cờ `--skip-if-exists` mới: nếu đã có đơn `demo-42-%` thì thoát 0, nên `up` lần sau không sinh thêm (đã kiểm: số đơn trước và sau `down`/`up` bằng nhau). Generator chạy với `env -u DATABASE_URL` và `DEMO_DATABASE_URL` trỏ cùng DB, vì rào `demoDbGuard` từ chối khi hai biến trùng.
  4. **Rào generator:** chỉ chặn `localhost`/`127.0.0.1`/`::1`/`0.0.0.0` cổng 5432 (DB dev trên máy host); `db:5432` trong mạng compose vốn đã được chấp nhận, nay có test khẳng định. Không đổi logic rào.
  5. **`scripts/` và image production:** bỏ dòng `scripts` khỏi `backend/.dockerignore` để stage `demo-tools` COPY được. Stage `runtime` chỉ COPY có chọn lọc nên KHÔNG chứa `scripts/` (đã kiểm bằng `ls /app` trên image build riêng `--target runtime`). Stage `runtime` không đổi.
  6. **Backend demo chạy `NODE_ENV=development`, không phải production:** `PAYMENT_MOCKS_ENABLED=true` và `COOKIE_SECURE=false` (http localhost) bị `parseEnv` từ chối ở production, nên demo bắt buộc không phải production. Backend với `NODE_ENV=production` + cấu hình demo thoát ngay với lỗi env (đã kiểm); `init` thoát 1 với thông báo rõ.
  7. **Logger:** `pino-pretty` là devDependency, image runtime không có nên `NODE_ENV=development` làm backend sập (`unable to determine transport target`). `src/lib/logger.ts` nay chỉ bật pretty khi `pino-pretty` resolve được, nếu không in JSON. Không đổi hành vi dev/production.
  8. **Cấu hình demo** (đều trong compose, tiền tố `demo-only-`, công khai): `JWT_ACCESS_SECRET`, `INTERNAL_API_SECRET`, `PAYMENT_MOCK_SECRET`, mật khẩu DB, mật khẩu seed `Demo-only-{Admin,Staff,Customer}-2026`, `TOTP_ENCRYPTION_KEY` = base64 của `demo-only-totp-key-0123456789abc` (32 byte; production chỉ từ chối tiền tố `beanbox-dev-`). `PAYMENT_MOCKS_ENABLED`, `BANK_TRANSFER_ENABLED`, `JOBS_ENABLED` bật; không đặt `STRIPE_*`, `VNPAY_*`, `TURNSTILE_*`; `REQUIRE_ADMIN_2FA=false`; `AUTH_RATE_LIMIT_PER_MIN=20`; SMTP tới `mailpit:1025`. `.gitleaks.toml` thêm allowlist theo cặp đường dẫn + giá trị (`demo-only-...`, khóa TOTP demo).
  9. **CI:** job `ops-lint` chạy `docker compose -f docker-compose.demo.yml config -q`.
- **Hệ quả/rủi ro:** Stripe vẫn hiện ở checkout nhưng bị khóa với nhãn "Chưa khả dụng" (hành vi UI sẵn có, D-060), không chọn được. Backend khởi động lại vẫn chạy `migrate deploy` (idempotent; init đã xong nên không đụng nhau). Seed upsert lại sản phẩm mỗi lần `up` nên dữ liệu sản phẩm seed về giá trị seed; đơn demo của người thử giữ nguyên. Mật khẩu công khai: KHÔNG dùng stack này để phục vụ người dùng thật. Mailpit dùng tag `latest` như compose dev.
- **Docs bị ảnh hưởng:** `testing.md`, `deployment.md`, `wave3-plan.md`, `README.md`, `.gitleaks.toml`, `.github/workflows/ci.yml`.

## D-067 CI supply-chain: ghim SHA Actions và Trivy chỉ báo cáo

- **Ngày:** 2026-11-23 · **Người chốt:** Tech Lead (Đợt 3, mục 3B)
- **Trạng thái:** Áp dụng. Hoàn tất phần "chưa ghim SHA, Trivy chưa làm" của D-055 (mục 5) và D-033.
- **Bối cảnh:** `uses: actions/...@v7` là tag di động: tác giả action (hoặc kẻ chiếm tài khoản của họ) đổi nội dung tag là mã mới chạy trong CI của repo. Image Docker cũng có thể chứa thư viện đã biết lỗ hổng mà `npm audit` (chỉ nhìn lockfile) không thấy.
- **Quyết định:**
  1. **Ghim MỌI `uses:` vào full commit SHA kèm comment phiên bản**, đúng tag đang dùng (không nâng major): `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1`, `actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0`, `actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2`; action mới `actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 # v6.1.0` (cache DB Trivy). SHA lấy bằng `git ls-remote https://github.com/<owner>/<repo> refs/tags/<tag>` (ba tag `v7` đều là tag nhẹ nên SHA đã là commit; phiên bản chính xác lấy từ tag `vX.Y.Z` cùng SHA). Dependabot `github-actions` (đã có từ D-055, hằng tuần) cập nhật được cả SHA lẫn comment nên không đổi cấu hình, chỉ thêm ghi chú.
  2. **Trivy chỉ báo cáo** trong job `docker`, sau khi build image (đã nằm trong docker daemon của runner): image `aquasec/trivy:0.76.2@sha256:8f6bb947dbc528902e11f2f5be52f7b519f6a39d5d148f41166f2040499768fb` (ghim phiên bản + digest, mount `docker.sock`), `image --severity HIGH,CRITICAL --ignore-unfixed --exit-code 0 --no-progress --scanners vuln --format json`, một đoạn `node` dựng bảng Markdown (gói, bản đang dùng, bản vá, CVE, mức; tối đa 40 dòng mỗi image) ghi vào `$GITHUB_STEP_SUMMARY`. Bước có `continue-on-error: true` và `timeout-minutes: 8` nên lỗi mạng/DB Trivy không làm đỏ CI. DB Trivy cache bằng `actions/cache` (khóa theo `run_id`, `restore-keys` lấy bản gần nhất) để không tải lại mỗi lần. Chỉ quét `beanbox-backend:ci` và `beanbox-frontend:ci` (image Caddy/backup dựa trên image gốc bên thứ ba, nâng bằng Dependabot docker).
  3. **Đo cục bộ** (build tạm backend `--target runtime` và frontend, Trivy 0.76.2, ngày 2026-11-23): backend HIGH 11 / CRITICAL 0; frontend HIGH 10 / CRITICAL 0; toàn bộ là gói npm trong `package.json` của image (`brace-expansion`, `ip-address`, `pacote`, `picomatch`, `sigstore`; backend thêm `effect`), đều có bản vá. Chỉ ghi nhận, chưa xử lý.
  4. **actionlint** (`rhysd/actionlint` qua Docker) = 0 lỗi sau thay đổi.
- **Hệ quả/rủi ro:** Tag di động không còn tự cập nhật: phụ thuộc PR Dependabot (có thể bị bỏ quên khi không ai xem repo). Tham chiếu image Trivy trong workflow KHÔNG được Dependabot cập nhật (nó chỉ quét Dockerfile), nâng tay. Trivy báo cáo không chặn nên cần xem Job Summary thủ công, giống `npm audit`. Chưa chạy trên runner GitHub thật (chưa push): lệnh Trivy đã thử cục bộ, đoạn `node` dựng bảng đã chạy thử với JSON thật, phần cache/`$GITHUB_STEP_SUMMARY` chỉ kiểm bằng actionlint.
- **Docs bị ảnh hưởng:** `testing.md`, `roadmap-next.md` (R-07), `.github/workflows/ci.yml`, `.github/dependabot.yml`.

## D-068 Mã vận đơn duy nhất ở DB

- **Ngày:** 2026-11-23 · **Người chốt:** Tech Lead (Đợt 3, mục 3B)
- **Trạng thái:** Áp dụng. Thay phần "không có ràng buộc unique, kiểm trùng ở ứng dụng" của D-062 (mục 3 và Hệ quả).
- **Bối cảnh:** D-062 kiểm trùng mã vận đơn bằng truy vấn trong transaction giữ khóa MỘT đơn; hai đơn khác nhau chuyển SHIPPING cùng lúc vẫn có thể ghi cùng một mã (kể cả mã staff nhập tay, vốn không được kiểm trùng).
- **Quyết định:**
  1. **Migration `d068_tracking_number_unique`:** (a) `UPDATE "Order" SET "trackingNumber" = NULL WHERE btrim("trackingNumber") = ''`; (b) khối `DO` ... `RAISE EXCEPTION` nếu dữ liệu cũ có mã trùng, thông báo nêu vài mã trùng, câu SQL tìm mọi bản trùng và việc cần làm (sửa tay rồi chạy lại `prisma migrate deploy`), KHÔNG tự xóa/sửa dữ liệu; (c) `CREATE UNIQUE INDEX "Order_trackingNumber_key"`. Postgres coi các NULL là khác nhau nên nhiều đơn chưa có mã vẫn hợp lệ. Schema Prisma `trackingNumber String? @unique` (tên chỉ mục khớp quy ước Prisma nên `migrate diff` = không khác biệt, khác migration `constraints_and_partial_indexes` cũ vốn là CHECK/index một phần mà Prisma không biểu diễn được).
  2. **Ứng dụng:** lỗi P2002 (đọc bằng `uniqueTarget` có sẵn của `orders.service`) khi staff nhập mã trùng -> 409 `TRACKING_NUMBER_TAKEN` (thông báo tiếng Việt, `details.field = "trackingNumber"`), đơn giữ nguyên trạng thái. Mã giả lập tự sinh: bỏ vòng truy vấn kiểm trùng; chạy lại cả transaction (tối đa 8 lần, như trước) khi gặp P2002, hết lượt -> 500 `INTERNAL_ERROR`. Phải chạy lại cả transaction vì Postgres hủy transaction sau lỗi unique (không thử lại được bên trong). Hàm `generateUniqueTrackingNumber` bị xóa. Giao lại bằng chính mã của đơn đó không bị coi là trùng (cùng dòng).
  3. **Chuẩn hóa input:** `trackingNumber` được trim; chuỗi rỗng hoặc `null` = không nhập (server dùng mã đã có hoặc sinh mã giả lập). **Đổi hành vi so với 0.24:** `""` trước đây trả 400 "không được để trống".
  4. **Test:** trùng -> 409 và đơn không đổi; rỗng/khoảng trắng/null -> sinh mã giả; thử lại khi sinh trùng (tiêm bộ số ngẫu nhiên); hết lượt -> 500 và đơn không đổi; giao lại cùng mã; migration trên DB test (trong transaction rồi rollback): chuẩn hóa rỗng -> NULL, dữ liệu trùng -> thông báo lỗi có hướng dẫn và không xóa dữ liệu, không trùng thì tạo được chỉ mục.
- **Hệ quả/rủi ro:** Mã staff nhập như `GHN-123` phải thật sự duy nhất: hai đơn khác nhau dùng chung mã (ví dụ gộp kiện) sẽ bị chặn; chấp nhận vì mục đích của mã là tra cứu một đơn. Triển khai lên DB có dữ liệu trùng sẽ dừng ở migration cho tới khi sửa tay (chủ ý). Khi va chạm mã sinh tự động, transaction chạy lại nên truy vấn khóa đơn được gửi lại (hiếm, chi phí nhỏ).
- **Docs bị ảnh hưởng:** `api-contract.md` 0.25 (§2, §12.1), `db-schema.md` 0.14, `testing.md`, `decisions.md` (D-062).

## D-069 robots.txt không chặn trang noindex

- **Ngày:** 2026-11-23 · **Người chốt:** Tech Lead (Đợt 3, mục 3B)
- **Trạng thái:** Áp dụng. Bổ sung D-064 (noindex/canonical) và D-047 (so sánh sản phẩm là noindex).
- **Bối cảnh:** `robots.txt` đang `Disallow` cả các trang đã có `<meta name="robots" content="noindex">`. Crawler không được tải trang bị disallow nên không thấy meta noindex; URL vẫn có thể được lập chỉ mục (chỉ URL, không nội dung) nếu nơi khác liên kết tới. noindex chỉ có tác dụng khi crawler đọc được trang.
- **Quyết định:**
  1. `lib/seo.ts` tách hai danh sách: `ROBOTS_DISALLOW_PATHS = ["/admin", "/api/"]` (không có giá trị cho crawler hoặc là API) và `NOINDEX_PATHS` (giỏ, so sánh, thanh toán, cổng thanh toán giả, đặt hàng thành công, tra cứu đơn, tìm kiếm, tài khoản, đăng nhập/đăng ký/quên và đặt lại mật khẩu, xác thực email). `PRIVATE_PATHS` còn là hợp của hai danh sách, chỉ dùng cho kiểm sitemap (không được xuất hiện trong sitemap). `robots.txt` chỉ dùng `ROBOTS_DISALLOW_PATHS`.
  2. Mọi trang trong `NOINDEX_PATHS` đã có `robots: { index: false }` (tìm kiếm: `noindex, follow`); đã rà lại, `noindex.test.ts` thêm kiểm "mỗi đường dẫn trong `NOINDEX_PATHS` có module được kiểm". `/tim-kiem` được thêm vào danh sách (trước đó chưa nằm trong `PRIVATE_PATHS` dù đã noindex).
  3. `/admin` vẫn nằm trong disallow và layout vẫn có noindex: khu quản trị yêu cầu đăng nhập, không có liên kết công khai; chặn crawl là đúng ý và không cần đọc noindex.
  4. Test `robots.test.ts`: chỉ chặn `/admin` và `/api/`; không đường dẫn noindex nào bị chặn bởi tiền tố disallow; không chặn trang công khai; có sitemap.
- **Hệ quả/rủi ro:** Crawler sẽ tải các trang noindex (giỏ, đăng nhập...) nên tốn chút băng thông; chấp nhận. Chưa kiểm bằng Google Search Console (chưa có domain công khai).
- **Docs bị ảnh hưởng:** `testing.md`, `roadmap-next.md` (R-11).

## D-070 Bắt buộc 2FA cho Admin bằng cờ REQUIRE_ADMIN_2FA

- **Ngày:** 2026-11-23 · **Người chốt:** Chủ dự án (cờ, mặc định tắt) và Tech Lead (thiết kế)
- **Trạng thái:** Áp dụng. Hoàn tất phần "bắt buộc thiết lập, chưa làm" của D-063 (mục 3).
- **Bối cảnh:** 2FA của D-063 là tùy chọn để mọi luồng và E2E hiện có không đổi. Khi chạy thật nên ép Admin phải bật; chủ dự án chọn làm bằng cờ cấu hình, mặc định tắt.
- **Quyết định:**
  1. **Env `REQUIRE_ADMIN_2FA`** (`true`/`false`, mặc định `false` ở MỌI môi trường kể cả production; giá trị lạ bị `parseEnv` từ chối). Khuyến nghị `true` khi chạy thật (ghi ở `.env.example`, `.env.production.example`, `deployment.md`, `architecture.md` §8); truyền qua `docker-compose.yml` và `docker-compose.prod.yml`.
  2. **Chặn ở router admin:** middleware `requireAdminTwoFactor` chạy sau `requireAuth` + `requireStaff` trong `createAdminRouter`: cờ bật và `role = ADMIN` và chưa bật 2FA -> 403 **`ADMIN_TWO_FACTOR_REQUIRED`** ("Cần bật xác thực 2 lớp cho tài khoản Admin trước khi dùng khu quản trị"), `Cache-Control: no-store` như mọi route admin. `authenticate()` đọc thêm `twoFactorEnabledAt` trong CÙNG truy vấn user vốn đã có mỗi request (không thêm truy vấn), đặt `req.auth.twoFactorEnabled`. Cờ và trạng thái được đọc mỗi request nên có hiệu lực ngay (bật 2FA xong gọi lại được ngay, không cần đăng nhập lại).
  3. **Mã lỗi:** `TWO_FACTOR_SETUP_REQUIRED` của D-063 là 409 "chưa gọi setup/secret chờ hết hạn" (ý nghĩa khác) nên KHÔNG dùng lại; mã mới `ADMIN_TWO_FACTOR_REQUIRED` (403).
  4. **Không bị chặn:** `/me`, `/me/2fa/*`, `/auth/*` (Admin cần chúng để bật 2FA); STAFF; CUSTOMER (vẫn 403 `FORBIDDEN` do `requireStaff`); đăng nhập không đổi.
  5. **Cờ cho FE:** `User` thêm `twoFactorRequired: boolean` (= cờ bật và ADMIN và chưa bật 2FA) ở mọi response cấp phiên và `GET/PATCH /me`, tính trong `toUserDto`. Dùng trường trên `User` thay vì endpoint settings mới để không thêm route.
  6. **FE:** `AdminGuard` khi `user.twoFactorRequired` hiện màn hình "Cần bật xác thực 2 lớp" (`role="alert"`) với nút tới `/tai-khoan#account-2fa`, KHÔNG chuyển hướng tự động (không vòng lặp) và không render menu/nội dung admin. Sau khi bật 2FA, `TwoFactorSection` gọi `reloadUser` nên cờ về `false` và Admin vào được.
  7. **Test:** `adminTwoFactorRequired.integration.test.ts` (cờ tắt: hành vi cũ + `twoFactorRequired=false`; cờ bật: ADMIN chưa bật 403 trên 5 route admin, ADMIN đã bật 200, STAFF 200, 401 khi không token, `/me` và `/me/2fa/setup` vẫn 200, đăng nhập vẫn 200, tắt lại cờ vào được ngay), `envRequireAdmin2fa.test.ts`, Vitest `AdminGuard`. E2E giữ cờ tắt.
  8. **Bổ sung (kiểm tổng Đợt 3):** cờ có thể bật khi phiên đang mở (`user.twoFactorRequired` trong bộ nhớ còn `false`). `ApiClient` phát sự kiện `bb:admin:2fa-required` khi nhận 403 `ADMIN_TWO_FACTOR_REQUIRED`; `AdminGuard` nghe sự kiện và hiện cùng màn hình hướng dẫn nếu `user.twoFactorEnabled` là `false` (không chuyển hướng, không vòng lặp; rời khỏi `/admin` thì trạng thái tự xóa). `adminErrorMessage` cũng có câu riêng cho mã này.
- **Hệ quả/rủi ro:** Bật cờ khi Admin duy nhất chưa bật 2FA thì tự khóa khỏi khu quản trị: quy trình ghi ở `deployment.md` (bật 2FA trước, đặt cờ sau; hoặc đặt cờ về `false` và khởi động lại). Cờ chỉ là cấu hình, không ghi audit. Admin đặt lại 2FA của Admin khác làm người đó bị chặn lại ngay (đúng ý). FE dựa vào `user` trong bộ nhớ: nếu cờ server đổi khi phiên đang mở, người dùng thấy lỗi 403 chung ở trang admin cho tới khi tải lại (chưa có xử lý riêng cho mã này trong từng trang admin).
- **Docs bị ảnh hưởng:** `api-contract.md` 0.25 (§2, §5, §12.0), `architecture.md` §8, `deployment.md`, `testing.md`, `roadmap-next.md` (R-22), `.env.example`, `.env.production.example`, `docker-compose*.yml`.

## D-071 Ghi chú nội bộ trên đơn hàng

- **Ngày:** 2026-11-23 · **Người chốt:** Tech Lead (Đợt 4, nhóm 1, R-21)
- **Trạng thái:** Áp dụng.
- **Bối cảnh:** `Order.note` là ghi chú CỦA KHÁCH (hiện ra phiếu in và email). Nhân viên chưa có chỗ ghi việc đã làm (gọi khách, đổi địa chỉ...) mà khách không được thấy.
- **Quyết định:**
  1. **Bảng `OrderNote`** (migration `d071_order_note`): `id`, `orderId` (FK `ON DELETE CASCADE`), `authorId` (FK `ON DELETE SET NULL`, tác giả bị xóa thì ghi chú còn), `body`, `createdAt`; chỉ mục `[orderId, createdAt]`.
  2. **Append-only:** không có API sửa (PATCH/PUT trả 404). Staff+ thêm và xem; chỉ ADMIN xóa (`requireAdmin`), để sửa nhầm thì xóa rồi thêm lại và vẫn có dấu vết ở audit.
  3. **Kiểm đầu vào:** `body` trim, 1..2000 ký tự, chặn NUL và ký tự điều khiển (cho phép tab, xuống dòng) cùng quy ước với form liên hệ (§14.11). FE hiển thị bằng React (văn bản thuần, `whitespace-pre-line`), không render HTML.
  4. **Không lộ cho khách:** ghi chú KHÔNG nằm trong `AdminOrder` (chi tiết đơn), mà lấy qua endpoint riêng; ở danh sách chỉ có `AdminOrderListItem.noteCount` (đếm bằng một `groupBy` cho cả trang, không N+1). Không có trong mọi DTO của khách/guest và `GET /me/export` (đều dùng select/DTO tường minh); có test dò chuỗi.
  5. **Audit** `order.note.create` / `order.note.delete` (`entity = Order`, `entityId` = id đơn): `diff` chỉ gồm `noteId` và `length`, KHÔNG ghi nội dung.
- **Hệ quả/rủi ro:** ghi chú là dữ liệu tự do của nhân viên nên có thể chứa thông tin cá nhân; xóa đơn xóa luôn ghi chú (cascade). Tài khoản khách tự xóa (D-065) không đụng tới ghi chú của đơn (đơn vẫn còn, đã ẩn danh hóa).
- **Docs bị ảnh hưởng:** `api-contract.md` 0.26 (§12.1b), `db-schema.md`, `testing.md`.

## D-072 In phiếu giao hàng loạt

- **Ngày:** 2026-11-23 · **Người chốt:** Tech Lead (Đợt 4, nhóm 1, R-21)
- **Trạng thái:** Áp dụng.
- **Bối cảnh:** phiếu giao chỉ in được từng đơn (`/admin/don-hang/[code]/in`); xử lý nhiều đơn mỗi ngày thì chậm.
- **Quyết định:**
  1. **Endpoint** `GET /admin/orders/print?codes=A,B,...` (Staff+, khai báo TRƯỚC `/:code`): tối đa **50** mã sau khi bỏ trùng (51 -> 400 `VALIDATION_ERROR`; rỗng -> 400). Trả `data: AdminOrder[]` theo đúng thứ tự yêu cầu và `meta.missing: string[]` (mã sai định dạng hoặc không tồn tại, đã chuẩn hóa chữ hoa). Một `findMany` kèm `include` của chi tiết đơn (không N+1), giới hạn 50 nên không cần phân trang. Không đổi trạng thái hay `updatedAt` của đơn.
  2. **FE:** danh sách đơn có cột checkbox (nhãn `Chọn đơn <mã>`, ô "Chọn tất cả đơn trên trang này" có trạng thái lưng chừng), lựa chọn giữ khi đổi trang; thanh "Đã chọn N đơn" với liên kết "In phiếu (N)" (khóa và báo lỗi khi > 50) và "Bỏ chọn". Trang `/admin/don-hang/in-hang-loat?codes=...` (đường tĩnh, không va `[code]`) dùng lại `OrderPrintSheet` tách từ `AdminOrderPrint`; mỗi phiếu `print:break-after-page` (trừ phiếu cuối); thanh điều khiển và cảnh báo `print:hidden`.
  3. **CSP admin (nonce):** chỉ thêm trang và lớp CSS, không script inline hay thư viện mới; `window.print()` giống trang in một đơn. E2E `csp.spec.ts` không đổi.
- **Hệ quả/rủi ro:** URL chứa tối đa 50 mã (khoảng 0,8 KB), dưới giới hạn URL. Mã đơn trong URL có thể lọt vào log truy cập; chúng không phải bí mật (cần đăng nhập Staff để đọc nội dung).
- **Docs bị ảnh hưởng:** `api-contract.md` 0.26 (§12.1b), `testing.md`.

## D-073 Xuất và nhập CSV sản phẩm

- **Ngày:** 2026-11-23 · **Người chốt:** Tech Lead (Đợt 4, nhóm 1, R-21)
- **Trạng thái:** Áp dụng.
- **Bối cảnh:** quản lý nhiều sản phẩm bằng form từng cái là chậm; cần sửa giá/tồn hàng loạt trong bảng tính. Rủi ro nêu ở R-21: file sai làm hỏng slug/biến thể.
- **Quyết định:**
  1. **Xuất** `GET /admin/products/export` (ADMIN, limiter xuất D-053 dùng chung, audit `product.export` chỉ ghi số dòng). Mỗi dòng một biến thể chưa xóa của sản phẩm chưa xóa mềm. 16 cột cố định: `product_slug, product_name, category_slug, brand_slug, status, is_featured, variant_sku, variant_name, price, sale_price, sale_start, sale_end, stock, low_stock_threshold, weight_gram, is_active`. KHÔNG xuất mô tả, ảnh, hồ sơ cà phê, SEO, thuộc tính, ngày rang, thứ tự (dài/phức tạp, sửa ở form). Sản phẩm xóa mềm và sản phẩm chưa có biến thể không xuất. Dùng `toCsv` (BOM, CRLF, chống injection) và `safeCsvFilename` (`beanbox-products-YYYY-MM-DD.csv`, ngày VN).
  2. **Đảo tiền tố nháy đơn khi nhập:** `neutralizeFormula` nay cũng thêm nháy đơn khi chuỗi bắt đầu bằng một hay nhiều nháy đơn rồi tới ký tự nguy hiểm (`'=a` -> `''=a`), để `unneutralizeFormula` là nghịch đảo CHÍNH XÁC: chỉ bỏ MỘT nháy đầu khi ô bắt đầu bằng nháy đơn (một hay nhiều) rồi tới một trong `= + - @ tab CR`. Ô như `'Cà phê` giữ nguyên. Nhờ vậy tên có ký tự nguy hiểm khứ hồi đúng. Thay đổi nhỏ này áp cho mọi CSV xuất; đầu ra cũ không đổi trừ ca bắt đầu bằng nháy đơn + ký tự nguy hiểm.
  3. **Nhập 2 bước** (ADMIN, limiter riêng 20 lần/phút/IP, store riêng, đặt sau `requireAdmin`). Body là chính file CSV (`Content-Type: text/csv`, `text/plain` cũng nhận; dùng `express.raw` như upload ảnh, không multipart); tối đa 1 MB (413 `PAYLOAD_TOO_LARGE`), 2000 dòng dữ liệu, UTF-8 nghiêm ngặt (BOM bỏ đi). Tên file ở query `filename`, được làm sạch về `[a-z0-9_.-]` chỉ để hiển thị/audit.
     - `POST /admin/products/import/preview`: parse RFC 4180 (CRLF/LF/CR, ngoặc kép, xuống dòng trong ô), kiểm từng dòng bằng zod (số nguyên không âm, giá 1..100.000.000, `sale_price` < `price`, ngày `YYYY-MM-DD` hoặc ISO 8601 có múi giờ, status enum, slug đúng định dạng và không thuộc `RESERVED_PRODUCT_SLUGS`, danh mục/thương hiệu phải tồn tại, SKU duy nhất trong file, các dòng cùng `product_slug` phải cùng thông tin sản phẩm, sản phẩm ACTIVE phải còn biến thể đang bán). KHÔNG ghi DB. Trả `fingerprint` (SHA-256 của byte file), `canApply`, `summary` và `entries[]` theo dòng: `create_product` (dòng đầu của sản phẩm mới, kèm biến thể của dòng đó), `create_variant`, `update_variant`, `update_product`, `unchanged`, `error` (`errors[{field,message}]` tiếng Việt, `changes[]` là cột đổi). Số dòng = số bản ghi kể cả tiêu đề (như Excel).
     - `POST /admin/products/import/commit`: cùng file + `fingerprint` ở query. Khác `fingerprint` -> 409 `FINGERPRINT_MISMATCH`; có lỗi -> 422 `IMPORT_HAS_ERRORS` (không ghi gì). Áp dụng trong MỘT transaction: khóa biến thể (`FOR UPDATE`) rồi sản phẩm (`FOR NO KEY UPDATE`) như luồng đặt đơn, TÍNH LẠI kế hoạch trên dữ liệu đã khóa (không tin kế hoạch của bước 1), ghi, `refreshProductDenorm` cho mọi sản phẩm chạm tới, audit `product.import` (đếm theo loại, tên file đã làm sạch, fingerprint). Va chạm unique do tạo song song -> 409 `SLUG_TAKEN`/`SKU_TAKEN`.
  4. **Quy tắc an toàn:** sản phẩm khớp theo `product_slug`, biến thể khớp theo `variant_sku`; KHÔNG bao giờ đổi slug hay SKU; SKU đã thuộc sản phẩm khác slug (hoặc của biến thể đã xóa mềm) là lỗi, không "chuyển" biến thể; sản phẩm đã xóa mềm là lỗi (khôi phục trước); KHÔNG xóa sản phẩm/biến thể vắng mặt trong file; không tạo redirect slug; không đụng mô tả, ảnh, hồ sơ cà phê, thuộc tính, ngày rang. Biến thể mới có `sortOrder` nối tiếp. Sản phẩm mới có mô tả rỗng (bổ sung ở form).
  5. **Tồn kho:** `stock` đổi ở biến thể có sẵn -> ghi `InventoryMovement` lý do `ADJUSTMENT` (`change` = chênh lệch, `stockAfter` = tồn mới, `note = "Nhập CSV"`, `actorId` = admin) trong cùng transaction, không ghi đè im lặng. Biến thể mới có tồn > 0 -> movement `STOCKTAKE` ghi chú "Nhập CSV" (như `createVariant`).
  6. **Khứ hồi:** xuất rồi nhập lại chính file đó cho toàn bộ `unchanged` (kể cả tên có `=`, nháy đơn, dấu phẩy, ngoặc kép, xuống dòng); có test. Ngày khuyến mãi so theo thời điểm (không theo chuỗi).
  7. **FE (`/admin/san-pham`, chỉ ADMIN):** nút "Xuất CSV" và "Nhập CSV"; hộp thoại (AdminModal rộng) chọn file (kiểm đuôi `.csv`, <= 1 MB) -> bảng xem trước, lọc theo loại hành động, lỗi theo dòng/cột, "Áp dụng" chỉ bật khi 0 lỗi -> kết quả. Nội dung CSV chỉ hiển thị dạng văn bản React (không HTML thô).
- **Hệ quả/rủi ro:** thay đổi lớn (hàng nghìn dòng) chạy trong một transaction tối đa 120 giây; giữ khóa các dòng liên quan nên đơn đặt hàng của đúng các biến thể đó phải chờ (ở quy mô 2000 dòng, chấp nhận). Excel mở/lưu lại có thể đổi định dạng `sale_start/sale_end`; nên dùng `YYYY-MM-DD` hoặc ISO. Đổi `status` sang ACTIVE hoặc `is_active` qua CSV có thể đưa sản phẩm lên cửa hàng ngay: đã có kiểm "ACTIVE cần biến thể đang bán". Nhập không hoàn tác được (không có undo); khuyến nghị xuất file làm bản sao trước khi nhập.
- **Docs bị ảnh hưởng:** `api-contract.md` 0.26 (§2 mã lỗi, §12.4b), `testing.md`, `README.md`, `overview.md`, `roadmap-next.md` (R-21).

## D-074 Tách file lớn và hộp thoại dùng chung

- **Ngày:** 2026-11-22 · **Người chốt:** Tech Lead (Đợt 4, nhóm 2, R-13 + R-16)
- **Trạng thái:** Áp dụng. Bổ sung D-044 (a11y), D-048 (admin mobile), D-059.
- **Bối cảnh:** `AdminSettings.tsx` (1049 dòng) và `CheckoutForm.tsx` (816 dòng) đã phình ra sau Đợt 2-4; 5 hộp thoại tự viết (`MiniCart`, `ConfirmDialog`, `AdminModal`, `StatusDialog`, `CancelOrderDialog`) cộng `DeleteAccountDialog` (D-065) lặp lại cùng một đoạn focus trap/Escape/trả focus với selector phần tử focus khác nhau, chỉ MiniCart khóa cuộn nền, nền không `inert`.
- **Quyết định:**
  1. **Không đổi hành vi, API, nhãn hay giao diện.** Chỉ di chuyển/đặt tên lại; test hiện có giữ nguyên kỳ vọng (không test nào bị sửa).
  2. **Hộp thoại (R-13): `<dialog>` native + `showModal()`** bọc trong `components/ui/Dialog.tsx` (xuất ở `components/ui/index.ts`). Trình duyệt lo top layer, vô hiệu hóa (inert) phần nền và focus trap, nên bỏ hẳn code focus trap tự viết ở cả 6 nơi. `Dialog` lo: `aria-labelledby` (tiêu đề h2 hoặc `labelledBy` cho ngăn kéo), `aria-describedby` (mô tả), `aria-modal="true"`; Escape (bắt `keydown` trên document, chỉ hộp trên cùng trong ngăn xếp xử lý; chặn khi `busy`) và sự kiện `cancel` của trình duyệt (luôn `preventDefault`); focus đầu = `[data-autofocus]`, nếu không có thì phần tử tương tác đầu tiên (`initialFocus="first"`, gồm cả `input/select/textarea`, khác selector sót của bản cũ) hoặc chính hộp (`initialFocus="container"`); trả focus về phần tử kích hoạt khi đóng; khóa cuộn nền bằng bộ đếm (hộp lồng nhau chỉ nhả khi đóng hết); nút đóng "×" có nhãn nếu truyền `closeLabel` (không bật ở nơi nào hiện có vì mỗi hộp đã có nút Hủy/Đóng, thêm nút sẽ đổi giao diện và trùng tên với nút sẵn có); kích thước `sm` (xác nhận) / `md` / `wide` (xem trước CSV); `variant="drawer"` cho MiniCart (phần tử `<dialog>` phủ toàn màn hình, trong suốt, ngăn kéo là con; click nền = click chính phần tử dialog).
  3. **Hộp đang gửi (`busy`):** Escape bị chặn như cũ. Chromium cho phép lần Escape thứ hai liên tiếp đóng hộp mà không phát `cancel` (close watcher); `Dialog` nghe `close`, nếu còn `busy` thì `showModal()` lại, nếu không thì gọi `onClose`. Sự kiện `close` là bất đồng bộ nên khi StrictMode (dev) mount lại hộp, sự kiện của lần đóng do cleanup đến sau lúc hộp đã mở lại: bỏ qua khi `dialog.open` đang true. Lỗi này đã gặp ở E2E lần đầu (hộp mở rồi tự đóng ngay, 4 spec đỏ); jsdom không tái hiện được vì polyfill đóng đồng bộ; đã có test hồi quy.
  4. **Chuyển hết sang `Dialog`:** `MiniCart` (drawer), `account/ConfirmDialog` (dùng ở 10 nơi), `admin/AdminModal` (dùng ở 9 nơi, kể cả nhập CSV), `StatusDialog`, `CancelOrderDialog`, `DeleteAccountDialog`. Props của các component này không đổi nên nơi gọi không phải sửa.
  5. **jsdom:** chưa có `HTMLDialogElement.showModal()/close()`. `vitest.setup.ts` polyfill tối thiểu (bật/tắt thuộc tính `open`, `close()` phát `close` đồng bộ); KHÔNG mô phỏng top layer/inert/focus trap, phần đó chỉ kiểm được bằng trình duyệt thật (E2E + kiểm tay Playwright).
  6. **CSP:** không thêm script/style inline; `<dialog>` là HTML thuần, kiểu chỉ qua class Tailwind (`backdrop:` cho lớp nền). `csp.spec.ts` (storefront và admin) vẫn đạt.
  7. **Khác biệt hành vi chấp nhận (có chủ đích của native dialog):** (a) mọi hộp khóa cuộn nền (trước chỉ MiniCart); (b) nền thật sự inert nên trình đọc màn hình không với tới nền; (c) Tab ở phần tử cuối đi ra UI trình duyệt (`activeElement` = body) rồi quay lại phần tử đầu, thay vì xoay vòng tức thì; không bao giờ rơi vào nền trang (kiểm tay: 0 lần trong 336 lượt Tab); (d) Escape chỉ đóng hộp trên cùng.
  8. **Tách file (R-16), FE:** `AdminSettings.tsx` giữ bố cục, tải dữ liệu, quyền; mỗi khối thành file trong `features/admin/components/settings/` (`ShippingSection` gồm ETA, `AreaSection`, `ContactSection`, `BankSection`, `BannersSection` + `BannerEditor`), cùng `SectionCard`, `SettingsFields` (`NumberField`, `TextField`, `domId`) và hook `useSectionSave`. `CheckoutForm.tsx` giữ bố cục, trạng thái các ô đơn giản và báo giá; tách component `ContactSection`, `AddressSection`, `ShippingMethodSection` (gồm ETA), `PaymentMethodSection`, `NoteSection`, `CheckoutAlerts` (lỗi đặt hàng, cảnh báo giỏ, mã giảm giá không hợp lệ), `CheckoutSubmitBar` (điều khoản + captcha + nút đặt) và hook `useCheckoutAddress`, `useCheckoutCaptcha`, `useCouponRemoval`, `useCheckoutSubmit` (validate, captcha, Idempotency-Key, POST, chuyển hướng cổng thanh toán, ánh xạ lỗi PRICE_CHANGED/OUT_OF_STOCK/ITEM_UNAVAILABLE/COUPON_INVALID/CART_EMPTY/VALIDATION_ERROR/CAPTCHA_FAILED, focus ô lỗi đầu tiên). `LAST_ORDER_KEY` vẫn export từ `CheckoutForm.tsx` (re-export) nên 5 nơi đang import không đổi.
  9. **Tách file (R-16), BE:** chỉ gom helper trùng, không đổi hành vi: `escapeLike` ở `admin/orders/orders.service.ts` dùng lại `lib/text.ts`; `emailSchema` (3 bản giống hệt: auth, checkout, orders), `intParam` (admin, orders) và `NO_NUL` (reviews, audit) về `lib/validation.ts` (`admin.schema.ts` và `reviews.schema.ts` vẫn re-export để import cũ chạy tiếp). KHÔNG gom: `intParam` ở `catalog.schema.ts` (khác thông báo lỗi khi tham số không phải chuỗi, gom sẽ đổi chữ lỗi), `CONTROL_CHARS` ở `contact.schema.ts`/`settings.schema.ts` (dải khác NUL, cần thêm tham số mới gom được, chưa đáng).
  10. **Không tách thêm** các file còn lại bên dưới vì tách chúng không rẻ/an toàn trong cùng lượt (service chứa transaction và test tích hợp dày; form dài ít lặp). Ghi nhận để tách khi sửa tiếp ở vùng đó.
- **Số dòng trước/sau** (đo bằng `wc -l`):

  | File | Trước | Sau |
  | --- | ---: | ---: |
  | `frontend/src/features/admin/components/AdminSettings.tsx` | 1049 | 97 (+ 9 file trong `settings/`, lớn nhất 176) |
  | `frontend/src/features/checkout/components/CheckoutForm.tsx` | 816 | 194 (+ 8 component, 4 hook; lớn nhất `useCheckoutSubmit.ts` 281) |
  | `.../cart/components/MiniCart.tsx` | 136 | 91 |
  | `.../account/components/ConfirmDialog.tsx` | 89 | 34 |
  | `.../account/components/DeleteAccountDialog.tsx` | 194 | 152 |
  | `.../orders/components/CancelOrderDialog.tsx` | 112 | 65 |
  | `.../admin/components/AdminModal.tsx` | 83 | 37 |
  | `.../admin/components/StatusDialog.tsx` | 262 | 216 |
  | `frontend/src/components/ui/Dialog.tsx` (mới) | - | 223 |

- **File nguồn còn > 500 dòng** (không tính `src/generated` và test): `frontend/src/types/admin.ts` 884 (chỉ kiểu), `backend/.../orders/orders.service.ts` 713, `frontend/.../admin/components/ProductForm.tsx` 677, `backend/.../catalog/catalog.service.ts` 668, `backend/.../cart/cart.service.ts` 633, `frontend/.../admin/components/AdminOrders.tsx` 606, `backend/.../admin/products/productsCsv.ts` 585, `backend/.../admin/orders/orders.service.ts` 567, `backend/.../auth/auth.service.ts` 539. Sát ngưỡng: `TwoFactorSection.tsx` 521, `PaymentResultView.tsx` 473.
- **Chưa làm (thuộc R-16, ngoài lượt này):** `server.ts` xử lý `unhandledRejection`/`uncaughtException` và shutdown chờ job đang chạy.
- **Hệ quả/rủi ro:** hành vi Tab/inert/focus của native `<dialog>` phụ thuộc trình duyệt (đã kiểm Edge/Chromium; chưa kiểm Safari, Firefox); polyfill jsdom không bắt được lỗi native (bài học ở mục 3); bố cục hộp đổi từ "lớp phủ + hộp" sang chính `<dialog>` (margin auto, bottom sheet trên mobile bằng `mt-auto mb-4 sm:my-auto`).
- **Docs bị ảnh hưởng:** `testing.md`, `roadmap-next.md` (R-13, R-16), `wave4-plan.md`. Không đổi `api-contract.md`, `db-schema.md`.

## D-075 Cache HTTP cho catalog, ảnh và cài đặt

- **Ngày:** 2026-11-23 · **Người chốt:** Tech Lead (Đợt 4, nhóm 3, R-09)
- **Trạng thái:** Áp dụng. Bổ sung D-045 (mặc định `no-store`), D-027 (1 instance).
- **Bối cảnh:** mỗi lần trình duyệt tải trang danh sách/chi tiết/gợi ý tìm kiếm đều chạm DB vì catalog không đặt `Cache-Control`; ảnh tải lên chỉ cache 1 giờ dù tên file là chuỗi ngẫu nhiên không bao giờ đổi nội dung; cài đặt cửa hàng đọc lại DB ở mỗi lần tính giá giỏ/báo giá.
- **Quyết định:**
  1. **Catalog công khai:** `GET/HEAD` `/products`, `/products/:slug`, `/products/compare`, `/products/:slug/bought-together`, `/categories`, `/categories/:slug`, `/brands`, `/search/suggest` trả `public, max-age=30, s-maxage=60, stale-while-revalidate=120`. Đã kiểm từng endpoint: không dùng `optionalAuth`, không có giá/wishlist/trạng thái theo người dùng, nên cùng một response cho mọi người gọi (không cần `Vary: Authorization`). `/products/:slug/reviews` (danh sách công khai) KHÔNG đổi (chưa nằm trong phạm vi R-09), `/products/:slug/reviews/me` và wishlist vẫn `no-store`.
  2. **Cơ chế:** middleware `publicCatalogCache` (`middlewares/publicCache.ts`) gắn ở TỪNG route catalog (không `router.use`, vì router này mount ở gốc API và sẽ dính cả `/cart`, `/me`...). Header đặt trước handler; `errorHandler` luôn ghi đè `Cache-Control: no-store` nên mọi 4xx/5xx (404 slug lạ, 400 query sai, 500) không bao giờ public; `notFound` đi qua `errorHandler`. `apiCacheControl` + `PUBLIC_CACHEABLE` vẫn quyết định "route nào được phép tự đặt header" (mặc định `no-store`); test hồi quy khẳng định `/cart`, `/me*`, `/wishlist`, `/admin/*`, `/checkout/*`, `POST /cart/items` vẫn `no-store`.
  3. **`/uploads`:** `express.static` với `cacheControl: false` và `setHeaders`: tên file khớp đúng `^[0-9a-f]{32}\.(jpg|png|webp)$` (định dạng thật do `uploads.service` sinh: `randomBytes(16)` hex + đuôi theo loại ảnh) -> `public, max-age=31536000, immutable`; tên khác (ảnh seed cố định `/uploads/seed/*.svg`, ảnh đặt tay) -> `public, max-age=86400`. Giữ `nosniff` (helmet), từ chối dotfile. Hex nhưng đuôi khác (svg) KHÔNG immutable vì không do server sinh.
  4. **`getShopSettings`:** cache trong tiến trình TTL 30 giây, CHỈ cho lần đọc bằng client Prisma mặc định; đọc trong transaction (`createOrder`) và `getAllSettings` (admin, `/settings/public`) không dùng cache. Admin lưu (`updateSettings`) gọi `invalidateShopSettingsCache()` ở `finally` (cả khi lỗi) nên lần đọc kế tiếp thấy giá trị mới ngay. Trả bản sao (`structuredClone`) để nơi gọi sửa kết quả không làm hỏng cache. Giả định 1 instance (D-027): nhiều instance thì mỗi tiến trình có thể cũ tới 30 giây. Khi `NODE_ENV=test` TTL mặc định 0 (các test ghi thẳng bảng `Setting`); test cache bật lại bằng `setShopSettingsCacheTtl`.
  5. **Đánh đổi:** giá/tồn/trạng thái hiển thị ở catalog có thể cũ tới ~30 giây (trình duyệt) hoặc ~60 giây + 120 giây revalidate (CDN, nếu có); giỏ, báo giá và đặt hàng luôn tính lại ở server nên tiền không bao giờ sai. Phí vận chuyển/ngưỡng miễn phí trong giỏ có thể trễ tới 30 giây sau khi admin sửa nếu không phải instance vừa lưu (chỉ khi nhiều instance).
- **Không làm:** `ETag`/304 riêng (Express đã sinh ETag yếu cho `res.json`, trình duyệt gửi `If-None-Match` được; không thêm cơ chế nào); `/settings/public` giữ `public, max-age=300` sẵn có.
- **Docs bị ảnh hưởng:** `api-contract.md` §1 (0.27), `testing.md`, `roadmap-next.md` (R-09).

## D-076 Khóa tạm theo mã đơn cho khách vãng lai

- **Ngày:** 2026-11-23 · **Người chốt:** Tech Lead (Đợt 4, nhóm 3, R-05)
- **Trạng thái:** Áp dụng. Bổ sung D-011/D-045 (limiter theo IP), D-057.
- **Bối cảnh:** mã đơn `BB-YYMMDD-XXXX` chỉ có 31^4 (~923.000) khả năng mỗi ngày; cặp mã + SĐT là đủ để tra cứu, hủy, tạo thanh toán và xem hướng dẫn chuyển khoản. Limiter theo IP không chặn được kẻ dò SĐT của một mã đơn từ nhiều IP.
- **Quyết định:**
  1. **Phạm vi (đã grep mọi chỗ so khớp `contactPhone`):** `GET /orders/track`, `POST /orders/:code/cancel` (khi không đăng nhập), `GET /orders/:code/bank-transfer`, `POST /orders/:code/bank-transfer/claim`, `POST /payments/{vnpay,momo}/create`, `POST /payments/stripe/create-session`. Chỗ khác dùng mã đơn (đường IPN/return/webhook của cổng thanh toán) xác thực bằng chữ ký, không bằng SĐT nên không nằm trong phạm vi.
  2. **Đếm lần sai theo mã đơn chuẩn hóa** (hoa, bỏ khoảng trắng, cắt 40 ký tự), dùng chung giữa các endpoint trên. "Sai" = phản hồi `404 NOT_FOUND` của thao tác đó: sai SĐT, đơn của tài khoản, và mã không tồn tại (kể cả sai định dạng) cho cùng một phản hồi nên không lộ đơn có thật. `400` (SĐT sai định dạng) không tính; phản hồi khác 404 (409 sau khi đã xác thực đúng) xóa bộ đếm. Người đã đăng nhập bỏ qua cơ chế này (xác thực bằng token, đã có kiểm quyền chủ đơn).
  3. **5 lần sai trong cửa sổ 15 phút -> khóa 15 phút:** `429 ORDER_LOOKUP_LOCKED`, `error.details.retryAfterSec`, header `Retry-After` (errorHandler đặt header cho mọi `AppError` 429 có `retryAfterSec`), thông báo tiếng Việt; trả cho cả lần có SĐT đúng. Lần sai thứ 5 vẫn trả 404 (lần kế tiếp mới 429). Sai thêm khi đang khóa không kéo dài. Đúng trước khi khóa xóa bộ đếm. FE (`TrackOrder`, hộp thoại hủy, `orderErrorMessage`) hiện "Bạn đã nhập sai thông tin đơn hàng quá nhiều lần. Vui lòng thử lại sau khoảng N phút."
  4. **Lưu trữ:** `Map` trong tiến trình (`lib/orderLookupLock.ts`, class `OrderLookupLock`, một thể hiện cho mỗi `createApp` trong `app.locals`), đồng hồ tiêm được (`AppOptions.orderLookupNow`). Giới hạn 10.000 khóa: khi đầy dọn mục hết hạn, rồi bỏ mục chưa khóa cũ nhất, cuối cùng mới bỏ mục cũ nhất. Mất khi khởi động lại; không chia sẻ giữa instance (D-027). Bọc ở tầng controller bằng `guardGuestLookup`, không đụng service.
  5. **Hạn chế chấp nhận:** kẻ biết mã đơn có thể cố ý làm chủ đơn guest bị khóa 15 phút (DoS cục bộ theo từng mã); đổi lại không dò được SĐT. Kẻ làm tràn 10.000 mã có thể đẩy mục khóa cũ ra (hiếm, cần rất nhiều request và đã bị limiter IP chặn). Chưa có cảnh báo cho chủ cửa hàng khi nhiều mã bị khóa.
- **Docs bị ảnh hưởng:** `api-contract.md` §2, §9.4 (0.27), `testing.md`, `roadmap-next.md` (R-05).

## D-077 Mua lại

- **Ngày:** 2026-11-23 · **Người chốt:** Tech Lead (Đợt 4, nhóm 3, FR-ORD-07)
- **Trạng thái:** Áp dụng. Bổ sung D-005 (giá ở server), D-015 (khóa giỏ).
- **Quyết định:**
  1. **API:** `POST /me/orders/:code/reorder` (Auth). Đơn không thuộc user hoặc không tồn tại -> 404 cùng thông báo. Mọi trạng thái đơn đều được. Trả `{ added, adjusted, skipped, cart }`.
  2. **Quy tắc theo dòng:** biến thể phải tồn tại, `isActive`, chưa xóa, sản phẩm `ACTIVE` chưa xóa, còn tồn. Số thêm = `min(số cũ, min(20, tồn) - đã có trong giỏ)`. Thêm đủ -> `added`; một phần -> `adjusted` (`requested`/`added`); không thêm được -> `skipped` với `reason`: `DISCONTINUED` (ngừng bán/xóa), `OUT_OF_STOCK` (tồn 0), `UNAVAILABLE` (giỏ đã đạt giới hạn mua của biến thể). Giá lấy hiện hành (`unitPriceAtAdd` = giá hiệu lực lúc mua lại).
  3. **Giao dịch:** một transaction, mở và khóa giỏ bằng cùng `openCartForWrite` như `addItem` nên gọi đồng thời được tuần tự hóa; mỗi dòng đọc lại biến thể và dòng giỏ trong transaction. Gọi lặp cộng dồn nhưng không vượt giới hạn. Mã giảm giá của giỏ giữ nguyên.
  4. **Không thêm limiter riêng:** chỉ limiter chung (giỏ hiện cũng không có limiter riêng ngoài `apply-coupon`).
  5. **FE:** nút "Mua lại" (`ReorderButton`) ở chi tiết đơn tài khoản (`AccountOrderDetail`), mọi trạng thái; busy (disabled + `aria-busy`, chặn bấm lặp), lỗi bằng `role="alert"`, kết quả `role="status"` gồm câu tóm tắt, từng dòng điều chỉnh/bỏ qua kèm lý do và link `/gio-hang`; giỏ cập nhật bằng `replaceCart` (không gọi lại API).
- **Không làm:** mua lại cho khách vãng lai (không có tài khoản/đơn trong tài khoản); mua lại từ trang tra cứu; tự mở mini-cart.
- **Sửa nhỏ kèm theo (mini-cart trả focus):** `AddToCartPanel` ghi nhận nút kích hoạt TRƯỚC khi nó bị disable lúc đang thêm và truyền vào `openMiniCart(opener)`; `Dialog` có prop `returnFocusTo`; `MiniCart` trả focus về nút đó nếu còn trong DOM và enabled, ngược lại về nút giỏ ở header (`data-cart-trigger`). Trước đây focus mất vì `document.activeElement` lúc mở là `body`.
- **Docs bị ảnh hưởng:** `api-contract.md` §6.7 (0.27), `testing.md`, `roadmap-next.md` (R-12), `requirements.md` (FR-ORD-07 nếu có).

## D-078 Giá vốn bình quân gia quyền di động và lợi nhuận gộp

- **Ngày:** 2026-11-23 · **Người chốt:** Tech Lead (Đợt 4, nhóm 4, R-23)
- **Trạng thái:** Áp dụng. Bổ sung D-019 (doanh thu), D-049..D-054 (analytics), D-052 (giá trị tồn theo giá niêm yết, giữ nguyên), D-058 (pool analytics), D-073 (CSV sản phẩm).
- **Bối cảnh:** chưa có trường giá vốn nên chỉ biết doanh thu, không biết lãi. R-23 yêu cầu chốt phương pháp giá vốn trước khi làm.
- **Quyết định:**
  1. **Phương pháp: bình quân gia quyền di động theo BIẾN THỂ.** `ProductVariant.avgCost Int?` (VND, `null` = chưa có). Khi Admin nhập hàng (`InventoryReason.RESTOCK`, đã có sẵn trong enum nên không đổi enum) kèm `unitCost` (Int 0..100.000.000, bắt buộc với Admin): `avgCost mới = round((max(tồn cũ, 0) x avgCost cũ + change x unitCost) / (max(tồn cũ, 0) + change))` (nửa lên, tính bằng BigInt); `avgCost cũ` null hoặc tồn cũ <= 0 -> `unitCost`. Chỉ nhập hàng có đơn giá đổi `avgCost`; đặt/hủy đơn, `DAMAGE`, `STOCKTAKE`, `ADJUSTMENT` không đổi. `InventoryMovement.unitCost` lưu đơn giá của dòng nhập. Tính trong transaction đã khóa biến thể (`FOR UPDATE`, cùng điều chỉnh tồn hiện có) nên nhập song song không mất cập nhật. Audit `inventory.adjust` thêm `avgCost`/`unitCost` vào diff.
  2. **Sửa giá vốn thủ công (Admin):** `avgCost` ở tạo/sửa biến thể (số, hoặc `null` để xóa) và cột `avg_cost` của CSV sản phẩm (D-073); mỗi lần ĐỔI giá trị ghi audit `variant.cost_set` (`{ avgCost: [cũ, mới] }`). Dùng cho dữ liệu ban đầu hoặc sửa sai.
  3. **Chụp vào dòng đơn:** `OrderItem.unitCost Int?` = `avgCost` của biến thể lúc đặt, đọc trong CÙNG transaction đặt hàng SAU khi đã khóa biến thể (nhập hàng song song phải chờ nên giá trị chụp luôn là giá trước hoặc sau nhập, không lệch). Không đổi về sau (kể cả khi hủy đơn). **Đơn cũ giữ `null`, KHÔNG backfill**: không có cơ sở để đoán giá vốn quá khứ; báo cáo có "độ phủ giá vốn".
  4. **Lợi nhuận gộp hàng hóa** (cùng tập đơn D-019, theo `paidAt`): với mỗi đơn, `S` = Σ `lineTotal`, `C` = Σ `lineTotal` dòng CÓ `unitCost`, `cogs` = Σ `unitCost x quantity` dòng đó; giảm giá cấp đơn phân bổ cho phần có giá vốn theo tỷ lệ `lineTotal`: `round(discountTotal x C / S)` (nửa lên; đủ giá vốn -> đúng `discountTotal`). `doanh thu hàng hóa thuần = Σ C - Σ phân bổ`; `grossProfit = doanh thu hàng hóa thuần - Σ cogs`; `grossMargin = grossProfit / doanh thu hàng hóa thuần`; `costCoverage = Σ C / Σ S`. Ví dụ số: đơn A (2 x 100.000 có vốn 60.000 + 1 x 50.000 chưa có vốn, giảm 25.000) và đơn B (1 x 100.000 vốn 70.000, ship 30.000): `C` = 200.000 + 100.000, phân bổ = round(25.000 x 200.000 / 250.000) = 20.000, doanh thu thuần = 280.000, `cogs` = 190.000, lãi gộp = 90.000, biên = 32,14 %, độ phủ = 300.000 / 350.000 = 85,71 %. KHÔNG tính phí ship, KHÔNG trừ phí cổng thanh toán (chưa có dữ liệu), KHÔNG tính chi phí vận hành; vì vậy đây là lợi nhuận gộp hàng hóa chứ không phải lợi nhuận ròng.
  5. **Analytics (chỉ Admin, pool riêng D-058, một truy vấn mỗi nguồn, không N+1):** overview thêm KPI `grossProfit` (`Compared`), `grossMargin`, `costCoverage` (`ComparedRate`) có so kỳ trước; top-products thêm `cogs`, `grossProfit`, `margin` (null khi thiếu giá vốn), `costCoverage` (phân bổ giảm giá theo DÒNG, có thể lệch vài đồng so với phân bổ theo đơn do làm tròn); inventory thêm `stockCostValue` (Σ tồn x giá vốn, chỉ biến thể còn hàng và có giá vốn, cạnh giá trị theo giá niêm yết giữ nguyên) và `variantsWithoutCost`; CSV `overview`, `top-products`, `inventory` thêm dòng/cột ở CUỐI (không làm lệch cột cũ).
  6. **Phân quyền:** giá vốn và lợi nhuận CHỈ ADMIN. DTO trả cho Staff KHÔNG có khóa `avgCost`/`unitCost` (omission, không phải gán null): `InventoryItem`, `InventoryMovementDto`, `AdminVariant` (trong chi tiết/tạo/sửa/khôi phục sản phẩm và tạo/sửa biến thể). Không DTO đơn hàng nào (khách, tra cứu, Staff, Admin, `GET /me/export`) có `unitCost`: chỉ analytics Admin đọc cột này. Staff gửi `avgCost` (biến thể) hoặc `unitCost` (nhập hàng) -> 403. Staff vẫn nhập hàng được nhưng không ghi đơn giá: `avgCost` giữ nguyên, chấp nhận (số lượng tăng mà giá vốn bình quân không đổi coi như nhập ở giá hiện có); muốn tính đúng thì Admin nhập hàng.
  7. **CSV sản phẩm:** cột `avg_cost` ở cuối (17 cột); cột này tùy chọn khi NHẬP (file 16 cột cũ vẫn hợp lệ, không đụng giá vốn); rỗng = `null`; khứ hồi vẫn `unchanged`.
  8. **Dữ liệu demo:** seed đặt `avgCost` tất định theo SKU (55-65 % giá niêm yết, làm tròn 100 VND, `seedAvgCost`); `generate-demo-orders.ts` điền `OrderItem.unitCost` = `avgCost` của biến thể. Demo một lệnh (docker-compose.demo.yml) vì vậy có lợi nhuận ngay.
  9. **FE (Admin):** `VariantDialog` có "Giá vốn bình quân" (sửa phải tích xác nhận); `StockAdjustDialog` lý do nhập hàng yêu cầu "Đơn giá nhập" và hiện giá vốn hiện tại + dự kiến (công thức cùng backend, chỉ để xem; số chính thức do server tính); `/admin/phan-tich` thêm 3 thẻ KPI (có ghi chú "chỉ tính dòng có giá vốn"), cột lợi nhuận/biên ở top sản phẩm, "Giá trị tồn theo giá vốn" ở khối tồn kho. Staff không nhận khóa `avgCost` nên dialog tự ẩn trường (quyết định theo dữ liệu server, không đoán vai trò ở FE).
- **Không làm:** giá vốn theo lô/nhà cung cấp/phiếu nhập (R-23 gốc), backfill đơn cũ, tính lại giá vốn khi hủy/hoàn nhập, phí cổng thanh toán và phí ship vào lãi, xuất giá vốn ở API đơn hàng.
- **Hệ quả/rủi ro:** bình quân di động khiến giá vốn "trôi" theo từng lần nhập; hàng nhập trước ngày bật tính năng chưa có giá vốn cho tới khi Admin nhập tay (CSV là cách nhanh nhất). Tồn âm không xảy ra (CHECK `stock >= 0`), nhưng công thức vẫn xử lý `max(tồn, 0)`. Đánh đổi đã chốt (Tech Lead): Staff nhập hàng (RESTOCK) không kèm đơn giá -> `avgCost` giữ nguyên, có thể làm giá bình quân kém chính xác (tồn tăng nhưng giá vốn không phản ánh lô mới); Admin bắt buộc nhập đơn giá. Giữ như vậy. Giá vốn chụp lúc đặt nên đơn đặt trước khi sửa tay giá vốn giữ giá cũ (đúng ý đồ "báo cáo không đổi ngược"). Hủy đơn không hoàn nhập giá vốn nên đơn hủy không có trong báo cáo (đã loại theo D-019).
- **Migration:** `d078_avg_cost`: 3 cột nullable (`ProductVariant.avgCost`, `InventoryMovement.unitCost`, `OrderItem.unitCost`), không enum mới, không đổi dữ liệu cũ.
- **Docs bị ảnh hưởng:** `api-contract.md` 0.28 (§12.2, §12.4, §12.4b, §16.1-16.4), `db-schema.md` 0.16, `testing.md`, `README.md`, `overview.md`, `roadmap-next.md` (R-23), `wave4-plan.md`.

## D-079 Tắt êm và lỗi tiến trình

- **Ngày:** 2026-11-23 · **Người chốt:** Tech Lead (Đợt 5, R-16)
- **Trạng thái:** Áp dụng. Bổ sung D-030 (health), D-058 (hai client Prisma), D-015 (job nền).
- **Bối cảnh:** `server.ts` chỉ có handler `SIGTERM`/`SIGINT` đóng server rồi thoát sau tối đa 10 giây; không chờ job đang chạy (job có thể đang hủy đơn giữa transaction khi DB bị đóng), không bắt `uncaughtException`/`unhandledRejection` (tiến trình chết không log có cấu trúc), và mặc định Docker `stop_grace_period` chỉ 10 giây.
- **Quyết định:**
  1. **Hàm thuần `createShutdown(deps)`** (`lib/shutdown.ts`) nhận phụ thuộc tiêm được (đóng server, đóng socket nhàn rỗi, dừng job, ngắt DB, `exit`, log, timer) để test bằng đối tượng giả; `server.ts` chỉ ghép phụ thuộc thật. Chạy MỘT lần: lần gọi sau (SIGTERM đến 2 lần, lỗi xảy ra lúc đang tắt) chỉ log và trả cùng promise.
  2. **Thứ tự:** `server.close` (ngừng nhận kết nối mới; request đang xử lý được chờ xong) -> `closeIdleConnections` (socket keep-alive 65 giây không giữ việc tắt) -> `stopBackgroundJobs()` (xóa lịch, rồi CHỜ mọi lượt job đang chạy, không bao giờ ném lỗi) -> chờ server đóng xong -> `disconnectPrisma()` (cả client chính và analytics) -> `exit(code)`. Bước lỗi chỉ log và đổi mã thoát thành 1, không chặn bước sau.
  3. **Mã thoát:** `SIGTERM`/`SIGINT` -> 0; `uncaughtException`/`unhandledRejection` -> log `fatal` (pino, kèm `err`; không log env/secret, header nhạy cảm đã bị redact) rồi tắt êm với 1 (không để tiến trình sống tiếp ở trạng thái không xác định).
  4. **Timeout tổng:** `SHUTDOWN_TIMEOUT_MS` (mặc định 25000, 1000..120000); quá thì log lỗi và `exit(1)`. Compose `backend` (dev profile app, demo, prod) đặt `stop_grace_period: 30s` để Docker không SIGKILL trước khi timeout nội bộ kịp chạy (mặc định 10 giây của Docker nhỏ hơn).
  5. **Job nền:** `startBackgroundJobs()` trả `void`; mỗi lượt được theo dõi trong một `Set` promise; `stopBackgroundJobs(): Promise<void>` chờ `Promise.allSettled`. Sau khi dừng, timer đã xóa và lượt mới không được lên lịch.
- **Kiểm thật (image runtime tạm, DB tạm):** `docker stop` khi có 1 kết nối keep-alive nhàn rỗi: log "Tắt êm: SIGTERM" rồi "Đã tắt êm (exit 0)", mã thoát 0, 0,49 giây. Ép `unhandledRejection` sau khởi động: log `fatal` (level 60) kèm stack, tắt êm, mã thoát 1.
- **Không làm:** hạn chế request mới bằng 503 trong lúc tắt (server đã ngừng nhận kết nối mới; `/health` không phân biệt "đang tắt"); retry lượt job bị cắt giữa chừng khi hết timeout (job idempotent, lượt sau tự nhặt, D-015).
- **Docs bị ảnh hưởng:** `backend/.env.example`, `.env.production.example`, compose, `testing.md`, `roadmap-next.md` (R-16), `wave5-plan.md`.

## D-080 Làm mới minPrice theo mốc sale

- **Ngày:** 2026-11-23 · **Người chốt:** Tech Lead (Đợt 5, R-17)
- **Trạng thái:** Áp dụng. Bổ sung `db-schema.md` §5 (denormalize), D-015 (job nền).
- **Bối cảnh:** `Product.minPrice` chỉ được tính lại khi có thao tác ghi. Khi `saleStart`/`saleEnd` của một biến thể qua mốc mà không ai sửa sản phẩm, lọc theo khoảng giá và `sort=price_*` vẫn dùng giá cũ (hiển thị giá ở trang chi tiết/giỏ vẫn đúng vì tính theo `now` ở server).
- **Quyết định:**
  1. **Đối soát không trạng thái, không bảng/cột mới:** `jobs/saleRefresh.ts`. Một truy vấn SQL tập hợp (`LEFT JOIN LATERAL` trên biến thể `isActive` chưa xóa) tính giá hiệu lực nhỏ nhất theo ĐÚNG quy tắc `effectivePrice` (`salePrice` khi có và `saleStart <= now <= saleEnd`, biên tính cả hai đầu, bound null = mở, ngược lại `price`; không biến thể = 0) rồi lấy sản phẩm chưa xóa có `minPrice` khác. Mỗi sản phẩm lệch được làm mới bằng chính `refreshProductDenorm` (một nguồn logic; `searchText`/`inStock` cũng được tính lại cùng lúc), mỗi sản phẩm một transaction để lỗi một sản phẩm không chặn sản phẩm khác.
  2. **Lịch và khóa:** advisory lock riêng `6_661_000_003` (giữ suốt lượt như job hết hạn thanh toán); chạy 1 lần lúc khởi động rồi mỗi 10 phút; tối đa 500 sản phẩm mỗi lượt (phần còn lại để lượt sau); log số đã làm mới và số lỗi khi > 0. Tôn trọng `JOBS_ENABLED`; chạy trong cùng cơ chế theo dõi lượt của `cleanup.ts` nên tắt êm chờ được (D-079).
  3. **Idempotent:** sản phẩm không lệch không bị ghi (không đổi `updatedAt`); chạy lại ngay cho kết quả 0.
  4. **Cột denorm khác:** `compareAtPrice` và cờ đang sale không lưu mà tính lúc đọc (`summarizePrices`), nên chỉ `minPrice` cần đối soát. `inStock` không phụ thuộc thời gian.
  5. **Độ trễ:** tối đa ~10 phút kể từ mốc (cộng cache HTTP ngắn của catalog, D-075).
  6. **Hệ quả nhỏ:** `Product.updatedAt` đổi khi sản phẩm được làm mới theo mốc sale, nên `lastmod` của sitemap (D-064) nhích theo; chấp nhận được vì giá thật sự đã đổi.
- **Docs bị ảnh hưởng:** `db-schema.md` §5, `architecture.md` §7, `testing.md`, `roadmap-next.md` (R-17).

## D-081 Allowlist ảnh đại diện

- **Ngày:** 2026-11-23 · **Người chốt:** Tech Lead (Đợt 5, R-18 rút gọn)
- **Trạng thái:** Áp dụng. Siết D-013 (upload) cho trường `User.avatarUrl`.
- **Bối cảnh:** `avatarUrl` nhận mọi URL `http:`/`https:`: người dùng có thể trỏ tới máy chủ bất kỳ (theo dõi người xem trang, nội dung hỗn hợp http). FE chỉ có ô nhập, chưa hiển thị ảnh.
- **Quyết định:**
  1. **Chấp nhận (chỉ hai dạng):** (a) đường dẫn tương đối `/uploads/...`: mỗi đoạn bắt đầu bằng chữ/số rồi `[A-Za-z0-9._-]` (loại `.`, `..`, `//`, query, hash, khoảng trắng, `\`, `%`), tối đa 500 ký tự, không chứa `..`; (b) URL `https:` đúng dạng `https://host...`, không `user:pass@`, không cổng, không `#`, có `hostname` (không phân biệt hoa thường, khớp CHÍNH XÁC, không khớp host con) nằm trong env `AVATAR_URL_HOSTS` (phân tách dấu phẩy; mặc định rỗng = chỉ `/uploads`). `null` để xóa. Không `http:`, `data:`, `javascript:`... Sai -> 400 `VALIDATION_ERROR`, field `avatarUrl`, thông báo tiếng Việt.
  2. **Mọi chỗ ghi:** đã grep: chỉ `PATCH /me` (zod `updateProfileSchema`) ghi `avatarUrl` từ đầu vào; xóa tài khoản ghi `null`.
  3. **Phòng thủ 2 lớp ở FE:** `features/account/avatar.ts` (cùng quy tắc; host từ `NEXT_PUBLIC_AVATAR_URL_HOSTS` nhúng lúc build, phải trùng `AVATAR_URL_HOSTS` của backend) và component `Avatar`: chỉ render `<img>` khi qua bộ kiểm, ngược lại chữ cái đầu của họ tên. Form hồ sơ hiển thị ảnh hiện tại bằng `Avatar` và kiểm cú pháp trước khi gửi (host do server quyết định).
  4. **Dữ liệu cũ:** KHÔNG có migration xóa/sửa; giá trị cũ không hợp lệ vẫn nằm trong DB và `GET /me` vẫn trả nguyên, nhưng FE không hiển thị. Người dùng sửa hồ sơ mà không đổi `avatarUrl` thì không bị chặn (PATCH chỉ kiểm trường được gửi; FE chỉ gửi trường đã đổi).
  5. **CSP:** `img-src` của storefront có thể chặn host https ngoài; nếu bật `AVATAR_URL_HOSTS` thật thì phải thêm host đó vào `img-src` (không cần cho `/uploads`).
- **Không làm:** re-encode ảnh bằng `sharp` (loại metadata, giới hạn điểm ảnh), job dọn file mồ côi (phần còn lại của R-18; thêm dependency native vào image, rủi ro hơn lợi ích cho localhost).
- **Docs bị ảnh hưởng:** `api-contract.md` §6.2 (0.29), `backend/.env.example`, `.env.production.example`, `frontend/.env.example`, `testing.md`, `roadmap-next.md` (R-18).

## D-082 Độ tươi hạt cà phê

- **Ngày:** 2026-11-23 · **Người chốt:** Tech Lead (Đợt 5, R-24a)
- **Trạng thái:** Áp dụng. Hiện thực `requirements.md` §5.6.
- **Quy tắc thật (§5.6):** "Hiển thị ngày rang của lô hiện tại; khuyến nghị dùng trong 30 ngày sau rang." và "Không bán lô hạt đã rang quá 90 ngày (admin đánh dấu ngừng bán biến thể/lô)."
- **Xác minh hiện trạng (trước khi làm):** `grep roastDate` cho thấy `roastDate` chỉ được đọc/ghi ở admin (schema, DTO, `variants.service`), catalog (`toVariant`) và hiển thị "Ngày rang" ở `AddToCartPanel`. Giỏ (`priceCartLine`, `addItem`, `updateItem`, merge, mua lại), báo giá (`collectIssues`) và đặt đơn (`placeOrder`) KHÔNG đọc `roastDate`: quy tắc 90 ngày hoàn toàn dựa vào việc admin tự ngừng bán biến thể, ngưỡng 30 ngày chưa có nhãn/cảnh báo nào. Seed dùng `roastDaysAgo` 3..28 (ngày tương đối từ lúc seed) nên không biến thể demo nào vướng ngưỡng; không đổi seed.
- **Quyết định:**
  1. **Tuổi hạt** = (ngày hôm nay theo giờ Việt Nam UTC+7) - `roastDate` (cột `DATE`), số ngày nguyên, tối thiểu 0 (ngày rang ở tương lai = 0); `roastDate` null -> không áp quy tắc. Hàm thuần `lib/freshness.ts`, đồng hồ tiêm. **Ngưỡng:** `FRESH` <= 30 ngày; `PAST_RECOMMENDED` 31-90 ngày (chỉ cảnh báo, vẫn bán); `EXPIRED` > 90 ngày (ngừng bán). Ví dụ rang 01/01: ngày 01/04 (90 ngày) còn bán đến hết ngày VN, sang 02/04 thì ngừng bán.
  2. **Server là nguồn sự thật, một điểm quyết định:** `priceCartLine` coi `EXPIRED` là `UNAVAILABLE` nên giỏ (không tính tiền, `countable=false`), báo giá (`issues`) và đặt đơn (409 `ITEM_UNAVAILABLE`, trước khi trừ kho/giá) đều chặn; `addItem`/`updateItem` từ chối 409 `ITEM_UNAVAILABLE`; mua lại bỏ qua dòng (`DISCONTINUED`); merge giỏ khách bỏ dòng (`UNAVAILABLE`). KHÔNG thêm mã lỗi mới: `ITEM_UNAVAILABLE` có `details.reason = "ROAST_EXPIRED"` (và `reason` ở từng dòng của `details.items` / `issues`) để FE hiện đúng câu. Không tin client; không đổi giá, idempotency hay công thức tính tiền.
  3. **API:** `Variant` (catalog) và dòng giỏ thêm `roastAgeDays` và `roastStatus`; biến thể `EXPIRED` có `maxQuantity = 0`. `stockStatus` và `Product.inStock` giữ nghĩa theo tồn kho (không đổi): sản phẩm mà mọi biến thể đều quá hạn rang vẫn có `inStock = true` ở danh sách nhưng không mua được ở trang chi tiết (đánh đổi: `inStock` là cột denorm theo tồn, không theo thời gian; không thêm nó vào job D-080).
  4. **FE:** trang sản phẩm hiện "Ngày rang: dd/mm/yyyy (Rang X ngày trước)", cảnh báo "Nên dùng trong 30 ngày sau rang..." khi > 30 ngày, và với lô quá hạn: nút disabled "Ngừng bán do quá hạn rang", ẩn ô số lượng, biến thể mặc định bỏ qua lô quá hạn; dòng giỏ hiện nhãn tuổi hạt + gợi ý (> 30 ngày) hoặc "Ngừng bán do quá hạn rang" (> 90 ngày, dòng bị chặn như UNAVAILABLE); thông báo lỗi giỏ/đặt đơn theo `reason`.
  5. **Hiệu lực với giỏ cũ:** dòng đã nằm trong giỏ khi lô vượt 90 ngày tự trở thành `UNAVAILABLE` ở lần đọc giỏ kế tiếp; khách xóa dòng hoặc đặt đơn bị chặn tới khi xóa.
- **Không làm:** cho cấu hình ngưỡng 30/90 qua cài đặt (hằng số trong `lib/freshness.ts`; sửa mã nếu cần), tự ngừng bán (`isActive=false`) ghi vào DB (tính theo thời gian đọc nên không cần job và không lệch), email cảnh báo cho admin về lô sắp hết hạn.
- **Docs bị ảnh hưởng:** `api-contract.md` §2, §4.4, §8, §9 (0.29), `requirements.md` §5.6 (ghi nơi hiện thực), `testing.md`, `roadmap-next.md` (R-24a).

## D-083 E2E mobile 390 px, smoke WebKit, warm-up khởi động nguội, đo tải đặt hàng đồng thời

- **Ngày:** 2026-11-23 · **Người chốt:** Tech Lead (Đợt 5, R-14 rút gọn; gộp phần Safari của R-12/R-13)
- **Trạng thái:** Áp dụng. Không đổi mã nguồn sản phẩm, chỉ harness test, CI, script đo và tài liệu.
- **Bối cảnh:** E2E chỉ có desktop Chromium, nên bố cục 390 px của luồng mua và trình duyệt WebKit (Safari) chưa được kiểm; chưa có số đo cho tranh chấp tồn kho khi nhiều đơn cùng SKU; lượt E2E đầu sau khi `next dev` khởi động nguội thỉnh thoảng đỏ (`POST /cart/items` qua rewrite 404), đã ghi ở nhiều đợt.
- **Quyết định:**
  1. **Warm-up khởi động nguội:** `e2e/global-setup.ts` chạy sau webServer, trước test: gọi QUA frontend các đường test sẽ đi (GET `/api/v1/health` và `/api/v1/products` qua rewrite, POST `/api/v1/cart/items` thân rỗng phải ra 400 JSON của backend, rồi trang `/`, danh mục, chi tiết sản phẩm, giỏ, thanh toán, tra cứu, đăng nhập, `/admin`), mỗi bước phải đúng mã 2 lần liên tiếp, timeout 120 giây/bước, log từng bước, không sleep cố định (chỉ khoảng thăm dò 0,5 giây giữa các lần thử lại). `webServer.url` của frontend cũng đổi sang `/api/v1/health` (đi qua rewrite). Nguyên nhân: webServer chỉ chờ trang chủ, `next dev` biên dịch từng route ở lần gọi đầu (đo: trang danh mục lần đầu 7,3 giây so với 0,2-0,6 giây các lần sau), nên test đầu vừa chờ biên dịch vừa gọi POST qua rewrite khi server dev còn bận. Không tái hiện được 404 ở mức HTTP thuần (probe POST đồng thời với biên dịch trang mới, 0/56 lỗi), nên đây là biện pháp loại bỏ điều kiện biên dịch lúc test chạy chứ chưa chứng minh được cơ chế 404 chính xác của Next (xem `testing.md`).
  2. **Project Playwright:** `chromium` (desktop, mọi spec trừ `purchase-mobile.spec.ts`), `mobile-390` (Pixel 7 chỉnh viewport 390x844, `isMobile`, `hasTouch`, cùng kênh trình duyệt với `chromium`), `webkit-smoke` (`devices["iPhone 13"]`, WebKit). Hai project mobile chỉ chạy `purchase-mobile.spec.ts`: menu "Danh mục" của header mobile, thêm giỏ, thanh toán COD, trang thành công, kiểm `scrollWidth <= clientWidth` ở 5 trang; không đăng nhập (không tốn lượt limiter auth), hủy đơn qua API ở cuối để hoàn kho.
  3. **WebKit có điều kiện:** bỏ project `webkit-smoke` khi `E2E_SKIP_WEBKIT=1` hoặc khi đặt `E2E_BROWSER_CHANNEL` (dùng Edge/Chrome có sẵn vì máy chặn file tải về) mà không ép `E2E_SKIP_WEBKIT=0`. CI cài `chromium webkit` (có cache `~/.cache/ms-playwright` theo phiên bản `@playwright/test`).
  4. **Nới limiter đặt đơn cho webServer cục bộ** (`ORDER/COUPON/QUOTE_RATE_LIMIT_PER_MIN` mặc định 200, ưu tiên env) vì thêm project đặt thêm đơn từ cùng IP; CI đã đặt 200 từ trước.
  5. **Đo tải:** `backend/scripts/load-order-concurrency.ts` (chỉ `fetch`, không phụ thuộc mới), chỉ chạy với `LOAD_API_URL` trỏ backend tạm và `LOAD_DATABASE_URL` trỏ DB tạm; từ chối cổng API 4000/4100 và DB localhost:5432 trừ khi có `LOAD_ALLOW_PROTECTED=1`. Không thêm test integration mới vì `orders.integration.test.ts` đã có "race tồn kho: stock 3, 5 giỏ guest -> đúng 3 đơn, 2 x OUT_OF_STOCK, stock = 0" cùng các ca song song khác; phần thuần của script có test (`loadOrderConcurrency.test.ts`).
- **Kết quả đo (bảng và cấu hình ở `testing.md`):** 100 đơn song song vào 1 SKU tồn 20, C = 25/50/100, 3 lần mỗi mức: 9/9 lượt đúng 20 đơn 201 và 80 đơn 409 `OUT_OF_STOCK`, 0 lỗi 5xx, tồn cuối 0, 20 `ORDER_RESERVE`, 0 deadlock (`pg_stat_database.deadlocks` không đổi, log Postgres không có `deadlock`). Độ trễ tăng gần tuyến tính theo C do pool `pg` mặc định 10 kết nối và khóa dòng biến thể; throughput quanh 40 đơn/giây không phụ thuộc C.
- **Không làm:** Firefox (WebKit smoke đã thêm một engine khác Chromium; engine thứ ba tốn thêm thời gian CI mà dự án localhost không cần), chạy cả bộ spec trên WebKit, k6/autocannon (thêm công cụ ngoài; script `fetch` đủ), test CheckoutForm riêng và cô lập DB test mỗi worker (phần còn lại của R-14, chốt dự án không làm).
- **Docs bị ảnh hưởng:** `testing.md` (E2E, warm-up, project mobile/WebKit, chạy WebKit qua Docker, bảng đo tải, kết quả), `roadmap-next.md` (R-12, R-13, R-14), `wave5-plan.md`.
