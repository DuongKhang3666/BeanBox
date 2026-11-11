"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input, Label } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { ProductImage } from "@/features/catalog/components/ProductImage";
import { useResource } from "@/features/orders/useResource";
import { cn } from "@/lib/cn";
import type { AdminStockStatus, InventoryItem, InventoryQuery } from "@/types/admin";
import type { PaginationMeta } from "@/types/api";
import { listInventory } from "../api/inventory";
import { adminErrorMessage } from "../errors";
import { ADMIN_PAGE_SIZE } from "../orderFilters";
import { inventoryHref, MOVEMENTS_BASE, parseInventoryFilters } from "../inventoryFilters";
import {
  ALL_STOCK_STATUSES,
  PRODUCT_STATUS_LABEL,
  STOCK_STATUS_LABEL,
  stockStatusOf,
} from "../labels";
import { AdminPager } from "./AdminPager";
import { StockAdjustDialog } from "./StockAdjustDialog";

type Loaded = { data: InventoryItem[]; meta: PaginationMeta };

const load = (key: string) =>
  listInventory({ ...(JSON.parse(key) as InventoryQuery), pageSize: ADMIN_PAGE_SIZE });

const selectClass =
  "h-11 w-full rounded-lg border border-coffee-400 bg-white px-3 text-base text-coffee-900 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-moss-600";

const STOCK_TONE: Record<AdminStockStatus, string> = {
  OUT_OF_STOCK: "bg-danger-50 text-danger-600",
  LOW_STOCK: "bg-cream-200 text-coffee-900",
  IN_STOCK: "bg-moss-50 text-moss-800",
};

export function StockBadge({ status }: { status: AdminStockStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-sm font-medium",
        STOCK_TONE[status],
      )}
    >
      {STOCK_STATUS_LABEL[status]}
    </span>
  );
}

function ListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Đang tải tồn kho" role="status" className="space-y-3">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

function VariantCell({ item }: { item: InventoryItem }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <ProductImage
        src={item.imageUrl}
        name={item.productName}
        sizes="48px"
        className="h-12 w-12 shrink-0 rounded-lg"
      />
      <div className="min-w-0">
        <p className="font-medium text-coffee-900">{item.productName}</p>
        <p className="text-sm text-coffee-700">{item.variantName}</p>
        <p className="font-mono text-xs text-coffee-700">SKU {item.sku}</p>
      </div>
    </div>
  );
}

function Flags({ item }: { item: InventoryItem }) {
  return (
    <div className="flex flex-wrap gap-1.5 text-xs">
      <span className="rounded-full bg-coffee-100 px-2 py-0.5 text-coffee-800">
        {PRODUCT_STATUS_LABEL[item.productStatus] ?? item.productStatus}
      </span>
      {!item.isActive ? (
        <span className="rounded-full bg-coffee-800 px-2 py-0.5 text-cream-50">Ngừng bán</span>
      ) : null}
    </div>
  );
}

function RowActions({ item, onAdjust }: { item: InventoryItem; onAdjust: (id: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="secondary"
        aria-label={`Điều chỉnh tồn kho ${item.sku}`}
        onClick={() => onAdjust(item.variantId)}
      >
        Điều chỉnh
      </Button>
      <Link
        href={`${MOVEMENTS_BASE}?variantId=${encodeURIComponent(item.variantId)}`}
        aria-label={`Lịch sử tồn kho ${item.sku}`}
        className={buttonClasses("outline", "sm")}
      >
        Lịch sử
      </Link>
    </div>
  );
}

const th = "px-3 py-3 font-medium";

function InventoryTable({
  items,
  onAdjust,
}: {
  items: InventoryItem[];
  onAdjust: (id: string) => void;
}) {
  return (
    <div className="hidden overflow-x-auto rounded-2xl border border-coffee-200 bg-white md:block">
      <table className="w-full text-left text-sm text-coffee-900">
        <caption className="sr-only">Tồn kho theo biến thể</caption>
        <thead className="bg-cream-50 text-coffee-700">
          <tr>
            <th scope="col" className={th}>
              Biến thể
            </th>
            <th scope="col" className={th}>
              Trạng thái
            </th>
            <th scope="col" className={cn(th, "text-right")}>
              Tồn kho
            </th>
            <th scope="col" className={cn(th, "text-right")}>
              Ngưỡng
            </th>
            <th scope="col" className={th}>
              <span className="sr-only">Thao tác</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-coffee-100">
          {items.map((it) => (
            <tr key={it.variantId}>
              <td className="px-3 py-3">
                <VariantCell item={it} />
              </td>
              <td className="px-3 py-3">
                <Flags item={it} />
              </td>
              <td className="px-3 py-3 text-right">
                <p className="text-base font-bold">{it.stock}</p>
                <StockBadge status={it.stockStatus} />
              </td>
              <td className="px-3 py-3 text-right">{it.lowStockThreshold}</td>
              <td className="px-3 py-3">
                <RowActions item={it} onAdjust={onAdjust} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InventoryCards({
  items,
  onAdjust,
}: {
  items: InventoryItem[];
  onAdjust: (id: string) => void;
}) {
  return (
    <ul className="space-y-3 md:hidden">
      {items.map((it) => (
        <li
          key={it.variantId}
          className="space-y-3 rounded-2xl border border-coffee-200 bg-white p-4"
        >
          <VariantCell item={it} />
          <Flags item={it} />
          <div className="flex items-center justify-between gap-3 border-t border-coffee-100 pt-2">
            <div>
              <p className="text-lg font-bold text-coffee-900">{it.stock}</p>
              <p className="text-xs text-coffee-700">Ngưỡng sắp hết: {it.lowStockThreshold}</p>
            </div>
            <StockBadge status={it.stockStatus} />
          </div>
          <RowActions item={it} onAdjust={onAdjust} />
        </li>
      ))}
    </ul>
  );
}

export function AdminInventory() {
  const router = useRouter();
  const params = useSearchParams();
  const paramsKey = params.toString();
  const filters = useMemo(() => parseInventoryFilters(new URLSearchParams(paramsKey)), [paramsKey]);
  const urlQ = filters.q ?? "";
  const [qInput, setQInput] = useState(urlQ);
  const [adjustId, setAdjustId] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");

  // Debounce ô tìm kiếm -> URL.
  useEffect(() => {
    const t = qInput.trim();
    if (t === urlQ) return;
    const id = setTimeout(() => {
      router.replace(inventoryHref({ ...filters, q: t || undefined, page: undefined }));
    }, 400);
    return () => clearTimeout(id);
  }, [qInput, urlQ, filters, router]);

  const res = useResource<Loaded>(JSON.stringify(filters), load);

  function apply(patch: Partial<InventoryQuery>) {
    router.replace(inventoryHref({ ...filters, ...patch, page: undefined }));
  }

  function toggleStatus(s: AdminStockStatus) {
    const cur = new Set(filters.stockStatus ?? []);
    if (cur.has(s)) cur.delete(s);
    else cur.add(s);
    const next = ALL_STOCK_STATUSES.filter((v) => cur.has(v));
    apply({ stockStatus: next.length ? next : undefined });
  }

  function patchRow(variantId: string, fn: (it: InventoryItem) => InventoryItem) {
    if (!res.data) return;
    res.setData({
      ...res.data,
      data: res.data.data.map((it) => (it.variantId === variantId ? fn(it) : it)),
    });
  }

  const adjusting = adjustId ? res.data?.data.find((i) => i.variantId === adjustId) : undefined;
  const filtered = Object.keys(filters).some((k) => k !== "page");

  let body: React.ReactNode;
  if (res.status === "loading" || res.status === "idle") body = <ListSkeleton />;
  else if (res.status === "error") {
    body = (
      <ErrorState
        title="Không tải được tồn kho"
        description={adminErrorMessage(res.error)}
        onRetry={res.retry}
      />
    );
  } else if (res.data!.data.length === 0) {
    body = (
      <EmptyState
        title="Không có biến thể nào"
        description={
          filtered
            ? "Không có biến thể nào khớp bộ lọc hiện tại."
            : "Chưa có sản phẩm nào trong kho."
        }
        action={
          filtered ? (
            <Link href="/admin/ton-kho" className={buttonClasses("outline")}>
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
        <p className="mb-3 text-sm text-coffee-700">{meta.total} biến thể</p>
        <InventoryTable items={data} onAdjust={setAdjustId} />
        <InventoryCards items={data} onAdjust={setAdjustId} />
        <AdminPager
          page={meta.page}
          totalPages={meta.totalPages}
          hrefFor={(p) => inventoryHref({ ...filters, page: p })}
        />
      </>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-2xl font-bold text-coffee-900">Tồn kho</h1>
        <Link href={MOVEMENTS_BASE} className={buttonClasses("outline", "sm")}>
          Lịch sử biến động
        </Link>
      </div>

      <form
        role="search"
        aria-label="Bộ lọc tồn kho"
        onSubmit={(e) => e.preventDefault()}
        className="grid gap-3 rounded-2xl border border-coffee-200 bg-white p-4 sm:grid-cols-2"
      >
        <div className="sm:col-span-2">
          <Label htmlFor="inv-q">Tìm theo SKU hoặc tên sản phẩm</Label>
          <Input
            id="inv-q"
            type="search"
            value={qInput}
            maxLength={100}
            autoComplete="off"
            onChange={(e) => setQInput(e.target.value)}
          />
        </div>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-coffee-900">Tình trạng tồn</legend>
          <div className="flex flex-wrap gap-2">
            {ALL_STOCK_STATUSES.map((s) => {
              const checked = filters.stockStatus?.includes(s) ?? false;
              return (
                <label
                  key={s}
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
                    onChange={() => toggleStatus(s)}
                  />
                  {STOCK_STATUS_LABEL[s]}
                </label>
              );
            })}
          </div>
        </fieldset>
        <div>
          <Label htmlFor="inv-sort">Sắp xếp</Label>
          <select
            id="inv-sort"
            className={selectClass}
            value={filters.sort ?? "stock_asc"}
            onChange={(e) =>
              apply({
                sort:
                  e.target.value === "stock_asc"
                    ? undefined
                    : (e.target.value as "name" | "updated"),
              })
            }
          >
            <option value="stock_asc">Tồn tăng dần</option>
            <option value="name">Tên sản phẩm</option>
            <option value="updated">Mới cập nhật</option>
          </select>
        </div>
      </form>

      <p role="status" aria-live="polite" className="min-h-5 text-sm font-medium text-moss-800">
        {announce}
      </p>

      {body}

      {adjusting ? (
        <StockAdjustDialog
          item={adjusting}
          onClose={() => setAdjustId(null)}
          onStockChanged={(cur) =>
            patchRow(adjusting.variantId, (it) => ({
              ...it,
              stock: cur,
              stockStatus: stockStatusOf(cur, it.lowStockThreshold),
            }))
          }
          onAdjusted={(updated, before) => {
            patchRow(updated.variantId, () => updated);
            setAdjustId(null);
            setAnnounce(
              before === updated.stock
                ? `Tồn kho ${updated.sku} không thay đổi (${updated.stock}).`
                : `Đã cập nhật tồn kho ${updated.sku}: ${before} → ${updated.stock}.`,
            );
          }}
        />
      ) : null}
    </div>
  );
}
