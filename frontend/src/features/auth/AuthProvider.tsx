"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  AUTH_LOGOUT_EVENT,
  SESSION_FLAG_KEY,
  api,
  sessionFlag,
  tokenStore,
} from "@/lib/api/client";
import type { Session, User } from "@/types/auth";
import * as authApi from "./api";
import type { LoginInput, RegisterInput } from "./api";

export type AuthStatus = "loading" | "authenticated" | "anonymous";

/** "user": tự bấm đăng xuất; "expired": hết phiên (refresh lỗi / đăng xuất ở tab khác); null: chưa có. */
export type LogoutReason = "user" | "expired" | null;

export interface AuthContextValue {
  status: AuthStatus;
  logoutReason: LogoutReason;
  user: User | null;
  login: (input: LoginInput) => Promise<Session>;
  register: (input: RegisterInput) => Promise<Session>;
  logout: () => Promise<void>;
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
    async (input: LoginInput) => applySession(await authApi.login(input)),
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

  const setUser = useCallback((next: User) => {
    setLogoutReason(null);
    setUserState(next);
    setStatus("authenticated");
  }, []);

  const reloadUser = useCallback(async () => {
    setUserState(await authApi.getMe());
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, logoutReason, user, login, register, logout, setUser, reloadUser }),
    [status, logoutReason, user, login, register, logout, setUser, reloadUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth phải được dùng bên trong <AuthProvider>");
  return ctx;
}
