# Kiểm thử BeanBox

## Yêu cầu chung

- Node >= 22, đã `npm install` trong `backend/` và `frontend/`.
- Prisma 7: sau mỗi lần `npm install`/`npm ci` (và khi sửa `schema.prisma`) chạy `npx prisma generate` trong `backend/` để sinh client vào `backend/src/generated/prisma` (thư mục bị ignore, không commit; không có thì typecheck/test/dev đều lỗi). Cấu hình CLI nằm ở `backend/prisma.config.ts` (tự nạp `.env`, không ghi đè biến đã đặt; `SHADOW_DATABASE_URL` tùy chọn).
- Docker Postgres chạy (`docker compose up -d db`), đã migrate: `npm run prisma:migrate` (hoặc `prisma migrate deploy`) trong `backend/`.
- Prisma 7 không còn tự generate hay seed sau `migrate dev`/`migrate reset`: `npm run prisma:migrate` đã nối thêm `prisma generate`, `npm run db:reset` nối thêm `prisma generate` và `prisma db seed`; nếu gọi `npx prisma migrate ...` trực tiếp thì tự chạy `npx prisma generate` và `npm run prisma:seed`.
- Dữ liệu seed cho E2E: `npm run prisma:seed` trong `backend/` (idempotent; từ chối chạy khi `NODE_ENV=production`).
- Test, E2E và CI luôn dùng seed CƠ BẢN (`prisma:seed`). Seed nhiều (`npm run seed:rich`, D-084) chỉ cho demo/dev, xem mục "Dữ liệu mẫu: seed cơ bản và seed nhiều" bên dưới.
- `backend/.env` có `SEED_ADMIN_PASSWORD`, `SEED_STAFF_PASSWORD`, `SEED_CUSTOMER_PASSWORD` (xem `.env.example`).

## Nguyên tắc kiểm thử

- Mỗi thay đổi: lint, typecheck, `format:check`, test kèm coverage (ngưỡng D-055), build ở cả backend và frontend; E2E khi đụng luồng người dùng; migration mới thì deploy và kiểm drift trên Postgres tạm.
- Không dùng giá trị ngẫu nhiên không kiểm soát trong assertion: tiêm đồng hồ hoặc bộ sinh số, hoặc kiểm tính chất đúng với mọi giá trị. Ví dụ tạo mã sai phải tất định (không "mã 000000, nếu trùng thì 000001").
- Không dùng `instanceof`/`toBeInstanceOf` với `Blob`/`Response`/`File`/`Request` (jsdom và undici dùng lớp khác nhau); kiểm `headers.get(...)` và nội dung.
- Test tích hợp và E2E chỉ chạy trên DB tạm có tên kết thúc bằng `_test` hoặc DB riêng của E2E, không dùng DB dev; công cụ sinh dữ liệu và chụp ảnh từ chối chạy khi trỏ `localhost:5432`.
- Cổng thanh toán giả và vận chuyển giả chỉ bật bằng cờ tường minh, không bao giờ ở production, và đi qua đúng logic xử lý như bản thật (không đường tắt DB).
- Docker: chỉ thao tác đúng project/volume của mình (`-p`, `down -v --rmi local`), không dùng lệnh prune toàn cục.
- Số liệu và kết quả trong tài liệu phải là số đã đo; không ước lượng hay bịa.

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

### Test Đợt 2 mục 1: thanh toán giả lập và chuyển khoản VietQR (D-060, D-061)

- `backend/tests/vietqr.test.ts` (unit, không DB): CRC16-CCITT với vector chuẩn "123456789" -> `29B1`; hai payload cố định (có và không có nội dung) so khớp từng ký tự; cấu trúc TLV (thứ tự `00,01,38,53,54,58,62,63`, độ dài từng trường); `verifyVietQrCrc` bắt payload bị sửa; từ chối BIN/số tài khoản/số tiền sai; `sanitizeContent` (bỏ dấu, ký tự lạ, cắt độ dài); `qrPngDataUrl` bắt đầu bằng chữ ký PNG.
- `backend/tests/momoMock.test.ts` (unit): ký/kiểm MoMo (thứ tự khóa, giá trị thô, bỏ khóa lạ, `timingSafeEqual`, sai khóa/sai trường), dựng URL/IPN/return; ký callback VNPay giả (mã `00/00`, `51/02`, `24/02`).
- `backend/tests/paymentsConfig.test.ts` (thêm): `parseEnv` cho `PAYMENT_MOCKS_ENABLED` (từ chối cùng `NODE_ENV=production`, cùng `VNPAY_TMN_CODE`, secret < 16 ký tự; tự sinh secret khi trống), `BANK_TRANSFER_HOLD_HOURS` (biên 1..72), `getPaymentConfig` với mock (VNPay giả, MoMo giả, `vnp_ReturnUrl` theo `WEB_APP_URL` bỏ qua `VNPAY_RETURN_URL` đặt sẵn), `isProviderEnabled`; cấu hình mặc định vẫn là `{ vnpay: null, stripe: null }`.
- `backend/tests/paymentsDemo.integration.test.ts` (DB thật, 38 test): VNPay giả đầu-cuối qua `/payments/vnpay/create` -> `/mock-gateway/vnpay/complete` (success/failed/cancel, gọi lặp idempotent, chữ ký sai/`TmnCode` lạ, số tiền lệch, router 404 khi cờ tắt); MoMo giả (create, IPN thật gồm chữ ký sai/không thấy giao dịch/lệch tiền/lặp, return chỉ đọc, `complete`); chuyển khoản: tạo đơn (hạn giữ `BANK_TRANSFER_HOLD_HOURS`, `canPay` false), giới hạn khách vãng lai `TOO_MANY_PENDING_ORDERS` cho đơn chuyển khoản (đơn COD/MoMo không tính chung), `GET .../bank-transfer` (QR hợp lệ theo `verifyVietQrCrc`, `isDemo`, quyền chủ đơn/SĐT, 404 khi sai SĐT, 409 `PAYMENT_NOT_ALLOWED` theo `reason`), `claim` (chỉ ghi `transferClaimedAt`, lặp giữ mốc cũ, KHÔNG đổi `paymentStatus`), `POST /admin/orders/:code/bank-transfer/confirm` (Staff được, customer 403, đơn PENDING_PAYMENT -> CONFIRMED/PAID, lặp idempotent, đơn đã hủy -> cần hoàn tiền, đơn không phải chuyển khoản 409, audit `payment.bank_transfer_confirm`), bộ lọc `transferClaimed`.
- `backend/tests/settingsSchema.test.ts`, `adminSettings.integration.test.ts` (thêm/đổi): key `payment.bankTransfer` (BIN 6 chữ số, số tài khoản 6-19, tên không ký tự điều khiển); `GET/PUT /admin/settings` giờ có 9 key và `GET /settings/public` KHÔNG lộ thông tin ngân hàng.
- `backend/tests/securityAuthz.integration.test.ts` (đổi): ma trận phân quyền phân loại các route mới (`momo/ipn`, `momo/return` PUBLIC; `momo/create`, `GET orders/:code/bank-transfer`, `POST orders/:code/bank-transfer/claim` OPTIONAL; route admin confirm nằm trong nhóm Staff).
- Frontend (Vitest): `features/payments/components/MockGatewayView.test.tsx` (cảnh báo giả lập, mã đơn/số tiền, gửi NGUYÊN tham số + kết quả đúng từng nút, `returnUrl` lạ bị chặn, 400/404, liên kết thiếu chữ ký), `features/payments/redirect.test.ts` (`goToPayment` https-only + ngoại lệ cùng origin `/cong-thanh-toan-gia-lap/*`, `isMockGatewayUrl`, `safeResultPath`), `BankTransferPanel.test.tsx` (QR có `alt`, cảnh báo demo, sao chép, claim thành công/lỗi, tải lỗi + thử lại), `OrderSuccess.test.tsx` (đơn chuyển khoản hiện QR, đơn đã thanh toán không hiện), `CheckoutView.test.tsx` (MoMo/chuyển khoản + chip "Giả lập" chỉ khi quote có, đặt đơn chuyển khoản không gọi `/payments/*` và không redirect), `PaymentResultView.test.tsx` (MoMo: chỉ chuyển khóa MoMo, thiếu chữ ký), `features/admin/components/OrderPayments.bank.test.tsx` (hộp xác nhận hai bước, lỗi, đơn đã hủy, ẩn khi PAID/COD), `settingsForm.test.ts` (`validateBank`/`buildBankPatch`), `orderFilters.test.ts` (`transferClaimed`, phương thức mới), `AdminSettings.test.tsx`, `app/noindex.test.ts` (hai trang cổng giả). Không dùng `instanceof`/`toBeInstanceOf` với `Blob`/`Response`/`File`/`Request` (jsdom và undici dùng lớp khác nhau).
- E2E (cần backend có `PAYMENT_MOCKS_ENABLED=true` và `BANK_TRANSFER_ENABLED=true`; `playwright.config.ts` đã đặt cho backend nó khởi động, job `e2e` của CI không cần đổi): `frontend/e2e/payments-demo.spec.ts` (không đăng nhập): khách vãng lai mua qua VNPay giả và qua MoMo giả đến "Thanh toán thành công"; VNPay giả "Hủy giao dịch" không báo thành công; chuyển khoản hiện QR + cảnh báo demo, "Tôi đã chuyển khoản" xong tra cứu vẫn "Chờ thanh toán" (rồi hủy đơn qua API để hoàn kho). `frontend/e2e/m6b.spec.ts` thêm một kịch bản (thêm 1 lượt đăng nhập admin, tổng 4 lượt): đơn chuyển khoản khách đã báo xuất hiện ở bộ lọc "Khách báo đã chuyển khoản", admin xác nhận hai bước, đơn thành "Đã thanh toán"; kịch bản này để lại 1 đơn đã thanh toán trên DB test (không hủy). Nếu chạy E2E với `E2E_BASE_URL` (bản production qua compose) thì backend ở đó không bật hai cờ này (production từ chối cờ giả lập) nên bỏ qua `payments-demo.spec.ts`.

### Test Đợt 2 mục 2: vận chuyển giả lập (D-062)

- `backend/tests/eta.test.ts` (unit, không DB): ngày lịch Việt Nam (biên 16:59:59Z / 17:00:00Z, qua tháng/năm), `computeEta` cộng ngày, định dạng `estimatedDays`/dải ngày, `08:00 VN`; ETA theo vùng x phương thức với settings mặc định và settings tùy chỉnh (đồng hồ cố định, không dùng giờ thật).
- `backend/tests/shipment.test.ts` (unit): `generateTrackingNumber` (định dạng, ngày VN, hàm ngẫu nhiên tiêm vào nên deterministic, alphabet không có `0/O/1/I/L`); `buildShipmentEvents` với `now` cố định: chưa SHIPPING -> `null`, từng mốc trước/đúng/sau, đã quá `etaTo`, đơn cũ không có `etaTo`, DELIVERED cắt mốc giả (trước và sau các mốc), FAILED_DELIVERY rồi giao lại rồi giao thành công, FAILED_DELIVERY -> CANCELLED, RETURNED, thứ tự mảng history bất kỳ.
- `backend/tests/shippingSim.integration.test.ts` (DB thật): quote có `eta` theo vùng và đổi theo setting, giá không đổi; `placeOrder` với đồng hồ tiêm (23:30 và 00:30 giờ VN) lưu `etaFrom`/`etaTo` đúng; snapshot không đổi khi đổi settings, replay idempotent trả cùng đơn; SHIPPING để trống -> mã `BBL`/`BBE` + hãng giả lập, có nhập thì giữ nguyên, chỉ nhập mã thì không gán hãng giả lập, FAILED_DELIVERY -> SHIPPING dùng lại mã cũ, `generateUniqueTrackingNumber` thử lại khi trùng; `GET /orders/track` và `GET /orders/:code` và `GET /admin/orders/:code` trả `shipment` (null trước SHIPPING, mốc `HANDOVER`, đủ mốc khi tiêm đồng hồ 10 ngày sau, rỗng khi tiêm đồng hồ trước SHIPPING, DELIVERED thêm "giao thành công" và cắt mốc giả); `PUT /admin/settings` `shipping.eta`: min > max và > 30 -> 400, hợp lệ -> 200. (Test hiện có được sửa cho khớp: `settings.test.ts`, `settingsSchema.test.ts` (thêm `shipping.eta`), `shipping.test.ts` (`estimatedDays` mặc định theo vùng), `adminSettings`/`orderTrack`/`adminOrders`/`adminOrderEmails` integration (10 key, thêm trường `etaFrom`/`etaTo`/`shipment`, thiếu `trackingNumber` không còn là lỗi 400).)
- Frontend (Vitest): `ShipmentTimeline.test.tsx` (nhãn mô phỏng, rỗng, nhiều mốc `<ol>` mới nhất ở trên + giờ Việt Nam, giao thành công, sao chép thành công/thất bại, không có mã), `OrderDetail.test.tsx` (dự kiến giao, đơn cũ, đang giao, đã giao ẩn dự kiến), `CheckoutView.test.tsx` (ETA mỗi phương thức, quote cũ không có `eta`, min = max), `TrackOrder.test.tsx` (đơn đang giao có ETA + timeline + mã một lần; đơn đã giao), `AdminOrderDetail.test.tsx` (gợi ý để trống mã, gửi body không có `trackingNumber`, hiện ETA), `settingsForm.test.ts` + `AdminSettings.test.tsx` (validate/build `shipping.eta`), `labels.test.ts`, `format.test.ts`.
- E2E (không thêm lượt đăng nhập): `guest-order.spec.ts` thấy "Dự kiến giao dd/MM" ở checkout và trang thành công; `accounts.spec.ts` (lượt staff sẵn có) đẩy đơn qua đóng gói -> "Giao cho vận chuyển" không nhập mã, thấy mã `BBL-...` và hãng giả lập, khách tra cứu (không đăng nhập) thấy mã vận đơn giả + "Đã bàn giao cho đơn vị vận chuyển" + nhãn mô phỏng, rồi dọn bằng giao thất bại -> hủy đơn (hoàn kho).

### Test Đợt 2 mục 3: 2FA TOTP (D-063)

- `backend/tests/totp.test.ts` (unit): base32 (vector RFC 4648, vòng đi-về, ký tự lạ), HOTP/TOTP theo vector RFC 4226 và RFC 6238 (HMAC-SHA1, 8 số rút gọn còn 6), cửa sổ +-1 và ngoài cửa sổ, chống dùng lại bước (`lastStep`), mã sai định dạng, `buildOtpauthUri`; `secretBox` (mã hóa/giải mã, AAD = userId, sửa bit thì lỗi); mã dự phòng (định dạng, alphabet, chuẩn hóa, băm).
- `backend/tests/envTotpKey.test.ts`: `TOTP_ENCRYPTION_KEY` nhận hex/base64 đủ 32 byte, từ chối khóa sai độ dài, production bắt buộc và từ chối khóa mẫu `beanbox-dev-...`.
- `backend/tests/twoFactor.integration.test.ts` (DB thật, 27 test): setup/enable/disable/đổi mã dự phòng, CUSTOMER bị 403, thiếu khóa thì 503 `TWO_FACTOR_UNAVAILABLE`, đăng nhập 2 bước (challenge hết hạn, dùng lại, quá 5 lần thử, mã sai tính vào khóa tạm), TOTP không dùng lại được (kể cả đua song song), mã dự phòng dùng một lần, thu hồi phiên khác khi bật/tắt, Admin reset 2FA (thu hồi mọi phiên, audit), job dọn challenge hết hạn. Ma trận phân quyền (`securityAuthz`) có thêm `/auth/login/2fa`, `/me/2fa/*` và reset của Admin.
- Frontend (Vitest): `twoFactorCode.test.ts`, `LoginTwoFactor.test.tsx` (bước 2, chuyển sang mã dự phòng, lỗi, focus), `TwoFactorSection.test.tsx` (bật, lưu mã dự phòng, tắt, tạo lại), `AdminUserDetail.test.tsx` (nút reset 2FA).
- E2E `frontend/e2e/two-factor.spec.ts`: tài khoản STAFF tạo riêng; bật 2FA (QR, secret), đăng nhập bằng TOTP (mã tính độc lập trong `e2e/totp.ts`), bằng mã dự phòng, tắt 2FA. Spec tốn 12 lượt vào limiter auth (đã trong ngưỡng 30/phút); tổng một lần chạy đủ bộ là 7 + 12 lượt nên chạy trên DB mới, đừng chạy lặp liên tiếp quá nhanh.

### Test Đợt 2 mục 5: xóa tài khoản và xuất dữ liệu (D-065)

- `backend/tests/accountDeletion.integration.test.ts` (DB thật, 12 test, giá trị cố định, kỳ analytics năm 2036): `DELETE /me` 401 không token; 400 sai/thiếu `confirmText` (chữ thường, khoảng trắng thừa) hoặc thiếu mật khẩu mà tài khoản không đổi; sai mật khẩu 400 `INVALID_PASSWORD` tính vào đếm đăng nhập sai và khóa tạm sau 5 lần; STAFF/ADMIN 403 kể cả body hợp lệ; 409 `ACTIVE_ORDERS_EXIST` với mã đơn (tối đa 10, có `total`) và xóa được khi đơn xong; ẩn danh hóa đúng từng trường (User, Address/Wishlist/Cart/token/2FA bị xóa, đơn giữ số tiền/items/lịch sử/tỉnh-phường và ẩn PII, `CouponRedemption`, `ContactMessage` cùng email cũ, Review giữ và tác giả "Người dùng đã xóa", AuditLog giữ, audit `user.self_delete` không chứa email cũ), 204 + xóa cookie, access token cũ 401, refresh thất bại, đăng nhập email cũ thất bại, đăng ký lại email cũ được; analytics trước/sau cùng khoảng (overview doanh thu, customers buyers, breakdown tỉnh, top-customers hiện "Người dùng đã xóa") KHÔNG đổi, review vẫn được đếm. `GET /me/export`: 401; đủ mục + header đúng (`attachment`, tên theo ngày VN, `no-store`) + không chứa `passwordHash`/`twoFactorSecretEnc`/token/`rawPayload`; STAFF cũng xuất được; quá 1000 đơn thì `truncated`; lần 6 trong giờ -> 429 và người dùng khác không bị ảnh hưởng; audit `user.export`. `securityAuthz.integration.test.ts` thêm 2 route (`DELETE /me` chỉ CUSTOMER, `GET /me/export` mọi role). `adminUsers.integration.test.ts` cập nhật shape item có `deleted`.
- Frontend (Vitest): `PersonalDataSection.test.tsx` (tải file đúng tên + thông báo, 429 tiếng Việt, STAFF không thấy nút xóa, nút xác nhận chỉ bật khi có mật khẩu và gõ đúng cụm, thành công gửi đúng body rồi đăng xuất cục bộ và về trang chủ kèm thông báo, `ACTIVE_ORDERS_EXIST` liệt kê mã đơn có link, sai mật khẩu giữ hộp thoại), `AccountDeletedNotice.test.tsx`, `UserBadges.test.tsx` (nhãn "Đã xóa" thay "Đã khóa").
- E2E `frontend/e2e/account-data.spec.ts`: đăng ký CUSTOMER mới qua API (email theo hậu tố ngẫu nhiên), đăng nhập UI, tải JSON (`waitForEvent('download')`, parse thấy `formatVersion: 1` và đúng hồ sơ), xóa qua hộp thoại (nút khóa tới khi nhập đủ) -> về trang chủ có thông báo, đăng nhập lại báo "Email hoặc mật khẩu không đúng". Không đụng tài khoản seed. Tốn 3 lượt vào limiter auth (đăng ký 1, đăng nhập 1, đăng nhập lại 1); cả bộ E2E khoảng 7 + 12 + 3 = 22 lượt/lần, dưới ngưỡng 30/phút.
- Dọn dữ liệu test: tin liên hệ cùng email cũ bị ẩn danh sang `deleted-<id>@deleted.invalid` nên `afterAll` dọn thêm theo email này (nếu bỏ sót, `adminContact` lọc `NEW,SPAM` sẽ thấy tin thừa).
- Kết quả (2026-11-22, Windows, Postgres 17 tạm, Edge): backend `test:coverage` 93 file, 1924 test đạt; statements 96,17 %, branches 88,73 %, functions 97,81 %, lines 97,75 % (ngưỡng D-055). Frontend `test:coverage` 112 file, 967 test đạt; statements 85,11 %, branches 79,22 %, functions 85,47 %, lines 87,66 %. Migration `d065` deploy sạch và `prisma migrate diff --exit-code` = 0 (không drift). E2E `account-data`, `accounts`, `a11y`, `two-factor` trên DB trống + seed: 23/23 đạt.

### Test Đợt 3 (3B): gia cố (D-067..D-070)

- `backend/tests/adminTwoFactorRequired.integration.test.ts` (DB thật, 7 test; D-070): cờ tắt = hành vi cũ (`twoFactorRequired=false`); cờ bật: ADMIN chưa bật 2FA 403 `ADMIN_TWO_FACTOR_REQUIRED` (kèm `no-store`) trên 5 route admin, ADMIN đã bật 200, STAFF 200, không token vẫn 401, `/me` (`twoFactorRequired=true`) và `/me/2fa/setup` vẫn 200, đăng nhập Admin không đổi, tắt cờ lại thì vào được ngay. Test đổi `env.REQUIRE_ADMIN_2FA` trực tiếp (đọc mỗi request).
- `backend/tests/envRequireAdmin2fa.test.ts` (3 test): mặc định `false` ở dev/test/production, `true`/`false` hợp lệ, giá trị lạ bị từ chối.
- `backend/tests/shippingSim.integration.test.ts` (D-068, thay test `generateUniqueTrackingNumber`): sinh mã trùng (P2002) thì chạy lại transaction và lần sau ra mã khác (bộ số ngẫu nhiên tiêm vào, assertion theo số lần gọi); trùng liên tục -> 500 sau đúng 8 lượt và đơn không đổi; staff nhập mã đã dùng -> 409 `TRACKING_NUMBER_TAKEN`, đơn giữ `PROCESSING`, sau đó đổi mã khác vẫn chuyển được; giao lại bằng chính mã của đơn không bị coi là trùng; mã `""`, `"   "`, `null` -> server sinh mã giả (không 400). `adminOrders.integration.test.ts` dùng mã vận đơn riêng cho từng đơn (mã là unique toàn bảng).
- `backend/tests/migrationTrackingUnique.integration.test.ts` (DB test, 5 test): chạy đúng các câu SQL của migration `d068_tracking_number_unique` TRONG MỘT transaction rồi rollback (DDL Postgres có transaction): chuẩn hóa `''`/khoảng trắng -> NULL, chỉ mục unique tồn tại sau `migrate deploy` và cho nhiều NULL, dữ liệu có mã trùng -> `RAISE EXCEPTION` chứa "D-068", mã trùng, câu `GROUP BY` tìm bản trùng, hướng dẫn chạy lại `prisma migrate deploy`, và không xóa/sửa bản trùng; không trùng thì khối DO qua và tạo được chỉ mục.
- Frontend (Vitest): `AdminGuard.test.tsx` thêm 2 test (Admin bị bắt buộc 2FA -> màn hình "Cần bật xác thực 2 lớp", nút tới `/tai-khoan#account-2fa`, không `router.replace`, không lộ menu/nội dung; Admin đã bật 2FA vào bình thường); `robots.test.ts` viết lại (chỉ chặn `/admin` và `/api/`, không đường dẫn noindex nào bị chặn bởi tiền tố, không chặn trang công khai); `noindex.test.ts` thêm kiểm mỗi đường dẫn trong `NOINDEX_PATHS` có module được kiểm `robots.index === false`.
- Sửa test cũ theo hình dạng mới: `auth.integration.test.ts` (User thêm `twoFactorRequired`), `authMiddleware.integration.test.ts` (`req.auth.twoFactorEnabled`).
- CI (D-067): `actionlint` (`rhysd/actionlint`, `MSYS_NO_PATHCONV=1` trên Git Bash, `docker run --rm -v "$PWD:/repo" --workdir /repo rhysd/actionlint:latest -color`) = 0 lỗi. Lệnh Trivy đã chạy thật trên hai image build tạm: backend HIGH 11 / CRITICAL 0, frontend HIGH 10 / CRITICAL 0 (gói npm trong image, đều có bản vá; chỉ báo cáo).

### Test Đợt 4 nhóm 1 (D-071..D-073)

- **Backend (unit):** `csv.test.ts` (parseCsv RFC 4180, BOM, CRLF/LF/CR, ngoặc kép, xuống dòng trong ô, lỗi ngoặc kép; `neutralizeFormula`/`unneutralizeFormula` nghịch đảo chính xác), `productsCsv.test.ts` (header nghiêm ngặt, từng cột, lập kế hoạch: tạo/sửa/không đổi/lỗi, SKU trùng, slug dành riêng, nhất quán trong sản phẩm).
- **Backend (integration, DB thật):** `adminOrderNotes.integration.test.ts` (quyền Staff tạo / Admin xóa / Staff xóa 403, không sửa, kiểm đầu vào, rò rỉ ra API khách/track/`/me/export`, audit không chứa nội dung, `noteCount`, `GET /print`: 51 mã 400, `meta.missing`, thứ tự); `adminProductsCsv.integration.test.ts` (xuất, xem trước không ghi DB, commit 409 `FINGERPRINT_MISMATCH` / 422 `IMPORT_HAS_ERRORS`, `InventoryMovement`, khứ hồi toàn `unchanged`, 413, rate limit nhập); `securityAuthz.integration.test.ts` thêm 4 route chỉ Admin.
- **Frontend (Vitest):** `OrderNotes.test.tsx`, `AdminOrdersBulk.test.tsx` (checkbox, chọn tất cả, giữ lựa chọn qua trang, giới hạn 50, trang in hàng loạt), `ProductCsvTools.test.tsx` (chọn file, xem trước, lọc, "Áp dụng" khóa khi có lỗi, kết quả).
- **E2E:** khối thêm vào `m6b.spec.ts` (test admin, không đăng nhập thêm): thêm ghi chú nội bộ và còn sau reload, chọn 2 đơn mở 2 phiếu in, xuất CSV rồi nhập lại chính file thì toàn "Không thay đổi" và "Áp dụng" bật.

### Kết quả kiểm Đợt 4 (nhóm 1) (2026-11-22, Windows, Postgres 17 tạm, Edge)

- **Backend** (`TEST_DATABASE_URL` trỏ DB test tạm): `lint`, `typecheck`, `format:check`, `build` sạch; `test:coverage` 99 file, 2036 test đạt; statements 96,18 %, branches 88,52 %, functions 97,9 %, lines 97,77 % (ngưỡng D-055 đạt).
- **Frontend**: `lint`, `typecheck`, `format:check`, `build` sạch; `test:coverage` 116 file, 1004 test đạt; statements 85,35 %, branches 79,34 %, functions 85,69 %, lines 87,91 % (ngưỡng D-055 đạt).
- **Migration:** `migrate deploy` trên DB tạm trắng áp dụng được cả `d071_order_note`; `migrate diff --exit-code` "No difference detected".
- **E2E** (`E2E_API_PORT=4100 E2E_WEB_PORT=3100 E2E_BROWSER_CHANNEL=msedge`, DB tạm seed sạch): `m6b.spec.ts`, `accounts.spec.ts`, `admin-mobile.spec.ts` 7/7 đạt.
- **Chưa kiểm:** CI trên runner GitHub thật (chưa push).

### Kết quả kiểm Đợt 3 (3B) (2026-11-23, Windows, Postgres 17 tạm `--shm-size=256m`, Edge)

- **Backend** (`TEST_DATABASE_URL` trỏ DB test tạm, env như CI): `lint`, `format:check`, `typecheck`, `build` sạch; `test:coverage` 96 file, 1943 test đạt; statements 96,2 %, branches 88,78 %, functions 97,82 %, lines 97,78 % (ngưỡng D-055 đạt). Drift: `prisma migrate deploy` trên DB trống áp đủ migration (kể cả `d068`), `prisma migrate diff --from-migrations ... --to-schema ... --exit-code` = "No difference detected" (exit 0).
- **Frontend**: `lint`, `format:check`, `typecheck`, `build` sạch; `test:coverage` 112 file, 972 test đạt; statements 85,13 %, branches 79,23 %, functions 85,49 %, lines 87,68 % (ngưỡng D-055 đạt).
- **E2E** (`E2E_API_PORT=4100 E2E_WEB_PORT=3100 E2E_BROWSER_CHANNEL=msedge`, DB tạm seed sạch, cờ `REQUIRE_ADMIN_2FA` mặc định tắt): `accounts.spec.ts`, `m6b.spec.ts`, `admin-mobile.spec.ts` 7/7 đạt; `a11y.spec.ts` + `guest-order.spec.ts` 20/20 đạt. Chưa chạy lại toàn bộ 38 test (không thay đổi các spec khác).
- **gitleaks** `v8.30.0`: `gitleaks git` trên lịch sử (30 commit) 0 phát hiện; `gitleaks dir` (`-w /repo`, nguồn `.`) trên bản sao các file đã đổi/mới (không gồm `.env` thật) 0 phát hiện. Quét thư mục làm việc đầy đủ báo 31 mục, toàn bộ nằm trong file bị `.gitignore` (`backend/.env` cục bộ, `frontend/.next/**` là sản phẩm build), không có trong bất kỳ file nào được theo dõi hay mới tạo.
- **Chưa kiểm:** bước Trivy và cache trên runner GitHub thật (chưa push), nên chưa thấy Job Summary thực tế.

### Kết quả kiểm tổng Đợt 3 (2026-11-22, Windows, Postgres 17 tạm `--shm-size=256m`, Edge)

- **Backend** (`TEST_DATABASE_URL` trỏ DB test tạm, env như CI): `lint`, `format:check`, `typecheck`, `build` sạch; `test:coverage` 96 file, 1945 test đạt; statements 96,13 %, branches 88,76 %, functions 97,75 %, lines 97,7 % (ngưỡng D-055 đạt).
- **Frontend**: `lint`, `format:check`, `typecheck`, `build` sạch; `test:coverage` 113 file, 978 test đạt; statements 85,15 %, branches 79,25 %, functions 85,51 %, lines 87,69 %.
- **Migration**: `prisma migrate deploy` đủ 12 migration (kể cả d068) trên DB trống, `prisma migrate diff --from-migrations ... --exit-code` = 0.
- **Docker/ops**: build backend `--target runtime` (2 phút 41 giây cùng frontend, cache một phần) và frontend OK (tag tạm, đã xóa); `docker compose config -q` cho dev, prod (env giả như CI, cả `--profile backup --profile tools`) và demo = 0; `actionlint` = 0; gitleaks `v8.30.0`: `git` (30 commit) và `dir` (`-w /repo`, chỉ file tracked/mới) đều 0 phát hiện.
- **E2E toàn bộ** (`E2E_API_PORT=4100 E2E_WEB_PORT=3100 E2E_BROWSER_CHANNEL=msedge`, DB tạm seed sạch): 38/38 đạt, 2 lần liên tiếp (3,0 phút/lần).
- **Trivy** (`aquasec/trivy:0.76.2` như CI, HIGH/CRITICAL, `--ignore-unfixed`): image runtime backend CRITICAL 0 / HIGH 11; frontend 0 / 10; image demo `beanbox-demo-backend` 0 / 11, `beanbox-demo-frontend` 0 / 10, `beanbox-demo-init` 0 / 11 (gói npm đi kèm image nền, chỉ báo cáo).
- **Demo một lệnh trên máy sạch** (không có tài nguyên `beanbox-demo*`; image nền `postgres:17`, `node`, `mailpit` đã có sẵn; cache build còn một phần từ lần build image kiểm ngay trước đó): `docker compose -f docker-compose.demo.yml up --build -d` xong và `http://localhost:3300` trả 200 sau 162 giây; `init` thoát 0, không có dòng lỗi ở backend/frontend. `down` rồi `up -d`: 1.503 đơn trước và sau (1.500 do generator + 3 đơn tay), init in "bỏ qua (--skip-if-exists)"; chạy lại mất 15 giây. `down -v --rmi local` xóa sạch.
- **Kịch bản demo 5 phút (README) đi trọn 9 bước bằng Playwright + Edge trên `localhost:3300`**: 9/9 đạt (duyệt/lọc/so sánh; VNPay giả thành công và thất bại; chuyển khoản QR; staff xác nhận tiền, đóng gói, giao với mã `BBL-...` tự sinh; tra cứu đơn có hành trình mô phỏng; phân tích + xuất CSV + nhật ký; staff bật 2FA bằng `e2e/totp.ts`, đăng nhập 2 bước, tắt lại; đăng ký tài khoản mới, tải JSON, xóa tài khoản; Mailpit có email xác nhận/đang giao). Trang sản phẩm có mục "Thường được mua cùng" trên demo.
- **Chức năng 3B** (backend tạm cổng 4200 + `next dev` 3200 trên DB tạm, không phải demo): `REQUIRE_ADMIN_2FA=true`: Admin chưa 2FA gọi `/admin/dashboard` nhận 403 `ADMIN_TWO_FACTOR_REQUIRED`, UI hiện "Cần bật xác thực 2 lớp"; bật 2FA từ màn hình đó thì vào `/admin` ngay; Staff 200 và không bị áp. Bật cờ giữa phiên (khởi động lại backend khi trình duyệt đang mở): lúc đầu UI chỉ hiện lỗi chung, đã sửa (xem dưới), giờ bấm một link admin là hiện màn hình 2FA. `trackingNumber`: nhập mã trùng -> 409 `TRACKING_NUMBER_TAKEN`; để trống -> `BBL-...`. Migration d068 trên DB có dữ liệu trùng (tạo bằng SQL trước khi áp): lỗi P3018 với hướng dẫn tiếng Việt, dữ liệu nguyên vẹn (không có index, chuỗi rỗng không bị đổi vì cả migration chạy trong một transaction); sửa trùng rồi `migrate resolve --rolled-back` và `migrate deploy` thì áp thành công. `robots.txt` chỉ `Disallow: /admin` và `/api/`; `/gio-hang`, `/thanh-toan`, `/tai-khoan`, `/dang-nhap`, `/dang-ky`, `/tra-cuu-don-hang`, `/admin` có `noindex`, `/tim-kiem` và `/so-sanh` có `noindex, follow`.
- **Lỗi tìm thấy và sửa:** (1) cờ `REQUIRE_ADMIN_2FA` bật giữa phiên chỉ hiện lỗi 403 chung: `ApiClient` phát sự kiện, `AdminGuard` hiện màn hình 2FA (test mới ở `client.test.ts`, `AdminGuard.test.tsx`); (2) 409 `TRACKING_NUMBER_TAKEN` hiện câu lỗi chung "Đã có lỗi xảy ra": thêm câu tiếng Việt riêng trong `adminErrorMessage` (`errors.test.ts` mới); (3) thông báo lỗi của migration d068 bảo "chạy lại migrate deploy" nhưng sau lần lỗi Prisma trả P3009 cho tới khi `migrate resolve --rolled-back`: sửa câu hướng dẫn trong `migration.sql`.
- **Chưa kiểm / lưu ý:** bước Trivy và cache trên runner GitHub thật (chưa push). Bước 1 của kịch bản: bấm bộ lọc trước khi trang hydrate xong thì cú bấm bị mất (hành vi chung của SSR, không phải lỗi mới).

### Kết quả kiểm tổng Đợt 2 (2026-11-22, Windows, Postgres 17 tạm `--shm-size=256m`, Edge)

- **Backend** (`TEST_DATABASE_URL` trỏ DB test tạm, env như CI): `lint`, `format:check`, `typecheck`, `build` sạch; `test:coverage` 93 file, 1924 test đạt; statements 96,17 %, branches 88,73 %, functions 97,81 %, lines 97,75 % (ngưỡng D-055 đạt). Drift: `prisma migrate deploy` đủ d060..d065 rồi `prisma migrate diff --exit-code` = 0.
- **Frontend**: `lint`, `format:check`, `typecheck`, `build` sạch; `test:coverage` 112 file, 967 test đạt (đo trước khi thêm 1 test hydrate ở `AddToCartPanel.cart.test.tsx`, test đó đạt riêng: 5/5 trong file); statements 85,11 %, branches 79,21 %, functions 85,45 %, lines 87,67 % (ngưỡng đạt).
- **E2E toàn bộ** (`E2E_API_PORT=4100 E2E_WEB_PORT=3100 E2E_BROWSER_CHANNEL=msedge`, DB tạm + seed): 38/38 đạt, 3 lần liên tiếp (3,0-3,1 phút/lần). `guest-order.spec.ts` chạy riêng 5 lần, mỗi lần khởi động lạnh backend + `next dev` (xóa `.next/dev` trước mỗi lần): 5/5 đạt (16-19 giây).
- **Docker/ops**: build backend `--target runtime` và frontend thành công (tag tạm, đã `docker rmi`); `docker compose -f docker-compose.prod.yml config -q` (cả `--profile backup --profile tools`, env giả như CI) = 0 sau khi sửa lỗi YAML ở thông báo `TOTP_ENCRYPTION_KEY` (xem dưới); `docker-compose.yml` (dev) = 0; `actionlint` (Docker `rhysd/actionlint`) = 0.
- **gitleaks** (`zricethezav/gitleaks:v8.30.0`): `gitleaks git` trên lịch sử (29 commit) 0 phát hiện; `gitleaks dir` trên bản sao các file đã đổi/chưa theo dõi (không gồm `.env` thật; chạy với `-w /repo` và nguồn `.` để đường dẫn tương đối khớp allowlist `^backend/...`) tìm thấy 1 phát hiện mới: chuỗi base32 giả `ABCDEF234567` ở `backend/tests/totp.test.ts` (fixture `buildOtpauthUri`); đã thêm allowlist theo cặp đường dẫn + giá trị trong `.gitleaks.toml`, quét lại 0 phát hiện. (Quét `dir` với đường dẫn tuyệt đối `/repo/...` thì mọi allowlist `^backend/...` không khớp, ra 9 phát hiện giả; không phải lỗi cấu hình.)
- **Sửa trong lần kiểm này**: (1) `docker-compose.prod.yml`: thông báo lỗi của `TOTP_ENCRYPTION_KEY` có chuỗi dấu hai chấm + khoảng trắng (`32 byte: openssl ...`) làm YAML hỏng (`go-yaml ... mapping values are not allowed`), job `ops-lint` sẽ vỡ; đã đổi thành `32 byte, tạo bằng openssl rand -base64 32`. (2) `.gitleaks.toml`: allowlist fixture totp ở trên. (3) Hai test chập chờn (mục dưới).

#### Xử lý test chập chờn (cuối Đợt 2)

- **`guest-order.spec.ts` (giỏ "0 sản phẩm")**: nguyên nhân gốc là nút "Thêm vào giỏ" nằm trong HTML render sẵn từ server và bấm được trước khi React hydrate, nên `onClick` chưa gắn và cú bấm bị mất (rõ nhất khi `next dev` vừa khởi động, biên dịch lần đầu chậm). Sửa ở UI: `AddToCartPanel` giữ nút `disabled` và `data-ready="false"` tới khi hydrate xong (`useSyncExternalStore` với server snapshot `false`, client snapshot `true`; không dùng `setState` trong effect vì lint `react-hooks/set-state-in-effect`). Sửa ở test: `e2e/helpers.ts` thêm `addToCartWhenReady(page)` (chờ `data-ready="true"` và `toBeEnabled`, rồi chờ phản hồi `POST /cart/items` < 300, không chờ thời gian cố định); `guest-order.spec.ts` và `payments-demo.spec.ts` dùng hàm này. Test Vitest mới trong `AddToCartPanel.cart.test.tsx` (HTML SSR có `disabled` + `data-ready="false"`, client `data-ready="true"`). Về lỗi "phụ thuộc thứ tự/DB": không tái hiện được; `findStockedProduct` chọn sản phẩm còn tồn tại thời điểm chạy và 3 lần chạy đủ bộ trên cùng một DB đều 38/38, nên không đổi logic chọn dữ liệu.
- **`CartProvider.test.tsx` ("merge lỗi mạng ... có error để thử lại")**: sau `reload()` trạng thái chuyển `loading` với `error = null` NGAY (trước khi merge kết thúc), nên `waitFor(ctx.error == null)` có thể thỏa sớm và assertion xóa token chạy trước khi merge hoàn tất khi máy bận. Sửa: chờ token guest bị xóa, chờ `ready:2`, kiểm `mergeCart` gọi 2 lần rồi mới kiểm `error`. Chứng minh: file đó chạy 40 lần (20 vòng x 2 lệnh) trong lúc backend `test:coverage` chạy song song, 0 lỗi.
- **Rà test Đợt 2**: `twoFactor.integration.test.ts` dùng `code(secret) === '000000' ? '000001' : '000000'` để tạo mã sai (có xác suất nhỏ trùng mã của bước liền kề); thay bằng `wrongCode(secret)` chọn mã không thuộc cửa sổ +-2 bước (tất định). Các mã đúng dùng cửa sổ +-1 của server nên một lần qua biên 30 giây giữa lúc tính và lúc kiểm vẫn được chấp nhận; E2E `totp.ts` đã chờ sang bước mới khi còn dưới 3 giây tới biên. `Date.now()` ở `paymentsDemo` (hạn giữ đơn, biên 1 giây hai phía), `shippingSim`, `accountDeletion` là so sánh có biên rộng, không ngẫu nhiên. `totp.test.ts` dùng `randomBytes` để kiểm tính chất vòng đi-về base32 (đúng với mọi giá trị).

#### Kiểm chức năng thật (DB tạm `beanbox_c`, backend 4200 bằng `tsx`, frontend production build `next start` 3200, cờ `PAYMENT_MOCKS_ENABLED`/`BANK_TRANSFER_ENABLED` bật, khóa TOTP mẫu dev)

- **Mục 1 (thanh toán demo)**: VNPay giả thành công -> `CONFIRMED`/`PAID` (SQL), gọi lặp idempotent; thất bại -> `PENDING_PAYMENT` + `FAILED`, `canPay` = true, thanh toán lại thành công; sửa `vnp_Amount` -> 400 `PAYMENT_SIGNATURE_INVALID`, DB không đổi; MoMo giả thành công, sửa `amount` -> 400 DB không đổi; chuyển khoản có QR `data:image/png` + `isDemo`, claim chỉ ghi `transferClaimedAt` (vẫn `UNPAID`), staff xác nhận -> `PAID`/`CONFIRMED`, audit `payment.bank_transfer_confirm`, customer 403. Tắt cờ: `/mock-gateway/*` 404, quote không bật MoMo/chuyển khoản/VNPay, đặt đơn `BANK_TRANSFER` 409 `PAYMENT_METHOD_UNAVAILABLE`. `NODE_ENV=production` + `PAYMENT_MOCKS_ENABLED=true`: thoát mã 1 với "không được phép ở production". UI (QR + cảnh báo demo, cổng giả, xác nhận hai bước của admin) do `payments-demo.spec.ts` và `m6b.spec.ts` kiểm trong 3 lần E2E đủ bộ.
- **Mục 2 (vận chuyển)**: ETA khác nhau nội thành (HCM 1-2 ngày) và ngoại tỉnh (Đà Nẵng 3-5 ngày), Tiêu chuẩn khác Nhanh; UI checkout đổi ETA khi đổi tỉnh; đơn lưu `etaFrom`/`etaTo` đúng quote; giá khớp D-003 (subtotal + 20.000/35.000 nội thành, 35.000/55.000 ngoài); staff SHIPPING không nhập mã -> `BBE-`/`BBL-` + hãng giả lập; tra cứu guest thấy `shipment` có mốc `HANDOVER`; admin đổi `shipping.eta` -> quote đổi, snapshot đơn cũ không đổi.
- **Mục 3 (2FA)**: bật 2FA bằng TOTP tính độc lập bằng `e2e/totp.ts`, bật thu hồi phiên khác; DB `twoFactorSecretEnc` dạng `v1:<iv>:<ct>` (không phải base32), mã dự phòng lưu băm; đăng nhập 2 bước; dùng lại mã -> 401 `TWO_FACTOR_INVALID`; mã dự phòng dùng được 1 lần; sai 5 lần -> challenge vô hiệu (mã đúng ở lần 6 cũng 401 `TWO_FACTOR_CHALLENGE_INVALID`, challenge cũ vẫn chết sau khi mở khóa tạm); admin reset -> staff đăng nhập không cần mã; customer `/me/2fa/setup` 403; thiếu khóa 503 `TWO_FACTOR_UNAVAILABLE`. Hành vi cần biết: mã sai hoặc mã dùng lại tính vào bộ đếm đăng nhập sai chung (từ 5 lần trở lên khóa tạm 403 `ACCOUNT_LOCKED`), nên một chuỗi thử lỗi liên tiếp trên cùng một tài khoản có thể bị khóa tạm trước khi chạm giới hạn 5 lần của challenge.
- **Mục 4 (SEO, production build)**: `/` có `x-nextjs-cache: HIT` + `s-maxage=60`; `og:image` trang chủ và sản phẩm trả `image/png` (ảnh sản phẩm đã đọc bằng mắt: "Từ 185.000đ" đúng dấu tiếng Việt); danh mục dùng ảnh OG mặc định đúng D-064 (không có file riêng); sitemap có `lastmod`; `?page=2` canonical tự trỏ `?page=2`; URL lọc `?roast=` -> `noindex, follow` + canonical về URL không lọc; JSON-LD parse được (Organization, WebSite, Product, BreadcrumbList; danh mục có ItemList 12 mục); slug lạ 404; slug cũ 308 `Location` đúng; `csp.spec.ts` đạt trong E2E.
- **Mục 5 (tài khoản)**: customer mới đặt và hoàn tất đơn (DELIVERED, PAID), tải JSON (`attachment`, `no-store`, không có `passwordHash`/secret/token), có đơn đang xử lý -> 409 `ACTIVE_ORDERS_EXIST` (UI liệt kê mã đơn dạng link), xóa -> 204, đăng nhập lại 401, user ẩn danh hóa trong DB, đơn giữ số tiền, email cũ đăng ký lại được; analytics overview/customers/breakdown tỉnh trước và sau xóa y hệt (khách mới chỉ tăng khi đăng ký lại, đúng kỳ vọng); admin thấy nhãn "Đã xóa" (API `deleted: true`, UI).
- **Hồi quy**: COD guest 3 đơn mở/SĐT (đơn 4 -> 409 `TOO_MANY_PENDING_ORDERS`, đặt lại được sau khi staff xác nhận 1 đơn, replay `Idempotency-Key` trả cùng đơn); analytics breakdown `paymentMethod` có "MoMo (giả lập)" và "Chuyển khoản / VietQR", tổng nhóm = doanh thu KPI; CSV (BOM, `text/csv`) có cùng nhãn. Mobile 390 (Edge, production build): checkout (VNPay/MoMo/Chuyển khoản/COD, chip "Giả lập", ETA), trang tra cứu có timeline + nhãn mô phỏng, trang tài khoản (hộp thoại xóa; staff với bước thiết lập 2FA) không tràn ngang (0 px) và axe 0 serious/critical.
- Các ca API/DB ở trên chạy tay một lần bằng script tạm (không đưa vào repo); phần UI chính nằm trong các spec E2E của Đợt 2.

### Kết quả kiểm tổng Đợt 1 (2026-11-21, Windows, Postgres 17 tạm, Edge)

- Backend: `lint`, `format:check`, `typecheck`, `build` sạch; `test:coverage` 83 file, 1725 test đạt; statements 96,35 %, branches 89,5 %, functions 97,5 %, lines 97,81 % (ngưỡng D-055: 94/87/95/95).
- Frontend: `lint`, `format:check`, `typecheck`, `build` sạch; `test:coverage` 97 file, 842 test đạt; statements 84,14 %, branches 78,11 %, functions 84,51 %, lines 86,75 % (ngưỡng: 81/75/81/84).
- E2E toàn bộ (`E2E_API_PORT=4100 E2E_WEB_PORT=3100 E2E_BROWSER_CHANNEL=msedge`, DB trống + seed): 31/31 đạt.
- Docker: build backend `--target runtime` và frontend thành công; `docker compose -f docker-compose.prod.yml config -q` (cả `--profile backup --profile tools`) với env giả như CI: 0; `actionlint` (Docker): 0; `.github/dependabot.yml` parse YAML được (7 mục cập nhật).
- Chạy tay trên DB tạm (không có test tự động): giới hạn 3 đơn COD guest (409, thay đổi sau khi staff xác nhận, replay Idempotency-Key trả 200 đơn cũ, khách đăng nhập không bị giới hạn); job hết hạn 48 giờ (chỉ đơn guest 49 giờ bị hủy, tồn kho +1 đúng, lý do "Quá hạn xác nhận đơn", history `actorId` null, chạy lần 2 không đổi, analytics vận hành "Hết hạn tự động" ở JSON, CSV và UI); captcha Turnstile bằng khóa thử công khai của Cloudflare (thiếu/sai token -> 400 `CAPTCHA_FAILED`, khách đăng nhập không cần); mailer (SMTP đóng: đơn vẫn 201, 3 lần thử cách 1 giây và 4 giây rồi bỏ, log không có email người nhận; mailpit nhận mail; `SMTP_REQUIRE_TLS=true` với mailpit không TLS: log lỗi STARTTLS, đơn vẫn 201); analytics 250.000 đơn với `ANALYTICS_STATEMENT_TIMEOUT_MS=1000` dưới tải 6-8 request breakdown song song: 503 `ANALYTICS_TIMEOUT` tiếng Việt, UI khối lỗi có "Thử lại", đặt hàng song song vẫn 201, timeout mặc định -> 200. Ghi chú: một request breakdown 365 ngày đơn lẻ trên 100.000 đơn chỉ khoảng 0,85 giây nên không chạm 1 giây; cần tải song song hoặc dữ liệu lớn hơn để gây timeout.
- Frontend trên production build: header mobile, chỉ báo tải (`aria-busy` true rồi false khi đổi sắp xếp và phân trang, chiều cao vùng lưới không đổi), giờ VN khi trình duyệt ở `America/Los_Angeles`, thông báo 409 ở checkout; slug không tồn tại -> 404, slug cũ -> 308. `global-error.tsx` chỉ có test render (ép lỗi layout gốc cần sửa mã nguồn).

## Dữ liệu mẫu: seed cơ bản và seed nhiều (D-084)

| Bộ | Lệnh | Dùng cho test nào |
| -- | ---- | ----------------- |
| Cơ bản | `npm run prisma:seed` | E2E (Playwright), job `e2e` của CI, `seedProducts.integration.test.ts`, mọi chỗ nói "DB tạm + seed" trong tài liệu này. Số lượng, slug, SKU của bộ này được test phụ thuộc nên KHÔNG đổi. |
| Nhiều | `npm run seed:rich` | Demo một lệnh, chụp ảnh, xem tay giao diện với dữ liệu đầy đặn. Chỉ có test riêng của nó (bên dưới), không có E2E nào phụ thuộc. |

`seed:rich` chạy SAU seed cơ bản, chỉ cộng thêm, idempotent (id/slug/SKU/mã cố định, `createMany` bỏ qua bản ghi đã có), tất định (mulberry32, không `Math.random`), từ chối khi `NODE_ENV=production`, không xóa dữ liệu. Chạy thử trên DB tạm (không dùng DB dev) và đo thời gian:

```bash
docker run -d --name bb-seed-tmp --shm-size=256m -e POSTGRES_USER=beanbox -e POSTGRES_PASSWORD=tmp-pw -e POSTGRES_DB=beanbox_rich -p 127.0.0.1:55460:5432 postgres:17
cd backend
export DATABASE_URL=postgresql://beanbox:tmp-pw@127.0.0.1:55460/beanbox_rich   # PowerShell: $env:DATABASE_URL="..."
npx prisma migrate deploy && npm run prisma:seed
time npm run seed:rich     # lần 1: tạo mới; lần 2: "Bản ghi MỚI trong lần chạy này: 0"
docker rm -fv bb-seed-tmp
```

Test của seed nhiều (chạy trong `npm test` thường; tổng 2 file, không assertion trên giá trị ngẫu nhiên):

- `tests/seedRichData.test.ts` (thuần, không DB): PRNG tất định; guard từ chối `NODE_ENV=production`; 120 sản phẩm, slug/SKU duy nhất và không trùng seed cơ bản, giá/sale hợp lệ, ngày rang 2-28 ngày, tồn kho đa dạng; 30 mã giảm giá đủ trạng thái, code không bắt đầu bằng `-`; khách/SĐT theo regex hệ thống; kế hoạch đơn tất định, mã đơn khớp `ORDER_CODE_REGEX` và duy nhất, tổng khớp dòng, chuỗi lịch sử liền mạch và kết thúc đúng trạng thái; đánh giá chỉ từ đơn DELIVERED của người mua, 1/người/sản phẩm, điểm nghiêng về 4-5.
- `tests/seedRich.integration.test.ts` (DB test `beanbox_test`): dựng điều kiện giống sau `prisma:seed` (danh mục gốc, 1 nhân viên), chạy `seedRich` hai lần; lần 2 `inserted = 0` và mọi số đếm không đổi; kiểm bằng SQL: đánh giá chỉ của người mua đơn DELIVERED, không trùng người/sản phẩm, denorm `ratingAvg/ratingCount` khớp đánh giá PUBLISHED; `grandTotal = subtotal - discountTotal + shippingFee - shippingDiscount`, `subtotal` = tổng dòng, mã đơn hợp lệ, idempotency key cố định, mọi dòng có `unitCost`, không có `InventoryMovement`; `roastDate` mọi lô cà phê `FRESH` (D-082), `avgCost` 55-70 % giá, sale hợp lệ; mã giảm giá hợp lệ và đủ trạng thái; 150 khách chung một mật khẩu băm (argon2 verify đúng), SĐT hợp lệ. Dọn sạch mọi bản ghi `rich*` sau khi xong.

### Áp dữ liệu mẫu nhiều lên DB dev (chủ dự án tự chạy)

Đây là hướng dẫn cho người dùng DB dev thật (container `db` của `docker-compose.yml`, user `beanbox`, DB `beanbox`, đúng `backend/.env.example`); tài liệu và agent KHÔNG chạy các lệnh này thay bạn. `seed:rich` chỉ CỘNG THÊM, idempotent và không xóa dữ liệu nào, nhưng vẫn nên sao lưu trước.

1. **Sao lưu** (thư mục gốc repo; `backups/` đã nằm trong `.gitignore`). Git Bash: `mkdir -p backups && docker compose exec -T db pg_dump -U beanbox -Fc beanbox > backups/beanbox-dev-truoc-seed-rich.dump`. PowerShell dùng `cmd /c "docker compose exec -T db pg_dump -U beanbox -Fc beanbox > backups/beanbox-dev-truoc-seed-rich.dump"` để dữ liệu nhị phân không bị PowerShell làm hỏng.
2. **Kiểm migration** (trong `backend/`): `npx prisma migrate status`; chỉ khi báo còn migration chưa áp thì `npx prisma migrate deploy`. Không dùng `db:reset`/`migrate reset` (xóa sạch dữ liệu).
3. **Seed cơ bản** (tạo tài khoản STAFF/ADMIN và danh mục gốc mà seed nhiều cần): `npm run prisma:seed`.
4. **Seed nhiều**: `npm run seed:rich`. Cần `SEED_CUSTOMER_PASSWORD` trong `backend/.env`. Kết quả mong đợi: khoảng 5 giây, tóm tắt số bản ghi. Chạy lại lần nữa phải in "Bản ghi MỚI trong lần chạy này: 0".
5. **Khôi phục nếu cần** (dừng backend trước; lệnh này xóa dữ liệu hiện tại và nạp lại bản sao lưu): Git Bash `docker compose exec -T db pg_restore -U beanbox -d beanbox --clean --if-exists < backups/beanbox-dev-truoc-seed-rich.dump`; PowerShell `cmd /c "docker compose exec -T db pg_restore -U beanbox -d beanbox --clean --if-exists < backups/beanbox-dev-truoc-seed-rich.dump"`.

Lưu ý: sản phẩm rich được đặt lại theo giá trị mẫu mỗi lần chạy (giá, tồn, ngày rang, sale); dữ liệu bạn tự tạo không bị đụng; sản phẩm của seed cơ bản có đánh giá rich sẽ hiện điểm tính từ đánh giá thật trong DB thay cho số giả của seed cơ bản; đơn lịch sử không trừ tồn kho.

### Kết quả kiểm seed nhiều (D-084) (2026-11-24, Windows, Postgres 17 tạm `--shm-size=256m`, Edge)

- **Backend** (`TEST_DATABASE_URL` trỏ DB test của container tạm): lint, typecheck, `format:check`, build đạt; `test:coverage` 115 file, 2202 test đạt (thêm `seedRichData.test.ts`, `seedRich.integration.test.ts`: 29 test); statements 96,28 %, branches 89,13 %, functions 97,80 %, lines 97,80 % (ngưỡng D-055: 94/87/95/95). File seed không nằm trong phạm vi coverage (chỉ `src/`).
- **Frontend** (không đổi mã): lint, typecheck, `format:check` đạt.
- **E2E** (`E2E_API_PORT=4150 E2E_WEB_PORT=3150 E2E_BROWSER_CHANNEL=msedge`, DB tạm migrate + seed CƠ BẢN một lần, SMTP trỏ Mailpit tạm): 39/39 đạt (38 `chromium` + 1 `mobile-390`; `webkit-smoke` bỏ qua vì dùng Edge), 3,3 phút.
- **`seed:rich` trên DB tạm đã có seed cơ bản:** lần 1 5,4 giây (wall 6,9 giây; lần chạy khác 5,5 giây): 120 sản phẩm, 150 khách, 163 địa chỉ, 139 wishlist, 300 đơn (696 dòng hàng, 1.389 dòng lịch sử, 178 payment, 46 lượt dùng mã, 46 ghi chú), 354-358 đánh giá, 40 tin nhắn liên hệ, 3.501-3.507 bản ghi mới; lần 2 4,4-4,9 giây, **0 bản ghi mới**. Chạy lại seed cơ bản sau seed nhiều vẫn thành công (161 sản phẩm, 300 đơn rich, không đổi). `NODE_ENV=production` bị từ chối (mã thoát 1). Phân bố đơn: 237 DELIVERED, 39 CANCELLED, 8 SHIPPING, 5 RETURNED, 4 FAILED_DELIVERY, 3 PROCESSING, 2 RETURN_REQUESTED, 1 CONFIRMED, 1 PENDING_PAYMENT; đánh giá: 180 năm sao, 108 bốn sao, 42 ba sao, 16 hai sao, 8 một sao (7 ẩn).
- **Demo một lệnh** (`docker compose -f docker-compose.demo.yml up --build -d`, có cache lớp build): 2 phút 32 giây tới khi backend khỏe và frontend chạy; `init` thoát 0 (migrate, seed cơ bản, seed nhiều 3,1 giây, generator 1.500 đơn trong 1 giây). Qua <http://localhost:3300>: `/api/v1/products` tổng 158 sản phẩm hiển thị (161 trừ 3 bản nháp/lưu trữ/xóa mềm của seed cơ bản), 25 danh mục, trang chủ và `/danh-muc/ca-phe-hat` 200, `GET /products/am-rot-co-ngong-inox/reviews` trả đánh giá thật (4,6 sao, 5 đánh giá), `/admin/analytics/overview` có số (30 ngày: doanh thu 486.964.000 VND, 508 đơn đã thanh toán, 597 đơn đặt). `down -v --rmi local` mất 2,7 giây, không còn container, volume, mạng hay image `beanbox-demo*`. Chưa kiểm bằng trình duyệt hiển thị đánh giá ở trang sản phẩm (đánh giá nạp phía client; chỉ kiểm API).
- **gitleaks** v8.30.0: `git` toàn bộ lịch sử (33 commit) 0 phát hiện, kể cả sau khi bỏ `wave3-plan` khỏi regex allowlist đường dẫn (`docs/wave3-plan.md` vẫn còn trong lịch sử nhưng không gây phát hiện nào, nên không cần khôi phục mục allowlist đó); `dir` trên bản sao cây làm việc (file đã theo dõi và chưa theo dõi, không ignore, đường dẫn tương đối) 0. Quét `dir` thẳng thư mục thật tìm thấy 33 mục giả trong file bị ignore (`.next/`, `backend/.env` của người dùng) và trong các file fixture vì đường dẫn tuyệt đối `/repo/...` không khớp regex `^backend/...` của allowlist; không phải rò rỉ mới.
- `docker compose config -q` đạt cho dev (`--profile app`), prod (env giả như CI, cả hai profile `backup`/`tools`) và demo.

## E2E (Playwright: chromium desktop, mobile-390, webkit-smoke; chạy cục bộ và trong CI)

Cài trình duyệt một lần: `npx playwright install chromium webkit` (trong `frontend/`; chỉ cần `chromium` nếu bỏ WebKit, xem dưới).

Chạy: `npm run test:e2e` trong `frontend/`.

**Cách ly cổng (tùy chọn).** Mặc định Playwright dùng backend ở cổng 4000 và frontend ở 3000, và dùng lại server đang chạy ở các cổng đó (`reuseExistingServer`). Nếu cổng 4000/3000 đang bị một backend/frontend dev khác chiếm (có thể chạy thiếu `AUTH_RATE_LIMIT_PER_MIN=30` nên dính 429), đặt `E2E_API_PORT` và `E2E_WEB_PORT` để Playwright tự khởi động một cặp server riêng với đúng env E2E, không đụng tiến trình đang chạy:

```bash
cd frontend
E2E_API_PORT=4100 E2E_WEB_PORT=3100 npm run test:e2e
# PowerShell: $env:E2E_API_PORT=4100; $env:E2E_WEB_PORT=3100; npm run test:e2e
```

Khi đặt, backend chạy với `PORT`, `FRONTEND_ORIGINS` và `WEB_APP_URL` khớp cổng web; frontend chạy `next dev -p <E2E_WEB_PORT>` với `API_INTERNAL_URL` trỏ cổng API; `e2e/helpers.ts` gọi API ở `E2E_API_PORT`. Cặp server mới dùng chung DB dev nên phải chọn cổng chưa ai dùng. Lưu ý: nếu đã có một `next dev` khác đang chạy trong cùng thư mục `frontend/` thì Next có thể từ chối khởi động bản thứ hai (đã kiểm chứng khi cổng 3000 trống, chưa kiểm chứng khi có bản dev khác đang chạy); khi đó dừng bản dev đó hoặc chạy E2E trên bản đã dựng qua `E2E_BASE_URL`. Không đặt hai biến thì hành vi như cũ (CI không đổi).

**Trong CI (D-033, job `e2e`).** Chạy sau khi `backend` và `frontend` xanh, trên runner Linux với Chromium và WebKit do Playwright cài (`npx playwright install --with-deps chromium webkit`, thư mục `~/.cache/ms-playwright` có cache theo phiên bản `@playwright/test`; D-083). Postgres và Mailpit là service của job; job `npm ci` cả hai phía, chạy `prisma generate`, `migrate deploy` và seed bằng mật khẩu GIẢ chỉ dành cho CI (đặt trong env của job, không dùng ở nơi khác). Rate limit đặt hàng/mã/quote nới lên 200/phút và nhóm auth lên 30/phút (`AUTH_RATE_LIMIT_PER_MIN`) để E2E không chạm giới hạn. Khi `CI` được đặt, Playwright không dùng lại server có sẵn, thử lại 1 lần (`retries: 1`) và xuất báo cáo HTML; job tải `playwright-report` và `test-results` lên artifact khi lỗi (giữ 7 ngày).

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
- SEO (D-064, Vitest, không cần backend): `app/noindex.test.ts` (canonical/robots danh mục: trang 1, trang 2, có lọc, tham số lạ; canonical trang chủ; ảnh OG của danh mục), `app/sitemap.test.ts` (`lastmod` sản phẩm/danh mục, không `changeFrequency`/`priority`), `features/catalog/jsonld.test.ts` (khóa bắt buộc, URL tuyệt đối, `ItemList`, escape `<`, không `shippingDetails`), `app/homepage.test.tsx` (trang chủ render khi API lỗi, `revalidate = 60`), `lib/og.test.tsx` (route OG trả `content-type: image/png` kèm nội dung PNG thật; ảnh SVG/hỏng/lỗi API lùi về ảnh mặc định; `fetchRasterImage` chặn URL ngoài `/uploads`, `..`, quá 2 MB). Test route OG dùng `// @vitest-environment node` (satori/resvg không chạy ổn trong jsdom) và kiểm `headers.get("content-type")`, không dùng `instanceof Response`.
- Kiểm tay production build (D-064): `API_INTERNAL_URL=<backend> NEXT_PUBLIC_SITE_URL=http://localhost:3100 npx next build && npx next start -p 3100`; `curl -sI` các URL `/san-pham/<slug lạ>` (404), slug cũ (308), `/opengraph-image` và `/san-pham/<slug>/opengraph-image` (200 `image/png`); `curl` HTML kiểm `og:image`, `canonical`, `ld+json` parse được. `next build` với backend tắt (`API_INTERNAL_URL=http://127.0.0.1:1`) phải pass và `/` phải là `○` (ISR).
- Kịch bản a11y (`frontend/e2e/a11y.spec.ts`, D-044, thêm 1 lượt đăng nhập customer): xem mục "Khả năng truy cập và Lighthouse".
- Kịch bản giao diện admin trên mobile (`frontend/e2e/admin-mobile.spec.ts`, D-048, thêm 1 lượt đăng nhập admin): tạo 1 đơn COD khách vãng lai qua API (`createGuestCodOrder`) để có dữ liệu chi tiết đơn, lấy id sản phẩm, mã giảm giá, người dùng, tin nhắn liên hệ từ href đầu tiên của danh sách, rồi duyệt 21 trang `/admin/**` (tổng quan, phân tích kinh doanh, đơn + chi tiết + in, sản phẩm + mới + sửa, tồn kho + lịch sử, mã giảm giá + mới + sửa, danh mục, thương hiệu, đánh giá, liên hệ + chi tiết, người dùng + chi tiết, cài đặt, nhật ký) ở 390x844 và 768x1024, khẳng định `scrollWidth <= clientWidth` (không dung sai; khẳng định mềm nên một lần chạy liệt kê mọi trang lỗi kèm phần tử gây tràn). Ở 390 còn kiểm menu admin mở được và link nằm trong viewport, nút "Thêm sản phẩm" hiện đủ, hộp thoại điều chỉnh tồn kho vừa màn hình. Để tái hiện lỗi chuỗi dài, chạy spec trên DB tạm đã UPDATE sẵn email/slug/SKU/mã giảm giá thành chuỗi dài không khoảng trắng (không làm trên DB dev).
- Form liên hệ giới hạn 3 lần/10 phút/IP: chạy E2E quá 3 lần trong 10 phút sẽ gặp 429 ở kịch bản liên hệ; khởi động lại backend để xóa bộ đếm.
- Test dùng DB dev: mỗi lần chạy tạo đơn mới (dùng email/SĐT ngẫu nhiên) và hủy lại để hoàn kho. Nếu test chết giữa chừng có thể còn đơn `CONFIRMED`/`PENDING`: hủy ở `/admin/don-hang`.
- Máy chặn chạy file tải về (Windows "Application Control policy has blocked this file"): đặt `E2E_BROWSER_CHANNEL=msedge` (hoặc `chrome`) để dùng trình duyệt Chromium đã cài sẵn.

### Warm-up khởi động nguội, project mobile và WebKit (D-083)

**Warm-up (`e2e/global-setup.ts`).** `next dev` biên dịch từng route ở lần gọi đầu; webServer chỉ chờ một URL nên test đầu tiên sau khi server dev vừa khởi động vừa chờ biên dịch trang sản phẩm/giỏ/thanh toán vừa gọi `POST /cart/items` qua rewrite khi server còn bận, và thỉnh thoảng đỏ (đã ghi ở các đợt trước: `POST /cart/items` 404). Đo trên máy này: lần đầu gọi `/danh-muc/ca-phe-hat` sau khi xóa `.next/dev` mất 7,3 giây, các lần sau 0,2-0,6 giây. Cách sửa: `globalSetup` (chạy sau webServer, trước test) gọi QUA frontend, mỗi bước phải trả đúng mã 2 lần liên tiếp, timeout 120 giây/bước, log từng bước dạng `[warm-up] ...`: `GET /api/v1/health` và `GET /api/v1/products` (rewrite), `POST /api/v1/cart/items` thân rỗng (phải ra 400 JSON của backend; 404 nghĩa là rewrite chưa sẵn sàng), rồi các trang `/`, `/danh-muc/ca-phe-hat`, `/san-pham/<slug>`, `/gio-hang`, `/thanh-toan`, `/tra-cuu-don-hang`, `/dang-nhap`, `/admin`. `webServer.url` của frontend cũng là `/api/v1/health` nên Playwright chỉ coi frontend sẵn sàng khi rewrite chạy. Không dùng sleep cố định (chỉ khoảng thăm dò 0,5 giây giữa các lần thử lại). Warm-up mất khoảng 16-21 giây khi nguội. Giới hạn trung thực: không tái hiện được 404 ở mức HTTP thuần (POST đồng thời với biên dịch trang mới: 0 lỗi/56 lần) nên cơ chế 404 chính xác của Next chưa xác định; biện pháp loại bỏ điều kiện "biên dịch lúc test chạy". Sau khi sửa: `guest-order.spec.ts` khởi động lạnh 5 lần (xóa `.next/dev` mỗi lần) 5/5 đạt và cả bộ 2 lần 39/39 đạt. Lưu ý: trước khi sửa, 4 lần khởi động lạnh trong phiên này cũng đạt, tức là lỗi chập chờn chưa từng tái hiện nên "0 lỗi" sau sửa chưa phải bằng chứng thống kê mạnh.

**Project (`playwright.config.ts`).**

| Project | Thiết bị | Spec | Điều kiện |
| --- | --- | --- | --- |
| `chromium` | Desktop Chrome | mọi spec trừ `purchase-mobile.spec.ts` | luôn có |
| `mobile-390` | Pixel 7 chỉnh 390x844, `isMobile`, `hasTouch`, cùng kênh với `chromium` | `purchase-mobile.spec.ts` | luôn có |
| `webkit-smoke` | `devices["iPhone 13"]` (WebKit) | `purchase-mobile.spec.ts` | bỏ khi `E2E_SKIP_WEBKIT=1`, hoặc khi đặt `E2E_BROWSER_CHANNEL` mà không ép `E2E_SKIP_WEBKIT=0` |

`purchase-mobile.spec.ts`: menu "Danh mục" của header mobile -> "Cà phê hạt" -> sản phẩm còn hàng -> thêm giỏ (ngăn kéo mini-cart) -> giỏ -> thanh toán COD -> trang thành công, kiểm `scrollWidth <= clientWidth` ở trang chủ, danh mục, chi tiết sản phẩm, giỏ, thanh toán và trang thành công; không đăng nhập (không tốn lượt limiter auth); hủy đơn qua API ở cuối. Cả bộ hiện là 39 test (38 chromium + 1 mobile-390), thêm 1 test webkit-smoke khi WebKit có mặt. Lệnh chọn project: `npx playwright test --project=mobile-390`. Webserver cục bộ nay nới limiter đặt đơn/mã/quote lên 200/phút (ưu tiên env) vì các project cùng đặt đơn từ một IP.

**WebKit trên máy chặn file tải về.** Windows Application Control chặn trình duyệt do Playwright tải về, nên khi dùng `E2E_BROWSER_CHANNEL=msedge` project `webkit-smoke` bị bỏ qua. Kiểm WebKit cục bộ bằng image chính thức đúng phiên bản `@playwright/test` (hiện 1.65.0, `mcr.microsoft.com/playwright:v1.65.0-noble`, khoảng 2 GB, xóa bằng `docker rmi` khi xong). Cách đã dùng: server chạy trên máy chủ (backend `HOST=0.0.0.0`, `next dev`), chỉ Playwright chạy trong container; một forwarder TCP nhỏ trong container đưa `127.0.0.1:<cổng>` tới `host.docker.internal:<cổng>` nên trình duyệt trong container vẫn dùng origin `http://localhost:<cổng web>` (đúng CORS/CSP/Next dev) và helper gọi API ở `127.0.0.1:<cổng API>`; Playwright dùng lại server có sẵn (`reuseExistingServer`):

```bash
# 1) máy chủ: DB tạm + backend (HOST=0.0.0.0, cổng 4300) + next dev (cổng 3300, API_INTERNAL_URL=http://localhost:4300)
# 2) forwarder, đặt ở file ngoài repo (fwd.js): với mỗi cổng trong FWD_PORTS,
#    net.createServer(c => { const s = net.connect(PORT, "host.docker.internal"); c.pipe(s).pipe(c); }).listen(PORT, "127.0.0.1")
docker run --rm --ipc=host --add-host=host.docker.internal:host-gateway \
  -v <repo>:/repo -v <thư-mục-chứa-fwd.js>:/fwd:ro -w /repo/frontend \
  -e FWD_PORTS=3300,4300 -e E2E_API_PORT=4300 -e E2E_WEB_PORT=3300 -e E2E_SKIP_WEBKIT=0 \
  mcr.microsoft.com/playwright:v1.65.0-noble \
  bash -c 'node /fwd/fwd.js & sleep 1; npx playwright test --project=webkit-smoke --project=mobile-390'
```

Trong container `mobile-390` dùng Chromium của image (Linux), không phải Edge. Kết quả ở mục "Kết quả kiểm Đợt 5 task 2".

### Đo tải đặt hàng đồng thời cùng SKU (D-083)

Script `backend/scripts/load-order-concurrency.ts` (chỉ `fetch`, không phụ thuộc mới). Mỗi lượt: đặt tồn của 1 biến thể = S (20), tạo trước N giỏ guest (100, mỗi giỏ 1 cái biến thể đó, email/SĐT/Idempotency-Key UUID v4 tất định theo lượt và chỉ số), bắn N `POST /orders` COD với tối đa C request cùng bay, rồi kiểm bằng SQL: đúng S đơn 201, N-S đơn 409 `OUT_OF_STOCK`, 0 lỗi 5xx, tồn cuối = 0, số `InventoryMovement` `ORDER_RESERVE` tăng đúng S, số dòng `Order` = S, `pg_stat_database.deadlocks` không tăng. In JSON (cấu hình, từng lượt, trung vị theo C); mã thoát 1 nếu có lượt sai. Rào an toàn: cần `LOAD_API_URL` và `LOAD_DATABASE_URL`, chỉ localhost, từ chối cổng API 4000/4100 và DB localhost:5432 trừ khi có `LOAD_ALLOW_PROTECTED=1`. Biến tùy chọn: `LOAD_STOCK`, `LOAD_ORDERS`, `LOAD_CONCURRENCY` ("25,50,100"), `LOAD_REPEATS` (3), `LOAD_SKU`, `LOAD_TAG`.

Tái lập (DB và backend tạm; container Postgres 17 tạm nhớ `docker rm -fv` khi xong):

```bash
docker run -d --name bb-load-pg --shm-size=256m -e POSTGRES_USER=beanbox -e POSTGRES_PASSWORD=<tạm> -e POSTGRES_DB=beanbox_load -p 127.0.0.1:5440:5432 postgres:17
cd backend
export DATABASE_URL=postgresql://beanbox:<tạm>@127.0.0.1:5440/beanbox_load
npx prisma migrate deploy && npm run prisma:seed
PORT=4300 JOBS_ENABLED=false GENERAL_RATE_LIMIT_PER_MIN=100000 ORDER_RATE_LIMIT_PER_MIN=100000 \
  QUOTE_RATE_LIMIT_PER_MIN=100000 COUPON_RATE_LIMIT_PER_MIN=100000 GUEST_COD_MAX_OPEN=100 \
  npx tsx src/server.ts &            # backend tạm (không phải `tsx watch`)
LOAD_API_URL=http://127.0.0.1:4300 LOAD_DATABASE_URL=$DATABASE_URL npx tsx scripts/load-order-concurrency.ts
```

Số đo (2026-11-23; máy: Intel Core i5-13450HX 10 nhân/16 luồng, 15,6 GB RAM, Windows 11, Docker Desktop 29.9.2, Node 24.14.0; Postgres 17.11 trong Docker với `shared_buffers=128MB` mặc định, `max_connections=100`; backend chạy trên máy chủ, pool `pg` mặc định 10 kết nối; Mailpit không chạy nên email xác nhận đơn gửi lỗi nền; client và server cùng một máy nên tranh CPU với nhau). SKU `ACD-250-PHIN`, N = 100 đơn, S = 20 tồn, mỗi mức C chạy 3 lần, bảng là trung vị của 3 lần:

| C (đồng thời) | 201 | 409 OUT_OF_STOCK | 5xx | tồn cuối | ORDER_RESERVE | deadlock | p50 (ms) | p95 (ms) | p99 (ms) | tổng (ms) | thông lượng (đơn/giây) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 25 | 20 | 80 | 0 | 0 | 20 | 0 | 481 | 1388 | 1454 | 2739 | 36,5 |
| 50 | 20 | 80 | 0 | 0 | 20 | 0 | 975 | 1673 | 1733 | 2535 | 39,4 |
| 100 | 20 | 80 | 0 | 0 | 20 | 0 | 1748 | 2330 | 2372 | 2406 | 41,6 |

Cả 9 lượt đạt mọi kiểm tra; log Postgres không có `deadlock` hay `ERROR`. Đọc số: độ trễ tăng gần tuyến tính theo C còn thông lượng gần phẳng (khoảng 40 đơn/giây): điểm nghẽn là pool 10 kết nối của backend cộng khóa dòng biến thể (`FOR UPDATE` trong `placeOrder`), không phải lỗi đúng đắn (đây là suy luận từ hình dạng số đo, chưa profile riêng); mỗi yêu cầu có kiểm tra giỏ, báo giá và giao dịch nên con số tuyệt đối chỉ có ý nghĩa so sánh trên cùng máy. Test tương ứng trong bộ test nhanh: `orders.integration.test.ts` ("race tồn kho": tồn 3, 5 giỏ guest song song -> đúng 3 đơn, 2 `OUT_OF_STOCK`, tồn 0, 3 movement) và `loadOrderConcurrency.test.ts` (rào an toàn, phân vị, UUID tất định của script).

### Lưu ý rate limit

Mỗi lần chạy E2E đầy đủ có 7 lượt đăng nhập (accounts 2, m6b 2, csp 1, a11y 1, admin-mobile 1). Limiter nhóm auth mặc định 5/phút/IP (`AUTH_RATE_LIMIT_PER_MIN`, D-045) nên Playwright khởi động backend với `AUTH_RATE_LIMIT_PER_MIN=30` (CI job `e2e` cũng đặt 30): chạy lại liên tiếp hoặc CI thử lại cả bộ không còn dính 429 đăng nhập. Nếu dùng lại backend dev đang chạy sẵn (`reuseExistingServer`) thì backend đó phải chạy với biến này (đặt trong `backend/.env`), nếu không vẫn bị giới hạn 5/phút.
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

## Kiểm demo một lệnh (D-066)

Chạy: `docker compose -f docker-compose.demo.yml up --build -d`, mở <http://localhost:3300>, Mailpit <http://localhost:8026>; dọn: `docker compose -f docker-compose.demo.yml down -v --rmi local`. Chỉ thao tác project `beanbox-demo`; không dùng lệnh prune toàn cục.

Kiểm bằng script Playwright (Edge) ngoài repo và bằng lệnh:

- Đếm đơn trước và sau `down` + `up` (giữ volume): `docker compose -f docker-compose.demo.yml exec db psql -U beanbox -d beanbox -tAc "select count(*) from \"Order\""`; số đơn không đổi.
- Init với `NODE_ENV=production`: `docker compose -f docker-compose.demo.yml run --rm --no-deps -e NODE_ENV=production init` thoát 1; backend cũng thoát 1 vì env demo không hợp lệ ở production.
- Image runtime không có `scripts/`: `docker build --target runtime -t tmp backend`, rồi `docker run --rm --entrypoint sh tmp -c "ls /app"`.
- Test: `backend/tests/demoDbGuard.test.ts` (rào chấp nhận `db:5432`, tham số `--skip-if-exists`).

Kết quả (2026-11-23, Windows, Docker Desktop, Edge): build không cache 280 giây (cộng khoảng 20 giây khởi động; chưa tính tải image nền); `down -v` rồi `up --build` có cache: trang chủ 200 sau 18 giây; 4 container chạy dùng khoảng 320 MB RAM. Init thoát 0 (1.500 đơn, 4.329 dòng hàng, 138 user demo, sinh trong 1 giây). Trang chủ có 18 link sản phẩm; đăng nhập 3 tài khoản; 2FA setup hiện QR và khóa; `/admin` có biểu đồ 30 cột, `/admin/phan-tich` có số liệu; checkout: VNPay, MoMo, chuyển khoản bật, Stripe khóa; VNPay giả -> cổng giả -> "Thanh toán thành công"; chuyển khoản hiện QR và cảnh báo "KHÔNG chuyển tiền thật"; Mailpit có email đặt hàng.

## Chụp ảnh màn hình cho README

Ảnh trong `docs/screenshots/` do script Playwright riêng (`npm run screenshots` trong `frontend/`, config `playwright.screenshots.config.ts`) tạo ra, không phải E2E và không chạy trong CI. Script chỉ chạy trên DB tạm vừa seed; cách chạy ở [docs/screenshots/README.md](screenshots/README.md).

### Test Đợt 4 nhóm 2 (D-074)

- **Vitest:** `components/ui/Dialog.test.tsx` (mở/đóng, aria-labelledby/describedby, Escape đóng và bị chặn khi `busy`, trả focus về phần tử kích hoạt, khóa cuộn nền theo bộ đếm, nút đóng có nhãn, hồi quy StrictMode mount lại), `features/checkout/hooks/checkoutHooks.test.tsx` (hook `useCheckoutSubmit` và các hook nhỏ). Test hiện có của các hộp thoại và `CheckoutView.test.tsx`/`AdminSettings.test.tsx` giữ nguyên kỳ vọng. `vitest.setup.ts` polyfill tối thiểu `showModal()`/`close()` cho jsdom (chỉ bật/tắt `open`; không mô phỏng top layer, inert, focus trap).
- **Kiểm tay bằng Playwright + Edge (script tạm, đã xóa):** mini-cart (ngăn kéo), xóa tài khoản, hủy đơn (tra cứu), nhập CSV, điều chỉnh tồn kho, đổi trạng thái đơn admin; ở 1280 và 390: axe (wcag2a/aa, 21a/aa) 0 serious/critical khi hộp mở; 25 lượt Tab/Shift+Tab mỗi hộp không bao giờ rơi vào nền (activeElement chỉ trong hộp hoặc body); Escape đóng; trả focus về nút kích hoạt (trừ mini-cart: nút "Thêm vào giỏ" bị disable lúc đang thêm nên `activeElement` đã là body khi hộp mở, hành vi này có từ bản cũ); `body.style.overflow` là `hidden` khi mở và được nhả khi đóng.

### Kết quả kiểm Đợt 4 (nhóm 2) (2026-11-22, Windows, Postgres 17 tạm, Edge)

- **Frontend**: `lint`, `typecheck`, `format:check`, `build` sạch (bảng route `next build` không đổi kiểu route); `test:coverage` 118 file, 1030 test đạt; statements 86,2 %, branches 80,4 %, functions 85,78 %, lines 88,78 % (ngưỡng D-055 đạt). Khi chạy song song 118 worker, thỉnh thoảng một test chạm timeout (đã gặp `AdminProductVariants`, `AdminCouponForm`; chạy riêng đạt, chạy lại cả bộ đạt).
- **Backend** (chỉ gom helper; `TEST_DATABASE_URL` trỏ DB test tạm): `lint`, `typecheck`, `format:check`, `build` sạch; `test:coverage` 99 file, 2036 test đạt; statements 96,18 %, branches 88,52 %, functions 97,89 %, lines 97,76 %.
- **E2E toàn bộ** (`E2E_API_PORT=4100 E2E_WEB_PORT=3100 E2E_BROWSER_CHANNEL=msedge`, mỗi lượt một DB tạm migrate + seed mới): 38/38 đạt, hai lượt liên tiếp, 0 lỗi.
- **Chưa kiểm:** Safari, Firefox; CI trên runner GitHub thật.

### Test Đợt 4 nhóm 3 (D-075, D-076, D-077)

- **Backend, cache (D-075):** `cacheControl.integration.test.ts` (catalog thành công có đúng header công khai kể cả HEAD và request kèm Authorization; 404/400 luôn `no-store`; hồi quy `/cart`, `/me*`, `/wishlist`, `/admin/*`, `/checkout/*`, `POST /cart/items` vẫn `no-store`), `httpCache.integration.test.ts` (`/uploads`: 32 hex + `.webp` -> `immutable` 1 năm, tên cố định và hex đuôi svg -> 1 ngày, vẫn `nosniff`, dotfile 404; `getShopSettings`: 2 lần đọc trong TTL -> 1 truy vấn (spy), hết TTL bằng đồng hồ giả -> đọc lại, trong transaction không dùng cache, trả bản sao), `adminSettings.integration.test.ts` (PUT xóa cache: đọc ngay sau PUT thấy giá trị mới). `productCompare`/`productRecommendations` cập nhật kỳ vọng header.
- **Backend, khóa mã đơn (D-076):** `orderLookupLock.test.ts` (đơn vị: 4 sai chưa khóa, 5 sai khóa 900 giây, mở khóa đúng sau 15 phút bằng đồng hồ tiêm, cửa sổ đếm 15 phút, thành công xóa bộ đếm, sai khi đang khóa không kéo dài, khóa độc lập theo mã, giới hạn kích thước (nhỏ và mặc định 10.000), `guardGuestLookup` (404 tính, 400/lỗi lạ không tính, 409 xóa, người đã đăng nhập bỏ qua)) và `orderLookupLock.integration.test.ts` (bảng 7 endpoint: track, hủy, GET và claim chuyển khoản, tạo thanh toán VNPay/MoMo/Stripe: 5 SĐT sai -> 404, lần 6 với SĐT ĐÚNG -> 429 `ORDER_LOOKUP_LOCKED` + `Retry-After: 900` + `no-store`, còn khóa ở giây thứ 899, mở khóa ở 900; mã không tồn tại cùng hành vi; đúng giữa chừng xóa bộ đếm; lần sai cộng dồn giữa các endpoint và chữ thường/hoa; mã khác không bị ảnh hưởng; SĐT sai định dạng không tính; người đăng nhập xem đơn bằng token không bị khóa).
- **Backend, Mua lại (D-077):** `reorder.integration.test.ts` (đủ hàng + giá hiện hành, điều chỉnh, bỏ qua `OUT_OF_STOCK`/`DISCONTINUED` (ngừng bán, sản phẩm nháp, đã xóa), cộng dồn với giỏ và trần 20, gọi lặp không vượt tồn kho, gọi đồng thời 3 lần không vượt tồn kho, đơn đã hủy, mã chữ thường, đơn người khác/không tồn tại 404 cùng thông báo, 401). `securityAuthz.integration.test.ts`: route mới nằm trong `MUST_BE_AUTH`, IDOR: customer khác/Staff/Admin mua lại đơn người khác -> 404.
- **Frontend (Vitest):** `AccountOrders.test.tsx` (Mua lại: gọi đúng URL, cập nhật giỏ bằng `replaceCart`, tóm tắt, dòng điều chỉnh/bỏ qua kèm lý do, không thêm được dòng nào, busy chặn bấm lặp, lỗi `role="alert"`), `TrackOrder.test.tsx` (thông báo khóa kèm số phút khi tra cứu và khi hủy), `labels.test.ts` (`orderLookupLockedMessage`), `MiniCartFocus.test.tsx` (dựng thật `CartProvider` + `AddToCartPanel` + `HeaderCart` + `MiniCart`: đóng bằng Escape trả focus về nút "Thêm vào giỏ" dù nút bị disable lúc đang thêm; về nút giỏ ở header khi nút kích hoạt bị gỡ khỏi DOM hoặc đang disable).
- **E2E:** `accounts.spec.ts` lượt customer: tạo đơn COD qua API (token đăng nhập API riêng), vào chi tiết đơn, bấm "Mua lại", thấy "Đã thêm 1 sản phẩm vào giỏ hàng.", theo link "Xem giỏ hàng" và thấy sản phẩm trong `/gio-hang`; dọn giỏ cuối lượt.
- **Lưu ý flaky:** `AdminCouponForm.test.tsx > PERCENT: mã tự uppercase...` (có từ trước, không liên quan nhóm này) chậm 7-10 giây và quá thời gian một lần khi chạy `test:coverage` cùng lúc với tải nặng khác (backend test); chạy lại riêng hoặc khi máy rảnh đều qua. Nên tăng timeout hoặc tối ưu test này khi sửa vùng đó.

### Kết quả kiểm Đợt 4 (nhóm 3) (2026-11-22, Windows, Postgres 17 tạm, Edge)

- **Backend** (`TEST_DATABASE_URL` trỏ DB test tạm `postgres:17 --shm-size=256m`): `lint`, `typecheck`, `format:check`, `build` sạch; `test:coverage` 103 file, 2091 test đạt; statements 96,25 %, branches 88,66 %, functions 97,87 %, lines 97,8 % (ngưỡng D-055: 94/87/95/95).
- **Frontend:** `lint`, `typecheck`, `format:check`, `build` sạch; `test:coverage` 119 file, 1041 test đạt (một lần đầu có 1 test cũ quá thời gian dưới tải, xem mục flaky); statements 86,29 %, branches 80,48 %, functions 85,93 %, lines 88,85 %.
- **E2E** (`accounts`, `guest-order`, `m6b`, `compare`, `a11y`; DB tạm migrate + seed mới; cổng API 4200 và web 3200 vì 4100 đang do một `tsx watch` dev của người dùng chiếm): 28/28 đạt.
- **curl** trên backend tạm (cổng 4300): `/products`, `/products/:slug`, `/products/compare`, `/products/:slug/bought-together`, `/categories`, `/brands`, `/search/suggest` -> `public, max-age=30, s-maxage=60, stale-while-revalidate=120`; `/products/khong-co` 404, `/cart`, `/me` -> `no-store`; `/settings/public` -> `public, max-age=300`; `/uploads/seed/ca-phe-hat.svg` -> `public, max-age=86400` + `nosniff`; `GET /orders/track` 5 lần sai -> 404 x5 rồi 429 `ORDER_LOOKUP_LOCKED`, `Retry-After: 900`.
- **Chưa kiểm:** ảnh upload tên hex thật qua `POST /admin/uploads` bằng trình duyệt (đã có test với file hex dựng sẵn); nhiều instance backend (cache settings và khóa mã đơn là trong tiến trình).

### Test Đợt 4 nhóm 4 (D-078)

- **Backend, công thức (đơn vị):** `cost.test.ts` (bình quân di động: chưa có giá vốn, tồn cũ 0 hoặc âm, một lần và nhiều lần nhập liên tiếp, làm tròn nửa lên, đơn giá 0, số lớn không tràn, tham số sai; `allocateDiscount`: đủ giá vốn = đúng giảm giá, một phần theo tỷ lệ, 0; `profitFigures` với số cố định: doanh thu thuần 280.000, lãi 90.000, biên 0,3214, độ phủ 0,8571, và các ca 0/âm).
- **Backend, tích hợp (`grossProfit.integration.test.ts`, 19 test):** nhập hàng Admin cập nhật `avgCost` + `InventoryMovement.unitCost` + audit (diff `avgCost`, `unitCost`); đặt đơn, hủy đơn hoàn kho, hao hụt, kiểm kê, điều chỉnh KHÔNG đổi `avgCost`; Admin thiếu `unitCost`/`unitCost` với lý do khác/giá trị âm, thập phân, quá lớn -> 400; Staff nhập hàng không đơn giá được (giữ `avgCost`), gửi `unitCost` -> 403; nhập song song 4 lượt không mất cập nhật; Admin sửa `avgCost` ở tạo/sửa biến thể kèm audit `variant.cost_set` (cũ/mới, `null` xóa, không đổi thì không ghi), Staff gửi -> 403; Staff không thấy khóa `avgCost`/`unitCost` ở `GET /admin/inventory`, `/admin/inventory/movements`, chi tiết/danh sách sản phẩm, response điều chỉnh, sửa biến thể; không API đơn hàng nào (tra cứu khách, chi tiết/danh sách admin cho Staff và Admin) có `unitCost`; đặt đơn chụp `unitCost` đúng, đổi giá vốn sau đó không đổi dòng đơn, biến thể chưa có giá vốn -> `null`, 5 đơn đặt song song cùng biến thể đều chụp đúng, đặt đơn đồng thời với nhập hàng chỉ ra một trong hai kết quả hợp lệ (giá trước hoặc sau nhập); analytics dựng tay năm 2022 (2 đơn đã thanh toán có giá vốn một phần + đơn hủy + đơn chưa thanh toán + 1 đơn kỳ trước) khớp số cộng tay: lãi gộp 90.000 (+80 % so kỳ trước), biên 0,3214 (-17,9 điểm), độ phủ 0,8571 (-14,3 điểm), top sản phẩm (p1 vốn 190.000, lãi 90.000, p2 không giá vốn -> `null`), tồn kho (`stockCostValue` +650.000, `variantsWithoutCost` +1), kỳ không dữ liệu = 0 và `null`, đơn cũ không `unitCost` làm độ phủ < 1; CSV xuất overview/top-products/inventory đúng cột và số; Staff 403 ở analytics; CSV sản phẩm: xuất có cột `avg_cost` cuối, khứ hồi mọi dòng `unchanged`, nhập đổi/xóa `avg_cost` + audit, giá trị sai -> 422, file 16 cột cũ vẫn hợp lệ và không đụng giá vốn. Cập nhật kỳ vọng cũ (thêm khóa/cột mới): `adminAnalytics`, `adminAnalyticsBreakdown`, `adminAnalyticsStep3`, `adminAnalyticsStep4`, `adminProductsCsv`, `productsCsv`, `analyticsRange`.
- **Frontend (Vitest, `GrossProfit.test.tsx`, 14 test + 1 KPI trong `AdminAnalytics.test.tsx`):** `projectedAvgCost`; `StockAdjustDialog` (Admin: nhập hàng bắt buộc đơn giá, hiện giá vốn hiện tại và dự kiến, body có `unitCost`, đơn giá âm bị chặn, lỗi server ở ô; chỉ lý do nhập hàng có ô; Staff (không có khóa `avgCost`) không thấy ô và không gửi `unitCost`); `VariantDialog` (ẩn với Staff, Admin sửa phải xác nhận, để trống = `null`, giá trị sai bị chặn, tạo mới có giá vốn ban đầu); top sản phẩm (cột lợi nhuận, biên, "Chưa có giá vốn"); khối tồn kho (giá trị theo giá vốn + số biến thể chưa có); KPI "Lợi nhuận gộp", "Biên lợi nhuận gộp", "Độ phủ giá vốn". Fixture cũ thêm trường mới.
- **E2E:** `m6b.spec.ts` (phiên admin sẵn có, không thêm lượt đăng nhập): `/admin/phan-tich` thấy thẻ "Lợi nhuận gộp" (ghi chú "Chỉ tính dòng có giá vốn") và "Độ phủ giá vốn"; CSV top sản phẩm có 4 cột mới; `/admin/ton-kho` nhập hàng có đơn giá nhập, thấy "Giá vốn mới dự kiến", lưu được.
- **Dữ liệu demo kiểm tay:** seed rồi `generate-demo-orders.ts --orders 3000 --days 90 --seed 7` trên DB tạm: 8828/8828 dòng hàng có `unitCost`; 30 ngày gần nhất doanh thu 1.122.118.100 VND, lãi gộp 445.610.300 VND (biên 39,9 %, độ phủ 100 %), giá trị tồn theo giá niêm yết 645.888.000 so với theo giá vốn 386.733.300.

### Kết quả kiểm Đợt 4 (nhóm 4) (2026-11-23, Windows, Postgres 17 tạm, Edge)

- **Migration** `d078_avg_cost` trên DB tạm: `prisma migrate deploy` áp thành công, `prisma migrate diff` giữa DB và `schema.prisma` = "No difference detected" (drift 0).
- **Backend** (`TEST_DATABASE_URL` trỏ DB test tạm `postgres:17 --shm-size=256m`): `lint`, `typecheck`, `format:check`, `build` sạch; `test:coverage` 105 file, 2125 test đạt; statements 96,28 %, branches 89,1 %, functions 97,89 %, lines 97,83 % (ngưỡng D-055: 94/87/95/95).
- **Frontend:** `lint`, `typecheck`, `format:check`, `build` sạch; `test:coverage` 120 file, 1056 test đạt; statements 86,39 %, branches 80,76 %, functions 85,99 %, lines 88,91 %. Một lần chạy đầu có 1 test cũ quá thời gian dưới tải (`AdminCouponForm.test.tsx`, đã ghi ở mục flaky nhóm 3); chạy lại riêng và chạy lại toàn bộ đều đạt.
- **E2E** (`m6b`, `accounts`, `admin-mobile`; DB tạm migrate + seed mới; cổng API 4200 và web 3200 vì 4100 đang do tiến trình dev của người dùng chiếm; `E2E_BROWSER_CHANNEL=msedge`): 7/7 đạt. Lượt đầu 1 test đỏ do assertion quá rộng của chính bước mới (`getByRole("alert")` khớp bộ thông báo tuyến đường của Next), đã bỏ assertion đó và chạy lại sạch.
- **Chưa kiểm:** `a11y.spec.ts`, `compare`, `guest-order`, `csp`, `two-factor`, `payments-demo` chạy lại sau nhóm này (không đụng luồng của chúng); hiển thị bản in `/admin/phan-tich` với 3 thẻ KPI mới (chỉ kiểm bố cục qua axe + không cuộn ngang trong `m6b`); demo một lệnh bằng `docker-compose.demo.yml` thật (chỉ kiểm bằng seed + generator trên DB tạm).

### Kết quả kiểm tổng Đợt 4 (2026-11-23, Windows, Postgres 17 tạm, Edge)

- **Migration:** `migrate deploy` từ DB trống áp đủ `d068`, `d071_order_note` (`20261123100000`), `d078_avg_cost` (`20261123110000`); `migrate diff --from-migrations --to-schema --exit-code` = 0. Hai migration d071/d078 được đổi tên từ ngày tương lai (`20261124090000`, `20261125090000`) vì chưa commit và chưa áp lên DB dev.
- **Backend** (`TEST_DATABASE_URL` trỏ DB tạm `postgres:17 --shm-size=256m`, env như CI): `lint`, `typecheck`, `format:check`, `build` sạch; `test:coverage` 106 file, 2126 test đạt; statements 96,27 %, branches 89,1 %, functions 97,89 %, lines 97,81 % (ngưỡng D-055).
- **Frontend:** `lint`, `typecheck`, `format:check`, `build` sạch (bảng route không đổi kiểu); `test:coverage` 120 file, 1056 test đạt; statements 86,39 %, branches 80,76 %, functions 85,99 %, lines 88,91 %. `AdminCouponForm` không tái diễn lần này.
- **Docker/CI:** build `backend --target runtime` và `frontend` (tag tạm, đã `docker rmi`); `docker compose config -q` cho dev, prod (env giả như CI, kèm profile `backup`, `tools`) và demo đều 0; `actionlint` 0; `gitleaks git` (31 commit) không rò; `gitleaks dir .` chỉ báo trong tệp bị gitignore (`frontend/.next/**`, `backend/.env` cục bộ), không có trong tệp được theo dõi.
- **E2E toàn bộ** (`E2E_API_PORT=4200 E2E_WEB_PORT=3200 E2E_BROWSER_CHANNEL=msedge`, mỗi lượt DB tạm migrate + seed mới): 38/38 ở lượt 1; lượt 2 đỏ 1 test (`payments-demo` MoMo giả: `POST /payments/momo/create` trả 500 do `Failed to proxy ... ECONNRESET` ở rewrite của Next). Nguyên nhân: Node đóng socket keep-alive nhàn rỗi sau 5 giây, proxy tái dùng đúng lúc đó. Sửa: `backend/src/lib/serverTimeouts.ts` (`keepAliveTimeout` 65 giây, `headersTimeout` 66 giây, gọi ở `server.ts`) + test `serverTimeouts.test.ts`. Sau sửa: 38/38 hai lượt liên tiếp (lượt 3 và 4, 4,4-5,8 phút/lượt), 0 lỗi.
- **Demo một lệnh** (`docker-compose.demo.yml up --build -d`): 155 giây tới `http://localhost:3300` trả 200 (có cache lớp build một phần); `init` thoát 0; 1500 đơn, 4329/4329 dòng hàng có `unitCost`, 98/98 biến thể có `avgCost`. `/admin/phan-tich` hiện "Lợi nhuận gộp" = 222.310.400 đ (30 ngày). Kịch bản README bước 2 (VNPay giả), 3 (chuyển khoản), 4 (staff xác nhận tiền, đóng gói, giao, mã vận đơn tự sinh), 6 (phân tích) chạy bằng Playwright + Edge: 5/5. `down -v --rmi local` sạch.
- **Chức năng thật** (backend `tsx` cổng 4300 + `next dev` cổng 3400, DB tạm, script Node + Playwright, không thêm vào repo): 36/36 kiểm API và 15/15 kiểm giao diện đạt.
  - Nhóm 1: ghi chú nội bộ (staff thêm 201, admin thấy, staff xóa 403, admin xóa 204; khách, guest, `/me/export`, `/me/orders` không chứa nội dung; `noteCount`; audit không ghi nội dung); in 3 đơn (PDF in `emulateMedia print` đúng 3 trang, mỗi phiếu một trang); CSV sản phẩm: xuất 17 cột, sửa 1 giá và tồn, thêm 1 biến thể, 1 dòng lỗi -> xem trước `canApply=false` -> áp dụng 422 `IMPORT_HAS_ERRORS` (DB không đổi) -> bỏ dòng lỗi -> sai fingerprint 409 -> áp dụng 200; DB đúng giá/tồn, slug và SKU cũ không đổi, 2 movement ("Nhập CSV": `ADJUSTMENT` +5, `STOCKTAKE` +7), audit `product.import`; staff 403.
  - Nhóm 2: 5 hộp thoại (mini-cart, `CancelOrderDialog`, `DeleteAccountDialog`, `StockAdjustDialog`, `StatusDialog`) x desktop 1280 và 390: Tab/Shift+Tab không rơi vào phần nền, Escape đóng, focus trả về nút mở (mini-cart về nút "Thêm vào giỏ"), axe 0 serious/critical (10/10). Trang cài đặt lưu từng section: lưu "Phí vận chuyển" chỉ đổi `shipping.rates`, lưu "Thông tin liên hệ" chỉ đổi `store.contact`. Checkout COD, VNPay giả, chuyển khoản qua giao diện: đạt (cả trên DB tạm và demo).
  - Nhóm 3: `Cache-Control` catalog thành công `public, max-age=30, s-maxage=60, stale-while-revalidate=120` (kể cả HEAD và qua proxy Next); 404/400 `no-store`; `/cart`, `/me`, `/admin/*` `no-store`; `/uploads` tên hex `public, max-age=31536000, immutable`, ảnh seed `public, max-age=86400`. Đổi phí ship ở settings -> quote thấy ngay (20.000 -> 27.000). Khóa mã đơn: 5 lần sai (404) -> lần 6 (đúng SĐT) 429 `ORDER_LOOKUP_LOCKED`, `Retry-After: 900`, mã khác không bị khóa; giao diện tra cứu hiện "Bạn đã nhập sai thông tin đơn hàng quá nhiều lần...". "Mua lại": API và nút trong chi tiết đơn: có hàng vào giỏ, sản phẩm hết hàng bị bỏ qua với `OUT_OF_STOCK` và hiện lý do trên giao diện.
  - Nhóm 4: tồn 10 @ 50.000, nhập 10 @ 60.000 -> `avgCost` 55.000 (SQL); Staff gửi `unitCost` 403, Staff nhập hàng không đơn giá 200 và `avgCost` giữ nguyên; đặt đơn -> `OrderItem.unitCost` = 55.000; Staff (inventory, movements, products, chi tiết sản phẩm, đơn) và khách (đơn, export cá nhân) không thấy `avgCost`/`unitCost`; `kpis.grossProfit` của `/admin/analytics/overview` = 552.900 khớp cộng tay (1.263.000 - 710.100) và tổng `top-products`; CSV `avg_cost` = 55000 khứ hồi `unchanged`.
- **Chưa kiểm / hạn chế:** Safari, Firefox; CI trên runner GitHub thật; khóa mã đơn và cache settings là trong tiến trình (một instance). Bản in chỉ kiểm bằng `emulateMedia print` + PDF của Edge, không qua máy in thật.

### Test Đợt 5 task 1 (D-079..D-082)

- **Tắt êm (D-079):** `shutdown.test.ts` (đối tượng giả: thứ tự gọi server -> socket nhàn rỗi -> job -> DB -> exit; chờ job và server đang xử lý xong mới đóng DB; timeout tổng gọi `exit(1)`; gọi lần hai bị bỏ qua; mã thoát 0/1; bước lỗi vẫn chạy bước sau; handler `uncaughtException`/`unhandledRejection` log `fatal` rồi tắt êm 1, `SIGTERM`/`SIGINT` tắt êm 0) và `backgroundJobsStop.test.ts` (đồng hồ giả: `stopBackgroundJobs` chờ lượt đang chạy, không lên lịch lượt mới sau khi dừng, lỗi job không làm nó ném lỗi). `cleanup.integration.test.ts` kiểm dừng được và gọi lại an toàn.
- **Làm mới minPrice (D-080)** `saleRefresh.integration.test.ts` (đồng hồ tiêm, năm 2030): trước `saleStart` giá thường và job không ghi sản phẩm (`updatedAt` không đổi), sau mốc `minPrice` = giá sale và `/products?sort=price_asc` + lọc `maxPrice` phản ánh đúng, chạy lại idempotent, sau `saleEnd` về giá thường, biên đúng `saleStart`/`saleEnd` (còn sale) và +1 ms (hết), giới hạn số sản phẩm mỗi lượt, advisory lock bị giữ thì `skipped`. Test SQL đối soát: 9 ca (sale bound mở một đầu/cả hai đầu, biến thể tắt, biến thể xóa, không biến thể, hai biến thể sale lệch pha) x 11 mốc thời gian: sản phẩm bị SQL coi là lệch đúng bằng sản phẩm có `minPrice` khác `computeProductDenorm`, và sau job mọi `minPrice` khớp.
- **Ảnh đại diện (D-081):** `avatarUrl.test.ts` (validator: `/uploads` hợp lệ/không, `..`, `//`, query, hash, `%2e`, khoảng trắng, `\`, https đúng/sai host, host con và host giả mạo, user:pass, cổng, `#`, `http:`, `data:`, `javascript:`, quá dài); `me.integration.test.ts` (PATCH `/me`: 9 giá trị sai -> 400 field `avatarUrl`, giá trị cũ không đổi, `/uploads/...` được, https chỉ khi host nằm trong `AVATAR_URL_HOSTS` đặt tạm bằng `env`); FE `avatar.test.tsx` (allowlist, `validateAvatarUrl`, `Avatar` render ảnh hoặc chữ cái đầu) và `ProfileForm.test.tsx` (ảnh cũ không hợp lệ không hiển thị và không chặn sửa trường khác; `/uploads` hiển thị).
- **Độ tươi hạt (D-082):** `freshness.test.ts` (tuổi theo ngày VN: biên 00:00/23:59:59 giờ VN, ngày rang tương lai = 0, ngưỡng 30/31/90/91, `priceCartLine`), `roastFreshness.integration.test.ts` (HTTP: thêm giỏ lô quá hạn 409 `ITEM_UNAVAILABLE` + `reason ROAST_EXPIRED`, lô `roastDate` null và lô mới được; chi tiết sản phẩm có `roastStatus`/`maxQuantity` 0; đồng hồ tiêm: giỏ tại 59/90/91 ngày, `addItem` tại 90 được và 91 bị từ chối, quote có issue `ROAST_EXPIRED`, đặt đơn tại 91 bị từ chối và không trừ kho, tại 90 đặt được, mua lại bỏ qua lô quá hạn); FE `freshness.test.tsx` (nhãn, `AddToCartPanel` tươi/quá 30/quá 90 ngày, biến thể mặc định, dòng giỏ, thông báo lỗi). Giỏ dùng user (không dùng giỏ khách vãng lai vì giỏ guest hết hạn 30 ngày theo đồng hồ tiêm).
- **Kiểm thật tắt êm** (image `runtime` dựng tạm, DB tạm, mạng docker tạm, đã dọn): `docker stop` khi có một kết nối keep-alive nhàn rỗi: log "Tắt êm: SIGTERM" rồi "Đã tắt êm (exit 0)", mã thoát 0, 0,49 giây (trước đây có thể chờ tới 10 giây rồi bị SIGKILL do socket keep-alive 65 giây); ép `unhandledRejection` sau khi khởi động: log `fatal` (level 60) kèm stack, "Tắt êm: unhandledRejection", mã thoát 1. Trên Windows không gửi được SIGTERM thật tới tiến trình Node nên kiểm trong container Linux.
- **Dữ liệu seed (D-080/D-082):** DB tạm seed sạch (40 sản phẩm, 4 biến thể có sale): SQL đối soát cho 0 sản phẩm lệch tại `now` và khớp `computeProductDenorm` cả 40 sản phẩm; tại +400 ngày phát hiện 1 sản phẩm lệch (sale đã hết hạn). `roastDate` seed = 3..28 ngày trước lúc seed nên không biến thể demo nào chạm ngưỡng cảnh báo 30 ngày hay chặn 90 ngày (tại ngày seed; sau 63 ngày các lô 28 ngày tuổi sẽ vượt 90 ngày: seed lại để làm tươi).

### Kết quả kiểm Đợt 5 task 1 (2026-11-23, Windows, Postgres 17 tạm, Edge)

- **Backend** (`TEST_DATABASE_URL` trỏ DB test tạm `postgres:17 --shm-size=256m`): `lint`, `typecheck`, `format:check`, `build` sạch; `test:coverage` 112 file, 2166 test đạt; statements 96,28 %, branches 89,13 %, functions 97,8 %, lines 97,8 % (trên ngưỡng D-055: 94 / 87 / 95 / 95).
- **Frontend:** `lint`, `typecheck`, `format:check`, `build` sạch; `test:coverage` 122 file, 1072 test đạt; statements 86,47 %, branches 80,95 %, functions 86,05 %, lines 88,97 %. Lần chạy đầu (song song với backend `test:coverage` trên cùng máy) có 1 test cũ quá thời gian (`AdminCouponForm` PERCENT, đã ghi ở các đợt trước là nhạy với tải); chạy lại riêng đạt.
- **Docker/CI:** `docker compose config -q` cho dev, prod (env giả như CI, kèm profile `backup`, `tools`) và demo đều 0; prod có `stop_grace_period: 30s` cho backend.
- **E2E** (`guest-order`, `accounts`, `compare`, `m6b`; DB tạm migrate + seed mới; cổng API 4200 và web 3200; `E2E_BROWSER_CHANNEL=msedge`): 9/9 đạt ở lượt chạy lại. Lượt đầu (server dev khởi động nguội) 8/9: `guest-order` nhận `POST /cart/items` 404 ngay khi `next dev` mới khởi động; chạy lại riêng spec đó và chạy lại cả bộ đều đạt (thuộc nhóm lỗi khởi động nguội đã ghi ở các đợt trước, không tái hiện).
- **Chưa kiểm:** `a11y`, `csp`, `payments-demo`, `two-factor` (không đụng luồng của chúng); `AVATAR_URL_HOSTS` với CSP `img-src` thật; CI trên runner GitHub thật.


### Kết quả kiểm Đợt 5 task 2 (2026-11-23, Windows, Postgres 17 tạm, Edge)

- **Backend** (`TEST_DATABASE_URL` trỏ DB test tạm `postgres:17 --shm-size=256m`, env như CI): `lint`, `typecheck`, `format:check` sạch; `test:coverage` 113 file, 2173 test đạt; statements 96,28 %, branches 89,13 %, functions 97,8 %, lines 97,8 % (ngưỡng D-055).
- **Frontend:** `lint`, `typecheck`, `format:check` sạch (không đổi `src/`, chỉ `e2e/` và `playwright.config.ts` nên không chạy lại `test:coverage`).
- **E2E khởi động nguội:** `guest-order.spec.ts` 5 lần, mỗi lần xóa `.next/dev` và khởi động lại cả backend lẫn `next dev` (project `chromium`, `E2E_BROWSER_CHANNEL=msedge`, DB tạm seed mới, cổng API 4300 / web 3300): 5/5 đạt (28-32 giây gồm warm-up khoảng 16 giây).
- **E2E toàn bộ** (project `chromium` + `mobile-390`, Edge; mỗi lượt xóa `.next/dev`): 39/39 đạt, hai lượt liên tiếp (6,9 và 6,4 phút, chậm hơn thường lệ do chạy song song với việc tải image Docker).
- **WebKit và mobile trong Docker** (image `mcr.microsoft.com/playwright:v1.65.0-noble`, server trên máy chủ, forwarder TCP như trên): `mobile-390` (Chromium Linux) và `webkit-smoke` (WebKit, iPhone 13) 2/2 đạt, 47 giây gồm warm-up 21 giây.
- **CI:** `actionlint` 1.7.7 (image Docker) 0 lỗi sau khi thêm `webkit`, bước lấy phiên bản Playwright và `actions/cache` (ghim SHA v6.1.0) cho `~/.cache/ms-playwright`.
- **Đo tải:** bảng ở mục "Đo tải đặt hàng đồng thời cùng SKU": 9/9 lượt đạt.
- **Chưa kiểm:** CI trên runner GitHub thật (cài WebKit, cache trình duyệt, thời gian job); WebKit trên Edge/Windows cục bộ (bị chặn, chỉ qua Docker).

### Kết quả kiểm tổng Đợt 5 (chốt dự án)

Ngày 2026-11-23, Windows, Docker Desktop, Postgres 17 tạm (`postgres:17 --shm-size=256m`), Edge. Không sửa mã nguồn trong lượt kiểm này.

- **Backend** (`TEST_DATABASE_URL` trỏ DB test tạm, env như CI): `lint`, `typecheck`, `format:check`, `build` sạch; migration deploy từ DB trống và `migrate diff --exit-code` = 0; `test:coverage` 113 file, 2.173 test đạt; statements 96,28 %, branches 89,13 %, functions 97,8 %, lines 97,8 % (ngưỡng D-055: 94 / 87 / 95 / 95).
- **Frontend:** `lint`, `typecheck`, `format:check`, `build` sạch; `test:coverage` 122 file, 1.072 test đạt; statements 86,47 %, branches 80,95 %, functions 86,05 %, lines 88,97 %.
- **Docker/CI:** `docker build --target runtime` (backend) và build frontend thành công (tag tạm, đã `docker rmi`); `docker compose config -q` dev, prod (env giả như CI, kèm profile `backup`, `tools`) và demo đều 0; `actionlint` 1.7.7 0 lỗi; gitleaks v8.30.0 `git` (32 commit) và `dir` (chỉ file tracked/mới) không có rò rỉ.
- **E2E** (project `chromium` + `mobile-390`, `E2E_BROWSER_CHANNEL=msedge`, cổng API 4200 / web 3200, mỗi lượt một DB tạm migrate + seed mới và xóa `.next/dev`): 39/39 đạt, hai lượt liên tiếp (4,9 và 6,6 phút). Cộng 1 test `webkit-smoke` thì bộ đầy đủ là 40 test.
- **WebKit + mobile trong Docker** (`mcr.microsoft.com/playwright:v1.65.0-noble`, cách ở mục "Warm-up khởi động nguội, project mobile và WebKit (D-083)"): `mobile-390` và `webkit-smoke` 2/2 đạt (30 giây gồm warm-up khoảng 10 giây).
- **Đo tải đặt hàng đồng thời, đo lại C = 50** (DB và backend tạm, 3 lượt): 3/3 lượt đạt (đúng 20 đơn 201, 80 đơn 409, 0 lỗi 5xx, tồn cuối 0); p50 714 ms, p95 1324 ms, p99 1377 ms, 51,1 đơn/giây. Thông lượng cao hơn lần đo trong bảng (39,4 đơn/giây ở C = 50) vì máy ít tải hơn; số tuyệt đối chỉ so sánh được trên cùng điều kiện.
- **Demo một lệnh** (`docker compose -f docker-compose.demo.yml up --build -d`, không có tài nguyên `beanbox-demo*` từ trước): 147 giây tới khi mọi container healthy, `http://localhost:3300` trả 200 ngay sau đó (có cache lớp build: 34 bước `CACHED`); `init` thoát 0 (1.500 đơn, 4.329 dòng hàng, 138 user demo). RAM 4 container: khoảng 230 MB lúc mới khởi động, 378 MB sau khi chạy kịch bản. Kịch bản README bước 2 (VNPay giả), 3 (chuyển khoản), 4 (staff xác nhận, đóng gói, giao: sinh mã `BBL-...`), 5 (tra cứu có hành trình mô phỏng), 6 (`/admin/phan-tich` có KPI "Lợi nhuận gộp" = 219.912.300 đ, "Biên lợi nhuận gộp", "Độ phủ giá vốn"; xuất CSV tải được) và 9 (độ tươi hạt, đặt đơn COD rồi "Mua lại") đạt bằng Playwright + Edge. Lưu ý: chạy tự động nhanh liên tục từ một IP chạm giới hạn chung 100 yêu cầu/phút (analytics báo "Bạn thao tác quá nhanh"), tự hết sau khoảng một phút; người dùng thao tác tay không gặp. `docker stop` backend: log "Tắt êm: SIGTERM" rồi "Đã tắt êm (exit 0)", mã thoát 0, 0,59 giây (D-079). `down -v --rmi local` dọn sạch.
- **Chức năng thật Đợt 5** (backend + frontend tạm, DB tạm seed sạch):
  - D-080: đặt SQL biến thể `CHEMEX-3C` sale 100.000 đ bắt đầu 2 phút trước, `minPrice` sản phẩm còn 1.150.000. Backend `JOBS_ENABLED=false`: `/products?sort=price_asc&maxPrice=120000` không có `chemex-3-cup` (lệch). Khởi động lại với `JOBS_ENABLED=true`: log "đã làm mới 1 sản phẩm, 0 lỗi", `minPrice` = 100.000, sản phẩm xuất hiện đầu danh sách lọc/sắp xếp. Đạt.
  - D-081: PATCH `/me` `avatarUrl`: `/uploads/...` và https đúng host `AVATAR_URL_HOSTS` 200; `http:`, `data:`, `/uploads/../x`, host ngoài allowlist, host giả mạo `img.allowed.test.evil.com`, `javascript:` đều 400 (field `avatarUrl`). UI hồ sơ: https host chỉ server cho phép (frontend chưa khai `NEXT_PUBLIC_AVATAR_URL_HOSTS`) hiện chữ cái, nhập `http:` báo lỗi, nhập `/uploads/...` lưu và hiện ảnh. Đạt.
  - D-082: `roastDate` 95 ngày trước: trang sản phẩm "Ngày rang: 20/08/2026 (Rang 95 ngày trước)", nút "Ngừng bán do quá hạn rang" bị khóa; thêm giỏ 409 `ITEM_UNAVAILABLE` (`reason ROAST_EXPIRED`); lô đã nằm trong giỏ rồi quá hạn: quote có issue `ROAST_EXPIRED`, `POST /orders` 409 và tồn kho không đổi. `roastDate` 40 ngày trước: nhãn "Rang 40 ngày trước" + cảnh báo "Nên dùng trong 30 ngày", thêm giỏ 201, quote không issue, đặt đơn COD 201 và trừ kho. 20/20 kiểm tra API và 6/6 kiểm tra UI đạt.
- **Prettier:** `README.md` đạt. Các file `docs/*.md` khác lệch định dạng từ trước (15 file còn lệch khi chạy `prettier --check` với cấu hình backend, gồm các file đợt này chỉ thêm đoạn mới); không format hàng loạt để tránh diff lớn.
- **Chưa kiểm:** CI trên runner GitHub thật (cài WebKit, cache trình duyệt, Trivy); Safari thật và Firefox; WebKit trên Windows cục bộ (chỉ qua Docker).
