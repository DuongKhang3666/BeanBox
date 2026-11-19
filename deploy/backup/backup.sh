#!/bin/sh
# Sao lưu BeanBox (D-034, M8): pg_dump -Fc + tar.gz uploads, xoay vòng cục bộ theo BACKUP_RETENTION_DAYS,
# tùy chọn đẩy off-site (mã hóa age + rclone) khi đặt BACKUP_REMOTE. Mặc định off-site TẮT.
# Dùng biến PGHOST/PGUSER/PGPASSWORD/PGDATABASE. Không để file dở.
#
# Mã thoát: 0 thành công; 2 cấu hình không hợp lệ (số nguyên sai...); 3 đẩy off-site hoặc kiểm toàn vẹn
# thất bại; 4 cấu hình off-site sai (thiếu/sai recipient age, thiếu rclone/age). Với mã 3 và 4 bản backup
# cục bộ VẪN được giữ. Lỗi pg_dump/tar: mã khác 0 của lệnh đó.
#
# Biến off-site (đặt trong .env.backup, xem .env.backup.example):
#   BACKUP_REMOTE                    rỗng = tắt; ví dụ offsite:beanbox-backups/prod
#   RCLONE_CONFIG_<TÊN>_*            khai báo remote rclone (TYPE, PROVIDER, ACCESS_KEY_ID, ...)
#   BACKUP_REMOTE_ENCRYPTION         age (mặc định) | none (remote đã được mã hóa, ví dụ rclone crypt)
#   BACKUP_AGE_RECIPIENTS            public key age1..., cách nhau dấu phẩy/khoảng trắng
#   BACKUP_AGE_RECIPIENTS_FILE       file chứa recipient (mỗi dòng một khóa, # là chú thích)
#   BACKUP_REMOTE_VERIFY             hash (mặc định, dùng hash/size của backend) | download (tải về so nội dung)
#   BACKUP_REMOTE_RETENTION_DAYS     mặc định 30 (theo TÊN thư mục <TS>)
#   BACKUP_REMOTE_MIN_KEEP           mặc định 3: luôn giữ ít nhất N bản mới nhất
#   BACKUP_HEARTBEAT_URL / BACKUP_HEARTBEAT_FAIL_URL   URL ping khi thành công / thất bại (có token, không log)
set -eu
# File dump chứa dữ liệu cá nhân: chỉ chủ sở hữu đọc được (0600 file, 0700 thư mục mới tạo)
umask 077
# Remote khai báo hoàn toàn bằng env RCLONE_CONFIG_*; không cần file cấu hình (tránh cảnh báo "Config file not found")
RCLONE_CONFIG="${RCLONE_CONFIG:-/dev/null}"
export RCLONE_CONFIG

BACKUP_DIR="${BACKUP_DIR:-/backups}"
UPLOADS_DIR="${UPLOADS_DIR:-/app/uploads}"
RETENTION="${BACKUP_RETENTION_DAYS:-7}"
REMOTE="${BACKUP_REMOTE:-}"
REMOTE_ENC="${BACKUP_REMOTE_ENCRYPTION:-age}"
REMOTE_VERIFY="${BACKUP_REMOTE_VERIFY:-hash}"
REMOTE_RETENTION="${BACKUP_REMOTE_RETENTION_DAYS:-30}"
REMOTE_MIN_KEEP="${BACKUP_REMOTE_MIN_KEEP:-3}"
HEARTBEAT_URL="${BACKUP_HEARTBEAT_URL:-}"
HEARTBEAT_FAIL_URL="${BACKUP_HEARTBEAT_FAIL_URL:-}"

STAGE=""
DB_TMP=""
UP_TMP=""

log() { echo "[backup] $*"; }
warn() { echo "[backup] $*" >&2; }

# Gọi URL heartbeat; URL chứa token nên không bao giờ in ra, stderr của curl bị bỏ.
ping_url() {
  [ -n "$1" ] || return 0
  if ! command -v curl >/dev/null 2>&1; then
    warn "CẢNH BÁO: có URL heartbeat nhưng image không có curl"
    return 0
  fi
  if curl -fsS -m 10 --retry 3 -o /dev/null "$1" 2>/dev/null; then
    log "đã gọi heartbeat"
  else
    warn "CẢNH BÁO: gọi heartbeat thất bại (bỏ qua, không làm backup lỗi)"
  fi
  return 0
}

on_exit() {
  rc=$?
  trap - EXIT
  [ -z "$DB_TMP" ] || rm -f "$DB_TMP" "$UP_TMP"
  [ -z "$STAGE" ] || rm -rf "$STAGE"
  if [ "$rc" -eq 0 ]; then
    ping_url "$HEARTBEAT_URL"
  else
    ping_url "$HEARTBEAT_FAIL_URL"
  fi
  exit "$rc"
}
trap on_exit EXIT
trap 'exit 143' TERM
trap 'exit 130' INT

is_uint() {
  case "$1" in
    ''|*[!0-9]*) return 1 ;;
  esac
  return 0
}

is_uint "$RETENTION" || { warn "BACKUP_RETENTION_DAYS phải là số nguyên không âm"; exit 2; }

if [ -n "$REMOTE" ]; then
  is_uint "$REMOTE_RETENTION" || { warn "BACKUP_REMOTE_RETENTION_DAYS phải là số nguyên không âm"; exit 2; }
  if ! is_uint "$REMOTE_MIN_KEEP" || [ "$REMOTE_MIN_KEEP" -lt 1 ]; then
    warn "BACKUP_REMOTE_MIN_KEEP phải là số nguyên >= 1"
    exit 2
  fi
  case "$REMOTE_ENC" in age|none) ;; *) warn "BACKUP_REMOTE_ENCRYPTION chỉ nhận age hoặc none"; exit 2 ;; esac
  case "$REMOTE_VERIFY" in hash|download) ;; *) warn "BACKUP_REMOTE_VERIFY chỉ nhận hash hoặc download"; exit 2 ;; esac
fi

TS="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR/db" "$BACKUP_DIR/uploads"

DB_FINAL="$BACKUP_DIR/db/beanbox-$TS.dump"
UP_FINAL="$BACKUP_DIR/uploads/uploads-$TS.tar.gz"
DB_TMP="$DB_FINAL.partial"
UP_TMP="$UP_FINAL.partial"
HAVE_UPLOADS=0

log "$TS: pg_dump $PGDATABASE@$PGHOST"
pg_dump -Fc -f "$DB_TMP"
mv "$DB_TMP" "$DB_FINAL"

if [ -d "$UPLOADS_DIR" ]; then
  log "$TS: nén $UPLOADS_DIR"
  tar -czf "$UP_TMP" -C "$UPLOADS_DIR" .
  mv "$UP_TMP" "$UP_FINAL"
  HAVE_UPLOADS=1
else
  warn "bỏ qua uploads: không có thư mục $UPLOADS_DIR"
fi

# Xoay vòng cục bộ: xóa file cũ hơn RETENTION ngày
find "$BACKUP_DIR/db" -type f \( -name 'beanbox-*.dump' -o -name '*.partial' \) -mtime "+$RETENTION" -delete
find "$BACKUP_DIR/uploads" -type f \( -name 'uploads-*.tar.gz' -o -name '*.partial' \) -mtime "+$RETENTION" -delete

# ---------------------------------------------------------------------------------------------
# Off-site (tùy chọn). Các hàm trả mã 3/4; gọi ở ngữ cảnh `||` nên không dựa vào `set -e` bên trong.
# ---------------------------------------------------------------------------------------------

# Gom recipient từ BACKUP_AGE_RECIPIENTS và BACKUP_AGE_RECIPIENTS_FILE vào file $1. Trả 1 nếu không có/sai.
build_recipients() {
  rfile="$1"
  : > "$rfile" || return 1
  if [ -n "${BACKUP_AGE_RECIPIENTS:-}" ]; then
    # shellcheck disable=SC2020  # ba ký tự phân cách (phẩy, cách, tab) đều đổi thành xuống dòng
    printf '%s\n' "$BACKUP_AGE_RECIPIENTS" | tr ', \t' '\n\n\n' | sed '/^$/d' >> "$rfile"
  fi
  if [ -n "${BACKUP_AGE_RECIPIENTS_FILE:-}" ]; then
    if [ ! -f "$BACKUP_AGE_RECIPIENTS_FILE" ]; then
      warn "LỖI: không thấy BACKUP_AGE_RECIPIENTS_FILE"
      return 1
    fi
    sed -e 's/#.*$//' -e 's/[[:space:]]//g' -e '/^$/d' "$BACKUP_AGE_RECIPIENTS_FILE" >> "$rfile"
  fi
  [ -s "$rfile" ] || return 1
  # Mỗi dòng phải là public key age1... (không in giá trị sai ra log)
  if grep -qv '^age1[0-9a-z]\{20,\}$' "$rfile"; then
    warn "LỖI: có recipient không đúng định dạng age1... (public key)"
    return 1
  fi
  return 0
}

# Xóa thư mục <TS> cũ hơn REMOTE_RETENTION ngày (theo TÊN), luôn giữ REMOTE_MIN_KEEP bản mới nhất.
# Chỉ đụng thư mục khớp đúng mẫu ^[0-9]{8}T[0-9]{6}Z/$.
offsite_rotate() {
  base="$1"
  cutoff="$(date -u -d "-$REMOTE_RETENTION days" +%Y%m%dT%H%M%SZ)" || return 1
  listing="$STAGE/.remote-list"
  rclone lsf --dirs-only "$base" > "$listing" || return 1
  grep -E '^[0-9]{8}T[0-9]{6}Z/$' "$listing" | sort -r > "$listing.ts" || true
  # Bỏ MIN_KEEP bản mới nhất và bản vừa đẩy; phần còn lại chỉ xóa nếu tên < cutoff
  awk -v keep="$REMOTE_MIN_KEEP" -v cutoff="$cutoff" -v cur="$TS/" \
    'NR > keep && $0 != cur && substr($0, 1, length($0) - 1) < cutoff { print }' "$listing.ts" > "$listing.del"
  n=0
  while IFS= read -r d; do
    [ -n "$d" ] || continue
    log "xoay vòng remote: xóa $d"
    if rclone purge "$base/${d%/}"; then
      n=$((n + 1))
    else
      warn "CẢNH BÁO: không xóa được $d"
    fi
  done < "$listing.del"
  log "xoay vòng remote: đã xóa $n thư mục (giữ tối thiểu $REMOTE_MIN_KEEP)"
  return 0
}

offsite_push() {
  if ! command -v rclone >/dev/null 2>&1; then
    warn "LỖI: BACKUP_REMOTE được đặt nhưng image không có rclone (dùng image build từ deploy/backup)"
    return 4
  fi
  base="${REMOTE%/}"
  [ -n "$base" ] || { warn "LỖI: BACKUP_REMOTE không hợp lệ"; return 4; }

  STAGE="$(mktemp -d "$BACKUP_DIR/.staging.XXXXXX")" || return 4

  if [ "$REMOTE_ENC" = "age" ]; then
    command -v age >/dev/null 2>&1 || { warn "LỖI: image không có age"; return 4; }
    if ! build_recipients "$STAGE/.recipients"; then
      warn "LỖI: off-site bật (BACKUP_REMOTE) nhưng thiếu/sai recipient age. Đặt BACKUP_AGE_RECIPIENTS hoặc BACKUP_AGE_RECIPIENTS_FILE, hoặc BACKUP_REMOTE_ENCRYPTION=none nếu remote đã mã hóa. KHÔNG đẩy bản không mã hóa."
      return 4
    fi
    log "$TS: mã hóa age (phía client)"
    age -R "$STAGE/.recipients" -o "$STAGE/beanbox-$TS.dump.age" "$DB_FINAL" \
      || { warn "LỖI: age mã hóa dump thất bại"; return 3; }
    files="beanbox-$TS.dump.age"
    if [ "$HAVE_UPLOADS" -eq 1 ]; then
      age -R "$STAGE/.recipients" -o "$STAGE/uploads-$TS.tar.gz.age" "$UP_FINAL" \
        || { warn "LỖI: age mã hóa uploads thất bại"; return 3; }
      files="$files uploads-$TS.tar.gz.age"
    fi
    rm -f "$STAGE/.recipients"
  else
    log "$TS: BACKUP_REMOTE_ENCRYPTION=none: đẩy file KHÔNG mã hóa phía client"
    ln "$DB_FINAL" "$STAGE/beanbox-$TS.dump" 2>/dev/null || cp "$DB_FINAL" "$STAGE/beanbox-$TS.dump" || return 3
    files="beanbox-$TS.dump"
    if [ "$HAVE_UPLOADS" -eq 1 ]; then
      ln "$UP_FINAL" "$STAGE/uploads-$TS.tar.gz" 2>/dev/null || cp "$UP_FINAL" "$STAGE/uploads-$TS.tar.gz" || return 3
      files="$files uploads-$TS.tar.gz"
    fi
  fi

  # shellcheck disable=SC2086  # $files là danh sách tên file không có khoảng trắng
  (cd "$STAGE" && sha256sum $files > SHA256SUMS) || { warn "LỖI: tạo SHA256SUMS thất bại"; return 3; }

  log "$TS: đẩy lên remote (thư mục $TS/)"
  rclone copy "$STAGE" "$base/$TS" --retries 3 --low-level-retries 10 --stats-one-line -v \
    || { warn "LỖI: rclone copy thất bại"; return 3; }

  log "$TS: kiểm toàn vẹn (rclone check, chế độ $REMOTE_VERIFY)"
  if [ "$REMOTE_VERIFY" = "download" ]; then
    rclone check "$STAGE" "$base/$TS" --one-way --download \
      || { warn "LỖI: kiểm toàn vẹn (download) thất bại"; return 3; }
  else
    rclone check "$STAGE" "$base/$TS" --one-way \
      || { warn "LỖI: kiểm toàn vẹn thất bại"; return 3; }
  fi

  offsite_rotate "$base" || warn "CẢNH BÁO: xoay vòng remote lỗi (bản vừa đẩy vẫn an toàn)"
  return 0
}

if [ -n "$REMOTE" ]; then
  # Dọn staging mồ côi của lần chạy bị kill (SIGKILL không chạy được trap)
  find "$BACKUP_DIR" -maxdepth 1 -type d -name '.staging.*' -mtime +1 -exec rm -rf {} + 2>/dev/null || true
  rc=0
  offsite_push || rc=$?
  if [ "$rc" -ne 0 ]; then
    warn "LỖI: off-site thất bại (mã $rc); backup cục bộ vẫn được giữ: $DB_FINAL"
    exit "$rc"
  fi
  log "off-site OK"
fi

log "xong: $DB_FINAL"
