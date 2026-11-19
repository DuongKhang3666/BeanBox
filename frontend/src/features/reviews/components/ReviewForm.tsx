"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FieldError, Label } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import {
  REVIEW_MAX_LENGTH,
  validateReview,
  type ReviewFormErrors,
  type ReviewFormValues,
} from "../messages";

interface Props {
  initial?: ReviewFormValues;
  submitLabel: string;
  /** Trả về thông báo lỗi (hiển thị trong form) hoặc null nếu thành công. */
  onSubmit: (values: ReviewFormValues) => Promise<string | null>;
  onCancel?: () => void;
}

const STAR_WORDS = ["Rất tệ", "Tệ", "Bình thường", "Tốt", "Rất tốt"];

export function ReviewForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const uid = useId();
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [content, setContent] = useState(initial?.content ?? "");
  const [errors, setErrors] = useState<ReviewFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const contentId = `${uid}-content`;
  const counterId = `${uid}-counter`;
  const contentErrId = `${uid}-content-err`;
  const ratingErrId = `${uid}-rating-err`;
  const over = content.length > REVIEW_MAX_LENGTH;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const found = validateReview({ rating, content });
    setErrors(found);
    setFormError(null);
    if (found.rating || found.content) return;
    setBusy(true);
    try {
      const message = await onSubmit({ rating, content: content.trim() });
      if (message) setFormError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label="Viết đánh giá">
      <fieldset role="radiogroup" aria-describedby={errors.rating ? ratingErrId : undefined}>
        <legend className="mb-1.5 text-sm font-medium text-coffee-900">
          Điểm đánh giá <span aria-hidden="true">*</span>
        </legend>
        <div className="flex flex-wrap items-center gap-1">
          {[1, 2, 3, 4, 5].map((value) => (
            <span key={value} className="relative">
              <input
                type="radio"
                id={`${uid}-star-${value}`}
                name={`${uid}-rating`}
                value={value}
                checked={rating === value}
                onChange={() => setRating(value)}
                className="peer sr-only"
              />
              <label
                htmlFor={`${uid}-star-${value}`}
                className={cn(
                  "flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-3xl leading-none",
                  "peer-focus-visible:outline-3 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-moss-600",
                  value <= rating ? "text-amber-600" : "text-coffee-300 hover:text-amber-600",
                )}
              >
                <span aria-hidden="true">★</span>
                <span className="sr-only">
                  {value} sao - {STAR_WORDS[value - 1]}
                </span>
              </label>
            </span>
          ))}
          {rating > 0 ? (
            <span aria-hidden="true" className="ml-2 text-sm text-coffee-700">
              {STAR_WORDS[rating - 1]}
            </span>
          ) : null}
        </div>
        <FieldError id={ratingErrId}>{errors.rating}</FieldError>
      </fieldset>

      <div>
        <Label htmlFor={contentId}>Nội dung (không bắt buộc)</Label>
        <textarea
          id={contentId}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          placeholder="Chia sẻ trải nghiệm của bạn: hương vị, cách pha, chất lượng sản phẩm..."
          aria-invalid={errors.content || over ? true : undefined}
          aria-describedby={cn(counterId, errors.content && contentErrId)}
          className={cn(
            "w-full rounded-lg border bg-white px-3 py-2 text-base text-coffee-900",
            "placeholder:text-coffee-600/70 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-moss-600",
            errors.content || over ? "border-danger-600" : "border-coffee-400",
          )}
        />
        <p
          id={counterId}
          className={cn("mt-1 text-right text-xs", over ? "text-danger-600" : "text-coffee-600")}
        >
          {content.length}/{REVIEW_MAX_LENGTH}
        </p>
        <FieldError id={contentErrId}>{errors.content}</FieldError>
      </div>

      {formError ? (
        <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-600">
          {formError}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={busy}>
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Hủy
          </Button>
        ) : null}
      </div>
    </form>
  );
}
