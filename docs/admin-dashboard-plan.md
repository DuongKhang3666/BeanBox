# BeanBox – Kế hoạch khu "Phân tích kinh doanh" (chỉ Admin)

> Ngày: 2026-11-20 · Người chốt: Tech Lead theo ủy quyền chủ dự án · Quyết định liên quan: [D-049, D-050, D-051, D-052, D-053](decisions.md) · Contract: [api-contract.md §16](api-contract.md).

## 1. Mục tiêu

Cho chủ cửa hàng (Admin) một khu riêng để đọc số liệu kinh doanh: doanh thu và các chỉ số chính có so sánh với kỳ trước, cơ cấu doanh thu, khách hàng, vận hành, tồn kho, hiệu quả mã giảm giá, và xuất CSV. Khu này tách khỏi dashboard vận hành hằng ngày của nhân viên.

## 2. Hiện trạng

- Khu `/admin` dùng chung cho STAFF và ADMIN: `admin.routes.ts` áp `requireAuth, requireStaff` ở cấp router; route chỉ Admin dùng thêm `requireAdmin` (ví dụ settings, users, audit-logs).
- Dashboard `GET /admin/dashboard` (api-contract §14.3, D-019): doanh thu hôm nay/7/30 ngày, `dailyRevenue` 30 ngày, đơn theo trạng thái, top 5 sản phẩm, tồn kho thấp, việc cần chú ý. FE vẽ biểu đồ bằng CSS (`RevenueChart.tsx`), không thư viện.
- Schema đã có `Order.paidAt`, `paymentStatus`, `status`, `paymentMethod`, `shippingMethod`, `discountTotal`, `couponId/couponCode`, `grandTotal`, `cancelReason`, `userId` (nullable), `contactEmail`; `Payment.amount` và `Payment.refundedAt`. Trước kế hoạch này chưa có index theo `paidAt` hay `refundedAt`.
- Ma trận phân quyền tự động `backend/tests/securityAuthz.integration.test.ts` phải được cập nhật mỗi khi thêm route.

## 3. Phạm vi phân quyền và quyết định chung

- Giữ `/admin` ("Tổng quan" vận hành) cho STAFF + ADMIN như hiện tại, không đổi API §14.3.
- Thêm khu mới **`/admin/phan-tich`** ("Phân tích kinh doanh"), chỉ ADMIN:
  - Backend: router `/api/v1/admin/analytics/*` gắn `requireAdmin` ở cấp router (STAFF nhận 403 `FORBIDDEN`, chưa đăng nhập 401), `Cache-Control: no-store` (kế thừa từ admin router).
  - Frontend: mục nav `adminOnly`; STAFF vào URL trực tiếp thấy thông báo không đủ quyền và không gọi API.
- Không thêm thư viện biểu đồ (giữ D-019): biểu đồ SVG/CSS tự vẽ, luôn kèm bảng dữ liệu thay thế cho trình đọc màn hình.
- Mốc thời gian: ngày lịch Việt Nam (UTC+7 cố định, không DST). Khoảng `from`..`to` (`YYYY-MM-DD`, tính cả hai đầu), tối đa 366 ngày. Kỳ so sánh là kỳ liền trước cùng độ dài: `prevTo = from - 1 ngày`, `prevFrom = prevTo - (days - 1)`.
- Hiệu năng: truy vấn tổng hợp `GROUP BY` bằng SQL (không N+1, không tải đơn lên bộ nhớ), thêm index cần thiết, giới hạn 366 ngày. Chưa có bảng tổng hợp (đủ cho quy mô hiện tại; Bước 5 đo `EXPLAIN` với dữ liệu lớn).

## 4. Định nghĩa chỉ số

| Chỉ số | Định nghĩa |
| --- | --- |
| Doanh thu | Như D-019: tổng `grandTotal` của đơn `paymentStatus = PAID`, `status` không thuộc {`CANCELLED`, `RETURNED`}, tính theo `paidAt` (ngày VN). |
| Đơn đã thanh toán (`paidOrders`) | Số đơn thỏa định nghĩa doanh thu. |
| AOV | `round(doanh thu / paidOrders)`; 0 nếu không có đơn. |
| Đơn đã đặt (`ordersPlaced`) | Số đơn theo `createdAt`, mọi trạng thái. |
| Tỷ lệ hủy | Số đơn tạo trong kỳ đang ở `CANCELLED` chia `ordersPlaced` (gồm cả đơn online hết hạn thanh toán; tách lý do ở Bước 3). |
| Giảm giá | Tổng `discountTotal` của đơn được tính doanh thu. |
| Hoàn tiền | Tổng `Payment.amount` của các Payment có `refundedAt` trong kỳ (số tiền là `Payment.amount`, Int VND, tính cả lần hoàn một phần nếu sau này có). |
| Khách mới | `User` có `role = CUSTOMER` và `createdAt` trong kỳ (đăng ký mới). Khách mua lần đầu/quay lại để Bước 3. |

Đánh đổi: doanh thu theo danh mục/thương hiệu lấy theo `Product` hiện tại (`OrderItem` không lưu snapshot category/brand), nên đổi danh mục của sản phẩm làm thay đổi số liệu quá khứ. Số liệu quá khứ nói chung không đóng băng (như D-019).

## 5. Các bước

### Bước 1 — Nền tảng, KPI tổng quan có so sánh kỳ trước, biểu đồ theo ngày/tuần/tháng

- **Mục tiêu:** router analytics chỉ Admin; `GET /admin/analytics/overview`; trang `/admin/phan-tich` có bộ lọc khoảng ngày (preset + tùy chọn, lưu trong URL), nhóm theo ngày/tuần/tháng, 9 thẻ KPI so với kỳ trước, biểu đồ cột doanh thu kèm đường kỳ trước và bảng thay thế.
- **File ảnh hưởng:** `backend/src/modules/admin/analytics/*` (routes, controller, service, schema, range), `admin.routes.ts`, `dashboard.service.ts` (chỉ export `vnDateKey`), migration index `Order.paidAt` và `Payment.refundedAt`, `schema.prisma`; FE: `app/admin/phan-tich/page.tsx`, `features/admin/components/{AdminAnalytics,AnalyticsChart}.tsx`, `features/admin/{analyticsRange.ts,api/analytics.ts}`, `AdminNav.tsx`, `AdminDashboard.tsx` (link cho Admin), `types/admin.ts`; docs, test, E2E.
- **API:** `GET /admin/analytics/overview?from&to&granularity` (api-contract §16.1).
- **Test:** backend integration (quyền 401/403/200, validate, định nghĩa chỉ số, biên ngày VN, kỳ trước, bucket tuần/tháng) + unit (khoảng ngày, bucket); FE (helper preset/khoảng ngày, định dạng so sánh, Forbidden không fetch, loading/error/empty, bảng thay thế, URL); E2E (admin mở trang, đổi preset; staff bị chặn); ma trận phân quyền.
- **Tiêu chí xong:** lint/typecheck/test/build xanh ở cả hai phía; không cuộn ngang toàn trang ở 390/768/1440; số KPI khớp tính tay trên dữ liệu thật; không đổi §14.3.
- **Trạng thái:** Đã làm (2026-11-20). Chờ duyệt kết quả.

### Bước 2 — Cơ cấu doanh thu

- **Mục tiêu:** doanh thu, số đơn, số lượng theo danh mục, thương hiệu, phương thức thanh toán, phương thức giao, tỉnh/thành; top sản phẩm (theo doanh thu và số lượng, có khoảng ngày); top khách (gộp theo `userId`, khách vãng lai gộp theo `lower(contactEmail)`; hiển thị tên + email, chỉ Admin).
- **File ảnh hưởng:** module analytics (service/schema/routes), FE thêm các khối bảng + biểu đồ thanh ngang.
- **API:** `GET /admin/analytics/breakdown?dimension=category|brand|paymentMethod|shippingMethod|province&from&to`, `GET /admin/analytics/top-products?from&to&sort&limit`, `GET /admin/analytics/top-customers?from&to&sort&limit` (limit 1..50; api-contract §16.2, D-051).
- **Test:** tổng các nhóm bằng doanh thu tổng; sản phẩm đổi danh mục; khách vãng lai gộp theo email không phân biệt hoa thường.
- **Tiêu chí xong:** bảng + biểu đồ thanh ngang, responsive, a11y.
- **Trạng thái:** Đã làm (2026-11-20). Chờ duyệt kết quả.
- **Thực tế đã làm (D-051):** backend thêm `analytics.breakdown.ts`, `analytics.top.ts` (SQL `$queryRaw` tham số hóa, kỳ này và kỳ trước cùng truy vấn), schema zod, 3 route (`requireAdmin` kế thừa ở cấp router). Chiều cấp đơn (thanh toán, giao hàng, tỉnh/thành) tổng = doanh thu overview; chiều dòng hàng (danh mục, thương hiệu) là "doanh thu hàng hóa" (Σ `lineTotal`), theo phân loại hiện tại của sản phẩm. Tối đa 50 nhóm + "Khác". Top khách gộp theo `userId` / `lower(contactEmail)`, không trả SĐT/địa chỉ. FE: `AnalyticsBreakdown.tsx` (chọn chiều lưu `?dim=`), `AnalyticsTops.tsx` (top sản phẩm, top khách), mỗi khối tải và báo lỗi độc lập, nút "Làm mới" tải lại cả ba. Test: `backend/tests/adminAnalyticsBreakdown.integration.test.ts`, `AnalyticsBreakdown.test.tsx`, E2E trong `m6b.spec.ts` (kèm axe).

### Bước 3 — Khách hàng và vận hành

- **Mục tiêu:** khách mua lần đầu so với quay lại, tỷ lệ mua lại; phân rã hủy (khách hủy / admin hủy / hết hạn thanh toán, theo `cancelReason` hoặc lịch sử trạng thái), tỷ lệ trả hàng, hoàn tiền; thời gian xử lý trung bình (tạo, xác nhận, giao; từ `OrderStatusHistory`); đơn cần xử lý (chờ xác nhận quá X giờ, cần hoàn tiền). Tồn kho: hết hàng, sắp hết, giá trị tồn (tồn x giá), hàng bán chậm (không bán trong N ngày).
- **File ảnh hưởng:** module analytics, FE các khối mới; có thể cần index cho `OrderStatusHistory`.
- **API:** `GET /admin/analytics/customers?from&to`, `/operations?from&to`, `/inventory?slowDays` (api-contract §16.3).
- **Test:** theo từng chỉ số, gồm biên "lần đầu" và đơn bị hủy do hết hạn thanh toán.
- **Tiêu chí xong:** định nghĩa từng chỉ số được ghi vào contract/decisions; không N+1.
- **Trạng thái:** Đã làm (2026-11-20). Chờ duyệt kết quả.
- **Thực tế đã làm (D-052):** backend thêm `analytics.customers.ts` (1 truy vấn gộp theo khách cho hai kỳ), `analytics.operations.ts` (7 truy vấn chạy `Promise.all`), `analytics.inventory.ts` (4 truy vấn), schema zod (`slowDays` 7..365) và 3 route (`requireAdmin` kế thừa cấp router); export `EXPIRE_REASON` từ `jobs/cleanup.ts` để phân loại hủy dùng đúng chuỗi của job. Định nghĩa: khách lần đầu/quay lại theo đơn tính doanh thu sớm nhất mọi thời điểm (khóa `userId`/`lower(contactEmail)`); hủy phân loại `customer`/`store`/`expired`/`unknown` từ `OrderStatusHistory` mới nhất; trả hàng theo `deliveredAt`; thời gian xác nhận (chỉ COD) và giao, trung bình + trung vị; đơn cần xử lý là ảnh chụp hiện tại; giá trị tồn dùng `price`; bán chậm theo `slowDays`. Không có migration: `EXPLAIN` sơ bộ truy vấn khách lần đầu (50.000 đơn, quét tuần tự khoảng 33 ms) cho thấy index không thay được quét lịch sử, để Bước 5 đo lại. FE: mục lục neo, `AnalyticsCustomers.tsx`, `AnalyticsOperations.tsx`, `AnalyticsInventory.tsx`, `AnalyticsKpi.tsx` (tách `Kpi`/`DeltaLine` dùng chung), `formatHours` trong `analyticsRange.ts`. Test: `backend/tests/adminAnalyticsStep3.integration.test.ts`, `AnalyticsStep3.test.tsx`, E2E trong `m6b.spec.ts` (kèm axe).

### Bước 4 — Hiệu quả mã giảm giá và xuất CSV

- **Mục tiêu:** theo mã: lượt dùng, tổng giảm, doanh thu đơn có mã, AOV có/không mã, tỷ lệ đơn dùng mã. Xuất CSV phía server: UTF-8 có BOM (Excel), chống CSV injection (ô bắt đầu bằng `=`, `+`, `-`, `@`, tab, CR thì thêm `'`), tên file có khoảng ngày, ghi audit log `analytics.export` (có dữ liệu cá nhân), rate limit riêng nhẹ.
- **File ảnh hưởng:** module analytics, `lib/audit` (action mới), rate limiter, FE nút xuất.
- **API:** `GET /admin/analytics/coupons?from&to&sort&limit`, `GET /admin/analytics/export?report=overview|series|breakdown|top-products|top-customers|coupons|customers|operations|inventory&...` (api-contract §16.4, D-053).
- **Test:** chống CSV injection, BOM, audit log, rate limit, quyền.
- **Tiêu chí xong:** mở được trong Excel đúng tiếng Việt; mỗi lần xuất có một dòng audit.
- **Trạng thái:** Đã làm (2026-11-20). Chờ duyệt kết quả.
- **Thực tế đã làm (D-053):** backend thêm `analytics.coupons.ts` (2 truy vấn song song, mã đã xóa gộp theo snapshot `couponCode`), `analytics.export.ts` (hàm thuần ánh xạ DTO sang hàng CSV cho 9 báo cáo, dùng lại các hàm service JSON), `lib/csv.ts` (BOM, CRLF, RFC 4180, chống CSV injection theo kiểu ô, tên file an toàn), schema zod chặt cho `export` (`discriminatedUnion` + `strictObject`), limiter `export` 10/phút/IP (`EXPORT_RATE_LIMIT_PER_MIN`, đặt sau `requireAdmin`), audit `analytics.export` ghi trước khi gửi body (fail-closed); `getInventory` nhận thêm `listLimit` để xuất tới 1000 dòng (JSON không đổi). FE: khối "Mã giảm giá", nút "Xuất CSV" ở 9 khối, `ApiClient.download` (Bearer + refresh 401, không token trong URL), nhãn/nhóm lọc audit cho `analytics.export`. Không cần migration.

### Bước 5 — Hoàn thiện

- **Mục tiêu:** đo `EXPLAIN ANALYZE` với khoảng 50k đơn sinh trên DB tạm, thêm index hoặc điều chỉnh nếu cần; axe và kiểm 390/768 cho toàn khu; bản in; cập nhật README và ảnh chụp; ghi kết quả vào `testing.md`.
- **File ảnh hưởng:** migration (nếu cần), CSS in, `a11y.spec.ts`, README, `docs/screenshots`, `testing.md`.
- **API:** không thêm.
- **Test:** axe không có vi phạm serious/critical trên các trang khu phân tích; E2E không tràn ngang.
- **Tiêu chí xong:** truy vấn overview dưới ngưỡng đã ghi trong `testing.md` với 50k đơn; tài liệu cập nhật.
- **Đã làm (phần A, D-054):** công cụ sinh dữ liệu demo (100.000 đơn trong ~44 giây); đo `EXPLAIN`/HTTP trên Postgres 17 (kết quả trước/sau ở `testing.md`): không thêm index, tối ưu 3 truy vấn (tồn kho 453 -> 102 ms, vận hành 327 -> 132 ms, cơ cấu danh mục/thương hiệu 1242 -> 890 ms ở 365 ngày), `shm_size` cho db; axe + không tràn ngang ở 1440/768/390 (cả bảng thay thế và tab tồn kho) với dữ liệu lớn, mở rộng `m6b.spec.ts`; bản in; chặn mã giảm giá bắt đầu bằng `-` khi tạo (contract 0.18); prettier file lệch ở HEAD.
- **Đã làm (phần B, 2026-11-21):** README (mục Admin có khu Phân tích kinh doanh, quyết định kỹ thuật, ảnh, tài liệu); chụp lại toàn bộ ảnh trên DB tạm có dữ liệu generator (`--orders 1500 --days 90 --seed 42`), thêm `admin-analytics.png` và `admin-analytics-breakdown.png`; `capture.spec.ts` có thêm bước chụp vùng; `docs/screenshots/README.md` cập nhật quy trình.
- **Trạng thái:** Đã làm (phần A và B), đã commit (6fd1313). Vòng kiểm cuối 2026-11-21 đạt; số đo và kết quả kiểm ở `testing.md` và D-054.
