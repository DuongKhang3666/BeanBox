import { api } from "@/lib/api/client";
import type { CompareResult } from "@/types/catalog";

/** GET /products/compare?slugs=a,b (§4.7). Public, gọi từ client. */
export async function fetchCompare(slugs: readonly string[], signal?: AbortSignal) {
  const { data } = await api.get<CompareResult>("/products/compare", {
    query: { slugs: slugs.join(",") },
    signal,
  });
  return data;
}
