import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { orderErrorMessage, orderStatusLabel, paymentStatusLabel } from "./labels";

describe("nhãn trạng thái", () => {
  it("paymentStatus đủ 4 giá trị", () => {
    expect(paymentStatusLabel("UNPAID")).toBe("Chưa thanh toán");
    expect(paymentStatusLabel("PAID")).toBe("Đã thanh toán");
    expect(paymentStatusLabel("FAILED")).toBe("Thanh toán thất bại");
    expect(paymentStatusLabel("REFUNDED")).toBe("Đã hoàn tiền");
  });

  it("trạng thái PENDING_PAYMENT", () => {
    expect(orderStatusLabel("PENDING_PAYMENT")).toBe("Chờ thanh toán");
  });
});

describe("orderErrorMessage - thanh toán", () => {
  const notAllowed = (reason: string) =>
    orderErrorMessage(new ApiError(409, "PAYMENT_NOT_ALLOWED", "x", { reason }));

  it("PAYMENT_NOT_ALLOWED theo details.reason", () => {
    expect(notAllowed("EXPIRED")).toBe("Đơn hàng đã quá hạn thanh toán");
    expect(notAllowed("STATUS")).toMatch(/không còn ở trạng thái chờ thanh toán/);
    expect(notAllowed("METHOD_MISMATCH")).toMatch(/không khớp/);
    expect(notAllowed("UNAVAILABLE")).toMatch(/chưa khả dụng/);
    expect(notAllowed("???")).toMatch(/Không thể thanh toán/);
  });

  it("chữ ký sai, phương thức chưa bật, 503", () => {
    expect(orderErrorMessage(new ApiError(400, "PAYMENT_SIGNATURE_INVALID", "x"))).toBe(
      "Không xác minh được kết quả thanh toán.",
    );
    expect(orderErrorMessage(new ApiError(409, "PAYMENT_METHOD_UNAVAILABLE", "x"))).toMatch(
      /chưa khả dụng/,
    );
    expect(orderErrorMessage(new ApiError(503, "SERVICE_UNAVAILABLE", "x"))).toMatch(
      /Cổng thanh toán/,
    );
  });
});
