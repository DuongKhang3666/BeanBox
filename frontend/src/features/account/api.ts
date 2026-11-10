import { api } from "@/lib/api/client";
import type { Address, CreateAddressInput, UpdateAddressInput } from "@/types/account";

// getMe / updateMe / changePassword / resendVerification nằm ở features/auth/api.ts (dùng lại, không lặp).
export { changePassword, getMe, resendVerification, updateMe } from "@/features/auth/api";

export async function listAddresses(): Promise<Address[]> {
  const { data } = await api.get<Address[]>("/me/addresses");
  return data;
}

export async function createAddress(input: CreateAddressInput): Promise<Address> {
  const { data } = await api.post<Address>("/me/addresses", input);
  return data;
}

export async function updateAddress(id: string, input: UpdateAddressInput): Promise<Address> {
  const { data } = await api.patch<Address>(`/me/addresses/${encodeURIComponent(id)}`, input);
  return data;
}

export async function deleteAddress(id: string): Promise<void> {
  await api.delete<void>(`/me/addresses/${encodeURIComponent(id)}`);
}

export async function setDefaultAddress(id: string): Promise<Address> {
  const { data } = await api.post<Address>(`/me/addresses/${encodeURIComponent(id)}/default`);
  return data;
}
