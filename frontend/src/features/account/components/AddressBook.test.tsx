import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Address } from "@/types/account";
import { tokenStore } from "@/lib/api/client";
import { bodyOf, errRes, jsonRes, makeAddress } from "../testing";
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

const A1 = makeAddress({ id: "a1", fullName: "Nguyễn Văn An", isDefault: true });
const A2 = makeAddress({
  id: "a2",
  fullName: "Trần Thị Bình",
  phone: "0912345678",
  line1: "99 Đường Số 2",
  wardCode: "11111",
  wardName: "Phường Hai",
  isDefault: false,
});

beforeEach(() => tokenStore.clear());
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

describe("AddressBook – form thêm/sửa", () => {
  const CREATE_ROUTE = "POST /me/addresses";

  async function fillCreate(
    u: ReturnType<typeof userEvent.setup>,
    over: Record<string, string> = {},
  ) {
    const v = {
      "Họ và tên người nhận": "Lê Văn Cường",
      "Số điện thoại": "+84 901-234-567",
      "Địa chỉ chi tiết (số nhà, đường)": "5 Hẻm Nhỏ",
      "Mã tỉnh/thành (2 chữ số)": "79",
      "Tên tỉnh/thành": "Tỉnh Mẫu",
      "Mã phường/xã (5 chữ số)": "26734",
      "Tên phường/xã": "Phường Mẫu",
      ...over,
    };
    for (const [label, value] of Object.entries(v)) {
      await u.type(screen.getByLabelText(label), value);
    }
  }

  it("có ghi chú danh mục đang cập nhật; mã sai định dạng bị chặn ở client", async () => {
    const fetchMock = stubFetch({ "GET /me/addresses": () => jsonRes(200, { data: [] }) });
    const u = userEvent.setup();
    render(<AddressBook />);
    await u.click(await screen.findByRole("button", { name: "Thêm địa chỉ" }));
    expect(
      screen.getByText("Danh mục tỉnh/phường đang được cập nhật, vui lòng nhập tạm."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Họ và tên người nhận")).toHaveFocus();

    await fillCreate(u, {
      "Mã tỉnh/thành (2 chữ số)": "7",
      "Mã phường/xã (5 chữ số)": "123",
    });
    await u.click(screen.getByRole("button", { name: "Thêm địa chỉ" }));

    expect(await screen.findByText("Mã tỉnh/thành gồm đúng 2 chữ số")).toBeInTheDocument();
    expect(screen.getByText("Mã phường/xã gồm đúng 5 chữ số")).toBeInTheDocument();
    expect(screen.getByLabelText("Mã tỉnh/thành (2 chữ số)")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText("Mã tỉnh/thành (2 chữ số)")).toHaveFocus();
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === "POST")).toBe(false);
  });

  it("tạo thành công: gửi SĐT chuẩn hóa + đủ vị trí, đóng form và tải lại danh sách", async () => {
    let list: Address[] = [];
    const fetchMock = stubFetch({
      "GET /me/addresses": () => jsonRes(200, { data: list }),
      [CREATE_ROUTE]: () => {
        list = [A1];
        return jsonRes(201, { data: A1 });
      },
    });
    const u = userEvent.setup();
    render(<AddressBook />);
    await u.click(await screen.findByRole("button", { name: "Thêm địa chỉ" }));
    await fillCreate(u);
    await u.click(screen.getByRole("checkbox", { name: "Đặt làm địa chỉ mặc định" }));
    await u.click(screen.getByRole("button", { name: "Thêm địa chỉ" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Đã thêm địa chỉ.");
    const post = fetchMock.mock.calls.findIndex((c) => c[1]?.method === "POST");
    expect(bodyOf(fetchMock, post)).toEqual({
      fullName: "Lê Văn Cường",
      phone: "0901234567",
      provinceCode: "79",
      provinceName: "Tỉnh Mẫu",
      wardCode: "26734",
      wardName: "Phường Mẫu",
      line1: "5 Hẻm Nhỏ",
      isDefault: true,
    });
    expect(screen.queryByLabelText("Họ và tên người nhận")).toBeNull();
    expect(await screen.findAllByRole("listitem")).toHaveLength(1);
  });

  it("409 ADDRESS_LIMIT_REACHED -> hiển thị thông báo giới hạn, giữ form", async () => {
    stubFetch({
      "GET /me/addresses": () => jsonRes(200, { data: [] }),
      [CREATE_ROUTE]: () => errRes(409, "ADDRESS_LIMIT_REACHED", "Quá 10 địa chỉ"),
    });
    const u = userEvent.setup();
    render(<AddressBook />);
    await u.click(await screen.findByRole("button", { name: "Thêm địa chỉ" }));
    await fillCreate(u);
    await u.click(screen.getByRole("button", { name: "Thêm địa chỉ" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("tối đa 10 địa chỉ");
    expect(screen.getByLabelText("Họ và tên người nhận")).toHaveValue("Lê Văn Cường");
  });

  it("lỗi VALIDATION_ERROR của server map vào field", async () => {
    stubFetch({
      "GET /me/addresses": () => jsonRes(200, { data: [] }),
      [CREATE_ROUTE]: () =>
        errRes(400, "VALIDATION_ERROR", "Dữ liệu không hợp lệ", [
          { field: "line1", message: "Địa chỉ chi tiết không hợp lệ" },
        ]),
    });
    const u = userEvent.setup();
    render(<AddressBook />);
    await u.click(await screen.findByRole("button", { name: "Thêm địa chỉ" }));
    await fillCreate(u);
    await u.click(screen.getByRole("button", { name: "Thêm địa chỉ" }));
    expect(await screen.findByText("Địa chỉ chi tiết không hợp lệ")).toBeInTheDocument();
    expect(screen.getByLabelText("Địa chỉ chi tiết (số nhà, đường)")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("sửa chỉ đổi tên người nhận -> chỉ gửi fullName; nút lưu disable khi chưa đổi", async () => {
    const fetchMock = stubFetch({
      "GET /me/addresses": () => jsonRes(200, { data: [A1] }),
      "PATCH /me/addresses/a1": () => jsonRes(200, { data: A1 }),
    });
    const u = userEvent.setup();
    render(<AddressBook />);
    await openEditOf(u, "Nguyễn Văn An");
    expect(screen.getByRole("button", { name: "Lưu thay đổi" })).toBeDisabled();
    await u.type(screen.getByLabelText("Họ và tên người nhận"), " B");
    await u.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    await waitFor(() => expect(screen.queryByLabelText("Họ và tên người nhận")).toBeNull());
    const patch = fetchMock.mock.calls.findIndex((c) => c[1]?.method === "PATCH");
    expect(bodyOf(fetchMock, patch)).toEqual({ fullName: "Nguyễn Văn An B" });
  });

  it("sửa chỉ đổi phường -> gửi wardCode + wardName", async () => {
    const fetchMock = stubFetch({
      "GET /me/addresses": () => jsonRes(200, { data: [A1] }),
      "PATCH /me/addresses/a1": () => jsonRes(200, { data: A1 }),
    });
    const u = userEvent.setup();
    render(<AddressBook />);
    await openEditOf(u, "Nguyễn Văn An");
    await u.clear(screen.getByLabelText("Mã phường/xã (5 chữ số)"));
    await u.type(screen.getByLabelText("Mã phường/xã (5 chữ số)"), "99999");
    await u.clear(screen.getByLabelText("Tên phường/xã"));
    await u.type(screen.getByLabelText("Tên phường/xã"), "Phường Mới");
    await u.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => c[1]?.method === "PATCH")).toBe(true),
    );
    const patch = fetchMock.mock.calls.findIndex((c) => c[1]?.method === "PATCH");
    expect(bodyOf(fetchMock, patch)).toEqual({ wardCode: "99999", wardName: "Phường Mới" });
  });

  it("sửa chỉ đổi mã tỉnh -> gửi đủ 4 trường vị trí", async () => {
    const fetchMock = stubFetch({
      "GET /me/addresses": () => jsonRes(200, { data: [A1] }),
      "PATCH /me/addresses/a1": () => jsonRes(200, { data: A1 }),
    });
    const u = userEvent.setup();
    render(<AddressBook />);
    await openEditOf(u, "Nguyễn Văn An");
    await u.clear(screen.getByLabelText("Mã tỉnh/thành (2 chữ số)"));
    await u.type(screen.getByLabelText("Mã tỉnh/thành (2 chữ số)"), "01");
    await u.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => c[1]?.method === "PATCH")).toBe(true),
    );
    const patch = fetchMock.mock.calls.findIndex((c) => c[1]?.method === "PATCH");
    expect(bodyOf(fetchMock, patch)).toEqual({
      provinceCode: "01",
      provinceName: "Tỉnh Mẫu",
      wardCode: "26734",
      wardName: "Phường Mẫu",
    });
  });

  it("sửa gặp 404 -> đóng form, báo địa chỉ không còn, tải lại danh sách", async () => {
    let list: Address[] = [A1, A2];
    stubFetch({
      "GET /me/addresses": () => jsonRes(200, { data: list }),
      "PATCH /me/addresses/a2": () => {
        list = [A1];
        return errRes(404, "NOT_FOUND", "Không tìm thấy");
      },
    });
    const u = userEvent.setup();
    render(<AddressBook />);
    await openEditOf(u, "Trần Thị Bình");
    await u.type(screen.getByLabelText("Họ và tên người nhận"), "x");
    await u.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("không còn tồn tại");
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));
    expect(screen.queryByLabelText("Họ và tên người nhận")).toBeNull();
  });
});
