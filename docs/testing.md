# Kiểm thử BeanBox

## Yêu cầu chung

- Node >= 22, đã `npm install` trong `backend/` và `frontend/`.
- Prisma 7: sau mỗi lần `npm install`/`npm ci` (và khi sửa `schema.prisma`) chạy `npx prisma generate` trong `backend/` để sinh client vào `backend/src/generated/prisma` (thư mục bị ignore, không commit; không có thì typecheck/test/dev đều lỗi). Cấu hình CLI nằm ở `backend/prisma.config.ts` (tự nạp `.env`, không ghi đè biến đã đặt; `SHADOW_DATABASE_URL` tùy chọn).
- Docker Postgres chạy (`docker compose up -d db`), đã migrate: `npm run prisma:migrate` (hoặc `prisma migrate deploy`) trong `backend/`.
- Prisma 7 không còn tự generate hay seed sau `migrate dev`/`migrate reset`: `npm run prisma:migrate` đã nối thêm `prisma generate`, `npm run db:reset` nối thêm `prisma generate` và `prisma db seed`; nếu gọi `npx prisma migrate ...` trực tiếp thì tự chạy `npx prisma generate` và `npm run prisma:seed`.
- Dữ liệu seed cho E2E: `npm run prisma:seed` trong `backend/` (idempotent; từ chối chạy khi `NODE_ENV=production`).
- `backend/.env` có `SEED_ADMIN_PASSWORD`, `SEED_STAFF_PASSWORD`, `SEED_CUSTOMER_PASSWORD` (xem `.env.example`).

## Unit / integration

| Phần     | Lệnh (trong thư mục tương ứng)                                   | Ghi chú                                                                |
| -------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Backend  | `npm run lint`, `npm run typecheck`, `npm test`                  | Test integration dùng DB Postgres thật (cần Docker chạy).              |
| Frontend | `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` | Vitest + jsdom; `testTimeout`/`hookTimeout` = 15 s; loại trừ `e2e/**`. |

### Coverage và kiểm định dạng (D-055)

Cả hai phía có `npm run test:coverage` (Vitest + `@vitest/coverage-v8`) và `npm run format:check` (`prettier --check .`). CI chạy hai lệnh này thay cho `npm test` (job `backend` và `frontend`); báo cáo html lưu ở artifact `coverage-backend`/`coverage-frontend` (7 ngày), bảng tóm tắt nằm trong Summary của job. Báo cáo ghi vào `coverage/` (đã ignore ở git, docker và prettier).

```bash
# backend (cần Postgres; DB test PHẢI có tên kết thúc bằng _test)
cd backend && TEST_DATABASE_URL=postgresql://user:pw@localhost:5432/beanbox_test npm run test:coverage
# frontend
cd frontend && npm run test:coverage
```

Số đo ngày 2026-11-21 (v8, chỉ `src/**`, loại file test, `.d.ts`, `src/generated` ở backend và `src/types` ở frontend) và ngưỡng đặt trong `vitest.config.*` (số đo làm tròn xuống, trừ khoảng 2 điểm; chạy dưới ngưỡng thì lệnh thoát khác 0):

| Phần     | Statements | Branches | Functions | Lines  | Ngưỡng (statements / branches / functions / lines) |
| -------- | ---------- | -------- | --------- | ------ | -------------------------------------------------- |
| Backend  | 96,56 %    | 89,36 %  | 97,65 %   | 97,93 % | 94 / 87 / 95 / 95                                  |
| Frontend | 83,55 %    | 77,73 %  | 83,67 %   | 86,12 % | 81 / 75 / 81 / 84                                  |

Ngưỡng chỉ để không cho tụt; khi coverage tăng đáng kể thì nâng ngưỡng lên. Frontend nới `testTimeout`/`hookTimeout` lên 60 s CHỈ khi chạy với `--coverage` (instrument làm vài test form dài chạy quá 15 s, thấy 2-5 test timeout ở lần đo đầu). `format:check`: cả hai `.prettierrc.json` đặt `endOfLine: "auto"` vì working tree Windows có file CRLF trong khi index là LF; trên CI (Linux) tất cả là LF nên kết quả như nhau.

Ghi chú (2026-11-21): vitest frontend chạy mặc định 16 worker trên máy 16 luồng; một lần trước đây có 10-11 test form quá thời gian khi máy đang bận (tiến trình khác chạy song song). Vòng kiểm cuối chạy lại mặc định 3 lần ở working tree và 2 lần ở HEAD sạch: đều 0 timeout (92 file; 819 test ở working tree, 817 ở HEAD) trong khoảng 35-39 s, nên đó không phải hồi quy của Bước 5. Nếu gặp lại trên máy nhiều luồng đang tải, chạy `npx vitest run --maxWorkers=6`.

### Test bảo mật phiên và cache (D-045)

- `backend/tests/sessionRevocation.integration.test.ts`: access token gắn với phiên; logout, reset-password, change-password (phiên khác 401, phiên hiện tại 200), dùng lại refresh token, refresh hết hạn đều chặn access token ngay; user bị khóa vẫn 403. Test tự ký token (`authMiddleware`, `securityHardening`) phải tạo một `RefreshToken` thật với `familyId = sid`; thu hồi phiên của user (khóa/đổi role) làm access token cũ trả 401 (không còn 403).
- `backend/tests/cacheControl.integration.test.ts`: response riêng tư có `no-store`, GET catalog/`settings/public`/`locations` không bị ép.
- `backend/tests/envSecrets.test.ts`: `COOKIE_SECURE=false` ở production bị từ chối; `AUTH_RATE_LIMIT_PER_MIN`.

### Ma trận phân quyền tự động

`backend/tests/securityAuthz.integration.test.ts` liệt kê mọi route theo nhóm PUBLIC / OPTIONAL / ADMIN_ONLY (và Staff+) và kiểm đáp ứng 401/403 đúng. Khi thêm hoặc đổi route (ví dụ `/admin/settings`, `/admin/users`, `/admin/contact-messages`, `/settings/public`, `/contact`, `/csp-report`) phải cập nhật ma trận này trong cùng thay đổi.

### Test phân tích kinh doanh (D-049, D-050)

- `backend/tests/analyticsRange.test.ts` (unit, không DB): mặc định và các ca thiếu `from`/`to`, `granularity` mặc định, từ chối `to` sau hôm nay, `from > to`, > 366 ngày, trước 2020-01-01; bucket ngày/tuần (thứ Hai đầu tuần)/tháng (cắt đầu cuối, qua năm, tháng 2 nhuận), bucket liên tục không trùng; `changePct` và gom số liệu theo kỳ.
- `backend/tests/adminAnalytics.integration.test.ts`: 401 (chưa đăng nhập), 403 (customer, staff), 200 admin, `no-store`; 400 từng ca (định dạng, ngày không tồn tại, `from > to`, `to` ở tương lai, > 366 ngày, trước 2020, `granularity` sai, tham số lặp) kèm `field`; định nghĩa chỉ số trên dữ liệu ở năm 2031 (không lẫn test khác): đơn PAID bị CANCELLED/RETURNED loại, COD chưa thu chỉ tính `ordersPlaced`, biên 23:59:59.999 và 00:00 giờ VN, đơn đặt kỳ trước nhưng thu kỳ này, kỳ trước đúng, `changePct` `null`, tỷ lệ hủy và `changePts`, hoàn tiền theo `refundedAt` (Payment chưa hoàn không tính), khách mới chỉ role `CUSTOMER`, bucket tuần/tháng điền 0 và cắt biên, tổng `series` bằng KPI.
- Frontend: `src/features/admin/analyticsRange.test.ts` (preset, khoảng ngày theo giờ VN không phụ thuộc múi giờ máy, validate tiếng Việt, đọc URL, định dạng so sánh) và `components/AdminAnalytics.test.tsx` (STAFF thấy Forbidden và không gọi `fetch`, 403 từ API, skeleton/lỗi/rỗng, 9 thẻ KPI và dòng so sánh, bảng thay thế đủ số bucket, đổi preset/nhóm cập nhật URL qua `router.replace`).
- Frontend Bước 2: `components/AnalyticsBreakdown.test.tsx` (chọn chiều cập nhật URL `dim=`, `dim` sai về danh mục và giữ `dim` khi đổi khoảng ngày, thanh/bảng đúng số liệu và `th scope`, ghi chú doanh thu hàng hóa và phân loại hiện tại chỉ ở chiều dòng hàng, nhóm "Khác"; top sản phẩm: link, nhãn "Đã xóa" không link, đổi sort gọi lại API; top khách: link tài khoản, nhãn "Vãng lai", email dài `break-all`, đổi sort; loading/lỗi/rỗng từng khối độc lập; STAFF không gọi API nào). `analyticsRange.test.ts` thêm `parseDim` và `analyticsHref` có `dim`.
- `backend/tests/adminAnalyticsBreakdown.integration.test.ts` (Bước 2, D-051; dữ liệu ở năm 2033): 401/403 (customer, staff)/200 admin và `no-store` cho 3 endpoint; 400 cho `dimension` thiếu/sai/lặp, `limit` 0/51/abc/1.5/-3/lặp, `sort` sai, khoảng ngày sai; tổng nhóm chiều cấp đơn (thanh toán, giao hàng, tỉnh) = `kpis.revenue` của `getOverview`; tổng nhóm chiều dòng hàng = `total.revenue` = Σ `lineTotal` của tập đơn (đối chiếu bằng `aggregate`) và `orders` các nhóm không cộng thành `total.orders`; đơn hủy/trả/COD chưa thu bị loại; đổi danh mục sản phẩm thì doanh thu chuyển sang danh mục mới; brand null thành nhóm `key: null`; tỉnh thiếu thành "Không xác định"; kỳ trước và `changePct` (kể cả `null`); hàm thuần `assembleGroups` (60 nhóm -> 49 + "Khác", tổng không đổi; đúng 50 thì không gộp); top-products theo doanh thu/số lượng, `limit`, tên hiện tại, sản phẩm xóa mềm `deleted: true`; top-customers gộp vãng lai theo email không phân biệt hoa thường, registered theo `userId`, tách hai dòng khi cùng email, không có SĐT/địa chỉ trong response, sort `orders`. `securityAuthz.integration.test.ts` thêm 3 route vào `ADMIN_ONLY`.
- `backend/tests/adminAnalyticsStep3.integration.test.ts` (Bước 3, D-052; dữ liệu ở năm 2034, các mốc "hiện tại" so với hiệu số trước/sau khi tạo fixture vì DB test dùng chung): 401/403 (customer, staff)/200 admin và `no-store` cho 3 endpoint; 400 cho `slowDays` 6/366/abc/7.5/-30/lặp và khoảng ngày sai; **khách**: khách tài khoản gộp theo `userId` (hai `contactEmail` khác nhau), vãng lai gộp email hoa/thường, khách có đơn trước kỳ là quay lại, đơn trước đó bị `CANCELLED` thì vẫn là lần đầu, đơn COD chưa thu và `RETURNED` bị loại, khách lần đầu của kỳ trước, `repeatRate` và `changePts`, bất biến lần đầu + quay lại = khách mua và tổng doanh thu hai nhóm = `getOverview().kpis.revenue` (cả hai kỳ), response không chứa email; **vận hành**: phân loại hủy bằng `cancelOrderTx` thật (khách tài khoản, khách vãng lai, staff, admin), hủy hết hạn qua `runExpirePendingPaymentsOnce` thật (kiểm dòng history đúng `EXPIRE_REASON`), đơn hủy không có history là `unknown`, khách tài khoản hủy `PENDING_PAYMENT` bằng đúng lý do của job vẫn là `customer`, dùng dòng history `CANCELLED` mới nhất, tổng `byType` = `kpis.cancelledOrders`; tỷ lệ trả hàng theo `deliveredAt` (và 0 khi mẫu = 0); hoàn tiền khớp `kpis.refundedAmount`; `fulfillment` avg/median/n với đơn online bị loại khỏi `confirmHours`, kỳ trước, `null` khi `n = 0`; `attention`: PENDING 23 giờ không tính, 25 và 72 giờ tính (cũ nhất trước, `waitingHours`), đơn cần hoàn tiền, trả hàng, giao thất bại, không có thông tin cá nhân; **tồn kho**: hết hàng/sắp hết (đúng biên ngưỡng, sắp theo stock tăng dần), giá trị tồn dùng `price` không dùng `salePrice`, bán chậm (biến thể mới tạo bị loại, đơn `CANCELLED`/`PENDING_PAYMENT` không phải bán, sắp theo giá trị tồn, `lastSoldAt`), `slowDays` 7/30/60 đổi kết quả, biến thể inactive/xóa mềm/sản phẩm xóa mềm bị loại, tối đa 20 mục. `securityAuthz.integration.test.ts` thêm 3 route vào `ADMIN_ONLY`.
- Frontend Bước 3: `components/AnalyticsStep3.test.tsx` (mục lục neo trỏ tới heading có `id`; khách hàng: 6 thẻ KPI + so sánh kỳ trước, loading/lỗi thử lại/rỗng; vận hành: nhãn hủy tiếng Việt kèm số, %, thanh CSS và tổng, rỗng, tỷ lệ trả hàng, hoàn tiền, định dạng giờ "x,y giờ"/"x ngày y giờ"/"Chưa có dữ liệu" khi `null`, "Cần xử lý ngay" với link lọc đơn và link `/admin/don-hang/[code]`; tồn kho: ghi chú số liệu hiện tại, đổi tab Hết hàng/Sắp hết/Bán chậm, chọn `slowDays` 60/90 gọi lại API và giữ tab, "Hiển thị x trên y", rỗng theo tab; nút "Làm mới" tải lại cả ba khối; STAFF thấy Forbidden và không gọi `fetch`). `analyticsRange.test.ts` thêm `formatHours`. Dữ liệu mẫu dùng chung ở `features/admin/analyticsTesting.ts` (cũng được `AdminAnalytics.test.tsx`/`AnalyticsBreakdown.test.tsx` dùng để giả lập 3 endpoint mới).
- `backend/tests/csv.test.ts` (unit, không DB, Bước 4, D-053): mọi ký tự nguy hiểm đầu chuỗi (`=`, `+`, `-`, `@`, tab, CR) được thêm `'`, payload điển hình (`=HYPERLINK(...)`, `+1`, `-1+1`, `@SUM(A1)`, `\t=1`), không trim (khoảng trắng đầu giữ nguyên, ký tự nguy hiểm ở giữa không đổi), số âm vẫn là số, số không hữu hạn/null thành ô trống, dấu phẩy/ngoặc kép/xuống dòng được bọc và nhân đôi, tiếng Việt, BOM, CRLF (không có LF trần), tên file chỉ dựng từ enum + ngày và từ chối giá trị chứa ký tự lạ.
- `backend/tests/adminAnalyticsStep4.integration.test.ts` (Bước 4, D-053; mã giảm giá dùng dữ liệu năm 2036 qua `getCoupons(query, now)`, xuất CSV dùng dữ liệu năm 2021 qua HTTP): **coupons**: `summary` (đơn có/không mã, `couponRate` và `changePts`, AOV có/không mã, `totalDiscount`, cả kỳ trước), gộp theo mã, mã đã xóa thật (`prisma.coupon.delete`, `couponId` về null, gộp theo snapshot, `deleted: true`), FREESHIP cộng `shippingDiscount` còn mã khác thì không, đơn CANCELLED/RETURNED/COD chưa thu bị loại, mã chỉ có ở kỳ trước không hiện, `changePct` (kể cả `null`), sort `uses`/`discount`, `limit` không cắt `summary`, khoảng rỗng; 401/403 staff/200 admin/400 sort-limit-lặp. **export**: 401/403 (customer, staff) trả JSON, 20 ca 400 (report thiếu/sai/lặp, thiếu `dimension` ở breakdown, thiếu `list` ở inventory, `slowDays` 6/366, `limit` 0/201/lặp, `sort` sai, tham số không áp dụng, `from` sai/lặp, quá 366 ngày, `to` tương lai) kèm `field` và không ghi audit; header (`text/csv; charset=utf-8`, `attachment; filename=...` đúng mẫu, `no-store`, `nosniff`), body bắt đầu BOM và kết thúc CRLF, tên file theo dimension/list, cả 9 báo cáo trả 200; số liệu CSV khớp JSON (overview, series: tổng doanh thu bằng KPI và kỳ trước theo chỉ số bucket, breakdown + dòng Tổng, top-products, top-customers); top-customers có email, không có SĐT/địa chỉ/userId; tên sản phẩm `=HYPERLINK(...)`, `+1`, `-1+1`, `@SUM`, `\t=1` và tên khách `=cmd|x` được vô hiệu (không ô nào bắt đầu bằng ký tự công thức); inventory có tên bắt đầu `-` và dấu phẩy/ngoặc kép được bọc đúng; audit đúng 1 dòng `analytics.export` mỗi lần xuất thành công (có `ip`, `diff` dạng `[null, giá trị]`, không có email), 0 dòng khi 400/401/403; rate limit: app tạo với `exportRateLimit: 2` trả 429 `RATE_LIMITED` + `Retry-After` ở lần thứ 3, 403 của staff không tiêu hạn mức, mặc định 10 lần/phút. `securityAuthz.integration.test.ts` thêm 2 route vào `ADMIN_ONLY`.
- Frontend Bước 4: `lib/api/client.test.ts` (`ApiClient.download`: Bearer ở header và không có token trong URL, 401 `UNAUTHORIZED` refresh rồi thử lại một lần, vẫn 401 thì ném lỗi, lỗi JSON 429 thành `ApiError` có `details`, lỗi mạng, thiếu `Content-Disposition` dùng tên mặc định; `filenameFromDisposition` từ chối tên có `..`, `/`, khoảng trắng, bắt đầu bằng `.`, không có dấu nháy), `features/admin/download.test.ts` (object URL, `<a download>` nằm trong DOM khi bấm rồi được gỡ, `revokeObjectURL` sau 1 giây), `components/AnalyticsStep4.test.tsx` (khối Mã giảm giá: thẻ tóm tắt có so sánh kỳ trước, bảng, link mã còn tồn tại, nhãn "Đã xóa" không link, "Đã tắt", bảng trong vùng `relative overflow-x-auto`, đổi sort gọi lại API, rỗng và lỗi có thử lại; nút "Xuất CSV": nhãn có ngữ cảnh, tải bằng Bearer không token trong URL rồi gọi lưu file, đang xuất thì `disabled` + `aria-busy` và không gửi trùng, 429 hiện "Bạn xuất quá nhanh, thử lại sau N giây.", lỗi khác hiện tại chỗ và được xóa khi bấm lại; STAFF thấy Forbidden, không có nút và không gọi `fetch`). `AnalyticsStep3.test.tsx` cập nhật mục lục neo thành 7 liên kết; dữ liệu mẫu `makeCoupons` ở `analyticsTesting.ts`.

### Test Đợt 1: mailer, đơn COD khách vãng lai, pool analytics (D-056, D-057, D-058)

- `backend/tests/mailer.test.ts` (unit, không DB): `parseEnv` cho `SMTP_SECURE`/`SMTP_REQUIRE_TLS` (mặc định, production, đặt tường minh, giá trị sai); `buildSmtpTransportOptions` (secure, requireTLS, timeout 10 giây/10 giây/20 giây, auth); `isTransientMailError` (mã kết nối/timeout và SMTP 4xx là tạm thời, 5xx/xác thực/TLS không); `deliverWithRetry` (lỗi tạm thời 2 lần rồi thành công, chờ 1 giây rồi 4 giây; lỗi 5xx không retry; hết 3 lượt thì trả `false` và không ném; log có `mail`/`orderCode`/`attempt`, không có nội dung/token/link; hàm chờ được tiêm nên test chạy nhanh).
- `backend/tests/envLimits.test.ts` (unit): mặc định và biên của `GUEST_COD_HOLD_HOURS`, `GUEST_COD_MAX_OPEN`, `DATABASE_POOL_MAX`, `ANALYTICS_POOL_MAX`, `ANALYTICS_STATEMENT_TIMEOUT_MS`; ngoài phạm vi thì lỗi nêu tên biến.
- `backend/tests/guestCod.integration.test.ts` (DB thật): job hủy đơn COD khách vãng lai (47 giờ không hủy, 49 giờ hủy + hoàn kho + hoàn lượt mã + history `actorId` null + email; chạy lần hai không làm gì; không đụng đơn của khách có tài khoản, đơn đã xác nhận, đơn online); giới hạn 3 đơn đang mở theo SĐT (kể cả `+84`), theo email (không phân biệt hoa thường), đơn thứ 4 -> 409 `TOO_MANY_PENDING_ORDERS` và đặt được sau khi xác nhận/hủy 1 đơn; đơn của khách có tài khoản không bị đếm; replay `Idempotency-Key` không bị chặn; 6 request song song cùng SĐT chỉ 3 thành công; captcha tắt/bật (thiếu, sai, Cloudflare lỗi, đúng, khách đăng nhập không cần, replay với token khác vẫn 200 và không gọi verifier); phân loại analytics `expired` "Hết hạn tự động" (job COD guest và job thanh toán đều tính, hủy tay của staff cùng lý do là "Cửa hàng hủy"). `tests/testEnv.ts` đặt `GUEST_COD_MAX_OPEN=100` cho cả suite (nhiều test đặt hàng loạt đơn cùng một SĐT); file này đặt lại 3.
- `backend/tests/analyticsPool.integration.test.ts` (DB thật): `SHOW statement_timeout` = `15s` ở pool analytics và `0` ở pool chính; truy vấn `pg_sleep` thật bị hủy với timeout 1 giây và nhận diện được là `57014`; 9 endpoint analytics (kể cả `/export`) ánh xạ 57014 thành 503 `ANALYTICS_TIMEOUT`; lỗi khác vẫn 500; không đổi kết quả khi truy vấn kịp giờ.
- `backend/tests/orderStateMachine.test.ts`: ma trận cập nhật (`SYSTEM` được `PENDING -> CANCELLED`, không được `PENDING -> CONFIRMED`).
- Frontend `features/checkout/components/CheckoutView.test.tsx`: widget Turnstile chỉ hiện cho khách vãng lai khi có site key, nút Đặt hàng khóa tới khi có token, body có `captchaToken`; khách đăng nhập hoặc không có key thì không hiện và không gửi token; `CAPTCHA_FAILED` báo lỗi tiếng Việt + reset widget; gửi lại sau lỗi mạng với token mới dùng CÙNG `Idempotency-Key`; 409 `TOO_MANY_PENDING_ORDERS` hiện thông báo tiếng Việt. `AnalyticsStep3.test.tsx`: nhãn "Hết hạn tự động".
- Chưa có: kiểm SMTP qua socket thật (R-26); E2E của captcha (Turnstile cần mạng ngoài, giả lập bằng unit/integration).

### Test Đợt 1: lớp lỗi, trạng thái tải, header mobile, múi giờ (D-059)

- Vitest: `app/global-error.test.tsx` (render tiếng Việt, "Thử lại" gọi `reset`, link `/`, log `digest`); `features/catalog/components/Skeletons.test.tsx` (`loading.tsx` của `/tim-kiem` có `role=status`, `aria-busy`, chữ ẩn "Đang tải..."; KHÔNG có `loading.tsx` ở `/san-pham/[slug]` và `/danh-muc/[slug]`) và `ListingNavigation.test.tsx` (chỉ báo tải phía client: `aria-busy` + chữ ẩn "Đang tải..." khi đổi lọc/sắp xếp/trang); `app/errorMetadata.test.ts` (metadata nhánh API lỗi của `/san-pham/[slug]` và `/danh-muc/[slug]` là `noindex, nofollow`); `components/layout/MobileCategoryMenu.test.tsx` (`aria-expanded`/`aria-controls`, mở/đóng, Escape trả focus về nút, chọn link và bấm ngoài thì đóng); `lib/format.test.ts` (biên UTC `2026-11-20T18:30:00Z` -> `21/11/2026 01:30`; đã chạy với `TZ=UTC`, `America/Los_Angeles`, `Asia/Tokyo`).
- E2E `a11y.spec.ts`, mô tả "header mobile 390x844 (D-059)" (không thêm lượt đăng nhập): trang chủ không tràn ngang, mở menu Danh mục (`aria-expanded`), quét axe khi menu mở, Escape đóng và trả focus, chọn "Cà phê hạt" tới `/danh-muc/ca-phe-hat`.
- Chiều cao header ở 390x844 (đo `getBoundingClientRect`, production build, Edge): trước 165 px, sau 113 px.
- Hành vi HTTP đã kiểm tay trên production build (`curl` không theo redirect; chưa có test tự động): API sập -> 200 + ErrorState + `noindex, nofollow`, API sống lại -> trang bình thường ngay (không cache lỗi); slug sản phẩm/danh mục không tồn tại -> 404; slug cũ có bản ghi redirect (D-018) -> 308 + `Location` đúng; trang thường -> 200. Cache fetch giữ cây danh mục/sản phẩm tới hết TTL, nên khi tự kiểm phải đổi slug trước lần truy cập đầu (hoặc xóa `.next/cache/fetch-cache`).

### Kết quả kiểm tổng Đợt 1 (2026-11-21, Windows, Postgres 17 tạm, Edge)

- Backend: `lint`, `format:check`, `typecheck`, `build` sạch; `test:coverage` 83 file, 1725 test đạt; statements 96,35 %, branches 89,5 %, functions 97,5 %, lines 97,81 % (ngưỡng D-055: 94/87/95/95).
- Frontend: `lint`, `format:check`, `typecheck`, `build` sạch; `test:coverage` 97 file, 842 test đạt; statements 84,14 %, branches 78,11 %, functions 84,51 %, lines 86,75 % (ngưỡng: 81/75/81/84).
- E2E toàn bộ (`E2E_API_PORT=4100 E2E_WEB_PORT=3100 E2E_BROWSER_CHANNEL=msedge`, DB trống + seed): 31/31 đạt.
- Docker: build backend `--target runtime` và frontend thành công; `docker compose -f docker-compose.prod.yml config -q` (cả `--profile backup --profile tools`) với env giả như CI: 0; `actionlint` (Docker): 0; `.github/dependabot.yml` parse YAML được (7 mục cập nhật).
- Chạy tay trên DB tạm (không có test tự động): giới hạn 3 đơn COD guest (409, thay đổi sau khi staff xác nhận, replay Idempotency-Key trả 200 đơn cũ, khách đăng nhập không bị giới hạn); job hết hạn 48 giờ (chỉ đơn guest 49 giờ bị hủy, tồn kho +1 đúng, lý do "Quá hạn xác nhận đơn", history `actorId` null, chạy lần 2 không đổi, analytics vận hành "Hết hạn tự động" ở JSON, CSV và UI); captcha Turnstile bằng khóa thử công khai của Cloudflare (thiếu/sai token -> 400 `CAPTCHA_FAILED`, khách đăng nhập không cần); mailer (SMTP đóng: đơn vẫn 201, 3 lần thử cách 1 giây và 4 giây rồi bỏ, log không có email người nhận; mailpit nhận mail; `SMTP_REQUIRE_TLS=true` với mailpit không TLS: log lỗi STARTTLS, đơn vẫn 201); analytics 250.000 đơn với `ANALYTICS_STATEMENT_TIMEOUT_MS=1000` dưới tải 6-8 request breakdown song song: 503 `ANALYTICS_TIMEOUT` tiếng Việt, UI khối lỗi có "Thử lại", đặt hàng song song vẫn 201, timeout mặc định -> 200. Ghi chú: một request breakdown 365 ngày đơn lẻ trên 100.000 đơn chỉ khoảng 0,85 giây nên không chạm 1 giây; cần tải song song hoặc dữ liệu lớn hơn để gây timeout.
- Frontend trên production build: header mobile, chỉ báo tải (`aria-busy` true rồi false khi đổi sắp xếp và phân trang, chiều cao vùng lưới không đổi), giờ VN khi trình duyệt ở `America/Los_Angeles`, thông báo 409 ở checkout; slug không tồn tại -> 404, slug cũ -> 308. `global-error.tsx` chỉ có test render (ép lỗi layout gốc cần sửa mã nguồn).

## E2E (Playwright, chỉ chromium; chạy cục bộ và trong CI)

Cài trình duyệt một lần: `npx playwright install chromium` (trong `frontend/`).

Chạy: `npm run test:e2e` trong `frontend/`.

**Cách ly cổng (tùy chọn).** Mặc định Playwright dùng backend ở cổng 4000 và frontend ở 3000, và dùng lại server đang chạy ở các cổng đó (`reuseExistingServer`). Nếu cổng 4000/3000 đang bị một backend/frontend dev khác chiếm (có thể chạy thiếu `AUTH_RATE_LIMIT_PER_MIN=30` nên dính 429), đặt `E2E_API_PORT` và `E2E_WEB_PORT` để Playwright tự khởi động một cặp server riêng với đúng env E2E, không đụng tiến trình đang chạy:

```bash
cd frontend
E2E_API_PORT=4100 E2E_WEB_PORT=3100 npm run test:e2e
# PowerShell: $env:E2E_API_PORT=4100; $env:E2E_WEB_PORT=3100; npm run test:e2e
```

Khi đặt, backend chạy với `PORT`, `FRONTEND_ORIGINS` và `WEB_APP_URL` khớp cổng web; frontend chạy `next dev -p <E2E_WEB_PORT>` với `API_INTERNAL_URL` trỏ cổng API; `e2e/helpers.ts` gọi API ở `E2E_API_PORT`. Cặp server mới dùng chung DB dev nên phải chọn cổng chưa ai dùng. Lưu ý: nếu đã có một `next dev` khác đang chạy trong cùng thư mục `frontend/` thì Next có thể từ chối khởi động bản thứ hai (đã kiểm chứng khi cổng 3000 trống, chưa kiểm chứng khi có bản dev khác đang chạy); khi đó dừng bản dev đó hoặc chạy E2E trên bản đã dựng qua `E2E_BASE_URL`. Không đặt hai biến thì hành vi như cũ (CI không đổi).

**Trong CI (D-033, job `e2e`).** Chạy sau khi `backend` và `frontend` xanh, trên runner Linux với Chromium do Playwright cài (`npx playwright install --with-deps chromium`). Postgres và Mailpit là service của job; job `npm ci` cả hai phía, chạy `prisma generate`, `migrate deploy` và seed bằng mật khẩu GIẢ chỉ dành cho CI (đặt trong env của job, không dùng ở nơi khác). Rate limit đặt hàng/mã/quote nới lên 200/phút và nhóm auth lên 30/phút (`AUTH_RATE_LIMIT_PER_MIN`) để E2E không chạm giới hạn. Khi `CI` được đặt, Playwright không dùng lại server có sẵn, thử lại 1 lần (`retries: 1`) và xuất báo cáo HTML; job tải `playwright-report` và `test-results` lên artifact khi lỗi (giữ 7 ngày).

- `playwright.config.ts` tự khởi động backend (`npm run dev` ở `backend/`, chờ `http://127.0.0.1:4000/api/v1/health`, `JOBS_ENABLED=false`) và frontend (`npm run dev`, cổng 3000); nếu cổng đã có server thì dùng lại (`reuseExistingServer`).
- Mật khẩu tài khoản seed được đọc từ `backend/.env` ngay trong config, không hardcode và không in ra.
- Kịch bản (`frontend/e2e/`): khách vãng lai mua COD, tra cứu và hủy đơn; customer xem đơn hàng, bị chặn ở `/admin`, đăng xuất; staff xác nhận rồi hủy đơn (hoàn kho). Cùng lượt đăng nhập staff (`accounts.spec.ts`) còn kiểm khu Phân tích kinh doanh (D-049): menu admin không có mục "Phân tích", dashboard không có link "Xem phân tích chi tiết", và vào thẳng `/admin/phan-tich` thấy "Bạn không đủ quyền xem phân tích kinh doanh" (không có thẻ KPI).
- Kịch bản M6b (`frontend/e2e/m6b.spec.ts`, thêm 1 lượt đăng nhập admin, tổng 3 lượt/lần chạy): khách gửi form `/lien-he` và thấy lời cảm ơn; admin tìm tin nhắn đó ở `/admin/lien-he`, đổi trạng thái sang "Đã xử lý" và lưu; từ dashboard bấm "Xem phân tích chi tiết" sang `/admin/phan-tich` (D-049): thấy thẻ "Doanh thu", bấm preset "7 ngày" thì URL đổi sang `?from=...&to=...`, nút đó `aria-pressed` và trang không báo lỗi; cùng phiên đó (Bước 2, D-051) thấy "Cơ cấu doanh thu", bấm "Thanh toán" thì URL có `dim=paymentMethod`, thấy "Top sản phẩm" và "Top khách hàng", không khối nào lỗi hay còn loading, cùng phiên đó (Bước 3, D-052) thấy mục lục neo 7 liên kết, bấm "Tồn kho" thì URL có `#an-inventory`, thấy "Khách hàng", "Vận hành", "Tồn kho" (kèm "Số liệu hiện tại, không theo khoảng ngày."), đổi sang tab "Bán chậm" thì `aria-pressed` và hiện nhóm nút 30/60/90 ngày, không khối nào lỗi; cùng phiên đó (Bước 4, D-053) thấy khối "Mã giảm giá", bấm "Xuất CSV top sản phẩm" bằng `page.waitForEvent('download')`, tên file đúng mẫu `beanbox-top-products-<từ>_<đến>.csv`, nội dung bắt đầu bằng BOM UTF-8 và dòng tiêu đề tiếng Việt đúng (chứng tỏ tải file bằng Bearer và CSP admin không chặn); rồi chạy axe-core (`@axe-core/playwright`, như `a11y.spec.ts`) trên `/admin/phan-tich` và fail nếu có vi phạm serious/critical (không thêm lượt đăng nhập); `/admin/cai-dat` hiển thị các section (không lưu); `/admin/nguoi-dung` có `customer@beanbox.local`, chi tiết chính admin hiện ghi chú không thể tự khóa; `/chinh-sach/van-chuyen` hiển thị phí vận chuyển và trang chủ có header `content-security-policy` thực thi (D-040; không còn header report-only). Các bước vào chi tiết trong bảng admin dùng click vào link thật (không `goto`), nên phát hiện được lỗi điều hướng bị debounce kéo lại (D-035). Tin nhắn liên hệ do E2E tạo được để lại ở trạng thái "Đã xử lý" (không xóa, chấp nhận được).
- Kịch bản CSP (`frontend/e2e/csp.spec.ts`, D-040, thêm 1 lượt đăng nhập admin): storefront có CSP thực thi (`script-src 'self' 'unsafe-inline'`, không có header report-only); `/admin` có CSP với nonce theo request + `'strict-dynamic'`, không có `challenges.cloudflare.com` ở `script-src`. Chạy qua các trang chính (trang chủ, danh mục, chi tiết sản phẩm, giỏ hàng, đăng nhập, liên hệ, tra cứu đơn; dashboard, danh sách và chi tiết sản phẩm admin) và yêu cầu 0 sự kiện `securitypolicyviolation` và 0 lỗi console CSP. Chạy với bản production đã dựng bằng Docker (không khởi động webServer, bỏ qua lỗi chứng chỉ tự ký; cần `SEED_ADMIN_PASSWORD` khớp dữ liệu đã seed trên stack đó, đặt trong env hoặc `backend/.env`):
  ```bash
  cd frontend
  E2E_BASE_URL=https://localhost:8443 npx playwright test e2e/csp.spec.ts
  ```
- Kịch bản so sánh sản phẩm (`frontend/e2e/compare.spec.ts`, D-047, không đăng nhập): từ `/danh-muc/ca-phe-hat` thêm 2 sản phẩm (khác xuất xứ và mức rang, chọn từ API seed) vào so sánh, thanh đáy hiện "So sánh (2)", sang `/so-sanh?sp=...` thấy bảng 2 cột và hàng "Mức rang", bật "Chỉ hiện điểm khác nhau" (hàng "Thương hiệu" cùng giá trị biến mất), tải lại vẫn còn bảng, bỏ 1 sản phẩm thì hiện hướng dẫn chọn thêm, rồi "Xóa tất cả". Test backend tương ứng: `tests/productCompare.integration.test.ts` (thứ tự, bỏ trùng, 400, `missing`, không lộ `stock`/`description`/giá sale chưa bắt đầu, `priceRange`, header cache), cộng thêm ca slug dành riêng `compare` ở `adminProducts.integration.test.ts`.
- Kịch bản a11y (`frontend/e2e/a11y.spec.ts`, D-044, thêm 1 lượt đăng nhập customer): xem mục "Khả năng truy cập và Lighthouse".
- Kịch bản giao diện admin trên mobile (`frontend/e2e/admin-mobile.spec.ts`, D-048, thêm 1 lượt đăng nhập admin): tạo 1 đơn COD khách vãng lai qua API (`createGuestCodOrder`) để có dữ liệu chi tiết đơn, lấy id sản phẩm, mã giảm giá, người dùng, tin nhắn liên hệ từ href đầu tiên của danh sách, rồi duyệt 21 trang `/admin/**` (tổng quan, phân tích kinh doanh, đơn + chi tiết + in, sản phẩm + mới + sửa, tồn kho + lịch sử, mã giảm giá + mới + sửa, danh mục, thương hiệu, đánh giá, liên hệ + chi tiết, người dùng + chi tiết, cài đặt, nhật ký) ở 390x844 và 768x1024, khẳng định `scrollWidth <= clientWidth` (không dung sai; khẳng định mềm nên một lần chạy liệt kê mọi trang lỗi kèm phần tử gây tràn). Ở 390 còn kiểm menu admin mở được và link nằm trong viewport, nút "Thêm sản phẩm" hiện đủ, hộp thoại điều chỉnh tồn kho vừa màn hình. Để tái hiện lỗi chuỗi dài, chạy spec trên DB tạm đã UPDATE sẵn email/slug/SKU/mã giảm giá thành chuỗi dài không khoảng trắng (không làm trên DB dev).
- Form liên hệ giới hạn 3 lần/10 phút/IP: chạy E2E quá 3 lần trong 10 phút sẽ gặp 429 ở kịch bản liên hệ; khởi động lại backend để xóa bộ đếm.
- Test dùng DB dev: mỗi lần chạy tạo đơn mới (dùng email/SĐT ngẫu nhiên) và hủy lại để hoàn kho. Nếu test chết giữa chừng có thể còn đơn `CONFIRMED`/`PENDING`: hủy ở `/admin/don-hang`.
- Máy chặn chạy file tải về (Windows "Application Control policy has blocked this file"): đặt `E2E_BROWSER_CHANNEL=msedge` (hoặc `chrome`) để dùng trình duyệt Chromium đã cài sẵn.

### Lưu ý rate limit

Mỗi lần chạy E2E đầy đủ có 6 lượt đăng nhập (accounts 2, m6b 1, csp 1, a11y 1, admin-mobile 1). Limiter nhóm auth mặc định 5/phút/IP (`AUTH_RATE_LIMIT_PER_MIN`, D-045) nên Playwright khởi động backend với `AUTH_RATE_LIMIT_PER_MIN=30` (CI job `e2e` cũng đặt 30): chạy lại liên tiếp hoặc CI thử lại cả bộ không còn dính 429 đăng nhập. Nếu dùng lại backend dev đang chạy sẵn (`reuseExistingServer`) thì backend đó phải chạy với biến này (đặt trong `backend/.env`), nếu không vẫn bị giới hạn 5/phút.
Ngoài ra backend có giới hạn chung 100 request/phút/IP cho `/api/v1` (`GENERAL_RATE_LIMIT_PER_MIN`). Playwright khởi động backend với `GENERAL_RATE_LIMIT_PER_MIN=1000` (CI cũng đặt) nên chạy cả bộ liền một mạch không chạm giới hạn này. Nếu dùng lại backend dev đang chạy sẵn (`reuseExistingServer`) thì backend đó phải được chạy với biến này (đặt trong `backend/.env`), nếu không `m6b.spec.ts` có thể gặp 429 ở `/admin/users`.

Đăng nhập giới hạn 5 lần/phút/IP ở production, E2E dùng 30 (`api-contract.md` §1); tra cứu đơn guest 10/phút; đặt đơn 10/phút. E2E chạy tuần tự (`workers: 1`) và chỉ đăng nhập ít lần mỗi spec (mỗi spec admin 1 lượt). Chạy lại liên tiếp nhiều lần có thể gặp `429 RATE_LIMITED`: chờ khoảng 1 phút hoặc khởi động lại backend (bộ đếm nằm trong bộ nhớ). Form liên hệ (`POST /contact`) giới hạn 3 lần/10 phút/IP: kịch bản nào gửi form liên hệ thì chạy lặp lại sẽ gặp 429, cần chờ hoặc khởi động lại backend. CSP đã thực thi từ M8 (D-040) nên vi phạm CSP làm vỡ trang thật và `csp.spec.ts` sẽ báo; log `warn` của backend (`POST /csp-report`) cũng ghi vi phạm.

## Khả năng truy cập và Lighthouse

Chuẩn: WCAG 2.1 mức AA cho storefront (không gồm `/admin`). Quyết định ở D-044.

### Axe tự động (chạy trong E2E và CI)

`frontend/e2e/a11y.spec.ts` dùng `@axe-core/playwright` (ghim 4.14.0) với tag `wcag2a, wcag2aa, wcag21a, wcag21aa`, quét 18 trang (thêm `/so-sanh?sp=<2 slug seed>` và danh mục khi thanh so sánh đang hiện): `/`, danh mục, chi tiết sản phẩm, `/tim-kiem?q=phin`, giỏ hàng (trống và có hàng), thanh toán (có hàng), đăng nhập, đăng ký, quên mật khẩu, tra cứu đơn, liên hệ, chính sách vận chuyển, giới thiệu, trang 404, và `/tai-khoan` + `/tai-khoan/don-hang` (1 lượt đăng nhập customer). Slug sản phẩm lấy từ API seed (`findStockedProduct`); giỏ có hàng tạo qua API rồi nạp token vào `localStorage`. Vi phạm impact `serious`/`critical` làm test FAIL (in rõ quy tắc, nút lỗi); `moderate`/`minor` chỉ `console.log` (dòng `a11y <trang>: ...`, xem bằng `--reporter=line` hoặc báo cáo HTML). Lệnh (trong `frontend/`, cần backend + seed như E2E):

```bash
npx playwright test e2e/a11y.spec.ts
```

Axe không bắt được thứ tự tiêu đề hợp lý, ngữ nghĩa combobox, focus trap và nội dung alt có ý nghĩa; những điểm đó đã rà bằng mã nguồn ở D-044 và nên rà lại khi thêm thành phần tương tác mới (dialog, combobox, form).

### Lighthouse (đo thủ công, không đưa vào CI)

Chạy trên BẢN PRODUCTION BUILD, không phải `npm run dev`:

```bash
# backend (một terminal): JOBS_ENABLED=false GENERAL_RATE_LIMIT_PER_MIN=1000 npm run dev  (trong backend/)
cd frontend && npm run build && npm start        # cổng 3000
# Windows + Edge cài sẵn (Chromium tải về có thể bị Application Control chặn):
export CHROME_PATH="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
npx lighthouse@13.6.0 "http://localhost:3000/danh-muc/ca-phe-hat"   --output=json --output=html --output-path=<thư-mục-tạm>/ten-bao-cao   --chrome-flags="--headless" --port=9333 --quiet            # mobile (mặc định)
# thêm --preset=desktop cho desktop
```

`--port=9333` (cổng debug cố định) là bắt buộc với Edge trên máy này: không có thì chrome-launcher báo "waiting for dynamic debugging port". Không thêm `lighthouse` vào `package.json`; lưu báo cáo ngoài repo. Lighthouse để lại thư mục `lighthouse.*` trong thư mục Temp của Windows (không xóa được ngay do Edge còn giữ), dọn tay sau.

Kết quả SAU khi sửa (đo 2026-11-20; máy local Windows 11, Node 24, Edge headless, production build, backend dev + Postgres Docker local + dữ liệu seed, throttling mặc định của Lighthouse 13.6.0: mobile = Slow 4G + CPU 4x, desktop = preset desktop; mỗi ô là 1 lần đo). Mỗi ô: Performance / Accessibility / Best Practices / SEO.

| Trang                             | Mobile            | Desktop           |
| --------------------------------- | ----------------- | ----------------- |
| `/`                               | 100 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| `/danh-muc/ca-phe-hat`            | 92 / 100 / 100 / 100  | 100 / 100 / 100 / 100 |
| `/san-pham/ethiopia-yirgacheffe-washed` | 100 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| `/tim-kiem?q=phin`                | 95 / 100 / 100 / 66   | 100 / 100 / 100 / 66  |
| `/lien-he`                        | 100 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |

SEO 66 ở `/tim-kiem` là chủ ý: trang có `noindex` (kiểm "không lập chỉ mục" ở `noindex.test.ts`), Lighthouse báo `is-crawlable`. Điểm Performance DAO ĐỘNG giữa các lần đo (vài điểm, LCP mobile của trang danh sách từ 2.9 đến 3.5 giây giữa các lần) do mô phỏng throttling, tải máy và cache; vì vậy không đặt ngưỡng cứng trong CI, chỉ dùng làm tham chiếu. Điểm trước khi sửa và các mục không sửa: D-044.

## Kiểm thử Docker production cục bộ

Kiểm bản production (`docker-compose.prod.yml`) trên máy dev trước khi deploy; cách dựng và các lưu ý (cổng 8080/8443, `-p beanbox-local`, `curl -k`, `MSYS_NO_PATHCONV=1` trên Git Bash) xem [`deployment.md`](deployment.md) mục 15. Đặt thêm `EDGE_RATE_API_PER_MIN=20` trong `.env.production` để thử rate limit nhanh. Các bước smoke (thay cổng nếu khác):

1. **Health:** `docker compose -p beanbox-local --env-file .env.production -f docker-compose.prod.yml ps` thấy `db`, `backend`, `frontend`, `caddy` đều `healthy`. `curl -k https://localhost:8443/api/v1/health` trả 200 (`db: "up"`), `curl -k https://localhost:8443/api/v1/health/live` trả 200, `curl -k https://localhost:8443/healthz` trả `{"status":"ok"}`.
2. **Header:** `curl -kI https://localhost:8443/` có `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy` và `Content-Security-Policy` (đầy đủ, thực thi, có `report-uri`); KHÔNG có `Content-Security-Policy-Report-Only` và KHÔNG có header `Server`; response từ backend (`/api/v1/*`) có `X-Request-Id`, còn trang HTML và `/healthz` KHÔNG có header này (Caddy chỉ gửi `X-Request-Id` lên upstream và ghi `request_id` vào log). `/admin` có CSP với `nonce-...` khác nhau mỗi request: `for i in 1 2; do curl -skI https://localhost:8443/admin | grep -i '^content-security-policy'; done` cho hai giá trị nonce khác nhau.
3. **Rate limit edge:** gửi liên tiếp vượt ngưỡng tới endpoint không bị limiter backend, ví dụ với `EDGE_RATE_API_PER_MIN=20`:
   ```bash
   for i in $(seq 1 40); do curl -sk -o /dev/null -w "%{http_code}\n" https://localhost:8443/api/v1/health/live; done | sort | uniq -c
   ```
   Kỳ vọng khoảng 20 phản hồi 200 rồi các phản hồi 429; xem `curl -ski https://localhost:8443/api/v1/health/live` trong lúc bị chặn: 429 có `Retry-After` và thân JSON `RATE_LIMITED` theo format lỗi §1. Chờ 1 phút (hoặc `restart caddy`) để bộ đếm về 0.
4. **XFF giả:** `curl -sk -o /dev/null -w "%{http_code}\n" -H 'X-Forwarded-For: 1.2.3.4' https://localhost:8443/api/v1/health/live` lặp lại vượt ngưỡng: đổi giá trị `X-Forwarded-For` KHÔNG làm bộ đếm reset (Caddy bỏ XFF do client gửi và dùng IP kết nối thật). Đối chiếu log: `logs caddy` và `logs backend` cho cùng một request qua `request_id` (Caddy) và `reqId` (backend); IP trong log là IP kết nối thật, không phải `1.2.3.4`.
5. **Giới hạn body:** `POST` thân hơn 1 MB tới `/api/v1/...` bị Caddy chặn (JSON `VALIDATION_ERROR`), tới `/api/v1/admin/uploads*` ngưỡng là 6 MB (`PAYLOAD_TOO_LARGE`).
6. **Backup/restore cục bộ:** chạy `backup.sh` một lần (xem `deployment.md` mục 11), kiểm có `backups/db/beanbox-*.dump` và `backups/uploads/uploads-*.tar.gz`, rồi restore vào DB tạm `beanbox_restore_test` và `\dt` thấy bảng (lệnh đầy đủ ở mục 11); xóa DB tạm sau khi kiểm.
7. **Backup off-site với remote local:** chạy `selftest-offsite.sh` (lệnh ở `deployment.md` mục 11, bước "Thiết lập" số 5): mọi mục phải PASS, thoát 0. Selftest gồm cả mục (h) khóa chống chạy chồng (D-042): có tiến trình giữ `backups/.backup.lock` thì `backup.sh` thoát 5, không tạo dump, không gọi heartbeat; nhả khóa thì chạy lại thoát 0. Rồi thử vòng thật với remote là một thư mục local (khai báo remote rclone kiểu `local`, một public key age tạo bằng `age-keygen` của image backup): `backup.sh` -> thư mục `<TS>/` có hai file `.age` và `SHA256SUMS` -> `fetch-remote.sh <TS>` kèm khóa bí mật -> `restore.sh` vào DB tạm như bước 6. Sửa 1 byte file `.age` trên remote thì `fetch-remote.sh` phải dừng (mã 3) và không giải mã.
8. **Redirect cổng:** `curl -sI http://localhost:8080/` trả 308 với `Location: https://localhost:8443/` (D-037).
9. **Giám sát:** `sh deploy/monitoring/check.sh --insecure --min-tls-days 0 https://localhost:8443` in `OK` cho cả ba mục (health có `"db":"up"`, trang chủ có từ khóa, TLS) và thoát 0 (`deployment.md` mục 16).
10. **CSP trên bản production:** chạy `e2e/csp.spec.ts` như ở mục E2E (`E2E_BASE_URL=https://localhost:8443`).
11. **Dọn dẹp:** `docker compose -p beanbox-local --env-file .env.production -f docker-compose.prod.yml down -v`.

## CI: ops-lint và image backup

- Job `docker` build thêm image backup (`deploy/backup`) bên cạnh backend, frontend, Caddy; không push. Job có service `postgres:17` (giá trị giả chỉ dành cho CI) và, sau bước smoke image, chạy `selftest-offsite.sh` BÊN TRONG image backup vừa build (`--network host`, PG* trỏ `localhost:5432`, mount `deploy/backup` chỉ đọc; D-043). Mọi mục phải PASS (hiện 46 PASS, 0 FAIL). Vì vậy đổi phiên bản rclone ghim trong Dockerfile (D-041) được CI kiểm tự động.
- Job `ops-lint` kiểm các file vận hành mà test code không phủ: `shellcheck` cho script shell trong `deploy/` và `docker compose config` cho các file compose. Xem định nghĩa chính xác trong `.github/workflows/ci.yml`. Chạy cục bộ tương đương: `shellcheck deploy/backup/*.sh deploy/monitoring/check.sh` và `docker compose --env-file .env.production -f docker-compose.prod.yml config -q`.

## Quét secret (gitleaks)

Job CI `secret-scan` quét toàn bộ lịch sử git bằng gitleaks (Docker image ghim phiên bản) với cấu hình `.gitleaks.toml` (rule mặc định cộng allowlist chỉ cho các giá trị mẫu/giả đã biết, theo cặp đường dẫn + giá trị). Chạy cục bộ tương đương (cần Docker; thư mục repo gắn chỉ đọc):

```bash
docker run --rm --entrypoint sh \
  -v "$PWD:/repo:ro" \
  zricethezav/gitleaks:v8.30.0 \
  -c 'git config --global --add safe.directory /repo && gitleaks git --config /repo/.gitleaks.toml --redact --no-banner --verbose /repo'
```

Trên Git Bash của Windows thêm `MSYS_NO_PATHCONV=1` trước `docker run`. Mã thoát khác 0 nghĩa là có phát hiện (giá trị đã được che bằng `--redact`). Chỉ thêm vào allowlist khi chắc đó là giá trị giả, và luôn theo cặp đường dẫn + giá trị.

## Kiểm drift migration

Job `backend` chạy `prisma migrate diff` để bắt trường hợp sửa `schema.prisma` mà quên tạo migration. Prisma 7 bỏ cờ `--shadow-database-url` và đổi `--to-schema-datamodel` thành `--to-schema`: DB shadow lấy từ biến `SHADOW_DATABASE_URL` qua `backend/prisma.config.ts` (phải khác DB chính, nếu trùng Prisma báo lỗi P3025). Chạy cục bộ với một Postgres tạm (không đụng DB dev):

```bash
docker run -d --name bb-drift -e POSTGRES_PASSWORD=drift -p 55432:5432 postgres:17
# chờ vài giây cho Postgres sẵn sàng, rồi:
docker exec bb-drift psql -U postgres -c 'CREATE DATABASE beanbox_main' -c 'CREATE DATABASE beanbox_shadow'
cd backend
DATABASE_URL=postgresql://postgres:drift@localhost:55432/beanbox_main \
SHADOW_DATABASE_URL=postgresql://postgres:drift@localhost:55432/beanbox_shadow \
npx prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema prisma/schema.prisma \
  --exit-code
echo "exit=$?"
docker rm -fv bb-drift
```

Mã thoát `0` là khớp; `2` là drift (migrations khác `schema.prisma`: tạo migration mới bằng `npm run prisma:migrate`); mã khác là lỗi chạy lệnh. Mật khẩu `drift` chỉ dành cho container tạm này.

## Dữ liệu demo lớn, hiệu năng và kiểm tra khu phân tích (D-054)

### Sinh dữ liệu demo (cho đo hiệu năng và ảnh README)

`backend/scripts/generate-demo-orders.ts` sinh đơn hàng bằng SQL tập hợp theo lô (`generate_series` + `INSERT ... SELECT`, không lặp từng đơn): đơn, dòng hàng (1-5 dòng, biến thể seed), `Payment`, `OrderStatusHistory` (đúng cách mã thật ghi, gồm 3 loại hủy: khách, cửa hàng, hết hạn dùng `EXPIRE_REASON`), user CUSTOMER giả (`demo.khachN@example.com`), khách vãng lai, mã giảm giá seed, COD/VNPAY/STRIPE, rải theo ngày giờ VN, `shippingAddress` có `provinceCode/provinceName` thật từ dữ liệu địa điểm. Không cập nhật tồn kho, `InventoryMovement`, `soldCount`, `CouponRedemption` (dữ liệu demo, không khớp sổ kho). Nhận dạng: `Order.idempotencyKey LIKE 'demo-%'`; `--reset` xóa đúng các dòng đó.

```bash
# 1. DB tạm (KHÔNG dùng DB dev), cổng khác 5432, shm đủ cho truy vấn song song
docker run -d --name bb-tmp-perf --shm-size=256m -e POSTGRES_USER=beanbox -e POSTGRES_PASSWORD=tmp-pw   -e POSTGRES_DB=beanbox_perf -p 127.0.0.1:55442:5432 postgres:17
# 2. migrate + seed trên DB tạm
cd backend
DATABASE_URL=postgresql://beanbox:tmp-pw@127.0.0.1:55442/beanbox_perf npx prisma migrate deploy
DATABASE_URL=postgresql://beanbox:tmp-pw@127.0.0.1:55442/beanbox_perf npx prisma db seed
# 3. sinh dữ liệu (chỉ đọc DEMO_DATABASE_URL)
DEMO_DATABASE_URL=postgresql://beanbox:tmp-pw@127.0.0.1:55442/beanbox_perf   npx tsx scripts/generate-demo-orders.ts --orders 100000 --days 365 --seed 42   # [--reset] [--batch N]
# 4. xong việc
docker rm -fv bb-tmp-perf
```

Rào an toàn (`backend/scripts/demoDbGuard.ts`, test `backend/tests/demoDbGuard.test.ts`): từ chối khi thiếu `DEMO_DATABASE_URL`, `NODE_ENV=production`, trùng `DATABASE_URL` (môi trường hoặc `backend/.env`), hoặc localhost cổng 5432; không in URL/mật khẩu. Script nằm ngoài `tsconfig.build.json` và `.dockerignore`, không vào build và image. Quy mô đã chạy: 100.000 đơn, 294.111 dòng hàng, 9.167 user demo, 365 ngày, trong khoảng 44 giây (máy dưới). Phân bố: DELIVERED ~86%, CANCELLED ~9,8%, RETURNED ~2,9%, còn lại đơn đang xử lý; COD 50%, VNPAY 30%, STRIPE 20%; ~26% đơn có mã giảm giá.

### Đo hiệu năng (Postgres 17.11, 100.000 đơn / 294.111 dòng hàng / 365 ngày)

Máy: Intel i5-13450HX, 16 luồng, 8 GB RAM khả dụng, Windows 11, Postgres 17 trong Docker (shared_buffers 128MB, work_mem 4MB mặc định), backend `tsx` cục bộ, đo HTTP thật có Bearer ADMIN, 7 lần sau 1 lần làm nóng, lấy trung vị (p50). "Trước" = mã ở HEAD của Bước 4; "Sau" = mã Bước 5. Khoảng 30 ngày và 365 ngày kết thúc hôm nay. Máy cá nhân có nhiễu +-30%, đọc theo bậc độ lớn.

| Endpoint | Khoảng | Trước (ms) | Sau (ms) |
| --- | --- | ---: | ---: |
| `inventory` | (không theo khoảng) | 453 | 102 |
| `export:inventory(slowMovers)` | (không theo khoảng) | 453 | 141 |
| `overview` | 30 ngày | 27 | 40 |
| `overview` | 365 ngày | 62 | 54 |
| `breakdown:category` | 30 ngày | 273 | 170 |
| `breakdown:category` | 365 ngày | 1242 | 890 |
| `breakdown:brand` | 30 ngày | 237 | 154 |
| `breakdown:brand` | 365 ngày | 1174 | 812 |
| `breakdown:paymentMethod` | 30 ngày | 19 | 18 |
| `breakdown:paymentMethod` | 365 ngày | 29 | 23 |
| `breakdown:shippingMethod` | 30 ngày | 17 | 20 |
| `breakdown:shippingMethod` | 365 ngày | 30 | 24 |
| `breakdown:province` | 30 ngày | 26 | 22 |
| `breakdown:province` | 365 ngày | 53 | 42 |
| `top-products:revenue` | 30 ngày | 64 | 55 |
| `top-products:revenue` | 365 ngày | 409 | 404 |
| `top-products:quantity` | 30 ngày | 63 | 52 |
| `top-products:quantity` | 365 ngày | 386 | 400 |
| `top-customers:revenue` | 30 ngày | 38 | 35 |
| `top-customers:revenue` | 365 ngày | 179 | 174 |
| `top-customers:orders` | 30 ngày | 32 | 32 |
| `top-customers:orders` | 365 ngày | 170 | 242 |
| `customers` | 30 ngày | 64 | 88 |
| `customers` | 365 ngày | 62 | 77 |
| `operations` | 30 ngày | 323 | 104 |
| `operations` | 365 ngày | 327 | 132 |
| `coupons` | 30 ngày | 41 | 18 |
| `coupons` | 365 ngày | 55 | 65 |
| `export:top-products(200)` | 30 ngày | 63 | 64 |
| `export:top-products(200)` | 365 ngày | 412 | 434 |
| `export:operations` | 30 ngày | 327 | 81 |
| `export:operations` | 365 ngày | 326 | 150 |

Thay đổi truy vấn (kết quả không đổi; test tích hợp hiện có giữ nguyên và đều qua):

- `inventory`: "lần bán cuối" từ subquery tương quan theo từng biến thể thành một `LEFT JOIN` gộp một lần (453 -> 102 ms).
- `operations` ("đơn cần hoàn tiền", `ordersNeedingRefund`): đi từ `Payment SUCCEEDED` rồi `GROUP BY ... HAVING` thay cho `EXISTS` + `COUNT(*)` theo từng đơn (327 -> 132 ms ở 365 ngày).
- `breakdown` chiều danh mục/thương hiệu: tổng toàn tập đếm số đơn bằng `EXISTS` trên `Order` thay `COUNT(DISTINCT)` trên phép nối, hai truy vấn chạy song song (1242 -> 890 ms).
- `docker-compose*.yml`: `shm_size: 256mb` cho `db` (mặc định 64MB gây lỗi "could not resize shared memory segment" với truy vấn song song ở dữ liệu lớn).

Còn trên 300 ms ở 365 ngày: `breakdown` danh mục/thương hiệu (~0,8-0,9 s) và `top-products` (~0,4 s). Nguyên nhân (EXPLAIN ANALYZE): khoảng 365 ngày chứa ~87% số đơn nên `Seq Scan` trên `Order`/`OrderItem` là đúng; chi phí chính là `COUNT(DISTINCT o.id)` buộc sắp xếp ~250.000 dòng ra đĩa (`Sort Method: external merge Disk: ~15-24MB`, work_mem 4MB); bỏ `COUNT(DISTINCT)` thì `top-products` còn ~56 ms. Đã thử trên DB tạm: index một phần `Order("paidAt") INCLUDE (status) WHERE "paymentStatus" = 'PAID'` và index phủ `OrderItem("orderId") INCLUDE ("productId","lineTotal","quantity")` -> planner không dùng, thời gian không đổi (925 -> 950 ms); viết lại gộp theo (đơn, nhóm) hoặc đếm đơn chỉ cho top-N đều không nhanh hơn qua HTTP (thậm chí chậm hơn với top-N tương quan: 2,2 s), nên không áp dụng. Các ứng viên khác (`lower("contactEmail")`, `OrderStatusHistory(orderId, toStatus, createdAt)`, `Order(couponId, paidAt)`) phục vụ truy vấn đã dưới 250 ms nên chưa đáng chi phí ghi. **Không thêm migration, không đổi `db-schema.md`.** EXPLAIN thô nằm ở scratchpad của phiên làm việc, không commit.

Giới hạn quy mô: dưới ~100.000 đơn/năm mọi endpoint dưới 1 s ở khoảng 365 ngày, các endpoint chính dưới 300 ms. Khi p50 của breakdown/top-products ở 365 ngày vượt ~1 s (khoảng 150.000-200.000 đơn/năm) hoặc cần xuất nhiều báo cáo đồng thời, thêm bảng tổng hợp theo ngày (doanh thu, đơn, số lượng theo danh mục/thương hiệu/sản phẩm/phương thức) cập nhật khi đơn đổi trạng thái hoặc bằng job đêm.

### A11y, mobile và bản in khu phân tích

- Kiểm tay trên DB 100.000 đơn (axe với tag `wcag2a, wcag2aa, wcag21a, wcag21aa` + đo `scrollWidth <= clientWidth`) ở 1440, 768, 390px, khoảng 365 ngày, cả khi mở "Xem dạng bảng" và ở từng tab tồn kho (Hết hàng, Sắp hết, Bán chậm): 50 kiểm tra, 0 vi phạm, không cuộn ngang. Rà thêm: thứ tự heading h1 -> h2 khối -> h3 (khối lỗi dùng `ErrorState headingLevel={3}` nên không nhảy cấp), mục lục là `nav` có `aria-label`, mọi link neo tới id tồn tại, Enter trên link chuyển focus tới heading đích (`tabIndex={-1}`), nhãn nút xuất duy nhất (9 nhãn), mọi nhóm nút có `aria-pressed`.
- Lựa chọn (D-054): mở rộng quét axe sẵn có trong `frontend/e2e/m6b.spec.ts` (phiên admin đã đăng nhập; thêm 390px, bảng thay thế, các tab tồn kho, kiểm không tràn ngang) thay vì `a11y.spec.ts` (chỉ storefront, D-044; thêm lượt đăng nhập admin sẽ chạm rate limit đăng nhập).
- Bản in (`print:` Tailwind + khối `@media print` trong `globals.css`): ẩn header/footer site, menu admin, mục lục, bộ lọc, mọi nút (xuất CSV, làm mới, preset, đổi chiều/sort/tab), bỏ `overflow`/`max-h` của bảng và biểu đồ, thẻ `break-inside: avoid`, chữ đen. Kiểm bằng Playwright `emulateMedia({ media: 'print' })` + ảnh chụp: còn tiêu đề, dòng "Từ dd/mm/yyyy đến dd/mm/yyyy", KPI, biểu đồ SVG, bảng đầy đủ; không có nút. Không có nút "In" (dùng Ctrl+P).

## Chụp ảnh màn hình cho README

Ảnh trong `docs/screenshots/` do script Playwright riêng (`npm run screenshots` trong `frontend/`, config `playwright.screenshots.config.ts`) tạo ra, không phải E2E và không chạy trong CI. Script chỉ chạy trên DB tạm vừa seed; cách chạy ở [docs/screenshots/README.md](screenshots/README.md).
