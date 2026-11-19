import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errRes, jsonRes } from "@/features/account/testing";
import { makeProduct } from "@/features/catalog/fixtures";
import { tokenStore } from "@/lib/api/client";
import { WishlistProvider } from "../WishlistProvider";
import { WishlistView } from "./WishlistView";

vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({ status: "authenticated", user: { id: "u1" } }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const item = (id: string, name: string) => ({
  ...makeProduct({ id, slug: `sp-${id}`, name }),
  addedAt: "2026-11-11T03:00:00.000Z",
});

function stub(list: () => Response, ids: string[] = []) {
  const mock = vi.fn(async (input: string, init: RequestInit = {}) => {
    const { pathname } = new URL(input, "http://localhost");
    const method = init.method ?? "GET";
    if (method === "GET" && pathname === "/api/v1/me/wishlist") return list();
    if (method === "GET" && pathname === "/api/v1/me/wishlist/ids") {
      return jsonRes(200, { data: { productIds: ids } });
    }
    if (method === "DELETE") return jsonRes(204);
    return errRes(404, "NOT_FOUND");
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

function renderView() {
  return render(
    <WishlistProvider>
      <WishlistView />
    </WishlistProvider>,
  );
}

beforeEach(() => tokenStore.clear());
afterEach(() => vi.unstubAllGlobals());

describe("WishlistView", () => {
  it("loading rồi hiện lưới thẻ sản phẩm với tim đã bật", async () => {
    stub(() => jsonRes(200, { data: [item("a", "Cà phê A"), item("b", "Cà phê B")] }));
    renderView();
    expect(
      screen.getByRole("status", { name: "Đang tải danh sách yêu thích" }),
    ).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Cà phê A" })).toHaveAttribute(
      "href",
      "/san-pham/sp-a",
    );
    expect(screen.getByRole("link", { name: "Cà phê B" })).toBeInTheDocument();
    const hearts = await screen.findAllByRole("button", { name: "Bỏ khỏi yêu thích" });
    expect(hearts).toHaveLength(2);
    hearts.forEach((h) => expect(h).toHaveAttribute("aria-pressed", "true"));
  });

  it("bỏ yêu thích ngay trên thẻ: gọi DELETE và gỡ thẻ", async () => {
    const mock = stub(() => jsonRes(200, { data: [item("a", "Cà phê A"), item("b", "Cà phê B")] }));
    const u = userEvent.setup();
    renderView();
    await screen.findByRole("link", { name: "Cà phê A" });
    await u.click((await screen.findAllByRole("button", { name: "Bỏ khỏi yêu thích" }))[0]!);
    await waitFor(() =>
      expect(screen.queryByRole("link", { name: "Cà phê A" })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("link", { name: "Cà phê B" })).toBeInTheDocument();
    const del = mock.mock.calls.find(
      ([, i]) => (i as RequestInit | undefined)?.method === "DELETE",
    );
    expect(del![0]).toBe("/api/v1/me/wishlist/a");
  });

  it("danh sách rỗng: empty state có link mua sắm", async () => {
    stub(() => jsonRes(200, { data: [] }));
    renderView();
    expect(await screen.findByText("Bạn chưa có sản phẩm yêu thích")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tiếp tục mua sắm" })).toHaveAttribute(
      "href",
      "/danh-muc/ca-phe-hat",
    );
  });

  it("lỗi: hiện ErrorState và Thử lại tải lại được", async () => {
    let fail = true;
    stub(() =>
      fail ? errRes(500, "INTERNAL_ERROR") : jsonRes(200, { data: [item("a", "Cà phê A")] }),
    );
    const u = userEvent.setup();
    renderView();
    expect(await screen.findByText("Chưa tải được danh sách yêu thích")).toBeInTheDocument();
    fail = false;
    await u.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByRole("link", { name: "Cà phê A" })).toBeInTheDocument();
  });
});
