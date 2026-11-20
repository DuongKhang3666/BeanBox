import { api } from "@/lib/api/client";
import type { AnalyticsGranularity, AnalyticsOverview } from "@/types/admin";

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
