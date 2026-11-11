"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FieldError, Input, Label } from "@/components/ui/Input";
import { FormError } from "@/features/auth/components/FormError";
import { ApiError } from "@/lib/api/errors";
import type { AdminBrand, BrandInput } from "@/types/admin";
import { createAdminBrand, updateAdminBrand } from "../api/catalog";
import { imageUrlError, nameError, slugError, slugify } from "../catalogValidation";
import { adminErrorMessage, fieldErrorsOf } from "../errors";
import { AdminModal } from "./AdminModal";

/** Form tạo/sửa thương hiệu (dialog). `brand` có giá trị = sửa. */
export function BrandForm({
  brand,
  onSaved,
  onClose,
}: {
  brand?: AdminBrand;
  onSaved: (saved: AdminBrand, mode: "create" | "update") => void;
  onClose: () => void;
}) {
  const editing = Boolean(brand);
  const [name, setName] = useState(brand?.name ?? "");
  const [slug, setSlug] = useState(brand?.slug ?? "");
  const [logoUrl, setLogoUrl] = useState(brand?.logoUrl ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const slugChanged = editing && slug.trim() !== "" && slug.trim() !== brand!.slug;

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (busyRef.current) return;
    const found: Record<string, string> = {};
    const checks: Array<[string, string | undefined]> = [
      ["name", nameError(name)],
      ["slug", slugError(slug)],
      ["logoUrl", imageUrlError(logoUrl)],
    ];
    for (const [k, v] of checks) if (v) found[k] = v;
    setErrors(found);
    setGeneral(null);
    if (Object.keys(found).length > 0) return;

    const n = name.trim();
    const s = slug.trim();
    const logo = logoUrl.trim();
    const body: BrandInput = {};
    if (!brand) {
      body.name = n;
      if (s) body.slug = s;
      if (logo) body.logoUrl = logo;
    } else {
      if (n !== brand.name) body.name = n;
      if (s && s !== brand.slug) body.slug = s;
      if ((logo || null) !== brand.logoUrl) body.logoUrl = logo || null;
      if (Object.keys(body).length === 0) {
        onClose();
        return;
      }
    }

    busyRef.current = true;
    setBusy(true);
    try {
      const saved = brand ? await updateAdminBrand(brand.id, body) : await createAdminBrand(body);
      onSaved(saved, brand ? "update" : "create");
    } catch (err) {
      if (err instanceof ApiError && err.code === "SLUG_TAKEN") {
        setErrors({ slug: "Slug này đã được dùng, vui lòng chọn slug khác." });
      } else {
        const fe = fieldErrorsOf(err);
        const shown: Record<string, string> = {};
        for (const k of ["name", "slug", "logoUrl"]) if (fe[k]) shown[k] = fe[k];
        setErrors(shown);
        if (Object.keys(shown).length === 0) setGeneral(adminErrorMessage(err));
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <AdminModal
      title={editing ? "Sửa thương hiệu" : "Thêm thương hiệu"}
      busy={busy}
      onClose={onClose}
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div>
          <Label htmlFor="bf-name">Tên thương hiệu</Label>
          <Input
            id="bf-name"
            data-autofocus
            value={name}
            maxLength={100}
            autoComplete="off"
            invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? "bf-name-err" : undefined}
            onChange={(e) => setName(e.target.value)}
          />
          <FieldError id="bf-name-err">{errors.name}</FieldError>
        </div>

        <div>
          <Label htmlFor="bf-slug">Slug (không bắt buộc)</Label>
          <Input
            id="bf-slug"
            value={slug}
            maxLength={120}
            autoComplete="off"
            placeholder={slugify(name) || "ten-thuong-hieu"}
            invalid={Boolean(errors.slug)}
            aria-describedby={errors.slug ? "bf-slug-err bf-slug-hint" : "bf-slug-hint"}
            onChange={(e) => setSlug(e.target.value)}
          />
          <p id="bf-slug-hint" className="mt-1.5 text-sm text-coffee-700">
            {editing ? "Slug là phần cuối của đường dẫn thương hiệu." : "Để trống để tự tạo từ tên"}
          </p>
          {slugChanged ? (
            <p className="mt-1.5 rounded-lg border border-coffee-300 bg-cream-100 px-3 py-2 text-sm text-coffee-900">
              Đổi slug sẽ làm hỏng liên kết cũ tới thương hiệu này
            </p>
          ) : null}
          <FieldError id="bf-slug-err">{errors.slug}</FieldError>
        </div>

        <div>
          <Label htmlFor="bf-logo">URL logo (không bắt buộc)</Label>
          <Input
            id="bf-logo"
            type="url"
            value={logoUrl}
            maxLength={500}
            autoComplete="off"
            placeholder="https://… hoặc /uploads/…"
            invalid={Boolean(errors.logoUrl)}
            aria-describedby={errors.logoUrl ? "bf-logo-err" : undefined}
            onChange={(e) => setLogoUrl(e.target.value)}
          />
          <FieldError id="bf-logo-err">{errors.logoUrl}</FieldError>
        </div>

        <FormError>{general}</FormError>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Đóng
          </Button>
          <Button type="submit" loading={busy}>
            {editing ? "Lưu thay đổi" : "Tạo thương hiệu"}
          </Button>
        </div>
      </form>
    </AdminModal>
  );
}
