"use client";

import Link from "next/link";
import { useCallback, useId, useRef, useState } from "react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { FieldError, Input, Label } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/features/auth/AuthProvider";
import { FormError, FormNotice } from "@/features/auth/components/FormError";
import { getProvinces } from "@/features/locations/api";
import { useResource } from "@/features/orders/useResource";
import { ApiError } from "@/lib/api/errors";
import type { AdminSettings as AdminSettingsData } from "@/types/settings";
import { getAdminSettings, updateAdminSettings, type AdminSettingsResult } from "../api/settings";
import { uploadAdminImage } from "../api/products";
import { adminErrorMessage, fieldErrorsOf } from "../errors";
import { formatVnDateTime } from "../format";
import {
  AREA_FIELD_PATHS,
  CONTACT_FIELD_PATHS,
  MAX_BANNERS,
  SECTION_KEYS,
  SHIPPING_FIELD_PATHS,
  areaDraft,
  bannerFieldPaths,
  bannersDraft,
  buildAreaPatch,
  buildBannersPatch,
  buildContactPatch,
  buildShippingPatch,
  contactDraft,
  emptyBanner,
  latestUpdatedAt,
  mapServerFieldErrors,
  shippingDraft,
  validateArea,
  validateBanners,
  validateContact,
  validateShipping,
  type AreaDraft,
  type BannerDraft,
  type ContactDraft,
  type FieldErrors,
  type ShippingDraft,
} from "../settingsForm";
import { ProductImage } from "@/features/catalog/components/ProductImage";

const loadSettings = () => getAdminSettings();
const loadProvinces = () => getProvinces();

const textareaClass =
  "w-full rounded-lg border bg-white px-3 py-2 text-base text-coffee-900 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-moss-600";

// ---------- Lưu theo section ----------

interface SaveState {
  busy: boolean;
  notice: string | null;
  general: string[];
  errors: FieldErrors;
}
const IDLE: SaveState = { busy: false, notice: null, general: [], errors: {} };

interface SaveOptions<D> {
  validate: (d: D) => FieldErrors;
  build: (d: D) => Partial<AdminSettingsData>;
  paths: (d: D) => readonly string[];
  onSaved: (r: AdminSettingsResult) => void;
}

/** Validate -> PUT chỉ key của section -> map lỗi 400 về ô nhập. */
function useSectionSave<D>(opts: SaveOptions<D>) {
  const [state, setState] = useState<SaveState>(IDLE);
  const busyRef = useRef(false);
  async function save(draft: D) {
    if (busyRef.current) return;
    const o = opts;
    const found = o.validate(draft);
    if (Object.keys(found).length > 0) {
      setState({ busy: false, notice: null, general: [], errors: found });
      return;
    }
    busyRef.current = true;
    setState({ busy: true, notice: null, general: [], errors: {} });
    try {
      const result = await updateAdminSettings(o.build(draft));
      setState({ busy: false, notice: "Đã lưu cài đặt.", general: [], errors: {} });
      o.onSaved(result);
    } catch (e) {
      let errors: FieldErrors = {};
      let general: string[] = [];
      const fe = fieldErrorsOf(e);
      if (Object.keys(fe).length > 0) {
        const mapped = mapServerFieldErrors(fe, o.paths(draft));
        errors = mapped.fields;
        general = mapped.general;
        if (Object.keys(errors).length === 0 && general.length === 0) {
          general = [adminErrorMessage(e)];
        }
      } else {
        general = [adminErrorMessage(e)];
      }
      setState({ busy: false, notice: null, general, errors });
    } finally {
      busyRef.current = false;
    }
  }

  const touch = useCallback(() => setState((s) => (s.notice ? { ...s, notice: null } : s)), []);
  const clearErrors = useCallback(() => setState((s) => ({ ...s, errors: {}, general: [] })), []);
  return { state, save, touch, clearErrors };
}

// ---------- Thành phần dùng chung ----------

const domId = (path: string) => `st-${path.replace(/[^a-zA-Z0-9]+/g, "-")}`;

function NumberField({
  path,
  label,
  value,
  onChange,
  error,
  hint,
  suffix,
}: {
  path: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  suffix?: string;
}) {
  const id = domId(path);
  const describedBy =
    [error ? `${id}-err` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          value={value}
          invalid={Boolean(error)}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
        />
        {suffix ? <span className="shrink-0 text-sm text-coffee-700">{suffix}</span> : null}
      </div>
      {hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-coffee-700">
          {hint}
        </p>
      ) : null}
      <FieldError id={`${id}-err`}>{error}</FieldError>
    </div>
  );
}

function TextField({
  path,
  label,
  value,
  onChange,
  error,
  hint,
  type = "text",
  maxLength,
  autoComplete,
}: {
  path: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  type?: string;
  maxLength?: number;
  autoComplete?: string;
}) {
  const id = domId(path);
  const describedBy =
    [error ? `${id}-err` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        maxLength={maxLength}
        autoComplete={autoComplete ?? "off"}
        invalid={Boolean(error)}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-coffee-700">
          {hint}
        </p>
      ) : null}
      <FieldError id={`${id}-err`}>{error}</FieldError>
    </div>
  );
}

function SectionCard({
  title,
  description,
  updatedAt,
  state,
  onSubmit,
  disabled,
  children,
}: {
  title: string;
  description?: string;
  updatedAt: string | null;
  state: SaveState;
  onSubmit: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const hid = useId();
  return (
    <form
      noValidate
      aria-labelledby={hid}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="space-y-4 rounded-2xl border border-coffee-200 bg-white p-4 sm:p-5"
    >
      <header className="space-y-1">
        <h2 id={hid} className="font-serif text-xl font-bold text-coffee-900">
          {title}
        </h2>
        {description ? <p className="text-sm text-coffee-700">{description}</p> : null}
        <p className="text-xs text-coffee-700">
          {updatedAt
            ? `Cập nhật lần cuối: ${formatVnDateTime(updatedAt)}`
            : "Chưa chỉnh sửa (đang dùng giá trị mặc định)"}
        </p>
      </header>
      {children}
      {state.general.length > 0 ? (
        <FormError>
          {state.general.map((g) => (
            <p key={g}>{g}</p>
          ))}
        </FormError>
      ) : null}
      <FormNotice>{state.notice}</FormNotice>
      <div className="flex justify-end">
        <Button
          type="submit"
          aria-label={`Lưu ${title.toLowerCase()}`}
          loading={state.busy}
          disabled={disabled}
        >
          {state.busy ? "Đang lưu…" : "Lưu"}
        </Button>
      </div>
    </form>
  );
}

// ---------- Phí vận chuyển ----------

function ShippingSection({
  result,
  onSaved,
}: {
  result: AdminSettingsResult;
  onSaved: (r: AdminSettingsResult) => void;
}) {
  const [d, setD] = useState<ShippingDraft>(() => shippingDraft(result.data));
  const { state, save, touch } = useSectionSave<ShippingDraft>({
    validate: validateShipping,
    build: buildShippingPatch,
    paths: () => SHIPPING_FIELD_PATHS,
    onSaved: (r) => {
      setD(shippingDraft(r.data));
      onSaved(r);
    },
  });
  const set = (k: keyof ShippingDraft) => (v: string) => {
    touch();
    setD((x) => ({ ...x, [k]: v }));
  };
  const e = state.errors;
  return (
    <SectionCard
      title="Phí vận chuyển"
      description="Phí theo khu vực và phương thức, ngưỡng miễn phí, phụ phí khối lượng và thời hạn thanh toán online. Đơn vị tiền: VND."
      updatedAt={latestUpdatedAt(SECTION_KEYS.shipping, result.meta.updatedAt)}
      state={state}
      onSubmit={() => void save(d)}
    >
      <fieldset className="space-y-3">
        <legend className="mb-1 text-sm font-semibold text-coffee-900">Phí theo khu vực</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberField
            path="shipping.rates.inner.STANDARD"
            label="Nội thành - Tiêu chuẩn"
            suffix="₫"
            value={d.innerStandard}
            onChange={set("innerStandard")}
            error={e["shipping.rates.inner.STANDARD"]}
          />
          <NumberField
            path="shipping.rates.inner.EXPRESS"
            label="Nội thành - Nhanh"
            suffix="₫"
            value={d.innerExpress}
            onChange={set("innerExpress")}
            error={e["shipping.rates.inner.EXPRESS"]}
          />
          <NumberField
            path="shipping.rates.other.STANDARD"
            label="Tỉnh/thành khác - Tiêu chuẩn"
            suffix="₫"
            value={d.otherStandard}
            onChange={set("otherStandard")}
            error={e["shipping.rates.other.STANDARD"]}
          />
          <NumberField
            path="shipping.rates.other.EXPRESS"
            label="Tỉnh/thành khác - Nhanh"
            suffix="₫"
            value={d.otherExpress}
            onChange={set("otherExpress")}
            error={e["shipping.rates.other.EXPRESS"]}
          />
        </div>
      </fieldset>
      <NumberField
        path="shipping.freeShippingThreshold"
        label="Ngưỡng miễn phí vận chuyển Tiêu chuẩn"
        suffix="₫"
        hint="Đặt 0 để miễn phí vận chuyển Tiêu chuẩn cho mọi đơn."
        value={d.threshold}
        onChange={set("threshold")}
        error={e["shipping.freeShippingThreshold"]}
      />
      <fieldset className="space-y-3">
        <legend className="mb-1 text-sm font-semibold text-coffee-900">Phụ phí khối lượng</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <NumberField
            path="shipping.weightSurcharge.freeGram"
            label="Miễn phụ phí đến"
            suffix="g"
            value={d.freeGram}
            onChange={set("freeGram")}
            error={e["shipping.weightSurcharge.freeGram"]}
          />
          <NumberField
            path="shipping.weightSurcharge.stepGram"
            label="Mỗi bước vượt"
            suffix="g"
            value={d.stepGram}
            onChange={set("stepGram")}
            error={e["shipping.weightSurcharge.stepGram"]}
          />
          <NumberField
            path="shipping.weightSurcharge.feePerStep"
            label="Phụ phí mỗi bước"
            suffix="₫"
            hint="Đặt 0 để không thu phụ phí."
            value={d.feePerStep}
            onChange={set("feePerStep")}
            error={e["shipping.weightSurcharge.feePerStep"]}
          />
        </div>
      </fieldset>
      <NumberField
        path="order.paymentExpiryMinutes"
        label="Thời hạn thanh toán online"
        suffix="phút"
        hint="Từ 5 đến 120 phút. Quá hạn, đơn chờ thanh toán sẽ tự hủy."
        value={d.expiry}
        onChange={set("expiry")}
        error={e["order.paymentExpiryMinutes"]}
      />
    </SectionCard>
  );
}

// ---------- Khu vực nội thành ----------

function AreaSection({
  result,
  onSaved,
}: {
  result: AdminSettingsResult;
  onSaved: (r: AdminSettingsResult) => void;
}) {
  const provinces = useResource("provinces", loadProvinces);
  const [d, setD] = useState<AreaDraft>(() => areaDraft(result.data));
  const { state, save, touch } = useSectionSave<AreaDraft>({
    validate: validateArea,
    build: buildAreaPatch,
    paths: () => AREA_FIELD_PATHS,
    onSaved: (r) => {
      setD(areaDraft(r.data));
      onSaved(r);
    },
  });
  const e = state.errors;
  const provErr = e["shipping.innerCityProvinceCodes"];
  const wardErr = e["shipping.innerCityWardCodes"];
  const wardId = domId("shipping.innerCityWardCodes");

  function toggle(code: string) {
    touch();
    setD((x) => ({
      ...x,
      provinces: x.provinces.includes(code)
        ? x.provinces.filter((c) => c !== code)
        : [...x.provinces, code],
    }));
  }

  let list: React.ReactNode;
  if (provinces.status === "error") {
    list = (
      <div role="alert" className="space-y-2 text-sm text-danger-600">
        <p>Không tải được danh sách tỉnh/thành.</p>
        <Button size="sm" variant="outline" onClick={provinces.retry}>
          Thử lại
        </Button>
      </div>
    );
  } else if (provinces.status !== "ready") {
    list = <Skeleton className="h-24 w-full" />;
  } else {
    list = (
      <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
        {provinces.data!.map((p) => {
          const id = `st-prov-${p.code}`;
          return (
            <li key={p.code}>
              <label htmlFor={id} className="flex min-h-11 items-center gap-2 text-coffee-900">
                <input
                  id={id}
                  type="checkbox"
                  className="h-5 w-5 accent-moss-700"
                  checked={d.provinces.includes(p.code)}
                  onChange={() => toggle(p.code)}
                />
                <span>{p.name}</span>
              </label>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <SectionCard
      title="Khu vực nội thành"
      description="Tỉnh/thành áp dụng phí nội thành. Có thể bỏ trống tất cả."
      updatedAt={latestUpdatedAt(SECTION_KEYS.area, result.meta.updatedAt)}
      state={state}
      disabled={provinces.status !== "ready"}
      onSubmit={() => void save(d)}
    >
      <fieldset className="space-y-2" aria-describedby={provErr ? "st-prov-err" : undefined}>
        <legend className="mb-1 text-sm font-semibold text-coffee-900">Tỉnh/thành nội thành</legend>
        {list}
        <FieldError id="st-prov-err">{provErr}</FieldError>
      </fieldset>
      <div>
        <Label htmlFor={wardId}>Mã phường/xã nội thành bổ sung</Label>
        <textarea
          id={wardId}
          rows={4}
          value={d.wards}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={wardErr ? true : undefined}
          aria-describedby={`${wardId}-hint${wardErr ? ` ${wardId}-err` : ""}`}
          onChange={(ev) => {
            touch();
            setD((x) => ({ ...x, wards: ev.target.value }));
          }}
          className={`${textareaClass} font-mono text-sm ${wardErr ? "border-danger-600" : "border-coffee-400"}`}
        />
        <p id={`${wardId}-hint`} className="mt-1 text-xs text-coffee-700">
          Mỗi mã gồm 5 chữ số, cách nhau bằng dấu phẩy hoặc xuống dòng (tối đa 500 mã).
        </p>
        <FieldError id={`${wardId}-err`}>{wardErr}</FieldError>
      </div>
    </SectionCard>
  );
}

// ---------- Thông tin liên hệ ----------

function ContactSection({
  result,
  onSaved,
}: {
  result: AdminSettingsResult;
  onSaved: (r: AdminSettingsResult) => void;
}) {
  const [d, setD] = useState<ContactDraft>(() => contactDraft(result.data));
  const { state, save, touch } = useSectionSave<ContactDraft>({
    validate: validateContact,
    build: buildContactPatch,
    paths: () => CONTACT_FIELD_PATHS,
    onSaved: (r) => {
      setD(contactDraft(r.data));
      onSaved(r);
    },
  });
  const set = (k: keyof ContactDraft) => (v: string) => {
    touch();
    setD((x) => ({ ...x, [k]: v }));
  };
  const e = state.errors;
  return (
    <SectionCard
      title="Thông tin liên hệ"
      description="Hiển thị ở chân trang, trang Liên hệ và các chính sách. Email này cũng nhận thông báo từ biểu mẫu liên hệ."
      updatedAt={latestUpdatedAt(SECTION_KEYS.contact, result.meta.updatedAt)}
      state={state}
      onSubmit={() => void save(d)}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          path="store.contact.name"
          label="Tên cửa hàng"
          maxLength={100}
          value={d.name}
          onChange={set("name")}
          error={e["store.contact.name"]}
        />
        <TextField
          path="store.contact.email"
          label="Email"
          type="email"
          autoComplete="email"
          maxLength={254}
          value={d.email}
          onChange={set("email")}
          error={e["store.contact.email"]}
        />
        <TextField
          path="store.contact.phone"
          label="Số điện thoại"
          type="tel"
          autoComplete="tel"
          hint="Để trống nếu không công khai số điện thoại."
          value={d.phone}
          onChange={set("phone")}
          error={e["store.contact.phone"]}
        />
        <TextField
          path="store.contact.address"
          label="Địa chỉ"
          maxLength={300}
          hint="Để trống nếu không công khai địa chỉ."
          value={d.address}
          onChange={set("address")}
          error={e["store.contact.address"]}
        />
      </div>
    </SectionCard>
  );
}

// ---------- Banner ----------

function BannerEditor({
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

function BannersSection({
  result,
  onSaved,
}: {
  result: AdminSettingsResult;
  onSaved: (r: AdminSettingsResult) => void;
}) {
  const [list, setList] = useState<BannerDraft[]>(() => bannersDraft(result.data));
  const [uploadingUid, setUploadingUid] = useState<number | null>(null);
  const [uploadErrors, setUploadErrors] = useState<Record<number, string>>({});
  const { state, save, touch, clearErrors } = useSectionSave<BannerDraft[]>({
    validate: validateBanners,
    build: buildBannersPatch,
    paths: (l) => ["home.banners", ...bannerFieldPaths(l.length)],
    onSaved: (r) => {
      setList(bannersDraft(r.data));
      onSaved(r);
    },
  });

  const patch = (uid: number, p: Partial<BannerDraft>) => {
    touch();
    setList((l) => l.map((b) => (b.uid === uid ? { ...b, ...p } : b)));
  };
  const structural = (fn: (l: BannerDraft[]) => BannerDraft[]) => {
    touch();
    clearErrors(); // chỉ số banner đổi nên lỗi theo chỉ số không còn đúng
    setList(fn);
  };

  async function upload(uid: number, file: File) {
    setUploadingUid(uid);
    setUploadErrors((m) => {
      const next = { ...m };
      delete next[uid];
      return next;
    });
    try {
      const up = await uploadAdminImage(file);
      patch(uid, { imageUrl: up.url });
    } catch (e) {
      setUploadErrors((m) => ({ ...m, [uid]: adminErrorMessage(e) }));
    } finally {
      setUploadingUid(null);
    }
  }

  const errs = state.errors;
  const listErr = errs["home.banners"];
  return (
    <SectionCard
      title="Banner trang chủ"
      description={`Tối đa ${MAX_BANNERS} banner, hiển thị theo thứ tự dưới phần giới thiệu đầu trang. Ảnh phải được tải lên (đường dẫn /uploads/...).`}
      updatedAt={latestUpdatedAt(SECTION_KEYS.banners, result.meta.updatedAt)}
      state={state}
      onSubmit={() => void save(list)}
    >
      <FieldError id="st-banners-err">{listErr}</FieldError>
      {list.length === 0 ? (
        <p className="rounded-lg bg-cream-50 p-4 text-sm text-coffee-800">
          Chưa có banner nào. Trang chủ sẽ không hiển thị dải banner.
        </p>
      ) : (
        <ul className="space-y-4">
          {list.map((b, i) => {
            const own: FieldErrors = { ...errs };
            const up = uploadErrors[b.uid];
            if (up) own[`home.banners.${i}.imageUrl`] = up;
            return (
              <BannerEditor
                key={b.uid}
                banner={b}
                index={i}
                total={list.length}
                errors={own}
                uploading={uploadingUid === b.uid}
                onChange={(p) => patch(b.uid, p)}
                onMove={(dir) =>
                  structural((l) => {
                    const next = [...l];
                    const j = i + dir;
                    if (j < 0 || j >= next.length) return l;
                    [next[i], next[j]] = [next[j]!, next[i]!];
                    return next;
                  })
                }
                onRemove={() => structural((l) => l.filter((x) => x.uid !== b.uid))}
                onUpload={(f) => void upload(b.uid, f)}
              />
            );
          })}
        </ul>
      )}
      <div>
        <Button
          variant="outline"
          disabled={list.length >= MAX_BANNERS}
          onClick={() => structural((l) => [...l, emptyBanner()])}
        >
          Thêm banner
        </Button>
        {list.length >= MAX_BANNERS ? (
          <span className="ml-3 text-sm text-coffee-700">Đã đạt tối đa {MAX_BANNERS} banner.</span>
        ) : null}
      </div>
    </SectionCard>
  );
}

// ---------- Trang ----------

function Forbidden() {
  return (
    <div
      role="alert"
      className="mx-auto max-w-md space-y-3 rounded-2xl border border-coffee-200 bg-white p-6 text-center"
    >
      <h1 className="font-serif text-xl font-bold text-coffee-900">
        Bạn không đủ quyền xem trang cài đặt
      </h1>
      <p className="text-coffee-800">Chỉ quản trị viên mới xem được trang này.</p>
      <Link href="/admin" className={buttonClasses("primary")}>
        Về tổng quan
      </Link>
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Đang tải cài đặt" role="status" className="space-y-4">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-40 w-full" />
      ))}
    </div>
  );
}

function SettingsForms({ initial }: { initial: AdminSettingsResult }) {
  const [result, setResult] = useState(initial);
  const onSaved = useCallback((r: AdminSettingsResult) => setResult(r), []);
  return (
    <div className="space-y-5">
      <ShippingSection result={result} onSaved={onSaved} />
      <AreaSection result={result} onSaved={onSaved} />
      <ContactSection result={result} onSaved={onSaved} />
      <BannersSection result={result} onSaved={onSaved} />
    </div>
  );
}

export function AdminSettings() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  // Chỉ gọi API khi là ADMIN; STAFF thấy thông báo (backend vẫn chặn 403).
  const res = useResource<AdminSettingsResult>(isAdmin ? "settings" : null, loadSettings);

  if (user && !isAdmin) return <Forbidden />;

  let body: React.ReactNode;
  if (res.status === "loading" || res.status === "idle") body = <SettingsSkeleton />;
  else if (res.status === "error") {
    if (res.error instanceof ApiError && res.error.status === 403) return <Forbidden />;
    body = (
      <ErrorState
        title="Không tải được cài đặt"
        description={adminErrorMessage(res.error)}
        onRetry={res.retry}
      />
    );
  } else body = <SettingsForms initial={res.data!} />;

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h1 className="font-serif text-2xl font-bold text-coffee-900">Cài đặt cửa hàng</h1>
        <p className="rounded-lg bg-moss-50 px-3 py-2 text-sm text-moss-800">
          Phí ship áp dụng ngay cho đơn mới; trang chính sách, chân trang và banner cập nhật trong
          vòng khoảng 5 phút.
        </p>
      </div>
      {body}
    </div>
  );
}
