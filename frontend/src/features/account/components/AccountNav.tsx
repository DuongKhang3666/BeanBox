"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

const itemBase =
  "inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-medium md:w-full";
const focusRing =
  "focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-moss-600";

const LINKS = [
  { href: "/tai-khoan", label: "Hồ sơ", exact: true },
  { href: "/tai-khoan/dia-chi", label: "Sổ địa chỉ", exact: false },
] as const;

/** Mobile: tab ngang cuộn được. Từ md: cột dọc. */
export function AccountNav({
  onLogout,
  loggingOut,
}: {
  onLogout: () => void;
  loggingOut: boolean;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Tài khoản" className="md:sticky md:top-24 md:self-start">
      <ul className="-mx-4 flex gap-1 overflow-x-auto border-b border-coffee-200 px-4 pb-2 md:mx-0 md:flex-col md:border-b-0 md:px-0 md:pb-0">
        {LINKS.map((l) => {
          const current = l.exact ? pathname === l.href : pathname.startsWith(l.href);
          return (
            <li key={l.href} className="shrink-0 md:w-full">
              <Link
                href={l.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  itemBase,
                  focusRing,
                  current ? "bg-coffee-800 text-cream-50" : "text-coffee-800 hover:bg-coffee-100",
                )}
              >
                {l.label}
              </Link>
            </li>
          );
        })}
        <li className="shrink-0 md:w-full">
          {/* M3: trang đơn hàng chưa có, hiển thị không bấm được */}
          <span aria-disabled="true" className={cn(itemBase, "cursor-not-allowed text-coffee-600")}>
            Đơn hàng
            <span className="rounded-full bg-cream-200 px-2 py-0.5 text-xs text-coffee-800">
              Sắp có
            </span>
          </span>
        </li>
        <li className="shrink-0 md:mt-4 md:w-full">
          <Button
            variant="outline"
            size="sm"
            className="h-11 md:w-full"
            onClick={onLogout}
            loading={loggingOut}
          >
            Đăng xuất
          </Button>
        </li>
      </ul>
    </nav>
  );
}
