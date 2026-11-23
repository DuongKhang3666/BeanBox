import { useMemo, useState } from "react";
import { listAddresses } from "@/features/account/api";
import type { LocationValues } from "@/features/account/components/LocationFields";
import { useResource } from "@/features/orders/useResource";
import type { User } from "@/types/auth";

export const NEW_ADDRESS = "__new__";

const loadAddresses = () => listAddresses();

/** Trạng thái khối địa chỉ: sổ địa chỉ (khách đăng nhập) hoặc form nhập tay, và địa chỉ đang được chọn. */
export function useCheckoutAddress(authed: boolean, user: User | null) {
  const addressRes = useResource(authed ? "addresses" : null, loadAddresses);
  const addresses = useMemo(() => addressRes.data ?? [], [addressRes.data]);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [shipName, setShipName] = useState(user?.fullName ?? "");
  const [shipPhone, setShipPhone] = useState(user?.phone ?? "");
  const [line1, setLine1] = useState("");
  const [loc, setLoc] = useState<LocationValues>({ provinceCode: "", wardCode: "" });

  // Chọn địa chỉ trong sổ hay nhập mới?
  const addressesReady = authed && addressRes.status === "ready";
  const useSaved = addressesReady && addresses.length > 0 && pickedId !== NEW_ADDRESS;
  const defaultId = addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? null;
  const addressId = useSaved
    ? addresses.some((a) => a.id === pickedId)
      ? pickedId
      : defaultId
    : null;
  const showForm = !authed || (addressesReady && !useSaved);

  return {
    addressRes,
    addresses,
    setPickedId,
    shipName,
    setShipName,
    shipPhone,
    setShipPhone,
    line1,
    setLine1,
    loc,
    setLoc,
    useSaved,
    addressId,
    showForm,
  };
}

export type CheckoutAddress = ReturnType<typeof useCheckoutAddress>;
