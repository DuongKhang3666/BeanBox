import { cn } from "@/lib/cn";

interface SpinnerProps {
  className?: string;
  /** Nhãn đọc cho trình đọc màn hình. Truyền chuỗi rỗng nếu spinner chỉ trang trí. */
  label?: string;
}

export function Spinner({ className, label = "Đang tải" }: SpinnerProps) {
  return (
    <span
      role={label ? "status" : undefined}
      aria-hidden={label ? undefined : true}
      className={cn("inline-flex items-center", className)}
    >
      <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25" />
        <path
          d="M22 12a10 10 0 0 0-10-10"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
