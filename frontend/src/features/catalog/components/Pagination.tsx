import Link from "next/link";
import { cn } from "@/lib/cn";
import type { PaginationMeta } from "@/types/api";
import { buildHref, type ProductFilters } from "../filters";

/** Dãy trang hiển thị: luôn có trang đầu/cuối, cửa sổ ±1 quanh trang hiện tại; null = dấu "…". */
export function pageWindow(current: number, total: number): Array<number | null> {
  const pages = new Set<number>([1, total, current - 1, current, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: Array<number | null> = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - (sorted[i - 1] ?? 0) > 1) out.push(null);
    out.push(p);
  });
  return out;
}

const item =
  "inline-flex h-11 min-w-11 items-center justify-center rounded-lg border px-3 text-sm font-medium";

export function Pagination({
  pathname,
  filters,
  meta,
}: {
  pathname: string;
  filters: ProductFilters;
  meta: PaginationMeta;
}) {
  if (meta.totalPages <= 1) return null;
  const href = (page: number) => buildHref(pathname, { ...filters, page });
  const current = meta.page;

  return (
    <nav aria-label="Phân trang" className="mt-8">
      <ul className="flex flex-wrap items-center justify-center gap-2">
        {current > 1 ? (
          <li>
            <Link
              href={href(current - 1)}
              rel="prev"
              className={cn(item, "border-coffee-300 bg-white text-coffee-800 hover:bg-coffee-50")}
            >
              <span aria-hidden="true">←</span>
              <span className="sr-only">Trang trước</span>
            </Link>
          </li>
        ) : null}
        {pageWindow(current, meta.totalPages).map((p, i) =>
          p === null ? (
            <li key={`gap-${i}`} aria-hidden="true" className="px-1 text-coffee-600">
              …
            </li>
          ) : (
            <li key={p}>
              <Link
                href={href(p)}
                aria-current={p === current ? "page" : undefined}
                aria-label={`Trang ${p}`}
                className={cn(
                  item,
                  p === current
                    ? "border-moss-700 bg-moss-700 text-white"
                    : "border-coffee-300 bg-white text-coffee-800 hover:bg-coffee-50",
                )}
              >
                {p}
              </Link>
            </li>
          ),
        )}
        {current < meta.totalPages ? (
          <li>
            <Link
              href={href(current + 1)}
              rel="next"
              className={cn(item, "border-coffee-300 bg-white text-coffee-800 hover:bg-coffee-50")}
            >
              <span aria-hidden="true">→</span>
              <span className="sr-only">Trang sau</span>
            </Link>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}
