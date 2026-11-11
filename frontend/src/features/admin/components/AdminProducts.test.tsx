import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errRes, jsonRes } from "@/features/account/testing";
import { tokenStore } from "@/lib/api/client";
import { BRAND_LIST, CATEGORY_TREE } from "../productTesting";
import { makeProductListItem } from "../testing";
import { AdminProducts } from "./AdminProducts";

let search = "";
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
  useRouter: () => ({ replace, push: vi.fn() }),
}));

type ListHandler = (path: string) => Response;
function stubFetch(list: ListHandler) {
  const mock = vi.fn(async (input: string) => {
    const path = input.replace("/api/v1", "");
    if (path.startsWith("/admin/categories")) return jsonRes(200, { data: CATEGORY_TREE });
    if (path.startsWith("/admin/brands")) return jsonRes(200, { data: BRAND_LIST });
    return list(path);
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}
const productCalls = (mock: ReturnType<typeof stubFetch>) =>
  mock.mock.calls.map(([u]) => u as string).filter((u) => u.startsWith("/api/v1/admin/products"));

const META = { page: 1, pageSize: 20, total: 2, totalPages: 1 };
const ITEMS = [
  makeProductListItem(),
  makeProductListItem({
    id: "p2",
    slug: "phieu-v60",
    name: "Phễu V60 nhựa",
    status: "DRAFT",
    isFeatured: true,
    brand: null,
    category: { id: "c4", name: "Phễu V60" },
    minPrice: null,
    variantCount: 0,
    totalStock: 0,
    inStock: false,
  }),
];

beforeEach(() => {
  search = "";
  replace.mockReset();
  tokenStore.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe("AdminProducts", () => {
  it("render danh sách: tên, slug, danh mục, thương hiệu, giá, biến thể, tồn, trạng thái", async () => {
    stubFetch(() => jsonRes(200, { data: ITEMS, meta: META }));
    render(<AdminProducts />);
    expect((await screen.findAllByText("Ethiopia Yirgacheffe")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("ethiopia-yirgacheffe").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/165\.000/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Đang bán").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Nháp").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Nổi bật").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Thêm sản phẩm" })[0]).toHaveAttribute(
      "href",
      "/admin/san-pham/moi",
    );
    expect(screen.getAllByRole("link", { name: "Ethiopia Yirgacheffe" })[0]).toHaveAttribute(
      "href",
      "/admin/san-pham/p1",
    );
  });

  it("bộ lọc trên URL được chuyển thành query gửi API", async () => {
    search = "q=ethi&status=DRAFT,ACTIVE&categoryId=c1&brandId=b1&deleted=true&sort=name&page=2";
    const mock = stubFetch(() => jsonRes(200, { data: [], meta: { ...META, total: 0 } }));
    render(<AdminProducts />);
    await screen.findByText("Không có sản phẩm đã xóa");
    const url = productCalls(mock)[0]!;
    const qs = new URL(url, "http://x").searchParams;
    expect(qs.get("q")).toBe("ethi");
    expect(qs.get("status")).toBe("DRAFT,ACTIVE");
    expect(qs.get("categoryId")).toBe("c1");
    expect(qs.get("brandId")).toBe("b1");
    expect(qs.get("deleted")).toBe("true");
    expect(qs.get("sort")).toBe("name");
    expect(qs.get("page")).toBe("2");
  });

  it("đổi bộ lọc -> cập nhật URL (trạng thái, danh mục, tab Đã xóa, tìm kiếm debounce)", async () => {
    stubFetch(() => jsonRes(200, { data: ITEMS, meta: META }));
    render(<AdminProducts />);
    await screen.findAllByText("Ethiopia Yirgacheffe");
    const user = userEvent.setup();

    await user.click(screen.getByRole("checkbox", { name: "Đang bán" }));
    expect(replace).toHaveBeenLastCalledWith("/admin/san-pham?status=ACTIVE");

    await screen.findByRole("option", { name: "Dụng cụ pha chế / Phễu V60" });
    await user.selectOptions(screen.getByLabelText("Danh mục"), "c4");
    expect(replace).toHaveBeenLastCalledWith("/admin/san-pham?categoryId=c4");

    await user.click(screen.getByRole("button", { name: "Đã xóa" }));
    expect(replace).toHaveBeenLastCalledWith("/admin/san-pham?deleted=true");

    await user.type(screen.getByLabelText("Tìm theo tên hoặc slug"), "v60");
    await waitFor(() => expect(replace).toHaveBeenLastCalledWith("/admin/san-pham?q=v60"));
  });

  it("rỗng -> EmptyState; có bộ lọc thì có nút Xóa bộ lọc", async () => {
    search = "status=ARCHIVED";
    stubFetch(() => jsonRes(200, { data: [], meta: { ...META, total: 0 } }));
    render(<AdminProducts />);
    expect(await screen.findByText("Không có sản phẩm nào")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xóa bộ lọc" })).toHaveAttribute(
      "href",
      "/admin/san-pham",
    );
  });

  it("lỗi tải -> ErrorState có Thử lại", async () => {
    let n = 0;
    stubFetch(() =>
      ++n === 1 ? errRes(500, "INTERNAL_ERROR") : jsonRes(200, { data: ITEMS, meta: META }),
    );
    render(<AdminProducts />);
    const alert = await screen.findByRole("alert");
    await userEvent.click(within(alert).getByRole("button", { name: "Thử lại" }));
    expect((await screen.findAllByText("Phễu V60 nhựa")).length).toBeGreaterThan(0);
  });
});
