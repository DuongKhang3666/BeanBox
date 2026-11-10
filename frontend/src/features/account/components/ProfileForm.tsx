"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { updateMe, type UpdateMeInput } from "@/features/auth/api";
import { useAuth } from "@/features/auth/AuthProvider";
import { mapAuthError } from "@/features/auth/errors";
import { FormError, FormNotice } from "@/features/auth/components/FormError";
import { TextField } from "@/features/auth/components/Fields";
import { focusFirstInvalid } from "@/features/auth/components/focus";
import {
  normalizePhone,
  validateFullName,
  validateOptionalPhone,
} from "@/features/auth/validation";
import { todayISO, validateAvatarUrl, validateBirthDate } from "../validation";
import { Section } from "./Section";

const FIELDS = ["fullName", "phone", "birthDate", "avatarUrl"] as const;

export function ProfileForm() {
  const { user, setUser } = useAuth();
  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [birthDate, setBirthDate] = useState(user?.birthDate ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);

  if (!user) return null;
  const current = user;

  /** Chỉ các trường khác với giá trị hiện có của user. */
  function buildPayload(): UpdateMeInput {
    const payload: UpdateMeInput = {};
    if (fullName.trim() !== current.fullName) payload.fullName = fullName.trim();
    const nextPhone = phone.trim() ? normalizePhone(phone) : null;
    if (nextPhone !== current.phone) payload.phone = nextPhone;
    const nextBirth = birthDate || null;
    if (nextBirth !== current.birthDate) payload.birthDate = nextBirth;
    const nextAvatar = avatarUrl.trim() || null;
    if (nextAvatar !== current.avatarUrl) payload.avatarUrl = nextAvatar;
    return payload;
  }

  const payload = buildPayload();
  const dirty = Object.keys(payload).length > 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy.current || !dirty) return;

    const fe: Record<string, string> = {};
    const nameErr = validateFullName(fullName);
    const phoneErr = validateOptionalPhone(phone);
    const birthErr = validateBirthDate(birthDate);
    const avatarErr = validateAvatarUrl(avatarUrl);
    if (nameErr) fe.fullName = nameErr;
    if (phoneErr) fe.phone = phoneErr;
    if (birthErr) fe.birthDate = birthErr;
    if (avatarErr) fe.avatarUrl = avatarErr;
    setErrors(fe);
    setFormError(undefined);
    setNotice(undefined);
    if (Object.keys(fe).length > 0) {
      focusFirstInvalid(FIELDS, fe);
      return;
    }

    busy.current = true;
    setSaving(true);
    try {
      const updated = await updateMe(payload);
      setUser(updated);
      setFullName(updated.fullName);
      setPhone(updated.phone ?? "");
      setBirthDate(updated.birthDate ?? "");
      setAvatarUrl(updated.avatarUrl ?? "");
      setNotice("Đã lưu");
    } catch (err) {
      const mapped = mapAuthError(err, FIELDS);
      setErrors(mapped.fieldErrors);
      setFormError(mapped.formError);
      focusFirstInvalid(FIELDS, mapped.fieldErrors);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return (
    <Section title="Thông tin cá nhân" headingId="account-profile">
      <form onSubmit={onSubmit} noValidate className="space-y-4" aria-busy={saving}>
        <FormError>{formError}</FormError>
        <FormNotice>{notice}</FormNotice>
        <TextField
          id="fullName"
          label="Họ và tên"
          autoComplete="name"
          value={fullName}
          onChange={(e) => {
            setFullName(e.target.value);
            setNotice(undefined);
          }}
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
          onChange={(e) => {
            setPhone(e.target.value);
            setNotice(undefined);
          }}
          error={errors.phone}
          hint="Để trống nếu bạn không muốn lưu số điện thoại."
          readOnly={saving}
        />
        <TextField
          id="birthDate"
          label="Ngày sinh"
          type="date"
          max={todayISO()}
          autoComplete="bday"
          value={birthDate}
          onChange={(e) => {
            setBirthDate(e.target.value);
            setNotice(undefined);
          }}
          error={errors.birthDate}
          readOnly={saving}
        />
        <TextField
          id="avatarUrl"
          label="Đường dẫn ảnh đại diện"
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder="https://"
          value={avatarUrl}
          onChange={(e) => {
            setAvatarUrl(e.target.value);
            setNotice(undefined);
          }}
          error={errors.avatarUrl}
          readOnly={saving}
        />
        <Button
          type="submit"
          size="lg"
          loading={saving}
          disabled={!dirty}
          className="w-full sm:w-auto"
        >
          {saving ? "Đang lưu..." : "Lưu thay đổi"}
        </Button>
      </form>
    </Section>
  );
}
