import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Address } from "@/types/account";
import { tokenStore } from "@/lib/api/client";
import { resetLocationCache } from "@/features/locations/api";
import { PROVINCES, WARDS, bodyOf, errRes, jsonRes, makeAddress } from "../testing";
import { AddressBook } from "./AddressBook";

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

/** Fake server nhỏ: route theo "METHOD /path". */
function stubFetch(routes: Record<string, Handler>) {
  const mock = vi.fn(async (input: string, init: RequestInit = {}) => {
    const path = input.replace("/api/v1", "");
    const key = `${init.method ?? "GET"} ${path}`;
    const h = routes[key];
    if (!h) throw new Error(`Chưa mock: ${key}`);
    return h(path, init);
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

/** Route danh mục tỉnh/phường dùng mã thật. */
const LOCATION_ROUTES: Record<string, Handler> = {
  "GET /locations/provinces": () => jsonRes(200, { data: PROVINCES }),
  ...Object.fromEntries(
    Object.entries(WARDS).map(([code, list]) => [
      `GET /locations/provinces/${code}/wards`,
      (() => jsonRes(200, { data: list })) as Handler,
    ]),
  ),
};

const A1 = makeAddress({ id: "a1", fullName: "Nguyễn Văn An", isDefault: true });
const A2 = makeAddress({
  id: "a2",
  fullName: "Trần Thị Bình",
  phone: "0912345678",
  line1: "99 Đường Số 2",
  isDefault: false,
});

beforeEach(() => {
  tokenStore.clear();
  resetLocationCache();
});
afterEach(() => vi.unstubAllGlobals());

async function openEditOf(u: ReturnType<typeof userEvent.setup>, name: string) {
  await u.click(await screen.findByRole("button", { name: `Sửa địa chỉ của ${name}` }));
}

describe("AddressBook – trạng thái danh sách", () => {
  it("loading -> danh sách; mặc định có nhãn và không có nút Đặt làm mặc định", async () => {
    stubFetch({ "GET /me/addresses": () => jsonRes(200, { data: [A1, A2] }) });
    render(<AddressBook />);
    expect(screen.getByLabelText("Đang tải sổ địa chỉ")).toBeInTheDocument();
    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText("Mặc định")).toBeInTheDocument();
    expect(within(items[0]!).queryByRole("button", { name: /làm mặc định/ })).toBeNull();
    expect(within(items[1]!).getByRole("button", { name: /làm mặc định/ })).toBeInTheDocument();
  });

  it("empty -> EmptyState có nút Thêm địa chỉ", async () => {
    stubFetch({ "GET /me/addresses": () => jsonRes(200, { data: [] }) });
    render(<AddressBook />);
    expect(await screen.findByText("Bạn chưa có địa chỉ nào")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thêm địa chỉ" })).toBeEnabled();
  });

  it("error -> ErrorState, bấm Thử lại tải được danh sách", async () => {
    let calls = 0;
    stubFetch({
      "GET /me/addresses": () => {
        calls += 1;
        return calls === 1
          ? errRes(500, "INTERNAL_ERROR", "Lỗi hệ thống")
          : jsonRes(200, { data: [A1] });
      },
    });
    const u = userEvent.setup();
    render(<AddressBook />);
    expect(await screen.findByText("Không tải được sổ địa chỉ")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Nguyễn Văn An")).toBeInTheDocument();
    expect(calls).toBe(2);
  });

  it("đủ 10 địa chỉ -> nút thêm bị disable kèm giải thích", async () => {
    const ten = Array.from({ length: 10 }, (_, i) =>
      makeAddress({ id: `a${i}`, isDefault: i === 0 }),
    );
    stubFetch({ "GET /me/addresses": () => jsonRes(200, { data: ten }) });
    render(<AddressBook />);
    const btn = await screen.findByRole("button", { name: "Thêm địa chỉ" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAccessibleDescription(/tối đa 10 địa chỉ/);
  });
});

describe("AddressBook – xóa và đặt mặc định", () => {
  it("xóa cần xác nhận: focus vào Hủy, Esc đóng, xác nhận mới gọi DELETE", async () => {
    let list: Address[] = [A1, A2];
    const fetchMock = stubFetch({
      "GET /me/addresses": () => jsonRes(200, { data: list }),
      "DELETE /me/addresses/a2": () => {
        list = [A1];
        return jsonRes(204);
      },
    });
    const u = userEvent.setup();
    render(<AddressBook />);
    await u.click(await screen.findByRole("button", { name: "Xóa địa chỉ của Trần Thị Bình" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByRole("button", { name: "Hủy" })).toHaveFocus();

    await u.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === "DELETE")).toBe(false);

    await u.click(screen.getByRole("button", { name: "Xóa địa chỉ của Trần Thị Bình" }));
    await u.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Xóa địa chỉ" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByRole("status")).toHaveTextContent("Đã xóa địa chỉ.");
    expect(screen.queryByText("Trần Thị Bình")).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("xóa gặp 404 -> thông báo và tải lại danh sách", async () => {
    let list: Address[] = [A1, A2];
    stubFetch({
      "GET /me/addresses": () => jsonRes(200, { data: list }),
      "DELETE /me/addresses/a2": () => {
        list = [A1];
        return errRes(404, "NOT_FOUND", "Không tìm thấy");
      },
    });
    const u = userEvent.setup();
    render(<AddressBook />);
    await u.click(await screen.findByRole("button", { name: "Xóa địa chỉ của Trần Thị Bình" }));
    await u.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Xóa địa chỉ" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("không còn tồn tại");
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));
  });

  it("Đặt làm mặc định -> gọi POST rồi hiển thị thứ tự mới từ server", async () => {
    let list: Address[] = [A1, A2];
    const fetchMock = stubFetch({
      "GET /me/addresses": () => jsonRes(200, { data: list }),
      "POST /me/addresses/a2/default": () => {
        list = [
          { ...A2, isDefault: true },
          { ...A1, isDefault: false },
        ];
        return jsonRes(200, { data: list[0] });
      },
    });
    const u = userEvent.setup();
    render(<AddressBook />);
    await u.click(
      await screen.findByRole("button", { name: "Đặt địa chỉ của Trần Thị Bình làm mặc định" }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Đã đặt làm địa chỉ mặc định.");
    await waitFor(() => {
      const first = screen.getAllByRole("listitem")[0]!;
      expect(within(first).getByText("Trần Thị Bình")).toBeInTheDocument();
      expect(within(first).getByText("Mặc định")).toBeInTheDocument();
    });
    expect(fetchMock.mock.calls.filter((c) => c[1]?.method === "POST")).toHaveLength(1);
  });
});

const user = () => userEvent.setup();
type U = ReturnType<typeof user>;

const provinceBox = () => screen.getByRole("combobox", { name: "Tỉnh/thành" });
const wardBox = () => screen.getByRole("combobox", { name: "Phường/xã" });

/** Chọn một mục trong combobox bằng cách gõ lọc rồi bấm option. */
async function pick(u: U, box: () => HTMLElement, typed: string, optionName: string) {
  await waitFor(() => expect(box()).toBeEnabled());
  await u.click(box());
  await u.clear(box());
  await u.type(box(), typed);
  await u.click(screen.getByRole("option", { name: optionName }));
}

function patchBody(fetchMock: ReturnType<typeof stubFetch>) {
  const n = fetchMock.mock.calls.findIndex((c) => c[1]?.method === "PATCH");
  expect(n).toBeGreaterThanOrEqual(0);
  return bodyOf(fetchMock, n);
}

describe("AddressBook – form thêm/sửa", () => {
  const CREATE_ROUTE = "POST /me/addresses";
  const LIST_EMPTY = { "GET /me/addresses": () => jsonRes(200, { data: [] }) };

  async function openCreate(u: U) {
    render(<AddressBook />);
    await u.click(await screen.findByRole("button", { name: "Thêm địa chỉ" }));
  }

  async function fillCreate(u: U) {
    await u.type(screen.getByLabelText("Họ và tên người nhận"), "Lê Văn Cường");
    await u.type(screen.getByLabelText("Số điện thoại"), "+84 901-234-567");
    await u.type(screen.getByLabelText("Địa chỉ chi tiết (số nhà, đường)"), "5 Hẻm Nhỏ");
    await pick(u, provinceBox, "ho chi", "Thành phố Hồ Chí Minh");
    await pick(u, wardBox, "sai gon", "Phường Sài Gòn");
  }

  it("tải tỉnh: hiện trạng thái đang tải, combobox disabled, rồi dùng được", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    stubFetch({
      ...LIST_EMPTY,
      ...LOCATION_ROUTES,
      "GET /locations/provinces": async () => {
        await gate;
        return jsonRes(200, { data: PROVINCES });
      },
    });
    const u = user();
    await openCreate(u);
    expect(screen.getByText("Đang tải danh sách tỉnh/thành...")).toBeInTheDocument();
    expect(provinceBox()).toBeDisabled();
    expect(wardBox()).toBeDisabled();
    expect(wardBox()).toHaveAttribute("placeholder", "Chọn tỉnh/thành trước");
    release();
    await waitFor(() => expect(provinceBox()).toBeEnabled());
    expect(screen.queryByText("Đang tải danh sách tỉnh/thành...")).toBeNull();
    expect(wardBox()).toBeDisabled();
  });

  it("lỗi tải tỉnh -> thông báo + Thử lại thành công", async () => {
    let calls = 0;
    stubFetch({
      ...LIST_EMPTY,
      ...LOCATION_ROUTES,
      "GET /locations/provinces": () => {
        calls += 1;
        return calls === 1
          ? errRes(500, "INTERNAL_ERROR", "Lỗi hệ thống")
          : jsonRes(200, { data: PROVINCES });
      },
    });
    const u = user();
    await openCreate(u);
    expect(await screen.findByText("Không tải được danh sách tỉnh/thành.")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Thử lại" }));
    await waitFor(() => expect(provinceBox()).toBeEnabled());
    expect(screen.queryByText("Không tải được danh sách tỉnh/thành.")).toBeNull();
    expect(calls).toBe(2);
  });

  it("chọn tỉnh -> tải phường; đổi tỉnh -> phường bị xóa và tải lại", async () => {
    const fetchMock = stubFetch({ ...LIST_EMPTY, ...LOCATION_ROUTES });
    const u = user();
    await openCreate(u);
    await pick(u, provinceBox, "ha noi", "Thành phố Hà Nội");
    await waitFor(() => expect(wardBox()).toBeEnabled());
    expect(fetchMock.mock.calls.some((c) => c[0].endsWith("/locations/provinces/01/wards"))).toBe(
      true,
    );
    await pick(u, wardBox, "hoan kiem", "Phường Hoàn Kiếm");
    expect(wardBox()).toHaveValue("Phường Hoàn Kiếm");

    await pick(u, provinceBox, "ho chi", "Thành phố Hồ Chí Minh");
    await waitFor(() => expect(wardBox()).toHaveValue(""));
    await waitFor(() => expect(wardBox()).toBeEnabled());
    await u.click(wardBox());
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Phường Sài Gòn"]);
  });

  it("chưa chọn vị trí -> lỗi client, focus vào tỉnh/thành, không gọi POST", async () => {
    const fetchMock = stubFetch({ ...LIST_EMPTY, ...LOCATION_ROUTES });
    const u = user();
    await openCreate(u);
    expect(screen.getByLabelText("Họ và tên người nhận")).toHaveFocus();
    await u.type(screen.getByLabelText("Họ và tên người nhận"), "Lê Văn Cường");
    await u.type(screen.getByLabelText("Số điện thoại"), "0901234567");
    await u.type(screen.getByLabelText("Địa chỉ chi tiết (số nhà, đường)"), "5 Hẻm Nhỏ");
    await u.click(screen.getByRole("button", { name: "Thêm địa chỉ" }));
    expect(await screen.findByText("Vui lòng chọn tỉnh/thành")).toBeInTheDocument();
    expect(screen.getByText("Vui lòng chọn phường/xã")).toBeInTheDocument();
    expect(provinceBox()).toHaveAttribute("aria-invalid", "true");
    expect(provinceBox()).toHaveFocus();
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === "POST")).toBe(false);
  });

  it("tạo thành công: body chỉ có mã, không có tên", async () => {
    let list: Address[] = [];
    const fetchMock = stubFetch({
      "GET /me/addresses": () => jsonRes(200, { data: list }),
      ...LOCATION_ROUTES,
      [CREATE_ROUTE]: () => {
        list = [A1];
        return jsonRes(201, { data: A1 });
      },
    });
    const u = user();
    await openCreate(u);
    await fillCreate(u);
    await u.click(screen.getByRole("checkbox", { name: "Đặt làm địa chỉ mặc định" }));
    await u.click(screen.getByRole("button", { name: "Thêm địa chỉ" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Đã thêm địa chỉ.");
    const post = fetchMock.mock.calls.findIndex((c) => c[1]?.method === "POST");
    const body = bodyOf(fetchMock, post);
    expect(body).toEqual({
      fullName: "Lê Văn Cường",
      phone: "0901234567",
      provinceCode: "79",
      wardCode: "26740",
      line1: "5 Hẻm Nhỏ",
      isDefault: true,
    });
    expect(body).not.toHaveProperty("provinceName");
    expect(body).not.toHaveProperty("wardName");
    expect(screen.queryByLabelText("Họ và tên người nhận")).toBeNull();
    expect(await screen.findAllByRole("listitem")).toHaveLength(1);
  });

  it("409 ADDRESS_LIMIT_REACHED -> hiển thị thông báo giới hạn, giữ form", async () => {
    stubFetch({
      ...LIST_EMPTY,
      ...LOCATION_ROUTES,
      [CREATE_ROUTE]: () => errRes(409, "ADDRESS_LIMIT_REACHED", "Quá 10 địa chỉ"),
    });
    const u = user();
    await openCreate(u);
    await fillCreate(u);
    await u.click(screen.getByRole("button", { name: "Thêm địa chỉ" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("tối đa 10 địa chỉ");
    expect(screen.getByLabelText("Họ và tên người nhận")).toHaveValue("Lê Văn Cường");
  });

  it("lỗi VALIDATION_ERROR của server map vào field", async () => {
    stubFetch({
      ...LIST_EMPTY,
      ...LOCATION_ROUTES,
      [CREATE_ROUTE]: () =>
        errRes(400, "VALIDATION_ERROR", "Dữ liệu không hợp lệ", [
          { field: "line1", message: "Địa chỉ chi tiết không hợp lệ" },
        ]),
    });
    const u = user();
    await openCreate(u);
    await fillCreate(u);
    await u.click(screen.getByRole("button", { name: "Thêm địa chỉ" }));
    expect(await screen.findByText("Địa chỉ chi tiết không hợp lệ")).toBeInTheDocument();
    expect(screen.getByLabelText("Địa chỉ chi tiết (số nhà, đường)")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("400 details wardCode -> hiện dưới ô phường/xã và focus vào đó", async () => {
    stubFetch({
      ...LIST_EMPTY,
      ...LOCATION_ROUTES,
      [CREATE_ROUTE]: () =>
        errRes(400, "VALIDATION_ERROR", "Dữ liệu không hợp lệ", [
          { field: "wardCode", message: "Phường/xã không thuộc tỉnh/thành đã chọn" },
        ]),
    });
    const u = user();
    await openCreate(u);
    await fillCreate(u);
    await u.click(screen.getByRole("button", { name: "Thêm địa chỉ" }));
    const msg = await screen.findByText("Phường/xã không thuộc tỉnh/thành đã chọn");
    expect(msg).toHaveAttribute("id", "wardCode-error");
    expect(wardBox()).toHaveAttribute("aria-invalid", "true");
    expect(wardBox()).toHaveAttribute("aria-describedby", "wardCode-error");
    await waitFor(() => expect(wardBox()).toHaveFocus());
  });

  it("sửa chỉ đổi tên người nhận -> chỉ gửi fullName; nút lưu disable khi chưa đổi", async () => {
    const fetchMock = stubFetch({
      "GET /me/addresses": () => jsonRes(200, { data: [A1] }),
      ...LOCATION_ROUTES,
      "PATCH /me/addresses/a1": () => jsonRes(200, { data: A1 }),
    });
    const u = user();
    render(<AddressBook />);
    await openEditOf(u, "Nguyễn Văn An");
    expect(screen.getByRole("button", { name: "Lưu thay đổi" })).toBeDisabled();
    // Tải sẵn phường của tỉnh hiện tại và hiển thị tên đã lưu.
    await waitFor(() => expect(wardBox()).toBeEnabled());
    expect(provinceBox()).toHaveValue("Thành phố Hồ Chí Minh");
    expect(wardBox()).toHaveValue("Phường Sài Gòn");
    await u.type(screen.getByLabelText("Họ và tên người nhận"), " B");
    await u.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    await waitFor(() => expect(screen.queryByLabelText("Họ và tên người nhận")).toBeNull());
    expect(patchBody(fetchMock)).toEqual({ fullName: "Nguyễn Văn An B" });
  });

  it("sửa chỉ đổi phường -> body { wardCode }", async () => {
    const hn = makeAddress({
      provinceCode: "01",
      provinceName: "Thành phố Hà Nội",
      wardCode: "00004",
      wardName: "Phường Ba Đình",
    });
    const fetchMock = stubFetch({
      "GET /me/addresses": () => jsonRes(200, { data: [hn] }),
      ...LOCATION_ROUTES,
      "PATCH /me/addresses/a1": () => jsonRes(200, { data: hn }),
    });
    const u = user();
    render(<AddressBook />);
    await openEditOf(u, "Nguyễn Văn An");
    await pick(u, wardBox, "hoan kiem", "Phường Hoàn Kiếm");
    await u.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => c[1]?.method === "PATCH")).toBe(true),
    );
    expect(patchBody(fetchMock)).toEqual({ wardCode: "00070" });
  });

  it("sửa đổi tỉnh -> body { provinceCode, wardCode }, không có tên", async () => {
    const fetchMock = stubFetch({
      "GET /me/addresses": () => jsonRes(200, { data: [A1] }),
      ...LOCATION_ROUTES,
      "PATCH /me/addresses/a1": () => jsonRes(200, { data: A1 }),
    });
    const u = user();
    render(<AddressBook />);
    await openEditOf(u, "Nguyễn Văn An");
    await pick(u, provinceBox, "ha noi", "Thành phố Hà Nội");
    await pick(u, wardBox, "ba dinh", "Phường Ba Đình");
    await u.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => c[1]?.method === "PATCH")).toBe(true),
    );
    expect(patchBody(fetchMock)).toEqual({ provinceCode: "01", wardCode: "00004" });
  });

  it("mã đã lưu không còn trong danh mục -> báo chọn lại và không cho lưu", async () => {
    const old = makeAddress({ wardCode: "26734", wardName: "Phường Mẫu" });
    const fetchMock = stubFetch({
      "GET /me/addresses": () => jsonRes(200, { data: [old] }),
      ...LOCATION_ROUTES,
      "PATCH /me/addresses/a1": () => jsonRes(200, { data: old }),
    });
    const u = user();
    render(<AddressBook />);
    await openEditOf(u, "Nguyễn Văn An");
    expect(
      await screen.findByText(/đã lưu không còn trong danh mục, vui lòng chọn lại/),
    ).toBeInTheDocument();
    expect(wardBox()).toHaveValue("");
    await u.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    expect(await screen.findByText("Vui lòng chọn phường/xã")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === "PATCH")).toBe(false);
  });

  it("phường của tỉnh cũ về muộn bị bỏ qua", async () => {
    let releaseHn!: () => void;
    const gate = new Promise<void>((r) => (releaseHn = r));
    stubFetch({
      ...LIST_EMPTY,
      ...LOCATION_ROUTES,
      "GET /locations/provinces/01/wards": async () => {
        await gate;
        return jsonRes(200, { data: WARDS["01"] });
      },
    });
    const u = user();
    await openCreate(u);
    await pick(u, provinceBox, "ha noi", "Thành phố Hà Nội");
    await pick(u, provinceBox, "ho chi", "Thành phố Hồ Chí Minh");
    await waitFor(() => expect(wardBox()).toBeEnabled());
    releaseHn();
    await u.click(wardBox());
    await waitFor(() =>
      expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Phường Sài Gòn"]),
    );
  });

  it("sửa gặp 404 -> đóng form, báo địa chỉ không còn, tải lại danh sách", async () => {
    let list: Address[] = [A1, A2];
    stubFetch({
      "GET /me/addresses": () => jsonRes(200, { data: list }),
      ...LOCATION_ROUTES,
      "PATCH /me/addresses/a2": () => {
        list = [A1];
        return errRes(404, "NOT_FOUND", "Không tìm thấy");
      },
    });
    const u = user();
    render(<AddressBook />);
    await openEditOf(u, "Trần Thị Bình");
    await waitFor(() => expect(wardBox()).toBeEnabled());
    await u.type(screen.getByLabelText("Họ và tên người nhận"), "x");
    await u.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("không còn tồn tại");
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));
    expect(screen.queryByLabelText("Họ và tên người nhận")).toBeNull();
  });
});
