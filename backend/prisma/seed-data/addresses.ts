/** Địa chỉ mẫu của customer@beanbox.local. Tên tỉnh/phường KHÔNG gõ cứng: lấy qua resolveLocation. */
export const SEED_CUSTOMER_EMAIL = 'customer@beanbox.local';

export const SEED_ADDRESSES = [
  {
    fullName: 'Khách hàng mẫu',
    phone: '0901234567',
    provinceCode: '01',
    wardCode: '00070',
    line1: '12 Hàng Bài',
    isDefault: true,
  },
  {
    fullName: 'Khách hàng mẫu',
    phone: '0912345678',
    provinceCode: '79',
    wardCode: '26740',
    line1: '12 Lê Lợi',
    isDefault: false,
  },
] as const;
