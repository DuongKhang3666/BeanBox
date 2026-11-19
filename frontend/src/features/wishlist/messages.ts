import { ApiError } from "@/lib/api/errors";

export function wishlistErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "WISHLIST_LIMIT") {
      return "Danh sách yêu thích đã đầy (tối đa 100 sản phẩm). Hãy bỏ bớt một sản phẩm rồi thử lại.";
    }
    if (err.code === "RATE_LIMITED") {
      return "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít giây.";
    }
    if (err.code === "NOT_FOUND") return "Sản phẩm này hiện không còn để thêm vào yêu thích.";
    if (err.code === "NETWORK_ERROR") return "Không thể kết nối tới máy chủ. Vui lòng thử lại.";
  }
  return "Chưa cập nhật được danh sách yêu thích. Vui lòng thử lại.";
}
