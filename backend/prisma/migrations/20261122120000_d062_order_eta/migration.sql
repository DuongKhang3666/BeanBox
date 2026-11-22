-- AlterTable: D-062, ngày giao dự kiến (ngày lịch VN) lưu snapshot trên đơn
ALTER TABLE "Order" ADD COLUMN     "etaFrom" DATE,
ADD COLUMN     "etaTo" DATE;
