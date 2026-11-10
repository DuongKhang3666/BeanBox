# BeanBox – Đặc tả yêu cầu (Requirements Specification)

> Phiên bản: 0.2 · Ngày: 2026-11-10
> Thay đổi 0.2: ghi nhận 7 quyết định D-001..D-007 ([`decisions.md`](decisions.md)): thanh toán thất bại, giao lại, phụ phí ship, giữ lượt mã khi tạo đơn, tra cứu đơn bằng SĐT, dữ liệu hành chính.
> Cập nhật M2 (không đổi số phiên bản): D-007 đã duyệt; thêm D-008, D-009; đồng bộ §7 (Order, RefreshToken), §9, §11, §12.
> Trạng thái: Draft – cần review trước khi chốt `docs/api-contract.md`

---

## 1. Tổng quan

### 1.1 Mục tiêu sản phẩm
**BeanBox** là website thương mại điện tử full-stack chuyên bán **cà phê và các sản phẩm liên quan** cho thị trường Việt Nam:
- Hạt cà phê rang (nguyên hạt / xay sẵn), cà phê đặc sản (specialty), cà phê Việt (Robusta, Arabica Cầu Đất, Sơn La…).
- Dụng cụ pha chế: phin, pour-over (V60, Chemex), French press, AeroPress, moka pot, máy xay, ấm rót cổ ngỗng, cân điện tử…
- Phụ kiện: giấy lọc, ly/cốc, bình giữ nhiệt, hộp bảo quản hạt, đồ vệ sinh máy.
- Combo/quà tặng (gift box) và (giai đoạn sau) gói đăng ký giao cà phê định kỳ.

### 1.2 Mục tiêu dự án
1. Xây dựng một sản phẩm e-commerce hoàn chỉnh, chạy được end-to-end: duyệt sản phẩm → giỏ hàng → thanh toán → quản lý đơn.
2. Có trang quản trị (admin) để vận hành: sản phẩm, tồn kho, đơn hàng, mã giảm giá.
3. Code sạch, có test, bảo mật cơ bản tốt, có thể dùng làm dự án portfolio/CV.

### 1.3 Phạm vi
| Trong phạm vi (MVP + v1) | Ngoài phạm vi (hiện tại) |
|---|---|
| Web responsive (desktop + mobile) | Ứng dụng mobile native |
| 1 cửa hàng, 1 kho | Đa người bán (marketplace), đa kho |
| Thanh toán COD, VNPay sandbox / Stripe test | Thanh toán thật (production) |
| Phí ship tính theo bảng cố định | Tích hợp API GHN/GHTK thật (để v2) |
| Giao diện tiếng Việt, tiền VND | Đa ngôn ngữ, đa tiền tệ |

### 1.4 Stack kỹ thuật (theo `CLAUDE.md`)
- **Frontend**: Next.js (App Router) + React + TypeScript + Tailwind CSS → `frontend/`
- **Backend**: Node.js + **Express** + TypeScript + Prisma → `backend/`
- **Database**: PostgreSQL
- **Thanh toán**: COD + **VNPay sandbox** + **Stripe test mode** (hỗ trợ cả hai cổng online)
- **Repo**: một repo duy nhất `DuongKhang3666/BeanBox` (thư mục gốc `BeanBox/`), chứa `frontend/`, `backend/`, `docs/`
- **Lưu ảnh**: local storage khi dev; Cloudinary/S3 khi deploy
- **Email**: Nodemailer + Mailtrap/Mailpit (dev)
- **Hạ tầng**: Docker Compose (app + db), CI GitHub Actions

---

## 2. Vai trò người dùng

| Vai trò | Mô tả | Quyền chính |
|---|---|---|
| **Khách (Guest)** | Chưa đăng nhập | Xem/tìm sản phẩm, thêm giỏ hàng (lưu local), đặt hàng dạng khách |
| **Khách hàng (Customer)** | Đã đăng ký & đăng nhập | Mọi quyền của Guest + quản lý tài khoản, địa chỉ, lịch sử đơn, đánh giá, wishlist |
| **Nhân viên (Staff)** | Vận hành cửa hàng | Xử lý đơn hàng, cập nhật tồn kho, duyệt đánh giá |
| **Quản trị (Admin)** | Chủ cửa hàng | Toàn quyền: sản phẩm, danh mục, mã giảm giá, người dùng, cấu hình, báo cáo |

---

## 3. Danh mục & mô hình sản phẩm

### 3.1 Cây danh mục (đề xuất)
```
Cà phê hạt
 ├─ Specialty (Arabica đặc sản)
 ├─ Cà phê Việt (Robusta, Culi, Moka Cầu Đất…)
 ├─ Blend (pha trộn)
 └─ Decaf
Dụng cụ pha chế
 ├─ Phin
 ├─ Pour-over (V60, Chemex, Kalita)
 ├─ French press / AeroPress / Moka pot
 ├─ Máy xay (tay / điện)
 └─ Ấm rót, cân, nhiệt kế
Phụ kiện
 ├─ Giấy lọc
 ├─ Ly, cốc, bình giữ nhiệt
 └─ Hộp bảo quản, vệ sinh
Quà tặng & Combo
```

### 3.2 Thuộc tính sản phẩm
**Chung cho mọi sản phẩm**: tên, slug, mô tả ngắn, mô tả chi tiết (rich text/Markdown), ảnh (nhiều ảnh, 1 ảnh đại diện), danh mục, thương hiệu, giá gốc, giá khuyến mãi, trạng thái (nháp / đang bán / ngừng bán), tag, SEO title/description.

**Riêng cà phê hạt** (thuộc tính lọc được):
| Thuộc tính | Ví dụ giá trị |
|---|---|
| Xuất xứ (origin) | Việt Nam – Cầu Đất, Ethiopia – Yirgacheffe, Colombia… |
| Giống (variety) | Arabica, Robusta, Liberica, Typica, Bourbon… |
| Sơ chế (process) | Washed, Natural, Honey, Anaerobic |
| Mức rang (roast) | Light, Medium, Medium-Dark, Dark |
| Hương vị (tasting notes) | Chocolate, Caramel, Cam chanh, Hoa nhài… |
| Độ cao (altitude) | 1.500 m |
| Phù hợp cách pha | Phin, Espresso, Pour-over, Cold brew |
| Ngày rang | Hiển thị theo lô (batch) |

**Biến thể (variant / SKU)**: mỗi sản phẩm có ≥ 1 biến thể; mỗi biến thể có SKU, giá, tồn kho, cân nặng riêng.
- Cà phê: khối lượng (250 g / 500 g / 1 kg) × kiểu xay (nguyên hạt / xay phin / xay espresso / xay pour-over).
- Dụng cụ: màu sắc, dung tích, kích thước.

---

## 4. Yêu cầu chức năng

Quy ước: **ID** – `FR-<module>-<số>`; **Ưu tiên** – MoSCoW: **M** (Must, MVP), **S** (Should, v1), **C** (Could, v2), **W** (Won't – lần này).

### 4.1 Xác thực & tài khoản (AUTH)
| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-AUTH-01 | Đăng ký bằng email + mật khẩu (tên, email, SĐT tùy chọn) | M |
| FR-AUTH-02 | Đăng nhập / đăng xuất; phiên dùng access token ngắn hạn + refresh token (httpOnly cookie) | M |
| FR-AUTH-03 | Xác thực email qua link gửi mail | S |
| FR-AUTH-04 | Quên mật khẩu → link đặt lại (hết hạn 30 phút, dùng 1 lần) | M |
| FR-AUTH-05 | Đổi mật khẩu khi đã đăng nhập | M |
| FR-AUTH-06 | Đăng nhập Google (OAuth) | C |
| FR-AUTH-07 | Phân quyền theo vai trò (RBAC): CUSTOMER, STAFF, ADMIN | M |
| FR-AUTH-08 | Khóa tạm tài khoản sau 5 lần đăng nhập sai liên tiếp trong 15 phút | S |

**Tiêu chí chấp nhận (ví dụ FR-AUTH-01)**
- Email chưa tồn tại, đúng định dạng; mật khẩu ≥ 8 ký tự, có chữ và số.
- Email trùng → báo lỗi "Email đã được sử dụng" (HTTP 409).
- Mật khẩu được hash (argon2/bcrypt), không bao giờ trả về trong response.

### 4.2 Hồ sơ khách hàng (PROFILE)
| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-PROF-01 | Xem/sửa thông tin cá nhân (tên, SĐT, ngày sinh, avatar) | M |
| FR-PROF-02 | Sổ địa chỉ: thêm/sửa/xóa, đặt mặc định. Địa chỉ gồm: họ tên, SĐT, tỉnh/thành, phường/xã, địa chỉ chi tiết (theo đơn vị hành chính **2 cấp** áp dụng từ 01/07/2025 – không còn cấp quận/huyện) | M |
| FR-PROF-03 | Danh sách yêu thích (wishlist) | S |
| FR-PROF-04 | Lịch sử đơn hàng + chi tiết đơn | M |
| FR-PROF-05 | Điểm thưởng (loyalty): tích 1 điểm / 10.000đ, dùng điểm giảm giá | C |

### 4.3 Duyệt & tìm kiếm sản phẩm (CATALOG)
| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-CAT-01 | Trang chủ: banner, sản phẩm nổi bật, bán chạy, mới về, danh mục chính | M |
| FR-CAT-02 | Trang danh mục: lưới sản phẩm, phân trang (hoặc "Xem thêm"), 12–24 sp/trang | M |
| FR-CAT-03 | Bộ lọc: danh mục, khoảng giá, thương hiệu, còn hàng; với cà phê: xuất xứ, mức rang, sơ chế, cách pha | M |
| FR-CAT-04 | Sắp xếp: mới nhất, giá tăng/giảm, bán chạy, đánh giá cao | M |
| FR-CAT-05 | Tìm kiếm theo từ khóa (tên, mô tả, tag), **không phân biệt dấu tiếng Việt** ("ca phe" khớp "cà phê") | M |
| FR-CAT-06 | Gợi ý tìm kiếm (autocomplete) khi gõ | S |
| FR-CAT-07 | Trang chi tiết sản phẩm: gallery ảnh, chọn biến thể, giá theo biến thể, tồn kho, mô tả, thông số, hồ sơ hương vị, đánh giá, sản phẩm liên quan | M |
| FR-CAT-08 | Hiển thị "Hết hàng" và vô hiệu nút mua khi biến thể tồn kho = 0 | M |
| FR-CAT-09 | Sản phẩm đã xem gần đây | C |
| FR-CAT-10 | Bộ lọc & sắp xếp phản ánh trên URL (chia sẻ được, SEO) | S |

### 4.4 Giỏ hàng (CART)
| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-CART-01 | Thêm biến thể vào giỏ với số lượng; mini-cart hiển thị ngay | M |
| FR-CART-02 | Sửa số lượng, xóa dòng, xóa toàn bộ giỏ | M |
| FR-CART-03 | Khách chưa đăng nhập: giỏ lưu ở client (localStorage) hoặc cart token; khi đăng nhập → **gộp** vào giỏ server | M |
| FR-CART-04 | Kiểm tra tồn kho khi thêm/sửa; không cho vượt tồn kho, giới hạn tối đa 20/dòng | M |
| FR-CART-05 | Hiển thị tạm tính, giảm giá, phí ship ước tính, tổng | M |
| FR-CART-06 | Áp mã giảm giá trong giỏ / checkout | M |
| FR-CART-07 | Cảnh báo khi giá hoặc tồn kho thay đổi kể từ lúc thêm vào giỏ | S |

### 4.5 Thanh toán & đặt hàng (CHECKOUT)
| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-CHK-01 | Checkout cho cả khách vãng lai (email + SĐT) và khách đã đăng nhập | M |
| FR-CHK-02 | Bước 1 – Thông tin giao hàng (chọn từ sổ địa chỉ hoặc nhập mới) | M |
| FR-CHK-03 | Bước 2 – Phương thức vận chuyển: Tiêu chuẩn / Nhanh; phí tính theo bảng (xem §5.3) | M |
| FR-CHK-04 | Bước 3 – Phương thức thanh toán: **COD**, **VNPay** (sandbox), **Stripe** (test) – khách chọn 1 trong 3 | M |
| FR-CHK-05 | Bước 4 – Xác nhận: tóm tắt đơn, ghi chú đơn, đồng ý điều khoản | M |
| FR-CHK-06 | **Server tính lại toàn bộ giá** (không tin giá từ client) và kiểm tra tồn kho trước khi tạo đơn | M |
| FR-CHK-07 | Thanh toán online: redirect tới cổng → nhận **IPN/webhook** để cập nhật trạng thái; trang return chỉ hiển thị | M |
| FR-CHK-08 | Idempotency: bấm "Đặt hàng" nhiều lần không tạo nhiều đơn (Idempotency-Key) | M |
| FR-CHK-09 | Trang "Đặt hàng thành công" + mã đơn; gửi email xác nhận | M |
| FR-CHK-10 | Khách vãng lai tra cứu đơn bằng mã đơn + SĐT (chuẩn hóa) | M |
| FR-CHK-11 | Xuất hóa đơn VAT (nhập MST, tên công ty) | C |

### 4.6 Đơn hàng (ORDER)
| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-ORD-01 | Mã đơn dạng dễ đọc: `BB-YYMMDD-XXXX` | M |
| FR-ORD-02 | Vòng đời trạng thái (xem §5.1), lưu lịch sử chuyển trạng thái (ai, khi nào, ghi chú) | M |
| FR-ORD-03 | Khách hủy đơn khi còn `PENDING_PAYMENT` / `PENDING` / `CONFIRMED` (chưa giao vận chuyển) | M |
| FR-ORD-04 | Lưu **snapshot** sản phẩm trong đơn (tên, SKU, giá, ảnh) – không phụ thuộc thay đổi sau này | M |
| FR-ORD-05 | Email thông báo khi trạng thái thay đổi (xác nhận, đang giao, đã giao, đã hủy) | S |
| FR-ORD-06 | Yêu cầu đổi/trả trong 7 ngày sau khi giao (lý do, ảnh) | C |
| FR-ORD-07 | "Mua lại" – thêm toàn bộ sản phẩm của đơn cũ vào giỏ | C |

### 4.7 Đánh giá (REVIEW)
| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-REV-01 | Chỉ khách **đã mua và đã nhận hàng** mới được đánh giá (1–5 sao, nội dung, tối đa 3 ảnh) | S |
| FR-REV-02 | Mỗi khách 1 đánh giá / sản phẩm / đơn; được sửa trong 30 ngày | S |
| FR-REV-03 | Hiển thị điểm trung bình, phân bố số sao, lọc theo số sao | S |
| FR-REV-04 | Staff/Admin ẩn/hiện đánh giá vi phạm; trả lời đánh giá | S |

### 4.8 Khuyến mãi (PROMO)
| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-PRO-01 | Mã giảm giá: theo % (có mức giảm tối đa) hoặc số tiền cố định; hoặc miễn phí ship | M |
| FR-PRO-02 | Điều kiện: giá trị đơn tối thiểu, thời gian hiệu lực, tổng lượt dùng, lượt dùng / khách, áp cho danh mục/sản phẩm cụ thể | M |
| FR-PRO-03 | Mỗi đơn áp tối đa 1 mã | M |
| FR-PRO-04 | Giá khuyến mãi theo sản phẩm (flash sale có thời gian bắt đầu/kết thúc) | S |
| FR-PRO-05 | Combo/bundle: mua bộ giá ưu đãi | C |

### 4.9 Đăng ký giao định kỳ (SUBSCRIPTION) – v2
| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-SUB-01 | Khách đăng ký nhận cà phê định kỳ (2 tuần / 4 tuần), chọn loại hạt, kiểu xay | C |
| FR-SUB-02 | Tạm dừng, bỏ qua kỳ, hủy đăng ký | C |
| FR-SUB-03 | Hệ thống tự tạo đơn mỗi kỳ (cron job) | C |

### 4.10 Nội dung (CONTENT)
| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-CNT-01 | Trang tĩnh: Giới thiệu, Liên hệ, Chính sách giao hàng, Đổi trả, Bảo mật, Điều khoản | M |
| FR-CNT-02 | Blog / Hướng dẫn pha chế (công thức phin, V60…) gắn với sản phẩm | C |
| FR-CNT-03 | Form liên hệ + đăng ký nhận bản tin (newsletter) | S |

### 4.11 Quản trị (ADMIN)
| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-ADM-01 | Dashboard: doanh thu hôm nay/7 ngày/30 ngày, số đơn theo trạng thái, top sản phẩm bán chạy, sản phẩm sắp hết hàng | S |
| FR-ADM-02 | CRUD sản phẩm + biến thể + ảnh (upload, sắp xếp, chọn ảnh đại diện); xóa mềm (soft delete) | M |
| FR-ADM-03 | CRUD danh mục (cây 2 cấp), thương hiệu, thuộc tính cà phê | M |
| FR-ADM-04 | Quản lý tồn kho: điều chỉnh số lượng có lý do (nhập hàng, hỏng, kiểm kê), xem lịch sử biến động | M |
| FR-ADM-05 | Quản lý đơn: danh sách, lọc (trạng thái, ngày, thanh toán), tìm theo mã/SĐT, xem chi tiết, chuyển trạng thái, in phiếu giao hàng | M |
| FR-ADM-06 | Quản lý mã giảm giá | M |
| FR-ADM-07 | Quản lý người dùng: xem danh sách, khóa/mở khóa, đổi vai trò (chỉ Admin) | S |
| FR-ADM-08 | Duyệt đánh giá | S |
| FR-ADM-09 | Cấu hình cửa hàng: bảng phí ship, ngưỡng freeship, thông tin liên hệ, banner trang chủ | S |
| FR-ADM-10 | Xuất báo cáo đơn hàng / doanh thu ra CSV | C |
| FR-ADM-11 | Nhật ký thao tác admin (audit log) | S |

---

## 5. Quy tắc nghiệp vụ

### 5.1 Trạng thái đơn hàng
```
Luồng chính:

PENDING_PAYMENT ──(IPN/webhook thành công)──► CONFIRMED ◄──(staff xác nhận)── PENDING
(online)                                          │                           (COD)
                                                  ▼
                                             PROCESSING (đang đóng gói)
                                                  │
                                                  ▼
                                              SHIPPING ◄──(giao lại, staff)── FAILED_DELIVERY
                                                  │   └──(giao thất bại)──────────▲
                                                  ▼
                                              DELIVERED ──► (RETURN_REQUESTED → RETURNED) [v2]

Thanh toán online thất bại (không rời PENDING_PAYMENT):
PENDING_PAYMENT, paymentStatus=FAILED ──(thử lại thành công, trong 15 phút)──► CONFIRMED, paymentStatus=PAID

Hủy (mọi đường đều hoàn kho + hoàn lượt mã):
PENDING_PAYMENT ──(khách / staff / quá 15 phút)──► CANCELLED
PENDING         ──(khách / staff)────────────────► CANCELLED
CONFIRMED       ──(khách / staff)────────────────► CANCELLED
PROCESSING      ──(chỉ staff, có ghi chú)────────► CANCELLED
FAILED_DELIVERY ──(chỉ staff)────────────────────► CANCELLED
```
- **COD**: tạo đơn ở `PENDING` → admin xác nhận → `CONFIRMED`.
- **Online**: tạo đơn ở `PENDING_PAYMENT` → IPN thành công → `CONFIRMED`. Thanh toán thất bại KHÔNG chuyển `CANCELLED` ngay: đơn giữ `PENDING_PAYMENT` với `paymentStatus=FAILED`, khách được thử lại tới hết 15 phút (`FAILED → PAID` khi thử lại thành công, đơn → `CONFIRMED`). Quá 15 phút chưa thanh toán thành công → `CANCELLED` tự động, hoàn tồn kho, hoàn lượt mã (D-001).
- Khách tự hủy được khi đơn ở `PENDING_PAYMENT`, `PENDING`, `CONFIRMED` (D-002); `PROCESSING` trở đi chỉ Staff+ hủy được.
- `FAILED_DELIVERY` → `SHIPPING` (giao lại, Staff+, có thể cập nhật mã vận đơn/đơn vị vận chuyển mới) hoặc → `CANCELLED` (D-002).
- Mọi lần chuyển sang `CANCELLED` đều hoàn tồn kho và hoàn lượt mã giảm giá trong cùng transaction (D-004).
- Chỉ cho phép các chuyển trạng thái hợp lệ theo sơ đồ; chuyển sai → HTTP 409.
- Trạng thái thanh toán tách riêng: `UNPAID`, `PAID`, `FAILED`, `REFUNDED`.

### 5.2 Tồn kho
- Trừ tồn kho (giữ chỗ) **ngay khi tạo đơn**, trong cùng transaction, dùng điều kiện `stock >= qty` để tránh bán âm (race condition).
- Đơn bị hủy/hết hạn → hoàn tồn kho.
- Cảnh báo "sắp hết hàng" khi tồn ≤ ngưỡng (mặc định 5, cấu hình theo biến thể).

### 5.3 Phí vận chuyển (bảng cố định MVP)
| Khu vực | Tiêu chuẩn (3–5 ngày) | Nhanh (1–2 ngày) |
|---|---|---|
| Nội thành TP.HCM / Hà Nội | 20.000đ | 35.000đ |
| Tỉnh/thành khác | 35.000đ | 55.000đ |
- "Nội thành" = toàn bộ Hà Nội (mã `01`) và TP.HCM (mã `79`) vì đơn vị hành chính 2 cấp không còn quận/huyện (cấu hình `shipping.innerCityProvinceCodes`; đối chiếu khi có dữ liệu hành chính chính thức – D-006).
- **Miễn phí ship tiêu chuẩn** cho đơn ≥ 500.000đ (sau giảm giá); miễn cả phụ phí khối lượng. Phương thức Nhanh không được freeship ngưỡng (D-003).
- Phụ phí theo khối lượng: `5.000đ × ceil(max(0, tổng khối lượng (g) − 2000) / 1000)`, tức +5.000đ cho mỗi 1 kg hoặc phần lẻ vượt quá 2 kg (D-003).

### 5.4 Giá & tiền tệ
- Lưu tiền dạng **số nguyên VND** (không dùng float). Hiển thị định dạng `125.000₫`.
- Giá đã bao gồm VAT.
- Thứ tự tính: Tạm tính → trừ giảm giá sản phẩm/mã → + phí ship (hoặc freeship) → Tổng thanh toán. Tổng không âm.

### 5.5 Mã giảm giá
- Không phân biệt hoa thường; kiểm tra: còn hiệu lực, còn lượt, đủ giá trị tối thiểu, khách chưa vượt giới hạn, sản phẩm đủ điều kiện.
- Lượt dùng được giữ chỗ ngay khi tạo đơn (cùng transaction với trừ kho) để không bao giờ vượt tổng lượt hay lượt/khách; mọi đơn chuyển sang `CANCELLED` (khách/staff hủy, hết hạn thanh toán, giao thất bại rồi hủy) → hoàn lượt. Đơn `RETURNED` (v2) không hoàn lượt. Kiểm tra "còn lượt" ở giỏ/quote chỉ để tham khảo. Cơ chế chi tiết: `api-contract.md` §10 mục 4 và [D-004](decisions.md).

### 5.6 Cà phê
- Hiển thị ngày rang của lô hiện tại; khuyến nghị dùng trong 30 ngày sau rang.
- Không bán lô hạt đã rang quá 90 ngày (admin đánh dấu ngừng bán biến thể/lô).

---

## 6. Yêu cầu phi chức năng

### 6.1 Hiệu năng
- Trang danh sách/chi tiết sản phẩm: LCP < 2,5 s trên 4G; dùng SSR/ISR của Next.js và tối ưu ảnh (`next/image`, WebP).
- API đọc: p95 < 300 ms với ~10.000 sản phẩm; có index cho slug, danh mục, giá, trường tìm kiếm.
- Phân trang bắt buộc cho mọi API danh sách (mặc định 20, tối đa 100).

### 6.2 Bảo mật
- Hash mật khẩu bằng argon2id (hoặc bcrypt cost ≥ 12).
- JWT access token 15 phút; refresh token 7 ngày trong **httpOnly, Secure, SameSite** cookie, xoay vòng (rotation) và thu hồi khi đăng xuất.
- Validate toàn bộ input phía server (zod); Prisma tránh SQL injection; escape output tránh XSS.
- Chống CSRF cho request dùng cookie; CORS chỉ cho phép origin frontend.
- Rate limit: đăng nhập/quên mật khẩu (5 req/phút/IP), API chung (100 req/phút/IP).
- Kiểm tra quyền theo tài nguyên (khách chỉ xem đơn của mình – chống IDOR).
- Xác minh chữ ký (checksum/HMAC) của IPN VNPay / webhook Stripe; đối chiếu số tiền với đơn.
- Upload ảnh: giới hạn loại (jpg/png/webp) và kích thước (≤ 5 MB), đổi tên file, không thực thi.
- Header bảo mật (helmet): CSP, HSTS, X-Content-Type-Options.
- Secrets trong `.env`, chỉ commit `.env.example`. Không log mật khẩu, token, dữ liệu thẻ.

### 6.3 Khả dụng & trải nghiệm
- Responsive từ 360 px; ưu tiên mobile-first.
- Accessibility WCAG 2.1 AA cơ bản: alt ảnh, label form, điều hướng bàn phím, độ tương phản.
- Thông báo lỗi tiếng Việt, rõ ràng; trạng thái loading/skeleton; trang 404/500 thân thiện.

### 6.4 SEO
- URL thân thiện: `/san-pham/<slug>`, `/danh-muc/<slug>`.
- Meta title/description, Open Graph, `sitemap.xml`, `robots.txt`, structured data `Product` (JSON-LD).

### 6.5 Độ tin cậy & vận hành
- Transaction DB cho tạo đơn, cập nhật tồn kho, thanh toán.
- Log có cấu trúc (pino), request id; health check `/health`.
- Backup DB hằng ngày (khi deploy).
- Migration bằng Prisma Migrate; seed dữ liệu mẫu (≥ 30 sản phẩm, 2 tài khoản admin/customer).

### 6.6 Chất lượng code & kiểm thử
- TypeScript strict; ESLint + Prettier.
- Backend: unit test cho service (giá, mã giảm giá, phí ship, chuyển trạng thái), integration test cho API chính (Vitest/Jest + Supertest) – coverage ≥ 70 % phần nghiệp vụ.
- Frontend: test component quan trọng (React Testing Library); E2E luồng mua hàng (Playwright).
- CI chạy lint + typecheck + test cho mỗi PR.

---

## 7. Mô hình dữ liệu sơ bộ

```
User(id, email, passwordHash, fullName, phone, role, status, emailVerifiedAt, createdAt)
Address(id, userId, fullName, phone, provinceCode, provinceName, wardCode, wardName, line1, isDefault)
RefreshToken(id, userId, familyId, tokenHash, expiresAt, revokedAt, replacedById?)

Category(id, parentId?, name, slug, sortOrder)
Brand(id, name, slug, logoUrl)
Product(id, categoryId, brandId?, name, slug, shortDesc, description, status,
        isFeatured, ratingAvg, ratingCount, seoTitle, seoDesc, deletedAt, createdAt)
CoffeeProfile(productId, origin, variety, process, roastLevel, altitude,
              tastingNotes[], brewMethods[])
ProductImage(id, productId, url, alt, sortOrder, isPrimary)
ProductVariant(id, productId, sku, name, attributes(JSON: weight, grind, color…),
               price, salePrice?, saleStart?, saleEnd?, stock, lowStockThreshold,
               weightGram, roastDate?, isActive)
InventoryMovement(id, variantId, change, reason, orderId?, actorId, createdAt)

Cart(id, userId? , token?, updatedAt)
CartItem(id, cartId, variantId, quantity)
Wishlist(userId, productId)

Order(id, code, userId?, contactEmail, contactPhone, status, paymentStatus,
      paymentMethod, shippingMethod, shippingAddress(JSON snapshot),
      subtotal, discountTotal, shippingFee, shippingDiscount, grandTotal, couponCode?, note,
      idempotencyKey, createdAt)
-- Ghi chú: contactEmail/contactPhone luôn bắt buộc (guest nhập, user lấy từ tài khoản/form);
-- SĐT lưu dạng chuẩn hóa (D-007). Schema chi tiết: db-schema.md.
OrderItem(id, orderId, variantId, productName, variantName, sku, imageUrl,
          unitPrice, quantity, lineTotal)
OrderStatusHistory(id, orderId, fromStatus, toStatus, note, actorId?, createdAt)
Payment(id, orderId, provider, providerTxnId, amount, status, rawPayload(JSON), createdAt)

Coupon(id, code, type[PERCENT|FIXED|FREESHIP], value, maxDiscount?, minOrder,
       startsAt, endsAt, usageLimit?, perUserLimit?, usedCount, scope(JSON), isActive)
CouponRedemption(id, couponId, orderId, userId?)

Review(id, productId, userId, orderItemId, rating, content, images[], status, reply?, createdAt)
Setting(key, value JSON)          -- phí ship, freeship, banner…
AuditLog(id, actorId, action, entity, entityId, diff JSON, createdAt)
```

---

## 8. Tổng quan API (chi tiết sẽ chốt trong `docs/api-contract.md`)

Base: `/api/v1` · JSON · lỗi thống nhất `{ "error": { "code", "message", "details?" } }`

| Nhóm | Endpoint chính |
|---|---|
| Auth | `POST /auth/register`, `/auth/login`, `/auth/logout`, `/auth/refresh`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/verify-email` |
| Tôi | `GET/PATCH /me`, `GET/POST/PATCH/DELETE /me/addresses`, `GET /me/orders`, `GET/POST/DELETE /me/wishlist` |
| Catalog | `GET /categories`, `GET /brands`, `GET /products?q=&category=&minPrice=&maxPrice=&roast=&origin=&sort=&page=`, `GET /products/:slug`, `GET /products/:slug/reviews`, `GET /search/suggest?q=` |
| Giỏ hàng | `GET /cart`, `POST /cart/items`, `PATCH /cart/items/:id`, `DELETE /cart/items/:id`, `POST /cart/merge`, `POST /cart/apply-coupon` |
| Checkout | `POST /checkout/quote` (tính giá, phí ship), `POST /orders` (Idempotency-Key), `GET /orders/:code`, `POST /orders/:code/cancel`, `GET /orders/track?code=&phone=` |
| Thanh toán | `POST /payments/vnpay/create`, `GET /payments/vnpay/ipn`, `GET /payments/vnpay/return`, `POST /payments/stripe/webhook` |
| Review | `POST /products/:id/reviews`, `PATCH /reviews/:id` |
| Admin | `/admin/dashboard`, `/admin/products`, `/admin/variants`, `/admin/categories`, `/admin/brands`, `/admin/inventory`, `/admin/orders`, `/admin/orders/:id/status`, `/admin/coupons`, `/admin/users`, `/admin/reviews`, `/admin/settings`, `/admin/uploads` |

---

## 9. Sơ đồ trang (Sitemap)

**Storefront**
- `/` Trang chủ
- `/danh-muc/[slug]` Danh mục · `/tim-kiem?q=` Kết quả tìm kiếm
- `/san-pham/[slug]` Chi tiết sản phẩm
- `/gio-hang` Giỏ hàng · `/thanh-toan` Checkout · `/dat-hang-thanh-cong/[code]`
- `/tra-cuu-don-hang`
- `/dang-nhap`, `/dang-ky`, `/quen-mat-khau`, `/dat-lai-mat-khau`, `/xac-thuc-email`
- `/tai-khoan` (hồ sơ), `/tai-khoan/dia-chi`, `/tai-khoan/don-hang`, `/tai-khoan/don-hang/[code]`, `/tai-khoan/yeu-thich`
- `/gioi-thieu`, `/lien-he`, `/chinh-sach/[slug]`, `/blog`, `/blog/[slug]` (v2)

**Admin** (`/admin`, yêu cầu STAFF/ADMIN)
- Dashboard · Sản phẩm · Danh mục · Thương hiệu · Tồn kho · Đơn hàng · Mã giảm giá · Khách hàng · Đánh giá · Cài đặt

---

## 10. Luồng chính (User flows)

1. **Mua hàng (khách vãng lai, COD)**: Trang chủ → Danh mục → Lọc "Mức rang: Medium" → Chi tiết → chọn 500 g / xay phin → Thêm giỏ → Giỏ hàng → Checkout (nhập địa chỉ, chọn Tiêu chuẩn, COD) → Đặt hàng → trang thành công + email.
2. **Mua hàng (đăng nhập, VNPay)**: … Checkout → chọn VNPay → redirect sandbox → thanh toán → IPN cập nhật `PAID/CONFIRMED` → return page hiển thị kết quả.
3. **Admin xử lý đơn**: Đơn hàng → lọc `PENDING` → xem chi tiết → Xác nhận → Đóng gói (`PROCESSING`) → Giao vận chuyển (`SHIPPING`, nhập mã vận đơn) → `DELIVERED`.
4. **Đánh giá**: Tài khoản → Đơn đã giao → "Viết đánh giá" → gửi → hiển thị trên trang sản phẩm.

---

## 11. Lộ trình (Milestones)

| Giai đoạn | Nội dung | Kết quả |
|---|---|---|
| **M0 – Nền tảng** | Khởi tạo repo (`frontend/`, `backend/`), Docker Compose (Postgres), Prisma schema, seed, CI lint/test, `api-contract.md` | Chạy được `docker compose up` |
| **M1 – Catalog** | API + UI danh mục, danh sách, lọc, tìm kiếm, chi tiết sản phẩm | Duyệt sản phẩm được |
| **M2 – Auth & Tài khoản** | Đăng ký/đăng nhập/refresh, hồ sơ, sổ địa chỉ, nạp dữ liệu tỉnh/phường từ file nguồn do chủ dự án cung cấp (nạp dữ liệu tỉnh/phường: bị chặn chờ file – D-008) | Khách có tài khoản |
| **M3 – Giỏ hàng & Checkout COD** | Giỏ (guest + merge), quote, tạo đơn, tồn kho, email | **MVP mua hàng end-to-end** |
| **M4 – Admin cơ bản** | CRUD sản phẩm/biến thể/ảnh, danh mục, tồn kho, xử lý đơn | Vận hành được cửa hàng |
| **M5 – Thanh toán online & Khuyến mãi** | VNPay sandbox/Stripe test, IPN/webhook, mã giảm giá | v1 |
| **M6 – Hoàn thiện v1** | Đánh giá, wishlist, dashboard, SEO, E2E test, audit bảo mật | v1 chạy ổn định trên localhost |
| **M7 – Deploy demo** | Chọn nền tảng, cấu hình môi trường, deploy FE/BE/DB, seed dữ liệu demo | Link demo công khai (chỉ làm khi M0–M6 đã ổn) |
| **v2** | **Subscription (ưu tiên đầu tiên của v2)**, blog, loyalty, đổi trả, Google login, tích hợp GHN | Mở rộng / nâng cao cho CV |

**Definition of Done cho mỗi tính năng**: đúng contract API · có test · qua review bảo mật · UI responsive · không lỗi lint/typecheck · cập nhật docs.

---

## 12. Giả định & câu hỏi mở

**Giả định**
- Một cửa hàng, một kho, giao hàng toàn quốc qua đơn vị vận chuyển do cửa hàng tự liên hệ.
- Thanh toán online chỉ ở môi trường sandbox/test.
- Dữ liệu tỉnh/thành – phường/xã theo hành chính VN **2 cấp** (sau sáp nhập 2025), dạng JSON tĩnh, **do chủ dự án cung cấp file nguồn** và chỉ nạp ở M2. Developer không tự tạo/bịa dữ liệu; chưa có file thì endpoint `/locations` và validate địa chỉ chưa làm (D-006).

**Đã chốt (2026-11-10)**
| # | Câu hỏi | Quyết định |
|---|---|---|
| 1 | Cổng thanh toán online | Dùng **cả hai**: VNPay sandbox + Stripe test mode |
| 2 | Framework backend | **Express** |
| 3 | Cấu trúc repo | Một repo `github.com/DuongKhang3666/BeanBox`, thư mục `frontend/` + `backend/` + `docs/` |
| 4 | Nơi deploy | Giai đoạn đầu **chỉ chạy localhost** (Docker Compose). Khi toàn bộ luồng chạy ổn mới chọn nơi deploy demo công khai (gợi ý: Vercel + Render + Neon) |
| 5 | Subscription | Để **v2**. Làm xong và ổn định luồng mua hàng thường trước, sau đó thêm subscription như phần nâng cao |
| 6 | Đơn vị hành chính | Theo cách mới: **2 cấp** (tỉnh/thành – phường/xã) |

**Đã chốt (2026-11-10, đợt 2)** – chi tiết và lý do trong [`decisions.md`](decisions.md)
| # | Chủ đề | Quyết định |
|---|---|---|
| 7 | Thanh toán online thất bại (D-001) | Giữ `PENDING_PAYMENT`, `paymentStatus=FAILED`, thử lại tới hết 15 phút; quá hạn → `CANCELLED`, hoàn kho, hoàn lượt mã |
| 8 | Giao lại & khách hủy (D-002) | Thêm `FAILED_DELIVERY → SHIPPING`; khách hủy được cả `PENDING_PAYMENT` |
| 9 | Phụ phí khối lượng (D-003) | `5.000 × ceil(max(0, g − 2000) / 1000)`; freeship Tiêu chuẩn miễn cả phụ phí, Nhanh không |
| 10 | Lượt mã giảm giá (D-004) | Giữ lượt ngay khi tạo đơn bằng UPDATE có điều kiện; hoàn lượt khi `CANCELLED` |
| 11 | Khách vãng lai xem đơn (D-005) | Trang `/tra-cuu-don-hang` (mã đơn + SĐT); không `viewToken`; đơn guest không tự gắn vào tài khoản |
| 12 | Vùng ship & dữ liệu hành chính (D-006) | Nội thành = toàn bộ Hà Nội (`01`) + TP.HCM (`79`); dữ liệu tỉnh/phường do chủ dự án cung cấp, nạp ở M2 |
| 13 | Chuẩn hóa SĐT (D-007, đã duyệt) | Lưu dạng `0xxxxxxxxx`; hủy đơn guest xác minh bằng SĐT; FR-CHK-10 lên mức M |
| 14 | Sổ địa chỉ khi chưa có file hành chính (D-008) | Tạm thời: client nhập tên tỉnh/phường, server chỉ kiểm định dạng mã; `/locations` bị chặn chờ file |
| 15 | IP client cho rate limit (D-009) | `TRUST_PROXY` cấu hình được, backend bind `127.0.0.1`, SSR dùng `X-Internal-Secret` để được miễn rate limit chung |

---

## 13. Thuật ngữ

| Thuật ngữ | Nghĩa |
|---|---|
| SKU / Biến thể | Một phiên bản bán được của sản phẩm (vd: 500 g – xay phin) |
| COD | Thanh toán khi nhận hàng |
| IPN | Instant Payment Notification – callback server-to-server từ cổng thanh toán |
| Idempotency | Gửi lại cùng một request không tạo ra kết quả trùng lặp |
| Roast level | Mức độ rang hạt cà phê |
| Process | Phương pháp sơ chế quả cà phê sau thu hoạch |
| MVP | Sản phẩm khả dụng tối thiểu |
