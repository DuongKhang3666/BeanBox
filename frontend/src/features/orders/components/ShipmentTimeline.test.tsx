import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Shipment } from "@/types/order";
import { ShipmentTimeline } from "./ShipmentTimeline";

const shipment = (over: Partial<Shipment> = {}): Shipment => ({
  carrier: "BeanBox Logistics (giả lập)",
  trackingNumber: "BBL-20261122-K5AVT2",
  simulated: true,
  events: [],
  ...over,
});

afterEach(() => vi.restoreAllMocks());

describe("ShipmentTimeline", () => {
  it("ghi rõ là mô phỏng, hiện hãng và mã vận đơn", () => {
    render(<ShipmentTimeline shipment={shipment()} />);
    expect(screen.getByText(/Hành trình mô phỏng \(giả lập\)/)).toBeInTheDocument();
    expect(screen.getByText("BeanBox Logistics (giả lập)")).toBeInTheDocument();
    expect(screen.getByText("BBL-20261122-K5AVT2")).toBeInTheDocument();
  });

  it("chưa có mốc -> thông báo rỗng, không có danh sách", () => {
    render(<ShipmentTimeline shipment={shipment()} />);
    expect(screen.getByText("Chưa có cập nhật vận chuyển.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("nhiều mốc: <ol> có thứ tự, mới nhất ở trên, giờ Việt Nam", () => {
    render(
      <ShipmentTimeline
        shipment={shipment({
          events: [
            {
              code: "HANDOVER",
              label: "Đã bàn giao cho đơn vị vận chuyển",
              at: "2026-11-22T03:00:00.000Z",
            },
            { code: "PICKED_UP", label: "Đã lấy hàng", at: "2026-11-22T05:00:00.000Z" },
            { code: "IN_TRANSIT", label: "Đang trung chuyển", at: "2026-11-23T03:00:00.000Z" },
          ],
        })}
      />,
    );
    const list = screen.getByRole("list", { name: /Hành trình vận chuyển/ });
    expect(list.tagName).toBe("OL");
    const items = within(list).getAllByRole("listitem");
    expect(items.map((li) => li.querySelector("p")?.textContent)).toEqual([
      "Đang trung chuyển",
      "Đã lấy hàng",
      "Đã bàn giao cho đơn vị vận chuyển",
    ]);
    // 03:00Z = 10:00 giờ VN
    expect(items[2]).toHaveTextContent("22/11/2026 10:00");
    expect(
      within(items[2]!)
        .getByText(/22\/11\/2026/)
        .closest("time"),
    ).toHaveAttribute("datetime", "2026-11-22T03:00:00.000Z");
  });

  it("giao thành công là mốc cuối cùng (hiện đầu danh sách)", () => {
    render(
      <ShipmentTimeline
        shipment={shipment({
          events: [
            {
              code: "HANDOVER",
              label: "Đã bàn giao cho đơn vị vận chuyển",
              at: "2026-11-22T03:00:00.000Z",
            },
            { code: "DELIVERED", label: "Giao hàng thành công", at: "2026-11-22T09:00:00.000Z" },
          ],
        })}
      />,
    );
    const first = within(screen.getByRole("list")).getAllByRole("listitem")[0]!;
    expect(first).toHaveTextContent("Giao hàng thành công");
  });

  it("nút sao chép ghi mã vận đơn vào clipboard và báo kết quả", async () => {
    const u = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    render(<ShipmentTimeline shipment={shipment()} />);
    await u.click(screen.getByRole("button", { name: "Sao chép mã vận đơn" }));
    expect(writeText).toHaveBeenCalledWith("BBL-20261122-K5AVT2");
    expect(await screen.findByText("Đã sao chép")).toBeInTheDocument();
  });

  it("sao chép lỗi -> báo không sao chép được", async () => {
    const u = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    render(<ShipmentTimeline shipment={shipment()} />);
    await u.click(screen.getByRole("button", { name: "Sao chép mã vận đơn" }));
    expect(await screen.findByText("Không sao chép được")).toBeInTheDocument();
  });

  it("không có mã vận đơn -> không có nút sao chép", () => {
    render(<ShipmentTimeline shipment={shipment({ trackingNumber: null, carrier: null })} />);
    expect(screen.queryByRole("button", { name: "Sao chép mã vận đơn" })).not.toBeInTheDocument();
  });
});
