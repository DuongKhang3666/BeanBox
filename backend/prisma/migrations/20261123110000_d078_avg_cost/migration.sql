-- D-078: giá vốn bình quân gia quyền di động. Chỉ thêm cột nullable (không backfill, không đổi dữ liệu cũ).
ALTER TABLE "ProductVariant" ADD COLUMN "avgCost" INTEGER;
ALTER TABLE "InventoryMovement" ADD COLUMN "unitCost" INTEGER;
ALTER TABLE "OrderItem" ADD COLUMN "unitCost" INTEGER;
