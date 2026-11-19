"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input, Label } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { useResource } from "@/features/orders/useResource";
import type { PaginationMeta } from "@/types/api";
import type { ContactMessageItem, ContactMessageQuery } from "@/types/adminContact";
import { listContactMessages } from "../api/contact";
import {
  CONTACT_BASE,
  CONTACT_Q_MIN,
  CONTACT_STATUSES,
  CONTACT_STATUS_LABEL,
  contactApiQuery,
  contactExcerpt,
  contactFiltersHref,
  parseContactFilters,
} from "../contactFilters";
import { adminErrorMessage } from "../errors";
import { formatVnDateTime } from "../format";
import { ADMIN_PAGE_SIZE } from "../orderFilters";
import { AdminPager } from "./AdminPager";
import { ContactStatusBadge } from "./ContactStatusBadge";

type Loaded = { data: ContactMessageItem[]; meta: PaginationMeta };

const load = (key: string) =>
  listContactMessages({ ...(JSON.parse(key) as ContactMessageQuery), pageSize: ADMIN_PAGE_SIZE });

const selectClass =
  "h-11 w-full rounded-lg border border-coffee-400 bg-white px-3 text-base text-coffee-900 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-moss-600";
const th = "px-3 py-3 font-medium";

function ListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Đang tải tin nhắn" role="status" className="space-y-3">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}

function MessageLink({ m }: { m: ContactMessageItem }) {
  return (
    <Link
      href={`${CONTACT_BASE}/${encodeURIComponent(m.id)}`}
      className="font-medium break-words text-moss-800 underline"
    >
      {m.subject || "(không tiêu đề)"}
    </Link>
  );
}

function MessagesTable({ items }: { items: ContactMessageItem[] }) {
  return (
    <div className="hidden overflow-x-auto rounded-2xl border border-coffee-200 bg-white md:block">
      <table className="w-full text-left text-sm text-coffee-900">
        <caption className="sr-only">Danh sách tin nhắn liên hệ</caption>
        <thead className="bg-cream-50 text-coffee-700">
          <tr>
            <th scope="col" className={th}>
              Thời gian
            </th>
            <th scope="col" className={th}>
              Người gửi
            </th>
            <th scope="col" className={th}>
              Tiêu đề và nội dung
            </th>
            <th scope="col" className={th}>
              Trạng thái
            </th>
            <th scope="col" className={th}>
              Người xử lý
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-coffee-100">
          {items.map((m) => (
            <tr key={m.id}>
              <td className="px-3 py-3 whitespace-nowrap">{formatVnDateTime(m.createdAt)}</td>
              <td className="px-3 py-3">
                <p className="font-medium break-words">{m.name}</p>
                <p className="text-coffee-700 break-all">{m.email}</p>
              </td>
              <td className="max-w-md px-3 py-3">
                <MessageLink m={m} />
                <p className="text-coffee-700 break-words">{contactExcerpt(m.message)}</p>
              </td>
              <td className="px-3 py-3">
                <ContactStatusBadge status={m.status} />
              </td>
              <td className="px-3 py-3">{m.handledBy?.fullName ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MessagesCards({ items }: { items: ContactMessageItem[] }) {
  return (
    <ul className="space-y-3 md:hidden">
      {items.map((m) => (
        <li key={m.id} className="space-y-2 rounded-2xl border border-coffee-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ContactStatusBadge status={m.status} />
            <span className="text-sm text-coffee-700">{formatVnDateTime(m.createdAt)}</span>
          </div>
          <p>
            <MessageLink m={m} />
          </p>
          <p className="text-sm break-words text-coffee-800">{contactExcerpt(m.message)}</p>
          <p className="text-sm text-coffee-700">
            {m.name} · <span className="break-all">{m.email}</span>
          </p>
          {m.handledBy ? (
            <p className="text-sm text-coffee-700">Xử lý bởi {m.handledBy.fullName}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function AdminContactMessages() {
  const router = useRouter();
  const params = useSearchParams();
  const paramsKey = params.toString();
  const filters = useMemo(() => parseContactFilters(new URLSearchParams(paramsKey)), [paramsKey]);
  const urlQ = filters.q ?? "";
  const [qInput, setQInput] = useState(urlQ);

  // Debounce ô tìm kiếm -> URL.
  useEffect(() => {
    const t = qInput.trim();
    if (t === urlQ) return;
    const id = setTimeout(() => {
      router.replace(contactFiltersHref({ ...filters, q: t || undefined, page: undefined }));
    }, 400);
    return () => clearTimeout(id);
  }, [qInput, urlQ, filters, router]);

  const qTooShort = urlQ.length > 0 && urlQ.length < CONTACT_Q_MIN;
  const key = qTooShort ? null : JSON.stringify(contactApiQuery(filters));
  const res = useResource<Loaded>(key, load);

  function apply(patch: Partial<ContactMessageQuery>) {
    router.replace(contactFiltersHref({ ...filters, ...patch, page: undefined }));
  }

  const filtered = Object.keys(filters).some((k) => k !== "page");

  let body: React.ReactNode;
  if (qTooShort) {
    body = (
      <p
        role="status"
        className="rounded-2xl border border-coffee-200 bg-white p-4 text-coffee-800"
      >
        Nhập ít nhất {CONTACT_Q_MIN} ký tự để tìm kiếm.
      </p>
    );
  } else if (res.status === "loading" || res.status === "idle") body = <ListSkeleton />;
  else if (res.status === "error") {
    body = (
      <ErrorState
        title="Không tải được tin nhắn liên hệ"
        description={adminErrorMessage(res.error)}
        onRetry={res.retry}
      />
    );
  } else if (res.data!.data.length === 0) {
    body = (
      <EmptyState
        title="Không có tin nhắn nào"
        description={
          filtered ? "Không có tin nhắn nào khớp bộ lọc hiện tại." : "Chưa có tin nhắn liên hệ."
        }
        action={
          filtered ? (
            <Link href={CONTACT_BASE} className={buttonClasses("outline")}>
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
        <p className="mb-3 text-sm text-coffee-700">{meta.total} tin nhắn</p>
        <MessagesTable items={data} />
        <MessagesCards items={data} />
        <AdminPager
          page={meta.page}
          totalPages={meta.totalPages}
          hrefFor={(p) => contactFiltersHref({ ...filters, page: p })}
        />
      </>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="font-serif text-2xl font-bold text-coffee-900">Liên hệ</h1>

      <form
        role="search"
        aria-label="Bộ lọc tin nhắn liên hệ"
        onSubmit={(e) => e.preventDefault()}
        className="grid gap-3 rounded-2xl border border-coffee-200 bg-white p-4 sm:grid-cols-2"
      >
        <div>
          <Label htmlFor="ct-q">Tìm theo tên, email, tiêu đề hoặc nội dung</Label>
          <Input
            id="ct-q"
            type="search"
            value={qInput}
            maxLength={100}
            autoComplete="off"
            onChange={(e) => setQInput(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="ct-status">Trạng thái</Label>
          <select
            id="ct-status"
            className={selectClass}
            value={filters.status ?? ""}
            onChange={(e) =>
              apply({ status: (e.target.value || undefined) as ContactMessageQuery["status"] })
            }
          >
            <option value="">Tất cả</option>
            {CONTACT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {CONTACT_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      </form>

      {body}
    </div>
  );
}
