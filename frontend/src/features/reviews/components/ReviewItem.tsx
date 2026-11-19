import { formatDate } from "@/lib/format";
import type { Review } from "@/types/review";
import { Stars } from "./Stars";

/** Nội dung là văn bản thuần: React tự escape, whitespace-pre-line giữ xuống dòng. */
export function ReviewContent({ text }: { text: string }) {
  if (!text.trim()) return null;
  return <p className="whitespace-pre-line break-words text-coffee-900">{text}</p>;
}

export function ReviewItem({ review }: { review: Review }) {
  return (
    <article className="space-y-2 rounded-2xl border border-coffee-200 bg-white p-4">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Stars rating={review.rating} />
        <span className="font-semibold text-coffee-900">{review.authorName}</span>
        {review.verifiedPurchase ? (
          <span className="rounded-md bg-moss-50 px-2 py-0.5 text-xs font-semibold text-moss-800">
            Đã mua hàng
          </span>
        ) : null}
        <time dateTime={review.createdAt} className="text-sm text-coffee-600 sm:ml-auto">
          {formatDate(review.createdAt)}
        </time>
      </header>
      <ReviewContent text={review.content} />
      {review.reply ? (
        <div className="rounded-xl bg-cream-100 p-3 text-sm">
          <p className="font-semibold text-coffee-900">
            Phản hồi từ BeanBox
            {review.repliedAt ? (
              <span className="ml-2 font-normal text-coffee-600">
                {formatDate(review.repliedAt)}
              </span>
            ) : null}
          </p>
          <p className="mt-1 whitespace-pre-line break-words text-coffee-800">{review.reply}</p>
        </div>
      ) : null}
    </article>
  );
}
