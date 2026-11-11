"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { FieldError, Input, Label } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { useResource } from "@/features/orders/useResource";
import { cn } from "@/lib/cn";
import type { InventoryMovement, InventoryReason, MovementQuery } from "@/types/admin";
import type { PaginationMeta } from "@/types/api";
import { listMovements } from "../api/inventory";
import { adminErrorMessage } from "../errors";
import { formatVnDateTime } from "../format";
import { INVENTORY_BASE, movementsHref, parseMovementFilters } from "../inventoryFilters";
import { ALL_INVENTORY_REASONS, INVENTORY_REASON_LABEL } from "../labels";
import { ADMIN_PAGE_SIZE } from "../orderFilters";
import { AdminPager } from "./AdminPager";

type Loaded = { data: InventoryMovement[]; meta: PaginationMeta };

const load = (key: string) =>
  listMovements({ ...(JSON.parse(key) as MovementQuery), pageSize: ADMIN_PAGE_SIZE });

export function signedChange(change: number): string {
  return change > 0 ? `+${change}` : String(change);
}

function ChangeValue({ change }: { change: number }) {
  return (
    <span
      className={cn(
        "font-bold tabular-nums",
        change > 0 ? "text-moss-800" : change < 0 ? "text-danger-600" : "text-coffee-900",
      )}
    >
      {signedChange(change)}
    </span>
  );
}

function OrderLink({ code }: { code: string | null }) {
  if (!code) return <span className="text-coffee-600">—</span>;
  return (
    <Link
      href={`/admin/don-hang/${encodeURIComponent(code)}`}
      className="font-mono font-bold text-moss-800 underline"
    >
      {code}
    </Link>
  );
}

function ListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Đang tải lịch sử tồn kho" role="status" className="space-y-3">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}

const th = "px-3 py-3 font-medium";
const actorName = (m: InventoryMovement) => m.actor?.fullName ?? "Hệ thống";

function MovementsTable({ items }: { items: InventoryMovement[] }) {
  return (
    <div className="hidden overflow-x-auto rounded-2xl border border-coffee-200 bg-white md:block">
      <table className="w-full text-left text-sm text-coffee-900">
        <caption className="sr-only">Lịch sử biến động tồn kho</caption>
        <thead className="bg-cream-50 text-coffee-700">
          <tr>
            <th scope="col" className={th}>
              Thời gian
            </th>
            <th scope="col" className={th}>
              Biến thể
            </th>
            <th scope="col" className={cn(th, "text-right")}>
              Thay đổi
            </th>
            <th scope="col" className={cn(th, "text-right")}>
              Tồn sau
            </th>
            <th scope="col" className={th}>
              Lý do
            </th>
            <th scope="col" className={th}>
              Mã đơn
            </th>
            <th scope="col" className={th}>
              Người thao tác
            </th>
            <th scope="col" className={th}>
              Ghi chú
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-coffee-100">
          {items.map((m) => (
            <tr key={m.id}>
              <td className="whitespace-nowrap px-3 py-3">{formatVnDateTime(m.createdAt)}</td>
              <td className="px-3 py-3">
                <p className="font-medium">{m.productName}</p>
                <p className="text-xs text-coffee-700">
                  {m.variantName} · <span className="font-mono">{m.sku}</span>
                </p>
              </td>
              <td className="px-3 py-3 text-right">
                <ChangeValue change={m.change} />
              </td>
              <td className="px-3 py-3 text-right tabular-nums">{m.stockAfter}</td>
              <td className="px-3 py-3">{INVENTORY_REASON_LABEL[m.reason] ?? m.reason}</td>
              <td className="px-3 py-3">
                <OrderLink code={m.orderCode} />
              </td>
              <td className="px-3 py-3">{actorName(m)}</td>
              <td className="px-3 py-3 text-coffee-800">{m.note ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MovementCards({ items }: { items: InventoryMovement[] }) {
  return (
    <ul className="space-y-3 md:hidden">
      {items.map((m) => (
        <li key={m.id} className="space-y-2 rounded-2xl border border-coffee-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium text-coffee-900">{m.productName}</p>
              <p className="text-sm text-coffee-700">
                {m.variantName} · <span className="font-mono">{m.sku}</span>
              </p>
            </div>
            <p className="text-lg">
              <ChangeValue change={m.change} />
            </p>
          </div>
          <p className="text-sm text-coffee-800">
            {INVENTORY_REASON_LABEL[m.reason] ?? m.reason} · Tồn sau: {m.stockAfter}
          </p>
          <p className="text-sm text-coffee-700">
            {formatVnDateTime(m.createdAt)} · {actorName(m)}
          </p>
          {m.orderCode ? (
            <p className="text-sm">
              Đơn: <OrderLink code={m.orderCode} />
            </p>
          ) : null}
          {m.note ? <p className="text-sm text-coffee-800">{m.note}</p> : null}
        </li>
      ))}
    </ul>
  );
}

export function AdminMovements() {
  const router = useRouter();
  const params = useSearchParams();
  const paramsKey = params.toString();
  const filters = useMemo(() => parseMovementFilters(new URLSearchParams(paramsKey)), [paramsKey]);
  const [fromInput, setFromInput] = useState(filters.from ?? "");
  const [toInput, setToInput] = useState(filters.to ?? "");
  const [dateError, setDateError] = useState<string | null>(null);

  const res = useResource<Loaded>(JSON.stringify(filters), load);

  function apply(patch: Partial<MovementQuery>) {
    router.replace(movementsHref({ ...filters, ...patch, page: undefined }));
  }

  function toggleReason(r: InventoryReason) {
    const cur = new Set(filters.reason ?? []);
    if (cur.has(r)) cur.delete(r);
    else cur.add(r);
    const next = ALL_INVENTORY_REASONS.filter((v) => cur.has(v));
    apply({ reason: next.length ? next : undefined });
  }

  function onDate(field: "from" | "to", value: string) {
    const from = field === "from" ? value : fromInput;
    const to = field === "to" ? value : toInput;
    if (field === "from") setFromInput(value);
    else setToInput(value);
    if (from && to && from > to) {
      setDateError("Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.");
      return;
    }
    setDateError(null);
    apply({ from: from || undefined, to: to || undefined });
  }

  const filtered = Object.keys(filters).some((k) => k !== "page");

  let body: React.ReactNode;
  if (res.status === "loading" || res.status === "idle") body = <ListSkeleton />;
  else if (res.status === "error") {
    body = (
      <ErrorState
        title="Không tải được lịch sử tồn kho"
        description={adminErrorMessage(res.error)}
        onRetry={res.retry}
      />
    );
  } else if (res.data!.data.length === 0) {
    body = (
      <EmptyState
        title="Chưa có biến động nào"
        description={
          filtered ? "Không có biến động nào khớp bộ lọc hiện tại." : "Chưa có biến động tồn kho."
        }
        action={
          filtered ? (
            <Link href="/admin/ton-kho/lich-su" className={buttonClasses("outline")}>
              Xóa bộ lọc
            </Link>
          ) : undefined
        }
      />
    );
  } else {
    const { data, meta } = res.data!;
    body = (
      <>
        <p className="mb-3 text-sm text-coffee-700">{meta.total} biến động</p>
        <MovementsTable items={data} />
        <MovementCards items={data} />
        <AdminPager
          page={meta.page}
          totalPages={meta.totalPages}
          hrefFor={(p) => movementsHref({ ...filters, page: p })}
        />
      </>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-2xl font-bold text-coffee-900">Lịch sử tồn kho</h1>
        <Link href={INVENTORY_BASE} className={buttonClasses("outline", "sm")}>
          Về tồn kho
        </Link>
      </div>

      <form
        role="search"
        aria-label="Bộ lọc lịch sử tồn kho"
        onSubmit={(e) => e.preventDefault()}
        className="grid gap-3 rounded-2xl border border-coffee-200 bg-white p-4 sm:grid-cols-2"
      >
        {filters.variantId ? (
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <span className="rounded-full bg-cream-200 px-3 py-1 text-sm text-coffee-900">
              Đang lọc theo một biến thể
            </span>
            <Link
              href={movementsHref({ ...filters, variantId: undefined, page: undefined })}
              className="text-sm font-medium text-moss-800 underline"
            >
              Xem tất cả biến thể
            </Link>
          </div>
        ) : null}
        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 text-sm font-medium text-coffee-900">Lý do</legend>
          <div className="flex flex-wrap gap-2">
            {ALL_INVENTORY_REASONS.map((r) => {
              const checked = filters.reason?.includes(r) ?? false;
              return (
                <label
                  key={r}
                  className={cn(
                    "inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-medium",
                    checked
                      ? "border-coffee-800 bg-coffee-800 text-cream-50"
                      : "border-coffee-300 bg-white text-coffee-800",
                  )}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-moss-700"
                    checked={checked}
                    onChange={() => toggleReason(r)}
                  />
                  {INVENTORY_REASON_LABEL[r]}
                </label>
              );
            })}
          </div>
        </fieldset>
        <div>
          <Label htmlFor="mv-from">Từ ngày</Label>
          <Input
            id="mv-from"
            type="date"
            value={fromInput}
            invalid={Boolean(dateError)}
            aria-describedby={dateError ? "mv-date-err" : undefined}
            onChange={(e) => onDate("from", e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="mv-to">Đến ngày</Label>
          <Input
            id="mv-to"
            type="date"
            value={toInput}
            invalid={Boolean(dateError)}
            aria-describedby={dateError ? "mv-date-err" : undefined}
            onChange={(e) => onDate("to", e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <FieldError id="mv-date-err">{dateError}</FieldError>
        </div>
      </form>

      {body}
    </div>
  );
}
