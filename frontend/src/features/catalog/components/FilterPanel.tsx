"use client";

import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import type { Brand, CategoryChild } from "@/types/catalog";
import {
  buildHref,
  changeFilters,
  clearFilters,
  hasActiveFilters,
  type ProductFilters,
} from "../filters";
import {
  BREW_LABELS,
  BREW_VALUES,
  PROCESS_LABELS,
  PROCESS_VALUES,
  ROAST_LABELS,
  ROAST_VALUES,
} from "../labels";

interface Option {
  value: string;
  label: string;
}

interface FilterPanelProps {
  pathname: string;
  filters: ProductFilters;
  subcategories?: CategoryChild[];
  brands: Brand[];
  /** Hiện bộ lọc riêng của cà phê hạt (rang, sơ chế, cách pha, xuất xứ). */
  showCoffeeFilters: boolean;
  origins?: string[];
}

function CheckGroup({
  legend,
  options,
  selected,
  onToggle,
  disabled,
}: {
  legend: string;
  options: Option[];
  selected: string[];
  onToggle: (value: string) => void;
  disabled: boolean;
}) {
  if (options.length === 0) return null;
  return (
    <fieldset className="min-w-0 border-t border-coffee-200 pt-4">
      <legend className="mb-2 text-sm font-semibold text-coffee-900">{legend}</legend>
      <ul className="space-y-1">
        {options.map((o) => (
          <li key={o.value}>
            <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm text-coffee-800">
              <input
                type="checkbox"
                checked={selected.includes(o.value)}
                disabled={disabled}
                onChange={() => onToggle(o.value)}
                className="h-4 w-4 accent-moss-700"
              />
              {o.label}
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

function toggle<T extends string>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export function FilterPanel({
  pathname,
  filters,
  subcategories = [],
  brands,
  showCoffeeFilters,
  origins = [],
}: FilterPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const panelId = useId();

  const push = (next: ProductFilters) =>
    startTransition(() => {
      router.push(buildHref(pathname, next), { scroll: false });
    });
  const apply = (patch: Partial<ProductFilters>) => push(changeFilters(filters, patch));

  return (
    <aside aria-label="Bộ lọc sản phẩm" className="lg:w-64 lg:shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex h-11 w-full items-center justify-between rounded-lg border border-coffee-400 bg-white px-4 text-sm font-medium text-coffee-900 lg:hidden"
      >
        <span>Bộ lọc{hasActiveFilters(filters) ? " (đang áp dụng)" : ""}</span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>

      <div
        id={panelId}
        aria-busy={pending}
        className={`${open ? "block" : "hidden"} mt-3 space-y-4 rounded-2xl border border-coffee-200 bg-cream-50 p-4 lg:mt-0 lg:block`}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-serif text-lg font-semibold text-coffee-900">Bộ lọc</h2>
          <span role="status" className="text-xs text-coffee-600">
            {pending ? (
              <span className="inline-flex items-center gap-1">
                <Spinner label="" /> Đang cập nhật...
              </span>
            ) : null}
          </span>
        </div>

        {hasActiveFilters(filters) ? (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => push(clearFilters(filters))}
            className="w-full"
          >
            Xóa bộ lọc
          </Button>
        ) : null}

        {subcategories.length > 0 ? (
          <nav aria-label="Danh mục con" className="border-t border-coffee-200 pt-4">
            <h3 className="mb-2 text-sm font-semibold text-coffee-900">Danh mục</h3>
            <ul className="space-y-1">
              {subcategories.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/danh-muc/${c.slug}`}
                    className="flex min-h-9 items-center justify-between text-sm text-coffee-800 hover:underline"
                  >
                    <span>{c.name}</span>
                    <span className="text-xs text-coffee-600">{c.productCount}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        <CheckGroup
          legend="Thương hiệu"
          options={brands
            .filter((b) => b.productCount > 0)
            .map((b) => ({ value: b.slug, label: `${b.name} (${b.productCount})` }))}
          selected={filters.brand}
          onToggle={(v) => apply({ brand: toggle(filters.brand, v) })}
          disabled={pending}
        />

        <PriceRange
          key={`${filters.minPrice ?? ""}-${filters.maxPrice ?? ""}`}
          filters={filters}
          disabled={pending}
          onApply={(minPrice, maxPrice) => apply({ minPrice, maxPrice })}
        />

        <div className="border-t border-coffee-200 pt-4">
          <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm font-medium text-coffee-900">
            <input
              type="checkbox"
              checked={filters.inStock}
              disabled={pending}
              onChange={(e) => apply({ inStock: e.target.checked })}
              className="h-4 w-4 accent-moss-700"
            />
            Chỉ còn hàng
          </label>
        </div>

        {showCoffeeFilters ? (
          <>
            <CheckGroup
              legend="Mức rang"
              options={ROAST_VALUES.map((v) => ({ value: v, label: ROAST_LABELS[v] }))}
              selected={filters.roast}
              onToggle={(v) =>
                apply({ roast: toggle(filters.roast, v as (typeof ROAST_VALUES)[number]) })
              }
              disabled={pending}
            />
            <CheckGroup
              legend="Sơ chế"
              options={PROCESS_VALUES.map((v) => ({ value: v, label: PROCESS_LABELS[v] }))}
              selected={filters.process}
              onToggle={(v) =>
                apply({ process: toggle(filters.process, v as (typeof PROCESS_VALUES)[number]) })
              }
              disabled={pending}
            />
            <CheckGroup
              legend="Cách pha"
              options={BREW_VALUES.map((v) => ({ value: v, label: BREW_LABELS[v] }))}
              selected={filters.brew}
              onToggle={(v) =>
                apply({ brew: toggle(filters.brew, v as (typeof BREW_VALUES)[number]) })
              }
              disabled={pending}
            />
            <CheckGroup
              legend="Xuất xứ"
              options={origins.map((o) => ({ value: o, label: o }))}
              selected={filters.origin}
              onToggle={(v) => apply({ origin: toggle(filters.origin, v) })}
              disabled={pending}
            />
          </>
        ) : null}
      </div>
    </aside>
  );
}

function PriceRange({
  filters,
  disabled,
  onApply,
}: {
  filters: ProductFilters;
  disabled: boolean;
  onApply: (min: number | undefined, max: number | undefined) => void;
}) {
  const [min, setMin] = useState(filters.minPrice?.toString() ?? "");
  const [max, setMax] = useState(filters.maxPrice?.toString() ?? "");
  const [error, setError] = useState<string | null>(null);
  const uid = useId();

  const parse = (s: string): number | undefined | "invalid" => {
    const t = s.trim();
    if (!t) return undefined;
    return /^\d+$/.test(t) && Number.isSafeInteger(Number(t)) ? Number(t) : "invalid";
  };

  return (
    <form
      className="border-t border-coffee-200 pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        const a = parse(min);
        const b = parse(max);
        if (a === "invalid" || b === "invalid") {
          setError("Giá phải là số nguyên không âm.");
          return;
        }
        if (a !== undefined && b !== undefined && a > b) {
          setError("Giá từ phải nhỏ hơn hoặc bằng giá đến.");
          return;
        }
        setError(null);
        onApply(a, b);
      }}
    >
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-coffee-900">Khoảng giá (₫)</legend>
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Label htmlFor={`${uid}-min`} className="text-xs">
              Từ
            </Label>
            <Input
              id={`${uid}-min`}
              inputMode="numeric"
              value={min}
              onChange={(e) => setMin(e.target.value)}
              placeholder="0"
              invalid={!!error}
              aria-describedby={error ? `${uid}-err` : undefined}
            />
          </div>
          <div className="min-w-0 flex-1">
            <Label htmlFor={`${uid}-max`} className="text-xs">
              Đến
            </Label>
            <Input
              id={`${uid}-max`}
              inputMode="numeric"
              value={max}
              onChange={(e) => setMax(e.target.value)}
              placeholder="500000"
              invalid={!!error}
              aria-describedby={error ? `${uid}-err` : undefined}
            />
          </div>
        </div>
        {error ? (
          <p id={`${uid}-err`} role="alert" className="mt-1.5 text-sm text-danger-600">
            {error}
          </p>
        ) : null}
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          disabled={disabled}
          className="mt-2 w-full"
        >
          Áp dụng
        </Button>
      </fieldset>
    </form>
  );
}
