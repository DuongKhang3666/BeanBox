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

/** Body tạo địa chỉ. Server tự điền provinceName/wardName từ mã (docs/api-contract.md §6.3). */
export interface CreateAddressInput {
  fullName: string;
  phone: string;
  provinceCode: string;
  wardCode: string;
  line1: string;
  isDefault?: boolean;
}

/** Body sửa (>= 1 trường). Đổi tỉnh: gửi provinceCode + wardCode; chỉ đổi phường: wardCode. */
export type UpdateAddressInput = Partial<CreateAddressInput>;
