"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/Button";
import { FieldError, Input, Label } from "@/components/ui/Input";
import { ProductImage } from "@/features/catalog/components/ProductImage";
import type { BannerDraft, FieldErrors } from "../../settingsForm";
import { TextField, domId } from "./SettingsFields";

export function BannerEditor({
  banner,
  index,
  total,
  errors,
  uploading,
  onChange,
  onMove,
  onRemove,
  onUpload,
}: {
  banner: BannerDraft;
  index: number;
  total: number;
  errors: FieldErrors;
  uploading: boolean;
  onChange: (patch: Partial<BannerDraft>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onUpload: (file: File) => void;
}) {
  const n = index + 1;
  const p = `home.banners.${index}`;
  const fileRef = useRef<HTMLInputElement>(null);
  const previewable = banner.imageUrl.startsWith("/uploads/");
  const urlId = domId(`${p}.imageUrl`);
  return (
    <li className="space-y-3 rounded-xl border border-coffee-200 p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-coffee-900">Banner {n}</h3>
        <div className="flex flex-wrap gap-1">
          <Button
            size="sm"
            variant="outline"
            aria-label={`Đưa banner ${n} lên`}
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            Lên
          </Button>
          <Button
            size="sm"
            variant="outline"
            aria-label={`Đưa banner ${n} xuống`}
            disabled={index === total - 1}
            onClick={() => onMove(1)}
          >
            Xuống
          </Button>
          <Button size="sm" variant="danger" aria-label={`Xóa banner ${n}`} onClick={onRemove}>
            Xóa
          </Button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
        {previewable ? (
          <ProductImage
            src={banner.imageUrl}
            alt={banner.alt}
            name={`Banner ${n}`}
            sizes="128px"
            className="h-32 w-32 rounded-lg"
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex h-32 w-32 items-center justify-center rounded-lg bg-cream-200 text-center text-xs text-coffee-700"
          >
            Chưa có ảnh
          </div>
        )}
        <div className="min-w-0 space-y-2">
          <div>
            <Label htmlFor={urlId}>{`Đường dẫn ảnh banner ${n}`}</Label>
            <Input
              id={urlId}
              value={banner.imageUrl}
              placeholder="/uploads/..."
              autoComplete="off"
              invalid={Boolean(errors[`${p}.imageUrl`])}
              aria-describedby={errors[`${p}.imageUrl`] ? `${urlId}-err` : undefined}
              onChange={(e) => onChange({ imageUrl: e.target.value })}
            />
            <FieldError id={`${urlId}-err`}>{errors[`${p}.imageUrl`]}</FieldError>
          </div>
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              tabIndex={-1}
              aria-label={`Chọn tệp ảnh cho banner ${n}`}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) onUpload(f);
              }}
            />
            <Button
              size="sm"
              variant="outline"
              loading={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? "Đang tải ảnh…" : "Tải ảnh lên"}
            </Button>
          </div>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          path={`${p}.alt`}
          label={`Mô tả ảnh banner ${n} (alt)`}
          maxLength={200}
          value={banner.alt}
          onChange={(v) => onChange({ alt: v })}
          error={errors[`${p}.alt`]}
        />
        <TextField
          path={`${p}.href`}
          label={`Liên kết banner ${n}`}
          hint="Đường dẫn nội bộ, ví dụ /san-pham. Để trống nếu không cần liên kết."
          maxLength={300}
          value={banner.href}
          onChange={(v) => onChange({ href: v })}
          error={errors[`${p}.href`]}
        />
        <TextField
          path={`${p}.title`}
          label={`Tiêu đề banner ${n}`}
          maxLength={100}
          value={banner.title}
          onChange={(v) => onChange({ title: v })}
          error={errors[`${p}.title`]}
        />
        <TextField
          path={`${p}.subtitle`}
          label={`Phụ đề banner ${n}`}
          maxLength={200}
          value={banner.subtitle}
          onChange={(v) => onChange({ subtitle: v })}
          error={errors[`${p}.subtitle`]}
        />
      </div>
      <label className="flex min-h-11 items-center gap-2 text-coffee-900">
        <input
          type="checkbox"
          className="h-5 w-5 accent-moss-700"
          checked={banner.isActive}
          onChange={(e) => onChange({ isActive: e.target.checked })}
        />
        <span>{`Hiển thị banner ${n} trên trang chủ`}</span>
      </label>
    </li>
  );
}
