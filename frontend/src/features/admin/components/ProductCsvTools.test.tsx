import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errRes, jsonRes, makeUser } from "@/features/account/testing";
import { tokenStore } from "@/lib/api/client";
import type { ImportEntry, ImportPreview, ImportResult, ImportSummary } from "@/types/admin";
import { saveBlob } from "../download";
import { ProductCsvTools } from "./ProductCsvTools";

let role: "STAFF" | "ADMIN" = "ADMIN";
vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({ status: "authenticated", user: makeUser({ role }) }),
}));
vi.mock("../download", () => ({ saveBlob: vi.fn() }));

const FP = "a".repeat(64);

function summaryOf(entries: ImportEntry[]): ImportSummary {
  const s: ImportSummary = {
    rows: entries.length,
    create_product: 0,
    create_variant: 0,
    update_variant: 0,
    update_product: 0,
    unchanged: 0,
    error: 0,
  };
  for (const e of entries) s[e.action]++;
  return s;
}

function previewOf(entries: ImportEntry[]): ImportPreview {
  const summary = summaryOf(entries);
  return { fingerprint: FP, fileName: "sp.csv", canApply: summary.error === 0, summary, entries };
}

const OK_ENTRIES: ImportEntry[] = [
  { line: 2, action: "create_product", productSlug: "ca-phe-moi", sku: "CPM-1" },
  {
    line: 3,
    action: "update_variant",
    productSlug: "ca-phe-a",
    sku: "CPA-1",
    changes: ["price", "stock"],
  },
  { line: 4, action: "unchanged", productSlug: "ca-phe-b", sku: "CPB-1" },
];

const ERR_ENTRIES: ImportEntry[] = [
  {
    line: 2,
    action: "error",
    productSlug: "<img src=x onerror=alert(1)>",
    sku: "CPM-1",
    errors: [{ field: "price", message: "Giá phải là số nguyên không âm" }],
  },
  { line: 3, action: "unchanged", productSlug: "ca-phe-b", sku: "CPB-1" },
];

const RESULT: ImportResult = {
  fingerprint: FP,
  fileName: "sp.csv",
  summary: summaryOf(OK_ENTRIES),
  applied: {
    productsCreated: 1,
    productsUpdated: 0,
    variantsCreated: 0,
    variantsUpdated: 1,
    stockMovements: 1,
    unchanged: 1,
  },
};

type Handler = (path: string, init: RequestInit) => Response;
function stubFetch(handler: Handler) {
  const mock = vi.fn(async (input: string, init: RequestInit = {}) =>
    handler(input.replace("/api/v1", ""), init),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

const csvFile = (name = "sp.csv", body = "product_slug\r\nx") =>
  new File([body], name, { type: "text/csv" });

async function openImport() {
  await userEvent.click(screen.getByRole("button", { name: "Nhập CSV" }));
  return screen.getByRole("dialog", { name: "Nhập sản phẩm từ CSV" });
}

beforeEach(() => {
  role = "ADMIN";
  tokenStore.clear();
  vi.mocked(saveBlob).mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("ProductCsvTools", () => {
  it("chỉ Admin thấy nút; Staff không thấy gì", () => {
    role = "STAFF";
    const { container } = render(<ProductCsvTools onImported={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("Xuất CSV: tải file qua API và lưu bằng tên server; lỗi hiển thị thông báo", async () => {
    const mock = stubFetch(
      () =>
        new Response("a,b\r\n", {
          status: 200,
          headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": 'attachment; filename="beanbox-products-2026-11-22.csv"',
          },
        }),
    );
    render(<ProductCsvTools onImported={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Xuất CSV" }));
    await waitFor(() => expect(saveBlob).toHaveBeenCalledTimes(1));
    expect(vi.mocked(saveBlob).mock.calls[0]![1]).toBe("beanbox-products-2026-11-22.csv");
    expect(mock.mock.calls[0]![0]).toBe("/api/v1/admin/products/export");

    mock.mockImplementation(async () => errRes(429, "RATE_LIMITED"));
    await userEvent.click(screen.getByRole("button", { name: "Xuất CSV" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("quá nhanh");
  });

  it("chọn file sai đuôi hoặc quá 1 MB: báo lỗi và không cho xem trước", async () => {
    render(<ProductCsvTools onImported={vi.fn()} />);
    const dlg = await openImport();
    const input = within(dlg).getByLabelText(/File CSV/);
    const submit = within(dlg).getByRole("button", { name: "Xem trước" });
    expect(submit).toBeDisabled();

    await userEvent.upload(input, new File(["x"], "sp.txt", { type: "text/plain" }), {
      applyAccept: false,
    });
    expect(within(dlg).getByText("Vui lòng chọn file có đuôi .csv.")).toBeInTheDocument();
    expect(submit).toBeDisabled();

    await userEvent.upload(input, csvFile("sp.csv", "x".repeat(1024 * 1024 + 1)));
    expect(within(dlg).getByText("File vượt quá 1 MB.")).toBeInTheDocument();
    expect(submit).toBeDisabled();
  });

  it("xem trước: gửi file nguyên văn dạng text/csv, hiện tóm tắt, lọc theo loại; Áp dụng gửi kèm fingerprint rồi báo kết quả", async () => {
    const onImported = vi.fn();
    const mock = stubFetch((path) =>
      path.startsWith("/admin/products/import/preview")
        ? jsonRes(200, { data: previewOf(OK_ENTRIES) })
        : jsonRes(200, { data: RESULT }),
    );
    render(<ProductCsvTools onImported={onImported} />);
    const dlg = await openImport();
    await userEvent.upload(within(dlg).getByLabelText(/File CSV/), csvFile());
    await userEvent.click(within(dlg).getByRole("button", { name: "Xem trước" }));

    expect(await within(dlg).findByText("Tạo sản phẩm")).toBeInTheDocument();
    const [url, init] = mock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("/api/v1/admin/products/import/preview?filename=sp.csv");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("text/csv");
    expect((init.body as File).name).toBe("sp.csv");
    expect(within(dlg).getByText(/3 dòng dữ liệu/)).toBeInTheDocument();
    expect(within(dlg).getByText("price, stock")).toBeInTheDocument();

    // Lọc theo loại hành động.
    await userEvent.click(within(dlg).getByRole("button", { name: "Không thay đổi (1)" }));
    const rows = within(dlg).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("ca-phe-b");
    await userEvent.click(within(dlg).getByRole("button", { name: /^Tất cả/ }));
    expect(within(dlg).getAllByRole("row")).toHaveLength(4);

    const apply = within(dlg).getByRole("button", { name: "Áp dụng" });
    expect(apply).toBeEnabled();
    await userEvent.click(apply);
    expect(await within(dlg).findByRole("status")).toHaveTextContent("Đã áp dụng file sp.csv");
    expect(within(dlg).getByText("Sản phẩm mới: 1")).toBeInTheDocument();
    expect(within(dlg).getByText("Điều chỉnh tồn kho: 1")).toBeInTheDocument();
    const commit = mock.mock.calls[1]! as [string, RequestInit];
    expect(commit[0]).toBe(
      `/api/v1/admin/products/import/commit?filename=sp.csv&fingerprint=${FP}`,
    );
    expect(onImported).toHaveBeenCalledTimes(1);
    await userEvent.click(within(dlg).getByRole("button", { name: "Đóng" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("có lỗi: hiện lỗi theo dòng/cột, mặc định lọc lỗi, nút Áp dụng bị khóa, nội dung không bị render thành HTML", async () => {
    const mock = stubFetch(() => jsonRes(200, { data: previewOf(ERR_ENTRIES) }));
    render(<ProductCsvTools onImported={vi.fn()} />);
    const dlg = await openImport();
    await userEvent.upload(within(dlg).getByLabelText(/File CSV/), csvFile());
    await userEvent.click(within(dlg).getByRole("button", { name: "Xem trước" }));

    expect(await within(dlg).findByRole("alert")).toHaveTextContent("File còn 1 dòng lỗi");
    expect(within(dlg).getByText(/Giá phải là số nguyên không âm/)).toBeInTheDocument();
    expect(within(dlg).getByText("price")).toBeInTheDocument();
    // Mặc định chỉ hiện dòng lỗi.
    expect(within(dlg).getAllByRole("row")).toHaveLength(2);
    expect(within(dlg).getByRole("button", { name: "Lỗi (1)" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(dlg).getByRole("button", { name: "Áp dụng" })).toBeDisabled();
    // Slug độc hại hiện như văn bản, không tạo phần tử.
    expect(within(dlg).getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(dlg.querySelector("img")).toBeNull();
    expect(mock).toHaveBeenCalledTimes(1);

    await userEvent.click(within(dlg).getByRole("button", { name: "Chọn file khác" }));
    expect(within(dlg).getByLabelText(/File CSV/)).toBeInTheDocument();
  });

  it("lỗi từ server: INVALID_CSV hiện message của server; commit 409 hiện message và giữ hộp thoại", async () => {
    const mock = stubFetch(() =>
      errRes(400, "INVALID_CSV", "Dòng tiêu đề không đúng (thiếu cột: stock)"),
    );
    render(<ProductCsvTools onImported={vi.fn()} />);
    const dlg = await openImport();
    await userEvent.upload(within(dlg).getByLabelText(/File CSV/), csvFile());
    await userEvent.click(within(dlg).getByRole("button", { name: "Xem trước" }));
    expect(await within(dlg).findByText(/thiếu cột: stock/)).toBeInTheDocument();

    mock.mockImplementation(async (input: string) =>
      input.includes("/preview")
        ? jsonRes(200, { data: previewOf(OK_ENTRIES) })
        : errRes(409, "FINGERPRINT_MISMATCH", "Nội dung file khác với bản đã xem trước"),
    );
    await userEvent.click(within(dlg).getByRole("button", { name: "Xem trước" }));
    await userEvent.click(await within(dlg).findByRole("button", { name: "Áp dụng" }));
    expect(await within(dlg).findByText(/khác với bản đã xem trước/)).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("Escape đóng hộp thoại khi không bận", async () => {
    render(<ProductCsvTools onImported={vi.fn()} />);
    await openImport();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
