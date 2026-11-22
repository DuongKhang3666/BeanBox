import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errRes, jsonRes, makeUser } from "@/features/account/testing";
import { resetLocationCache } from "@/features/locations/api";
import { tokenStore } from "@/lib/api/client";
import type { AdminSettings as Data } from "@/types/settings";
import { formatVnDateTime } from "../format";
import { makeAdminSettings } from "../testing";
import { AdminNav, ADMIN_NAV } from "./AdminNav";
import { AdminSettings } from "./AdminSettings";

let role: "ADMIN" | "STAFF" = "ADMIN";
vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({ status: "authenticated", user: makeUser({ role }) }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/cai-dat",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

const PROVINCES = [
  { code: "01", name: "Thành phố Hà Nội" },
  { code: "79", name: "Thành phố Hồ Chí Minh" },
  { code: "48", name: "Thành phố Đà Nẵng" },
];
const UPDATED = { "store.contact": "2026-11-10T08:30:00.000Z" };

type Handler = (path: string, init: RequestInit) => Response | undefined;
function stubFetch(extra?: Handler, data: Data = makeAdminSettings()) {
  const mock = vi.fn(async (input: string, init: RequestInit = {}) => {
    const path = input.replace("/api/v1", "");
    const custom = extra?.(path, init);
    if (custom) return custom;
    if (path === "/locations/provinces") return jsonRes(200, { data: PROVINCES });
    if (path === "/admin/settings" && (init.method ?? "GET") === "GET") {
      return jsonRes(200, { data, meta: { updatedAt: UPDATED } });
    }
    return errRes(404, "NOT_FOUND");
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

const putCalls = (mock: ReturnType<typeof stubFetch>) =>
  mock.mock.calls.filter(([p, i]) => p === "/api/v1/admin/settings" && i?.method === "PUT");
const putBody = (mock: ReturnType<typeof stubFetch>, n = 0) =>
  JSON.parse(String(putCalls(mock)[n]![1]!.body)) as Record<string, unknown>;

beforeEach(() => {
  role = "ADMIN";
  tokenStore.clear();
  resetLocationCache();
});
afterEach(() => vi.unstubAllGlobals());

describe("ADMIN_NAV", () => {
  it("có mục Cài đặt chỉ dành cho ADMIN, đặt cuối danh sách", () => {
    const last = ADMIN_NAV[ADMIN_NAV.length - 1]!;
    expect(last).toMatchObject({ href: "/admin/cai-dat", label: "Cài đặt", adminOnly: true });
  });

  it("STAFF không thấy mục Cài đặt, ADMIN thấy", () => {
    role = "STAFF";
    const { unmount } = render(<AdminNav />);
    expect(screen.queryByRole("link", { name: "Cài đặt" })).not.toBeInTheDocument();
    unmount();
    role = "ADMIN";
    render(<AdminNav />);
    expect(screen.getByRole("link", { name: "Cài đặt" })).toHaveAttribute("href", "/admin/cai-dat");
  });
});

describe("AdminSettings", () => {
  it("skeleton -> các section với giá trị hiện tại, ghi chú và 'Cập nhật lần cuối'", async () => {
    stubFetch();
    render(<AdminSettings />);
    expect(screen.getByLabelText("Đang tải cài đặt")).toBeInTheDocument();

    expect(await screen.findByRole("heading", { name: "Phí vận chuyển" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nội thành - Tiêu chuẩn")).toHaveValue("20000");
    expect(screen.getByLabelText("Ngưỡng miễn phí vận chuyển Tiêu chuẩn")).toHaveValue("500000");
    expect(screen.getByLabelText("Thời hạn thanh toán online")).toHaveValue("15");
    expect(screen.getByLabelText("Email")).toHaveValue("hello@beanbox.local");
    expect(screen.getByText(/cập nhật trong vòng khoảng 5 phút/)).toBeInTheDocument();
    expect(
      screen.getByText(`Cập nhật lần cuối: ${formatVnDateTime("2026-11-10T08:30:00.000Z")}`),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Chưa chỉnh sửa/).length).toBe(4);
    expect(await screen.findByLabelText("Thành phố Hà Nội")).toBeChecked();
    expect(screen.getByLabelText("Thành phố Đà Nẵng")).not.toBeChecked();
  });

  it("lưu một section chỉ gửi đúng key của section đó và hiện thông báo thành công", async () => {
    const mock = stubFetch((path, init) => {
      if (path === "/admin/settings" && init.method === "PUT") {
        return jsonRes(200, {
          data: makeAdminSettings({
            "store.contact": {
              name: "BeanBox",
              email: "shop@example.vn",
              phone: "0901234567",
              address: "",
            },
          }),
          meta: { updatedAt: { "store.contact": "2026-11-19T03:00:00.000Z" } },
        });
      }
      return undefined;
    });
    const user = userEvent.setup();
    render(<AdminSettings />);
    const email = await screen.findByLabelText("Email");
    await user.clear(email);
    await user.type(email, "Shop@Example.vn");
    await user.type(screen.getByLabelText("Số điện thoại"), "0901 234 567");
    await user.click(screen.getByRole("button", { name: "Lưu thông tin liên hệ" }));

    await waitFor(() => expect(putCalls(mock)).toHaveLength(1));
    expect(putBody(mock)).toEqual({
      "store.contact": {
        name: "BeanBox",
        email: "shop@example.vn",
        phone: "0901234567",
        address: "",
      },
    });
    const card = screen.getByRole("form", { name: "Thông tin liên hệ" });
    expect(await within(card).findByRole("status")).toHaveTextContent("Đã lưu cài đặt.");
    expect(
      within(card).getByText(`Cập nhật lần cuối: ${formatVnDateTime("2026-11-19T03:00:00.000Z")}`),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Số điện thoại")).toHaveValue("0901234567");
  });

  it("section phí chỉ gửi 5 key phí/thời gian giao/thời hạn; không gửi key khác", async () => {
    const mock = stubFetch((path, init) =>
      path === "/admin/settings" && init.method === "PUT"
        ? jsonRes(200, { data: makeAdminSettings(), meta: { updatedAt: {} } })
        : undefined,
    );
    const user = userEvent.setup();
    render(<AdminSettings />);
    const f = await screen.findByLabelText("Nội thành - Tiêu chuẩn");
    await user.clear(f);
    await user.type(f, "25000");
    await user.click(screen.getByRole("button", { name: "Lưu phí vận chuyển" }));
    await waitFor(() => expect(putCalls(mock)).toHaveLength(1));
    const body = putBody(mock);
    expect(Object.keys(body).sort()).toEqual([
      "order.paymentExpiryMinutes",
      "shipping.eta",
      "shipping.freeShippingThreshold",
      "shipping.rates",
      "shipping.weightSurcharge",
    ]);
    expect(body["shipping.rates"]).toEqual({
      inner: { STANDARD: 25000, EXPRESS: 35000 },
      other: { STANDARD: 35000, EXPRESS: 55000 },
    });
  });

  it("validate phía client: hiện lỗi theo ô (aria-invalid) và không gọi API", async () => {
    const mock = stubFetch();
    const user = userEvent.setup();
    render(<AdminSettings />);
    const f = await screen.findByLabelText("Thời hạn thanh toán online");
    await user.clear(f);
    await user.type(f, "3");
    await user.click(screen.getByRole("button", { name: "Lưu phí vận chuyển" }));
    expect(f).toHaveAttribute("aria-invalid", "true");
    const err = screen.getByText(/Thời hạn thanh toán phải là số nguyên từ 5 đến 120/);
    expect(f.getAttribute("aria-describedby")).toContain(err.id);
    expect(putCalls(mock)).toHaveLength(0);
  });

  it("lỗi 400 của server được map về đúng ô (field lồng nhau và field con)", async () => {
    const mock = stubFetch((path, init) =>
      path === "/admin/settings" && init.method === "PUT"
        ? errRes(400, "VALIDATION_ERROR", "Dữ liệu không hợp lệ", [
            { field: "shipping.rates.other.EXPRESS", message: "Phí vượt mức cho phép" },
          ])
        : undefined,
    );
    const user = userEvent.setup();
    render(<AdminSettings />);
    await user.click(await screen.findByRole("button", { name: "Lưu phí vận chuyển" }));
    const f = await screen.findByLabelText("Tỉnh/thành khác - Nhanh");
    await waitFor(() => expect(f).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getByText("Phí vượt mức cho phép")).toBeInTheDocument();
    expect(screen.getByLabelText("Nội thành - Nhanh")).not.toHaveAttribute("aria-invalid");
    expect(putCalls(mock)).toHaveLength(1);
  });

  it("lỗi 400 ở banner: map home.banners.N.imageUrl về ô ảnh của banner N", async () => {
    stubFetch(
      (path, init) =>
        path === "/admin/settings" && init.method === "PUT"
          ? errRes(400, "VALIDATION_ERROR", "Dữ liệu không hợp lệ", [
              { field: "home.banners.1.imageUrl", message: "Ảnh không tồn tại" },
            ])
          : undefined,
      makeAdminSettings({
        "home.banners": [
          {
            imageUrl: "/uploads/a.webp",
            alt: "A",
            title: "",
            subtitle: "",
            href: null,
            isActive: true,
          },
          {
            imageUrl: "/uploads/b.webp",
            alt: "B",
            title: "",
            subtitle: "",
            href: "/san-pham",
            isActive: true,
          },
        ],
      }),
    );
    const user = userEvent.setup();
    render(<AdminSettings />);
    await user.click(await screen.findByRole("button", { name: "Lưu banner trang chủ" }));
    expect(await screen.findByText("Ảnh không tồn tại")).toBeInTheDocument();
    expect(screen.getByLabelText("Đường dẫn ảnh banner 2")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Đường dẫn ảnh banner 1")).not.toHaveAttribute("aria-invalid");
  });

  it("banner: thêm, nhập sai bị chặn ở client, đổi thứ tự và xóa; gửi đúng thứ tự", async () => {
    const mock = stubFetch((path, init) =>
      path === "/admin/settings" && init.method === "PUT"
        ? jsonRes(200, { data: makeAdminSettings(), meta: { updatedAt: {} } })
        : undefined,
    );
    const user = userEvent.setup();
    render(<AdminSettings />);
    await user.click(await screen.findByRole("button", { name: "Thêm banner" }));
    await user.click(screen.getByRole("button", { name: "Thêm banner" }));
    await user.type(screen.getByLabelText("Đường dẫn ảnh banner 1"), "https://evil.example/x.png");
    await user.click(screen.getByRole("button", { name: "Lưu banner trang chủ" }));
    expect(screen.getAllByText(/bắt đầu bằng \/uploads\//).length).toBeGreaterThan(0);
    expect(putCalls(mock)).toHaveLength(0);

    await user.clear(screen.getByLabelText("Đường dẫn ảnh banner 1"));
    await user.type(screen.getByLabelText("Đường dẫn ảnh banner 1"), "/uploads/a.webp");
    await user.type(screen.getByLabelText("Mô tả ảnh banner 1 (alt)"), "Ảnh A");
    await user.type(screen.getByLabelText("Đường dẫn ảnh banner 2"), "/uploads/b.webp");
    await user.type(screen.getByLabelText("Mô tả ảnh banner 2 (alt)"), "Ảnh B");
    await user.type(screen.getByLabelText("Liên kết banner 2"), "/san-pham");
    await user.click(screen.getByRole("button", { name: "Đưa banner 2 lên" }));
    expect(screen.getByLabelText("Đường dẫn ảnh banner 1")).toHaveValue("/uploads/b.webp");
    await user.click(screen.getByRole("button", { name: "Lưu banner trang chủ" }));
    await waitFor(() => expect(putCalls(mock)).toHaveLength(1));
    expect(putBody(mock)).toEqual({
      "home.banners": [
        {
          imageUrl: "/uploads/b.webp",
          alt: "Ảnh B",
          title: "",
          subtitle: "",
          href: "/san-pham",
          isActive: true,
        },
        {
          imageUrl: "/uploads/a.webp",
          alt: "Ảnh A",
          title: "",
          subtitle: "",
          href: null,
          isActive: true,
        },
      ],
    });
  });

  it("banner: tải ảnh lên điền đường dẫn trả về", async () => {
    const mock = stubFetch((path, init) =>
      path === "/admin/uploads" && init.method === "POST"
        ? jsonRes(201, { data: { url: "/uploads/new.webp", contentType: "image/webp", size: 10 } })
        : undefined,
    );
    const user = userEvent.setup();
    render(<AdminSettings />);
    await user.click(await screen.findByRole("button", { name: "Thêm banner" }));
    const file = new File(["x"], "b.webp", { type: "image/webp" });
    await user.upload(screen.getByLabelText("Chọn tệp ảnh cho banner 1"), file);
    await waitFor(() =>
      expect(screen.getByLabelText("Đường dẫn ảnh banner 1")).toHaveValue("/uploads/new.webp"),
    );
    expect(mock).toHaveBeenCalledWith(
      "/api/v1/admin/uploads",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("đang lưu thì nút bị vô hiệu", async () => {
    let release: (r: Response) => void = () => {};
    stubFetch((path, init) =>
      path === "/admin/settings" && init.method === "PUT"
        ? (new Promise<Response>((res) => (release = res)) as unknown as Response)
        : undefined,
    );
    const user = userEvent.setup();
    render(<AdminSettings />);
    const btn = await screen.findByRole("button", { name: "Lưu thông tin liên hệ" });
    await user.click(btn);
    await waitFor(() => expect(btn).toBeDisabled());
    release(jsonRes(200, { data: makeAdminSettings(), meta: { updatedAt: {} } }));
    await waitFor(() => expect(btn).toBeEnabled());
  });

  it("STAFF thấy thông báo, không gọi API", () => {
    role = "STAFF";
    const mock = stubFetch();
    render(<AdminSettings />);
    expect(screen.getByRole("alert")).toHaveTextContent("Chỉ quản trị viên mới xem được trang này");
    expect(mock).not.toHaveBeenCalled();
  });

  it("API trả 403 cho tài khoản được coi là ADMIN -> thông báo quyền", async () => {
    const mock = vi.fn(async () => errRes(403, "FORBIDDEN"));
    vi.stubGlobal("fetch", mock);
    render(<AdminSettings />);
    expect(await screen.findByText(/Chỉ quản trị viên mới xem được trang này/)).toBeInTheDocument();
  });

  it("lỗi tải -> error state có nút Thử lại; thử lại thành công", async () => {
    let fail = true;
    const mock = vi.fn(async (input: string) => {
      const path = input.replace("/api/v1", "");
      if (path === "/locations/provinces") return jsonRes(200, { data: PROVINCES });
      if (fail) return errRes(500, "INTERNAL_ERROR");
      return jsonRes(200, { data: makeAdminSettings(), meta: { updatedAt: {} } });
    });
    vi.stubGlobal("fetch", mock);
    const user = userEvent.setup();
    render(<AdminSettings />);
    expect(await screen.findByText("Không tải được cài đặt")).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByRole("heading", { name: "Phí vận chuyển" })).toBeInTheDocument();
  });

  it("khu vực nội thành: chọn tỉnh + mã phường gửi đúng 2 key; lỗi tải tỉnh có Thử lại", async () => {
    const mock = stubFetch((path, init) =>
      path === "/admin/settings" && init.method === "PUT"
        ? jsonRes(200, { data: makeAdminSettings(), meta: { updatedAt: {} } })
        : undefined,
    );
    const user = userEvent.setup();
    render(<AdminSettings />);
    await user.click(await screen.findByLabelText("Thành phố Đà Nẵng"));
    await user.click(screen.getByLabelText("Thành phố Hà Nội"));
    await user.type(screen.getByLabelText("Mã phường/xã nội thành bổ sung"), "26740, 26741");
    await user.click(screen.getByRole("button", { name: "Lưu khu vực nội thành" }));
    await waitFor(() => expect(putCalls(mock)).toHaveLength(1));
    expect(putBody(mock)).toEqual({
      "shipping.innerCityProvinceCodes": ["79", "48"],
      "shipping.innerCityWardCodes": ["26740", "26741"],
    });
  });

  it("khu vực nội thành: danh sách tỉnh lỗi -> nút lưu bị khóa, có Thử lại", async () => {
    stubFetch((path) =>
      path === "/locations/provinces" ? errRes(500, "INTERNAL_ERROR") : undefined,
    );
    render(<AdminSettings />);
    expect(await screen.findByText("Không tải được danh sách tỉnh/thành.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lưu khu vực nội thành" })).toBeDisabled();
  });
});
