export interface LocationInput {
  provinceCode?: string;
  provinceName?: string;
  wardCode?: string;
  wardName?: string;
}

/**
 * Điểm duy nhất xử lý mã/tên hành chính của địa chỉ.
 * Hiện chỉ kiểm định dạng (đã do zod làm) và trả đúng tên client gửi.
 */
// BLOCKED(D-006/D-008): khi có file provinces-wards.json -> tra tên từ dữ liệu, bỏ tên client, 400 nếu mã sai/phường không thuộc tỉnh
export function resolveLocation(input: LocationInput): LocationInput {
  const out: LocationInput = {};
  if (input.provinceCode !== undefined) out.provinceCode = input.provinceCode;
  if (input.provinceName !== undefined) out.provinceName = input.provinceName;
  if (input.wardCode !== undefined) out.wardCode = input.wardCode;
  if (input.wardName !== undefined) out.wardName = input.wardName;
  return out;
}
