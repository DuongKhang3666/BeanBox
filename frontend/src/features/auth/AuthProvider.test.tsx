import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_FLAG_KEY, tokenStore } from "@/lib/api/client";
import { AuthProvider, useAuth } from "./AuthProvider";

const user = {
  id: "u1",
  email: "an@example.com",
  fullName: "Nguyễn Văn An",
  phone: null,
  birthDate: null,
  avatarUrl: null,
  role: "CUSTOMER",
  emailVerified: false,
  createdAt: "2026-11-10T08:30:00.000Z",
};

function jsonRes(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function Probe() {
  const { status, user } = useAuth();
  return (
    <p data-testid="s">
      {status}:{user?.fullName ?? "-"}
    </p>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  tokenStore.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe("AuthProvider", () => {
  it("không có cờ phiên -> anonymous, không gọi mạng", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("s")).toHaveTextContent("anonymous:-"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("có cờ + refresh OK -> authenticated, token ở memory", async () => {
    window.localStorage.setItem(SESSION_FLAG_KEY, "1");
    const fetchMock = vi.fn(async () =>
      jsonRes(200, { data: { user, accessToken: "tok", expiresIn: 900 } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(screen.getByTestId("s")).toHaveTextContent("loading");
    await waitFor(() =>
      expect(screen.getByTestId("s")).toHaveTextContent("authenticated:Nguyễn Văn An"),
    );
    expect(tokenStore.get()).toBe("tok");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = (fetchMock.mock.calls[0] as unknown as [string])[0];
    expect(url).toBe("/api/v1/auth/refresh");
  });

  it("có cờ + refresh 401 -> anonymous và xóa cờ", async () => {
    window.localStorage.setItem(SESSION_FLAG_KEY, "1");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonRes(401, { error: { code: "INVALID_REFRESH_TOKEN", message: "Hết hạn" } }),
      ),
    );
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("s")).toHaveTextContent("anonymous:-"));
    expect(window.localStorage.getItem(SESSION_FLAG_KEY)).toBeNull();
    expect(tokenStore.get()).toBeNull();
  });

  it("React StrictMode: vẫn chỉ 1 lần gọi /auth/refresh", async () => {
    const { StrictMode } = await import("react");
    window.localStorage.setItem(SESSION_FLAG_KEY, "1");
    const fetchMock = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return jsonRes(200, { data: { user, accessToken: "tok", expiresIn: 900 } });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <StrictMode>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </StrictMode>,
    );
    await waitFor(() => expect(screen.getByTestId("s")).toHaveTextContent("authenticated"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  describe("đồng bộ đăng xuất giữa các tab", () => {
    async function renderAuthenticated() {
      window.localStorage.setItem(SESSION_FLAG_KEY, "1");
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => jsonRes(200, { data: { user, accessToken: "tok", expiresIn: 900 } })),
      );
      render(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      );
      await waitFor(() => expect(screen.getByTestId("s")).toHaveTextContent("authenticated"));
    }

    it("cờ phiên bị xóa ở tab khác -> anonymous và xóa token memory", async () => {
      await renderAuthenticated();
      expect(tokenStore.get()).toBe("tok");
      act(() => {
        window.dispatchEvent(
          new StorageEvent("storage", { key: SESSION_FLAG_KEY, oldValue: "1", newValue: null }),
        );
      });
      expect(screen.getByTestId("s")).toHaveTextContent("anonymous:-");
      expect(tokenStore.get()).toBeNull();
    });

    it("localStorage.clear() ở tab khác (key = null) cũng đăng xuất", async () => {
      await renderAuthenticated();
      act(() => {
        window.dispatchEvent(new StorageEvent("storage", { key: null, newValue: null }));
      });
      expect(screen.getByTestId("s")).toHaveTextContent("anonymous:-");
    });

    it("key khác hoặc cờ được đặt lại (newValue !== null) -> giữ nguyên phiên", async () => {
      await renderAuthenticated();
      act(() => {
        window.dispatchEvent(new StorageEvent("storage", { key: "bb_cart_token", newValue: null }));
        window.dispatchEvent(
          new StorageEvent("storage", { key: SESSION_FLAG_KEY, oldValue: null, newValue: "1" }),
        );
      });
      expect(screen.getByTestId("s")).toHaveTextContent("authenticated");
      expect(tokenStore.get()).toBe("tok");
    });
  });
});
