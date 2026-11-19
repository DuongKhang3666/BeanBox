export type ContactStatus = "NEW" | "IN_PROGRESS" | "RESOLVED" | "SPAM";

/** Item GET /admin/contact-messages và :id, kết quả PATCH (§14.11). */
export interface ContactMessageItem {
  id: string;
  userId: string | null;
  name: string;
  email: string;
  phone: string | null;
  subject: string | null;
  message: string;
  status: ContactStatus;
  adminNote: string | null;
  handledBy: { id: string; fullName: string } | null;
  handledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContactMessageQuery {
  status?: ContactStatus;
  q?: string;
  page?: number;
  pageSize?: number;
}
