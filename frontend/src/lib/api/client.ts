import { ApiError } from "./errors";
import type { ApiSuccess } from "@/types/api";
import type { Session } from "@/types/auth";

export { ApiError };

export const CART_TOKEN_KEY = "bb_cart_token";
export const AUTH_LOGOUT_EVENT = "bb:auth:logout";
/** D-070: server trả 403 ADMIN_TWO_FACTOR_REQUIRED giữa phiên -> AdminGuard hiện màn hình bật 2FA. */
export const ADMIN_2FA_REQUIRED_EVENT = "bb:admin:2fa-required";
/** Cờ không nhạy cảm: trình duyệt này có thể còn phiên (cookie refresh httpOnly). Không chứa token. */
export const SESSION_FLAG_KEY = "bb_has_session";
export const REFRESH_LOCK_NAME = "bb-auth-refresh";

/** Access token chỉ giữ trong memory (module-level), không lưu localStorage. */
let accessToken: string | null = null;
export const tokenStore = {
  get: () => accessToken,
  set: (token: string | null) => {
    accessToken = token;
  },
  clear: () => {
    accessToken = null;
  },
};

export const sessionFlag = {
  has(): boolean {
    try {
      return typeof window !== "undefined" && window.localStorage.getItem(SESSION_FLAG_KEY) === "1";
    } catch {
      return false;
    }
  },
  set() {
    try {
      if (typeof window !== "undefined") window.localStorage.setItem(SESSION_FLAG_KEY, "1");
    } catch {
      /* localStorage không khả dụng: bỏ qua */
    }
  },
  clear() {
    try {
      if (typeof window !== "undefined") window.localStorage.removeItem(SESSION_FLAG_KEY);
    } catch {
      /* bỏ qua */
    }
  },
};

/** Gọi sau register/login (và refresh thành công): token vào memory, đặt cờ phiên. */
export function setSession(session: Pick<Session, "accessToken">) {
  tokenStore.set(session.accessToken);
  sessionFlag.set();
}

/** Gọi khi đăng xuất / phiên hết hạn. */
export function clearSession() {
  tokenStore.clear();
  sessionFlag.clear();
}

type Query = Record<string, string | number | boolean | undefined | null>;

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Body JSON (tự stringify). */
  body?: unknown;
  /** Body nhị phân thô (vd. upload ảnh); gửi nguyên, không stringify. Ưu tiên hơn `body`. */
  rawBody?: Blob;
  /** Content-Type cho `rawBody`; mặc định lấy `rawBody.type`. */
  contentType?: string;
  query?: Query;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Bỏ qua gắn Bearer và logic refresh (dùng cho login/refresh). */
  skipAuth?: boolean;
}

type ShortOptions = Omit<RequestOptions, "method" | "body">;

export interface ApiClientConfig {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  getCartToken?: () => string | null;
  onLogout?: () => void;
}

function defaultCartToken(): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(CART_TOKEN_KEY);
  } catch {
    return null;
  }
}

function defaultOnLogout() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(AUTH_LOGOUT_EVENT));
}

export interface ApiResult<T, M = unknown> {
  data: T;
  meta?: M;
}

export interface DownloadResult {
  blob: Blob;
  filename: string;
}

export const DEFAULT_DOWNLOAD_NAME = "beanbox-export.csv";

/**
 * Tên file từ `Content-Disposition: attachment; filename="..."`. Chỉ nhận ký tự an toàn
 * `[A-Za-z0-9_.-]`; không hợp lệ thì dùng tên mặc định (không bao giờ dùng giá trị thô).
 */
export function filenameFromDisposition(
  header: string | null | undefined,
  fallback: string = DEFAULT_DOWNLOAD_NAME,
): string {
  const m = header ? /filename="([A-Za-z0-9_.-]{1,150})"/.exec(header) : null;
  const name = m?.[1];
  return name && !name.startsWith(".") && !name.includes("..") ? name : fallback;
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly customFetch?: typeof fetch;
  private readonly getCartToken: () => string | null;
  private readonly onLogout: () => void;
  private refreshPromise: Promise<Session> | null = null;

  constructor(config: ApiClientConfig = {}) {
    this.baseUrl = (config.baseUrl ?? "/api/v1").replace(/\/$/, "");
    this.customFetch = config.fetchImpl;
    this.getCartToken = config.getCartToken ?? defaultCartToken;
    this.onLogout = config.onLogout ?? defaultOnLogout;
  }

  private buildUrl(path: string, query?: Query): string {
    let url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    if (query) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }
    return url;
  }

  private async send(path: string, opts: RequestOptions): Promise<Response> {
    const headers: Record<string, string> = { Accept: "application/json", ...opts.headers };
    if (opts.rawBody !== undefined) {
      const type = opts.contentType ?? opts.rawBody.type;
      if (type) headers["Content-Type"] = type;
    } else if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    const token = tokenStore.get();
    if (token && !opts.skipAuth) headers["Authorization"] = `Bearer ${token}`;
    const cartToken = this.getCartToken();
    if (cartToken) headers["X-Cart-Token"] = cartToken;

    const doFetch = this.customFetch ?? globalThis.fetch.bind(globalThis);
    try {
      return await doFetch(this.buildUrl(path, opts.query), {
        method: opts.method ?? "GET",
        headers,
        body:
          opts.rawBody !== undefined
            ? opts.rawBody
            : opts.body !== undefined
              ? JSON.stringify(opts.body)
              : undefined,
        credentials: "same-origin",
        signal: opts.signal,
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") throw e;
      throw new ApiError(0, "NETWORK_ERROR", "Không thể kết nối tới máy chủ. Vui lòng thử lại.");
    }
  }

  private async parse<T, M>(res: Response): Promise<ApiResult<T, M>> {
    if (res.status === 204) return { data: undefined as T };
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    if (!res.ok) {
      const err = (
        json as { error?: { code?: string; message?: string; details?: unknown } } | null
      )?.error;
      if (res.status === 403 && err?.code === "ADMIN_TWO_FACTOR_REQUIRED") {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent(ADMIN_2FA_REQUIRED_EVENT));
        }
      }
      throw new ApiError(
        res.status,
        err?.code ?? "UNKNOWN_ERROR",
        err?.message ?? "Đã có lỗi xảy ra. Vui lòng thử lại.",
        err?.details,
      );
    }
    const body = (json ?? {}) as ApiSuccess<T, M>;
    return { data: body.data as T, meta: body.meta };
  }

  private async callRefresh(): Promise<Session> {
    const res = await this.send("/auth/refresh", { method: "POST", skipAuth: true });
    const { data } = await this.parse<Session, unknown>(res);
    if (!data?.accessToken) {
      throw new ApiError(401, "INVALID_REFRESH_TOKEN", "Phiên đăng nhập đã hết hạn.");
    }
    return data;
  }

  /**
   * Single-flight trong tab: nhiều request 401 đồng thời dùng chung 1 lần refresh.
   * Giữa các tab dùng Web Locks (nếu có) để không xoay vòng refresh token cùng lúc.
   * Trả toàn bộ phiên `{ user, accessToken, expiresIn }`.
   */
  refresh(): Promise<Session> {
    if (!this.refreshPromise) {
      this.refreshPromise = (async () => {
        try {
          const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
          const session = locks
            ? await locks.request(REFRESH_LOCK_NAME, () => this.callRefresh())
            : await this.callRefresh();
          setSession(session);
          return session;
        } catch (e) {
          tokenStore.clear();
          // Chỉ xóa cờ khi server xác nhận phiên không còn; lỗi mạng/5xx giữ cờ để lần tải sau thử lại.
          if (!(e instanceof ApiError) || e.status === 401 || e.status === 403) sessionFlag.clear();
          this.onLogout();
          throw e;
        } finally {
          this.refreshPromise = null;
        }
      })();
    }
    return this.refreshPromise;
  }

  async request<T, M = unknown>(path: string, opts: RequestOptions = {}): Promise<ApiResult<T, M>> {
    const res = await this.send(path, opts);
    if (res.status === 401 && !opts.skipAuth) {
      const code = await peekErrorCode(res);
      if (code === "UNAUTHORIZED") {
        await this.refresh();
        const retry = await this.send(path, opts);
        return this.parse<T, M>(retry);
      }
    }
    return this.parse<T, M>(res);
  }

  /**
   * Tải file (GET) với cùng cơ chế xác thực như `request`: Bearer từ memory, tự refresh khi 401
   * rồi thử lại một lần. Token KHÔNG bao giờ đặt vào URL. Lỗi (JSON theo §1) -> `ApiError`.
   */
  async download(path: string, opts: ShortOptions = {}): Promise<DownloadResult> {
    const o: RequestOptions = {
      ...opts,
      method: "GET",
      headers: { Accept: "text/csv, application/json;q=0.5", ...opts.headers },
    };
    let res = await this.send(path, o);
    if (res.status === 401) {
      const code = await peekErrorCode(res);
      if (code === "UNAUTHORIZED") {
        await this.refresh();
        res = await this.send(path, o);
      }
    }
    if (!res.ok) {
      await this.parse<unknown, unknown>(res); // luôn ném ApiError khi !ok
      throw new ApiError(res.status, "UNKNOWN_ERROR", "Đã có lỗi xảy ra. Vui lòng thử lại.");
    }
    const blob = await res.blob();
    return { blob, filename: filenameFromDisposition(res.headers.get("Content-Disposition")) };
  }

  get<T, M = unknown>(path: string, opts: ShortOptions = {}) {
    return this.request<T, M>(path, { ...opts, method: "GET" });
  }
  post<T, M = unknown>(path: string, body?: unknown, opts: ShortOptions = {}) {
    return this.request<T, M>(path, { ...opts, method: "POST", body });
  }
  put<T, M = unknown>(path: string, body?: unknown, opts: ShortOptions = {}) {
    return this.request<T, M>(path, { ...opts, method: "PUT", body });
  }
  patch<T, M = unknown>(path: string, body?: unknown, opts: ShortOptions = {}) {
    return this.request<T, M>(path, { ...opts, method: "PATCH", body });
  }
  delete<T, M = unknown>(path: string, opts: ShortOptions = {}) {
    return this.request<T, M>(path, { ...opts, method: "DELETE" });
  }
}

async function peekErrorCode(res: Response): Promise<string | undefined> {
  try {
    const json = (await res.clone().json()) as { error?: { code?: string } };
    return json.error?.code;
  } catch {
    return undefined;
  }
}

/** Instance dùng chung cho browser. */
export const api = new ApiClient();
