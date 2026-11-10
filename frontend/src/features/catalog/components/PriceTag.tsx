import { cn } from "@/lib/cn";
import { formatVND } from "@/lib/format";

/** Phần trăm giảm giá, làm tròn xuống. 0 nếu không giảm. */
export function discountPercent(price: number, compareAt: number | null | undefined): number {
  if (!compareAt || compareAt <= price || compareAt <= 0) return 0;
  return Math.floor(((compareAt - price) / compareAt) * 100);
}

interface PriceTagProps {
  price: number;
  compareAtPrice?: number | null;
  size?: "sm" | "lg";
  className?: string;
}

export function PriceTag({ price, compareAtPrice, size = "sm", className }: PriceTagProps) {
  const percent = discountPercent(price, compareAtPrice);
  const onSale = percent > 0 && compareAtPrice != null;
  return (
    <p className={cn("flex flex-wrap items-baseline gap-x-2 gap-y-0.5", className)}>
      <span
        className={cn(
          "font-semibold",
          onSale ? "text-danger-600" : "text-coffee-900",
          size === "lg" ? "text-2xl" : "text-base",
        )}
      >
        {formatVND(price)}
      </span>
      {onSale ? (
        <>
          <span className="sr-only">Giá gốc</span>
          <del className={cn("text-coffee-600", size === "lg" ? "text-base" : "text-sm")}>
            {formatVND(compareAtPrice)}
          </del>
          <span className="rounded bg-danger-50 px-1.5 py-0.5 text-xs font-semibold text-danger-600">
            -{percent}%
          </span>
        </>
      ) : null}
    </p>
  );
}
