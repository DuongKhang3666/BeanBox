-- D-068: mã vận đơn là duy nhất (NULL được phép nhiều).
-- 1) Chuẩn hóa chuỗi rỗng/chỉ khoảng trắng thành NULL (không xóa dữ liệu nào khác).
UPDATE "Order" SET "trackingNumber" = NULL WHERE btrim("trackingNumber") = '';

-- 2) Dừng với hướng dẫn rõ nếu dữ liệu cũ đã có mã trùng, thay vì tự xóa/sửa.
DO $$
DECLARE
  dup_count integer;
  dup_sample text;
BEGIN
  SELECT count(*), string_agg(t, ', ')
    INTO dup_count, dup_sample
    FROM (
      SELECT "trackingNumber" AS t
        FROM "Order"
       WHERE "trackingNumber" IS NOT NULL
       GROUP BY "trackingNumber"
      HAVING count(*) > 1
       ORDER BY "trackingNumber"
       LIMIT 10
    ) d;
  IF dup_count > 0 THEN
    RAISE EXCEPTION
      'D-068: Order.trackingNumber có mã trùng (ví dụ: %). Tìm toàn bộ bản trùng bằng: SELECT "trackingNumber", array_agg("code") FROM "Order" WHERE "trackingNumber" IS NOT NULL GROUP BY 1 HAVING count(*) > 1; Sửa tay (đổi mã hoặc đặt NULL cho bản sai), rồi chạy: npx prisma migrate resolve --rolled-back 20261123090000_d068_tracking_number_unique và sau đó prisma migrate deploy.', dup_sample;
  END IF;
END
$$;

-- 3) Ràng buộc duy nhất (tên khớp quy ước Prisma cho @unique để kiểm drift không báo khác biệt).
CREATE UNIQUE INDEX "Order_trackingNumber_key" ON "Order"("trackingNumber");
