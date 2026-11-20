-- CreateIndex
CREATE INDEX "Order_paidAt_idx" ON "Order"("paidAt");

-- CreateIndex
CREATE INDEX "Payment_refundedAt_idx" ON "Payment"("refundedAt");
