"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useResource } from "@/features/orders/useResource";
import type { CompareResult } from "@/types/catalog";
import { fetchCompare } from "../api";
import { COMPARE_MAX, removeFromCompare, removeManyFromCompare } from "../store";
import { buildCompareHref, parseSpParam } from "../url";
import { useCompare, useHydrated } from "../useCompare";
import { CompareTable } from "./CompareTable";

const load = (key: string) => fetchCompare(key.split(","));
const CATALOG_HREF = "/danh-muc/ca-phe-hat";

function Guidance({ count }: { count: number }) {
  return (
    <EmptyState
      title={count === 0 ? "Chưa có sản phẩm để so sánh" : "Chọn thêm ít nhất 1 sản phẩm"}
      description={`Bấm nút "So sánh" trên thẻ sản phẩm để chọn từ 2 đến ${COMPARE_MAX} sản phẩm, rồi quay lại đây để xem bảng so sánh.`}
      action={<ButtonLink href={CATALOG_HREF}>Xem danh mục sản phẩm</ButtonLink>}
    />
  );
}

export function CompareView() {
  const router = useRouter();
  const params = useSearchParams();
  const hydrated = useHydrated();
  const { items: stored } = useCompare();
  const [onlyDiff, setOnlyDiff] = useState(false);

  const sp = params.get("sp");
  const slugs = useMemo(() => parseSpParam(sp), [sp]);
  const hasParam = sp !== null && sp !== "";

  // Không có ?sp= thì lấy từ danh sách đã chọn rồi chuyển sang URL chia sẻ được.
  useEffect(() => {
    if (!hydrated || hasParam || stored.length === 0) return;
    router.replace(buildCompareHref(stored.map((e) => e.slug)));
  }, [hydrated, hasParam, stored, router]);

  const key = hydrated && slugs.length >= 2 ? slugs.join(",") : null;
  const { status, data, retry } = useResource<CompareResult>(key, load);

  // Slug không còn bán/không tồn tại: tự bỏ khỏi danh sách đã chọn.
  const missingKey = data?.missing.join(",") ?? "";
  useEffect(() => {
    if (missingKey) removeManyFromCompare(missingKey.split(","));
  }, [missingKey]);

  const items = useMemo(() => data?.items ?? [], [data]);
  const categoryCount = new Set(items.map((p) => p.category.id)).size;

  function removeItem(slug: string) {
    removeFromCompare(slug);
    router.replace(buildCompareHref(slugs.filter((s) => s !== slug)));
  }

  let body;
  if (!hydrated || (!hasParam && stored.length > 0)) {
    body = <CompareLoading />;
  } else if (slugs.length < 2) {
    body = <Guidance count={slugs.length} />;
  } else if (status === "error") {
    return (
      <>
        <ErrorState
          title="Chưa tải được bảng so sánh"
          description="Vui lòng kiểm tra kết nối và thử lại."
          onRetry={retry}
        />
      </>
    );
  } else if (status !== "ready" || !data) {
    body = <CompareLoading />;
  } else {
    body = (
      <>
        {data.missing.length > 0 ? (
          <p
            role="status"
            className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-coffee-900"
          >
            {data.missing.length === 1
              ? "Có 1 sản phẩm không còn được bán hoặc không tồn tại, đã được bỏ khỏi danh sách so sánh."
              : `Có ${data.missing.length} sản phẩm không còn được bán hoặc không tồn tại, đã được bỏ khỏi danh sách so sánh.`}
          </p>
        ) : null}
        {items.length < 2 ? (
          <Guidance count={items.length} />
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium text-coffee-900">
                <input
                  type="checkbox"
                  checked={onlyDiff}
                  onChange={(e) => setOnlyDiff(e.target.checked)}
                  className="h-5 w-5 accent-moss-700"
                />
                Chỉ hiện điểm khác nhau
              </label>
            </div>
            {categoryCount > 1 ? (
              <p className="mb-4 rounded-lg bg-coffee-50 px-4 py-3 text-sm text-coffee-800">
                Các sản phẩm thuộc danh mục khác nhau, một số thông số có thể không tương đương.
              </p>
            ) : null}
            <CompareTable items={items} onlyDifferences={onlyDiff} onRemove={removeItem} />
          </>
        )}
      </>
    );
  }

  return <>{body}</>;
}

/** Giữ chiều cao gần bằng bảng thật để footer không bị đẩy xuống khi dữ liệu về (tránh CLS). */
export function CompareLoading() {
  return (
    <div role="status" aria-busy="true" className="min-h-[60rem] space-y-3">
      <span className="sr-only">Đang tải bảng so sánh</span>
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}
