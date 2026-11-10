import type { Address } from "@/types/account";
import type { User } from "@/types/auth";

export function jsonRes(status: number, body?: unknown) {
  if (status === 204) return new Response(null, { status });
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function errRes(status: number, code: string, message = "Lỗi", details?: unknown): Response {
  return jsonRes(status, { error: { code, message, details } });
}

export function makeUser(over: Partial<User> = {}): User {
  return {
    id: "u1",
    email: "an@example.com",
    fullName: "Nguyễn Văn An",
    phone: "0901234567",
    birthDate: null,
    avatarUrl: null,
    role: "CUSTOMER",
    emailVerified: true,
    createdAt: "2026-11-10T08:30:00.000Z",
    ...over,
  };
}

export function makeAddress(over: Partial<Address> = {}): Address {
  return {
    id: "a1",
    fullName: "Nguyễn Văn An",
    phone: "0901234567",
    provinceCode: "79",
    provinceName: "Tỉnh Mẫu",
    wardCode: "26734",
    wardName: "Phường Mẫu",
    line1: "12 Đường Số 1",
    isDefault: true,
    createdAt: "2026-11-10T08:30:00.000Z",
    ...over,
  };
}

/** Đọc body JSON của lần gọi fetch thứ n. */
export function bodyOf(fetchMock: { mock: { calls: unknown[][] } }, n: number): unknown {
  const init = fetchMock.mock.calls[n]![1] as RequestInit;
  return JSON.parse(init.body as string);
}
