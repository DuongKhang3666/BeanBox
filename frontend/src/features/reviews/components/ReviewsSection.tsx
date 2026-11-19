"use client";

import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import type { Review, ReviewSort, ReviewSummary, ReviewsMeta } from "@/types/review";
import { listReviews } from "../api";
import { ReviewComposer } from "./ReviewComposer";
import { ReviewItem } from "./ReviewItem";
import { ReviewSummaryPanel } from "./ReviewSummaryPanel";

const SORTS: Array<{ value: ReviewSort; label: string }> = [
  { value: "newest", label: "Mới nhất" },
  { value: "highest", label: "Điểm cao" },
  { value: "lowest", label: "Điểm thấp" },
];

interface Loaded {
  key: string;
  ok: boolean;
  items: Review[];
  meta: ReviewsMeta | null;
}

interface More {
  key: string;
  items: Review[];
  page: number;
  failed: boolean;
}

interface Props {
  slug: string;
  productName: string;
}

export function ReviewsSection({ slug, productName }: Props) {
  const sortId = useId();
  const [rating, setRating] = useState<number | null>(null);
  const [sort, setSort] = useState<ReviewSort>("newest");
  const [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [more, setMore] = useState<More | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const key = JSON.stringify({ slug, rating, sort, version });

  useEffect(() => {
    let cancelled = false;
    listReviews(slug, { rating, sort, page: 1 }).then(
      (res) => {
        if (cancelled) return;
        setLoaded({ key, ok: true, items: res.data, meta: res.meta });
        setSummary(res.meta.summary);
      },
      () => {
        if (!cancelled) setLoaded({ key, ok: false, items: [], meta: null });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key, slug, rating, sort]);

  const current = loaded && loaded.key === key ? loaded : null;
  const extra = more && more.key === key ? more : null;
  const items = current ? [...current.items, ...(extra?.items ?? [])] : [];
  const lastPage = extra?.page ?? 1;
  const totalPages = current?.meta?.totalPages ?? 1;
  const hasMore = lastPage < totalPages;

  async function loadMore() {
    if (!current || loadingMore) return;
    setLoadingMore(true);
    const next = lastPage + 1;
    try {
      const res = await listReviews(slug, { rating, sort, page: next });
      setMore((prev) => {
        const base = prev && prev.key === key ? prev.items : [];
        const seen = new Set([...current.items, ...base].map((r) => r.id));
        return {
          key,
          page: next,
          failed: false,
          items: [...base, ...res.data.filter((r) => !seen.has(r.id))],
        };
      });
    } catch {
      setMore((prev) => ({
        key,
        page: lastPage,
        items: prev && prev.key === key ? prev.items : [],
        failed: true,
      }));
    } finally {
      setLoadingMore(false);
    }
  }

  const reload = () => {
    setMore(null);
    setVersion((v) => v + 1);
  };

  const hasReviews = (summary?.ratingCount ?? 0) > 0;

  return (
    <section id="danh-gia" aria-labelledby="reviews-heading" className="scroll-mt-24 space-y-4">
      <h2 id="reviews-heading" className="font-serif text-2xl font-semibold text-coffee-900">
        Đánh giá
      </h2>

      {summary && hasReviews ? (
        <ReviewSummaryPanel
          summary={summary}
          activeRating={rating}
          onSelectRating={(r) => {
            setMore(null);
            setRating(r);
          }}
        />
      ) : null}

      <ReviewComposer slug={slug} productName={productName} onChanged={reload} />

      {!current ? (
        <div role="status" aria-busy="true" aria-label="Đang tải đánh giá" className="space-y-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : null}

      {current && !current.ok ? (
        <ErrorState
          title="Chưa tải được đánh giá"
          description="Vui lòng thử lại sau ít phút."
          onRetry={reload}
        />
      ) : null}

      {current?.ok && !hasReviews ? (
        <p className="rounded-2xl border border-dashed border-coffee-300 bg-cream-50 px-6 py-8 text-center text-coffee-700">
          Chưa có đánh giá
        </p>
      ) : null}

      {current?.ok && hasReviews ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-coffee-700" aria-live="polite">
              {rating ? `Đang lọc ${rating} sao: ${current.meta?.total ?? 0} đánh giá` : null}
            </p>
            <div className="flex items-center gap-2">
              <label htmlFor={sortId} className="text-sm font-medium text-coffee-900">
                Sắp xếp
              </label>
              <select
                id={sortId}
                value={sort}
                onChange={(e) => {
                  setMore(null);
                  setSort(e.target.value as ReviewSort);
                }}
                className="h-11 rounded-lg border border-coffee-400 bg-white px-3 text-base text-coffee-900 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-moss-600"
              >
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-coffee-300 bg-cream-50 px-6 py-8 text-center">
              <p className="text-coffee-700">Chưa có đánh giá {rating} sao nào.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setRating(null)}>
                Xem tất cả đánh giá
              </Button>
            </div>
          ) : (
            <ul className="space-y-3">
              {items.map((r) => (
                <li key={r.id}>
                  <ReviewItem review={r} />
                </li>
              ))}
            </ul>
          )}

          {extra?.failed ? (
            <p role="alert" className="text-sm text-danger-600">
              Chưa tải thêm được đánh giá. Vui lòng thử lại.
            </p>
          ) : null}
          {hasMore ? (
            <div className="text-center">
              <Button variant="outline" onClick={loadMore} loading={loadingMore}>
                Xem thêm đánh giá
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
