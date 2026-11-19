#!/bin/sh
# Sao lưu BeanBox (D-034): pg_dump -Fc + tar.gz uploads, xoay vòng theo BACKUP_RETENTION_DAYS.
# Dùng biến PGHOST/PGUSER/PGPASSWORD/PGDATABASE. Thoát mã khác 0 khi lỗi; không để file dở.
set -eu
# File dump chứa dữ liệu cá nhân: chỉ chủ sở hữu đọc được (0600 file, 0700 thư mục mới tạo)
umask 077

BACKUP_DIR="${BACKUP_DIR:-/backups}"
UPLOADS_DIR="${UPLOADS_DIR:-/app/uploads}"
RETENTION="${BACKUP_RETENTION_DAYS:-7}"

case "$RETENTION" in
  ''|*[!0-9]*) echo "BACKUP_RETENTION_DAYS phải là số nguyên không âm" >&2; exit 2 ;;
esac

TS="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR/db" "$BACKUP_DIR/uploads"

DB_FINAL="$BACKUP_DIR/db/beanbox-$TS.dump"
UP_FINAL="$BACKUP_DIR/uploads/uploads-$TS.tar.gz"
DB_TMP="$DB_FINAL.partial"
UP_TMP="$UP_FINAL.partial"

# Xóa file tạm nếu lỗi/bị ngắt
trap 'rm -f "$DB_TMP" "$UP_TMP"' EXIT INT TERM

echo "[backup] $TS: pg_dump $PGDATABASE@$PGHOST"
pg_dump -Fc -f "$DB_TMP"
mv "$DB_TMP" "$DB_FINAL"

if [ -d "$UPLOADS_DIR" ]; then
  echo "[backup] $TS: nén $UPLOADS_DIR"
  tar -czf "$UP_TMP" -C "$UPLOADS_DIR" .
  mv "$UP_TMP" "$UP_FINAL"
else
  echo "[backup] bỏ qua uploads: không có thư mục $UPLOADS_DIR" >&2
fi

# Xoay vòng: xóa file cũ hơn RETENTION ngày
find "$BACKUP_DIR/db" -type f \( -name 'beanbox-*.dump' -o -name '*.partial' \) -mtime "+$RETENTION" -delete
find "$BACKUP_DIR/uploads" -type f \( -name 'uploads-*.tar.gz' -o -name '*.partial' \) -mtime "+$RETENTION" -delete

echo "[backup] xong: $DB_FINAL"
