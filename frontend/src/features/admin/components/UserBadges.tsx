import type { AdminUserItem } from "@/types/adminUsers";
import type { UserRole } from "@/types/auth";
import { USER_ROLE_LABEL, USER_STATUS_LABEL, isTempLocked } from "../userFilters";

const base = "inline-block rounded-full px-2.5 py-0.5 text-xs font-medium";

export function UserRoleBadge({ role }: { role: UserRole }) {
  const tone =
    role === "ADMIN"
      ? "bg-coffee-800 text-cream-50"
      : role === "STAFF"
        ? "bg-moss-100 text-moss-800"
        : "bg-cream-200 text-coffee-900";
  return <span className={`${base} ${tone}`}>{USER_ROLE_LABEL[role] ?? role}</span>;
}

export function UserStatusBadges({
  user,
}: {
  user: Pick<AdminUserItem, "status" | "lockedUntil">;
}) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      <span
        className={`${base} ${
          user.status === "ACTIVE" ? "bg-moss-100 text-moss-800" : "bg-danger-50 text-danger-600"
        }`}
      >
        {USER_STATUS_LABEL[user.status] ?? user.status}
      </span>
      {isTempLocked(user.lockedUntil) ? (
        <span className={`${base} bg-cream-200 text-coffee-900`}>Khóa tạm</span>
      ) : null}
    </span>
  );
}
