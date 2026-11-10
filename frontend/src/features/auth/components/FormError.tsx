import { cn } from "@/lib/cn";

/** Lỗi chung của form. Luôn render vùng role="alert" khi có nội dung. */
export function FormError({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  if (!children) return null;
  return (
    <div
      role="alert"
      className={cn(
        "rounded-lg border border-danger-600/40 bg-danger-50 px-3 py-2 text-sm text-danger-600",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function FormNotice({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  if (!children) return null;
  return (
    <div
      role="status"
      className={cn(
        "rounded-lg border border-moss-600/40 bg-moss-50 px-3 py-2 text-sm text-moss-800",
        className,
      )}
    >
      {children}
    </div>
  );
}
