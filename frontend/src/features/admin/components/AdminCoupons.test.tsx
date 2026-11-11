import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errRes, jsonRes } from "@/features/account/testing";
import { tokenStore } from "@/lib/api/client";
import { makeAdminCoupon } from "../testing";
import { AdminCoupons } from "./AdminCoupons";

let search = "";
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
  useRouter: () => ({ replace, push: vi.fn() }),
}));

function stubFetch(handler: (path: string, init: RequestInit) => Response) {
  const mock = vi.fn(async (input: string, init: RequestInit = {}) =>
    handler(input.replace("/api/v1", ""), init),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

const META = { page: 1, pageSize: 20, total: 3, totalPages: 1 };
const COUPONS = [
  makeAdminCoupon(),
  makeAdminCoupon({
    id: "cp2",
    code: "GIAM50K",
    type: "FIXED",
    value: 50000,
    maxDiscount: null,
    minOrder: 0,
    startsAt: null,
    endsAt: null,
    usageLimit: null,
    perUserLimit: null,
    usedCount: 3,
    state: "INACTIVE",
    isActive: false,
  }),
  makeAdminCoupon({
    id: "cp3",
    code: "FREESHIP30",
    type: "FREESHIP",
    value: 0,
    maxDiscount: 30000,
    state: "SCHEDULED",
  }),
];

beforeEach(() => {
  search = "";
  replace.mockReset();
  tokenStore.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe("AdminCoupons", () => {
  it("skeleton -> danh sách với giá trị theo loại, thời gian, đã dùng/giới hạn, badge trạng thái", async () => {
    const mock = stubFetch(() => jsonRes(200, { data: COUPONS, meta: META }));
    render(<AdminCoupons />);
    expect(screen.getByLabelText("Đang tải mã giảm giá")).toBeInTheDocument();

    const link = (await screen.findAllByRole("link", { name: "WELCOME10" }))[0]!;
    expect(link).toHaveAttribute("href", "/admin/ma-giam-gia/cp1");
    expect(screen.getAllByText("10% tối đa 50.000₫").length).toBeGreaterThan(0);
    expect(screen.getAllByText("50.000₫").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Miễn phí ship tối đa 30.000₫").length).toBeGreaterThan(0);
    expect(screen.getAllByText("12/100").length).toBeGreaterThan(0);
    expect(screen.getAllByText("3/∞").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Không giới hạn").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Đang chạy").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Đã tắt").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Sắp diễn ra").length).toBeGreaterThan(0);
    expect(mock).toHaveBeenCalledWith("/api/v1/admin/coupons?pageSize=20", expect.anything());
    expect(screen.getByRole("link", { name: "Thêm mã giảm giá" })).toHaveAttribute(
      "href",
      "/admin/ma-giam-gia/moi",
    );
  });

  it("bộ lọc trên URL được gửi lên API và hiển thị trong ô lọc; đổi lọc ghi lại URL", async () => {
    search = "q=welcome&type=PERCENT&state=ACTIVE&page=2";
    const mock = stubFetch(() => jsonRes(200, { data: [COUPONS[0]], meta: META }));
    render(<AdminCoupons />);
    await screen.findAllByRole("link", { name: "WELCOME10" });
    expect(mock).toHaveBeenCalledWith(
      "/api/v1/admin/coupons?q=welcome&type=PERCENT&state=ACTIVE&page=2&pageSize=20",
      expect.anything(),
    );
    expect(screen.getByLabelText("Tìm theo mã")).toHaveValue("welcome");
    expect(screen.getByLabelText("Loại mã")).toHaveValue("PERCENT");
    expect(screen.getByLabelText("Trạng thái")).toHaveValue("ACTIVE");

    await userEvent.selectOptions(screen.getByLabelText("Trạng thái"), "EXPIRED");
    expect(replace).toHaveBeenCalledWith("/admin/ma-giam-gia?q=welcome&type=PERCENT&state=EXPIRED");
  });

  it("nhập ô tìm kiếm được debounce rồi ghi vào URL", async () => {
    stubFetch(() => jsonRes(200, { data: COUPONS, meta: META }));
    render(<AdminCoupons />);
    await screen.findAllByRole("link", { name: "WELCOME10" });
    await userEvent.type(screen.getByLabelText("Tìm theo mã"), "abc");
    expect(replace).not.toHaveBeenCalled();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/admin/ma-giam-gia?q=abc"));
  });

  it("giá trị lọc lạ trên URL bị bỏ qua", async () => {
    search = "type=BOGUS&state=NOPE";
    const mock = stubFetch(() => jsonRes(200, { data: COUPONS, meta: META }));
    render(<AdminCoupons />);
    await screen.findAllByRole("link", { name: "WELCOME10" });
    expect(mock).toHaveBeenCalledWith("/api/v1/admin/coupons?pageSize=20", expect.anything());
  });

  it("rỗng khi có lọc -> Xóa bộ lọc; lỗi -> Thử lại", async () => {
    search = "state=EXPIRED";
    let n = 0;
    stubFetch(() =>
      ++n === 1
        ? errRes(500, "INTERNAL_ERROR")
        : jsonRes(200, { data: [], meta: { ...META, total: 0 } }),
    );
    render(<AdminCoupons />);
    const alert = await screen.findByRole("alert");
    await userEvent.click(within(alert).getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Không có mã giảm giá nào")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xóa bộ lọc" })).toHaveAttribute(
      "href",
      "/admin/ma-giam-gia",
    );
  });

  it("phân trang giữ bộ lọc", async () => {
    search = "type=FIXED";
    stubFetch(() =>
      jsonRes(200, { data: COUPONS, meta: { page: 1, pageSize: 20, total: 45, totalPages: 3 } }),
    );
    render(<AdminCoupons />);
    const p2 = await screen.findByRole("link", { name: "Trang 2" });
    expect(p2).toHaveAttribute("href", "/admin/ma-giam-gia?type=FIXED&page=2");
  });
});
