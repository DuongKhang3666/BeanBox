"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";
import type { Variant } from "@/types/catalog";

interface VariantSelectorProps {
  variants: Variant[];
  selectedId: string;
  onChange: (id: string) => void;
}

/** Chọn biến thể bằng radio gốc (có sẵn điều hướng mũi tên bằng bàn phím). */
export function VariantSelector({ variants, selectedId, onChange }: VariantSelectorProps) {
  const groupName = useId();
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-coffee-900">Lựa chọn</legend>
      <div className="flex flex-wrap gap-2">
        {variants.map((v) => {
          const out = v.stockStatus === "OUT_OF_STOCK";
          const checked = v.id === selectedId;
          return (
            <label
              key={v.id}
              className={cn(
                "relative inline-flex min-h-11 cursor-pointer items-center rounded-lg border px-4 py-2 text-sm font-medium",
                "has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-moss-600",
                checked
                  ? "border-moss-700 bg-moss-50 text-moss-800 ring-1 ring-moss-700"
                  : "border-coffee-300 bg-white text-coffee-800 hover:bg-coffee-50",
                out && "text-coffee-500",
              )}
            >
              <input
                type="radio"
                name={groupName}
                value={v.id}
                checked={checked}
                onChange={() => onChange(v.id)}
                className="sr-only"
              />
              <span className={out ? "line-through decoration-coffee-400" : undefined}>
                {v.name}
              </span>
              {out ? <span className="ml-2 text-xs font-normal">(Hết hàng)</span> : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
