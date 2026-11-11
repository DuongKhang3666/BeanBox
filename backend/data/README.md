# provinces-wards.json

Danh mục đơn vị hành chính 2 cấp (34 tỉnh/thành, 3.321 phường/xã) có hiệu lực từ 01/07/2025,
theo Quyết định 19/2025/QĐ-TTg.

- Nguồn: https://github.com/ThangLeQuoc/vietnamese-provinces-database (MIT), file
  `json/vn_only_simplified_json_generated_data_vn_units.json`, dataset v5.2.0 (sinh ngày 2026-09-20),
  sắc lệnh mới nhất phản ánh: 388/NQ-UBTVQH16.
- Chuẩn hóa: `[{ code, fullName, wards: [{ code, fullName, postalCode|null }] }]`, sắp theo `code`.
- Đã kiểm: 34 tỉnh, 3.321 phường/xã, mã tỉnh `^\d{2}$`, mã phường `^\d{5}$` và duy nhất toàn quốc; 01 = Hà Nội, 79 = TP.HCM.
- Giấy phép MIT: thông báo bản quyền ở [`NOTICE.md`](NOTICE.md), phải giữ khi phân phối lại.
- Chưa đối chiếu từng dòng với danh mục chính thức của Cục Thống kê; cần đối chiếu định kỳ khi có nghị quyết mới.
