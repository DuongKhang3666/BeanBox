"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FieldError, Input, Label } from "@/components/ui/Input";
import { FormError } from "@/features/auth/components/FormError";
import { ApiError } from "@/lib/api/errors";
import type { AdminVariant, VariantInput } from "@/types/admin";
import { createAdminVariant, updateAdminVariant } from "../api/products";
import { adminErrorMessage, fieldErrorsOf } from "../errors";
import {
  type AttrRow,
  attributesResult,
  intRangeError,
  isoToVnLocal,
  skuError,
  variantNameError,
  vnLocalToIso,
} from "../productValidation";
import { AdminModal } from "./AdminModal";

interface Row extends AttrRow {
  id: number;
}

const ROAST_RE = /^\d{4}-\d{2}-\d{2}$/;
const sameTime = (a: string | null, b: string | null) =>
  (a ? new Date(a).getTime() : null) === (b ? new Date(b).getTime() : null);
const attrKey = (o: Record<string, string>) =>
  JSON.stringify(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

const describedBy = (id: string, error?: string, hasHint?: boolean) =>
  [error ? `${id}-err` : null, hasHint ? `${id}-hint` : null].filter(Boolean).join(" ") ||
  undefined;

/** Hộp thoại thêm/sửa biến thể (§12.4). `variant` có giá trị = sửa (không có ô tồn kho). */
export function VariantDialog({
  productId,
  variant,
  onSaved,
  onClose,
}: {
  productId: string;
  variant?: AdminVariant;
  onSaved: (saved: AdminVariant, mode: "create" | "update") => void;
  onClose: () => void;
}) {
  const editing = Boolean(variant);
  const nextRowId = useRef(1000);
  const [sku, setSku] = useState(variant?.sku ?? "");
  const [name, setName] = useState(variant?.name ?? "");
  const [rows, setRows] = useState<Row[]>(() => {
    const entries = Object.entries(variant?.attributes ?? {});
    return entries.length
      ? entries.map(([key, value], i) => ({ id: i, key, value }))
      : [{ id: 0, key: "", value: "" }];
  });
  const [price, setPrice] = useState(variant ? String(variant.price) : "");
  const [salePrice, setSalePrice] = useState(
    variant?.salePrice != null ? String(variant.salePrice) : "",
  );
  const [saleStart, setSaleStart] = useState(isoToVnLocal(variant?.saleStart));
  const [saleEnd, setSaleEnd] = useState(isoToVnLocal(variant?.saleEnd));
  const [stock, setStock] = useState("0");
  const [threshold, setThreshold] = useState(String(variant?.lowStockThreshold ?? 5));
  const [weight, setWeight] = useState(String(variant?.weightGram ?? 0));
  const [roastDate, setRoastDate] = useState(variant?.roastDate ?? "");
  const [sortOrder, setSortOrder] = useState(String(variant?.sortOrder ?? 0));
  const [isActive, setIsActive] = useState(variant?.isActive ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  function updateRow(id: number, patch: Partial<AttrRow>) {
    setRows((cur) => cur.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    const put = (k: string, v: string | undefined) => {
      if (v) e[k] = v;
    };
    put("sku", skuError(sku));
    put("name", variantNameError(name));
    put("attributes", attributesResult(rows).error);
    put("price", intRangeError(price, 1, 100_000_000, "Giá"));
    if (salePrice.trim()) {
      const sp = salePrice.trim();
      if (!/^\d+$/.test(sp) || Number(sp) <= 0 || Number(sp) > 100_000_000) {
        e.salePrice = "Giá khuyến mãi phải là số nguyên lớn hơn 0.";
      } else if (!e.price && Number(sp) >= Number(price.trim())) {
        e.salePrice = "Giá khuyến mãi phải nhỏ hơn giá gốc.";
      }
    }
    const startIso = saleStart ? vnLocalToIso(saleStart) : null;
    const endIso = saleEnd ? vnLocalToIso(saleEnd) : null;
    if (saleStart && !startIso) e.saleStart = "Thời gian bắt đầu không hợp lệ.";
    if (saleEnd && !endIso) e.saleEnd = "Thời gian kết thúc không hợp lệ.";
    if (startIso && endIso && startIso >= endIso) {
      e.saleEnd = "Thời gian kết thúc phải sau thời gian bắt đầu.";
    }
    if (!editing) put("stock", intRangeError(stock, 0, 100000, "Tồn kho ban đầu"));
    put("lowStockThreshold", intRangeError(threshold, 0, 1000, "Ngưỡng sắp hết"));
    put("weightGram", intRangeError(weight, 0, 100000, "Khối lượng"));
    put("sortOrder", intRangeError(sortOrder, 0, 9999, "Thứ tự"));
    if (roastDate && !ROAST_RE.test(roastDate)) e.roastDate = "Ngày rang không hợp lệ.";
    return e;
  }

  function buildBody(): VariantInput {
    const attrs = attributesResult(rows).value;
    const sp = salePrice.trim() ? Number(salePrice.trim()) : null;
    const start = saleStart ? vnLocalToIso(saleStart) : null;
    const end = saleEnd ? vnLocalToIso(saleEnd) : null;
    const code = sku.trim().toUpperCase();
    const body: VariantInput = {};
    if (!variant) {
      body.sku = code;
      body.name = name.trim();
      body.attributes = attrs;
      body.price = Number(price.trim());
      if (sp !== null) body.salePrice = sp;
      if (start) body.saleStart = start;
      if (end) body.saleEnd = end;
      body.stock = Number(stock.trim());
      body.lowStockThreshold = Number(threshold.trim());
      body.weightGram = Number(weight.trim());
      if (roastDate) body.roastDate = roastDate;
      body.sortOrder = Number(sortOrder.trim());
      body.isActive = isActive;
      return body;
    }
    if (code !== variant.sku) body.sku = code;
    if (name.trim() !== variant.name) body.name = name.trim();
    if (attrKey(attrs) !== attrKey(variant.attributes)) body.attributes = attrs;
    if (Number(price.trim()) !== variant.price) body.price = Number(price.trim());
    if (sp !== variant.salePrice) body.salePrice = sp;
    if (!sameTime(start, variant.saleStart)) body.saleStart = start;
    if (!sameTime(end, variant.saleEnd)) body.saleEnd = end;
    if (Number(threshold.trim()) !== variant.lowStockThreshold) {
      body.lowStockThreshold = Number(threshold.trim());
    }
    if (Number(weight.trim()) !== variant.weightGram) body.weightGram = Number(weight.trim());
    if ((roastDate || null) !== variant.roastDate) body.roastDate = roastDate || null;
    if (Number(sortOrder.trim()) !== variant.sortOrder) body.sortOrder = Number(sortOrder.trim());
    if (isActive !== variant.isActive) body.isActive = isActive;
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
    if (variant && Object.keys(body).length === 0) {
      onClose();
      return;
    }

    busyRef.current = true;
    setBusy(true);
    try {
      const saved = variant
        ? await updateAdminVariant(variant.id, body)
        : await createAdminVariant(productId, body);
      onSaved(saved, variant ? "update" : "create");
    } catch (err) {
      if (err instanceof ApiError && err.code === "SKU_TAKEN") {
        setErrors({ sku: "SKU này đã được dùng (kể cả biến thể đã xóa), vui lòng chọn SKU khác." });
      } else if (err instanceof ApiError && err.code === "CONFLICT") {
        setGeneral(err.message);
      } else {
        const fe = fieldErrorsOf(err);
        const shown: Record<string, string> = {};
        for (const k of [
          "sku",
          "name",
          "attributes",
          "price",
          "salePrice",
          "saleStart",
          "saleEnd",
          "stock",
          "lowStockThreshold",
          "weightGram",
          "roastDate",
          "sortOrder",
        ]) {
          if (fe[k]) shown[k] = fe[k];
        }
        setErrors(shown);
        if (Object.keys(shown).length === 0) setGeneral(adminErrorMessage(err));
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const numberInput = (
    id: string,
    label: string,
    value: string,
    set: (v: string) => void,
    key: string,
    hintText?: string,
  ) => (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        value={value}
        invalid={Boolean(errors[key])}
        aria-describedby={describedBy(id, errors[key], Boolean(hintText))}
        onChange={(e) => set(e.target.value)}
      />
      {hintText ? (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-coffee-700">
          {hintText}
        </p>
      ) : null}
      <FieldError id={`${id}-err`}>{errors[key]}</FieldError>
    </div>
  );

  return (
    <AdminModal
      title={editing ? "Sửa biến thể" : "Thêm biến thể"}
      description={editing ? `SKU ${variant!.sku}` : undefined}
      busy={busy}
      onClose={onClose}
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div>
          <Label htmlFor="vd-sku">SKU</Label>
          <Input
            id="vd-sku"
            data-autofocus
            value={sku}
            maxLength={40}
            autoComplete="off"
            className="font-mono uppercase"
            invalid={Boolean(errors.sku)}
            aria-describedby={describedBy("vd-sku", errors.sku, true)}
            onChange={(e) => setSku(e.target.value.toUpperCase())}
          />
          <p id="vd-sku-hint" className="mt-1.5 text-sm text-coffee-700">
            Tự chuyển thành chữ in hoa; duy nhất toàn hệ thống.
          </p>
          <FieldError id="vd-sku-err">{errors.sku}</FieldError>
        </div>

        <div>
          <Label htmlFor="vd-name">Tên biến thể</Label>
          <Input
            id="vd-name"
            value={name}
            maxLength={100}
            autoComplete="off"
            invalid={Boolean(errors.name)}
            aria-describedby={describedBy("vd-name", errors.name)}
            onChange={(e) => setName(e.target.value)}
          />
          <FieldError id="vd-name-err">{errors.name}</FieldError>
        </div>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-coffee-900">
            Thuộc tính (ví dụ: weight = 250g)
          </legend>
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={r.id} className="flex items-center gap-2">
                <Input
                  aria-label={`Tên thuộc tính ${i + 1}`}
                  value={r.key}
                  maxLength={30}
                  placeholder="Tên"
                  onChange={(e) => updateRow(r.id, { key: e.target.value })}
                />
                <Input
                  aria-label={`Giá trị thuộc tính ${i + 1}`}
                  value={r.value}
                  maxLength={50}
                  placeholder="Giá trị"
                  onChange={(e) => updateRow(r.id, { value: e.target.value })}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0"
                  aria-label={`Xóa thuộc tính ${i + 1}`}
                  onClick={() => setRows((cur) => cur.filter((x) => x.id !== r.id))}
                >
                  <span aria-hidden="true">✕</span>
                </Button>
              </div>
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            disabled={rows.length >= 10}
            onClick={() =>
              setRows((cur) => [...cur, { id: nextRowId.current++, key: "", value: "" }])
            }
          >
            Thêm thuộc tính
          </Button>
          <FieldError id="vd-attr-err">{errors.attributes}</FieldError>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          {numberInput("vd-price", "Giá (VND)", price, setPrice, "price")}
          {numberInput("vd-sale", "Giá khuyến mãi (VND)", salePrice, setSalePrice, "salePrice")}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="vd-sale-start">Bắt đầu khuyến mãi</Label>
            <Input
              id="vd-sale-start"
              type="datetime-local"
              value={saleStart}
              invalid={Boolean(errors.saleStart)}
              aria-describedby={describedBy("vd-sale-start", errors.saleStart)}
              onChange={(e) => setSaleStart(e.target.value)}
            />
            <FieldError id="vd-sale-start-err">{errors.saleStart}</FieldError>
          </div>
          <div>
            <Label htmlFor="vd-sale-end">Kết thúc khuyến mãi</Label>
            <Input
              id="vd-sale-end"
              type="datetime-local"
              value={saleEnd}
              invalid={Boolean(errors.saleEnd)}
              aria-describedby={describedBy("vd-sale-end", errors.saleEnd)}
              onChange={(e) => setSaleEnd(e.target.value)}
            />
            <FieldError id="vd-sale-end-err">{errors.saleEnd}</FieldError>
          </div>
          <p className="text-sm text-coffee-700 sm:col-span-2">
            Thời gian tính theo giờ Việt Nam (UTC+7).
          </p>
        </div>

        {editing ? (
          <p className="rounded-lg bg-cream-50 p-3 text-sm text-coffee-900">
            Tồn kho hiện tại: <strong>{variant!.stock}</strong>. Đổi tồn bằng nút “Điều chỉnh tồn” ở
            bảng biến thể để có lịch sử biến động.
          </p>
        ) : (
          numberInput("vd-stock", "Tồn kho ban đầu", stock, setStock, "stock")
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {numberInput(
            "vd-threshold",
            "Ngưỡng sắp hết",
            threshold,
            setThreshold,
            "lowStockThreshold",
          )}
          {numberInput("vd-weight", "Khối lượng (g)", weight, setWeight, "weightGram")}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="vd-roast">Ngày rang (không bắt buộc)</Label>
            <Input
              id="vd-roast"
              type="date"
              value={roastDate}
              invalid={Boolean(errors.roastDate)}
              aria-describedby={describedBy("vd-roast", errors.roastDate)}
              onChange={(e) => setRoastDate(e.target.value)}
            />
            <FieldError id="vd-roast-err">{errors.roastDate}</FieldError>
          </div>
          {numberInput("vd-order", "Thứ tự hiển thị", sortOrder, setSortOrder, "sortOrder")}
        </div>

        <label className="flex min-h-11 items-center gap-2 text-base text-coffee-900">
          <input
            type="checkbox"
            className="h-5 w-5 accent-moss-700"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          Đang bán
        </label>

        <FormError>{general}</FormError>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Đóng
          </Button>
          <Button type="submit" loading={busy}>
            {editing ? "Lưu biến thể" : "Thêm biến thể"}
          </Button>
        </div>
      </form>
    </AdminModal>
  );
}
