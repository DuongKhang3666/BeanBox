import { api } from "@/lib/api/client";
import type {
  AdminImage,
  AdminProduct,
  AdminProductListItem,
  AdminProductQuery,
  AdminVariant,
  ImageInput,
  ProductInput,
  UploadResult,
  VariantInput,
} from "@/types/admin";
import type { PaginationMeta } from "@/types/api";

const enc = encodeURIComponent;

/** GET /admin/products. `status` nhiều giá trị phân cách phẩy; `deleted` chỉ gửi khi true. */
export async function listAdminProducts(query: AdminProductQuery, signal?: AbortSignal) {
  const { status, deleted, ...rest } = query;
  const { data, meta } = await api.get<AdminProductListItem[], Partial<PaginationMeta>>(
    "/admin/products",
    {
      query: { ...rest, status: status?.join(","), deleted: deleted ? "true" : undefined },
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
    } satisfies PaginationMeta,
  };
}

export async function getAdminProduct(id: string): Promise<AdminProduct> {
  const { data } = await api.get<AdminProduct>(`/admin/products/${enc(id)}`);
  return data;
}

export async function createAdminProduct(body: ProductInput): Promise<AdminProduct> {
  const { data } = await api.post<AdminProduct>("/admin/products", body);
  return data;
}

export async function updateAdminProduct(id: string, body: ProductInput): Promise<AdminProduct> {
  const { data } = await api.patch<AdminProduct>(`/admin/products/${enc(id)}`, body);
  return data;
}

/** Chỉ ADMIN. Xóa mềm. */
export async function deleteAdminProduct(id: string): Promise<void> {
  await api.delete(`/admin/products/${enc(id)}`);
}

export async function createAdminVariant(
  productId: string,
  body: VariantInput,
): Promise<AdminVariant> {
  const { data } = await api.post<AdminVariant>(`/admin/products/${enc(productId)}/variants`, body);
  return data;
}

/** `stock` bị server bỏ qua; đổi tồn qua /admin/inventory/adjust. */
export async function updateAdminVariant(id: string, body: VariantInput): Promise<AdminVariant> {
  const { data } = await api.patch<AdminVariant>(`/admin/variants/${enc(id)}`, body);
  return data;
}

export async function deleteAdminVariant(id: string): Promise<void> {
  await api.delete(`/admin/variants/${enc(id)}`);
}

/** POST /admin/uploads: body là file thô, Content-Type = file.type. */
export async function uploadAdminImage(file: File): Promise<UploadResult> {
  const { data } = await api.request<UploadResult>("/admin/uploads", {
    method: "POST",
    rawBody: file,
    contentType: file.type,
  });
  return data;
}

/** Các thao tác ảnh đều trả danh sách ảnh mới nhất. */
export async function addAdminImage(productId: string, body: ImageInput): Promise<AdminImage[]> {
  const { data } = await api.post<AdminImage[]>(`/admin/products/${enc(productId)}/images`, body);
  return data;
}

export async function updateAdminImage(
  productId: string,
  imageId: string,
  body: { alt?: string; isPrimary?: true },
): Promise<AdminImage[]> {
  const { data } = await api.patch<AdminImage[]>(
    `/admin/products/${enc(productId)}/images/${enc(imageId)}`,
    body,
  );
  return data;
}

export async function reorderAdminImages(
  productId: string,
  imageIds: string[],
): Promise<AdminImage[]> {
  const { data } = await api.put<AdminImage[]>(`/admin/products/${enc(productId)}/images/order`, {
    imageIds,
  });
  return data;
}

export async function deleteAdminImage(productId: string, imageId: string): Promise<AdminImage[]> {
  const { data } = await api.delete<AdminImage[]>(
    `/admin/products/${enc(productId)}/images/${enc(imageId)}`,
  );
  return data;
}
