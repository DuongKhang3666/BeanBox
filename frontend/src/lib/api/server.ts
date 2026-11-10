import { ApiError } from "./errors";
import type { ApiSuccess } from "@/types/api";

const apiBase = () =>
  `${(process.env.API_INTERNAL_URL ?? "http://localhost:4000").replace(/\/$/, "")}/api/v1`;

export interface ServerFetchOptions {
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Giây; 0 = không cache; bỏ trống = mặc định của Next. */
  revalidate?: number | false;
  tags?: string[];
  signal?: AbortSignal;
}

/** Chỉ dùng trong Server Components, cho dữ liệu công khai (không gửi token). */
export async function serverGet<T, M = unknown>(
  path: string,
  opts: ServerFetchOptions = {},
): Promise<ApiSuccess<T, M>> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  const qs = params.toString();
  const url = `${apiBase()}${path.startsWith("/") ? path : `/${path}`}${qs ? `?${qs}` : ""}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: opts.signal,
      next: { revalidate: opts.revalidate, tags: opts.tags },
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Không thể kết nối tới máy chủ.");
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string; details?: unknown } } | null)
      ?.error;
    throw new ApiError(
      res.status,
      err?.code ?? "UNKNOWN_ERROR",
      err?.message ?? "Đã có lỗi xảy ra.",
      err?.details,
    );
  }
  return json as ApiSuccess<T, M>;
}
