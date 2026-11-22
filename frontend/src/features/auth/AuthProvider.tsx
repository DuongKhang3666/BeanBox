"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  AUTH_LOGOUT_EVENT,
  clearSession,
  SESSION_FLAG_KEY,
  api,
  sessionFlag,
  tokenStore,
} from "@/lib/api/client";
import { isTwoFactorChallenge, type LoginResult, type Session, type User } from "@/types/auth";
import * as authApi from "./api";
import type { LoginInput, LoginTwoFactorInput, RegisterInput } from "./api";

export type AuthStatus = "loading" | "authenticated" | "anonymous";

/** "user": tự bấm đăng xuất; "expired": hết phiên (refresh lỗi / đăng xuất ở tab khác); null: chưa có. */
export type LogoutReason = "user" | "expired" | null;

export interface AuthContextValue {
  status: AuthStatus;
  logoutReason: LogoutReason;
  user: User | null;
  /** Có thể trả thử thách 2FA (chưa đăng nhập) thay vì phiên: dùng `isTwoFactorChallenge`. */
  login: (input: LoginInput) => Promise<LoginResult>;
  loginTwoFactor: (input: LoginTwoFactorInput) => Promise<Session>;
  register: (input: RegisterInput) => Promise<Session>;
  logout: () => Promise<void>;
  /** Kết thúc phiên chỉ ở phía client (server đã thu hồi, vd. sau khi xóa tài khoản). */
  endSession: () => void;
  setUser: (user: User) => void;
  reloadUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUserState] = useState<User | null>(null);
  const [logoutReason, setLogoutReason] = useState<LogoutReason>(null);

  // Khởi động: chỉ gọi mạng khi có cờ phiên. Single-flight của client lo việc StrictMode chạy effect 2 lần.
  useEffect(() => {
    let active = true;
    if (!sessionFlag.has()) {
      queueMicrotask(() => {
        if (active) setStatus("anonymous");
      });
    } else {
      api
        .refresh()
        .then((session) => {
          if (!active) return;
          setUserState(session.user);
          setStatus("authenticated");
        })
        .catch(() => {
          if (!active) return;
          setUserState(null);
          setStatus("anonymous");
        });
    }
    return () => {
      active = false;
    };
  }, []);

  // Refresh thất bại ở bất kỳ request nào -> client phát sự kiện này.
  useEffect(() => {
    const onLogout = () => {
      setLogoutReason("expired");
      setUserState(null);
      setStatus("anonymous");
    };
    window.addEventListener(AUTH_LOGOUT_EVENT, onLogout);
    return () => window.removeEventListener(AUTH_LOGOUT_EVENT, onLogout);
  }, []);

  // Đăng xuất ở tab khác: cờ phiên bị xóa khỏi localStorage -> tab này cũng thoát phiên.
  // (event.key === null khi tab khác gọi localStorage.clear().)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if ((e.key === SESSION_FLAG_KEY || e.key === null) && e.newValue === null) {
        tokenStore.clear();
        setLogoutReason("expired");
        setUserState(null);
        setStatus("anonymous");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const applySession = useCallback((session: Session) => {
    setLogoutReason(null);
    setUserState(session.user);
    setStatus("authenticated");
    return session;
  }, []);

  const login = useCallback(
    async (input: LoginInput): Promise<LoginResult> => {
      const result = await authApi.login(input);
      return isTwoFactorChallenge(result) ? result : applySession(result);
    },
    [applySession],
  );

  const loginTwoFactor = useCallback(
    async (input: LoginTwoFactorInput) => applySession(await authApi.loginTwoFactor(input)),
    [applySession],
  );

  const register = useCallback(
    async (input: RegisterInput) => applySession(await authApi.register(input)),
    [applySession],
  );

  const logout = useCallback(async () => {
    setLogoutReason("user");
    try {
      await authApi.logout();
    } catch (err) {
      setLogoutReason(null);
      throw err;
    }
    setUserState(null);
    setStatus("anonymous");
  }, []);

  const endSession = useCallback(() => {
    clearSession();
    setLogoutReason("user");
    setUserState(null);
    setStatus("anonymous");
  }, []);

  const setUser = useCallback((next: User) => {
    setLogoutReason(null);
    setUserState(next);
    setStatus("authenticated");
  }, []);

  const reloadUser = useCallback(async () => {
    setUserState(await authApi.getMe());
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      logoutReason,
      user,
      login,
      loginTwoFactor,
      register,
      logout,
      endSession,
      setUser,
      reloadUser,
    }),
    [
      status,
      logoutReason,
      user,
      login,
      loginTwoFactor,
      register,
      logout,
      endSession,
      setUser,
      reloadUser,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth phải được dùng bên trong <AuthProvider>");
  return ctx;
}
