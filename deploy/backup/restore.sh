#!/bin/sh
# Khôi phục DB BeanBox (D-034). Uploads khôi phục riêng, xem docs/deployment.md mục 11.
# Cách dùng: restore.sh --yes <file.dump> <tên-DB-đích>
# DB đích phải tồn tại (createdb trước). Dùng PGHOST/PGUSER/PGPASSWORD. Dữ liệu trong DB đích bị GHI ĐÈ.
set -eu

usage() {
  echo "Cách dùng: restore.sh --yes <file.dump> <tên-DB-đích>" >&2
  exit 2
}

[ "${1:-}" = "--yes" ] || { echo "Thiếu cờ --yes (thao tác ghi đè dữ liệu DB đích)." >&2; usage; }
shift
[ $# -eq 2 ] || usage

DUMP="$1"
TARGET_DB="$2"

[ -f "$DUMP" ] || { echo "Không thấy file dump: $DUMP" >&2; exit 1; }

echo "[restore] pg_restore $DUMP -> $TARGET_DB@${PGHOST:-local}"
pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error -d "$TARGET_DB" "$DUMP"

echo "[restore] xong"
