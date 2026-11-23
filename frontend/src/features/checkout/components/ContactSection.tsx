"use client";

import { Label } from "@/components/ui/Input";
import { TextField } from "@/features/auth/components/Fields";
import type { User } from "@/types/auth";
import { Section } from "./RadioCard";

export function ContactSection({
  authed,
  user,
  email,
  setEmail,
  phone,
  setPhone,
  errors,
  clearError,
}: {
  authed: boolean;
  user: User | null;
  email: string;
  setEmail: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  errors: Record<string, string>;
  clearError: (...ids: string[]) => void;
}) {
  return (
    <Section title="Thông tin liên hệ" id="checkout-contact">
      {authed ? (
        <>
          <div>
            <Label htmlFor="contactEmailRO">Email</Label>
            <input
              id="contactEmailRO"
              value={user?.email ?? ""}
              readOnly
              className="h-11 w-full rounded-lg border border-coffee-300 bg-coffee-50 px-3 text-base text-coffee-800"
            />
          </div>
          <TextField
            id="contactPhone"
            label="Số điện thoại liên hệ (không bắt buộc)"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            hint="Nếu bỏ trống, chúng tôi dùng số điện thoại của địa chỉ nhận hàng."
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              clearError("contactPhone");
            }}
            error={errors.contactPhone}
          />
        </>
      ) : (
        <>
          <TextField
            id="contactEmail"
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              clearError("contactEmail");
            }}
            error={errors.contactEmail}
            required
          />
          <TextField
            id="contactPhone"
            label="Số điện thoại"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              clearError("contactPhone");
            }}
            error={errors.contactPhone}
            required
          />
        </>
      )}
    </Section>
  );
}
