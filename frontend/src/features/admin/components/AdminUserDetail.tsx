"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Label } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/features/auth/AuthProvider";
import { FormError, FormNotice } from "@/features/auth/components/FormError";
import { orderStatusLabel } from "@/features/orders/labels";
import { useResource } from "@/features/orders/useResource";
import { ApiError } from "@/lib/api/errors";
import { formatVND } from "@/lib/format";
import type { AdminUserDetail } from "@/types/adminUsers";
import type { UserRole } from "@/types/auth";
import {
  getAdminUser,
  resetAdminUserTwoFactor,
  updateAdminUserRole,
  updateAdminUserStatus,
} from "../api/users";
import { adminErrorMessage } from "../errors";
import { formatVnDateTime } from "../format";
import { USERS_BASE, USER_ROLES, USER_ROLE_LABEL, isTempLocked } from "../userFilters";
import { AdminModal } from "./AdminModal";
import { UsersForbidden } from "./AdminUsers";
import { UserRoleBadge, UserStatusBadges } from "./UserBadges";

const load = (id: string) => getAdminUser(id);

const REASON_MAX = 255;
const selectClass =
  "h-11 w-full rounded-lg border border-coffee-400 bg-white px-3 text-base text-coffee-900 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-moss-600";

type Dialog = "lock" | "unlock" | "clearLock" | "role" | "reset2fa";

/** Lỗi thao tác người dùng -> tiếng Việt; ưu tiên message server nếu có. */
export function userActionError(err: unknown): string {
  if (err instanceof ApiError) {
    const server = err.message?.trim();
    switch (err.code) {
      case "CANNOT_MODIFY_SELF":
        return server || "Bạn không thể khóa hoặc đổi vai trò của chính mình.";
      case "LAST_ADMIN":
        return (
          server ||
          "Không thể thực hiện vì hệ thống phải còn ít nhất một quản trị viên đang hoạt động."
        );
      case "TWO_FACTOR_NOT_ENABLED":
        return server || "Người dùng chưa bật xác thực 2 lớp.";
      case "NOT_FOUND":
        return server || "Không tìm thấy người dùng.";
      case "VALIDATION_ERROR":
        return server || "Dữ liệu không hợp lệ. Vui lòng kiểm tra lại.";
      default:
        break;
    }
  }
  return adminErrorMessage(err);
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-coffee-200 bg-white p-4 sm:p-5">
      <h2 className="font-serif text-lg font-bold text-coffee-900">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-coffee-700">{label}</dt>
      <dd className="break-words text-coffee-900">{children}</dd>
    </div>
  );
}

function NotFound() {
  return (
    <div className="space-y-3 rounded-2xl border border-coffee-200 bg-white p-6 text-center">
      <h1 className="font-serif text-xl font-bold text-coffee-900">Không tìm thấy người dùng</h1>
      <Link href={USERS_BASE} className={buttonClasses("primary")}>
        Về danh sách người dùng
      </Link>
    </div>
  );
}

function ConfirmDialog({
  title,
  description,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onClose,
  children,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  return (
    <AdminModal title={title} description={description} busy={busy} onClose={onClose}>
      <div className="space-y-4">
        {children}
        <div className="flex flex-wrap justify-end gap-2">
          <Button data-autofocus variant="outline" disabled={busy} onClick={onClose}>
            Hủy
          </Button>
          <Button variant={danger ? "danger" : "primary"} loading={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </AdminModal>
  );
}

export function AdminUserDetail({ id }: { id: string }) {
  const { user: me } = useAuth();
  const isAdmin = me?.role === "ADMIN";
  const res = useResource<AdminUserDetail>(isAdmin ? id : null, load);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [reason, setReason] = useState("");
  const [newRole, setNewRole] = useState<UserRole | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [alert, setAlert] = useState<string | null>(null);

  if (me && !isAdmin) return <UsersForbidden />;

  if (res.status === "loading" || res.status === "idle") {
    return (
      <div aria-busy="true" aria-label="Đang tải người dùng" role="status" className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (res.status === "error") {
    if (res.error instanceof ApiError) {
      if (res.error.status === 404) return <NotFound />;
      if (res.error.status === 403) return <UsersForbidden />;
    }
    return (
      <ErrorState
        title="Không tải được người dùng"
        description={adminErrorMessage(res.error)}
        onRetry={res.retry}
      />
    );
  }

  const u = res.data!;
  const isSelf = me?.id === u.id;
  const tempLocked = u.status === "ACTIVE" && isTempLocked(u.lockedUntil);
  const roleChoice = newRole ?? u.role;

  function close() {
    if (busy) return;
    setDialog(null);
    setReason("");
  }

  async function run(fn: () => Promise<AdminUserDetail>, success: string) {
    setBusy(true);
    setAlert(null);
    setNotice(null);
    try {
      const updated = await fn();
      res.setData(updated);
      setNewRole(null);
      setNotice(success);
    } catch (e) {
      setAlert(userActionError(e));
    } finally {
      setBusy(false);
      setDialog(null);
      setReason("");
    }
  }

  const confirm = () => {
    if (dialog === "lock") {
      const r = reason.trim();
      return run(
        () => updateAdminUserStatus(u.id, { status: "DISABLED", ...(r ? { reason: r } : {}) }),
        "Đã khóa tài khoản.",
      );
    }
    if (dialog === "unlock") {
      return run(() => updateAdminUserStatus(u.id, { status: "ACTIVE" }), "Đã mở khóa tài khoản.");
    }
    if (dialog === "clearLock") {
      return run(
        () => updateAdminUserStatus(u.id, { status: "ACTIVE" }),
        "Đã gỡ khóa tạm của tài khoản.",
      );
    }
    if (dialog === "reset2fa") {
      return run(
        () => resetAdminUserTwoFactor(u.id),
        "Đã đặt lại xác thực 2 lớp. Người dùng bị đăng xuất khỏi mọi thiết bị.",
      );
    }
    return run(
      () => updateAdminUserRole(u.id, { role: roleChoice }),
      `Đã đổi vai trò thành ${USER_ROLE_LABEL[roleChoice]}.`,
    );
  };

  return (
    <div className="space-y-5">
      <div>
        <Link href={USERS_BASE} className="text-sm font-medium text-moss-800 underline">
          ← Danh sách người dùng
        </Link>
        <h1 className="mt-1 font-serif text-2xl font-bold break-words text-coffee-900">
          {u.fullName}
        </h1>
        <div className="mt-2 flex flex-wrap gap-2">
          <UserRoleBadge role={u.role} />
          <UserStatusBadges user={u} />
        </div>
      </div>

      <div aria-live="polite" className="empty:hidden">
        <FormNotice>{notice}</FormNotice>
      </div>
      <FormError>{alert}</FormError>

      <Card title="Thông tin tài khoản">
        <dl className="grid gap-3 sm:grid-cols-2">
          <Field label="Email">{u.email}</Field>
          <Field label="Email đã xác thực">
            {u.emailVerified ? "Đã xác thực" : "Chưa xác thực"}
          </Field>
          <Field label="Số điện thoại">{u.phone ?? "—"}</Field>
          <Field label="Ngày tạo">{formatVnDateTime(u.createdAt)}</Field>
          <Field label="Đăng nhập cuối">
            {u.lastLoginAt ? formatVnDateTime(u.lastLoginAt) : "Chưa đăng nhập"}
          </Field>
          <Field label="Số địa chỉ">{u.addressCount}</Field>
          <Field label="Số phiên đang hoạt động">{u.activeSessions}</Field>
          <Field label="Xác thực 2 lớp">{u.twoFactorEnabled ? "Đã bật" : "Chưa bật"}</Field>
          {tempLocked && u.lockedUntil ? (
            <Field label="Khóa tạm đến">{formatVnDateTime(u.lockedUntil)}</Field>
          ) : null}
        </dl>
      </Card>

      <Card title="Đơn hàng">
        <dl className="grid gap-3 sm:grid-cols-2">
          <Field label="Tổng số đơn">{u.orders.count}</Field>
          <Field label="Tổng đã thanh toán">{formatVND(u.orders.paidTotal)}</Field>
        </dl>
        {u.orders.recent.length === 0 ? (
          <p className="text-sm text-coffee-700">Chưa có đơn hàng.</p>
        ) : (
          <ul aria-label="Đơn hàng gần nhất" className="divide-y divide-coffee-100">
            {u.orders.recent.map((o) => (
              <li key={o.code} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link
                  href={`/admin/don-hang/${encodeURIComponent(o.code)}`}
                  className="font-mono text-sm font-bold text-moss-800 underline"
                >
                  {o.code}
                </Link>
                <span className="text-sm text-coffee-800">
                  {orderStatusLabel(o.status)} · {formatVND(o.grandTotal)} ·{" "}
                  {formatVnDateTime(o.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Quản lý tài khoản">
        {u.deleted ? (
          <p className="text-coffee-800">
            Khách đã tự xóa tài khoản này (dữ liệu cá nhân đã được ẩn danh). Không thể khóa, mở khóa
            hay đổi vai trò.
          </p>
        ) : isSelf ? (
          <p className="text-coffee-800">Bạn không thể khóa hoặc đổi vai trò của chính mình.</p>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              {u.status === "ACTIVE" ? (
                <Button variant="danger" disabled={busy} onClick={() => setDialog("lock")}>
                  Khóa tài khoản
                </Button>
              ) : (
                <Button disabled={busy} onClick={() => setDialog("unlock")}>
                  Mở khóa
                </Button>
              )}
              {tempLocked ? (
                <Button variant="outline" disabled={busy} onClick={() => setDialog("clearLock")}>
                  Gỡ khóa tạm
                </Button>
              ) : null}
            </div>
            {u.twoFactorEnabled ? (
              <div>
                <Button variant="outline" disabled={busy} onClick={() => setDialog("reset2fa")}>
                  Đặt lại xác thực 2 lớp
                </Button>
                <p className="mt-1 text-sm text-coffee-700">
                  Người dùng này đang bật xác thực 2 lớp.
                </p>
              </div>
            ) : null}
            <div className="max-w-xs">
              <Label htmlFor="ud-role">Vai trò</Label>
              <select
                id="ud-role"
                className={selectClass}
                value={roleChoice}
                disabled={busy}
                onChange={(e) => setNewRole(e.target.value as UserRole)}
              >
                {USER_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {USER_ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
              <Button
                className="mt-2"
                variant="secondary"
                disabled={busy || roleChoice === u.role}
                onClick={() => setDialog("role")}
              >
                Đổi vai trò
              </Button>
            </div>
          </div>
        )}
      </Card>

      {dialog === "reset2fa" ? (
        <ConfirmDialog
          title="Đặt lại xác thực 2 lớp?"
          description="Dùng khi người dùng mất điện thoại và mã dự phòng. 2FA của họ sẽ bị tắt, mã dự phòng bị xóa và họ bị đăng xuất khỏi mọi thiết bị; họ có thể tự bật lại sau khi đăng nhập."
          confirmLabel="Đặt lại 2FA"
          danger
          busy={busy}
          onConfirm={confirm}
          onClose={close}
        />
      ) : null}
      {dialog === "lock" ? (
        <ConfirmDialog
          title="Khóa tài khoản?"
          description="Người dùng sẽ bị đăng xuất khỏi mọi thiết bị và không thể đăng nhập cho tới khi được mở khóa."
          confirmLabel="Khóa tài khoản"
          danger
          busy={busy}
          onConfirm={confirm}
          onClose={close}
        >
          <div>
            <Label htmlFor="ud-reason">Lý do (tùy chọn)</Label>
            <textarea
              id="ud-reason"
              rows={3}
              maxLength={REASON_MAX}
              value={reason}
              disabled={busy}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-lg border border-coffee-400 bg-white px-3 py-2 text-base text-coffee-900 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-moss-600"
            />
            <p className="text-xs text-coffee-700">
              {reason.length}/{REASON_MAX} ký tự
            </p>
          </div>
        </ConfirmDialog>
      ) : null}
      {dialog === "unlock" ? (
        <ConfirmDialog
          title="Mở khóa tài khoản?"
          description="Người dùng sẽ có thể đăng nhập lại."
          confirmLabel="Mở khóa"
          busy={busy}
          onConfirm={confirm}
          onClose={close}
        />
      ) : null}
      {dialog === "clearLock" ? (
        <ConfirmDialog
          title="Gỡ khóa tạm?"
          description="Tài khoản đang bị khóa tạm do đăng nhập sai nhiều lần. Gỡ khóa để người dùng đăng nhập lại ngay."
          confirmLabel="Gỡ khóa tạm"
          busy={busy}
          onConfirm={confirm}
          onClose={close}
        />
      ) : null}
      {dialog === "role" ? (
        <ConfirmDialog
          title="Đổi vai trò?"
          description={`Đổi vai trò từ ${USER_ROLE_LABEL[u.role]} thành ${USER_ROLE_LABEL[roleChoice]}. Người dùng sẽ bị đăng xuất khỏi mọi thiết bị và phải đăng nhập lại.${
            roleChoice === "ADMIN"
              ? " Quản trị viên là quyền cao nhất: xem và thay đổi mọi dữ liệu, kể cả người dùng và cài đặt."
              : ""
          }`}
          confirmLabel="Đổi vai trò"
          danger={roleChoice === "ADMIN"}
          busy={busy}
          onConfirm={confirm}
          onClose={close}
        />
      ) : null}
    </div>
  );
}
