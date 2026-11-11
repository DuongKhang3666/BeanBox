import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errRes, jsonRes, makeUser } from "@/features/account/testing";
import { tokenStore } from "@/lib/api/client";
import type { AdminImage } from "@/types/admin";
import { jsonBody, stubProductApi, writes } from "../productTesting";
import { makeAdminProduct } from "../testing";
import { AdminProductEditor } from "./AdminProductEditor";

vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({ status: "authenticated", user: makeUser({ role: "ADMIN" }) }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const img = (n: number, over: Partial<AdminImage> = {}): AdminImage => ({
  id: `i${n}`,
  url: `https://cdn.example.com/${n}.jpg`,
  alt: `Ảnh số ${n}`,
  sortOrder: n - 1,
  isPrimary: n === 1,
  ...over,
});
const THREE = [img(1), img(2), img(3)];

beforeEach(() => tokenStore.clear());
afterEach(() => vi.unstubAllGlobals());

function setup(images: AdminImage[], onWrite: (m: string, p: string, i: RequestInit) => Response) {
  const mock = stubProductApi({ product: makeAdminProduct({ images }), onWrite });
  render(<AdminProductEditor id="p1" />);
  return mock;
}

describe("Ảnh sản phẩm", () => {
  it("hiển thị ảnh chính có badge và nút Lên/Xuống có aria-label; biên bị vô hiệu", async () => {
    setup(THREE, () => jsonRes(200, { data: THREE }));
    expect(await screen.findByText("Ảnh chính")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Chuyển ảnh 1 lên" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Chuyển ảnh 3 xuống" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Đặt ảnh 1 làm ảnh chính" }),
    ).not.toBeInTheDocument();
  });

  it("upload gửi file thô đúng Content-Type rồi POST images với url trả về", async () => {
    const uploaded = [...THREE, img(4, { url: "/uploads/products/2026/11/abc.png" })];
    const mock = setup(THREE, (_m, path) =>
      path === "/admin/uploads"
        ? jsonRes(201, {
            data: { url: "/uploads/products/2026/11/abc.png", contentType: "image/png", size: 3 },
          })
        : jsonRes(201, { data: uploaded }),
    );
    const input = await screen.findByLabelText("Tải ảnh lên");
    const file = new File(["abc"], "Hinh Dep.png", { type: "image/png" });
    await userEvent.upload(input, file);
    expect(await screen.findByText("Đã tải ảnh lên.")).toBeInTheDocument();

    const [up, add] = writes(mock);
    expect(up).toMatchObject({ method: "POST", path: "/admin/uploads" });
    expect(up!.init.body).toBe(file);
    expect((up!.init.headers as Record<string, string>)["Content-Type"]).toBe("image/png");
    expect(add).toMatchObject({ method: "POST", path: "/admin/products/p1/images" });
    expect(jsonBody(add!.init)).toEqual({ url: "/uploads/products/2026/11/abc.png" });
    expect(screen.getByLabelText("Mô tả ảnh 4 (alt)")).toBeInTheDocument();
  });

  it("chặn file sai loại và file > 5 MB phía client, không gọi API", async () => {
    const mock = setup(THREE, () => jsonRes(200, { data: THREE }));
    const user = userEvent.setup({ applyAccept: false });
    const input = await screen.findByLabelText("Tải ảnh lên");

    await user.upload(input, new File(["gif"], "a.gif", { type: "image/gif" }));
    expect(await screen.findByText("Chỉ chấp nhận ảnh JPG, PNG hoặc WebP.")).toBeInTheDocument();

    const big = new File(["x"], "big.jpg", { type: "image/jpeg" });
    Object.defineProperty(big, "size", { value: 5 * 1024 * 1024 + 1 });
    await user.upload(input, big);
    expect(await screen.findByText(/Ảnh vượt quá 5 MB/)).toBeInTheDocument();
    expect(writes(mock)).toHaveLength(0);
  });

  it("413 từ server hiển thị rõ", async () => {
    setup(THREE, () => errRes(413, "PAYLOAD_TOO_LARGE", "Quá lớn"));
    const input = await screen.findByLabelText("Tải ảnh lên");
    await userEvent.upload(input, new File(["abc"], "a.png", { type: "image/png" }));
    expect(await screen.findByText(/Ảnh vượt quá 5 MB/)).toBeInTheDocument();
  });

  it("409 vượt giới hạn ảnh hiện message server", async () => {
    const msg = "Mỗi sản phẩm tối đa 10 ảnh";
    setup(THREE, (_m, path) =>
      path === "/admin/uploads"
        ? jsonRes(201, { data: { url: "/uploads/a.png", contentType: "image/png", size: 3 } })
        : errRes(409, "CONFLICT", msg),
    );
    const input = await screen.findByLabelText("Tải ảnh lên");
    await userEvent.upload(input, new File(["abc"], "a.png", { type: "image/png" }));
    expect(await screen.findByText(msg)).toBeInTheDocument();
  });

  it("đủ 10 ảnh thì ẩn ô tải lên", async () => {
    const ten = Array.from({ length: 10 }, (_, i) => img(i + 1));
    setup(ten, () => jsonRes(200, { data: ten }));
    expect(await screen.findByText(/Đã đủ 10 ảnh/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Tải ảnh lên")).not.toBeInTheDocument();
  });

  it("đặt ảnh chính gửi PATCH isPrimary và cập nhật badge", async () => {
    const after = [img(1, { isPrimary: false }), img(2, { isPrimary: true }), img(3)];
    const mock = setup(THREE, () => jsonRes(200, { data: after }));
    await userEvent.click(await screen.findByRole("button", { name: "Đặt ảnh 2 làm ảnh chính" }));
    expect(await screen.findByText("Đã đặt ảnh 2 làm ảnh chính.")).toBeInTheDocument();
    expect(writes(mock)[0]).toMatchObject({
      method: "PATCH",
      path: "/admin/products/p1/images/i2",
    });
    expect(jsonBody(writes(mock)[0]!.init)).toEqual({ isPrimary: true });
    expect(
      screen.queryByRole("button", { name: "Đặt ảnh 2 làm ảnh chính" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đặt ảnh 1 làm ảnh chính" })).toBeInTheDocument();
  });

  it("Lên/Xuống gửi PUT order đúng thứ tự", async () => {
    const mock = setup(THREE, () => jsonRes(200, { data: [THREE[1]!, THREE[0]!, THREE[2]!] }));
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Chuyển ảnh 2 lên" }));
    await screen.findByText("Đã cập nhật thứ tự ảnh.");
    expect(writes(mock)[0]).toMatchObject({
      method: "PUT",
      path: "/admin/products/p1/images/order",
    });
    expect(jsonBody(writes(mock)[0]!.init)).toEqual({ imageIds: ["i2", "i1", "i3"] });

    await user.click(screen.getByRole("button", { name: "Chuyển ảnh 1 xuống" }));
    await screen.findAllByText("Đã cập nhật thứ tự ảnh.");
    expect(jsonBody(writes(mock)[1]!.init)).toEqual({ imageIds: ["i1", "i2", "i3"] });
  });

  it("sửa alt gửi PATCH alt; xóa ảnh cần xác nhận", async () => {
    const mock = setup(THREE, (method) =>
      jsonRes(200, { data: method === "DELETE" ? [THREE[0]!, THREE[2]!] : THREE }),
    );
    const user = userEvent.setup();
    const alt = await screen.findByLabelText("Mô tả ảnh 3 (alt)");
    expect(screen.getByRole("button", { name: "Lưu mô tả ảnh 3" })).toBeDisabled();
    await user.clear(alt);
    await user.type(alt, "Mô tả mới");
    await user.click(screen.getByRole("button", { name: "Lưu mô tả ảnh 3" }));
    await screen.findByText("Đã lưu mô tả ảnh 3.");
    expect(jsonBody(writes(mock)[0]!.init)).toEqual({ alt: "Mô tả mới" });

    await user.click(screen.getByRole("button", { name: "Xóa ảnh 2" }));
    await user.click(
      within(screen.getByRole("dialog", { name: "Xóa ảnh" })).getByRole("button", {
        name: "Xóa ảnh",
      }),
    );
    expect(await screen.findByText("Đã xóa ảnh.")).toBeInTheDocument();
    expect(writes(mock)[1]).toMatchObject({
      method: "DELETE",
      path: "/admin/products/p1/images/i2",
    });
    expect(screen.queryByLabelText("Mô tả ảnh 3 (alt)")).not.toBeInTheDocument();
  });
});
