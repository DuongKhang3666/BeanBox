import { ApiError } from "@/lib/api/errors";
import { adminErrorMessage } from "./errors";

describe("adminErrorMessage", () => {
  it("D-068: TRACKING_NUMBER_TAKEN có câu tiếng Việt riêng, không phải câu lỗi chung", () => {
    const msg = adminErrorMessage(new ApiError(409, "TRACKING_NUMBER_TAKEN", "x"));
    expect(msg).toContain("Mã vận đơn này đã được dùng");
    expect(msg).not.toBe(adminErrorMessage(new ApiError(500, "SOMETHING_ELSE", "x")));
  });

  it("D-070: ADMIN_TWO_FACTOR_REQUIRED có câu hướng dẫn bật 2FA", () => {
    expect(adminErrorMessage(new ApiError(403, "ADMIN_TWO_FACTOR_REQUIRED", "x"))).toContain(
      "xác thực 2 lớp",
    );
  });

  it("lỗi không phải ApiError -> câu lỗi chung", () => {
    expect(adminErrorMessage(new Error("boom"))).toBe("Đã có lỗi xảy ra. Vui lòng thử lại.");
  });
});
