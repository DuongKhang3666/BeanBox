import { api } from "@/lib/api/client";
import type {
  AdjustInventoryInput,
  AdjustInventoryResult,
  InventoryItem,
  InventoryMovement,
  InventoryQuery,
  MovementQuery,
} from "@/types/admin";
import type { PaginationMeta } from "@/types/api";

function metaOf(meta: Partial<PaginationMeta> | undefined, length: number): PaginationMeta {
  return {
    page: meta?.page ?? 1,
    pageSize: meta?.pageSize ?? length,
    total: meta?.total ?? length,
    totalPages: meta?.totalPages ?? 1,
  };
}

/** GET /admin/inventory. `stockStatus` nhiều giá trị phân cách phẩy. */
export async function listInventory(query: InventoryQuery, signal?: AbortSignal) {
  const { stockStatus, ...rest } = query;
  const { data, meta } = await api.get<InventoryItem[], Partial<PaginationMeta>>(
    "/admin/inventory",
    { query: { ...rest, stockStatus: stockStatus?.join(",") }, signal },
  );
  return { data, meta: metaOf(meta, data.length) };
}

/** POST /admin/inventory/adjust */
export async function adjustInventory(body: AdjustInventoryInput): Promise<AdjustInventoryResult> {
  const { data } = await api.post<AdjustInventoryResult>("/admin/inventory/adjust", body);
  return data;
}

/** GET /admin/inventory/movements. `reason` nhiều giá trị phân cách phẩy. */
export async function listMovements(query: MovementQuery, signal?: AbortSignal) {
  const { reason, ...rest } = query;
  const { data, meta } = await api.get<InventoryMovement[], Partial<PaginationMeta>>(
    "/admin/inventory/movements",
    { query: { ...rest, reason: reason?.join(",") }, signal },
  );
  return { data, meta: metaOf(meta, data.length) };
}
