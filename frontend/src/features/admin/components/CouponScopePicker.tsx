"use client";

import { useEffect, useState } from "react";
import { FieldError, Input, Label } from "@/components/ui/Input";
import { useResource } from "@/features/orders/useResource";
import type { AdminCategory } from "@/types/admin";
import { listAdminProducts } from "../api/products";
import { adminErrorMessage } from "../errors";
import { MAX_SCOPE_ITEMS } from "../couponValidation";
import { categoryOptions } from "./categoryOptions";

const selectClass =
  "h-11 w-full rounded-lg border border-coffee-400 bg-white px-3 text-base text-coffee-900 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-moss-600";

const searchProducts = (q: string) => listAdminProducts({ q, pageSize: 8 });

function Chip({
  label,
  removeLabel,
  onRemove,
}: {
  label: string;
  removeLabel: string;
  onRemove: () => void;
}) {
  return (
    <li className="inline-flex max-w-full items-center gap-1 rounded-full bg-cream-200 py-1 pr-1 pl-3 text-sm text-coffee-900">
      <span className="min-w-0 break-words">{label}</span>
      <button
        type="button"
        aria-label={removeLabel}
        onClick={onRemove}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full hover:bg-coffee-200 focus-visible:outline-3 focus-visible:outline-moss-600"
      >
        <span aria-hidden="true">×</span>
      </button>
    </li>
  );
}

/**
 * Phạm vi áp dụng: danh mục (chọn từ cây) và sản phẩm (tìm qua GET /admin/products?q=).
 * Mỗi loại tối đa 50; để trống = áp dụng cho toàn bộ giỏ hàng.
 */
export function CouponScopePicker({
  categories,
  categoryIds,
  productIds,
  productNames,
  errors,
  onCategoryIds,
  onProductIds,
  onProductName,
}: {
  categories: AdminCategory[];
  categoryIds: string[];
  productIds: string[];
  /** id -> tên (đã biết). Id chưa biết tên hiển thị dạng rút gọn. */
  productNames: Record<string, string>;
  errors: { categoryIds?: string; productIds?: string };
  onCategoryIds: (ids: string[]) => void;
  onProductIds: (ids: string[]) => void;
  onProductName: (id: string, name: string) => void;
}) {
  const options = categoryOptions(categories);
  const labelOf = (id: string) =>
    options.find((o) => o.id === id)?.label ?? `Danh mục ${id.slice(-6)}`;
  const productLabel = (id: string) => productNames[id] ?? `Sản phẩm …${id.slice(-6)}`;

  const [text, setText] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebounced(text.trim()), 300);
    return () => clearTimeout(id);
  }, [text]);
  const search = useResource(debounced.length >= 2 ? debounced : null, searchProducts);

  const catFull = categoryIds.length >= MAX_SCOPE_ITEMS;
  const prodFull = productIds.length >= MAX_SCOPE_ITEMS;

  return (
    <fieldset className="space-y-4 rounded-xl border border-coffee-200 p-4">
      <legend className="px-1 text-sm font-semibold text-coffee-900">Phạm vi áp dụng</legend>
      <p className="text-sm text-coffee-700">
        Để trống cả hai để áp dụng cho toàn bộ sản phẩm. Mỗi loại tối đa {MAX_SCOPE_ITEMS} mục.
      </p>

      <div>
        <Label htmlFor="cp-cat">Danh mục (gồm cả danh mục con)</Label>
        <select
          id="cp-cat"
          className={selectClass}
          value=""
          disabled={catFull}
          aria-describedby={errors.categoryIds ? "cp-cat-err" : undefined}
          onChange={(e) => {
            const v = e.target.value;
            if (v && !categoryIds.includes(v)) onCategoryIds([...categoryIds, v]);
          }}
        >
          <option value="">{catFull ? "Đã đủ số lượng tối đa" : "Chọn danh mục để thêm"}</option>
          {options
            .filter((o) => !categoryIds.includes(o.id))
            .map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
        </select>
        {categoryIds.length > 0 ? (
          <ul aria-label="Danh mục đã chọn" className="mt-2 flex flex-wrap gap-2">
            {categoryIds.map((id) => (
              <Chip
                key={id}
                label={labelOf(id)}
                removeLabel={`Bỏ danh mục ${labelOf(id)}`}
                onRemove={() => onCategoryIds(categoryIds.filter((c) => c !== id))}
              />
            ))}
          </ul>
        ) : null}
        <FieldError id="cp-cat-err">{errors.categoryIds}</FieldError>
      </div>

      <div>
        <Label htmlFor="cp-prod">Sản phẩm</Label>
        <Input
          id="cp-prod"
          type="search"
          value={text}
          autoComplete="off"
          disabled={prodFull}
          maxLength={100}
          placeholder={
            prodFull ? "Đã đủ số lượng tối đa" : "Tìm theo tên hoặc slug (ít nhất 2 ký tự)"
          }
          aria-describedby={errors.productIds ? "cp-prod-err" : undefined}
          onChange={(e) => setText(e.target.value)}
        />
        {debounced.length >= 2 ? (
          <div aria-live="polite" className="mt-2">
            {search.status === "loading" ? (
              <p className="text-sm text-coffee-700">Đang tìm…</p>
            ) : search.status === "error" ? (
              <p className="text-sm text-danger-600">{adminErrorMessage(search.error)}</p>
            ) : search.data && search.data.data.length === 0 ? (
              <p className="text-sm text-coffee-700">Không tìm thấy sản phẩm nào.</p>
            ) : search.data ? (
              <ul
                aria-label="Kết quả tìm sản phẩm"
                className="divide-y divide-coffee-100 rounded-lg border border-coffee-200"
              >
                {search.data.data.map((p) => {
                  const added = productIds.includes(p.id);
                  return (
                    <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="min-w-0 text-sm break-words text-coffee-900">{p.name}</span>
                      <button
                        type="button"
                        disabled={added || prodFull}
                        aria-label={added ? `Đã thêm ${p.name}` : `Thêm sản phẩm ${p.name}`}
                        onClick={() => {
                          onProductName(p.id, p.name);
                          onProductIds([...productIds, p.id]);
                        }}
                        className="h-9 shrink-0 rounded-lg border border-coffee-700 px-3 text-sm font-medium text-coffee-800 hover:bg-coffee-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {added ? "Đã thêm" : "Thêm"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        ) : null}
        {productIds.length > 0 ? (
          <ul aria-label="Sản phẩm đã chọn" className="mt-2 flex flex-wrap gap-2">
            {productIds.map((id) => (
              <Chip
                key={id}
                label={productLabel(id)}
                removeLabel={`Bỏ sản phẩm ${productLabel(id)}`}
                onRemove={() => onProductIds(productIds.filter((p) => p !== id))}
              />
            ))}
          </ul>
        ) : null}
        <FieldError id="cp-prod-err">{errors.productIds}</FieldError>
      </div>
    </fieldset>
  );
}
