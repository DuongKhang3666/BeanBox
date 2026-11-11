import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bodyOf, errRes, jsonRes, makeUser } from "@/features/account/testing";
import { tokenStore } from "@/lib/api/client";
import type { UserRole } from "@/types/auth";
import { makeAdminCoupon, makeCategory, makeProductListItem } from "../testing";
import { AdminCouponEditor } from "./AdminCouponEditor";
import { AdminCouponNew } from "./AdminCouponNew";

let role: UserRole = "ADMIN";
const push = vi.fn();
vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({ status: "authenticated", user: makeUser({ role }) }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

type Handler = (path: string, init: RequestInit) => Response;
function stubFetch(handler: Handler) {
  const mock = vi.fn(async (input: string, init: RequestInit = {}) =>
    handler(input.replace("/api/v1", ""), init),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

const method = (init: RequestInit) => init.method ?? "GET";
const writeIdx = (mock: ReturnType<typeof stubFetch>) =>
  mock.mock.calls.findIndex(([, i]) => method(i as RequestInit) !== "GET");

const TREE = [
  makeCategory({
    id: "c1",
    name: "Cà phê hạt",
    children: [makeCategory({ id: "c2", parentId: "c1", name: "Arabica" })],
  }),
];

function base(onWrite: Handler, coupon = makeAdminCoupon()): Handler {
  return (path, init) => {
    if (method(init) !== "GET") return onWrite(path, init);
    if (path.startsWith("/admin/categories")) return jsonRes(200, { data: TREE });
    if (path.startsWith("/admin/products?"))
      return jsonRes(200, {
        data: [makeProductListItem({ id: "p1", name: "Ethiopia Yirgacheffe" })],
        meta: { page: 1, pageSize: 8, total: 1, totalPages: 1 },
      });
    if (path.startsWith("/admin/products/"))
      return jsonRes(200, { data: { id: "p9", name: "Phin nhôm" } });
    if (path.startsWith("/admin/coupons/")) return jsonRes(200, { data: coupon });
    return errRes(404, "NOT_FOUND");
  };
}

beforeEach(() => {
  role = "ADMIN";
  push.mockReset();
  tokenStore.clear();
});
afterEach(() => vi.unstubAllGlobals());

async function renderNew(onWrite: Handler) {
  const mock = stubFetch(base(onWrite));
  render(<AdminCouponNew />);
  await screen.findByLabelText("Mã giảm giá");
  return { mock, user: userEvent.setup() };
}

const submit = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: "Tạo mã giảm giá" }));

describe("AdminCouponNew", () => {
  it("PERCENT: mã tự uppercase, gửi đúng body (ISO UTC, scope), rồi chuyển sang trang sửa", async () => {
    const { mock, user } = await renderNew(() =>
      jsonRes(201, { data: makeAdminCoupon({ id: "cpNew" }) }),
    );
    await user.type(screen.getByLabelText("Mã giảm giá"), "tet-2027");
    expect(screen.getByLabelText("Mã giảm giá")).toHaveValue("TET-2027");
    await user.type(screen.getByLabelText(/Phần trăm giảm/), "15");
    await user.type(screen.getByLabelText(/Giảm tối đa/), "60000");
    await user.clear(screen.getByLabelText("Đơn tối thiểu (₫)"));
    await user.type(screen.getByLabelText("Đơn tối thiểu (₫)"), "200000");
    fireEvent.change(screen.getByLabelText(/Bắt đầu/), { target: { value: "2026-11-10T15:30" } });
    fireEvent.change(screen.getByLabelText(/Kết thúc/), { target: { value: "2026-11-30T23:59" } });
    await user.type(screen.getByLabelText(/Tổng lượt dùng/), "100");
    await user.type(screen.getByLabelText(/Lượt mỗi khách/), "2");
    await user.type(screen.getByLabelText(/Mô tả/), "Mừng Tết");

    await user.selectOptions(screen.getByLabelText(/Danh mục \(gồm/), "c2");
    expect(
      within(screen.getByRole("list", { name: "Danh mục đã chọn" })).getByText(
        "Cà phê hạt / Arabica",
      ),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText("Sản phẩm"), "ethi");
    await user.click(
      await screen.findByRole("button", { name: "Thêm sản phẩm Ethiopia Yirgacheffe" }),
    );
    expect(
      within(screen.getByRole("list", { name: "Sản phẩm đã chọn" })).getByText(
        "Ethiopia Yirgacheffe",
      ),
    ).toBeInTheDocument();

    await submit(user);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/ma-giam-gia/cpNew"));
    const idx = writeIdx(mock);
    expect(mock.mock.calls[idx]![0]).toBe("/api/v1/admin/coupons");
    expect(bodyOf(mock, idx)).toEqual({
      code: "TET-2027",
      type: "PERCENT",
      value: 15,
      maxDiscount: 60000,
      minOrder: 200000,
      startsAt: "2026-11-10T08:30:00.000Z",
      endsAt: "2026-11-30T16:59:00.000Z",
      usageLimit: 100,
      perUserLimit: 2,
      scope: { categoryIds: ["c2"], productIds: ["p1"] },
      isActive: true,
      description: "Mừng Tết",
    });
  });

  it("FREESHIP: ẩn ô giá trị, gửi value 0; không scope thì không gửi scope", async () => {
    const { mock, user } = await renderNew(() => jsonRes(201, { data: makeAdminCoupon() }));
    await user.type(screen.getByLabelText("Mã giảm giá"), "freeship");
    await user.selectOptions(screen.getByLabelText("Loại mã"), "FREESHIP");
    expect(screen.queryByLabelText(/Phần trăm giảm|Số tiền giảm/)).not.toBeInTheDocument();
    await submit(user);
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(bodyOf(mock, writeIdx(mock))).toEqual({
      code: "FREESHIP",
      type: "FREESHIP",
      value: 0,
      minOrder: 0,
      isActive: true,
    });
  });

  it("FIXED: không có ô giảm tối đa và không gửi maxDiscount dù đã nhập khi là PERCENT", async () => {
    const { mock, user } = await renderNew(() => jsonRes(201, { data: makeAdminCoupon() }));
    await user.type(screen.getByLabelText("Mã giảm giá"), "GIAM50K");
    await user.type(screen.getByLabelText(/Phần trăm giảm/), "10");
    await user.type(screen.getByLabelText(/Giảm tối đa/), "30000");
    await user.selectOptions(screen.getByLabelText("Loại mã"), "FIXED");
    expect(screen.queryByLabelText(/Giảm tối đa/)).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText(/Số tiền giảm/));
    await user.type(screen.getByLabelText(/Số tiền giảm/), "50000");
    await submit(user);
    await waitFor(() => expect(push).toHaveBeenCalled());
    const body = bodyOf(mock, writeIdx(mock)) as Record<string, unknown>;
    expect(body).toEqual({
      code: "GIAM50K",
      type: "FIXED",
      value: 50000,
      minOrder: 0,
      isActive: true,
    });
    expect("maxDiscount" in body).toBe(false);
  });

  it("validate phía client: mã sai định dạng, % ngoài 1-100, kết thúc trước bắt đầu; không gọi API", async () => {
    const { mock, user } = await renderNew(() => jsonRes(201, { data: makeAdminCoupon() }));
    await user.type(screen.getByLabelText("Mã giảm giá"), "ab");
    await user.type(screen.getByLabelText(/Phần trăm giảm/), "101");
    fireEvent.change(screen.getByLabelText(/Bắt đầu/), { target: { value: "2026-11-10T10:00" } });
    fireEvent.change(screen.getByLabelText(/Kết thúc/), { target: { value: "2026-11-09T10:00" } });
    await submit(user);
    expect(await screen.findByText(/Mã gồm 3-30 ký tự/)).toBeInTheDocument();
    expect(screen.getByText(/Phần trăm giảm phải là số nguyên từ 1 đến 100/)).toBeInTheDocument();
    expect(screen.getByText("Thời gian kết thúc phải sau thời gian bắt đầu.")).toBeInTheDocument();
    expect(writeIdx(mock)).toBe(-1);
  });

  it("409 COUPON_CODE_TAKEN hiện dưới ô mã", async () => {
    const { user } = await renderNew(() =>
      errRes(409, "COUPON_CODE_TAKEN", "Mã đã tồn tại", { field: "code" }),
    );
    await user.type(screen.getByLabelText("Mã giảm giá"), "WELCOME10");
    await user.type(screen.getByLabelText(/Phần trăm giảm/), "10");
    await submit(user);
    expect(
      await screen.findByText("Mã này đã tồn tại, vui lòng chọn mã khác."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Mã giảm giá")).toHaveAttribute("aria-invalid", "true");
    expect(push).not.toHaveBeenCalled();
  });

  it("400 VALIDATION_ERROR hiện dưới đúng field, kể cả scope", async () => {
    const { user } = await renderNew(() =>
      errRes(400, "VALIDATION_ERROR", "Dữ liệu không hợp lệ", [
        { field: "minOrder", message: "Đơn tối thiểu quá lớn" },
        { field: "scope.productIds", message: "Sản phẩm không tồn tại" },
      ]),
    );
    await user.type(screen.getByLabelText("Mã giảm giá"), "ABCD");
    await user.type(screen.getByLabelText(/Phần trăm giảm/), "10");
    await submit(user);
    expect(await screen.findByText("Đơn tối thiểu quá lớn")).toBeInTheDocument();
    expect(screen.getByText("Sản phẩm không tồn tại")).toBeInTheDocument();
  });
});

async function renderEditor(onWrite: Handler, coupon = makeAdminCoupon()) {
  const mock = stubFetch(base(onWrite, coupon));
  render(<AdminCouponEditor id={coupon.id} />);
  await screen.findByRole("heading", { name: coupon.code });
  return { mock, user: userEvent.setup() };
}

describe("AdminCouponEditor", () => {
  it("khóa mã và loại; hiển thị đã dùng N lượt; chip phạm vi có tên", async () => {
    await renderEditor(
      () => jsonRes(200, { data: makeAdminCoupon() }),
      makeAdminCoupon({ scope: { categoryIds: ["c1"], productIds: ["p9"] } }),
    );
    expect(screen.getByLabelText("Mã giảm giá")).toBeDisabled();
    expect(screen.getByLabelText("Loại mã")).toBeDisabled();
    expect(screen.getAllByText(/Đã dùng 12 lượt/).length).toBeGreaterThan(0);
    expect(
      within(screen.getByRole("list", { name: "Sản phẩm đã chọn" })).getByText("Phin nhôm"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("list", { name: "Danh mục đã chọn" })).getByText("Cà phê hạt"),
    ).toBeInTheDocument();
  });

  it("sửa chỉ gửi trường đã đổi, không gửi code/type; cảnh báo tổng lượt nhỏ hơn đã dùng", async () => {
    const { mock, user } = await renderEditor(() =>
      jsonRes(200, { data: makeAdminCoupon({ value: 20, updatedAt: "2026-11-03T00:00:00.000Z" }) }),
    );
    const usage = screen.getByLabelText(/Tổng lượt dùng/);
    await user.clear(usage);
    await user.type(usage, "5");
    await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    expect(
      await screen.findByText("Tổng lượt dùng không được nhỏ hơn số lượt đã dùng (12)."),
    ).toBeInTheDocument();
    expect(writeIdx(mock)).toBe(-1);

    await user.clear(usage);
    await user.type(usage, "100");
    const value = screen.getByLabelText(/Phần trăm giảm/);
    await user.clear(value);
    await user.type(value, "20");
    await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    expect(await screen.findByText("Đã lưu thay đổi.")).toBeInTheDocument();
    const idx = writeIdx(mock);
    expect(method(mock.mock.calls[idx]![1] as RequestInit)).toBe("PATCH");
    expect(mock.mock.calls[idx]![0]).toBe("/api/v1/admin/coupons/cp1");
    expect(bodyOf(mock, idx)).toEqual({ value: 20 });
  });

  it("xóa ô thời gian gửi null; xóa phạm vi gửi mảng rỗng", async () => {
    const { mock, user } = await renderEditor(
      () => jsonRes(200, { data: makeAdminCoupon({ updatedAt: "2026-11-03T00:00:00.000Z" }) }),
      makeAdminCoupon({ scope: { categoryIds: ["c1"] } }),
    );
    fireEvent.change(screen.getByLabelText(/Kết thúc/), { target: { value: "" } });
    await user.click(screen.getByRole("button", { name: "Bỏ danh mục Cà phê hạt" }));
    await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    await screen.findByText("Đã lưu thay đổi.");
    expect(bodyOf(mock, writeIdx(mock))).toEqual({
      endsAt: null,
      scope: { categoryIds: [], productIds: [] },
    });
  });

  it("ADMIN xóa được: gọi DELETE rồi về danh sách", async () => {
    const { mock, user } = await renderEditor(() => jsonRes(204));
    await user.click(screen.getByRole("button", { name: "Xóa mã giảm giá" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Xóa mã" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/ma-giam-gia"));
    expect(method(mock.mock.calls[writeIdx(mock)]![1] as RequestInit)).toBe("DELETE");
  });

  it("STAFF không thấy nút xóa", async () => {
    role = "STAFF";
    await renderEditor(() => jsonRes(204));
    expect(screen.queryByRole("button", { name: "Xóa mã giảm giá" })).not.toBeInTheDocument();
  });

  it("xóa 409 CONFLICT gợi ý tắt mã; bấm Tắt mã gửi isActive=false", async () => {
    const { mock, user } = await renderEditor((_p, init) =>
      method(init) === "DELETE"
        ? errRes(409, "CONFLICT", "Mã đã được dùng, hãy tắt mã thay vì xóa")
        : jsonRes(200, {
            data: makeAdminCoupon({
              isActive: false,
              state: "INACTIVE",
              updatedAt: "2026-11-04T00:00:00.000Z",
            }),
          }),
    );
    await user.click(screen.getByRole("button", { name: "Xóa mã giảm giá" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Xóa mã" }));
    const hint = await screen.findByText("Mã đã được dùng, hãy tắt mã thay vì xóa");
    expect(hint).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Tắt mã" }));
    expect(await screen.findByText("Đã tắt mã giảm giá.")).toBeInTheDocument();
    const patchIdx = mock.mock.calls.findIndex(([, i]) => method(i as RequestInit) === "PATCH");
    expect(bodyOf(mock, patchIdx)).toEqual({ isActive: false });
    expect(screen.queryByRole("button", { name: "Tắt mã" })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Đang bật/)).not.toBeChecked();
  });

  it("404 -> thông báo không tìm thấy", async () => {
    stubFetch(() => errRes(404, "NOT_FOUND"));
    render(<AdminCouponEditor id="zzz" />);
    expect(await screen.findByText("Không tìm thấy mã giảm giá")).toBeInTheDocument();
  });
});
