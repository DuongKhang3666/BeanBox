import {
  ApiClient,
  ApiError,
  SESSION_FLAG_KEY,
  clearSession,
  setSession,
  tokenStore,
} from "./client";

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const unauthorized = () =>
  json(401, { error: { code: "UNAUTHORIZED", message: "Hết hạn", details: null } });

beforeEach(() => {
  tokenStore.clear();
  window.localStorage.clear();
});

const fakeUser = { id: "u1", email: "an@example.com", fullName: "An" };
const sessionBody = { user: fakeUser, accessToken: "new", expiresIn: 900 };

describe("ApiClient", () => {
  it("parse {data, meta} và gắn Bearer + X-Cart-Token", async () => {
    tokenStore.set("tok-1");
    const fetchImpl = vi.fn(async () => json(200, { data: [1, 2], meta: { page: 1 } }));
    const client = new ApiClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getCartToken: () => "cart-abc",
    });
    const res = await client.get<number[]>("/products", { query: { page: 1, q: undefined } });
    expect(res.data).toEqual([1, 2]);
    expect(res.meta).toEqual({ page: 1 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/products?page=1");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok-1");
    expect(headers["X-Cart-Token"]).toBe("cart-abc");
  });

  it("parse lỗi thành ApiError", async () => {
    const details = [{ field: "email", message: "Email không đúng định dạng" }];
    const fetchImpl = vi.fn(async () =>
      json(400, { error: { code: "VALIDATION_ERROR", message: "Dữ liệu không hợp lệ", details } }),
    );
    const client = new ApiClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getCartToken: () => null,
    });
    const err = await client.post("/auth/register", { email: "x" }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Dữ liệu không hợp lệ",
      details,
    });
  });

  it("lỗi mạng thành ApiError NETWORK_ERROR", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("failed");
    });
    const client = new ApiClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getCartToken: () => null,
    });
    await expect(client.get("/x")).rejects.toMatchObject({ status: 0, code: "NETWORK_ERROR" });
  });

  it("204 trả data undefined", async () => {
    const client = new ApiClient({
      fetchImpl: (async () => json(204)) as unknown as typeof fetch,
      getCartToken: () => null,
    });
    await expect(client.post("/auth/logout")).resolves.toEqual({ data: undefined });
  });

  it("single-flight: 2 request 401 đồng thời chỉ refresh 1 lần, cả 2 retry thành công", async () => {
    tokenStore.set("old");
    let refreshCalls = 0;
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/auth/refresh")) {
        refreshCalls++;
        await new Promise((r) => setTimeout(r, 10));
        return json(200, { data: { accessToken: "new" } });
      }
      const auth = (init?.headers as Record<string, string>).Authorization;
      if (auth === "Bearer new") return json(200, { data: { url } });
      return unauthorized();
    });
    const client = new ApiClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getCartToken: () => null,
    });
    const [a, b] = await Promise.all([client.get("/me"), client.get("/cart")]);
    expect(refreshCalls).toBe(1);
    expect(a.data).toEqual({ url: "/api/v1/me" });
    expect(b.data).toEqual({ url: "/api/v1/cart" });
    expect(tokenStore.get()).toBe("new");
    // 2 request đầu + 1 refresh + 2 retry
    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });

  it("retry đúng 1 lần: vẫn 401 sau refresh thì ném ApiError", async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith("/auth/refresh") ? json(200, { data: { accessToken: "new" } }) : unauthorized(),
    );
    const client = new ApiClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getCartToken: () => null,
    });
    await expect(client.get("/me")).rejects.toMatchObject({ status: 401, code: "UNAUTHORIZED" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("refresh thất bại: ném lỗi, xóa token, phát sự kiện đăng xuất", async () => {
    tokenStore.set("old");
    const onLogout = vi.fn();
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith("/auth/refresh")
        ? json(401, { error: { code: "INVALID_REFRESH_TOKEN", message: "Phiên hết hạn" } })
        : unauthorized(),
    );
    const client = new ApiClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getCartToken: () => null,
      onLogout,
    });
    const err = await client.get("/me").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("INVALID_REFRESH_TOKEN");
    expect(tokenStore.get()).toBeNull();
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("refresh trả toàn bộ phiên, lưu token ở memory và đặt cờ localStorage", async () => {
    const fetchImpl = vi.fn(async () => json(200, { data: sessionBody }));
    const client = new ApiClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getCartToken: () => null,
    });
    const session = await client.refresh();
    expect(session).toEqual(sessionBody);
    expect(tokenStore.get()).toBe("new");
    expect(window.localStorage.getItem(SESSION_FLAG_KEY)).toBe("1");
    // token tuyệt đối không nằm trong storage
    expect(JSON.stringify({ ...window.localStorage })).not.toContain("new");
  });

  it("refresh đồng thời chỉ gọi /auth/refresh 1 lần", async () => {
    const fetchImpl = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return json(200, { data: sessionBody });
    });
    const client = new ApiClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getCartToken: () => null,
    });
    const [a, b] = await Promise.all([client.refresh(), client.refresh()]);
    expect(a).toBe(b);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("refresh thất bại 401: xóa token + cờ, phát sự kiện đăng xuất", async () => {
    window.localStorage.setItem(SESSION_FLAG_KEY, "1");
    tokenStore.set("old");
    const onLogout = vi.fn();
    const client = new ApiClient({
      fetchImpl: (async () =>
        json(401, {
          error: { code: "INVALID_REFRESH_TOKEN", message: "x" },
        })) as unknown as typeof fetch,
      getCartToken: () => null,
      onLogout,
    });
    await expect(client.refresh()).rejects.toMatchObject({ code: "INVALID_REFRESH_TOKEN" });
    expect(tokenStore.get()).toBeNull();
    expect(window.localStorage.getItem(SESSION_FLAG_KEY)).toBeNull();
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("refresh gặp lỗi mạng: giữ cờ để lần tải sau thử lại", async () => {
    window.localStorage.setItem(SESSION_FLAG_KEY, "1");
    const client = new ApiClient({
      fetchImpl: (async () => {
        throw new TypeError("offline");
      }) as unknown as typeof fetch,
      getCartToken: () => null,
      onLogout: vi.fn(),
    });
    await expect(client.refresh()).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    expect(window.localStorage.getItem(SESSION_FLAG_KEY)).toBe("1");
  });

  it("dùng navigator.locks (Web Locks) khi có", async () => {
    const request = vi.fn(async (_name: string, cb: () => Promise<unknown>) => cb());
    Object.defineProperty(navigator, "locks", { value: { request }, configurable: true });
    try {
      const client = new ApiClient({
        fetchImpl: (async () => json(200, { data: sessionBody })) as unknown as typeof fetch,
        getCartToken: () => null,
      });
      await client.refresh();
      expect(request).toHaveBeenCalledTimes(1);
      expect(request.mock.calls[0]?.[0]).toBe("bb-auth-refresh");
    } finally {
      delete (navigator as unknown as { locks?: unknown }).locks;
    }
  });

  it("setSession / clearSession", () => {
    setSession({ accessToken: "abc" });
    expect(tokenStore.get()).toBe("abc");
    expect(window.localStorage.getItem(SESSION_FLAG_KEY)).toBe("1");
    clearSession();
    expect(tokenStore.get()).toBeNull();
    expect(window.localStorage.getItem(SESSION_FLAG_KEY)).toBeNull();
  });

  it("không refresh với 401 INVALID_CREDENTIALS", async () => {
    const fetchImpl = vi.fn(async () =>
      json(401, { error: { code: "INVALID_CREDENTIALS", message: "Sai email hoặc mật khẩu" } }),
    );
    const client = new ApiClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getCartToken: () => null,
    });
    await expect(client.post("/auth/login", {})).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rawBody: gửi nguyên file với Content-Type của file và Bearer, không stringify", async () => {
    tokenStore.set("tok-raw");
    const fetchImpl = vi.fn(async () => json(201, { data: { url: "/uploads/a.png" } }));
    const client = new ApiClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getCartToken: () => null,
    });
    const file = new File(["abc"], "a.png", { type: "image/png" });
    await client.request("/admin/uploads", { method: "POST", rawBody: file });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.body).toBe(file);
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("image/png");
    expect(headers.Authorization).toBe("Bearer tok-raw");
  });

  it("body JSON mặc định không đổi (Content-Type application/json)", async () => {
    const fetchImpl = vi.fn(async () => json(200, { data: 1 }));
    const client = new ApiClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getCartToken: () => null,
    });
    await client.post("/x", { a: 1 });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.body).toBe('{"a":1}');
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });
});
