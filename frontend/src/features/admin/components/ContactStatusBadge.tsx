import type { ContactStatus } from "@/types/adminContact";
import { CONTACT_STATUS_LABEL } from "../contactFilters";

const TONE: Record<ContactStatus, string> = {
  NEW: "bg-coffee-800 text-cream-50",
  IN_PROGRESS: "bg-cream-200 text-coffee-900",
  RESOLVED: "bg-moss-100 text-moss-800",
  SPAM: "bg-danger-50 text-danger-600",
};

export function ContactStatusBadge({ status }: { status: ContactStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE[status] ?? "bg-cream-200 text-coffee-900"}`}
    >
      {CONTACT_STATUS_LABEL[status] ?? status}
    </span>
  );
}
