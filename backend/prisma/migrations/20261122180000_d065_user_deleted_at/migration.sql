-- D-065: dấu "đã tự xóa tài khoản (ẩn danh hóa)", phân biệt với khóa bởi admin.
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);
