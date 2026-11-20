import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errRes, jsonRes } from "@/features/account/testing";
import type { CompareItem } from "@/types/catalog";
import { __resetCompareForTests, addToCompare, getCompareSnapshot } from "../store";
import { CompareView } from "./CompareView";

const nav = vi.hoisted(() => ({ sp: "" as string, replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.sp ? `sp=${nav.sp}` : ""),
}));

function item(slug: string, over: Partial<CompareItem> = {}): CompareItem {
  return {
    id: slug,
    slug,
    name: `Tên ${slug}`,
    shortDesc: null,
    brand: { id: "b1", name: "BeanBox Roastery", slug: "beanbox" },
    category: { id: "c1", name: "Cà phê hạt", slug: "ca-phe-hat" },
    primaryImage: null,
    minPrice: 100000,
    compareAtPrice: null,
    inStock: true,
    isFeatured: false,
    ratingAvg: 4.5,
    ratingCount: 10,
    tags: [],
    priceRange: { min: 100000, max: 100000 },
    variants: [
      {
        name: "250 g",
        attributes: {},
        price: 100000,
        effectivePrice: 100000,
        isOnSale: false,
        stockStatus: "IN_STOCK",
        weightGram: 250,
      },
    ],
    coffee: {
      originCountry: "Việt Nam",
      originRegion: "Cầu Đất",
      variety: "Arabica",
      process: "WASHED",
      roastLevel: "MEDIUM",
      altitude: 1500,
      tastingNotes: ["cacao"],
      brewMethods: ["PHIN"],
    },
    ...over,
  };
}

function stubApi(handler: (url: URL) => Response | Promise<Response>) {
  const mock = vi.fn(async (input: string) => handler(new URL(input, "http://localhost")));
  vi.stubGlobal("fetch", mock);
  return mock;
}

const ok = (items: CompareItem[], missing: string[] = []) =>
  jsonRes(200, { data: { items, missing } });

beforeEach(() => {
  window.localStorage.clear();
  __resetCompareForTests();
  nav.sp = "";
  nav.replace.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("CompareView", () => {
  it("đang tải: skeleton có văn bản cho screen reader, gọi API đúng tham số", async () => {
    nav.sp = "a,b";
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const mock = stubApi(async () => {
      await gate;
      return ok([item("a"), item("b")]);
    });
    render(<CompareView />);
    expect(await screen.findByText("Đang tải bảng so sánh")).toBeInTheDocument();
    await waitFor(() => expect(mock).toHaveBeenCalledTimes(1));
    expect(new URL(mock.mock.calls[0]![0], "http://localhost").searchParams.get("slugs")).toBe(
      "a,b",
    );
    release();
    expect(await screen.findByRole("table")).toBeInTheDocument();
  });

  it("lỗi: hiện ErrorState và thử lại thành công", async () => {
    nav.sp = "a,b";
    let fail = true;
    stubApi(() => (fail ? errRes(500, "INTERNAL_ERROR") : ok([item("a"), item("b")])));
    const u = userEvent.setup();
    render(<CompareView />);
    expect(await screen.findByText("Chưa tải được bảng so sánh")).toBeInTheDocument();
    fail = false;
    await u.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByRole("table")).toBeInTheDocument();
  });

  it("không có sp và store rỗng: hướng dẫn, link về danh mục, không gọi API", async () => {
    const mock = stubApi(() => ok([]));
    render(<CompareView />);
    expect(await screen.findByText("Chưa có sản phẩm để so sánh")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xem danh mục sản phẩm" })).toHaveAttribute(
      "href",
      "/danh-muc/ca-phe-hat",
    );
    expect(mock).not.toHaveBeenCalled();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("chỉ có 1 slug trong sp: hướng dẫn chọn thêm, không gọi API", async () => {
    nav.sp = "a";
    const mock = stubApi(() => ok([]));
    render(<CompareView />);
    expect(await screen.findByText("Chọn thêm ít nhất 1 sản phẩm")).toBeInTheDocument();
    expect(mock).not.toHaveBeenCalled();
  });

  it("không có sp nhưng store có sản phẩm: router.replace sang URL chia sẻ được", async () => {
    addToCompare({ slug: "a", name: "A", imageUrl: null, categoryName: null });
    addToCompare({ slug: "b", name: "B", imageUrl: null, categoryName: null });
    stubApi(() => ok([]));
    render(<CompareView />);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/so-sanh?sp=a,b"));
  });

  it("slug thiếu: thông báo và tự bỏ khỏi store", async () => {
    nav.sp = "a,b,c";
    for (const s of ["a", "b", "c"]) {
      addToCompare({ slug: s, name: s, imageUrl: null, categoryName: null });
    }
    stubApi(() => ok([item("a"), item("b")], ["c"]));
    render(<CompareView />);
    expect(await screen.findByText(/không còn được bán hoặc không tồn tại/)).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    await waitFor(() => expect(getCompareSnapshot().map((e) => e.slug)).toEqual(["a", "b"]));
  });

  it("còn dưới 2 sản phẩm sau khi loại missing: hướng dẫn chọn thêm", async () => {
    nav.sp = "a,b";
    stubApi(() => ok([item("a")], ["b"]));
    render(<CompareView />);
    expect(await screen.findByText("Chọn thêm ít nhất 1 sản phẩm")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("bảng: caption, cột sản phẩm, hàng tiêu đề, nhóm cà phê và '—' khi thiếu dữ liệu", async () => {
    nav.sp = "a,b";
    stubApi(() =>
      ok([
        item("a", { priceRange: { min: 100000, max: 150000 }, compareAtPrice: 120000 }),
        item("b", { brand: null, coffee: null }),
      ]),
    );
    render(<CompareView />);
    const table = await screen.findByRole("table", { name: /So sánh 2 sản phẩm/ });
    const cols = within(table).getAllByRole("columnheader");
    expect(cols.map((c) => c.textContent)).toEqual([
      "Thông số",
      expect.stringContaining("Tên a"),
      expect.stringContaining("Tên b"),
    ]);
    expect(within(table).getByRole("link", { name: "Tên a" })).toHaveAttribute(
      "href",
      "/san-pham/a",
    );
    for (const label of [
      "Giá",
      "Tình trạng",
      "Đánh giá",
      "Thương hiệu",
      "Danh mục",
      "Biến thể",
      "Xuất xứ",
      "Vùng",
      "Giống",
      "Sơ chế",
      "Mức rang",
      "Độ cao",
      "Hương vị",
      "Cách pha",
    ]) {
      expect(within(table).getByRole("rowheader", { name: label })).toBeInTheDocument();
    }
    const priceRow = within(table).getByRole("rowheader", { name: "Giá" }).closest("tr")!;
    expect(priceRow).toHaveTextContent("100.000₫ – 150.000₫");
    expect(priceRow.querySelector("del")).toHaveTextContent("120.000₫");
    const roastRow = within(table).getByRole("rowheader", { name: "Mức rang" }).closest("tr")!;
    expect(roastRow).toHaveTextContent("Rang vừa");
    expect(within(roastRow).getAllByRole("cell")[1]).toHaveTextContent("—");
    const brandRow = within(table).getByRole("rowheader", { name: "Thương hiệu" }).closest("tr")!;
    expect(within(brandRow).getAllByRole("cell")[1]).toHaveTextContent("—");
  });

  it("biến thể: thêm khối lượng khi tên chưa có, không lặp khi tên đã có", async () => {
    nav.sp = "a,b";
    const v = (name: string, weightGram: number) => ({
      name,
      attributes: {},
      price: 1,
      effectivePrice: 1,
      isOnSale: false,
      stockStatus: "IN_STOCK" as const,
      weightGram,
    });
    stubApi(() =>
      ok([
        item("a", { variants: [v("Phin nhôm", 300)] }),
        item("b", { variants: [v("250 g - Nguyên hạt", 250)] }),
      ]),
    );
    render(<CompareView />);
    const row = (await screen.findByRole("rowheader", { name: "Biến thể" })).closest("tr")!;
    const [a, b] = within(row).getAllByRole("cell");
    expect(a).toHaveTextContent("Phin nhôm · 300 g");
    expect(b!.textContent).toBe("250 g - Nguyên hạt");
  });

  it("không có sản phẩm cà phê nào: ẩn nhóm 'Thông tin cà phê'", async () => {
    nav.sp = "a,b";
    stubApi(() => ok([item("a", { coffee: null }), item("b", { coffee: null })]));
    render(<CompareView />);
    await screen.findByRole("table");
    expect(screen.queryByRole("rowheader", { name: "Mức rang" })).toBeNull();
    expect(screen.queryByText("Thông tin cà phê")).toBeNull();
  });

  it("công tắc 'Chỉ hiện điểm khác nhau' ẩn các hàng giống nhau", async () => {
    nav.sp = "a,b";
    stubApi(() =>
      ok([
        item("a"),
        item("b", {
          coffee: { ...item("b").coffee!, roastLevel: "DARK" },
          priceRange: { min: 90000, max: 90000 },
        }),
      ]),
    );
    const u = userEvent.setup();
    render(<CompareView />);
    await screen.findByRole("table");
    expect(screen.getByRole("rowheader", { name: "Thương hiệu" })).toBeInTheDocument();
    await u.click(screen.getByRole("checkbox", { name: "Chỉ hiện điểm khác nhau" }));
    expect(screen.queryByRole("rowheader", { name: "Thương hiệu" })).toBeNull();
    expect(screen.queryByRole("rowheader", { name: "Xuất xứ" })).toBeNull();
    expect(screen.getByRole("rowheader", { name: "Mức rang" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "Giá" })).toBeInTheDocument();
    await u.click(screen.getByRole("checkbox", { name: "Chỉ hiện điểm khác nhau" }));
    expect(screen.getByRole("rowheader", { name: "Thương hiệu" })).toBeInTheDocument();
  });

  it("giống hệt nhau và bật công tắc: báo không có điểm khác biệt", async () => {
    nav.sp = "a,b";
    stubApi(() => ok([item("a", { id: "x" }), item("b", { id: "x" })]));
    const u = userEvent.setup();
    render(<CompareView />);
    await screen.findByRole("table");
    await u.click(screen.getByRole("checkbox", { name: "Chỉ hiện điểm khác nhau" }));
    expect(screen.getByText(/giống nhau ở mọi thông số/)).toBeInTheDocument();
  });

  it("khác danh mục: hiện ghi chú; cùng danh mục thì không", async () => {
    nav.sp = "a,b";
    stubApi(() =>
      ok([item("a"), item("b", { category: { id: "c2", name: "Phụ kiện", slug: "phu-kien" } })]),
    );
    const { unmount } = render(<CompareView />);
    expect(
      await screen.findByText(
        "Các sản phẩm thuộc danh mục khác nhau, một số thông số có thể không tương đương.",
      ),
    ).toBeInTheDocument();
    unmount();
    stubApi(() => ok([item("a"), item("b")]));
    render(<CompareView />);
    await screen.findByRole("table");
    expect(screen.queryByText(/danh mục khác nhau/)).toBeNull();
  });

  it("bỏ một sản phẩm khỏi bảng: cập nhật store và URL", async () => {
    nav.sp = "a,b,c";
    for (const s of ["a", "b", "c"]) {
      addToCompare({ slug: s, name: s, imageUrl: null, categoryName: null });
    }
    stubApi(() => ok([item("a"), item("b"), item("c")]));
    const u = userEvent.setup();
    render(<CompareView />);
    await screen.findByRole("table");
    await u.click(screen.getByRole("button", { name: "Bỏ khỏi so sánh: Tên b" }));
    expect(getCompareSnapshot().map((e) => e.slug)).toEqual(["a", "c"]);
    expect(nav.replace).toHaveBeenCalledWith("/so-sanh?sp=a,c");
  });

  it("vùng cuộn ngang focus được và có nhãn", async () => {
    nav.sp = "a,b";
    stubApi(() => ok([item("a"), item("b")]));
    render(<CompareView />);
    await screen.findByRole("table");
    const region = screen.getByRole("region", { name: /Bảng so sánh sản phẩm/ });
    expect(region).toHaveAttribute("tabindex", "0");
  });
});
