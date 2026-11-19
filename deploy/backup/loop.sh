#!/bin/sh
# Chạy backup rồi ngủ BACKUP_INTERVAL_SECONDS (mặc định 24 giờ). Backup lỗi chỉ ghi log, vòng lặp vẫn tiếp tục.
INTERVAL="${BACKUP_INTERVAL_SECONDS:-86400}"
DIR="$(dirname "$0")"

# Ngủ ở nền + wait để nhận SIGTERM ngay (docker stop không phải chờ hết giờ ngủ)
trap 'exit 0' TERM INT

while true; do
  if ! sh "$DIR/backup.sh"; then
    echo "[backup] LỖI: backup thất bại, thử lại sau $INTERVAL giây" >&2
  fi
  sleep "$INTERVAL" &
  wait $!
done
