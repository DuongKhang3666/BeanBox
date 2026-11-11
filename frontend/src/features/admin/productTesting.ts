import { vi } from "vitest";
import { jsonRes } from "@/features/account/testing";
import type { AdminProduct } from "@/types/admin";
import { makeAdminProduct, makeBrand, makeCategory } from "./testing";

export const CATEGORY_TREE = [
  makeCategory({
    id: "c1",
    name: "Cà phê hạt",
    slug: "ca-phe-hat",
    children: [makeCategory({ id: "c2", parentId: "c1", name: "Specialty", slug: "specialty" })],
  }),
  makeCategory({
    id: "c3",
    name: "Dụng cụ pha chế",
    slug: "dung-cu-pha-che",
    children: [makeCategory({ id: "c4", parentId: "c3", name: "Phễu V60", slug: "pheu-v60" })],
  }),
];

export const BRAND_LIST = [
  makeBrand({ id: "b1", name: "BeanBox", slug: "beanbox" }),
  makeBrand({ id: "b2", name: "Hario", slug: "hario" }),
];

export type WriteHandler = (method: string, path: string, init: RequestInit) => Response;

/** Stub fetch cho màn sản phẩm: GET cố định, mọi thao tác ghi đi qua `onWrite`. */
export function stubProductApi(opts: { product?: AdminProduct; onWrite?: WriteHandler } = {}) {
  const product = opts.product ?? makeAdminProduct();
  const mock = vi.fn(async (input: string, init: RequestInit = {}) => {
    const path = input.replace("/api/v1", "");
    const method = init.method ?? "GET";
    if (method === "GET") {
      if (path.startsWith("/admin/categories")) return jsonRes(200, { data: CATEGORY_TREE });
      if (path.startsWith("/admin/brands")) return jsonRes(200, { data: BRAND_LIST });
      if (path.startsWith("/admin/products/")) return jsonRes(200, { data: product });
      return jsonRes(404, { error: { code: "NOT_FOUND", message: "Không tìm thấy" } });
    }
    return opts.onWrite ? opts.onWrite(method, path, init) : jsonRes(204);
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

/** Các lần gọi ghi (khác GET) theo thứ tự. */
export function writes(mock: ReturnType<typeof stubProductApi>) {
  return mock.mock.calls
    .map(([url, init]) => ({
      method: ((init as RequestInit | undefined)?.method ?? "GET") as string,
      path: (url as string).replace("/api/v1", ""),
      init: (init ?? {}) as RequestInit,
    }))
    .filter((c) => c.method !== "GET");
}

export const jsonBody = (init: RequestInit) => JSON.parse(init.body as string) as unknown;
