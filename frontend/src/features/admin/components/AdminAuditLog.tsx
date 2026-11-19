"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { FieldError, Input, Label } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/features/auth/AuthProvider";
import { useResource } from "@/features/orders/useResource";
import type { AuditLogItem, AuditLogQuery } from "@/types/admin";
import type { PaginationMeta } from "@/types/api";
import { listAuditLogs } from "../api/audit";
import {
  AUDIT_BASE,
  AUDIT_ENTITY_SUGGESTIONS,
  AUDIT_GROUPS,
  auditHref,
  parseAuditFilters,
} from "../auditFilters";
import {
  ROLE_LABEL,
  auditActionLabel,
  auditEntityHref,
  auditEntityLabel,
  diffRows,
} from "../auditLabels";
import { adminErrorMessage } from "../errors";
import { formatVnDateTime } from "../format";
import { ADMIN_PAGE_SIZE } from "../orderFilters";
import { AdminModal } from "./AdminModal";
import { AdminPager } from "./AdminPager";

type Loaded = { data: AuditLogItem[]; meta: PaginationMeta };

const load = (key: string) =>
  listAuditLogs({ ...(JSON.parse(key) as AuditLogQuery), pageSize: ADMIN_PAGE_SIZE });

const selectClass =
  "h-11 w-full rounded-lg border border-coffee-400 bg-white px-3 text-base text-coffee-900 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-moss-600";
const th = "px-3 py-3 font-medium";

function ListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Đang tải nhật ký" role="status" className="space-y-3">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}

function Actor({ item }: { item: AuditLogItem }) {
  if (!item.actor) return <span className="text-coffee-700">Hệ thống</span>;
  return (
    <span>
      {item.actor.fullName}
      <span className="block text-xs text-coffee-700">
        {ROLE_LABEL[item.actor.role] ?? item.actor.role}
      </span>
    </span>
  );
}

function Target({ item }: { item: AuditLogItem }) {
  const href = auditEntityHref(item);
  return (
    <span className="min-w-0">
      <span className="block">{auditEntityLabel(item.entity)}</span>
      {item.entityId ? (
        href ? (
          <Link
            href={href}
            className="font-mono text-xs font-bold break-all text-moss-800 underline"
          >
            {item.entityId}
          </Link>
        ) : (
          <span className="font-mono text-xs break-all text-coffee-700">{item.entityId}</span>
        )
      ) : null}
    </span>
  );
}

function DiffDialog({ item, onClose }: { item: AuditLogItem; onClose: () => void }) {
  const rows = diffRows(item.diff);
  return (
    <AdminModal
      title={auditActionLabel(item.action)}
      description={`${formatVnDateTime(item.createdAt)} · ${item.actor?.fullName ?? "Hệ thống"}`}
      onClose={onClose}
    >
      <div className="space-y-4">
        <p className="font-mono text-xs break-all text-coffee-700">{item.action}</p>
        {rows.length === 0 ? (
          <p className="text-sm text-coffee-800">Không có chi tiết thay đổi.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-coffee-200">
            <table className="w-full text-left text-sm text-coffee-900">
              <caption className="sr-only">Thay đổi của thao tác</caption>
              <thead className="bg-cream-50 text-coffee-700">
                <tr>
                  <th scope="col" className={th}>
                    Trường
                  </th>
                  <th scope="col" className={th}>
                    Trước
                  </th>
                  <th scope="col" className={th}>
                    Sau
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-coffee-100">
                {rows.map((r) => (
                  <tr key={r.field}>
                    <th scope="row" className="px-3 py-2 align-top font-mono text-xs font-medium">
                      {r.field}
                    </th>
                    <td className="px-3 py-2 align-top break-words whitespace-pre-wrap">
                      {r.before}
                    </td>
                    <td className="px-3 py-2 align-top break-words whitespace-pre-wrap">
                      {r.after}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex justify-end">
          <Button data-autofocus variant="outline" onClick={onClose}>
            Đóng
          </Button>
        </div>
      </div>
    </AdminModal>
  );
}

function DetailButton({ item, onOpen }: { item: AuditLogItem; onOpen: () => void }) {
  return (
    <Button
      size="sm"
      variant="outline"
      aria-label={`Chi tiết: ${auditActionLabel(item.action)}, ${formatVnDateTime(item.createdAt)}`}
      onClick={onOpen}
    >
      Chi tiết
    </Button>
  );
}

function AuditTable({
  items,
  onOpen,
}: {
  items: AuditLogItem[];
  onOpen: (i: AuditLogItem) => void;
}) {
  return (
    <div className="hidden overflow-x-auto rounded-2xl border border-coffee-200 bg-white md:block">
      <table className="w-full text-left text-sm text-coffee-900">
        <caption className="sr-only">Nhật ký thao tác</caption>
        <thead className="bg-cream-50 text-coffee-700">
          <tr>
            <th scope="col" className={th}>
              Thời gian
            </th>
            <th scope="col" className={th}>
              Người thao tác
            </th>
            <th scope="col" className={th}>
              Hành động
            </th>
            <th scope="col" className={th}>
              Đối tượng
            </th>
            <th scope="col" className={th}>
              IP
            </th>
            <th scope="col" className={th}>
              <span className="sr-only">Chi tiết</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-coffee-100">
          {items.map((it) => (
            <tr key={it.id}>
              <td className="px-3 py-3 whitespace-nowrap">{formatVnDateTime(it.createdAt)}</td>
              <td className="px-3 py-3">
                <Actor item={it} />
              </td>
              <td className="px-3 py-3">
                {auditActionLabel(it.action)}
                <span className="block font-mono text-xs break-all text-coffee-700">
                  {it.action}
                </span>
              </td>
              <td className="px-3 py-3">
                <Target item={it} />
              </td>
              <td className="px-3 py-3 font-mono text-xs">{it.ip ?? "—"}</td>
              <td className="px-3 py-3 text-right">
                <DetailButton item={it} onOpen={() => onOpen(it)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuditCards({
  items,
  onOpen,
}: {
  items: AuditLogItem[];
  onOpen: (i: AuditLogItem) => void;
}) {
  return (
    <ul className="space-y-3 md:hidden">
      {items.map((it) => (
        <li key={it.id} className="space-y-2 rounded-2xl border border-coffee-200 bg-white p-4">
          <p className="font-medium text-coffee-900">{auditActionLabel(it.action)}</p>
          <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
            <dt className="text-coffee-700">Thời gian</dt>
            <dd>{formatVnDateTime(it.createdAt)}</dd>
            <dt className="text-coffee-700">Người thao tác</dt>
            <dd>
              <Actor item={it} />
            </dd>
            <dt className="text-coffee-700">Đối tượng</dt>
            <dd>
              <Target item={it} />
            </dd>
            <dt className="text-coffee-700">IP</dt>
            <dd className="font-mono text-xs">{it.ip ?? "—"}</dd>
          </dl>
          <DetailButton item={it} onOpen={() => onOpen(it)} />
        </li>
      ))}
    </ul>
  );
}

function Forbidden() {
  return (
    <div
      role="alert"
      className="mx-auto max-w-md space-y-3 rounded-2xl border border-coffee-200 bg-white p-6 text-center"
    >
      <h1 className="font-serif text-xl font-bold text-coffee-900">
        Bạn không đủ quyền xem nhật ký thao tác
      </h1>
      <p className="text-coffee-800">Chỉ quản trị viên mới xem được nhật ký thao tác.</p>
      <Link href="/admin" className={buttonClasses("primary")}>
        Về tổng quan
      </Link>
    </div>
  );
}

export function AdminAuditLog() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const router = useRouter();
  const params = useSearchParams();
  const paramsKey = params.toString();
  const filters = useMemo(() => parseAuditFilters(new URLSearchParams(paramsKey)), [paramsKey]);
  const urlEntity = filters.entity ?? "";
  const [entityInput, setEntityInput] = useState(urlEntity);
  const [fromInput, setFromInput] = useState(filters.from ?? "");
  const [toInput, setToInput] = useState(filters.to ?? "");
  const [dateError, setDateError] = useState<string | null>(null);
  const [detail, setDetail] = useState<AuditLogItem | null>(null);

  // Debounce ô đối tượng -> URL.
  useEffect(() => {
    const t = entityInput.trim();
    if (t === urlEntity) return;
    const id = setTimeout(() => {
      router.replace(auditHref({ ...filters, entity: t || undefined, page: undefined }));
    }, 400);
    return () => clearTimeout(id);
  }, [entityInput, urlEntity, filters, router]);

  // Chỉ gọi API khi là ADMIN; STAFF thấy thông báo (backend vẫn chặn 403).
  const res = useResource<Loaded>(isAdmin ? JSON.stringify(filters) : null, load);

  if (user && !isAdmin) return <Forbidden />;

  function apply(patch: Partial<AuditLogQuery>) {
    router.replace(auditHref({ ...filters, ...patch, page: undefined }));
  }

  function onDate(field: "from" | "to", value: string) {
    const from = field === "from" ? value : fromInput;
    const to = field === "to" ? value : toInput;
    if (field === "from") setFromInput(value);
    else setToInput(value);
    if (from && to && from > to) {
      setDateError("Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.");
      return;
    }
    setDateError(null);
    apply({ from: from || undefined, to: to || undefined });
  }

  const filtered = Object.keys(filters).some((k) => k !== "page");

  let body: React.ReactNode;
  if (res.status === "loading" || res.status === "idle") body = <ListSkeleton />;
  else if (res.status === "error") {
    body = (
      <ErrorState
        title="Không tải được nhật ký"
        description={adminErrorMessage(res.error)}
        onRetry={res.retry}
      />
    );
  } else if (res.data!.data.length === 0) {
    body = (
      <EmptyState
        title="Chưa có thao tác nào"
        description={
          filtered ? "Không có thao tác nào khớp bộ lọc hiện tại." : "Chưa có nhật ký thao tác."
        }
        action={
          filtered ? (
            <Link href={AUDIT_BASE} className={buttonClasses("outline")}>
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
        <p className="mb-3 text-sm text-coffee-700">{meta.total} thao tác</p>
        <AuditTable items={data} onOpen={setDetail} />
        <AuditCards items={data} onOpen={setDetail} />
        <AdminPager
          page={meta.page}
          totalPages={meta.totalPages}
          hrefFor={(p) => auditHref({ ...filters, page: p })}
        />
      </>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="font-serif text-2xl font-bold text-coffee-900">Nhật ký thao tác</h1>

      <form
        role="search"
        aria-label="Bộ lọc nhật ký"
        onSubmit={(e) => e.preventDefault()}
        className="grid gap-3 rounded-2xl border border-coffee-200 bg-white p-4 sm:grid-cols-2"
      >
        {filters.actorId || filters.entityId ? (
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            {filters.actorId ? (
              <span className="rounded-full bg-cream-200 px-3 py-1 text-sm text-coffee-900">
                Đang lọc theo một người thao tác
              </span>
            ) : null}
            {filters.entityId ? (
              <span className="rounded-full bg-cream-200 px-3 py-1 text-sm text-coffee-900">
                Đang lọc theo một đối tượng
              </span>
            ) : null}
            <Link
              href={auditHref({
                ...filters,
                actorId: undefined,
                entityId: undefined,
                page: undefined,
              })}
              className="text-sm font-medium text-moss-800 underline"
            >
              Bỏ lọc này
            </Link>
          </div>
        ) : null}
        <div>
          <Label htmlFor="au-group">Nhóm hành động</Label>
          <select
            id="au-group"
            className={selectClass}
            value={filters.actionPrefix ?? ""}
            onChange={(e) => apply({ actionPrefix: e.target.value || undefined })}
          >
            <option value="">Tất cả</option>
            {AUDIT_GROUPS.map((g) => (
              <option key={g.prefix} value={g.prefix}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="au-entity">Đối tượng (entity)</Label>
          <Input
            id="au-entity"
            list="au-entity-list"
            value={entityInput}
            maxLength={40}
            autoComplete="off"
            onChange={(e) => setEntityInput(e.target.value)}
          />
          <datalist id="au-entity-list">
            {AUDIT_ENTITY_SUGGESTIONS.map((e) => (
              <option key={e} value={e} />
            ))}
          </datalist>
        </div>
        <div>
          <Label htmlFor="au-from">Từ ngày</Label>
          <Input
            id="au-from"
            type="date"
            value={fromInput}
            invalid={Boolean(dateError)}
            aria-describedby={dateError ? "au-date-err" : undefined}
            onChange={(e) => onDate("from", e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="au-to">Đến ngày</Label>
          <Input
            id="au-to"
            type="date"
            value={toInput}
            invalid={Boolean(dateError)}
            aria-describedby={dateError ? "au-date-err" : undefined}
            onChange={(e) => onDate("to", e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <FieldError id="au-date-err">{dateError}</FieldError>
        </div>
      </form>

      {body}

      {detail ? <DiffDialog item={detail} onClose={() => setDetail(null)} /> : null}
    </div>
  );
}
