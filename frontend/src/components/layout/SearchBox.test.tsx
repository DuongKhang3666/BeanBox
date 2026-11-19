import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SuggestResult } from "@/types/catalog";
import { SearchBox } from "./SearchBox";

const push = vi.fn();
const get = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/api/client", () => ({ api: { get: (...a: unknown[]) => get(...a) } }));

const RESULT: SuggestResult = {
  products: [
    { slug: "robusta-bmt", name: "Robusta Buôn Ma Thuột", imageUrl: null, minPrice: 95000 },
    { slug: "phin-inox", name: "Phin inox", imageUrl: null, minPrice: 60000 },
  ],
  categories: [{ slug: "ca-phe-viet", name: "Cà phê Việt" }],
};

function type(value: string) {
  fireEvent.change(screen.getByRole("combobox"), { target: { value } });
}

async function flush(ms = 250) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  push.mockReset();
  get.mockReset();
  get.mockResolvedValue({ data: RESULT });
});
afterEach(() => vi.useRealTimers());

describe("SearchBox - gợi ý tìm kiếm", () => {
  it("dưới 2 ký tự (sau trim) không gọi API và không mở dropdown", async () => {
    render(<SearchBox />);
    type("r");
    type(" a ");
    await flush(500);
    expect(get).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-expanded", "false");
  });

  it("debounce 250ms rồi gọi /search/suggest với q đã trim và limit=6", async () => {
    render(<SearchBox />);
    type("ro");
    await flush(200);
    type(" rob ");
    await flush(200);
    expect(get).not.toHaveBeenCalled();
    expect(screen.getByText("Đang tìm gợi ý...")).toBeInTheDocument();
    await flush(60);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0]![0]).toBe("/search/suggest");
    expect(get.mock.calls[0]![1]).toMatchObject({ query: { q: "rob", limit: 6 } });
  });

  it("hủy request cũ bằng AbortController khi gõ tiếp", async () => {
    get.mockImplementation(() => new Promise(() => {}));
    render(<SearchBox />);
    type("ro");
    await flush();
    const signal = get.mock.calls[0]![1].signal as AbortSignal;
    expect(signal.aborted).toBe(false);
    type("rob");
    expect(signal.aborted).toBe(true);
  });

  it("hiển thị nhóm Sản phẩm (tên, giá VND) và Danh mục với thuộc tính ARIA", async () => {
    render(<SearchBox />);
    type("rob");
    await flush();
    const input = screen.getByRole("combobox");
    expect(input).toHaveAttribute("aria-expanded", "true");
    const listbox = screen.getByRole("listbox");
    expect(input.getAttribute("aria-controls")).toBe(listbox.id);
    expect(screen.getByText("Sản phẩm")).toBeInTheDocument();
    expect(screen.getByText("Danh mục")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(3);
    expect(screen.getByText(/95\.000/)).toBeInTheDocument();
  });

  it("phím Xuống/Lên đổi aria-activedescendant (vòng tròn), Enter đi tới mục chọn", async () => {
    render(<SearchBox />);
    type("rob");
    await flush();
    const input = screen.getByRole("combobox");
    const opts = screen.getAllByRole("option");
    expect(input).not.toHaveAttribute("aria-activedescendant");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute("aria-activedescendant", opts[0]!.id);
    expect(opts[0]!).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input).toHaveAttribute("aria-activedescendant", opts[2]!.id);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute("aria-activedescendant", opts[1]!.id);

    fireEvent.keyDown(input, { key: "Enter" });
    expect(push).toHaveBeenCalledWith("/san-pham/phin-inox");
  });

  it("chọn danh mục bằng bàn phím đi tới /danh-muc/<slug>", async () => {
    render(<SearchBox />);
    type("ca");
    await flush();
    const input = screen.getByRole("combobox");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(push).toHaveBeenCalledWith("/danh-muc/ca-phe-viet");
  });

  it("Enter khi chưa chọn mục -> /tim-kiem?q=", async () => {
    render(<SearchBox />);
    type("cà phê");
    await flush();
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    expect(push).toHaveBeenCalledWith(`/tim-kiem?q=${encodeURIComponent("cà phê")}`);
  });

  it("Enter với ô trống không điều hướng", () => {
    render(<SearchBox />);
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    expect(push).not.toHaveBeenCalled();
  });

  it("Escape đóng dropdown", async () => {
    render(<SearchBox />);
    type("rob");
    await flush();
    const input = screen.getByRole("combobox");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("click ra ngoài đóng dropdown", async () => {
    render(<SearchBox />);
    type("rob");
    await flush();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("không có kết quả -> 'Không có gợi ý'", async () => {
    get.mockResolvedValue({ data: { products: [], categories: [] } });
    render(<SearchBox />);
    type("zzz");
    await flush();
    expect(screen.getByText("Không có gợi ý")).toBeInTheDocument();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("lỗi mạng -> ẩn dropdown im lặng", async () => {
    get.mockRejectedValue(new Error("network"));
    render(<SearchBox />);
    type("rob");
    await flush();
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Không có gợi ý")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("click một gợi ý điều hướng tới trang sản phẩm", async () => {
    render(<SearchBox />);
    type("rob");
    await flush();
    fireEvent.click(screen.getAllByRole("option")[0]!);
    expect(push).toHaveBeenCalledWith("/san-pham/robusta-bmt");
  });
});
