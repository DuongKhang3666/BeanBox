import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errRes, jsonRes } from "@/features/account/testing";
import { tokenStore } from "@/lib/api/client";
import { listBody, makeReview, makeSummary } from "../testing";
import { ReviewsSection } from "./ReviewsSection";

const auth = vi.hoisted(() => ({ value: { status: "anonymous" } as { status: string } }));
vi.mock("@/features/auth/AuthProvider", () => ({ useAuth: () => auth.value }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/san-pham/ethiopia",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

type Handler = (url: URL, init: RequestInit) => Response | Promise<Response>;

function stubFetch(handler: Handler) {
  const mock = vi.fn(async (input: string, init: RequestInit = {}) =>
    handler(new URL(input, "http://localhost"), init),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

function listCalls(mock: ReturnType<typeof stubFetch>): URL[] {
  return mock.mock.calls
    .map(([u]) => new URL(u, "http://localhost"))
    .filter((u) => u.pathname === "/api/v1/products/ethiopia/reviews");
}

function renderSection() {
  return render(<ReviewsSection slug="ethiopia" productName="Ethiopia Yirgacheffe" />);
}

beforeEach(() => {
  auth.value = { status: "anonymous" };
  tokenStore.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe("ReviewsSection: tóm tắt và danh sách", () => {
  it("hiện điểm trung bình 1 chữ số, tổng số và phân bố 5 -> 1 có nhãn", async () => {
    stubFetch(() => jsonRes(200, listBody([makeReview()])));
    renderSection();
    const section = await screen.findByRole("region", { name: "Đánh giá" });
    expect(section).toHaveAttribute("id", "danh-gia");
    expect(await screen.findByText("18 đánh giá")).toBeInTheDocument();
    expect(screen.getByText("4.6")).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Phân bố đánh giá theo số sao" });
    const rows = within(list).getAllByRole("button");
    expect(rows).toHaveLength(5);
    expect(rows[0]).toHaveAccessibleName(/^5 sao: 12 đánh giá/);
    expect(rows[4]).toHaveAccessibleName(/^1 sao: 0 đánh giá/);
    expect(rows[0]).toHaveAttribute("aria-pressed", "false");
  });

  it("hiện tên tác giả, nhãn Đã mua hàng, phản hồi cửa hàng; nội dung là text thuần giữ xuống dòng", async () => {
    stubFetch(() =>
      jsonRes(
        200,
        listBody([
          makeReview({
            content: "Dòng 1\nDòng 2 <b>đậm</b>",
            reply: "Cảm ơn bạn.",
            repliedAt: "2026-11-12T02:00:00.000Z",
          }),
        ]),
      ),
    );
    const { container } = renderSection();
    expect(await screen.findByText("An N. V.")).toBeInTheDocument();
    expect(screen.getByText("Đã mua hàng")).toBeInTheDocument();
    expect(screen.getByText("Phản hồi từ BeanBox", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Cảm ơn bạn.")).toBeInTheDocument();
    const content = screen.getByText(/Dòng 1/);
    expect(content).toHaveClass("whitespace-pre-line");
    expect(content.textContent).toBe("Dòng 1\nDòng 2 <b>đậm</b>");
    expect(container.querySelector("article b")).toBeNull();
  });

  it("bấm hàng sao để lọc (gửi rating), bấm lại để bỏ lọc", async () => {
    const mock = stubFetch(() => jsonRes(200, listBody([makeReview()])));
    const u = userEvent.setup();
    renderSection();
    const five = await screen.findByRole("button", { name: /^5 sao: 12 đánh giá/ });
    await u.click(five);
    await waitFor(() => expect(listCalls(mock).at(-1)!.searchParams.get("rating")).toBe("5"));
    expect(screen.getByRole("button", { name: /^5 sao/ })).toHaveAttribute("aria-pressed", "true");
    // Tóm tắt không đổi khi lọc.
    expect(screen.getByText("18 đánh giá")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: /^5 sao/ }));
    await waitFor(() => expect(listCalls(mock).at(-1)!.searchParams.get("rating")).toBeNull());
  });

  it("lọc ra rỗng thì báo và có nút xem tất cả", async () => {
    stubFetch((url) =>
      jsonRes(200, listBody(url.searchParams.get("rating") === "2" ? [] : [makeReview()])),
    );
    const u = userEvent.setup();
    renderSection();
    await u.click(await screen.findByRole("button", { name: /^2 sao/ }));
    expect(await screen.findByText("Chưa có đánh giá 2 sao nào.")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Xem tất cả đánh giá" }));
    expect(await screen.findByText("An N. V.")).toBeInTheDocument();
  });

  it("đổi sắp xếp gửi sort tương ứng", async () => {
    const mock = stubFetch(() => jsonRes(200, listBody([makeReview()])));
    const u = userEvent.setup();
    renderSection();
    await u.selectOptions(await screen.findByLabelText("Sắp xếp"), "Điểm thấp");
    await waitFor(() => expect(listCalls(mock).at(-1)!.searchParams.get("sort")).toBe("lowest"));
    await u.selectOptions(screen.getByLabelText("Sắp xếp"), "Điểm cao");
    await waitFor(() => expect(listCalls(mock).at(-1)!.searchParams.get("sort")).toBe("highest"));
  });

  it("Xem thêm nạp trang 2 và nối vào danh sách", async () => {
    const mock = stubFetch((url) => {
      const page = Number(url.searchParams.get("page") ?? 1);
      return jsonRes(
        200,
        listBody([makeReview({ id: `r${page}`, authorName: `Người ${page}` })], {
          page,
          totalPages: 2,
          total: 2,
        }),
      );
    });
    const u = userEvent.setup();
    renderSection();
    expect(await screen.findByText("Người 1")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Xem thêm đánh giá" }));
    expect(await screen.findByText("Người 2")).toBeInTheDocument();
    expect(screen.getByText("Người 1")).toBeInTheDocument();
    expect(listCalls(mock).at(-1)!.searchParams.get("page")).toBe("2");
    expect(screen.queryByRole("button", { name: "Xem thêm đánh giá" })).not.toBeInTheDocument();
  });

  it("empty: Chưa có đánh giá, không hiện bộ lọc", async () => {
    stubFetch(() =>
      jsonRes(
        200,
        listBody([], {
          summary: makeSummary({
            ratingAvg: 0,
            ratingCount: 0,
            distribution: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 },
          }),
        }),
      ),
    );
    renderSection();
    expect(await screen.findByText("Chưa có đánh giá")).toBeInTheDocument();
    expect(screen.queryByLabelText("Sắp xếp")).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: /Phân bố/ })).not.toBeInTheDocument();
  });

  it("loading rồi error có nút Thử lại", async () => {
    let fail = true;
    const mock = stubFetch(() =>
      fail ? errRes(500, "INTERNAL_ERROR") : jsonRes(200, listBody([makeReview()])),
    );
    const u = userEvent.setup();
    renderSection();
    expect(screen.getByRole("status", { name: "Đang tải đánh giá" })).toBeInTheDocument();
    expect(await screen.findByText("Chưa tải được đánh giá")).toBeInTheDocument();
    fail = false;
    await u.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("An N. V.")).toBeInTheDocument();
    expect(listCalls(mock)).toHaveLength(2);
  });
});

describe("ReviewsSection: khối viết đánh giá khi chưa đăng nhập", () => {
  it("hiện nút Đăng nhập để đánh giá với next quay lại #danh-gia", async () => {
    stubFetch(() => jsonRes(200, listBody([makeReview()])));
    renderSection();
    const link = await screen.findByRole("link", { name: "Đăng nhập để đánh giá" });
    expect(link).toHaveAttribute(
      "href",
      `/dang-nhap?next=${encodeURIComponent("/san-pham/ethiopia#danh-gia")}`,
    );
  });
});
