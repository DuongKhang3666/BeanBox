import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errRes, jsonRes } from "@/features/account/testing";
import { tokenStore } from "@/lib/api/client";
import type { AdminReview } from "@/types/admin";
import { AdminReviews } from "./AdminReviews";

let search = "";
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
  useRouter: () => ({ replace, push: vi.fn() }),
}));

function makeReview(over: Partial<AdminReview> = {}): AdminReview {
  return {
    id: "r1",
    rating: 4,
    content: "Thơm, hậu ngọt.\n<b>không phải in đậm</b>",
    authorName: "An N. V.",
    verifiedPurchase: true,
    createdAt: "2026-11-10T03:00:00.000Z",
    updatedAt: "2026-11-10T03:00:00.000Z",
    reply: null,
    repliedAt: null,
    status: "PUBLISHED",
    images: [],
    product: { id: "p1", name: "Ethiopia Yirgacheffe", slug: "ethiopia" },
    author: { id: "u1", fullName: "Nguyễn Văn An", email: "an@example.com" },
    ...over,
  };
}

const inList = () => within(screen.getByRole("list"));
const META = { page: 1, pageSize: 20, total: 1, totalPages: 1 };

type Write = { method: string; path: string; body: unknown };
function setup(review: AdminReview, onWrite: (w: Write) => Response) {
  const writes: Write[] = [];
  const mock = vi.fn(async (input: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const path = input.replace("/api/v1", "");
    if (method === "GET") return jsonRes(200, { data: [review], meta: META });
    const w = { method, path, body: init.body ? JSON.parse(init.body as string) : undefined };
    writes.push(w);
    return onWrite(w);
  });
  vi.stubGlobal("fetch", mock);
  return { mock, writes };
}

beforeEach(() => {
  search = "";
  replace.mockReset();
  tokenStore.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe("AdminReviews", () => {
  it("hiển thị sản phẩm (link), tác giả, sao, nội dung text thuần, trạng thái", async () => {
    setup(makeReview(), () => jsonRes(200, { data: makeReview() }));
    render(<AdminReviews />);
    expect(await screen.findByRole("link", { name: "Ethiopia Yirgacheffe" })).toHaveAttribute(
      "href",
      "/admin/san-pham/p1",
    );
    expect(screen.getByText(/Nguyễn Văn An/)).toBeInTheDocument();
    expect(screen.getByText("an@example.com")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "4 trên 5 sao" })).toBeInTheDocument();
    expect(inList().getByText("Đang hiển thị")).toBeInTheDocument();
    expect(screen.getByText(/<b>không phải in đậm<\/b>/)).toBeInTheDocument();
    expect(document.querySelector("li b")).toBeNull();
  });

  it("bộ lọc trên URL được chuyển thành query; chọn lọc -> cập nhật URL", async () => {
    search = "status=HIDDEN&rating=2&productId=p1&hasReply=false&q=thơm&page=3";
    const { mock } = setup(makeReview(), () => jsonRes(200, { data: makeReview() }));
    render(<AdminReviews />);
    await screen.findByText("1 đánh giá");
    const url = (mock.mock.calls as unknown as [string][])[0]![0];
    const qs = new URL(url, "http://x").searchParams;
    expect(url).toContain("/admin/reviews");
    expect(qs.get("status")).toBe("HIDDEN");
    expect(qs.get("rating")).toBe("2");
    expect(qs.get("productId")).toBe("p1");
    expect(qs.get("hasReply")).toBe("false");
    expect(qs.get("q")).toBe("thơm");
    expect(qs.get("page")).toBe("3");

    await userEvent.selectOptions(screen.getByLabelText("Phản hồi"), "true");
    expect(replace).toHaveBeenLastCalledWith(
      "/admin/danh-gia?status=HIDDEN&rating=2&productId=p1&hasReply=true&q=th%C6%A1m",
    );
  });

  it("Ẩn gửi PATCH status HIDDEN, cập nhật dòng từ response và thông báo aria-live", async () => {
    const { writes } = setup(makeReview(), () =>
      jsonRes(200, { data: makeReview({ status: "HIDDEN" }) }),
    );
    render(<AdminReviews />);
    await userEvent.click(await screen.findByRole("button", { name: /^Ẩn đánh giá của/ }));
    await waitFor(() => expect(inList().getByText("Đã ẩn")).toBeInTheDocument());
    expect(writes).toEqual([
      { method: "PATCH", path: "/admin/reviews/r1", body: { status: "HIDDEN" } },
    ]);
    expect(screen.getByRole("status", { name: "" })).toHaveTextContent("Đã ẩn đánh giá.");
    // Nút đổi thành Hiện và gửi PUBLISHED.
    expect(screen.getByRole("button", { name: /^Hiện đánh giá của/ })).toBeInTheDocument();
  });

  it("Hiện gửi PATCH status PUBLISHED", async () => {
    const hidden = makeReview({ status: "HIDDEN" });
    const { writes } = setup(hidden, () => jsonRes(200, { data: makeReview() }));
    render(<AdminReviews />);
    await userEvent.click(await screen.findByRole("button", { name: /^Hiện đánh giá của/ }));
    await waitFor(() => expect(inList().getByText("Đang hiển thị")).toBeInTheDocument());
    expect(writes[0]).toMatchObject({ method: "PATCH", body: { status: "PUBLISHED" } });
  });

  it("trả lời: rỗng bị chặn, hợp lệ gửi PUT (đã trim) và hiện phản hồi", async () => {
    const replied = makeReview({
      reply: "Cảm ơn bạn.",
      repliedAt: "2026-11-11T02:00:00.000Z",
    });
    const { writes } = setup(makeReview(), () => jsonRes(200, { data: replied }));
    render(<AdminReviews />);
    await userEvent.click(await screen.findByRole("button", { name: /^Trả lời đánh giá của/ }));
    const dialog = screen.getByRole("dialog", { name: "Trả lời đánh giá" });
    await userEvent.type(within(dialog).getByLabelText("Nội dung trả lời"), "   ");
    await userEvent.click(within(dialog).getByRole("button", { name: "Gửi trả lời" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(/bắt buộc, tối đa 1000/);
    expect(writes).toHaveLength(0);

    await userEvent.type(within(dialog).getByLabelText("Nội dung trả lời"), " Cảm ơn bạn. ");
    await userEvent.click(within(dialog).getByRole("button", { name: "Gửi trả lời" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(writes).toEqual([
      { method: "PUT", path: "/admin/reviews/r1/reply", body: { reply: "Cảm ơn bạn." } },
    ]);
    expect(screen.getByText("Phản hồi của cửa hàng", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Cảm ơn bạn.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Sửa trả lời đánh giá của/ })).toBeInTheDocument();
  });

  it("lỗi server khi trả lời hiện trong dialog và giữ dialog mở", async () => {
    setup(makeReview(), () => errRes(429, "RATE_LIMITED"));
    render(<AdminReviews />);
    await userEvent.click(await screen.findByRole("button", { name: /^Trả lời đánh giá của/ }));
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Nội dung trả lời"), "Xin chào");
    await userEvent.click(within(dialog).getByRole("button", { name: "Gửi trả lời" }));
    expect(await within(dialog).findByText(/quá nhanh/)).toBeInTheDocument();
  });

  it("xóa trả lời: xác nhận rồi gửi DELETE, dòng mất phản hồi", async () => {
    const withReply = makeReview({ reply: "Cảm ơn bạn.", repliedAt: "2026-11-11T02:00:00.000Z" });
    const { writes } = setup(withReply, () => jsonRes(200, { data: makeReview() }));
    render(<AdminReviews />);
    await userEvent.click(await screen.findByRole("button", { name: /^Xóa trả lời đánh giá của/ }));
    const dialog = screen.getByRole("dialog", { name: "Xóa trả lời" });
    expect(writes).toHaveLength(0);
    await userEvent.click(within(dialog).getByRole("button", { name: "Xóa trả lời" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(writes).toEqual([
      { method: "DELETE", path: "/admin/reviews/r1/reply", body: undefined },
    ]);
    expect(screen.queryByText("Cảm ơn bạn.")).not.toBeInTheDocument();
  });

  it("trạng thái rỗng và lỗi tải", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonRes(200, { data: [], meta: { ...META, total: 0 } })),
    );
    const { unmount } = render(<AdminReviews />);
    expect(await screen.findByText("Không có đánh giá nào")).toBeInTheDocument();
    unmount();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => errRes(500, "INTERNAL_ERROR")),
    );
    render(<AdminReviews />);
    expect(await screen.findByText("Không tải được đánh giá")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thử lại" })).toBeInTheDocument();
  });
});
