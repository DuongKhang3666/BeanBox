"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input, Label } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { useResource } from "@/features/orders/useResource";
import { cn } from "@/lib/cn";
import { formatVND } from "@/lib/format";
import type { AdminCoupon, AdminCouponQuery, CouponState } from "@/types/admin";
import type { PaginationMeta } from "@/types/api";
import { listAdminCoupons } from "../api/coupons";
import { COUPONS_BASE, couponsHref, parseCouponFilters } from "../couponFilters";
import { adminErrorMessage } from "../errors";
import { formatVnDate } from "../format";
import {
  ALL_COUPON_STATES,
  ALL_COUPON_TYPES,
  COUPON_STATE_LABEL,
  COUPON_TYPE_LABEL,
  couponValueText,
} from "../labels";
import { ADMIN_PAGE_SIZE } from "../orderFilters";
import { AdminPager } from "./AdminPager";

type Loaded = { data: AdminCoupon[]; meta: PaginationMeta };

const load = (key: string) =>
  listAdminCoupons({ ...(JSON.parse(key) as AdminCouponQuery), pageSize: ADMIN_PAGE_SIZE });

const selectClass =
  "h-11 w-full rounded-lg border border-coffee-400 bg-white px-3 text-base text-coffee-900 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-moss-600";

const STATE_TONE: Record<CouponState, string> = {
  ACTIVE: "bg-moss-50 text-moss-800",
  SCHEDULED: "bg-cream-200 text-coffee-900",
  EXPIRED: "bg-coffee-100 text-coffee-800",
  INACTIVE: "bg-coffee-100 text-coffee-800",
  EXHAUSTED: "bg-danger-50 text-danger-600",
};

export function CouponStateBadge({ state }: { state: CouponState }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-sm font-medium",
        STATE_TONE[state],
      )}
    >
      {COUPON_STATE_LABEL[state] ?? state}
    </span>
  );
}

/** "10/11/2026 – 30/11/2026", hoặc "Từ …", "Đến …", "Không giới hạn". */
export function couponPeriodText(c: Pick<AdminCoupon, "startsAt" | "endsAt">): string {
  if (c.startsAt && c.endsAt) return `${formatVnDate(c.startsAt)} – ${formatVnDate(c.endsAt)}`;
  if (c.startsAt) return `Từ ${formatVnDate(c.startsAt)}`;
  if (c.endsAt) return `Đến ${formatVnDate(c.endsAt)}`;
  return "Không giới hạn";
}

const usedText = (c: AdminCoupon) =>
  `${c.usedCount.toLocaleString("vi-VN")}/${c.usageLimit != null ? c.usageLimit.toLocaleString("vi-VN") : "∞"}`;
const perUserText = (c: AdminCoupon) =>
  c.perUserLimit != null ? String(c.perUserLimit) : "Không giới hạn";

function ListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Đang tải mã giảm giá" role="status" className="space-y-3">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

const th = "px-3 py-3 font-medium";

function CodeLink({ c }: { c: AdminCoupon }) {
  return (
    <Link href={`${COUPONS_BASE}/${c.id}`} className="font-mono font-bold text-moss-800 underline">
      {c.code}
    </Link>
  );
}

function CouponTable({ items }: { items: AdminCoupon[] }) {
  return (
    <div className="hidden overflow-x-auto rounded-2xl border border-coffee-200 bg-white md:block">
      <table className="w-full text-left text-sm text-coffee-900">
        <caption className="sr-only">Danh sách mã giảm giá</caption>
        <thead className="bg-cream-50 text-coffee-700">
          <tr>
            <th scope="col" className={th}>
              Mã
            </th>
            <th scope="col" className={th}>
              Loại và giá trị
            </th>
            <th scope="col" className={cn(th, "text-right")}>
              Đơn tối thiểu
            </th>
            <th scope="col" className={th}>
              Thời gian
            </th>
            <th scope="col" className={cn(th, "text-right")}>
              Đã dùng
            </th>
            <th scope="col" className={cn(th, "text-right")}>
              Mỗi khách
            </th>
            <th scope="col" className={th}>
              Trạng thái
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-coffee-100">
          {items.map((c) => (
            <tr key={c.id}>
              <td className="px-3 py-3">
                <CodeLink c={c} />
                {c.description ? <p className="text-xs text-coffee-700">{c.description}</p> : null}
              </td>
              <td className="px-3 py-3">
                <span className="block text-xs text-coffee-700">{COUPON_TYPE_LABEL[c.type]}</span>
                {couponValueText(c)}
              </td>
              <td className="px-3 py-3 text-right whitespace-nowrap">
                {c.minOrder > 0 ? formatVND(c.minOrder) : "—"}
              </td>
              <td className="px-3 py-3 whitespace-nowrap">{couponPeriodText(c)}</td>
              <td className="px-3 py-3 text-right whitespace-nowrap">{usedText(c)}</td>
              <td className="px-3 py-3 text-right whitespace-nowrap">{perUserText(c)}</td>
              <td className="px-3 py-3">
                <CouponStateBadge state={c.state} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CouponCards({ items }: { items: AdminCoupon[] }) {
  return (
    <ul className="space-y-3 md:hidden">
      {items.map((c) => (
        <li key={c.id} className="space-y-3 rounded-2xl border border-coffee-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <CodeLink c={c} />
            <CouponStateBadge state={c.state} />
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
            <dt className="text-coffee-700">Loại</dt>
            <dd>{COUPON_TYPE_LABEL[c.type]}</dd>
            <dt className="text-coffee-700">Giá trị</dt>
            <dd>{couponValueText(c)}</dd>
            <dt className="text-coffee-700">Đơn tối thiểu</dt>
            <dd>{c.minOrder > 0 ? formatVND(c.minOrder) : "—"}</dd>
            <dt className="text-coffee-700">Thời gian</dt>
            <dd>{couponPeriodText(c)}</dd>
            <dt className="text-coffee-700">Đã dùng</dt>
            <dd>{usedText(c)}</dd>
            <dt className="text-coffee-700">Mỗi khách</dt>
            <dd>{perUserText(c)}</dd>
          </dl>
        </li>
      ))}
    </ul>
  );
}

export function AdminCoupons() {
  const router = useRouter();
  const params = useSearchParams();
  const paramsKey = params.toString();
  const filters = useMemo(() => parseCouponFilters(new URLSearchParams(paramsKey)), [paramsKey]);
  const urlQ = filters.q ?? "";
  const [qInput, setQInput] = useState(urlQ);

  // Debounce ô tìm kiếm -> URL.
  useEffect(() => {
    const t = qInput.trim();
    if (t === urlQ) return;
    const id = setTimeout(() => {
      router.replace(couponsHref({ ...filters, q: t || undefined, page: undefined }));
    }, 400);
    return () => clearTimeout(id);
  }, [qInput, urlQ, filters, router]);

  const res = useResource<Loaded>(JSON.stringify(filters), load);

  function apply(patch: Partial<AdminCouponQuery>) {
    router.replace(couponsHref({ ...filters, ...patch, page: undefined }));
  }

  const filtered = Object.keys(filters).some((k) => k !== "page");

  let body: React.ReactNode;
  if (res.status === "loading" || res.status === "idle") body = <ListSkeleton />;
  else if (res.status === "error") {
    body = (
      <ErrorState
        title="Không tải được mã giảm giá"
        description={adminErrorMessage(res.error)}
        onRetry={res.retry}
      />
    );
  } else if (res.data!.data.length === 0) {
    body = (
      <EmptyState
        title="Không có mã giảm giá nào"
        description={
          filtered
            ? "Không có mã nào khớp bộ lọc hiện tại."
            : "Tạo mã giảm giá đầu tiên để thu hút khách hàng."
        }
        action={
          filtered ? (
            <Link href={COUPONS_BASE} className={buttonClasses("outline")}>
              Xóa bộ lọc
            </Link>
          ) : (
            <Link href={`${COUPONS_BASE}/moi`} className={buttonClasses("primary")}>
              Thêm mã giảm giá đầu tiên
            </Link>
          )
        }
      />
    );
  } else {
    const { data, meta } = res.data!;
    body = (
      <>
        <p className="mb-3 text-sm text-coffee-700">{meta.total} mã giảm giá</p>
        <CouponTable items={data} />
        <CouponCards items={data} />
        <AdminPager
          page={meta.page}
          totalPages={meta.totalPages}
          hrefFor={(p) => couponsHref({ ...filters, page: p })}
        />
      </>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-2xl font-bold text-coffee-900">Mã giảm giá</h1>
        <Link href={`${COUPONS_BASE}/moi`} className={buttonClasses("primary")}>
          Thêm mã giảm giá
        </Link>
      </div>

      <form
        role="search"
        aria-label="Bộ lọc mã giảm giá"
        onSubmit={(e) => e.preventDefault()}
        className="grid gap-3 rounded-2xl border border-coffee-200 bg-white p-4 sm:grid-cols-2"
      >
        <div className="sm:col-span-2">
          <Label htmlFor="cpn-q">Tìm theo mã</Label>
          <Input
            id="cpn-q"
            type="search"
            value={qInput}
            maxLength={50}
            autoComplete="off"
            onChange={(e) => setQInput(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="cpn-type">Loại mã</Label>
          <select
            id="cpn-type"
            className={selectClass}
            value={filters.type ?? ""}
            onChange={(e) =>
              apply({ type: (e.target.value || undefined) as AdminCouponQuery["type"] })
            }
          >
            <option value="">Tất cả loại</option>
            {ALL_COUPON_TYPES.map((t) => (
              <option key={t} value={t}>
                {COUPON_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="cpn-state">Trạng thái</Label>
          <select
            id="cpn-state"
            className={selectClass}
            value={filters.state ?? ""}
            onChange={(e) =>
              apply({ state: (e.target.value || undefined) as AdminCouponQuery["state"] })
            }
          >
            <option value="">Tất cả trạng thái</option>
            {ALL_COUPON_STATES.map((s) => (
              <option key={s} value={s}>
                {COUPON_STATE_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      </form>

      {body}
    </div>
  );
}
