import { api } from "@/lib/api/client";
import type { LocationOption } from "@/types/location";

const cache = new Map<string, Promise<LocationOption[]>>();

function cached(key: string, path: string): Promise<LocationOption[]> {
  let p = cache.get(key);
  if (!p) {
    p = api.get<LocationOption[]>(path, { skipAuth: true }).then(
      (r) => r.data,
      (e) => {
        // Lỗi thì xóa khỏi cache để lần sau thử lại được.
        cache.delete(key);
        throw e;
      },
    );
    cache.set(key, p);
  }
  return p;
}

export function getProvinces(): Promise<LocationOption[]> {
  return cached("provinces", "/locations/provinces");
}

export function getWards(provinceCode: string): Promise<LocationOption[]> {
  return cached(
    `wards:${provinceCode}`,
    `/locations/provinces/${encodeURIComponent(provinceCode)}/wards`,
  );
}

/** Dùng cho test. */
export function resetLocationCache(): void {
  cache.clear();
}
