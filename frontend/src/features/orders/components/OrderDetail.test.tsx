import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeOrder } from "../testing";
import { OrderDetail } from "./OrderDetail";

describe("OrderDetail – vận chuyển giả lập (D-062)", () => {
  it("đơn mới đặt: hiện dự kiến giao, chưa có khối hành trình", () => {
    render(<OrderDetail order={makeOrder({ etaFrom: "2026-11-23", etaTo: "2026-11-25" })} />);
    expect(screen.getByText("Dự kiến giao")).toBeInTheDocument();
    expect(screen.getByText("23/11 – 25/11")).toBeInTheDocument();
    expect(screen.queryByText("Hành trình vận chuyển")).not.toBeInTheDocument();
  });

  it("đơn cũ không có eta -> không hiện dòng dự kiến giao", () => {
    render(<OrderDetail order={makeOrder()} />);
    expect(screen.queryByText("Dự kiến giao")).not.toBeInTheDocument();
  });

  it("đang giao: có timeline, mã vận đơn chỉ hiện một lần", () => {
    render(
      <OrderDetail
        order={makeOrder({
          status: "SHIPPING",
          trackingNumber: "BBE-20261122-AB23CD",
          carrier: "BeanBox Express (giả lập)",
          etaFrom: "2026-11-22",
          etaTo: "2026-11-23",
          shipment: {
            carrier: "BeanBox Express (giả lập)",
            trackingNumber: "BBE-20261122-AB23CD",
            simulated: true,
            events: [
              {
                code: "HANDOVER",
                label: "Đã bàn giao cho đơn vị vận chuyển",
                at: "2026-11-22T03:00:00.000Z",
              },
              { code: "PICKED_UP", label: "Đã lấy hàng", at: "2026-11-22T05:00:00.000Z" },
            ],
          },
        })}
      />,
    );
    expect(screen.getByText("Hành trình vận chuyển")).toBeInTheDocument();
    expect(screen.getByText("Đã lấy hàng")).toBeInTheDocument();
    expect(screen.getAllByText("BBE-20261122-AB23CD")).toHaveLength(1);
  });

  it("đã giao: không còn dòng dự kiến giao", () => {
    render(
      <OrderDetail
        order={makeOrder({ status: "DELIVERED", etaFrom: "2026-11-22", etaTo: "2026-11-23" })}
      />,
    );
    expect(screen.queryByText("Dự kiến giao")).not.toBeInTheDocument();
  });
});
