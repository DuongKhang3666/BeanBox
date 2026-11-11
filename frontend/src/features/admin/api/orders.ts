import { api } from "@/lib/api/client";
import type {
  AdminOrder,
  AdminOrderListItem,
  AdminOrderListMeta,
  AdminOrderQuery,
  OrderStatusCounts,
  RefundPaymentBody,
  UpdateOrderStatusBody,
} from "@/types/admin";
import type { OrderStatus } from "@/types/order";

export const ALL_ORDER_STATUSES: OrderStatus[] = [
  "PENDING_PAYMENT",
  "PENDING",
  "CONFIRMED",
  "PROCESSING",
  "SHIPPING",
  "DELIVERED",
  "FAILED_DELIVERY",
  "CANCELLED",
  "RETURN_REQUESTED",
  "RETURNED",
];

export function emptyStatusCounts(): OrderStatusCounts {
  return Object.fromEntries(ALL_ORDER_STATUSES.map((s) => [s, 0])) as OrderStatusCounts;
}

/** GET /admin/orders. Bearer tự gắn, 401 -> refresh single-flight (api client). */
export async function listAdminOrders(
  query: AdminOrderQuery,
  signal?: AbortSignal,
): Promise<{ data: AdminOrderListItem[]; meta: AdminOrderListMeta }> {
  const { data, meta } = await api.get<AdminOrderListItem[], Partial<AdminOrderListMeta>>(
    "/admin/orders",
    { query: { ...query, needsRefund: query.needsRefund ? "true" : undefined }, signal },
  );
  return {
    data,
    meta: {
      page: meta?.page ?? 1,
      pageSize: meta?.pageSize ?? data.length,
      total: meta?.total ?? data.length,
      totalPages: meta?.totalPages ?? 1,
      statusCounts: { ...emptyStatusCounts(), ...meta?.statusCounts },
    },
  };
}

export async function getAdminOrder(code: string): Promise<AdminOrder> {
  const { data } = await api.get<AdminOrder>(`/admin/orders/${encodeURIComponent(code)}`);
  return data;
}

export async function updateAdminOrderStatus(
  code: string,
  body: UpdateOrderStatusBody,
): Promise<AdminOrder> {
  const { data } = await api.patch<AdminOrder>(
    `/admin/orders/${encodeURIComponent(code)}/status`,
    body,
  );
  return data;
}

/**
 * Ghi nhận đã hoàn tiền thủ công (contract §13.7). Hệ thống KHÔNG gọi cổng thanh toán.
 * Trả AdminOrder mới nhất.
 */
export async function refundPayment(code: string, body: RefundPaymentBody): Promise<AdminOrder> {
  const { data } = await api.post<AdminOrder>(
    `/admin/orders/${encodeURIComponent(code)}/refunds`,
    body,
  );
  return data;
}
