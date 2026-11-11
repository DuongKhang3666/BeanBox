import { api } from "@/lib/api/client";
import type { AdminCoupon, AdminCouponQuery, CouponInput } from "@/types/admin";
import type { PaginationMeta } from "@/types/api";

const enc = encodeURIComponent;

/** GET /admin/coupons (§13.8). */
export async function listAdminCoupons(query: AdminCouponQuery, signal?: AbortSignal) {
  const { data, meta } = await api.get<AdminCoupon[], Partial<PaginationMeta>>("/admin/coupons", {
    query: { ...query },
    signal,
  });
  return {
    data,
    meta: {
      page: meta?.page ?? 1,
      pageSize: meta?.pageSize ?? data.length,
      total: meta?.total ?? data.length,
      totalPages: meta?.totalPages ?? 1,
    } satisfies PaginationMeta,
  };
}

export async function getAdminCoupon(id: string): Promise<AdminCoupon> {
  const { data } = await api.get<AdminCoupon>(`/admin/coupons/${enc(id)}`);
  return data;
}

export async function createAdminCoupon(body: CouponInput): Promise<AdminCoupon> {
  const { data } = await api.post<AdminCoupon>("/admin/coupons", body);
  return data;
}

/** Không gửi `code`/`type` (server trả 400). */
export async function updateAdminCoupon(id: string, body: CouponInput): Promise<AdminCoupon> {
  const { data } = await api.patch<AdminCoupon>(`/admin/coupons/${enc(id)}`, body);
  return data;
}

/** Chỉ ADMIN. 409 CONFLICT khi mã đã được dùng. */
export async function deleteAdminCoupon(id: string): Promise<void> {
  await api.delete(`/admin/coupons/${enc(id)}`);
}
