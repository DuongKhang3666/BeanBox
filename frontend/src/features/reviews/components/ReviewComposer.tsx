"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/features/auth/AuthProvider";
import { useResource } from "@/features/orders/useResource";
import { formatDate } from "@/lib/format";
import type { MyReviewState } from "@/types/review";
import { createReview, getMyReview, updateReview } from "../api";
import {
  NOT_PURCHASED_MESSAGE,
  isReviewStateError,
  reviewErrorMessage,
  type ReviewFormValues,
} from "../messages";
import { ReviewContent } from "./ReviewItem";
import { ReviewForm } from "./ReviewForm";
import { Stars } from "./Stars";

interface Props {
  slug: string;
  productName: string;
  /** Gọi sau khi tạo/sửa thành công để làm mới tóm tắt và danh sách công khai. */
  onChanged: () => void;
}

const box = "rounded-2xl border border-coffee-200 bg-cream-50 p-4 sm:p-6";

export function ReviewComposer({ slug, productName, onChanged }: Props) {
  const { status } = useAuth();
  const pathname = usePathname();
  const mine = useResource<MyReviewState>(status === "authenticated" ? slug : null, getMyReview);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (status === "loading") {
    return <Skeleton className="h-24 w-full" />;
  }

  if (status === "anonymous") {
    return (
      <div className={box}>
        <p className="mb-3 text-coffee-800">Hãy đăng nhập để chia sẻ đánh giá về sản phẩm này.</p>
        <ButtonLink href={`/dang-nhap?next=${encodeURIComponent(`${pathname}#danh-gia`)}`}>
          Đăng nhập để đánh giá
        </ButtonLink>
      </div>
    );
  }

  if (mine.status === "error") {
    return (
      <div className={box} role="alert">
        <p className="mb-3 text-coffee-800">Chưa kiểm tra được quyền đánh giá của bạn.</p>
        <Button variant="secondary" onClick={mine.retry}>
          Thử lại
        </Button>
      </div>
    );
  }

  const state = mine.data;
  if (!state) {
    return (
      <div className={box} role="status" aria-busy="true" aria-label="Đang kiểm tra quyền đánh giá">
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  /** Gửi/sửa: lỗi 409 làm đổi quyền thì tải lại trạng thái và giữ thông báo ở ngoài form. */
  async function handle(run: () => Promise<unknown>): Promise<string | null> {
    setNotice(null);
    try {
      await run();
    } catch (err) {
      const message = reviewErrorMessage(err);
      if (isReviewStateError(err)) {
        setEditing(false);
        setNotice(message);
        mine.retry();
        return null;
      }
      return message;
    }
    setEditing(false);
    // Lấy lại trạng thái chuẩn từ server (review, canEdit) rồi làm mới danh sách công khai.
    mine.retry();
    onChanged();
    return null;
  }

  const noticeEl = notice ? (
    <p role="alert" className="mb-3 rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-600">
      {notice}
    </p>
  ) : null;

  if (state.review) {
    const r = state.review;
    if (editing && state.canEdit) {
      return (
        <div className={box}>
          <h3 className="mb-3 font-semibold text-coffee-900">Sửa đánh giá của bạn</h3>
          <ReviewForm
            initial={{ rating: r.rating, content: r.content }}
            submitLabel="Lưu thay đổi"
            onSubmit={(v: ReviewFormValues) => handle(() => updateReview(r.id, v))}
            onCancel={() => setEditing(false)}
          />
        </div>
      );
    }
    return (
      <div className={box}>
        {noticeEl}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="font-semibold text-coffee-900">Đánh giá của bạn</h3>
          <Stars rating={r.rating} />
          <time dateTime={r.createdAt} className="text-sm text-coffee-600">
            {formatDate(r.createdAt)}
          </time>
          {r.status === "HIDDEN" ? (
            <span className="rounded-md bg-coffee-800 px-2 py-0.5 text-xs font-semibold text-cream-50">
              Đang bị ẩn
            </span>
          ) : null}
        </div>
        {r.status === "HIDDEN" ? (
          <p className="mt-2 text-sm text-coffee-700">
            Đánh giá này hiện chưa hiển thị công khai và không tính vào điểm của sản phẩm.
          </p>
        ) : null}
        <div className="mt-2">
          <ReviewContent text={r.content} />
        </div>
        {r.reply ? (
          <p className="mt-2 rounded-xl bg-cream-100 p-3 text-sm text-coffee-800">
            <span className="font-semibold">Phản hồi từ BeanBox: </span>
            <span className="whitespace-pre-line break-words">{r.reply}</span>
          </p>
        ) : null}
        {state.canEdit ? (
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setEditing(true)}>
            Sửa đánh giá
          </Button>
        ) : (
          <p className="mt-3 text-sm text-coffee-600">
            Đã quá 30 ngày nên bạn không thể sửa đánh giá này nữa.
          </p>
        )}
      </div>
    );
  }

  if (!state.canReview) {
    return (
      <div className={box}>
        {noticeEl}
        <p className="text-coffee-800">
          {state.reason === "NOT_PURCHASED" || !state.reason
            ? NOT_PURCHASED_MESSAGE
            : "Bạn đã đánh giá sản phẩm này rồi."}
        </p>
      </div>
    );
  }

  return (
    <div className={box}>
      {noticeEl}
      <h3 className="mb-3 font-semibold text-coffee-900">Viết đánh giá cho {productName}</h3>
      <ReviewForm
        submitLabel="Gửi đánh giá"
        onSubmit={(v) => handle(() => createReview(slug, v))}
      />
    </div>
  );
}
