import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errRes, jsonRes } from "@/features/account/testing";
import { tokenStore } from "@/lib/api/client";
import { WishlistProvider } from "../WishlistProvider";
import { WishlistButton } from "./WishlistButton";

const auth = vi.hoisted(() => ({
  value: { status: "authenticated", user: { id: "u1" } } as {
    status: string;
    user: { id: string } | null;
  },
}));
const push = vi.hoisted(() => vi.fn());
vi.mock("@/features/auth/AuthProvider", () => ({ useAuth: () => auth.value }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));

interface Env {
  ids?: string[];
  post?: () => Response | Promise<Response>;
  del?: () => Response | Promise<Response>;
}

function stub(env: Env = {}) {
  const mock = vi.fn(async (input: string, init: RequestInit = {}) => {
    const { pathname } = new URL(input, "http://localhost");
    const method = init.method ?? "GET";
    if (method === "GET" && pathname === "/api/v1/me/wishlist/ids") {
      return jsonRes(200, { data: { productIds: env.ids ?? [] } });
    }
    if (method === "POST" && pathname === "/api/v1/me/wishlist") {
      return env.post ? env.post() : jsonRes(201, { data: { productId: "p1", addedAt: "x" } });
    }
    if (method === "DELETE" && pathname.startsWith("/api/v1/me/wishlist/")) {
      return env.del ? env.del() : jsonRes(204);
    }
    return errRes(404, "NOT_FOUND");
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

function renderButtons() {
  return render(
    <WishlistProvider>
      <WishlistButton productId="p1" />
      <WishlistButton productId="p2" />
    </WishlistProvider>,
  );
}

const callsTo = (mock: ReturnType<typeof stub>, method: string) =>
  mock.mock.calls.filter(([, i]) => ((i as RequestInit | undefined)?.method ?? "GET") === method);

beforeEach(() => {
  auth.value = { status: "authenticated", user: { id: "u1" } };
  push.mockReset();
  tokenStore.clear();
  window.history.replaceState(null, "", "/san-pham/ethiopia?x=1");
});
afterEach(() => vi.unstubAllGlobals());

describe("WishlistButton", () => {
  it("lấy ids một lần cho mọi nút và đặt aria-pressed/aria-label đúng", async () => {
    const mock = stub({ ids: ["p1"] });
    renderButtons();
    const pressed = await screen.findByRole("button", { name: "Bỏ khỏi yêu thích" });
    expect(pressed).toHaveAttribute("aria-pressed", "true");
    const other = screen.getByRole("button", { name: "Thêm vào yêu thích" });
    expect(other).toHaveAttribute("aria-pressed", "false");
    expect(callsTo(mock, "GET")).toHaveLength(1);
  });

  it("chưa đăng nhập: không gọi API, bấm -> chuyển /dang-nhap?next=<trang hiện tại>", async () => {
    auth.value = { status: "anonymous", user: null };
    const mock = stub();
    const u = userEvent.setup();
    renderButtons();
    await u.click(screen.getAllByRole("button", { name: "Thêm vào yêu thích" })[0]!);
    expect(push).toHaveBeenCalledWith(
      `/dang-nhap?next=${encodeURIComponent("/san-pham/ethiopia?x=1")}`,
    );
    expect(mock).not.toHaveBeenCalled();
  });

  it("thêm: cập nhật lạc quan ngay (trước khi server trả lời) rồi POST productId", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const mock = stub({
      post: async () => {
        await gate;
        return jsonRes(201, { data: { productId: "p1", addedAt: "x" } });
      },
    });
    const u = userEvent.setup();
    renderButtons();
    await waitFor(() => expect(callsTo(mock, "GET")).toHaveLength(1));
    const [first] = screen.getAllByRole("button", { name: "Thêm vào yêu thích" });
    await u.click(first!);
    // Server chưa trả lời mà nút đã đổi.
    expect(screen.getByRole("button", { name: "Bỏ khỏi yêu thích" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    release();
    await waitFor(() => expect(callsTo(mock, "POST")).toHaveLength(1));
    expect(JSON.parse(callsTo(mock, "POST")[0]![1]!.body as string)).toEqual({ productId: "p1" });
    expect(screen.getByRole("button", { name: "Bỏ khỏi yêu thích" })).toBeInTheDocument();
  });

  it("bỏ yêu thích: DELETE /me/wishlist/:id", async () => {
    const mock = stub({ ids: ["p1"] });
    const u = userEvent.setup();
    renderButtons();
    await u.click(await screen.findByRole("button", { name: "Bỏ khỏi yêu thích" }));
    await waitFor(() => expect(callsTo(mock, "DELETE")).toHaveLength(1));
    expect(callsTo(mock, "DELETE")[0]![0]).toBe("/api/v1/me/wishlist/p1");
    expect(screen.queryByRole("button", { name: "Bỏ khỏi yêu thích" })).not.toBeInTheDocument();
  });

  it("lỗi: hoàn tác trạng thái và báo lỗi", async () => {
    stub({ post: () => errRes(500, "INTERNAL_ERROR") });
    const u = userEvent.setup();
    renderButtons();
    await u.click((await screen.findAllByRole("button", { name: "Thêm vào yêu thích" }))[0]!);
    expect(
      await screen.findByText("Chưa cập nhật được danh sách yêu thích. Vui lòng thử lại."),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Thêm vào yêu thích" })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Bỏ khỏi yêu thích" })).not.toBeInTheDocument();
  });

  it("409 WISHLIST_LIMIT: hoàn tác và thông báo đã đầy", async () => {
    stub({ post: () => errRes(409, "WISHLIST_LIMIT") });
    const u = userEvent.setup();
    renderButtons();
    await u.click((await screen.findAllByRole("button", { name: "Thêm vào yêu thích" }))[0]!);
    expect(await screen.findByText(/Danh sách yêu thích đã đầy/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Thêm vào yêu thích" })).toHaveLength(2);
  });

  it("onToggled chỉ gọi khi server xác nhận", async () => {
    stub({ ids: ["p1"] });
    const onToggled = vi.fn();
    const u = userEvent.setup();
    render(
      <WishlistProvider>
        <WishlistButton productId="p1" onToggled={onToggled} />
      </WishlistProvider>,
    );
    await u.click(await screen.findByRole("button", { name: "Bỏ khỏi yêu thích" }));
    await waitFor(() => expect(onToggled).toHaveBeenCalledWith(false));
  });

  it("variant labeled hiển thị chữ trùng với nhãn", async () => {
    stub();
    render(
      <WishlistProvider>
        <WishlistButton productId="p1" variant="labeled" />
      </WishlistProvider>,
    );
    const btn = await screen.findByRole("button", { name: "Thêm vào yêu thích" });
    expect(btn).toHaveTextContent("Thêm vào yêu thích");
  });
});
