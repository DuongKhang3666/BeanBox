import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bodyOf, errRes, jsonRes } from "@/features/account/testing";
import { tokenStore } from "@/lib/api/client";
import type { MyReviewState } from "@/types/review";
import { listBody, makeMine, makeMyReview, makeReview } from "../testing";
import { ReviewsSection } from "./ReviewsSection";

vi.mock("@/features/auth/AuthProvider", () => ({ useAuth: () => ({ status: "authenticated" }) }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/san-pham/ethiopia",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const LIST = "/api/v1/products/ethiopia/reviews";

interface Env {
  /** Trả lần lượt; phần tử cuối được lặp lại. */
  me: Array<MyReviewState | Response>;
  post?: () => Response;
  patch?: () => Response;
}

function setup(env: Env) {
  let meCalls = 0;
  const mock = vi.fn(async (input: string, init: RequestInit = {}) => {
    const { pathname } = new URL(input, "http://localhost");
    const method = init.method ?? "GET";
    if (method === "GET" && pathname === `${LIST}/me`) {
      const item = env.me[Math.min(meCalls++, env.me.length - 1)]!;
      return item instanceof Response ? item.clone() : jsonRes(200, { data: item });
    }
    if (method === "GET" && pathname === LIST) return jsonRes(200, listBody([makeReview()]));
    if (method === "POST" && pathname === LIST) return env.post!();
    if (method === "PATCH" && pathname.startsWith("/api/v1/reviews/")) return env.patch!();
    return errRes(404, "NOT_FOUND");
  });
  vi.stubGlobal("fetch", mock);
  const count = (method: string, path: string) =>
    mock.mock.calls.filter(
      ([u, i]) =>
        new URL(u, "http://localhost").pathname === path &&
        ((i as RequestInit)?.method ?? "GET") === method,
    ).length;
  const indexOf = (method: string) =>
    mock.mock.calls.findIndex(([, i]) => (i as RequestInit | undefined)?.method === method);
  return { mock, count, indexOf };
}

function renderSection() {
  return render(<ReviewsSection slug="ethiopia" productName="Ethiopia Yirgacheffe" />);
}

beforeEach(() => tokenStore.clear());
afterEach(() => vi.unstubAllGlobals());

describe("khối viết đánh giá (đã đăng nhập)", () => {
  it("NOT_PURCHASED -> chỉ khách đã nhận hàng mới đánh giá được", async () => {
    setup({ me: [makeMine({ canReview: false, reason: "NOT_PURCHASED" })] });
    renderSection();
    expect(
      await screen.findByText("Chỉ khách đã nhận hàng mới đánh giá được."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Viết đánh giá" })).not.toBeInTheDocument();
  });

  it("canReview -> hiện form với radio group 5 sao và bộ đếm ký tự", async () => {
    setup({ me: [makeMine()] });
    const u = userEvent.setup();
    renderSection();
    expect(await screen.findByRole("form", { name: "Viết đánh giá" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: /Điểm đánh giá/ })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(5);
    expect(screen.getByText("0/2000")).toBeInTheDocument();
    await u.type(screen.getByLabelText(/Nội dung/), "Rất thơm");
    expect(screen.getByText("8/2000")).toBeInTheDocument();
  });

  it("chọn sao bằng bàn phím (mũi tên trên radio group)", async () => {
    setup({ me: [makeMine()] });
    const u = userEvent.setup();
    renderSection();
    const radios = await screen.findAllByRole("radio");
    await u.click(radios[2]!);
    expect(radios[2]).toBeChecked();
    await u.keyboard("{ArrowRight}");
    expect(radios[3]).toBeChecked();
  });

  it("validate: chưa chọn sao -> báo lỗi, không gọi POST", async () => {
    const env = setup({ me: [makeMine()] });
    const u = userEvent.setup();
    renderSection();
    await u.click(await screen.findByRole("button", { name: "Gửi đánh giá" }));
    expect(await screen.findByText("Vui lòng chọn số sao từ 1 đến 5.")).toBeInTheDocument();
    expect(env.count("POST", LIST)).toBe(0);
  });

  it("validate: nội dung quá 2000 ký tự -> báo lỗi, không gọi POST", async () => {
    const env = setup({ me: [makeMine()] });
    const u = userEvent.setup();
    renderSection();
    await u.click((await screen.findAllByRole("radio"))[3]!);
    fireEvent.change(screen.getByLabelText(/Nội dung/), { target: { value: "a".repeat(2001) } });
    expect(screen.getByText("2001/2000")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Gửi đánh giá" }));
    expect(await screen.findByText("Nội dung tối đa 2000 ký tự.")).toBeInTheDocument();
    expect(env.count("POST", LIST)).toBe(0);
  });

  it("gửi thành công: POST rating+content, rồi làm mới danh sách và trạng thái của tôi", async () => {
    const mine = makeMyReview({ rating: 4, content: "Rất thơm" });
    const env = setup({
      me: [
        makeMine(),
        makeMine({ canReview: false, reason: "ALREADY_REVIEWED", review: mine, canEdit: true }),
      ],
      post: () => jsonRes(201, { data: mine }),
    });
    const u = userEvent.setup();
    renderSection();
    await u.click((await screen.findAllByRole("radio"))[3]!);
    await u.type(screen.getByLabelText(/Nội dung/), "  Rất thơm  ");
    const listBefore = env.count("GET", LIST);
    await u.click(screen.getByRole("button", { name: "Gửi đánh giá" }));
    expect(await screen.findByText("Đánh giá của bạn")).toBeInTheDocument();
    const postIdx = env.indexOf("POST");
    expect(bodyOf(env.mock, postIdx)).toEqual({ rating: 4, content: "Rất thơm" });
    await waitFor(() => expect(env.count("GET", LIST)).toBe(listBefore + 1));
    expect(screen.getByRole("button", { name: "Sửa đánh giá" })).toBeInTheDocument();
  });

  it("409 REVIEW_NOT_ALLOWED (NOT_PURCHASED) -> thông báo tiếng Việt", async () => {
    setup({
      me: [makeMine(), makeMine({ canReview: false, reason: "NOT_PURCHASED" })],
      post: () => errRes(409, "REVIEW_NOT_ALLOWED", "x", { reason: "NOT_PURCHASED" }),
    });
    const u = userEvent.setup();
    renderSection();
    await u.click((await screen.findAllByRole("radio"))[4]!);
    await u.click(screen.getByRole("button", { name: "Gửi đánh giá" }));
    const alert = await screen.findAllByText("Chỉ khách đã nhận hàng mới đánh giá được.");
    expect(alert.length).toBeGreaterThan(0);
    expect(screen.queryByRole("form", { name: "Viết đánh giá" })).not.toBeInTheDocument();
  });

  it("429 -> báo gửi quá nhanh ngay trong form, vẫn giữ nội dung", async () => {
    setup({
      me: [makeMine()],
      post: () => errRes(429, "RATE_LIMITED", "x", { retryAfterSec: 30 }),
    });
    const u = userEvent.setup();
    renderSection();
    await u.click((await screen.findAllByRole("radio"))[4]!);
    await u.type(screen.getByLabelText(/Nội dung/), "Ngon");
    await u.click(screen.getByRole("button", { name: "Gửi đánh giá" }));
    expect(
      await screen.findByText("Bạn gửi đánh giá quá nhanh. Vui lòng thử lại sau 30 giây."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Nội dung/)).toHaveValue("Ngon");
  });
});

describe("đã có đánh giá", () => {
  it("HIDDEN -> hiện nhãn Đang bị ẩn và nút Sửa khi canEdit", async () => {
    setup({
      me: [
        makeMine({
          canReview: false,
          reason: "ALREADY_REVIEWED",
          review: makeMyReview({ status: "HIDDEN", content: "Nội dung của tôi" }),
          canEdit: true,
        }),
      ],
    });
    renderSection();
    expect(await screen.findByText("Đang bị ẩn")).toBeInTheDocument();
    expect(screen.getByText("Nội dung của tôi")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sửa đánh giá" })).toBeInTheDocument();
  });

  it("hết hạn sửa (canEdit=false) -> không có nút Sửa", async () => {
    setup({
      me: [
        makeMine({
          canReview: false,
          reason: "ALREADY_REVIEWED",
          review: makeMyReview(),
          canEdit: false,
        }),
      ],
    });
    renderSection();
    expect(await screen.findByText("Đánh giá của bạn")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sửa đánh giá" })).not.toBeInTheDocument();
  });

  it("sửa: form điền sẵn, PATCH /reviews/:id rồi làm mới", async () => {
    const review = makeMyReview({ id: "rv9", rating: 3, content: "Tạm ổn" });
    const env = setup({
      me: [
        makeMine({ canReview: false, reason: "ALREADY_REVIEWED", review, canEdit: true }),
        makeMine({
          canReview: false,
          reason: "ALREADY_REVIEWED",
          review: { ...review, rating: 5, content: "Tuyệt" },
          canEdit: true,
        }),
      ],
      patch: () => jsonRes(200, { data: { ...review, rating: 5, content: "Tuyệt" } }),
    });
    const u = userEvent.setup();
    renderSection();
    await u.click(await screen.findByRole("button", { name: "Sửa đánh giá" }));
    expect(screen.getAllByRole("radio")[2]).toBeChecked();
    const box = screen.getByLabelText(/Nội dung/);
    expect(box).toHaveValue("Tạm ổn");
    await u.clear(box);
    await u.type(box, "Tuyệt");
    await u.click(screen.getAllByRole("radio")[4]!);
    await u.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    expect(await screen.findByText("Tuyệt")).toBeInTheDocument();
    const calls = env.mock.mock.calls;
    const patch = calls.find(([, i]) => (i as RequestInit | undefined)?.method === "PATCH")!;
    expect(new URL(patch[0], "http://localhost").pathname).toBe("/api/v1/reviews/rv9");
    expect(JSON.parse((patch[1] as RequestInit).body as string)).toEqual({
      rating: 5,
      content: "Tuyệt",
    });
  });

  it("409 REVIEW_EDIT_EXPIRED khi sửa -> thông báo và mất nút Sửa", async () => {
    const review = makeMyReview();
    setup({
      me: [
        makeMine({ canReview: false, reason: "ALREADY_REVIEWED", review, canEdit: true }),
        makeMine({ canReview: false, reason: "ALREADY_REVIEWED", review, canEdit: false }),
      ],
      patch: () => errRes(409, "REVIEW_EDIT_EXPIRED"),
    });
    const u = userEvent.setup();
    renderSection();
    await u.click(await screen.findByRole("button", { name: "Sửa đánh giá" }));
    await u.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    expect(
      await screen.findByText(
        "Đã quá 30 ngày kể từ lúc đăng nên bạn không thể sửa đánh giá này nữa.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sửa đánh giá" })).not.toBeInTheDocument();
  });

  it("lỗi tải trạng thái của tôi -> có Thử lại", async () => {
    setup({
      me: [errRes(500, "INTERNAL_ERROR"), makeMine({ canReview: false, reason: "NOT_PURCHASED" })],
    });
    const u = userEvent.setup();
    renderSection();
    await u.click(await screen.findByRole("button", { name: "Thử lại" }));
    expect(
      await screen.findByText("Chỉ khách đã nhận hàng mới đánh giá được."),
    ).toBeInTheDocument();
  });
});
