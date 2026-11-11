import type { AdminOrderQuery, AdminOrderSort } from "@/types/admin";
import type { OrderStatus, PaymentMethod, PaymentStatus } from "@/types/order";
import { ALL_ORDER_STATUSES } from "./api/orders";

export const ADMIN_ORDERS_BASE = "/admin/don-hang";
export const ADMIN_PAGE_SIZE = 20;

export const PAYMENT_STATUSES: PaymentStatus[] = ["UNPAID", "PAID", "FAILED", "REFUNDED"];
export const PAYMENT_METHODS: PaymentMethod[] = ["COD", "VNPAY", "STRIPE"];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  return value !== null && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

/** Bộ lọc từ URL; giá trị lạ bị bỏ qua. `q` < 2 ký tự không được gửi lên API. */
export function parseOrderFilters(params: URLSearchParams): AdminOrderQuery {
  const pageNum = Number(params.get("page"));
  const q = (params.get("q") ?? "").trim().slice(0, 50);
  const from = params.get("from");
  const to = params.get("to");
  const sort: AdminOrderSort | undefined = params.get("sort") === "oldest" ? "oldest" : undefined;
  const out: AdminOrderQuery = {
    status: oneOf<OrderStatus>(params.get("status"), ALL_ORDER_STATUSES),
    paymentStatus: oneOf(params.get("paymentStatus"), PAYMENT_STATUSES),
    paymentMethod: oneOf(params.get("paymentMethod"), PAYMENT_METHODS),
    needsRefund: params.get("needsRefund") === "true" ? true : undefined,
    from: from && DATE_RE.test(from) ? from : undefined,
    to: to && DATE_RE.test(to) ? to : undefined,
    q: q.length >= 2 ? q : undefined,
    sort,
    page: Number.isInteger(pageNum) && pageNum >= 1 && pageNum <= 10000 ? pageNum : undefined,
  };
  // from > to không hợp lệ ở backend: bỏ cả hai thay vì gửi request chắc chắn lỗi.
  if (out.from && out.to && out.from > out.to) {
    out.from = undefined;
    out.to = undefined;
  }
  return Object.fromEntries(
    Object.entries(out).filter(([, v]) => v !== undefined),
  ) as AdminOrderQuery;
}

/** URL danh sách với bộ lọc (bỏ giá trị rỗng/mặc định). */
export function orderFiltersHref(filters: AdminOrderQuery): string {
  const qs = new URLSearchParams();
  for (const key of ["status", "paymentStatus", "paymentMethod", "from", "to", "q"] as const) {
    const v = filters[key];
    if (v) qs.set(key, v);
  }
  if (filters.needsRefund) qs.set("needsRefund", "true");
  if (filters.sort === "oldest") qs.set("sort", "oldest");
  if (filters.page && filters.page > 1) qs.set("page", String(filters.page));
  const s = qs.toString();
  return s ? `${ADMIN_ORDERS_BASE}?${s}` : ADMIN_ORDERS_BASE;
}
