import Link from "next/link";
import { pageWindow } from "@/features/catalog/components/Pagination";
import { cn } from "@/lib/cn";

const item =
  "inline-flex h-11 min-w-11 items-center justify-center rounded-lg border px-3 text-sm font-medium";

/** Phân trang bằng link; hrefFor(page) giữ nguyên bộ lọc. */
export function AdminPager({
  page,
  totalPages,
  hrefFor,
}: {
  page: number;
  totalPages: number;
  hrefFor: (page: number) => string;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Phân trang" className="mt-6">
      <ul className="flex flex-wrap items-center justify-center gap-2">
        {pageWindow(page, totalPages).map((p, i) =>
          p === null ? (
            <li key={`gap-${i}`} aria-hidden="true" className="px-1 text-coffee-600">
              …
            </li>
          ) : (
            <li key={p}>
              <Link
                href={hrefFor(p)}
                aria-current={p === page ? "page" : undefined}
                aria-label={`Trang ${p}`}
                className={cn(
                  item,
                  p === page
                    ? "border-moss-700 bg-moss-700 text-white"
                    : "border-coffee-300 bg-white text-coffee-800 hover:bg-coffee-50",
                )}
              >
                {p}
              </Link>
            </li>
          ),
        )}
      </ul>
    </nav>
  );
}
