"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { useWishlist } from "../WishlistProvider";

const ADD = "Thêm vào yêu thích";
const REMOVE = "Bỏ khỏi yêu thích";

function Heart({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 21s-7.5-4.6-9.6-9.2C1 8.6 2.7 5 6.2 5c2 0 3.4 1.1 4.2 2.4h.2C11.4 6.1 12.8 5 14.8 5c3.5 0 5.2 3.6 3.8 6.8C19.5 16.4 12 21 12 21z" />
    </svg>
  );
}

interface Props {
  productId: string;
  /** "icon": nút tròn đặt trên ảnh thẻ sản phẩm; "labeled": nút có chữ ở trang chi tiết. */
  variant?: "icon" | "labeled";
  className?: string;
  /** Gọi sau khi server xác nhận (vd. trang yêu thích gỡ thẻ khi bỏ tim). */
  onToggled?: (wished: boolean) => void;
}

export function WishlistButton({ productId, variant = "icon", className, onToggled }: Props) {
  const { authStatus, isWished, isPending, toggle } = useWishlist();
  const router = useRouter();
  const wished = authStatus === "authenticated" && isWished(productId);
  const label = wished ? REMOVE : ADD;

  async function onClick() {
    if (authStatus === "loading") return;
    if (authStatus === "anonymous") {
      const here = `${window.location.pathname}${window.location.search}`;
      router.push(`/dang-nhap?next=${encodeURIComponent(here)}`);
      return;
    }
    const result = await toggle(productId);
    if (result.ok) onToggled?.(result.wished);
  }

  return (
    <button
      type="button"
      aria-pressed={wished}
      aria-label={label}
      aria-disabled={isPending(productId) || undefined}
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-medium transition-colors",
        "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-moss-600",
        wished ? "text-danger-600" : "text-coffee-800",
        variant === "icon"
          ? "z-10 h-11 w-11 rounded-full bg-white/90 shadow-sm hover:bg-white"
          : "h-11 rounded-lg border border-coffee-300 bg-white px-4 text-sm hover:bg-coffee-50",
        className,
      )}
    >
      <Heart filled={wished} />
      {variant === "labeled" ? <span>{label}</span> : null}
    </button>
  );
}
