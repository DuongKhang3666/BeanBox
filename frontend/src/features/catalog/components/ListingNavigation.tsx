"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { createContext, useCallback, useContext, useMemo, useTransition } from "react";
import type { ComponentProps, MouseEvent, ReactNode } from "react";
import { cn } from "@/lib/cn";

interface ListingNavigationValue {
  /** Đang chờ server trả trang mới sau khi đổi lọc/sắp xếp/phân trang. */
  pending: boolean;
  /** Điều hướng trong một transition (giữ trang cũ trên màn hình tới khi trang mới sẵn sàng). */
  navigate: (href: string) => void;
}

const ListingNavigationContext = createContext<ListingNavigationValue | null>(null);

/**
 * Dùng chung một trạng thái "đang tải" cho bộ lọc, sắp xếp, phân trang và vùng lưới sản phẩm.
 * Thay cho loading.tsx ở route slug (D-059): loading.tsx làm 404/308 thành HTTP 200 do streaming.
 */
export function ListingNavigationProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const navigate = useCallback(
    (href: string) => {
      startTransition(() => {
        router.push(href, { scroll: false });
      });
    },
    [router],
  );
  const value = useMemo(() => ({ pending, navigate }), [pending, navigate]);
  return (
    <ListingNavigationContext.Provider value={value}>{children}</ListingNavigationContext.Provider>
  );
}

/** `null` khi không nằm trong provider (component tự dùng transition cục bộ). */
export function useListingNavigation(): ListingNavigationValue | null {
  return useContext(ListingNavigationContext);
}

/**
 * Bọc lưới + phân trang: `aria-busy`, làm mờ nhẹ và chữ ẩn "Đang tải..." khi đang chờ.
 * Chỉ đổi opacity nên không gây CLS.
 */
export function ListingResultsRegion({ children }: { children: ReactNode }) {
  const pending = useListingNavigation()?.pending ?? false;
  return (
    <div
      aria-busy={pending}
      className={cn("transition-opacity duration-150", pending && "opacity-60")}
    >
      <span role="status" className="sr-only">
        {pending ? "Đang tải..." : ""}
      </span>
      {children}
    </div>
  );
}

/**
 * Điều hướng lọc/sắp xếp: dùng transition chung nếu có provider, không thì transition cục bộ
 * (component vẫn chạy đúng khi dùng riêng lẻ).
 */
export function useListingPush(): { pending: boolean; push: (href: string) => void } {
  const shared = useListingNavigation();
  const router = useRouter();
  const [localPending, startTransition] = useTransition();
  const push = useCallback(
    (href: string) => {
      if (shared) {
        shared.navigate(href);
        return;
      }
      startTransition(() => {
        router.push(href, { scroll: false });
      });
    },
    [shared, router],
  );
  return { pending: shared ? shared.pending : localPending, push };
}

/** Link phân trang: click thường đi qua transition chung; click có phím bổ trợ/giữa vẫn là link thật. */
export function ListingLink({ href, onClick, ...rest }: ComponentProps<typeof Link>) {
  const shared = useListingNavigation();
  return (
    <Link
      href={href}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e);
        if (
          !shared ||
          e.defaultPrevented ||
          e.button !== 0 ||
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey ||
          typeof href !== "string"
        ) {
          return;
        }
        e.preventDefault();
        shared.navigate(href);
      }}
      {...rest}
    />
  );
}
