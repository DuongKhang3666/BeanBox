"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { mapAuthError } from "@/features/auth/errors";
import { TextField } from "@/features/auth/components/Fields";
import { FormError } from "@/features/auth/components/FormError";
import { focusFirstInvalid } from "@/features/auth/components/focus";
import {
  normalizePhone,
  validateFullName,
  validateOptionalPhone,
} from "@/features/auth/validation";
import { ApiError } from "@/lib/api/errors";
import type { Address, CreateAddressInput, UpdateAddressInput } from "@/types/account";
import { createAddress, updateAddress } from "../api";
import { validateLine1, validateProvinceCode, validateWardCode } from "../validation";
import { LOCATION_FIELDS, LocationFields, type LocationValues } from "./LocationFields";

const FIELDS = ["fullName", "phone", "line1", ...LOCATION_FIELDS] as const;

/** Payload sửa: chỉ trường đổi. Đổi tỉnh -> gửi cả provinceCode + wardCode; chỉ đổi phường -> wardCode. Không gửi tên. */
export function buildUpdatePayload(
  address: Address,
  v: {
    fullName: string;
    phone: string;
    line1: string;
    isDefault: boolean;
  } & LocationValues,
): UpdateAddressInput {
  const payload: UpdateAddressInput = {};
  const fullName = v.fullName.trim();
  const phone = normalizePhone(v.phone);
  const line1 = v.line1.trim();
  const provinceCode = v.provinceCode.trim();
  const wardCode = v.wardCode.trim();

  if (fullName !== address.fullName) payload.fullName = fullName;
  if (phone !== address.phone) payload.phone = phone;
  if (line1 !== address.line1) payload.line1 = line1;

  if (provinceCode !== address.provinceCode) {
    payload.provinceCode = provinceCode;
    payload.wardCode = wardCode;
  } else if (wardCode !== address.wardCode) {
    payload.wardCode = wardCode;
  }
  if (v.isDefault && !address.isDefault) payload.isDefault = true;
  return payload;
}

export function AddressForm({
  address,
  onSaved,
  onCancel,
  onGone,
}: {
  /** Có -> sửa; không -> tạo mới. */
  address?: Address;
  onSaved: (message: string) => void;
  onCancel: () => void;
  /** 404: địa chỉ đã bị xóa ở nơi khác. */
  onGone: () => void;
}) {
  const editing = !!address;
  const headingId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const busy = useRef(false);
  const focusAfterSave = useRef(false);

  const [fullName, setFullName] = useState(address?.fullName ?? "");
  const [phone, setPhone] = useState(address?.phone ?? "");
  const [line1, setLine1] = useState(address?.line1 ?? "");
  const [loc, setLoc] = useState<LocationValues>({
    provinceCode: address?.provinceCode ?? "",
    wardCode: address?.wardCode ?? "",
  });
  const [isDefault, setIsDefault] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>("input")?.focus();
  }, []);

  useEffect(() => {
    if (!saving && focusAfterSave.current) {
      focusAfterSave.current = false;
      focusFirstInvalid(FIELDS, errors);
    }
  }, [saving, errors]);

  const values = { fullName, phone, line1, isDefault, ...loc };
  const dirty = !address || Object.keys(buildUpdatePayload(address, values)).length > 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy.current || !dirty) return;

    const fe: Record<string, string> = {};
    const nameErr = validateFullName(fullName);
    // SĐT bắt buộc với địa chỉ nhận hàng.
    const phoneErr = phone.trim() ? validateOptionalPhone(phone) : "Vui lòng nhập số điện thoại";
    const lineErr = validateLine1(line1);
    const pcErr = validateProvinceCode(loc.provinceCode);
    const wcErr = validateWardCode(loc.wardCode);
    if (nameErr) fe.fullName = nameErr;
    if (phoneErr) fe.phone = phoneErr;
    if (lineErr) fe.line1 = lineErr;
    if (pcErr) fe.provinceCode = pcErr;
    if (wcErr) fe.wardCode = wcErr;
    setErrors(fe);
    setFormError(undefined);
    if (Object.keys(fe).length > 0) {
      focusFirstInvalid(FIELDS, fe);
      return;
    }

    busy.current = true;
    setSaving(true);
    try {
      if (address) {
        await updateAddress(address.id, buildUpdatePayload(address, values));
        onSaved("Đã cập nhật địa chỉ.");
      } else {
        const body: CreateAddressInput = {
          fullName: fullName.trim(),
          phone: normalizePhone(phone),
          provinceCode: loc.provinceCode.trim(),
          wardCode: loc.wardCode.trim(),
          line1: line1.trim(),
          ...(isDefault ? { isDefault: true } : {}),
        };
        await createAddress(body);
        onSaved("Đã thêm địa chỉ.");
      }
      return;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404 && address) {
        onGone();
        return;
      }
      if (err instanceof ApiError && err.code === "ADDRESS_LIMIT_REACHED") {
        setFormError("Bạn đã có tối đa 10 địa chỉ. Hãy xóa bớt một địa chỉ trước khi thêm mới.");
      } else {
        const mapped = mapAuthError(err, FIELDS);
        setErrors(mapped.fieldErrors);
        setFormError(mapped.formError);
        focusAfterSave.current = true; // fieldset còn disabled tới khi saving=false
      }
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      noValidate
      aria-labelledby={headingId}
      aria-busy={saving}
      className="space-y-4 rounded-2xl border border-coffee-300 bg-white p-5 shadow-sm sm:p-6"
    >
      <h2 id={headingId} className="font-serif text-xl font-bold text-coffee-900">
        {editing ? "Sửa địa chỉ" : "Thêm địa chỉ mới"}
      </h2>
      <FormError>{formError}</FormError>
      <TextField
        id="fullName"
        label="Họ và tên người nhận"
        autoComplete="name"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        error={errors.fullName}
        readOnly={saving}
        required
      />
      <TextField
        id="phone"
        label="Số điện thoại"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        error={errors.phone}
        readOnly={saving}
        required
      />
      <TextField
        id="line1"
        label="Địa chỉ chi tiết (số nhà, đường)"
        autoComplete="address-line1"
        value={line1}
        onChange={(e) => setLine1(e.target.value)}
        error={errors.line1}
        readOnly={saving}
        required
      />
      <LocationFields
        values={loc}
        errors={errors}
        onChange={setLoc}
        disabled={saving}
        initialNames={
          address ? { provinceName: address.provinceName, wardName: address.wardName } : undefined
        }
      />
      {!address?.isDefault ? (
        <label className="flex min-h-11 items-center gap-3 text-coffee-900">
          <input
            type="checkbox"
            id="isDefault"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            disabled={saving}
            className="h-5 w-5 accent-moss-700"
          />
          Đặt làm địa chỉ mặc định
        </label>
      ) : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Hủy
        </Button>
        <Button type="submit" loading={saving} disabled={!dirty}>
          {saving ? "Đang lưu..." : editing ? "Lưu thay đổi" : "Thêm địa chỉ"}
        </Button>
      </div>
    </form>
  );
}
