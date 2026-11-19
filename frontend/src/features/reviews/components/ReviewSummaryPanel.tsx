import { cn } from "@/lib/cn";
import type { ReviewSummary } from "@/types/review";
import { Stars } from "./Stars";

interface Props {
  summary: ReviewSummary;
  /** Số sao đang lọc; null = tất cả. */
  activeRating: number | null;
  onSelectRating: (rating: number | null) => void;
}

/** Điểm trung bình + phân bố 5 -> 1 sao; bấm một hàng để lọc, bấm lại để bỏ lọc. */
export function ReviewSummaryPanel({ summary, activeRating, onSelectRating }: Props) {
  const total = summary.ratingCount;
  return (
    <div className="grid gap-4 rounded-2xl border border-coffee-200 bg-cream-50 p-4 sm:grid-cols-[10rem_1fr] sm:gap-8 sm:p-6">
      <div className="flex flex-col items-start gap-1">
        <p className="font-serif text-4xl font-bold text-coffee-900">
          {summary.ratingAvg.toFixed(1)}
          <span className="sr-only"> trên 5 sao</span>
        </p>
        <Stars rating={summary.ratingAvg} className="text-lg" />
        <p className="text-sm text-coffee-700">{total} đánh giá</p>
      </div>
      <ul aria-label="Phân bố đánh giá theo số sao" className="space-y-1">
        {[5, 4, 3, 2, 1].map((star) => {
          const count = summary.distribution[String(star)] ?? 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const active = activeRating === star;
          return (
            <li key={star}>
              <button
                type="button"
                aria-pressed={active}
                aria-label={`${star} sao: ${count} đánh giá. ${active ? "Bấm để bỏ lọc" : "Bấm để lọc"}`}
                onClick={() => onSelectRating(active ? null : star)}
                className={cn(
                  "flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-sm text-coffee-800",
                  "focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-moss-600",
                  active ? "bg-moss-50 ring-1 ring-moss-600" : "hover:bg-coffee-100",
                )}
              >
                <span aria-hidden="true" className="w-8 shrink-0 text-left font-medium">
                  {star} ★
                </span>
                <span
                  aria-hidden="true"
                  className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-coffee-200"
                >
                  <span
                    className="block h-full rounded-full bg-amber-600"
                    style={{ width: `${pct}%` }}
                  />
                </span>
                <span aria-hidden="true" className="w-8 shrink-0 text-right tabular-nums">
                  {count}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
