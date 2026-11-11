import { api } from "@/lib/api/client";
import type { AdminBrand, AdminCategory, BrandInput, CategoryInput } from "@/types/admin";

/** GET /admin/categories: cây 2 cấp, gồm danh mục ẩn, không phân trang. */
export async function listAdminCategories(): Promise<AdminCategory[]> {
  const { data } = await api.get<AdminCategory[]>("/admin/categories");
  return data;
}

export async function createAdminCategory(body: CategoryInput): Promise<AdminCategory> {
  const { data } = await api.post<AdminCategory>("/admin/categories", body);
  return data;
}

export async function updateAdminCategory(id: string, body: CategoryInput): Promise<AdminCategory> {
  const { data } = await api.patch<AdminCategory>(
    `/admin/categories/${encodeURIComponent(id)}`,
    body,
  );
  return data;
}

/** Chỉ ADMIN. 409 CONFLICT `details: { childCount, productCount }`. */
export async function deleteAdminCategory(id: string): Promise<void> {
  await api.delete(`/admin/categories/${encodeURIComponent(id)}`);
}

export async function listAdminBrands(): Promise<AdminBrand[]> {
  const { data } = await api.get<AdminBrand[]>("/admin/brands");
  return data;
}

export async function createAdminBrand(body: BrandInput): Promise<AdminBrand> {
  const { data } = await api.post<AdminBrand>("/admin/brands", body);
  return data;
}

export async function updateAdminBrand(id: string, body: BrandInput): Promise<AdminBrand> {
  const { data } = await api.patch<AdminBrand>(`/admin/brands/${encodeURIComponent(id)}`, body);
  return data;
}

/** Chỉ ADMIN. 409 CONFLICT `details: { productCount }`. */
export async function deleteAdminBrand(id: string): Promise<void> {
  await api.delete(`/admin/brands/${encodeURIComponent(id)}`);
}
