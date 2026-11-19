import { api } from "@/lib/api/client";
import type { PaginationMeta } from "@/types/api";
import type { ContactMessageItem, ContactMessageQuery, ContactStatus } from "@/types/adminContact";

/** GET /admin/contact-messages (§14.11). Staff+. */
export async function listContactMessages(query: ContactMessageQuery, signal?: AbortSignal) {
  const { data, meta } = await api.get<ContactMessageItem[], Partial<PaginationMeta>>(
    "/admin/contact-messages",
    { query: { ...query }, signal },
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

export async function getContactMessage(
  id: string,
  signal?: AbortSignal,
): Promise<ContactMessageItem> {
  const { data } = await api.get<ContactMessageItem>(
    `/admin/contact-messages/${encodeURIComponent(id)}`,
    { signal },
  );
  return data;
}

export async function updateContactMessage(
  id: string,
  body: { status?: ContactStatus; adminNote?: string },
): Promise<ContactMessageItem> {
  const { data } = await api.patch<ContactMessageItem>(
    `/admin/contact-messages/${encodeURIComponent(id)}`,
    body,
  );
  return data;
}
