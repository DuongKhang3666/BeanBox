"use client";

import { cn } from "@/lib/cn";
import { useCompare } from "../useCompare";
import type { CompareEntry } from "../store";

function Scale({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 3 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {active ? (
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      ) : (
        <path d="M12 4v16M5 8h14M5 8l-2.5 6a3 3 0 0 0 5 0L5 8zm14 0l-2.5 6a3 3 0 0 0 5 0L19 8z" />
      )}
    </svg>
  );
}

interface Props {
  product: CompareEntry;
  /** "chip": nhãn nhỏ đặt trên ảnh thẻ sản phẩm; "labeled": nút cao hơn ở trang chi tiết. */
  variant?: "chip" | "labeled";
  className?: string;
}

export function CompareButton({ product, variant = "chip", className }: Props) {
  const { has, add, remove } = useCompare();
  const active = has(product.slug);
  const label = active ? `Bỏ ${product.name} khỏi so sánh` : `Thêm ${product.name} vào so sánh`;

  function onClick() {
    if (active) remove(product.slug);
    else add(product);
  }

  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 font-medium transition-colors",
        "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-moss-600",
        active ? "bg-moss-700 text-white hover:bg-moss-800" : "text-coffee-800",
        variant === "chip"
          ? cn(
              "z-10 h-8 min-w-8 rounded-full px-2.5 text-xs shadow-sm",
              !active && "bg-white/90 hover:bg-white",
            )
          : cn(
              "h-11 rounded-lg border px-4 text-sm",
              active ? "border-moss-700" : "border-coffee-300 bg-white hover:bg-coffee-50",
            ),
        className,
      )}
    >
      <Scale active={active} />
      <span aria-hidden="true">So sánh</span>
    </button>
  );
}
