-- CHECK constraints và partial unique index mà Prisma schema không biểu diễn được.
-- Nguồn: docs/db-schema.md §4. Không xóa/sửa tay các đối tượng này ở migration sau trừ khi cập nhật docs.

ALTER TABLE "ProductVariant"
  ADD CONSTRAINT "ProductVariant_stock_nonneg"   CHECK ("stock" >= 0),
  ADD CONSTRAINT "ProductVariant_price_pos"      CHECK ("price" > 0),
  ADD CONSTRAINT "ProductVariant_sale_lt_price"  CHECK ("salePrice" IS NULL OR ("salePrice" > 0 AND "salePrice" < "price")),
  ADD CONSTRAINT "ProductVariant_sale_window"    CHECK ("saleStart" IS NULL OR "saleEnd" IS NULL OR "saleStart" < "saleEnd"),
  ADD CONSTRAINT "ProductVariant_weight_nonneg"  CHECK ("weightGram" >= 0);

ALTER TABLE "CartItem"
  ADD CONSTRAINT "CartItem_quantity_range" CHECK ("quantity" BETWEEN 1 AND 20);

ALTER TABLE "Cart"
  ADD CONSTRAINT "Cart_owner_present" CHECK ("userId" IS NOT NULL OR "tokenHash" IS NOT NULL);

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_amounts_nonneg" CHECK (
    "subtotal" >= 0 AND "discountTotal" >= 0 AND "shippingFee" >= 0
    AND "shippingDiscount" >= 0 AND "grandTotal" >= 0),
  ADD CONSTRAINT "Order_discount_le_subtotal"  CHECK ("discountTotal" <= "subtotal"),
  ADD CONSTRAINT "Order_shipdiscount_le_fee"   CHECK ("shippingDiscount" <= "shippingFee"),
  ADD CONSTRAINT "Order_grand_total_formula"   CHECK (
    "grandTotal" = "subtotal" - "discountTotal" + "shippingFee" - "shippingDiscount");

ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_qty_pos"        CHECK ("quantity" > 0),
  ADD CONSTRAINT "OrderItem_price_nonneg"   CHECK ("unitPrice" >= 0),
  ADD CONSTRAINT "OrderItem_line_formula"   CHECK ("lineTotal" = "unitPrice" * "quantity");

ALTER TABLE "Coupon"
  ADD CONSTRAINT "Coupon_value_valid" CHECK (
    ("type" = 'PERCENT'  AND "value" BETWEEN 1 AND 100) OR
    ("type" = 'FIXED'    AND "value" > 0) OR
    ("type" = 'FREESHIP' AND "value" = 0)),
  ADD CONSTRAINT "Coupon_minorder_nonneg" CHECK ("minOrder" >= 0),
  ADD CONSTRAINT "Coupon_used_nonneg"     CHECK ("usedCount" >= 0),
  ADD CONSTRAINT "Coupon_window"          CHECK ("startsAt" IS NULL OR "endsAt" IS NULL OR "startsAt" < "endsAt");

ALTER TABLE "Review"
  ADD CONSTRAINT "Review_rating_range" CHECK ("rating" BETWEEN 1 AND 5);

-- Partial unique index
CREATE UNIQUE INDEX "Address_one_default_per_user" ON "Address" ("userId") WHERE "isDefault";
CREATE UNIQUE INDEX "ProductImage_one_primary"     ON "ProductImage" ("productId") WHERE "isPrimary";
