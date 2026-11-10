"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { ProductSort } from "@/types/catalog";
import {
  buildHref,
  changeFilters,
  defaultSort,
  effectiveSort,
  type ProductFilters,
} from "../filters";
import { SORT_LABELS } from "../labels";

const BASE_OPTIONS: ProductSort[] = ["newest", "price_asc", "price_desc", "bestseller", "rating"];

export function SortSelect({ pathname, filters }: { pathname: string; filters: ProductFilters }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const options: ProductSort[] = filters.q ? ["relevance", ...BASE_OPTIONS] : BASE_OPTIONS;

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="sort-select" className="text-sm font-medium text-coffee-800">
        Sắp xếp
      </label>
      <select
        id="sort-select"
        value={effectiveSort(filters)}
        disabled={pending}
        onChange={(e) => {
          const sort = e.target.value as ProductSort;
          startTransition(() => {
            router.push(
              buildHref(
                pathname,
                changeFilters(filters, { sort: sort === defaultSort(filters) ? undefined : sort }),
              ),
              { scroll: false },
            );
          });
        }}
        className="h-11 rounded-lg border border-coffee-400 bg-white px-3 text-sm text-coffee-900"
      >
        {options.map((s) => (
          <option key={s} value={s}>
            {SORT_LABELS[s]}
          </option>
        ))}
      </select>
    </div>
  );
}
