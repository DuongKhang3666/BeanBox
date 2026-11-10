import { afterEach, describe, expect, it, vi } from "vitest";
import { serverGet } from "./server";

function mockFetch() {
  const fn = vi.fn(
    async () =>
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

function sentHeaders(fn: ReturnType<typeof mockFetch>): Record<string, string> {
  const call = fn.mock.calls[0] as unknown as [string, RequestInit];
  return call[1].headers as Record<string, string>;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("serverGet", () => {
  it("gửi X-Internal-Secret khi có INTERNAL_API_SECRET", async () => {
    vi.stubEnv("INTERNAL_API_SECRET", "s3cret-value");
    const fn = mockFetch();
    await serverGet("/categories");
    expect(sentHeaders(fn)["X-Internal-Secret"]).toBe("s3cret-value");
  });

  it("không gửi header khi không có biến môi trường", async () => {
    vi.stubEnv("INTERNAL_API_SECRET", "");
    const fn = mockFetch();
    await serverGet("/categories");
    expect(sentHeaders(fn)).not.toHaveProperty("X-Internal-Secret");
    expect(sentHeaders(fn).Accept).toBe("application/json");
  });
});
