"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FieldError, Input, Label } from "@/components/ui/Input";
import { FormError } from "@/features/auth/components/FormError";
import {
  BREW_LABELS,
  BREW_VALUES,
  PROCESS_LABELS,
  PROCESS_VALUES,
  ROAST_LABELS,
  ROAST_VALUES,
} from "@/features/catalog/labels";
import { ApiError } from "@/lib/api/errors";
import type {
  AdminBrand,
  AdminCategory,
  AdminProduct,
  AdminProductStatus,
  CoffeeInput,
  ProductInput,
} from "@/types/admin";
import type { BrewMethod, CoffeeProcess, RoastLevel } from "@/types/catalog";
import { createAdminProduct, updateAdminProduct } from "../api/products";
import { slugError, slugify } from "../catalogValidation";
import { adminErrorMessage, fieldErrorsOf } from "../errors";
import { PRODUCT_STATUS_LABEL } from "../labels";
import {
  altitudeError,
  maxLenError,
  parseList,
  parseTags,
  productNameError,
  tagsError,
  tastingNotesError,
} from "../productValidation";
import { ALL_PRODUCT_STATUSES } from "../productFilters";
import { categoryOptions } from "./categoryOptions";

const selectClass =
  "h-11 w-full rounded-lg border border-coffee-400 bg-white px-3 text-base text-coffee-900 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-moss-600 disabled:cursor-not-allowed disabled:bg-coffee-50 disabled:opacity-70";
const textareaClass =
  "w-full rounded-lg border bg-white px-3 py-2 text-base text-coffee-900 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-moss-600 disabled:cursor-not-allowed disabled:bg-coffee-50 disabled:opacity-70";
const hint = "mt-1.5 text-sm text-coffee-700";

interface FormState {
  name: string;
  slug: string;
  categoryId: string;
  brandId: string;
  shortDesc: string;
  description: string;
  status: AdminProductStatus;
  isFeatured: boolean;
  tags: string;
  seoTitle: string;
  seoDesc: string;
  coffeeOn: boolean;
  originCountry: string;
  originRegion: string;
  variety: string;
  process: CoffeeProcess | "";
  roastLevel: RoastLevel | "";
  altitude: string;
  tasting: string;
  brew: BrewMethod[];
}

function initState(p?: AdminProduct): FormState {
  const c = p?.coffee;
  return {
    name: p?.name ?? "",
    slug: p?.slug ?? "",
    categoryId: p?.categoryId ?? "",
    brandId: p?.brandId ?? "",
    shortDesc: p?.shortDesc ?? "",
    description: p?.description ?? "",
    status: p?.status ?? "DRAFT",
    isFeatured: p?.isFeatured ?? false,
    tags: (p?.tags ?? []).join(", "),
    seoTitle: p?.seoTitle ?? "",
    seoDesc: p?.seoDesc ?? "",
    coffeeOn: Boolean(c),
    originCountry: c?.originCountry ?? "",
    originRegion: c?.originRegion ?? "",
    variety: c?.variety ?? "",
    process: c?.process ?? "",
    roastLevel: c?.roastLevel ?? "",
    altitude: c?.altitude != null ? String(c.altitude) : "",
    tasting: (c?.tastingNotes ?? []).join(", "),
    brew: c?.brewMethods ?? [],
  };
}

function coffeeFromState(s: FormState): CoffeeInput {
  // Backend merge theo trường: trường trống phải gửi null tường minh để xóa giá trị cũ.
  return {
    originCountry: s.originCountry.trim() || null,
    originRegion: s.originRegion.trim() || null,
    variety: s.variety.trim() || null,
    process: s.process || null,
    roastLevel: s.roastLevel || null,
    altitude: s.altitude.trim() ? Number(s.altitude.trim()) : null,
    tastingNotes: parseList(s.tasting),
    brewMethods: BREW_VALUES.filter((b) => s.brew.includes(b)),
  };
}

/** Dạng so sánh ổn định (thứ tự key cố định) của hồ sơ cà phê. */
function coffeeKey(c: CoffeeInput): string {
  return JSON.stringify([
    c.originCountry ?? null,
    c.originRegion ?? null,
    c.variety ?? null,
    c.process ?? null,
    c.roastLevel ?? null,
    c.altitude ?? null,
    c.tastingNotes,
    BREW_VALUES.filter((b) => c.brewMethods.includes(b)),
  ]);
}

function coffeeOfProduct(p: AdminProduct): CoffeeInput | null {
  const c = p.coffee;
  if (!c) return null;
  const out: CoffeeInput = { tastingNotes: c.tastingNotes, brewMethods: c.brewMethods };
  if (c.originCountry) out.originCountry = c.originCountry;
  if (c.originRegion) out.originRegion = c.originRegion;
  if (c.variety) out.variety = c.variety;
  if (c.process) out.process = c.process;
  if (c.roastLevel) out.roastLevel = c.roastLevel;
  if (c.altitude != null) out.altitude = c.altitude;
  return out;
}

const sameList = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

/** Body tạo: đủ trường chính. Body sửa: chỉ trường khác `product`. */
function buildProductBody(s: FormState, product?: AdminProduct): ProductInput {
  const name = s.name.trim();
  const slug = s.slug.trim();
  const tags = parseTags(s.tags);
  if (!product) {
    const body: ProductInput = {
      name,
      categoryId: s.categoryId,
      status: "DRAFT",
      isFeatured: s.isFeatured,
      tags,
    };
    if (slug) body.slug = slug;
    if (s.brandId) body.brandId = s.brandId;
    if (s.shortDesc.trim()) body.shortDesc = s.shortDesc.trim();
    if (s.description.trim()) body.description = s.description.trim();
    if (s.seoTitle.trim()) body.seoTitle = s.seoTitle.trim();
    if (s.seoDesc.trim()) body.seoDesc = s.seoDesc.trim();
    if (s.coffeeOn) body.coffee = coffeeFromState(s);
    return body;
  }
  const body: ProductInput = {};
  if (name !== product.name) body.name = name;
  if (slug && slug !== product.slug) body.slug = slug;
  if (s.categoryId !== product.categoryId) body.categoryId = s.categoryId;
  if ((s.brandId || null) !== product.brandId) body.brandId = s.brandId || null;
  if (s.shortDesc.trim() !== (product.shortDesc ?? "")) body.shortDesc = s.shortDesc.trim();
  if (s.description.trim() !== (product.description ?? "")) body.description = s.description.trim();
  if (s.status !== product.status) body.status = s.status;
  if (s.isFeatured !== product.isFeatured) body.isFeatured = s.isFeatured;
  if (!sameList(tags, product.tags)) body.tags = tags;
  if ((s.seoTitle.trim() || null) !== product.seoTitle) body.seoTitle = s.seoTitle.trim() || null;
  if ((s.seoDesc.trim() || null) !== product.seoDesc) body.seoDesc = s.seoDesc.trim() || null;
  const oldCoffee = coffeeOfProduct(product);
  if (!s.coffeeOn) {
    if (oldCoffee) body.coffee = null;
  } else {
    const next = coffeeFromState(s);
    if (!oldCoffee || coffeeKey(next) !== coffeeKey(oldCoffee)) body.coffee = next;
  }
  return body;
}

function validate(s: FormState): Record<string, string> {
  const e: Record<string, string> = {};
  const checks: Array<[string, string | undefined]> = [
    ["name", productNameError(s.name)],
    ["slug", slugError(s.slug)],
    ["categoryId", s.categoryId ? undefined : "Vui lòng chọn danh mục."],
    ["shortDesc", maxLenError(s.shortDesc, 300, "Mô tả ngắn")],
    ["description", maxLenError(s.description, 20000, "Mô tả")],
    ["tags", tagsError(parseTags(s.tags))],
    ["seoTitle", maxLenError(s.seoTitle, 120, "Tiêu đề SEO")],
    ["seoDesc", maxLenError(s.seoDesc, 300, "Mô tả SEO")],
  ];
  if (s.coffeeOn) {
    checks.push(
      ["originCountry", maxLenError(s.originCountry, 60, "Xuất xứ")],
      ["originRegion", maxLenError(s.originRegion, 60, "Vùng")],
      ["variety", maxLenError(s.variety, 60, "Giống")],
      ["altitude", altitudeError(s.altitude)],
      ["tasting", tastingNotesError(parseList(s.tasting))],
    );
  }
  for (const [k, v] of checks) if (v) e[k] = v;
  return e;
}

const SERVER_KEYS = [
  "name",
  "slug",
  "categoryId",
  "brandId",
  "shortDesc",
  "description",
  "status",
  "tags",
  "seoTitle",
  "seoDesc",
];

function Field({
  id,
  label,
  error,
  hintText,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hintText?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hintText ? (
        <p id={`${id}-hint`} className={hint}>
          {hintText}
        </p>
      ) : null}
      <FieldError id={`${id}-err`}>{error}</FieldError>
    </div>
  );
}

const describedBy = (id: string, error?: string, hasHint?: boolean) =>
  [error ? `${id}-err` : null, hasHint ? `${id}-hint` : null].filter(Boolean).join(" ") ||
  undefined;

/** Form thông tin chung + hồ sơ cà phê. `product` có giá trị = sửa. */
export function ProductForm({
  product,
  readOnly,
  categories,
  brands,
  onSaved,
}: {
  product?: AdminProduct;
  readOnly?: boolean;
  categories: AdminCategory[];
  brands: AdminBrand[];
  onSaved: (saved: AdminProduct, mode: "create" | "update") => void;
}) {
  const editing = Boolean(product);
  const [s, setS] = useState<FormState>(() => initState(product));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const catOptions = useMemo(() => categoryOptions(categories), [categories]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setS((cur) => ({ ...cur, [k]: v }));
  const slugChanged = editing && s.slug.trim() !== "" && s.slug.trim() !== product!.slug;
  const hasActiveVariant = (product?.variants ?? []).some((v) => v.isActive);

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (busyRef.current || readOnly) return;
    const found = validate(s);
    setErrors(found);
    setGeneral(null);
    setNotice("");
    if (Object.keys(found).length > 0) return;

    const body = buildProductBody(s, product);
    if (product && Object.keys(body).length === 0) {
      setNotice("Chưa có thay đổi nào để lưu.");
      return;
    }

    busyRef.current = true;
    setBusy(true);
    try {
      const saved = product
        ? await updateAdminProduct(product.id, body)
        : await createAdminProduct(body);
      if (product) setNotice("Đã lưu thay đổi.");
      onSaved(saved, product ? "update" : "create");
    } catch (err) {
      if (err instanceof ApiError && err.code === "SLUG_TAKEN") {
        setErrors({ slug: "Slug này đã được dùng, vui lòng chọn slug khác." });
      } else if (err instanceof ApiError && err.code === "CONFLICT") {
        setGeneral(err.message);
      } else {
        const fe = fieldErrorsOf(err);
        const shown: Record<string, string> = {};
        for (const k of SERVER_KEYS) if (fe[k]) shown[k] = fe[k];
        const coffeeMsg = Object.entries(fe).find(([k]) => k.startsWith("coffee"))?.[1];
        if (coffeeMsg) shown.coffee = coffeeMsg;
        setErrors(shown);
        if (Object.keys(shown).length === 0) setGeneral(adminErrorMessage(err));
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function toggleBrew(b: BrewMethod) {
    set("brew", s.brew.includes(b) ? s.brew.filter((x) => x !== b) : [...s.brew, b]);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6" aria-label="Thông tin sản phẩm">
      <fieldset disabled={readOnly || busy} className="min-w-0 space-y-6">
        <section className="space-y-4 rounded-2xl border border-coffee-200 bg-white p-4 sm:p-5">
          <h2 className="font-serif text-lg font-bold text-coffee-900">Thông tin chung</h2>

          <Field id="pf-name" label="Tên sản phẩm" error={errors.name}>
            <Input
              id="pf-name"
              value={s.name}
              maxLength={200}
              autoComplete="off"
              invalid={Boolean(errors.name)}
              aria-describedby={describedBy("pf-name", errors.name)}
              onChange={(e) => set("name", e.target.value)}
            />
          </Field>

          <Field
            id="pf-slug"
            label="Slug (không bắt buộc)"
            error={errors.slug}
            hintText={
              editing
                ? "Slug là phần cuối của đường dẫn sản phẩm trên cửa hàng."
                : "Để trống để tự tạo từ tên"
            }
          >
            <Input
              id="pf-slug"
              value={s.slug}
              maxLength={120}
              autoComplete="off"
              placeholder={slugify(s.name) || "ten-san-pham"}
              invalid={Boolean(errors.slug)}
              aria-describedby={describedBy("pf-slug", errors.slug, true)}
              onChange={(e) => set("slug", e.target.value)}
            />
            {slugChanged ? (
              <p className="mt-1.5 rounded-lg border border-coffee-300 bg-cream-100 px-3 py-2 text-sm text-coffee-900">
                Đổi slug sẽ làm hỏng liên kết cũ tới sản phẩm này
              </p>
            ) : null}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="pf-category" label="Danh mục" error={errors.categoryId}>
              <select
                id="pf-category"
                className={selectClass}
                value={s.categoryId}
                aria-invalid={errors.categoryId ? true : undefined}
                aria-describedby={describedBy("pf-category", errors.categoryId)}
                onChange={(e) => set("categoryId", e.target.value)}
              >
                <option value="">— Chọn danh mục —</option>
                {catOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="pf-brand" label="Thương hiệu (không bắt buộc)" error={errors.brandId}>
              <select
                id="pf-brand"
                className={selectClass}
                value={s.brandId}
                aria-describedby={describedBy("pf-brand", errors.brandId)}
                onChange={(e) => set("brandId", e.target.value)}
              >
                <option value="">Không có thương hiệu</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field
            id="pf-short"
            label="Mô tả ngắn"
            error={errors.shortDesc}
            hintText={`${s.shortDesc.trim().length}/300 ký tự`}
          >
            <textarea
              id="pf-short"
              rows={2}
              value={s.shortDesc}
              className={`${textareaClass} ${errors.shortDesc ? "border-danger-600" : "border-coffee-400"}`}
              aria-invalid={errors.shortDesc ? true : undefined}
              aria-describedby={describedBy("pf-short", errors.shortDesc, true)}
              onChange={(e) => set("shortDesc", e.target.value)}
            />
          </Field>

          <Field
            id="pf-desc"
            label="Mô tả chi tiết (Markdown)"
            error={errors.description}
            hintText="Hỗ trợ: tiêu đề bằng #, gạch đầu dòng bằng -, chữ **đậm**. Không hỗ trợ HTML."
          >
            <textarea
              id="pf-desc"
              rows={8}
              value={s.description}
              className={`${textareaClass} ${errors.description ? "border-danger-600" : "border-coffee-400"}`}
              aria-invalid={errors.description ? true : undefined}
              aria-describedby={describedBy("pf-desc", errors.description, true)}
              onChange={(e) => set("description", e.target.value)}
            />
          </Field>

          <Field
            id="pf-tags"
            label="Thẻ (tags)"
            error={errors.tags}
            hintText="Phân tách bằng dấu phẩy, tối đa 20 thẻ, mỗi thẻ tối đa 30 ký tự. Tự chuyển chữ thường và bỏ thẻ trùng."
          >
            <Input
              id="pf-tags"
              value={s.tags}
              autoComplete="off"
              invalid={Boolean(errors.tags)}
              aria-describedby={describedBy("pf-tags", errors.tags, true)}
              onChange={(e) => set("tags", e.target.value)}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="pf-seot" label="Tiêu đề SEO (không bắt buộc)" error={errors.seoTitle}>
              <Input
                id="pf-seot"
                value={s.seoTitle}
                autoComplete="off"
                invalid={Boolean(errors.seoTitle)}
                aria-describedby={describedBy("pf-seot", errors.seoTitle)}
                onChange={(e) => set("seoTitle", e.target.value)}
              />
            </Field>
            <Field id="pf-seod" label="Mô tả SEO (không bắt buộc)" error={errors.seoDesc}>
              <Input
                id="pf-seod"
                value={s.seoDesc}
                autoComplete="off"
                invalid={Boolean(errors.seoDesc)}
                aria-describedby={describedBy("pf-seod", errors.seoDesc)}
                onChange={(e) => set("seoDesc", e.target.value)}
              />
            </Field>
          </div>

          <label className="flex min-h-11 items-center gap-2 text-base text-coffee-900">
            <input
              type="checkbox"
              className="h-5 w-5 accent-moss-700"
              checked={s.isFeatured}
              onChange={(e) => set("isFeatured", e.target.checked)}
            />
            Sản phẩm nổi bật
          </label>

          {editing ? (
            <div>
              <Label htmlFor="pf-status">Trạng thái</Label>
              <select
                id="pf-status"
                className={selectClass}
                value={s.status}
                aria-invalid={errors.status ? true : undefined}
                aria-describedby={describedBy("pf-status", errors.status, true)}
                onChange={(e) => set("status", e.target.value as AdminProductStatus)}
              >
                {ALL_PRODUCT_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {PRODUCT_STATUS_LABEL[st]}
                  </option>
                ))}
              </select>
              <p id="pf-status-hint" className={hint}>
                {hasActiveVariant
                  ? "Chỉ sản phẩm Đang bán mới hiển thị trên cửa hàng."
                  : "Cần ít nhất 1 biến thể đang bán để chuyển sang Đang bán."}
              </p>
              <FieldError id="pf-status-err">{errors.status}</FieldError>
            </div>
          ) : (
            <div>
              <p className="text-sm font-medium text-coffee-900">Trạng thái</p>
              <p className="text-base text-coffee-900">{PRODUCT_STATUS_LABEL.DRAFT}</p>
              <p className={hint}>Thêm biến thể trước khi chuyển sang Đang bán</p>
            </div>
          )}
        </section>

        <section className="space-y-4 rounded-2xl border border-coffee-200 bg-white p-4 sm:p-5">
          <h2 className="font-serif text-lg font-bold text-coffee-900">Hồ sơ cà phê</h2>
          <label className="flex min-h-11 items-center gap-2 text-base text-coffee-900">
            <input
              type="checkbox"
              className="h-5 w-5 accent-moss-700"
              checked={s.coffeeOn}
              onChange={(e) => set("coffeeOn", e.target.checked)}
            />
            Sản phẩm này có hồ sơ cà phê (cà phê hạt)
          </label>
          {!s.coffeeOn && product?.coffee ? (
            <p className={hint}>Hồ sơ cà phê hiện có sẽ bị xóa khi bạn lưu.</p>
          ) : null}

          {s.coffeeOn ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field id="pf-origin" label="Quốc gia xuất xứ" error={errors.originCountry}>
                  <Input
                    id="pf-origin"
                    value={s.originCountry}
                    autoComplete="off"
                    invalid={Boolean(errors.originCountry)}
                    aria-describedby={describedBy("pf-origin", errors.originCountry)}
                    onChange={(e) => set("originCountry", e.target.value)}
                  />
                </Field>
                <Field id="pf-region" label="Vùng" error={errors.originRegion}>
                  <Input
                    id="pf-region"
                    value={s.originRegion}
                    autoComplete="off"
                    invalid={Boolean(errors.originRegion)}
                    aria-describedby={describedBy("pf-region", errors.originRegion)}
                    onChange={(e) => set("originRegion", e.target.value)}
                  />
                </Field>
                <Field id="pf-variety" label="Giống" error={errors.variety}>
                  <Input
                    id="pf-variety"
                    value={s.variety}
                    autoComplete="off"
                    invalid={Boolean(errors.variety)}
                    aria-describedby={describedBy("pf-variety", errors.variety)}
                    onChange={(e) => set("variety", e.target.value)}
                  />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="pf-process">Sơ chế</Label>
                  <select
                    id="pf-process"
                    className={selectClass}
                    value={s.process}
                    onChange={(e) => set("process", e.target.value as CoffeeProcess | "")}
                  >
                    <option value="">Chưa chọn</option>
                    {PROCESS_VALUES.map((v) => (
                      <option key={v} value={v}>
                        {PROCESS_LABELS[v]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="pf-roast">Mức rang</Label>
                  <select
                    id="pf-roast"
                    className={selectClass}
                    value={s.roastLevel}
                    onChange={(e) => set("roastLevel", e.target.value as RoastLevel | "")}
                  >
                    <option value="">Chưa chọn</option>
                    {ROAST_VALUES.map((v) => (
                      <option key={v} value={v}>
                        {ROAST_LABELS[v]}
                      </option>
                    ))}
                  </select>
                </div>
                <Field id="pf-alt" label="Độ cao (m)" error={errors.altitude}>
                  <Input
                    id="pf-alt"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={3000}
                    value={s.altitude}
                    invalid={Boolean(errors.altitude)}
                    aria-describedby={describedBy("pf-alt", errors.altitude)}
                    onChange={(e) => set("altitude", e.target.value)}
                  />
                </Field>
              </div>
              <Field
                id="pf-tasting"
                label="Hương vị (tasting notes)"
                error={errors.tasting}
                hintText="Phân tách bằng dấu phẩy, tối đa 10 hương vị, mỗi hương vị tối đa 40 ký tự."
              >
                <Input
                  id="pf-tasting"
                  value={s.tasting}
                  autoComplete="off"
                  invalid={Boolean(errors.tasting)}
                  aria-describedby={describedBy("pf-tasting", errors.tasting, true)}
                  onChange={(e) => set("tasting", e.target.value)}
                />
              </Field>
              <fieldset>
                <legend className="mb-1.5 text-sm font-medium text-coffee-900">
                  Cách pha phù hợp
                </legend>
                <div className="flex flex-wrap gap-2">
                  {BREW_VALUES.map((b) => (
                    <label
                      key={b}
                      className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border border-coffee-300 bg-white px-4 text-sm font-medium text-coffee-800"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-moss-700"
                        checked={s.brew.includes(b)}
                        onChange={() => toggleBrew(b)}
                      />
                      {BREW_LABELS[b]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <FieldError id="pf-coffee-err">{errors.coffee}</FieldError>
            </div>
          ) : null}
        </section>
      </fieldset>

      <FormError>{general}</FormError>
      <p role="status" aria-live="polite" className="min-h-5 text-sm font-medium text-moss-800">
        {notice}
      </p>

      {readOnly ? null : (
        <div className="flex justify-end">
          <Button type="submit" loading={busy}>
            {editing ? "Lưu thay đổi" : "Tạo sản phẩm"}
          </Button>
        </div>
      )}
    </form>
  );
}
