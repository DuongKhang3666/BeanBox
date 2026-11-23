import { cn } from "@/lib/cn";
import { isAllowedAvatarUrl } from "../avatar";

/** Chữ cái đầu của tên (chữ cuối cùng trong họ tên theo cách gọi tên người Việt), in hoa. */
export function avatarInitial(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const last = parts[parts.length - 1] ?? "";
  return last.charAt(0).toLocaleUpperCase("vi-VN") || "?";
}

/**
 * Ảnh đại diện (D-081): chỉ render `<img>` khi URL qua allowlist; dữ liệu cũ không hợp lệ (không bị
 * xóa khỏi DB) hay chưa có ảnh thì hiện chữ cái đầu.
 */
export function Avatar({
  fullName,
  url,
  className,
}: {
  fullName: string;
  url: string | null | undefined;
  className?: string;
}) {
  const base =
    "inline-flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-moss-100 text-2xl font-semibold text-moss-800";
  if (isAllowedAvatarUrl(url)) {
    return (
      <span className={cn(base, className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url!}
          alt={`Ảnh đại diện của ${fullName}`}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
        />
      </span>
    );
  }
  return (
    <span className={cn(base, className)} role="img" aria-label={`Ảnh đại diện của ${fullName}`}>
      <span aria-hidden="true">{avatarInitial(fullName)}</span>
    </span>
  );
}
