"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FieldError, Input, Label } from "@/components/ui/Input";
import { FormError } from "@/features/auth/components/FormError";
import { ApiError } from "@/lib/api/errors";
import type { AdminCategory, AdminCoupon, CouponType } from "@/types/admin";
import { createAdminCoupon, updateAdminCoupon } from "../api/coupons";
import {
  buildCreateBody,
  buildUpdateBody,
  initialCouponState,
  validateCoupon,
  type CouponFormState,
} from "../couponValidation";
import { adminErrorMessage, fieldErrorsOf } from "../errors";
import { ALL_COUPON_TYPES, COUPON_TYPE_LABEL } from "../labels";
import { CouponScopePicker } from "./CouponScopePicker";

const selectClass =
  "h-11 w-full rounded-lg border border-coffee-400 bg-white px-3 text-base text-coffee-900 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-moss-600 disabled:cursor-not-allowed disabled:bg-coffee-50 disabled:opacity-70";

const FIELD_KEYS = [
  "code",
  "type",
  "value",
  "maxDiscount",
  "minOrder",
  "startsAt",
  "endsAt",
  "usageLimit",
  "perUserLimit",
  "description",
  "isActive",
];

/** Form tạo/sửa mã giảm giá. `coupon` có giá trị = sửa (khóa code và type). */
export function CouponForm({
  coupon,
  categories,
  productNames,
  onSaved,
}: {
  coupon?: AdminCoupon;
  categories: AdminCategory[];
  productNames: Record<string, string>;
  onSaved: (saved: AdminCoupon, mode: "create" | "update") => void;
}) {
  const editing = Boolean(coupon);
  const [form, setForm] = useState<CouponFormState>(() => initialCouponState(coupon));
  const [names, setNames] = useState<Record<string, string>>(productNames);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const set = <K extends keyof CouponFormState>(key: K, value: CouponFormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const err = (k: string) => errors[k];
  const describe = (k: string, hint?: string) =>
    [err(k) ? `cf-${k}-err` : null, hint ?? null].filter(Boolean).join(" ") || undefined;

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (busyRef.current) return;
    const found = validateCoupon(form, coupon?.usedCount ?? 0);
    setErrors(found);
    setGeneral(null);
    if (Object.keys(found).length > 0) return;

    let body;
    if (coupon) {
      body = buildUpdateBody(form, coupon);
      if (Object.keys(body).length === 0) {
        setGeneral("Chưa có thay đổi nào để lưu.");
        return;
      }
    } else {
      body = buildCreateBody(form);
    }

    busyRef.current = true;
    setBusy(true);
    try {
      const saved = coupon
        ? await updateAdminCoupon(coupon.id, body)
        : await createAdminCoupon(body);
      onSaved(saved, coupon ? "update" : "create");
    } catch (e) {
      if (e instanceof ApiError && e.code === "COUPON_CODE_TAKEN") {
        setErrors({ code: "Mã này đã tồn tại, vui lòng chọn mã khác." });
      } else {
        const fe = fieldErrorsOf(e);
        const shown: Record<string, string> = {};
        for (const [k, v] of Object.entries(fe)) {
          if (FIELD_KEYS.includes(k)) shown[k] = v;
          else if (k === "scope" || k.startsWith("scope.")) {
            shown[k.includes("product") ? "scope.productIds" : "scope.categoryIds"] = v;
          }
        }
        setErrors(shown);
        if (Object.keys(shown).length === 0) setGeneral(adminErrorMessage(e));
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const numeric = { inputMode: "numeric" as const, autoComplete: "off" };

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-label={editing ? "Sửa mã giảm giá" : "Thêm mã giảm giá"}
      className="space-y-5 rounded-2xl border border-coffee-200 bg-white p-4 sm:p-5"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="cf-code">Mã giảm giá</Label>
          <Input
            id="cf-code"
            value={form.code}
            maxLength={30}
            autoComplete="off"
            disabled={editing}
            placeholder="WELCOME10"
            invalid={Boolean(err("code"))}
            aria-describedby={describe("code", "cf-code-hint")}
            onChange={(e) => set("code", e.target.value.toUpperCase())}
            className="font-mono"
          />
          <p id="cf-code-hint" className="mt-1.5 text-sm text-coffee-700">
            {editing
              ? "Không thể đổi mã sau khi tạo."
              : "3-30 ký tự: chữ in hoa, số, dấu - hoặc _."}
          </p>
          <FieldError id="cf-code-err">{err("code")}</FieldError>
        </div>

        <div>
          <Label htmlFor="cf-type">Loại mã</Label>
          <select
            id="cf-type"
            className={selectClass}
            value={form.type}
            disabled={editing}
            onChange={(e) => {
              const type = e.target.value as CouponType;
              setForm((f) => ({
                ...f,
                type,
                value: type === "FREESHIP" ? "" : f.value,
                maxDiscount: type === "FIXED" ? "" : f.maxDiscount,
              }));
            }}
          >
            {ALL_COUPON_TYPES.map((t) => (
              <option key={t} value={t}>
                {COUPON_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
          {editing ? (
            <p className="mt-1.5 text-sm text-coffee-700">Không thể đổi loại mã.</p>
          ) : null}
        </div>

        {form.type !== "FREESHIP" ? (
          <div>
            <Label htmlFor="cf-value">
              {form.type === "PERCENT" ? "Phần trăm giảm (1-100)" : "Số tiền giảm (₫)"}
            </Label>
            <Input
              id="cf-value"
              value={form.value}
              maxLength={11}
              {...numeric}
              invalid={Boolean(err("value"))}
              aria-describedby={describe("value")}
              onChange={(e) => set("value", e.target.value)}
            />
            <FieldError id="cf-value-err">{err("value")}</FieldError>
          </div>
        ) : null}

        {form.type !== "FIXED" ? (
          <div>
            <Label htmlFor="cf-max">
              {form.type === "PERCENT"
                ? "Giảm tối đa (₫, không bắt buộc)"
                : "Giảm phí ship tối đa (₫, không bắt buộc)"}
            </Label>
            <Input
              id="cf-max"
              value={form.maxDiscount}
              maxLength={10}
              {...numeric}
              placeholder={
                form.type === "FREESHIP" ? "Để trống = miễn toàn bộ phí ship" : undefined
              }
              invalid={Boolean(err("maxDiscount"))}
              aria-describedby={describe("maxDiscount")}
              onChange={(e) => set("maxDiscount", e.target.value)}
            />
            <FieldError id="cf-maxDiscount-err">{err("maxDiscount")}</FieldError>
          </div>
        ) : null}

        <div>
          <Label htmlFor="cf-min">Đơn tối thiểu (₫)</Label>
          <Input
            id="cf-min"
            value={form.minOrder}
            maxLength={10}
            {...numeric}
            invalid={Boolean(err("minOrder"))}
            aria-describedby={describe("minOrder")}
            onChange={(e) => set("minOrder", e.target.value)}
          />
          <FieldError id="cf-minOrder-err">{err("minOrder")}</FieldError>
        </div>

        <div>
          <Label htmlFor="cf-start">Bắt đầu (giờ Việt Nam, không bắt buộc)</Label>
          <Input
            id="cf-start"
            type="datetime-local"
            value={form.startsAt}
            invalid={Boolean(err("startsAt"))}
            aria-describedby={describe("startsAt")}
            onChange={(e) => set("startsAt", e.target.value)}
          />
          <FieldError id="cf-startsAt-err">{err("startsAt")}</FieldError>
        </div>

        <div>
          <Label htmlFor="cf-end">Kết thúc (giờ Việt Nam, không bắt buộc)</Label>
          <Input
            id="cf-end"
            type="datetime-local"
            value={form.endsAt}
            invalid={Boolean(err("endsAt"))}
            aria-describedby={describe("endsAt")}
            onChange={(e) => set("endsAt", e.target.value)}
          />
          <FieldError id="cf-endsAt-err">{err("endsAt")}</FieldError>
        </div>

        <div>
          <Label htmlFor="cf-usage">Tổng lượt dùng (để trống = không giới hạn)</Label>
          <Input
            id="cf-usage"
            value={form.usageLimit}
            maxLength={10}
            {...numeric}
            invalid={Boolean(err("usageLimit"))}
            aria-describedby={describe("usageLimit", editing ? "cf-usage-hint" : undefined)}
            onChange={(e) => set("usageLimit", e.target.value)}
          />
          {coupon ? (
            <p id="cf-usage-hint" className="mt-1.5 text-sm text-coffee-700">
              Đã dùng {coupon.usedCount.toLocaleString("vi-VN")} lượt. Tổng lượt không được nhỏ hơn
              số này.
            </p>
          ) : null}
          <FieldError id="cf-usageLimit-err">{err("usageLimit")}</FieldError>
        </div>

        <div>
          <Label htmlFor="cf-peruser">Lượt mỗi khách (để trống = không giới hạn)</Label>
          <Input
            id="cf-peruser"
            value={form.perUserLimit}
            maxLength={10}
            {...numeric}
            invalid={Boolean(err("perUserLimit"))}
            aria-describedby={describe("perUserLimit")}
            onChange={(e) => set("perUserLimit", e.target.value)}
          />
          <FieldError id="cf-perUserLimit-err">{err("perUserLimit")}</FieldError>
        </div>
      </div>

      <CouponScopePicker
        categories={categories}
        categoryIds={form.categoryIds}
        productIds={form.productIds}
        productNames={names}
        errors={{ categoryIds: err("scope.categoryIds"), productIds: err("scope.productIds") }}
        onCategoryIds={(ids) => set("categoryIds", ids)}
        onProductIds={(ids) => set("productIds", ids)}
        onProductName={(id, name) => setNames((n) => ({ ...n, [id]: name }))}
      />

      <div>
        <Label htmlFor="cf-desc">Mô tả (không bắt buộc, tối đa 200 ký tự)</Label>
        <textarea
          id="cf-desc"
          rows={2}
          value={form.description}
          maxLength={200}
          aria-invalid={err("description") ? true : undefined}
          aria-describedby={describe("description")}
          onChange={(e) => set("description", e.target.value)}
          className="w-full rounded-lg border border-coffee-400 bg-white px-3 py-2 text-base text-coffee-900 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-moss-600"
        />
        <FieldError id="cf-description-err">{err("description")}</FieldError>
      </div>

      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-coffee-900">
        <input
          type="checkbox"
          className="h-5 w-5 accent-moss-700"
          checked={form.isActive}
          onChange={(e) => set("isActive", e.target.checked)}
        />
        Đang bật (khách có thể dùng mã)
      </label>

      <FormError>{general}</FormError>

      <div className="flex justify-end">
        <Button type="submit" loading={busy}>
          {editing ? "Lưu thay đổi" : "Tạo mã giảm giá"}
        </Button>
      </div>
    </form>
  );
}
