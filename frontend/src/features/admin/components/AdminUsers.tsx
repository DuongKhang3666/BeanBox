"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input, Label } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/features/auth/AuthProvider";
import { useResource } from "@/features/orders/useResource";
import type { PaginationMeta } from "@/types/api";
import type { AdminUserItem, AdminUserQuery } from "@/types/adminUsers";
import { listAdminUsers } from "../api/users";
import { adminErrorMessage } from "../errors";
import { formatVnDate, formatVnDateTime } from "../format";
import { ADMIN_PAGE_SIZE } from "../orderFilters";
import {
  USERS_BASE,
  USER_Q_MIN,
  USER_ROLES,
  USER_ROLE_LABEL,
  USER_SORTS,
  USER_SORT_LABEL,
  USER_STATUSES,
  USER_STATUS_LABEL,
  parseUserFilters,
  userApiQuery,
  userFiltersHref,
} from "../userFilters";
import { AdminPager } from "./AdminPager";
import { UserRoleBadge, UserStatusBadges } from "./UserBadges";
import { useDebouncedUrlInput } from "../useDebouncedUrlInput";

type Loaded = { data: AdminUserItem[]; meta: PaginationMeta };

const load = (key: string) =>
  listAdminUsers({ ...(JSON.parse(key) as AdminUserQuery), pageSize: ADMIN_PAGE_SIZE });

const selectClass =
  "h-11 w-full rounded-lg border border-coffee-400 bg-white px-3 text-base text-coffee-900 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-moss-600";
const th = "px-3 py-3 font-medium";

function ListSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Đang tải danh sách người dùng"
      role="status"
      className="space-y-3"
    >
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}

function UserLink({ u }: { u: AdminUserItem }) {
  return (
    <Link
      href={`${USERS_BASE}/${encodeURIComponent(u.id)}`}
      className="font-medium break-words text-moss-800 underline"
    >
      {u.fullName}
    </Link>
  );
}

function UsersTable({ items }: { items: AdminUserItem[] }) {
  return (
    <div className="hidden overflow-x-auto rounded-2xl border border-coffee-200 bg-white md:block">
      <table className="w-full text-left text-sm text-coffee-900">
        <caption className="sr-only">Danh sách người dùng</caption>
        <thead className="bg-cream-50 text-coffee-700">
          <tr>
            <th scope="col" className={th}>
              Họ tên
            </th>
            <th scope="col" className={th}>
              Email
            </th>
            <th scope="col" className={th}>
              SĐT
            </th>
            <th scope="col" className={th}>
              Vai trò
            </th>
            <th scope="col" className={th}>
              Trạng thái
            </th>
            <th scope="col" className={`${th} text-right`}>
              Số đơn
            </th>
            <th scope="col" className={th}>
              Đăng nhập cuối
            </th>
            <th scope="col" className={th}>
              Ngày tạo
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-coffee-100">
          {items.map((u) => (
            <tr key={u.id}>
              <td className="px-3 py-3">
                <UserLink u={u} />
              </td>
              <td className="px-3 py-3 break-all">{u.email}</td>
              <td className="px-3 py-3 whitespace-nowrap">{u.phone ?? "—"}</td>
              <td className="px-3 py-3">
                <UserRoleBadge role={u.role} />
              </td>
              <td className="px-3 py-3">
                <UserStatusBadges user={u} />
              </td>
              <td className="px-3 py-3 text-right">{u.orderCount}</td>
              <td className="px-3 py-3 whitespace-nowrap">
                {u.lastLoginAt ? formatVnDateTime(u.lastLoginAt) : "Chưa đăng nhập"}
              </td>
              <td className="px-3 py-3 whitespace-nowrap">{formatVnDate(u.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UsersCards({ items }: { items: AdminUserItem[] }) {
  return (
    <ul className="space-y-3 md:hidden">
      {items.map((u) => (
        <li key={u.id} className="space-y-2 rounded-2xl border border-coffee-200 bg-white p-4">
          <p>
            <UserLink u={u} />
          </p>
          <div className="flex flex-wrap gap-2">
            <UserRoleBadge role={u.role} />
            <UserStatusBadges user={u} />
          </div>
          <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
            <dt className="text-coffee-700">Email</dt>
            <dd className="break-all">{u.email}</dd>
            <dt className="text-coffee-700">SĐT</dt>
            <dd>{u.phone ?? "—"}</dd>
            <dt className="text-coffee-700">Số đơn</dt>
            <dd>{u.orderCount}</dd>
            <dt className="text-coffee-700">Đăng nhập cuối</dt>
            <dd>{u.lastLoginAt ? formatVnDateTime(u.lastLoginAt) : "Chưa đăng nhập"}</dd>
            <dt className="text-coffee-700">Ngày tạo</dt>
            <dd>{formatVnDate(u.createdAt)}</dd>
          </dl>
        </li>
      ))}
    </ul>
  );
}

export function UsersForbidden() {
  return (
    <div
      role="alert"
      className="mx-auto max-w-md space-y-3 rounded-2xl border border-coffee-200 bg-white p-6 text-center"
    >
      <h1 className="font-serif text-xl font-bold text-coffee-900">
        Bạn không đủ quyền xem trang này
      </h1>
      <p className="text-coffee-800">Chỉ quản trị viên mới xem được trang này.</p>
      <Link href="/admin" className={buttonClasses("primary")}>
        Về tổng quan
      </Link>
    </div>
  );
}

export function AdminUsers() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const router = useRouter();
  const params = useSearchParams();
  const paramsKey = params.toString();
  const filters = useMemo(() => parseUserFilters(new URLSearchParams(paramsKey)), [paramsKey]);
  const urlQ = filters.q ?? "";
  const [qInput, setQInput] = useState(urlQ);

  // Debounce ô tìm kiếm -> URL.
  useDebouncedUrlInput(qInput, urlQ, (v) =>
    router.replace(userFiltersHref({ ...filters, q: v, page: undefined })),
  );

  const qTooShort = urlQ.length > 0 && urlQ.length < USER_Q_MIN;
  // Chỉ gọi API khi là ADMIN và q hợp lệ; STAFF thấy thông báo (backend vẫn chặn 403).
  const key = isAdmin && !qTooShort ? JSON.stringify(userApiQuery(filters)) : null;
  const res = useResource<Loaded>(key, load);

  if (user && !isAdmin) return <UsersForbidden />;

  function apply(patch: Partial<AdminUserQuery>) {
    router.replace(userFiltersHref({ ...filters, ...patch, page: undefined }));
  }

  const filtered = Object.keys(filters).some((k) => k !== "page" && k !== "sort");

  let body: React.ReactNode;
  if (qTooShort) {
    body = (
      <p
        role="status"
        className="rounded-2xl border border-coffee-200 bg-white p-4 text-coffee-800"
      >
        Nhập ít nhất {USER_Q_MIN} ký tự để tìm kiếm.
      </p>
    );
  } else if (res.status === "loading" || res.status === "idle") body = <ListSkeleton />;
  else if (res.status === "error") {
    if (res.error && (res.error as { status?: number }).status === 403) {
      body = <UsersForbidden />;
    } else {
      body = (
        <ErrorState
          title="Không tải được danh sách người dùng"
          description={adminErrorMessage(res.error)}
          onRetry={res.retry}
        />
      );
    }
  } else if (res.data!.data.length === 0) {
    body = (
      <EmptyState
        title="Không có người dùng nào"
        description={
          filtered ? "Không có người dùng nào khớp bộ lọc hiện tại." : "Chưa có người dùng."
        }
        action={
          filtered ? (
            <Link href={USERS_BASE} className={buttonClasses("outline")}>
              Xóa bộ lọc
            </Link>
          ) : undefined
        }
      />
    );
  } else {
    const { data, meta } = res.data!;
    body = (
      <>
        <p className="mb-3 text-sm text-coffee-700">{meta.total} người dùng</p>
        <UsersTable items={data} />
        <UsersCards items={data} />
        <AdminPager
          page={meta.page}
          totalPages={meta.totalPages}
          hrefFor={(p) => userFiltersHref({ ...filters, page: p })}
        />
      </>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="font-serif text-2xl font-bold text-coffee-900">Người dùng</h1>

      <form
        role="search"
        aria-label="Bộ lọc người dùng"
        onSubmit={(e) => e.preventDefault()}
        className="grid gap-3 rounded-2xl border border-coffee-200 bg-white p-4 sm:grid-cols-2"
      >
        <div className="sm:col-span-2">
          <Label htmlFor="us-q">Tìm theo email, họ tên hoặc SĐT</Label>
          <Input
            id="us-q"
            type="search"
            value={qInput}
            maxLength={100}
            autoComplete="off"
            onChange={(e) => setQInput(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="us-role">Vai trò</Label>
          <select
            id="us-role"
            className={selectClass}
            value={filters.role ?? ""}
            onChange={(e) =>
              apply({ role: (e.target.value || undefined) as AdminUserQuery["role"] })
            }
          >
            <option value="">Tất cả</option>
            {USER_ROLES.map((r) => (
              <option key={r} value={r}>
                {USER_ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="us-status">Trạng thái</Label>
          <select
            id="us-status"
            className={selectClass}
            value={filters.status ?? ""}
            onChange={(e) =>
              apply({ status: (e.target.value || undefined) as AdminUserQuery["status"] })
            }
          >
            <option value="">Tất cả</option>
            {USER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {USER_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="us-sort">Sắp xếp</Label>
          <select
            id="us-sort"
            className={selectClass}
            value={filters.sort ?? "newest"}
            onChange={(e) => apply({ sort: e.target.value as AdminUserQuery["sort"] })}
          >
            {USER_SORTS.map((s) => (
              <option key={s} value={s}>
                {USER_SORT_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      </form>

      {body}
    </div>
  );
}
