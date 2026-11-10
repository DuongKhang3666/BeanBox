import { api, clearSession, setSession } from "@/lib/api/client";
import type { MessageResult, Session, User } from "@/types/auth";

export interface RegisterInput {
  fullName: string;
  email: string;
  password: string;
  /** Đã chuẩn hóa (0xxxxxxxxx) hoặc bỏ qua. */
  phone?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface UpdateMeInput {
  fullName?: string;
  phone?: string | null;
  birthDate?: string | null;
  avatarUrl?: string | null;
}

export async function register(input: RegisterInput): Promise<Session> {
  const { data } = await api.post<Session>("/auth/register", input, { skipAuth: true });
  setSession(data);
  return data;
}

export async function login(input: LoginInput): Promise<Session> {
  const { data } = await api.post<Session>("/auth/login", input, { skipAuth: true });
  setSession(data);
  return data;
}

/** Luôn xóa phiên phía client, kể cả khi mạng lỗi (server idempotent, luôn 204). */
export async function logout(): Promise<void> {
  try {
    await api.post<void>("/auth/logout", undefined, { skipAuth: true });
  } catch {
    /* bỏ qua lỗi mạng/server: phiên local vẫn bị xóa */
  } finally {
    clearSession();
  }
}

export async function forgotPassword(email: string): Promise<MessageResult> {
  const { data } = await api.post<MessageResult>(
    "/auth/forgot-password",
    { email },
    { skipAuth: true },
  );
  return data;
}

export async function resetPassword(token: string, newPassword: string): Promise<MessageResult> {
  const { data } = await api.post<MessageResult>(
    "/auth/reset-password",
    { token, newPassword },
    { skipAuth: true },
  );
  return data;
}

export async function verifyEmail(token: string): Promise<{ emailVerified: boolean }> {
  const { data } = await api.post<{ emailVerified: boolean }>(
    "/auth/verify-email",
    { token },
    { skipAuth: true },
  );
  return data;
}

/** Cần đăng nhập (Bearer). 204. */
export async function resendVerification(): Promise<void> {
  await api.post<void>("/auth/resend-verification");
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await api.post<void>("/auth/change-password", { currentPassword, newPassword });
}

export async function getMe(): Promise<User> {
  const { data } = await api.get<User>("/me");
  return data;
}

export async function updateMe(input: UpdateMeInput): Promise<User> {
  const { data } = await api.patch<User>("/me", input);
  return data;
}
