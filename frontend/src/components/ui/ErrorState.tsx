import { Button } from "./Button";

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  /** Cấp heading của tiêu đề: 3 khi nằm trong một khối đã có h2 (không nhảy cấp). */
  headingLevel?: 2 | 3;
}

export function ErrorState({
  title = "Đã có lỗi xảy ra",
  description = "Chúng tôi chưa thể tải nội dung này. Vui lòng thử lại sau ít phút.",
  onRetry,
  retryLabel = "Thử lại",
  headingLevel = 2,
}: ErrorStateProps) {
  const Heading = headingLevel === 3 ? "h3" : "h2";
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-2xl border border-danger-600/30 bg-danger-50 px-6 py-12 text-center"
    >
      <Heading className="font-serif text-xl font-semibold text-coffee-900">{title}</Heading>
      <p className="max-w-md text-coffee-800">{description}</p>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry} className="mt-2">
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
