"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FieldError, Input, Label } from "@/components/ui/Input";
import { FormError } from "@/features/auth/components/FormError";
import { ApiError } from "@/lib/api/errors";
import type { AdminCategory, CategoryInput } from "@/types/admin";
import { createAdminCategory, updateAdminCategory } from "../api/catalog";
import {
  descriptionError,
  imageUrlError,
  nameError,
  slugError,
  slugify,
  sortOrderError,
} from "../catalogValidation";
import { adminErrorMessage, fieldErrorsOf } from "../errors";
import { AdminModal } from "./AdminModal";

const selectClass =
  "h-11 w-full rounded-lg border border-coffee-400 bg-white px-3 text-base text-coffee-900 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-moss-600 disabled:cursor-not-allowed disabled:bg-coffee-50 disabled:opacity-70";

/**
 * Form tạo/sửa danh mục (dialog). `category` có giá trị = sửa.
 * `roots`: các danh mục gốc để chọn làm cha. `defaultParentId`: gợi ý cha khi tạo con.
 */
export function CategoryForm({
  category,
  roots,
  defaultParentId,
  onSaved,
  onClose,
}: {
  category?: AdminCategory;
  roots: AdminCategory[];
  defaultParentId?: string;
  onSaved: (saved: AdminCategory, mode: "create" | "update") => void;
  onClose: () => void;
}) {
  const editing = Boolean(category);
  const hasChildren = (category?.children?.length ?? 0) > 0;
  const [name, setName] = useState(category?.name ?? "");
  const [slug, setSlug] = useState(category?.slug ?? "");
  const [parentId, setParentId] = useState(category?.parentId ?? defaultParentId ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const [imageUrl, setImageUrl] = useState(category?.imageUrl ?? "");
  const [sortOrder, setSortOrder] = useState(String(category?.sortOrder ?? 0));
  const [isActive, setIsActive] = useState(category?.isActive ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const parentOptions = roots.filter((r) => r.id !== category?.id);
  const slugChanged = editing && slug.trim() !== "" && slug.trim() !== category!.slug;

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    const checks: Array<[string, string | undefined]> = [
      ["name", nameError(name)],
      ["slug", slugError(slug)],
      ["description", descriptionError(description)],
      ["imageUrl", imageUrlError(imageUrl)],
      ["sortOrder", sortOrderError(sortOrder)],
    ];
    for (const [k, v] of checks) if (v) e[k] = v;
    return e;
  }

  function buildBody(): CategoryInput {
    const body: CategoryInput = {};
    const n = name.trim();
    const s = slug.trim();
    const d = description.trim();
    const img = imageUrl.trim();
    const order = Number(sortOrder.trim());
    if (!category) {
      body.name = n;
      if (s) body.slug = s;
      if (parentId) body.parentId = parentId;
      if (d) body.description = d;
      if (img) body.imageUrl = img;
      body.sortOrder = order;
      body.isActive = isActive;
      return body;
    }
    if (n !== category.name) body.name = n;
    if (s && s !== category.slug) body.slug = s;
    if ((parentId || null) !== category.parentId) body.parentId = parentId || null;
    if (d !== (category.description ?? "")) body.description = d;
    if ((img || null) !== category.imageUrl) body.imageUrl = img || null;
    if (order !== category.sortOrder) body.sortOrder = order;
    if (isActive !== category.isActive) body.isActive = isActive;
    return body;
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (busyRef.current) return;
    const found = validate();
    setErrors(found);
    setGeneral(null);
    if (Object.keys(found).length > 0) return;

    const body = buildBody();
    if (category && Object.keys(body).length === 0) {
      onClose();
      return;
    }

    busyRef.current = true;
    setBusy(true);
    try {
      const saved = category
        ? await updateAdminCategory(category.id, body)
        : await createAdminCategory(body);
      onSaved(saved, category ? "update" : "create");
    } catch (err) {
      if (err instanceof ApiError && err.code === "SLUG_TAKEN") {
        setErrors({ slug: "Slug này đã được dùng, vui lòng chọn slug khác." });
      } else {
        const fe = fieldErrorsOf(err);
        const shown: Record<string, string> = {};
        for (const k of ["name", "slug", "parentId", "description", "imageUrl", "sortOrder"]) {
          if (fe[k]) shown[k] = fe[k];
        }
        setErrors(shown);
        if (Object.keys(shown).length === 0) {
          setGeneral(
            err instanceof ApiError && err.code === "CONFLICT"
              ? err.message
              : adminErrorMessage(err),
          );
        }
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const err = (k: string) => (errors[k] ? `cf-${k}-err` : undefined);

  return (
    <AdminModal title={editing ? "Sửa danh mục" : "Thêm danh mục"} busy={busy} onClose={onClose}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div>
          <Label htmlFor="cf-name">Tên danh mục</Label>
          <Input
            id="cf-name"
            data-autofocus
            value={name}
            maxLength={100}
            autoComplete="off"
            invalid={Boolean(errors.name)}
            aria-describedby={err("name")}
            onChange={(e) => setName(e.target.value)}
          />
          <FieldError id="cf-name-err">{errors.name}</FieldError>
        </div>

        <div>
          <Label htmlFor="cf-slug">Slug (không bắt buộc)</Label>
          <Input
            id="cf-slug"
            value={slug}
            maxLength={120}
            autoComplete="off"
            placeholder={slugify(name) || "ten-danh-muc"}
            invalid={Boolean(errors.slug)}
            aria-describedby={[err("slug"), "cf-slug-hint"].filter(Boolean).join(" ")}
            onChange={(e) => setSlug(e.target.value)}
          />
          <p id="cf-slug-hint" className="mt-1.5 text-sm text-coffee-700">
            {editing ? "Slug là phần cuối của đường dẫn danh mục." : "Để trống để tự tạo từ tên"}
          </p>
          {slugChanged ? (
            <p className="mt-1.5 rounded-lg border border-coffee-300 bg-cream-100 px-3 py-2 text-sm text-coffee-900">
              Đổi slug sẽ làm hỏng liên kết cũ tới danh mục này
            </p>
          ) : null}
          <FieldError id="cf-slug-err">{errors.slug}</FieldError>
        </div>

        <div>
          <Label htmlFor="cf-parent">Danh mục cha</Label>
          <select
            id="cf-parent"
            className={selectClass}
            value={parentId}
            disabled={hasChildren}
            aria-describedby={
              [err("parentId"), hasChildren ? "cf-parent-hint" : ""].filter(Boolean).join(" ") ||
              undefined
            }
            onChange={(e) => setParentId(e.target.value)}
          >
            <option value="">Không có (danh mục gốc)</option>
            {parentOptions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          {hasChildren ? (
            <p id="cf-parent-hint" className="mt-1.5 text-sm text-coffee-700">
              Danh mục đang có danh mục con nên không thể đặt danh mục cha.
            </p>
          ) : null}
          <FieldError id="cf-parentId-err">{errors.parentId}</FieldError>
        </div>

        <div>
          <Label htmlFor="cf-desc">Mô tả (không bắt buộc)</Label>
          <textarea
            id="cf-desc"
            rows={3}
            value={description}
            maxLength={1000}
            aria-invalid={errors.description ? true : undefined}
            aria-describedby={err("description")}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-lg border border-coffee-400 bg-white px-3 py-2 text-base text-coffee-900 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-moss-600"
          />
          <FieldError id="cf-description-err">{errors.description}</FieldError>
        </div>

        <div>
          <Label htmlFor="cf-img">URL ảnh (không bắt buộc)</Label>
          <Input
            id="cf-img"
            type="url"
            value={imageUrl}
            maxLength={500}
            autoComplete="off"
            placeholder="https://… hoặc /uploads/…"
            invalid={Boolean(errors.imageUrl)}
            aria-describedby={err("imageUrl")}
            onChange={(e) => setImageUrl(e.target.value)}
          />
          <FieldError id="cf-imageUrl-err">{errors.imageUrl}</FieldError>
        </div>

        <div>
          <Label htmlFor="cf-order">Thứ tự hiển thị</Label>
          <Input
            id="cf-order"
            type="number"
            min={0}
            max={9999}
            step={1}
            value={sortOrder}
            invalid={Boolean(errors.sortOrder)}
            aria-describedby={err("sortOrder")}
            onChange={(e) => setSortOrder(e.target.value)}
          />
          <FieldError id="cf-sortOrder-err">{errors.sortOrder}</FieldError>
        </div>

        <label className="flex min-h-11 items-center gap-3 text-base text-coffee-900">
          <input
            type="checkbox"
            className="h-5 w-5 accent-moss-700"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          Hiển thị trên cửa hàng
        </label>

        <FormError>{general}</FormError>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Đóng
          </Button>
          <Button type="submit" loading={busy}>
            {editing ? "Lưu thay đổi" : "Tạo danh mục"}
          </Button>
        </div>
      </form>
    </AdminModal>
  );
}
