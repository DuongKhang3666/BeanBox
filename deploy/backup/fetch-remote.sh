#!/bin/sh
# Tải backup off-site về, kiểm SHA256SUMS, giải mã age (M8). KHÔNG tự chạy pg_restore.
# Cách dùng:
#   fetch-remote.sh --list           liệt kê các bản <TS> trên remote (mới nhất trước)
#   fetch-remote.sh <TS>|latest      tải <remote>/<TS>/ về $BACKUP_DIR/restore/<TS>/, kiểm checksum, giải mã
# Biến: BACKUP_REMOTE (bắt buộc), RCLONE_CONFIG_<TÊN>_* (như lúc backup), BACKUP_DIR (mặc định /backups),
#       BACKUP_AGE_IDENTITY_FILE (mặc định /run/secrets/age-identity; private key age, mount chỉ đọc lúc chạy).
# Mã thoát: 0 OK; 1 lỗi chung (rclone, giải mã...); 2 sai cách dùng/cấu hình; 3 checksum sai (không giải mã);
#           4 thiếu identity age.
set -eu
umask 077
# Remote khai báo hoàn toàn bằng env RCLONE_CONFIG_*; không cần file cấu hình (tránh cảnh báo "Config file not found")
RCLONE_CONFIG="${RCLONE_CONFIG:-/dev/null}"
export RCLONE_CONFIG

BACKUP_DIR="${BACKUP_DIR:-/backups}"
REMOTE="${BACKUP_REMOTE:-}"
IDENTITY="${BACKUP_AGE_IDENTITY_FILE:-/run/secrets/age-identity}"
TS_RE='^[0-9]{8}T[0-9]{6}Z$'

usage() {
  echo "Cách dùng: fetch-remote.sh --list | <TS>|latest" >&2
  exit 2
}

[ $# -eq 1 ] || usage
[ -n "$REMOTE" ] || { echo "[fetch] Chưa đặt BACKUP_REMOTE" >&2; exit 2; }
command -v rclone >/dev/null 2>&1 || { echo "[fetch] Image không có rclone (dùng image build từ deploy/backup)" >&2; exit 2; }
base="${REMOTE%/}"

# In các TS trên remote, mới nhất trước
list_ts() {
  rclone lsf --dirs-only "$base" | sed 's#/$##' | grep -E "$TS_RE" | sort -r || true
}

if [ "$1" = "--list" ]; then
  list_ts
  exit 0
fi

TS="$1"
if [ "$TS" = "latest" ]; then
  TS="$(list_ts | head -n 1)"
  [ -n "$TS" ] || { echo "[fetch] Remote chưa có bản backup nào" >&2; exit 1; }
  echo "[fetch] bản mới nhất: $TS"
fi
printf '%s\n' "$TS" | grep -Eq "$TS_RE" || { echo "[fetch] <TS> sai định dạng (YYYYMMDDTHHMMSSZ hoặc latest)" >&2; exit 2; }

DEST="$BACKUP_DIR/restore/$TS"
rm -rf "$DEST"
mkdir -p "$DEST"

echo "[fetch] tải $TS từ remote về $DEST"
rclone copy "$base/$TS" "$DEST" --retries 3 --low-level-retries 10 --stats-one-line -v \
  || { echo "[fetch] LỖI: rclone copy thất bại" >&2; exit 1; }
[ -f "$DEST/SHA256SUMS" ] || { echo "[fetch] LỖI: bản $TS không có SHA256SUMS" >&2; exit 1; }

# Tên file trong SHA256SUMS phải là basename thuần (không chứa / hay ..)
if awk '{ f = $2; sub(/^\*/, "", f); if (f ~ /\// || f ~ /^\.\./) bad = 1 } END { exit bad ? 0 : 1 }' "$DEST/SHA256SUMS"; then
  echo "[fetch] LỖI: SHA256SUMS có đường dẫn không hợp lệ" >&2
  exit 3
fi

echo "[fetch] kiểm checksum"
if ! (cd "$DEST" && sha256sum -c SHA256SUMS); then
  echo "[fetch] LỖI: checksum KHÔNG khớp: dừng, không giải mã. Thử bản khác (--list)." >&2
  exit 3
fi

# Giải mã các file .age được liệt kê
decrypted=0
for f in "$DEST"/*.age; do
  [ -e "$f" ] || continue
  if [ ! -f "$IDENTITY" ]; then
    echo "[fetch] LỖI: không thấy identity age tại $IDENTITY (mount private key chỉ đọc, hoặc đặt BACKUP_AGE_IDENTITY_FILE)" >&2
    exit 4
  fi
  command -v age >/dev/null 2>&1 || { echo "[fetch] LỖI: image không có age" >&2; exit 2; }
  out="${f%.age}"
  echo "[fetch] giải mã $(basename "$f")"
  if ! age -d -i "$IDENTITY" -o "$out.partial" "$f"; then
    rm -f "$out.partial"
    echo "[fetch] LỖI: giải mã thất bại (sai khóa?)" >&2
    exit 1
  fi
  mv "$out.partial" "$out"
  chmod 600 "$out"
  rm -f "$f"
  decrypted=$((decrypted + 1))
done
[ "$decrypted" -gt 0 ] || echo "[fetch] không có file .age (bản không mã hóa), bỏ qua giải mã"

echo "[fetch] xong. File nằm ở $DEST (host: ./backups/restore/$TS/). Bước tiếp theo, xem docs/deployment.md mục 11:"
echo "  DB:      sh /deploy/backup/restore.sh --yes $DEST/beanbox-$TS.dump <tên-DB-đích>"
if [ -f "$DEST/uploads-$TS.tar.gz" ]; then
  echo "  uploads: tar -xzf /backups/restore/$TS/uploads-$TS.tar.gz -C /app/uploads  (chạy trong container backend, user root)"
fi
