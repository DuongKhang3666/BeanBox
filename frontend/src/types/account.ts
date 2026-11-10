/** Kiểu sổ địa chỉ theo docs/api-contract.md §6.3. */

export interface Address {
  id: string;
  fullName: string;
  /** Đã chuẩn hóa 0xxxxxxxxx */
  phone: string;
  provinceCode: string;
  provinceName: string;
  wardCode: string;
  wardName: string;
  line1: string;
  isDefault: boolean;
  createdAt: string;
}

/**
 * Body tạo địa chỉ. `provinceName`/`wardName` là TẠM THỜI (D-008): client nhập tay,
 * khi có dữ liệu hành chính server tự điền và bỏ qua hai trường này.
 */
export interface CreateAddressInput {
  fullName: string;
  phone: string;
  provinceCode: string;
  provinceName: string;
  wardCode: string;
  wardName: string;
  line1: string;
  isDefault?: boolean;
}

/**
 * Body sửa (>= 1 trường). Ràng buộc D-008: gửi `provinceCode` thì phải kèm đủ
 * `provinceName`, `wardCode`, `wardName`; gửi `wardCode` hoặc `wardName` thì kèm cả hai.
 */
export type UpdateAddressInput = Partial<CreateAddressInput>;
