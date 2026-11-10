"use client";

import { TextField } from "@/features/auth/components/Fields";

export interface LocationValues {
  provinceCode: string;
  provinceName: string;
  wardCode: string;
  wardName: string;
}

export const LOCATION_FIELDS = ["provinceCode", "provinceName", "wardCode", "wardName"] as const;

/**
 * Khối nhập vị trí TẠM THỜI (D-008): chưa có dữ liệu hành chính nên người dùng nhập tay mã + tên.
 * Không tự tạo danh sách tỉnh/phường ở FE.
 */
// BLOCKED(D-006/D-008): thay bằng dropdown từ GET /locations khi có dữ liệu
export function LocationFieldsTemporary({
  values,
  errors,
  onChange,
  disabled,
}: {
  values: LocationValues;
  errors: Record<string, string>;
  onChange: (field: keyof LocationValues, value: string) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="space-y-4" disabled={disabled}>
      <legend className="mb-1 text-sm font-medium text-coffee-900">Tỉnh/thành và phường/xã</legend>
      <p className="text-sm text-coffee-700">
        Danh mục tỉnh/phường đang được cập nhật, vui lòng nhập tạm.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="provinceCode"
          label="Mã tỉnh/thành (2 chữ số)"
          inputMode="numeric"
          maxLength={2}
          autoComplete="off"
          value={values.provinceCode}
          onChange={(e) => onChange("provinceCode", e.target.value)}
          error={errors.provinceCode}
          required
        />
        <TextField
          id="provinceName"
          label="Tên tỉnh/thành"
          autoComplete="address-level1"
          value={values.provinceName}
          onChange={(e) => onChange("provinceName", e.target.value)}
          error={errors.provinceName}
          required
        />
        <TextField
          id="wardCode"
          label="Mã phường/xã (5 chữ số)"
          inputMode="numeric"
          maxLength={5}
          autoComplete="off"
          value={values.wardCode}
          onChange={(e) => onChange("wardCode", e.target.value)}
          error={errors.wardCode}
          required
        />
        <TextField
          id="wardName"
          label="Tên phường/xã"
          autoComplete="address-level2"
          value={values.wardName}
          onChange={(e) => onChange("wardName", e.target.value)}
          error={errors.wardName}
          required
        />
      </div>
    </fieldset>
  );
}
