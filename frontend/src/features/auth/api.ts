import { api, clearSession, setSession } from "@/lib/api/client";
import {
  isTwoFactorChallenge,
  type LoginResult,
  type MessageResult,
  type Session,
  type TwoFactorChallenge,
  type TwoFactorSetup,
  type User,
} from "@/types/auth";

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

/**
 * Bước 1 đăng nhập. Tài khoản bật 2FA nhận `TwoFactorChallenge` (response khác hình dạng, chưa có
 * phiên) nên KHÔNG setSession; token thử thách chỉ giữ trong state của form, không lưu localStorage.
 */
export async function login(input: LoginInput): Promise<LoginResult> {
  const { data } = await api.post<LoginResult>("/auth/login", input, { skipAuth: true });
  if (!isTwoFactorChallenge(data)) setSession(data);
  return data;
}

export type LoginTwoFactorInput =
  { challengeToken: string; code: string } | { challengeToken: string; backupCode: string };

/** Bước 2 đăng nhập (§5.2a): mã TOTP hoặc mã dự phòng. */
export async function loginTwoFactor(input: LoginTwoFactorInput): Promise<Session> {
  const { data } = await api.post<Session>("/auth/login/2fa", input, { skipAuth: true });
  setSession(data);
  return data;
}

// ───────────── Quản lý 2FA của chính mình (§6.4; chỉ Staff/Admin) ─────────────

export async function twoFactorSetup(password: string): Promise<TwoFactorSetup> {
  const { data } = await api.post<TwoFactorSetup>("/me/2fa/setup", { password });
  return data;
}

export async function twoFactorEnable(code: string): Promise<{ backupCodes: string[] }> {
  const { data } = await api.post<{ backupCodes: string[] }>("/me/2fa/enable", { code });
  return data;
}

export async function twoFactorDisable(password: string, code: string): Promise<void> {
  await api.post<void>("/me/2fa/disable", { password, code });
}

export async function twoFactorBackupCodes(
  password: string,
  code: string,
): Promise<{ backupCodes: string[] }> {
  const { data } = await api.post<{ backupCodes: string[] }>("/me/2fa/backup-codes", {
    password,
    code,
  });
  return data;
}

export type { TwoFactorChallenge };

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

// ───────────── Dữ liệu cá nhân (§6.4a, D-065) ─────────────

/** Cụm khách phải gõ để xác nhận xóa tài khoản (khớp backend, so sánh chính xác). */
export const DELETE_ACCOUNT_PHRASE = "XOA TAI KHOAN";

/** Tải file JSON dữ liệu cá nhân (token qua header như mọi request, không đặt vào URL). */
export function exportPersonalData() {
  return api.download("/me/export");
}

/**
 * Xóa (ẩn danh hóa) tài khoản CUSTOMER. Thành công = 204: cookie refresh đã bị server xóa nên chỉ cần
 * dọn phiên local (do nơi gọi qua `endSession`).
 */
export async function deleteAccount(password: string, confirmText: string): Promise<void> {
  await api.request<void>("/me", { method: "DELETE", body: { password, confirmText } });
}
