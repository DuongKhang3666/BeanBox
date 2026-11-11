import type {
  AdminStockStatus,
  InventoryQuery,
  InventoryReason,
  InventorySort,
  MovementQuery,
} from "@/types/admin";
import { ALL_INVENTORY_REASONS, ALL_STOCK_STATUSES } from "./labels";

export const INVENTORY_BASE = "/admin/ton-kho";
export const MOVEMENTS_BASE = "/admin/ton-kho/lich-su";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[a-z0-9]{1,50}$/;

function list<T extends string>(raw: string | null, allowed: readonly T[]): T[] {
  if (!raw) return [];
  const set = new Set(raw.split(","));
  return allowed.filter((v) => set.has(v));
}

function pageOf(params: URLSearchParams): number | undefined {
  const n = Number(params.get("page"));
  return Number.isInteger(n) && n >= 1 && n <= 10000 ? n : undefined;
}

function clean<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

export function parseInventoryFilters(params: URLSearchParams): InventoryQuery {
  const q = (params.get("q") ?? "").trim().slice(0, 100);
  const sort = params.get("sort");
  const statuses = list<AdminStockStatus>(params.get("stockStatus"), ALL_STOCK_STATUSES);
  const productId = params.get("productId");
  return clean({
    q: q || undefined,
    stockStatus: statuses.length ? statuses : undefined,
    productId: productId && ID_RE.test(productId) ? productId : undefined,
    sort: sort === "name" || sort === "updated" ? (sort as InventorySort) : undefined,
    page: pageOf(params),
  });
}

export function inventoryHref(f: InventoryQuery): string {
  const qs = new URLSearchParams();
  if (f.q) qs.set("q", f.q);
  if (f.stockStatus?.length) qs.set("stockStatus", f.stockStatus.join(","));
  if (f.productId) qs.set("productId", f.productId);
  if (f.sort === "name" || f.sort === "updated") qs.set("sort", f.sort);
  if (f.page && f.page > 1) qs.set("page", String(f.page));
  const s = qs.toString();
  return s ? `${INVENTORY_BASE}?${s}` : INVENTORY_BASE;
}

export function parseMovementFilters(params: URLSearchParams): MovementQuery {
  const variantId = params.get("variantId");
  const from = params.get("from");
  const to = params.get("to");
  const reasons = list<InventoryReason>(params.get("reason"), ALL_INVENTORY_REASONS);
  const out = clean({
    variantId: variantId && ID_RE.test(variantId) ? variantId : undefined,
    reason: reasons.length ? reasons : undefined,
    from: from && DATE_RE.test(from) ? from : undefined,
    to: to && DATE_RE.test(to) ? to : undefined,
    page: pageOf(params),
  });
  if (out.from && out.to && out.from > out.to) {
    delete out.from;
    delete out.to;
  }
  return out;
}

export function movementsHref(f: MovementQuery): string {
  const qs = new URLSearchParams();
  if (f.variantId) qs.set("variantId", f.variantId);
  if (f.reason?.length) qs.set("reason", f.reason.join(","));
  if (f.from) qs.set("from", f.from);
  if (f.to) qs.set("to", f.to);
  if (f.page && f.page > 1) qs.set("page", String(f.page));
  const s = qs.toString();
  return s ? `${MOVEMENTS_BASE}?${s}` : MOVEMENTS_BASE;
}
