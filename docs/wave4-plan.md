# BeanBox – Kế hoạch Đợt 4

> Ngày: 2026-11-23 · Người lập: Tech Lead · Tiếp nối Đợt 3 (`wave3-plan.md`; HEAD `e29cae7`, CI xanh).
> Dự án là portfolio chỉ chạy localhost: không deploy công khai, không thanh toán thật. KHÔNG làm R-19 (bảng tổng hợp analytics).

> **Trạng thái tổng: Đã làm, chờ commit (2026-11-23).** Nhóm 1 (R-21), nhóm 2 (R-16 + R-13), nhóm 3 (R-09, R-05, "Mua lại") và nhóm 4 (R-23) đã làm và đã qua kiểm tổng; kết quả ở `testing.md` mục "Kết quả kiểm tổng Đợt 4". Việc còn lại: commit.

## Thứ tự

Nhóm 1 (R-21) -> Nhóm 2 (R-16 + R-13) -> Nhóm 3 (R-09, R-05, "Mua lại") -> Nhóm 4 (R-23). Mỗi nhóm kiểm riêng (lint, typecheck, test, build; E2E khi đụng luồng người dùng) trước khi sang nhóm sau.

## Nhóm 1 – R-21 Công cụ vận hành

**Trạng thái: Đã làm (2026-11-23), chờ commit.** Kết quả kiểm ở `testing.md` mục "Kết quả kiểm Đợt 4 (nhóm 1)".

### D-071 Ghi chú nội bộ trên đơn
- **Phạm vi:** bảng `OrderNote` (append-only), `GET/POST /admin/orders/:code/notes`, `DELETE .../notes/:noteId` (Admin), khối "Ghi chú nội bộ" ở chi tiết đơn, chỉ báo số ghi chú ở danh sách đơn.
- **Quyết định chính:** Staff+ thêm và xem, chỉ Admin xóa, không có sửa; nội dung tối đa 2000 ký tự, chặn NUL/ký tự điều khiển; không bao giờ có trong API khách/guest/xuất dữ liệu cá nhân; audit chỉ ghi id và độ dài.
- **Tiêu chí xong:** test quyền (Staff tạo, Admin xóa, Staff xóa 403), test rò rỉ (đơn khách, track, `/me/export`), audit không chứa nội dung.

### D-072 In phiếu giao hàng loạt
- **Phạm vi:** checkbox chọn nhiều ở danh sách đơn, thanh "In phiếu (N)", trang `/admin/don-hang/in-hang-loat?codes=...`, endpoint `GET /admin/orders/print?codes=`.
- **Quyết định chính:** tối đa 50 mã; một request cho cả lô (không N+1), mã không có trong `meta.missing`; tái dùng `OrderPrintSheet`, mỗi đơn một trang giấy; chỉ đọc, không đổi trạng thái đơn.
- **Tiêu chí xong:** test endpoint (51 mã 400, missing, quyền), Vitest chọn nhiều và trang in, E2E chọn 2 đơn thấy 2 phiếu.

### D-073 Xuất/nhập CSV sản phẩm
- **Phạm vi:** `GET /admin/products/export`, `POST /admin/products/import/preview` và `/commit` (Admin), hộp thoại nhập ở `/admin/san-pham`.
- **Quyết định chính:** mỗi dòng một biến thể, 16 cột cố định; nhập 2 bước (xem trước không ghi, áp dụng một transaction, fingerprint SHA-256 chống đổi file giữa hai bước); không bao giờ đổi slug/SKU, không xóa gì; đổi tồn kho tạo `InventoryMovement`; khứ hồi xuất -> nhập là "không thay đổi".
- **Tiêu chí xong:** test parser, lập kế hoạch, commit (409/422/thành công), round trip kể cả tên có ký tự nguy hiểm, rate limit; E2E xuất rồi nhập lại chính file.

## Nhóm 2 – R-16 tách file lớn + R-13 hộp thoại dùng chung

**Trạng thái: Đã làm (2026-11-22), chờ commit.** Kết quả kiểm ở `testing.md` mục "Kết quả kiểm Đợt 4 (nhóm 2)".

**Đã làm:** `components/ui/Dialog.tsx` (`<dialog>` native) và chuyển cả 6 hộp thoại sang đó; tách `AdminSettings.tsx` (1049 -> 97 dòng, 9 file trong `settings/`) và `CheckoutForm.tsx` (816 -> 194 dòng, 8 component + 4 hook); gom helper trùng ở backend vào `lib/validation.ts`. Không test cũ nào bị sửa. Danh sách file còn > 500 dòng và phần chưa làm ở D-074.

### D-074 Tách file lớn và hộp thoại dùng chung
- **Phạm vi:** tách các file nguồn quá lớn theo trách nhiệm (BE và FE, danh sách chốt khi bắt đầu nhóm bằng số dòng thật); gom các hộp thoại FE về một thành phần dùng chung (nền là `AdminModal` và `ConfirmDialog`).
- **Quyết định chính:** KHÔNG đổi hành vi, API hay giao diện; chỉ di chuyển/đặt tên lại; không gộp thay đổi chức năng vào cùng lượt.
- **Tiêu chí xong:** toàn bộ test hiện có và E2E (a11y, focus trap, Esc, trả focus) vẫn xanh không sửa kỳ vọng; coverage không tụt dưới ngưỡng D-055.

## Nhóm 3 – R-09, R-05, "Mua lại"

**Trạng thái: Đã làm (2026-11-23), chờ commit.** Kết quả kiểm ở `testing.md` mục "Kết quả kiểm Đợt 4 (nhóm 3)".

**Đã làm:** D-075 (catalog `public, max-age=30, s-maxage=60, stale-while-revalidate=120` chỉ khi thành công, lỗi luôn `no-store`; `/uploads` tên hex ngẫu nhiên `immutable` 1 năm, tên khác 1 ngày; cache `getShopSettings` 30 giây xóa khi admin lưu, không dùng trong transaction). D-076 (khóa 15 phút theo mã đơn sau 5 lần sai, áp cho track, hủy, tạo thanh toán, GET/claim chuyển khoản; FE hiện thời gian chờ). D-077 (`POST /me/orders/:code/reorder`, nút "Mua lại"). Sửa nhỏ: mini-cart trả focus về nút "Thêm vào giỏ" (hoặc nút giỏ header). Hợp đồng ở `api-contract.md` 0.27.

### D-075 Cache HTTP cho catalog, ảnh và cài đặt (R-09)
- **Phạm vi:** header `Cache-Control`/`ETag` cho GET công khai của catalog, `/uploads/*` và `/settings/public`.
- **Quyết định chính:** thời hạn ngắn, `stale-while-revalidate` vừa phải; không cache response có dữ liệu người dùng hoặc `/admin/*` (giữ `no-store`).
- **Tiêu chí xong:** test header theo từng nhóm route, test 304, không cache nhầm response cá nhân hóa.

### D-076 Khóa tạm theo mã đơn (R-05)
- **Phạm vi:** chống dò mã đơn/SĐT ở thao tác khách vãng lai (tra cứu, hủy, chuyển khoản).
- **Quyết định chính:** khóa tạm theo mã đơn sau số lần sai liên tiếp (ngoài rate limit theo IP hiện có); thông báo không lộ đơn có tồn tại hay không.
- **Tiêu chí xong:** test khóa và mở khóa theo thời gian, không ảnh hưởng đơn khác, không ảnh hưởng luồng đúng.

### D-077 "Mua lại" (FR-ORD-07)
- **Phạm vi:** nút "Mua lại" ở chi tiết đơn của khách đăng nhập: đưa lại các dòng còn bán vào giỏ.
- **Quyết định chính:** giá và tồn kho lấy lúc mua lại (không dùng giá cũ); dòng hết hàng hoặc ngừng bán được báo rõ, không làm hỏng giỏ.
- **Tiêu chí xong:** test BE và FE, E2E một luồng mua lại.

## Nhóm 4 – R-23 Giá vốn bình quân gia quyền di động và lợi nhuận gộp

**Trạng thái: Đã làm (2026-11-23), chờ commit.** Kết quả kiểm ở `testing.md` mục "Kết quả kiểm Đợt 4 (nhóm 4)".

**Đã làm:** D-078 (bình quân gia quyền di động theo biến thể; `avgCost`, `InventoryMovement.unitCost`, `OrderItem.unitCost`; nhập hàng Admin bắt buộc đơn giá; sửa tay có audit `variant.cost_set`; lợi nhuận gộp, biên, độ phủ ở overview/top-products/inventory/CSV; cột `avg_cost` ở CSV sản phẩm; seed và generator demo có giá vốn; FE VariantDialog/StockAdjustDialog/phân tích). Hợp đồng `api-contract.md` 0.28, migration `d078_avg_cost`. Không backfill đơn cũ; Staff không thấy giá vốn.

### D-078 Giá vốn và lợi nhuận gộp
- **Phạm vi:** giá vốn theo biến thể, nhập hàng ghi nhận giá nhập, tính giá vốn bình quân gia quyền di động, lợi nhuận gộp ở phân tích (Admin).
- **Quyết định chính:** snapshot giá vốn vào dòng đơn lúc đặt để báo cáo không đổi ngược; số liệu cũ chưa có giá vốn hiển thị "chưa có", không đoán; tiền luôn là số nguyên VND.
- **Tiêu chí xong:** test công thức (nhập nhiều lần, xuất, hủy đơn hoàn kho), contract và db-schema cập nhật, báo cáo không đổi số liệu doanh thu hiện có.
