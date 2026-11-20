import { api } from "@/lib/api/client";
import type {
  AnalyticsBreakdown,
  AnalyticsCustomers,
  AnalyticsGranularity,
  AnalyticsInventory,
  AnalyticsOperations,
  AnalyticsOverview,
  AnalyticsTopCustomers,
  AnalyticsTopProducts,
  BreakdownDimension,
  TopCustomersSort,
  TopProductsSort,
} from "@/types/admin";

export interface AnalyticsOverviewQuery {
  from: string;
  to: string;
  granularity: AnalyticsGranularity;
}

/** GET /admin/analytics/overview (§16.1). Chỉ Admin. */
export async function getAnalyticsOverview(
  q: AnalyticsOverviewQuery,
  signal?: AbortSignal,
): Promise<AnalyticsOverview> {
  const { data } = await api.get<AnalyticsOverview>("/admin/analytics/overview", {
    query: { from: q.from, to: q.to, granularity: q.granularity },
    signal,
  });
  return data;
}

/** GET /admin/analytics/breakdown (§16.2). Chỉ Admin. */
export async function getAnalyticsBreakdown(
  q: { from: string; to: string; dimension: BreakdownDimension },
  signal?: AbortSignal,
): Promise<AnalyticsBreakdown> {
  const { data } = await api.get<AnalyticsBreakdown>("/admin/analytics/breakdown", {
    query: { dimension: q.dimension, from: q.from, to: q.to },
    signal,
  });
  return data;
}

/** GET /admin/analytics/top-products (§16.2). Chỉ Admin. */
export async function getAnalyticsTopProducts(
  q: { from: string; to: string; sort: TopProductsSort; limit?: number },
  signal?: AbortSignal,
): Promise<AnalyticsTopProducts> {
  const { data } = await api.get<AnalyticsTopProducts>("/admin/analytics/top-products", {
    query: { from: q.from, to: q.to, sort: q.sort, limit: q.limit ?? 10 },
    signal,
  });
  return data;
}

/** GET /admin/analytics/top-customers (§16.2). Chỉ Admin. */
export async function getAnalyticsTopCustomers(
  q: { from: string; to: string; sort: TopCustomersSort; limit?: number },
  signal?: AbortSignal,
): Promise<AnalyticsTopCustomers> {
  const { data } = await api.get<AnalyticsTopCustomers>("/admin/analytics/top-customers", {
    query: { from: q.from, to: q.to, sort: q.sort, limit: q.limit ?? 10 },
    signal,
  });
  return data;
}

/** GET /admin/analytics/customers (§16.3). Chỉ Admin. */
export async function getAnalyticsCustomers(
  q: { from: string; to: string },
  signal?: AbortSignal,
): Promise<AnalyticsCustomers> {
  const { data } = await api.get<AnalyticsCustomers>("/admin/analytics/customers", {
    query: { from: q.from, to: q.to },
    signal,
  });
  return data;
}

/** GET /admin/analytics/operations (§16.3). Chỉ Admin. */
export async function getAnalyticsOperations(
  q: { from: string; to: string },
  signal?: AbortSignal,
): Promise<AnalyticsOperations> {
  const { data } = await api.get<AnalyticsOperations>("/admin/analytics/operations", {
    query: { from: q.from, to: q.to },
    signal,
  });
  return data;
}

/** GET /admin/analytics/inventory (§16.3). Chỉ Admin; số liệu hiện tại, không theo khoảng ngày. */
export async function getAnalyticsInventory(
  q: { slowDays: number },
  signal?: AbortSignal,
): Promise<AnalyticsInventory> {
  const { data } = await api.get<AnalyticsInventory>("/admin/analytics/inventory", {
    query: { slowDays: q.slowDays },
    signal,
  });
  return data;
}
