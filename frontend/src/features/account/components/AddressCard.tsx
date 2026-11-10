"use client";

import { Button } from "@/components/ui/Button";
import type { Address } from "@/types/account";

export function AddressCard({
  address,
  busy,
  onEdit,
  onDelete,
  onSetDefault,
}: {
  address: Address;
  busy: boolean;
  onEdit: (a: Address, trigger: HTMLElement) => void;
  onDelete: (a: Address, trigger: HTMLElement) => void;
  onSetDefault: (a: Address) => void;
}) {
  return (
    <li
      aria-busy={busy}
      className="rounded-2xl border border-coffee-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="font-semibold text-coffee-900">{address.fullName}</p>
        <p className="text-coffee-800">{address.phone}</p>
        {address.isDefault ? (
          <span className="rounded-full bg-moss-50 px-2.5 py-0.5 text-xs font-medium text-moss-800">
            Mặc định
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-coffee-800">
        {address.line1}, {address.wardName}, {address.provinceName}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={(e) => onEdit(address, e.currentTarget)}
          aria-label={`Sửa địa chỉ của ${address.fullName}`}
        >
          Sửa
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={(e) => onDelete(address, e.currentTarget)}
          aria-label={`Xóa địa chỉ của ${address.fullName}`}
        >
          Xóa
        </Button>
        {!address.isDefault ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => onSetDefault(address)}
            aria-label={`Đặt địa chỉ của ${address.fullName} làm mặc định`}
          >
            Đặt làm mặc định
          </Button>
        ) : null}
      </div>
    </li>
  );
}
