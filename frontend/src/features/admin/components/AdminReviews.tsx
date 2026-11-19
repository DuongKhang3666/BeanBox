"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { FieldError, Input, Label } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/features/account/components/ConfirmDialog";
import { FormError } from "@/features/auth/components/FormError";
import { useResource } from "@/features/orders/useResource";
import { cn } from "@/lib/cn";
import type { AdminReview, AdminReviewQuery } from "@/types/admin";
import type { PaginationMeta } from "@/types/api";
import {
  deleteReviewReply,
  listAdminReviews,
  replyToReview,
  setReviewStatus,
} from "../api/reviews";
import { adminErrorMessage, fieldErrorsOf } from "../errors";
import { formatVnDateTime } from "../format";
import { ADMIN_PAGE_SIZE } from "../orderFilters";
import { PRODUCTS_BASE } from "../productFilters";
import { REVIEW_STATUS_LABEL, parseReviewFilters, reviewsHref } from "../reviewFilters";
import { AdminModal } from "./AdminModal";
import { AdminPager } from "./AdminPager";
import { useDebouncedUrlInput } from "../useDebouncedUrlInput";

type Loaded = { data: AdminReview[]; meta: PaginationMeta };

export const REPLY_MAX = 1000;

const load = (key: string) =>
  listAdminReviews({ ...(JSON.parse(key) as AdminReviewQuery), pageSize: ADMIN_PAGE_SIZE });

const selectClass =
  "h-11 w-full rounded-lg border border-coffee-400 bg-white px-3 text-base text-coffee-900 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-moss-600";

function ListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Đang tải đánh giá" role="status" className="space-y-3">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-32 w-full" />
      ))}
    </div>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <span role="img" aria-label={`${rating} trên 5 sao`} className="text-amber-600">
      <span aria-hidden="true">
        {"★".repeat(rating)}
        <span className="text-coffee-300">{"★".repeat(5 - rating)}</span>
      </span>
    </span>
  );
}

function ReplyDialog({
  review,
  onSaved,
  onClose,
}: {
  review: AdminReview;
  onSaved: (r: AdminReview) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(review.reply ?? "");
  const [error, setError] = useState<string | undefined>();
  const [general, setGeneral] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (busyRef.current) return;
    const t = text.trim();
    setGeneral(null);
    if (t.length < 1 || t.length > REPLY_MAX) {
      setError(`Nội dung trả lời bắt buộc, tối đa ${REPLY_MAX} ký tự.`);
      return;
    }
    setError(undefined);
    busyRef.current = true;
    setBusy(true);
    try {
      onSaved(await replyToReview(review.id, t));
    } catch (err) {
      const fe = fieldErrorsOf(err);
      if (fe.reply) setError(fe.reply);
      else setGeneral(adminErrorMessage(err));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <AdminModal
      title={review.reply ? "Sửa trả lời" : "Trả lời đánh giá"}
      description={`${review.product.name} · ${review.author.fullName}`}
      busy={busy}
      onClose={onClose}
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div>
          <Label htmlFor="rv-reply">Nội dung trả lời</Label>
          <textarea
            id="rv-reply"
            data-autofocus
            rows={4}
            value={text}
            maxLength={REPLY_MAX}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "rv-reply-err" : undefined}
            onChange={(e) => setText(e.target.value)}
            className="w-full rounded-lg border border-coffee-400 bg-white px-3 py-2 text-base text-coffee-900 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-moss-600"
          />
          <p className="mt-1 text-xs text-coffee-700">
            {text.length}/{REPLY_MAX} ký tự. Câu trả lời hiển thị công khai dưới đánh giá.
          </p>
          <FieldError id="rv-reply-err">{error}</FieldError>
        </div>
        <FormError>{general}</FormError>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Đóng
          </Button>
          <Button type="submit" loading={busy}>
            Gửi trả lời
          </Button>
        </div>
      </form>
    </AdminModal>
  );
}

function ReviewRow({
  review,
  onChange,
  onAnnounce,
}: {
  review: AdminReview;
  onChange: (r: AdminReview) => void;
  onAnnounce: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replying, setReplying] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const hidden = review.status === "HIDDEN";

  async function run(fn: () => Promise<AdminReview>, done: string) {
    setBusy(true);
    setError(null);
    try {
      onChange(await fn());
      onAnnounce(done);
    } catch (err) {
      setError(adminErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteReply() {
    await run(() => deleteReviewReply(review.id), "Đã xóa trả lời.");
    setConfirmDelete(false);
  }

  const who = review.author.fullName;

  return (
    <li className="space-y-3 rounded-2xl border border-coffee-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`${PRODUCTS_BASE}/${review.product.id}`}
            className="font-medium break-words text-moss-800 underline underline-offset-2"
          >
            {review.product.name}
          </Link>
          <p className="text-sm break-words text-coffee-800">
            {who} · <span className="break-all">{review.author.email}</span>
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center rounded-full px-3 py-1 text-sm font-medium",
            hidden ? "bg-coffee-100 text-coffee-800" : "bg-moss-50 text-moss-800",
          )}
        >
          {REVIEW_STATUS_LABEL[review.status] ?? review.status}
        </span>
      </div>
      <p className="flex flex-wrap items-center gap-2 text-sm text-coffee-700">
        <Stars rating={review.rating} />
        <span>{formatVnDateTime(review.createdAt)}</span>
      </p>
      {review.content ? (
        <p className="text-sm break-words whitespace-pre-line text-coffee-900">{review.content}</p>
      ) : (
        <p className="text-sm text-coffee-700 italic">Không có nội dung.</p>
      )}
      {review.reply ? (
        <div className="rounded-lg bg-cream-100 px-3 py-2 text-sm">
          <p className="font-medium text-coffee-900">
            Phản hồi của cửa hàng
            {review.repliedAt ? (
              <span className="font-normal text-coffee-700">
                {" "}
                · {formatVnDateTime(review.repliedAt)}
              </span>
            ) : null}
          </p>
          <p className="break-words whitespace-pre-line text-coffee-900">{review.reply}</p>
        </div>
      ) : null}
      <FormError>{error}</FormError>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          aria-label={`${hidden ? "Hiện" : "Ẩn"} đánh giá của ${who}`}
          onClick={() =>
            run(
              () => setReviewStatus(review.id, hidden ? "PUBLISHED" : "HIDDEN"),
              hidden ? "Đã hiện đánh giá." : "Đã ẩn đánh giá.",
            )
          }
        >
          {hidden ? "Hiện" : "Ẩn"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          aria-label={`${review.reply ? "Sửa trả lời" : "Trả lời"} đánh giá của ${who}`}
          onClick={() => setReplying(true)}
        >
          {review.reply ? "Sửa trả lời" : "Trả lời"}
        </Button>
        {review.reply ? (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            aria-label={`Xóa trả lời đánh giá của ${who}`}
            onClick={() => setConfirmDelete(true)}
          >
            Xóa trả lời
          </Button>
        ) : null}
      </div>
      {replying ? (
        <ReplyDialog
          review={review}
          onClose={() => setReplying(false)}
          onSaved={(r) => {
            onChange(r);
            onAnnounce("Đã lưu trả lời.");
            setReplying(false);
          }}
        />
      ) : null}
      {confirmDelete ? (
        <ConfirmDialog
          title="Xóa trả lời"
          description="Câu trả lời của cửa hàng sẽ bị gỡ khỏi đánh giá này."
          confirmLabel="Xóa trả lời"
          busy={busy}
          onConfirm={onDeleteReply}
          onCancel={() => setConfirmDelete(false)}
        />
      ) : null}
    </li>
  );
}

export function AdminReviews() {
  const router = useRouter();
  const params = useSearchParams();
  const paramsKey = params.toString();
  const filters = useMemo(() => parseReviewFilters(new URLSearchParams(paramsKey)), [paramsKey]);
  const urlQ = filters.q ?? "";
  const [qInput, setQInput] = useState(urlQ);
  const [announce, setAnnounce] = useState("");

  useDebouncedUrlInput(qInput, urlQ, (v) =>
    router.replace(reviewsHref({ ...filters, q: v, page: undefined })),
  );

  const res = useResource<Loaded>(JSON.stringify(filters), load);
  const { setData } = res;
  const current = res.data;

  function apply(patch: Partial<AdminReviewQuery>) {
    router.replace(reviewsHref({ ...filters, ...patch, page: undefined }));
  }

  function replaceRow(updated: AdminReview) {
    if (!current) return;
    setData({ ...current, data: current.data.map((r) => (r.id === updated.id ? updated : r)) });
  }

  const filtered = Object.keys(filters).some((k) => k !== "page");

  let body: React.ReactNode;
  if (res.status === "loading" || res.status === "idle") body = <ListSkeleton />;
  else if (res.status === "error") {
    body = (
      <ErrorState
        title="Không tải được đánh giá"
        description={adminErrorMessage(res.error)}
        onRetry={res.retry}
      />
    );
  } else if (res.data!.data.length === 0) {
    body = (
      <EmptyState
        title="Không có đánh giá nào"
        description={
          filtered ? "Không có đánh giá nào khớp bộ lọc hiện tại." : "Chưa có đánh giá nào."
        }
        action={
          filtered ? (
            <Link href={reviewsHref({})} className={buttonClasses("outline")}>
              Xóa bộ lọc
            </Link>
          ) : undefined
        }
      />
    );
  } else {
    const { data, meta } = res.data!;
    body = (
      <>
        <p className="mb-3 text-sm text-coffee-700">{meta.total} đánh giá</p>
        <ul className="space-y-3">
          {data.map((r) => (
            <ReviewRow key={r.id} review={r} onChange={replaceRow} onAnnounce={setAnnounce} />
          ))}
        </ul>
        <AdminPager
          page={meta.page}
          totalPages={meta.totalPages}
          hrefFor={(p) => reviewsHref({ ...filters, page: p })}
        />
      </>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="font-serif text-2xl font-bold text-coffee-900">Đánh giá sản phẩm</h1>

      <form
        role="search"
        aria-label="Bộ lọc đánh giá"
        onSubmit={(e) => e.preventDefault()}
        className="grid gap-3 rounded-2xl border border-coffee-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {filters.productId ? (
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-3">
            <span className="rounded-full bg-cream-200 px-3 py-1 text-sm text-coffee-900">
              Đang lọc theo một sản phẩm
            </span>
            <Link
              href={reviewsHref({ ...filters, productId: undefined, page: undefined })}
              className="text-sm font-medium text-moss-800 underline"
            >
              Bỏ lọc này
            </Link>
          </div>
        ) : null}
        <div className="sm:col-span-2 lg:col-span-3">
          <Label htmlFor="rv-q">Tìm trong nội dung</Label>
          <Input
            id="rv-q"
            type="search"
            value={qInput}
            maxLength={100}
            autoComplete="off"
            onChange={(e) => setQInput(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="rv-status">Trạng thái</Label>
          <select
            id="rv-status"
            className={selectClass}
            value={filters.status ?? ""}
            onChange={(e) =>
              apply({ status: (e.target.value || undefined) as AdminReviewQuery["status"] })
            }
          >
            <option value="">Tất cả</option>
            <option value="PUBLISHED">{REVIEW_STATUS_LABEL.PUBLISHED}</option>
            <option value="HIDDEN">{REVIEW_STATUS_LABEL.HIDDEN}</option>
          </select>
        </div>
        <div>
          <Label htmlFor="rv-rating">Số sao</Label>
          <select
            id="rv-rating"
            className={selectClass}
            value={filters.rating ?? ""}
            onChange={(e) => apply({ rating: e.target.value ? Number(e.target.value) : undefined })}
          >
            <option value="">Tất cả</option>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {n} sao
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="rv-reply-filter">Phản hồi</Label>
          <select
            id="rv-reply-filter"
            className={selectClass}
            value={filters.hasReply === undefined ? "" : String(filters.hasReply)}
            onChange={(e) =>
              apply({ hasReply: e.target.value === "" ? undefined : e.target.value === "true" })
            }
          >
            <option value="">Tất cả</option>
            <option value="true">Đã trả lời</option>
            <option value="false">Chưa trả lời</option>
          </select>
        </div>
      </form>

      <p role="status" aria-live="polite" className="min-h-5 text-sm text-moss-800">
        {announce}
      </p>

      {body}
    </div>
  );
}
