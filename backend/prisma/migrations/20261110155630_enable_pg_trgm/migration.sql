-- Extension cho tìm kiếm không dấu (GIN trigram). Phải chạy trước migration tạo bảng.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
