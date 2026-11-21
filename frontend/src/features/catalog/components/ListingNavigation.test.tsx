import { act, fireEvent, render, screen } from "@testing-library/react";
import { Suspense, use, useEffect, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Pagination } from "./Pagination";
import { SortSelect } from "./SortSelect";
import { ListingNavigationProvider, ListingResultsRegion } from "./ListingNavigation";
import { parseFilters } from "../filters";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
  usePathname: () => "/danh-muc/ca-phe",
  useSearchParams: () => new URLSearchParams(),
}));

/** Giả lập Next: router.push trong transition làm một con "treo" tới khi promise xong. */
const nav: {
  setPromise: ((p: Promise<void> | null) => void) | null;
  resolve: (() => void) | null;
} = { setPromise: null, resolve: null };

function Waiter({ promise }: { promise: Promise<void> | null }) {
  if (promise) use(promise);
  return null;
}

function Host() {
  const [promise, setPromise] = useState<Promise<void> | null>(null);
  useEffect(() => {
    nav.setPromise = setPromise;
  }, [setPromise]);
  const filters = parseFilters({});
  return (
    <ListingNavigationProvider>
      <SortSelect pathname="/danh-muc/ca-phe" filters={filters} />
      <Suspense fallback={<p>fallback</p>}>
        <Waiter promise={promise} />
        <ListingResultsRegion>
          <ul data-testid="grid">
            <li>Sản phẩm A</li>
          </ul>
          <Pagination
            pathname="/danh-muc/ca-phe"
            filters={filters}
            meta={{ page: 1, pageSize: 12, total: 30, totalPages: 3 }}
          />
        </ListingResultsRegion>
      </Suspense>
    </ListingNavigationProvider>
  );
}

beforeEach(() => {
  pushMock.mockReset();
  pushMock.mockImplementation(() => {
    const p = new Promise<void>((resolve) => {
      nav.resolve = resolve;
    });
    nav.setPromise?.(p);
  });
});

function region() {
  return screen.getByTestId("grid").parentElement as HTMLElement;
}

describe("trạng thái tải của danh sách sản phẩm (D-059)", () => {
  it("mặc định không busy và không có chữ 'Đang tải...'", () => {
    render(<Host />);
    expect(region()).toHaveAttribute("aria-busy", "false");
    expect(region()).not.toHaveClass("opacity-60");
    expect(screen.queryByText("Đang tải...")).toBeNull();
  });

  it("đổi sắp xếp: aria-busy=true + mờ + chữ ẩn, xong thì trở lại bình thường", async () => {
    render(<Host />);
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Sắp xếp"), { target: { value: "price_asc" } });
    });
    expect(pushMock).toHaveBeenCalledWith("/danh-muc/ca-phe?sort=price_asc", { scroll: false });
    expect(region()).toHaveAttribute("aria-busy", "true");
    expect(region()).toHaveClass("opacity-60");
    expect(screen.getByText("Đang tải...")).toHaveClass("sr-only");
    // Lưới cũ vẫn còn (không nhảy layout, không về skeleton).
    expect(screen.getByText("Sản phẩm A")).toBeInTheDocument();
    expect(screen.queryByText("fallback")).toBeNull();

    await act(async () => {
      nav.resolve?.();
    });
    expect(region()).toHaveAttribute("aria-busy", "false");
    expect(screen.queryByText("Đang tải...")).toBeNull();
  });

  it("bấm số trang: điều hướng qua transition (không tải lại trang), busy rồi hết", async () => {
    render(<Host />);
    await act(async () => {
      fireEvent.click(screen.getByRole("link", { name: "Trang 2" }));
    });
    expect(pushMock).toHaveBeenCalledWith("/danh-muc/ca-phe?page=2", { scroll: false });
    expect(region()).toHaveAttribute("aria-busy", "true");
    await act(async () => {
      nav.resolve?.();
    });
    expect(region()).toHaveAttribute("aria-busy", "false");
  });

  it("click có phím Ctrl giữ hành vi link thật (không gọi router.push)", () => {
    render(<Host />);
    fireEvent.click(screen.getByRole("link", { name: "Trang 2" }), { ctrlKey: true });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("SortSelect dùng riêng (không provider) vẫn đổi URL", () => {
    render(<SortSelect pathname="/tim-kiem" filters={parseFilters({ q: "phin" })} />);
    fireEvent.change(screen.getByLabelText("Sắp xếp"), { target: { value: "price_desc" } });
    expect(pushMock).toHaveBeenCalledWith(expect.stringContaining("sort=price_desc"), {
      scroll: false,
    });
  });
});
