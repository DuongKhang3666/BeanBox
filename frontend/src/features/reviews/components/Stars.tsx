import { cn } from "@/lib/cn";

/** Hàng sao chỉ để xem; đọc cho trình đọc màn hình là "N trên 5 sao". */
export function Stars({ rating, className }: { rating: number; className?: string }) {
  const full = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <span className={cn("inline-flex items-center", className)}>
      <span aria-hidden="true" className="tracking-wider text-amber-600">
        {"★".repeat(full)}
        <span className="text-coffee-300">{"★".repeat(5 - full)}</span>
      </span>
      <span className="sr-only">{rating} trên 5 sao</span>
    </span>
  );
}
