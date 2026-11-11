import { api } from "@/lib/api/client";
import type { PaginationMeta } from "@/types/api";
import type {
  Order,
  OrderListItem,
  OrderStatus,
  PlaceOrderRequest,
  Quote,
  QuoteRequest,
  TrackedOrder,
} from "@/types/order";

export async function quote(body: QuoteRequest, signal?: AbortSignal): Promise<Quote> {
  const { data } = await api.post<Quote>("/checkout/quote", body, { signal });
  return data;
}

/** `Idempotency-Key` là UUID v4 gắn với payload (xem idempotency.ts). */
export async function placeOrder(body: PlaceOrderRequest, idempotencyKey: string): Promise<Order> {
  const { data } = await api.post<Order>("/orders", body, {
    headers: { "Idempotency-Key": idempotencyKey },
  });
  return data;
}

export async function listMyOrders(params: {
  status?: OrderStatus[] | string;
  page?: number;
  pageSize?: number;
}): Promise<{ data: OrderListItem[]; meta: PaginationMeta }> {
  const status = Array.isArray(params.status) ? params.status.join(",") : params.status;
  const { data, meta } = await api.get<OrderListItem[], PaginationMeta>("/me/orders", {
    query: { status, page: params.page, pageSize: params.pageSize },
  });
  return {
    data,
    meta: meta ?? { page: 1, pageSize: data.length, total: data.length, totalPages: 1 },
  };
}

export async function getOrder(code: string): Promise<Order> {
  const { data } = await api.get<Order>(`/orders/${encodeURIComponent(code)}`);
  return data;
}

/** Public: bỏ Bearer để server coi là khách (rate limit riêng, không lẫn đường chủ đơn). */
export async function trackOrder(code: string, phone: string): Promise<TrackedOrder> {
  const { data } = await api.get<TrackedOrder>("/orders/track", {
    query: { code, phone },
    skipAuth: true,
  });
  return data;
}

export async function cancelOrder(code: string, body: { reason?: string }): Promise<Order> {
  const { data } = await api.post<Order>(`/orders/${encodeURIComponent(code)}/cancel`, body);
  return data;
}

/** Server trả bản rút gọn (TrackedOrder) cho khách, không lộ dữ liệu cá nhân.
 * skipAuth: server coi request có Bearer là đường chủ đơn và sẽ 404 với đơn guest. */
export async function cancelGuestOrder(
  code: string,
  body: { reason?: string; phone: string },
): Promise<TrackedOrder> {
  const { data } = await api.post<TrackedOrder>(
    `/orders/${encodeURIComponent(code)}/cancel`,
    body,
    {
      skipAuth: true,
    },
  );
  return data;
}
