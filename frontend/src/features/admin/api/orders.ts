import { api } from "@/lib/api/client";
import type {
  AdminOrder,
  AdminOrderListItem,
  AdminOrderNote,
  AdminOrdersPrintResult,
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
    {
      query: {
        ...query,
        needsRefund: query.needsRefund ? "true" : undefined,
        transferClaimed: query.transferClaimed ? "true" : undefined,
      },
      signal,
    },
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

/**
 * Xác nhận đã nhận tiền chuyển khoản (D-061, Staff+). Idempotent; trả AdminOrder mới nhất.
 * Hệ thống KHÔNG đối soát ngân hàng: nhân viên tự kiểm sao kê trước khi bấm.
 */
export async function confirmBankTransfer(code: string): Promise<AdminOrder> {
  const { data } = await api.post<AdminOrder>(
    `/admin/orders/${encodeURIComponent(code)}/bank-transfer/confirm`,
  );
  return data;
}

/** D-071: ghi chú nội bộ (Staff+ đọc/thêm, Admin xóa). Không có API sửa. */
export async function listOrderNotes(code: string): Promise<AdminOrderNote[]> {
  const { data } = await api.get<AdminOrderNote[]>(
    `/admin/orders/${encodeURIComponent(code)}/notes`,
  );
  return data;
}

export async function addOrderNote(code: string, body: string): Promise<AdminOrderNote> {
  const { data } = await api.post<AdminOrderNote>(
    `/admin/orders/${encodeURIComponent(code)}/notes`,
    { body },
  );
  return data;
}

export async function deleteOrderNote(code: string, noteId: string): Promise<void> {
  await api.delete<void>(
    `/admin/orders/${encodeURIComponent(code)}/notes/${encodeURIComponent(noteId)}`,
  );
}

/** Tối đa mã đơn mỗi lần in hàng loạt (D-072); khớp server. */
export const PRINT_MAX_CODES = 50;

/** D-072: dữ liệu phiếu in nhiều đơn trong 1 request; mã không tồn tại nằm ở `missing`. */
export async function printAdminOrders(codes: string[]): Promise<AdminOrdersPrintResult> {
  const { data, meta } = await api.get<AdminOrder[], { missing?: string[] }>(
    "/admin/orders/print",
    { query: { codes: codes.join(",") } },
  );
  return { orders: data, missing: meta?.missing ?? [] };
}
