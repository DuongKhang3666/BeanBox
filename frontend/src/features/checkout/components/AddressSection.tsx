"use client";

import { Button } from "@/components/ui/Button";
import { FieldError } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { LocationFields } from "@/features/account/components/LocationFields";
import { TextField } from "@/features/auth/components/Fields";
import type { Address } from "@/types/account";
import { NEW_ADDRESS, type CheckoutAddress } from "../hooks/useCheckoutAddress";
import { RadioCard, Section } from "./RadioCard";

function AddressRadioLabel({ a }: { a: Address }) {
  return (
    <>
      <span className="block font-medium text-coffee-900">
        {a.fullName} · {a.phone}
        {a.isDefault ? (
          <span className="ml-2 rounded-full bg-cream-200 px-2 py-0.5 text-xs">Mặc định</span>
        ) : null}
      </span>
      <span className="block text-sm text-coffee-800">
        {a.line1}, {a.wardName}, {a.provinceName}
      </span>
    </>
  );
}

export function AddressSection({
  authed,
  address,
  errors,
  clearError,
}: {
  authed: boolean;
  address: CheckoutAddress;
  errors: Record<string, string>;
  clearError: (...ids: string[]) => void;
}) {
  const {
    addressRes,
    addresses,
    addressId,
    useSaved,
    showForm,
    setPickedId,
    shipName,
    setShipName,
    shipPhone,
    setShipPhone,
    line1,
    setLine1,
    loc,
    setLoc,
  } = address;
  return (
    <Section title="Địa chỉ giao hàng" id="checkout-address">
      {authed && addressRes.status === "loading" ? (
        <div aria-busy="true" aria-label="Đang tải sổ địa chỉ" className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : null}
      {authed && addressRes.status === "error" ? (
        <div role="alert" className="space-y-2 text-sm text-danger-600">
          <p>Không tải được sổ địa chỉ.</p>
          <Button variant="outline" size="sm" onClick={addressRes.retry}>
            Thử lại
          </Button>
        </div>
      ) : null}
      {useSaved ? (
        <fieldset id="addressId" tabIndex={-1} className="space-y-2">
          <legend className="sr-only">Chọn địa chỉ giao hàng</legend>
          {addresses.map((a) => (
            <RadioCard
              key={a.id}
              name="address"
              value={a.id}
              checked={addressId === a.id}
              onChange={(v) => {
                setPickedId(v);
                clearError("addressId");
              }}
            >
              <AddressRadioLabel a={a} />
            </RadioCard>
          ))}
          <RadioCard name="address" value={NEW_ADDRESS} checked={false} onChange={setPickedId}>
            <span className="font-medium text-coffee-900">Giao tới địa chỉ khác</span>
          </RadioCard>
          <FieldError>{errors.addressId}</FieldError>
        </fieldset>
      ) : null}
      {showForm ? (
        <div className="space-y-4">
          {authed && addresses.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => setPickedId(null)}>
              ← Dùng địa chỉ trong sổ
            </Button>
          ) : null}
          <TextField
            id="shipFullName"
            label="Họ và tên người nhận"
            autoComplete="name"
            value={shipName}
            onChange={(e) => {
              setShipName(e.target.value);
              clearError("shipFullName");
            }}
            error={errors.shipFullName}
            required
          />
          <TextField
            id="shipPhone"
            label="Số điện thoại người nhận"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={shipPhone}
            onChange={(e) => {
              setShipPhone(e.target.value);
              clearError("shipPhone");
            }}
            error={errors.shipPhone}
            required
          />
          <LocationFields
            values={loc}
            errors={errors}
            onChange={(next) => {
              setLoc(next);
              clearError("provinceCode", "wardCode");
            }}
          />
          <TextField
            id="shipLine1"
            label="Địa chỉ cụ thể (số nhà, đường)"
            autoComplete="address-line1"
            value={line1}
            onChange={(e) => {
              setLine1(e.target.value);
              clearError("shipLine1");
            }}
            error={errors.shipLine1}
            required
          />
        </div>
      ) : null}
    </Section>
  );
}
