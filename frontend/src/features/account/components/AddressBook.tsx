"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { mapAuthError } from "@/features/auth/errors";
import { FormError, FormNotice } from "@/features/auth/components/FormError";
import { ApiError } from "@/lib/api/errors";
import type { Address } from "@/types/account";
import { deleteAddress, listAddresses, setDefaultAddress } from "../api";
import { MAX_ADDRESSES } from "../validation";
import { AddressCard } from "./AddressCard";
import { AddressForm } from "./AddressForm";
import { ConfirmDialog } from "./ConfirmDialog";

type Status = "loading" | "error" | "ready";
type FormState = { mode: "create" } | { mode: "edit"; address: Address } | null;

const GONE_MESSAGE =
  "Địa chỉ này không còn tồn tại (có thể đã bị xóa ở thiết bị hoặc tab khác). Danh sách đã được tải lại.";

function ListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Đang tải sổ địa chỉ" className="space-y-3">
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-28 w-full" />
    </div>
  );
}

export function AddressBook() {
  const [status, setStatus] = useState<Status>("loading");
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [form, setForm] = useState<FormState>(null);
  const [notice, setNotice] = useState<string | undefined>();
  const [actionError, setActionError] = useState<string | undefined>();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Address | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const alive = useRef(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const load = useCallback(async (quiet: boolean) => {
    try {
      const list = await listAddresses();
      if (!alive.current) return;
      setAddresses(list);
      setStatus("ready");
    } catch {
      if (!alive.current) return;
      if (quiet) setActionError("Không thể tải lại danh sách. Vui lòng tải lại trang.");
      else setStatus("error");
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    // Tải lần đầu: setState chỉ chạy trong callback bất đồng bộ.
    listAddresses().then(
      (list) => {
        if (!alive.current) return;
        setAddresses(list);
        setStatus("ready");
      },
      () => {
        if (alive.current) setStatus("error");
      },
    );
    return () => {
      alive.current = false;
    };
  }, []);

  // Đóng form -> trả focus về nút đã mở nó (hoặc tiêu đề nếu nút không còn).
  useEffect(() => {
    if (form === null && returnFocus.current) {
      const el = returnFocus.current;
      returnFocus.current = null;
      (el.isConnected ? el : headingRef.current)?.focus();
    }
  }, [form]);

  function retry() {
    setStatus("loading");
    void load(false);
  }

  function openForm(next: FormState, trigger: HTMLElement | null) {
    returnFocus.current = trigger;
    setNotice(undefined);
    setActionError(undefined);
    setForm(next);
  }

  async function onSaved(message: string) {
    setForm(null);
    setNotice(message);
    setActionError(undefined);
    await load(true);
  }

  async function onGone() {
    setForm(null);
    setNotice(undefined);
    setActionError(GONE_MESSAGE);
    await load(true);
  }

  async function onSetDefault(a: Address) {
    if (busyId) return;
    setBusyId(a.id);
    setNotice(undefined);
    setActionError(undefined);
    try {
      await setDefaultAddress(a.id);
      setNotice("Đã đặt làm địa chỉ mặc định.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setActionError(GONE_MESSAGE);
      else setActionError(mapAuthError(err).formError);
    }
    await load(true);
    if (alive.current) setBusyId(null);
  }

  async function onConfirmDelete() {
    if (!deleting || deletingBusy) return;
    const target = deleting;
    setDeletingBusy(true);
    setBusyId(target.id);
    setNotice(undefined);
    setActionError(undefined);
    try {
      await deleteAddress(target.id);
      setNotice("Đã xóa địa chỉ.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setActionError(GONE_MESSAGE);
      else setActionError(mapAuthError(err).formError);
    }
    await load(true);
    if (!alive.current) return;
    setDeleting(null);
    setDeletingBusy(false);
    setBusyId(null);
    // Nút Xóa đã biến mất cùng thẻ: đưa focus về tiêu đề để không rơi ra <body>.
    setTimeout(() => {
      if (alive.current && document.activeElement === document.body) headingRef.current?.focus();
    }, 0);
  }

  const atLimit = addresses.length >= MAX_ADDRESSES;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="font-serif text-2xl font-bold text-coffee-900 outline-none sm:text-3xl"
        >
          Sổ địa chỉ
        </h1>
        {status === "ready" && addresses.length > 0 && !form ? (
          <Button
            onClick={(e) => openForm({ mode: "create" }, e.currentTarget)}
            disabled={atLimit}
            aria-describedby={atLimit ? "address-limit-note" : undefined}
          >
            Thêm địa chỉ
          </Button>
        ) : null}
      </div>

      {atLimit && status === "ready" ? (
        <p id="address-limit-note" className="text-sm text-coffee-700">
          Bạn đã có tối đa {MAX_ADDRESSES} địa chỉ. Hãy xóa bớt một địa chỉ để thêm địa chỉ mới.
        </p>
      ) : null}

      <FormNotice>{notice}</FormNotice>
      <FormError>{actionError}</FormError>

      {form ? (
        <AddressForm
          key={form.mode === "edit" ? form.address.id : "create"}
          address={form.mode === "edit" ? form.address : undefined}
          onSaved={onSaved}
          onCancel={() => setForm(null)}
          onGone={onGone}
        />
      ) : null}

      {status === "loading" ? <ListSkeleton /> : null}

      {status === "error" ? (
        <ErrorState
          title="Không tải được sổ địa chỉ"
          description="Vui lòng kiểm tra kết nối và thử lại."
          onRetry={retry}
        />
      ) : null}

      {status === "ready" && addresses.length === 0 && !form ? (
        <EmptyState
          title="Bạn chưa có địa chỉ nào"
          description="Thêm địa chỉ giao hàng để thanh toán nhanh hơn ở lần mua tiếp theo."
          action={
            <Button onClick={(e) => openForm({ mode: "create" }, e.currentTarget)}>
              Thêm địa chỉ
            </Button>
          }
        />
      ) : null}

      {status === "ready" && addresses.length > 0 ? (
        <ul className="space-y-3">
          {addresses.map((a) => (
            <AddressCard
              key={a.id}
              address={a}
              busy={busyId === a.id}
              onEdit={(addr, trigger) => openForm({ mode: "edit", address: addr }, trigger)}
              onDelete={(addr) => {
                setNotice(undefined);
                setActionError(undefined);
                setDeleting(addr);
              }}
              onSetDefault={onSetDefault}
            />
          ))}
        </ul>
      ) : null}

      {deleting ? (
        <ConfirmDialog
          title="Xóa địa chỉ này?"
          description={`Địa chỉ của ${deleting.fullName} (${deleting.line1}) sẽ bị xóa khỏi sổ địa chỉ.`}
          confirmLabel="Xóa địa chỉ"
          busy={deletingBusy}
          onConfirm={onConfirmDelete}
          onCancel={() => setDeleting(null)}
        />
      ) : null}
    </div>
  );
}
