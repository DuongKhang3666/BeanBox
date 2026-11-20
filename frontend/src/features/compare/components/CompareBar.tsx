"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ProductImage } from "@/features/catalog/components/ProductImage";
import { buildCompareHref } from "../url";
import { useCompare, useCompareNotice } from "../useCompare";
import { COMPARE_MAX } from "../store";

const HIDDEN_PREFIXES = ["/so-sanh", "/thanh-toan", "/admin"];

export function isCompareBarHidden(pathname: string | null): boolean {
  if (!pathname) return false;
  return HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

const linkBase =
  "inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-medium focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-moss-600";

export function CompareBar() {
  const pathname = usePathname();
  const { items, remove, clear } = useCompare();
  const notice = useCompareNotice();
  const hidden = isCompareBarHidden(pathname) || items.length === 0;
  const canCompare = items.length >= 2;

  if (hidden) return null;

  return (
    <>
      {/* Khoảng đệm trong luồng trang để thanh cố định không che footer/nội dung cuối. */}
      <div aria-hidden="true" className="h-36 sm:h-24" />
      <aside
        aria-label="So sánh sản phẩm"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-coffee-200 bg-cream-50/95 shadow-[0_-4px_12px_rgba(67,46,31,0.12)] backdrop-blur"
      >
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:gap-4 sm:px-6">
          <ul className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
            {items.map((e) => (
              <li
                key={e.slug}
                className="flex min-w-0 shrink-0 items-center gap-2 rounded-lg border border-coffee-200 bg-white py-1 pl-1 pr-1"
              >
                <div aria-hidden="true" className="h-8 w-8 shrink-0">
                  <ProductImage
                    src={e.imageUrl}
                    name={e.name}
                    sizes="32px"
                    className="h-8 w-8 rounded"
                  />
                </div>
                <span className="max-w-24 truncate text-xs text-coffee-900 sm:max-w-40 sm:text-sm">
                  {e.name}
                </span>
                <button
                  type="button"
                  onClick={() => remove(e.slug)}
                  aria-label={`Bỏ ${e.name} khỏi so sánh`}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-coffee-700 hover:bg-coffee-100 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-moss-600"
                >
                  <span aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={clear}
              className={`${linkBase} border border-coffee-300 bg-white text-coffee-800 hover:bg-coffee-50`}
            >
              Xóa tất cả
            </button>
            {canCompare ? (
              <Link
                href={buildCompareHref(items.map((e) => e.slug))}
                className={`${linkBase} bg-moss-700 text-white hover:bg-moss-800`}
              >
                So sánh ({items.length})
              </Link>
            ) : (
              <span
                aria-disabled="true"
                className={`${linkBase} cursor-not-allowed bg-coffee-200 text-coffee-700`}
              >
                So sánh ({items.length})
              </span>
            )}
          </div>
          {!canCompare ? (
            <p className="text-xs text-coffee-700 sm:max-w-40">Chọn thêm ít nhất 1 sản phẩm</p>
          ) : null}
        </div>
        <p
          role="status"
          className={notice ? "px-3 pb-2 text-sm font-medium text-danger-600 sm:px-6" : "sr-only"}
        >
          {notice || `Đã chọn ${items.length} trên ${COMPARE_MAX} sản phẩm để so sánh`}
        </p>
      </aside>
    </>
  );
}
