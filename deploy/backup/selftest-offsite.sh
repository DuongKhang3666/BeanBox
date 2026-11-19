#!/bin/sh
# shellcheck disable=SC2034,SC2016,SC2010,SC2012  # biến dùng qua eval trong check(); ls|grep chỉ để kiểm tên
# Tự kiểm backup off-site (M8). Chạy BÊN TRONG image backup (cần rclone, age, pg_dump và DB thật qua PG*),
# dùng remote rclone kiểu `local` nên không cần dịch vụ ngoài và không đụng /backups thật.
#   docker compose --env-file .env.production -f docker-compose.prod.yml --profile backup run --rm \
#     --entrypoint sh backup /deploy/backup/selftest-offsite.sh      (service db phải chạy; backup tự khởi động db)
# In PASS/FAIL từng mục; thoát mã khác 0 nếu có FAIL. Khóa age sinh tạm, xóa khi xong.
set -u

DIR="$(cd "$(dirname "$0")" && pwd)"
T="$(mktemp -d /tmp/bb-selftest.XXXXXX)"
HOLD_PID=""
cleanup() {
  [ -z "$HOLD_PID" ] || kill "$HOLD_PID" 2>/dev/null || true
  rm -rf "$T"
}
trap cleanup EXIT
trap 'exit 130' INT TERM
umask 077

PASSES=0
FAILS=0
pass() { PASSES=$((PASSES + 1)); echo "PASS  $1"; }
fail() { FAILS=$((FAILS + 1)); echo "FAIL  $1"; }
check() { # check "mô tả" "điều kiện sh" (đánh giá bằng eval)
  if eval "$2"; then pass "$1"; else fail "$1"; fi
}

for c in rclone age age-keygen pg_dump sha256sum flock; do
  command -v "$c" >/dev/null 2>&1 || { echo "Thiếu lệnh $c: chạy trong image build từ deploy/backup"; exit 2; }
done

R="$T/remote"            # thư mục gốc của remote local
mkdir -p "$R" "$T/uploads"
echo "anh-mau-1" > "$T/uploads/a.txt"
mkdir -p "$T/uploads/sub" && echo "anh-mau-2" > "$T/uploads/sub/b.txt"

age-keygen -o "$T/identity.txt" 2>/dev/null
PUB="$(age-keygen -y "$T/identity.txt")"

export RCLONE_CONFIG_SELFTEST_TYPE=local
export BACKUP_REMOTE="selftest:$R"
export BACKUP_AGE_RECIPIENTS="$PUB"
export BACKUP_AGE_IDENTITY_FILE="$T/identity.txt"
export UPLOADS_DIR="$T/uploads"
export BACKUP_DIR="$T/backups"
export BACKUP_REMOTE_RETENTION_DAYS=30
export BACKUP_REMOTE_MIN_KEEP=3

# Chạy backup.sh, đầu ra vào $T/out.<n>; trả mã thoát của script
N=0
run_backup() { # run_backup [VAR=giá_trị ...]: ghi đè env cho riêng lần chạy này
  N=$((N + 1))
  env "$@" sh "$DIR/backup.sh" > "$T/out.$N" 2>&1
  rc=$?
  LAST_OUT="$T/out.$N"
  sleep 1 # TS tính theo giây: tránh trùng thư mục giữa hai lần chạy
  return $rc
}
ts_dirs() { ls -1 "$R" | grep -E '^[0-9]{8}T[0-9]{6}Z$' | sort; }
latest_local_dump() { ls -1t "$BACKUP_DIR"/db/beanbox-*.dump | head -n 1; }
latest_local_up() { ls -1t "$BACKUP_DIR"/uploads/uploads-*.tar.gz | head -n 1; }
sha_of() { sha256sum "$1" | cut -d' ' -f1; }

echo "== (a) Upload đủ 3 file vào <TS>/"
run_backup; RC=$?
check "backup.sh thoát 0 khi off-site bật" '[ "$RC" -eq 0 ]'
TS1="$(ts_dirs | tail -n 1)"
check "có đúng 1 thư mục <TS> trên remote" '[ "$(ts_dirs | wc -l)" -eq 1 ]'
FILES="$(ls -1 "$R/$TS1" 2>/dev/null | LC_ALL=C sort | tr '\n' ' ')"
check "remote có beanbox-<TS>.dump.age, uploads-<TS>.tar.gz.age, SHA256SUMS" '[ "$FILES" = "SHA256SUMS beanbox-$TS1.dump.age uploads-$TS1.tar.gz.age " ]'
check "không có file thô (.dump/.tar.gz) trên remote" '[ -z "$(ls "$R/$TS1" | grep -E '\''\.(dump|tar\.gz)$'\'')" ]'
check "log không chứa khóa bí mật age" '! grep -q '\''AGE-SECRET-KEY'\'' "$LAST_OUT"'

echo "== (b) Fetch + checksum + giải mã giống hệt bản cục bộ"
LOCAL_DUMP="$(latest_local_dump)"
LOCAL_UP="$(latest_local_up)"
FETCH_DIR="$T/fetch"
BACKUP_DIR="$FETCH_DIR" sh "$DIR/fetch-remote.sh" latest > "$T/fetch.out" 2>&1; RC=$?
check "fetch-remote.sh latest thoát 0" '[ "$RC" -eq 0 ]'
check "dump giải mã trùng sha256 với bản cục bộ" '[ "$(sha_of "$FETCH_DIR/restore/$TS1/beanbox-$TS1.dump" 2>/dev/null)" = "$(sha_of "$LOCAL_DUMP")" ]'
check "uploads giải mã trùng sha256 với bản cục bộ" '[ "$(sha_of "$FETCH_DIR/restore/$TS1/uploads-$TS1.tar.gz" 2>/dev/null)" = "$(sha_of "$LOCAL_UP")" ]'
PERM="$(stat -c %a "$FETCH_DIR/restore/$TS1/beanbox-$TS1.dump" 2>/dev/null)"
check "file giải mã quyền 600" '[ "$PERM" = "600" ]'
BACKUP_DIR="$FETCH_DIR" sh "$DIR/fetch-remote.sh" --list > "$T/list.out" 2>&1
check "--list in ra $TS1" 'grep -qx "$TS1" "$T/list.out"'

echo "== (c) Sửa 1 byte trên remote -> fetch phải FAIL ở checksum (mã 3)"
VICTIM="$R/$TS1/beanbox-$TS1.dump.age"
cp "$VICTIM" "$T/victim.orig"
printf 'X' | dd of="$VICTIM" bs=1 seek=40 conv=notrunc 2>/dev/null
BACKUP_DIR="$T/fetch2" sh "$DIR/fetch-remote.sh" "$TS1" > "$T/fetch2.out" 2>&1
RC=$?
check "fetch thoát 3 khi file remote bị sửa" '[ "$RC" -eq 3 ]'
check "không có file giải mã sau khi checksum sai" '[ ! -e "$T/fetch2/restore/$TS1/beanbox-$TS1.dump" ]'
cp "$T/victim.orig" "$VICTIM"

echo "== (d) Xoay vòng remote"
mkdir -p "$R/20200101T000000Z" "$R/20200102T000000Z" "$R/20200103T000000Z" "$R/not-a-backup" "$R/20200101T000000Z.bak"
for d in 20200101T000000Z 20200102T000000Z 20200103T000000Z not-a-backup 20200101T000000Z.bak; do
  echo x > "$R/$d/marker"
done
run_backup; RC=$?
check "backup thoát 0" '[ "$RC" -eq 0 ]'
check "2020-01-01 và 2020-01-02 bị xóa" '[ ! -e "$R/20200101T000000Z" ] && [ ! -e "$R/20200102T000000Z" ]'
check "2020-01-03 còn (giữ tối thiểu MIN_KEEP=3 bản mới nhất)" '[ -e "$R/20200103T000000Z/marker" ]'
check "còn >= MIN_KEEP thư mục <TS>" '[ "$(ts_dirs | wc -l)" -ge 3 ]'
check "thư mục tên lạ còn nguyên" '[ -e "$R/not-a-backup/marker" ] && [ -e "$R/20200101T000000Z.bak/marker" ]'
run_backup BACKUP_REMOTE_MIN_KEEP=1; RC=$?
check "MIN_KEEP=1: backup thoát 0" '[ "$RC" -eq 0 ]'
check "MIN_KEEP=1: 2020-01-03 bị xóa, bản gần đây còn" '[ ! -e "$R/20200103T000000Z" ] && [ -d "$R/$TS1" ]'
check "MIN_KEEP=1: thư mục tên lạ vẫn còn" '[ -e "$R/not-a-backup/marker" ]'

echo "== (e) Off-site bật mà thiếu/sai recipient -> mã 4, không đẩy gì"
BEFORE="$(ts_dirs | wc -l)"
run_backup BACKUP_AGE_RECIPIENTS=; RC=$?
check "thiếu recipient: thoát 4" '[ "$RC" -eq 4 ]'
check "thiếu recipient: backup cục bộ vẫn được giữ" '[ -f "$(latest_local_dump)" ]'
check "thiếu recipient: remote không có thêm bản" '[ "$(ts_dirs | wc -l)" -eq "$BEFORE" ]'
run_backup BACKUP_AGE_RECIPIENTS="khong-phai-age-key"; RC=$?
check "recipient sai định dạng: thoát 4" '[ "$RC" -eq 4 ]'
check "recipient sai: log không in giá trị" '! grep -q '\''khong-phai-age-key'\'' "$LAST_OUT"'
run_backup BACKUP_REMOTE_RETENTION_DAYS=abc; RC=$?
check "BACKUP_REMOTE_RETENTION_DAYS không phải số: thoát 2" '[ "$RC" -eq 2 ]'
run_backup BACKUP_REMOTE_ENCRYPTION=none BACKUP_AGE_RECIPIENTS=; RC=$?
check "BACKUP_REMOTE_ENCRYPTION=none cho phép không recipient: thoát 0" '[ "$RC" -eq 0 ]'
TSN="$(ts_dirs | tail -n 1)"
check "bản none có file thô + SHA256SUMS, không .age" '[ -f "$R/$TSN/beanbox-$TSN.dump" ] && [ -f "$R/$TSN/SHA256SUMS" ] && [ -z "$(ls "$R/$TSN" | grep -F .age)" ]'
BACKUP_DIR="$T/fetch3" sh "$DIR/fetch-remote.sh" "$TSN" > "$T/fetch3.out" 2>&1; RC=$?
check "fetch bản none (không cần identity) thoát 0" '[ "$RC" -eq 0 ]'
run_backup BACKUP_REMOTE_VERIFY=download; RC=$?
check "BACKUP_REMOTE_VERIFY=download thoát 0" '[ "$RC" -eq 0 ]'
FAKE="$T/fakebin"; mkdir -p "$FAKE"
printf '#!/bin/sh\nexit 1\n' > "$FAKE/rclone"; chmod +x "$FAKE/rclone"
run_backup PATH="$FAKE:$PATH"; RC=$?
check "rclone hỏng (copy lỗi): thoát 3, backup cục bộ vẫn giữ" '[ "$RC" -eq 3 ] && [ -f "$(latest_local_dump)" ]'

echo "== (f) Không đặt BACKUP_REMOTE -> như cũ, không gọi rclone"
printf '#!/bin/sh\ntouch "%s/rclone-called"\nexit 1\n' "$T" > "$FAKE/rclone"
run_backup PATH="$FAKE:$PATH" BACKUP_REMOTE=; RC=$?
check "thoát 0" '[ "$RC" -eq 0 ]'
check "rclone không bị gọi" '[ ! -e "$T/rclone-called" ]'
check "không tạo thư mục staging" '[ -z "$(ls -A "$BACKUP_DIR" | grep '\''^\.staging'\'')" ]'

echo "== (g) Heartbeat (curl giả ghi lại URL, URL không lọt vào log)"
printf '#!/bin/sh\nfor a; do last="$a"; done\necho "$last" >> "%s/curl.log"\nexit 0\n' "$T" > "$FAKE/curl"
chmod +x "$FAKE/curl"
rm -f "$FAKE/rclone"
run_backup PATH="$FAKE:$PATH" BACKUP_HEARTBEAT_URL="http://hb.invalid/ok-token" BACKUP_HEARTBEAT_FAIL_URL="http://hb.invalid/fail-token"; RC=$?
check "thành công -> gọi URL ok" '[ "$RC" -eq 0 ] && grep -qx '\''http://hb.invalid/ok-token'\'' "$T/curl.log"'
check "thành công -> không gọi URL fail" '! grep -q '\''fail-token'\'' "$T/curl.log"'
check "log không chứa URL heartbeat" '! grep -q '\''hb.invalid'\'' "$LAST_OUT"'
rm -f "$T/curl.log"
run_backup PATH="$FAKE:$PATH" BACKUP_HEARTBEAT_URL="http://hb.invalid/ok-token" BACKUP_HEARTBEAT_FAIL_URL="http://hb.invalid/fail-token" BACKUP_AGE_RECIPIENTS=; RC=$?
check "lỗi off-site -> thoát 4 và gọi URL fail" '[ "$RC" -eq 4 ] && grep -qx '\''http://hb.invalid/fail-token'\'' "$T/curl.log"'
check "lỗi -> không gọi URL ok" '! grep -q '\''ok-token'\'' "$T/curl.log"'

echo "== (h) Khóa chống chạy chồng (D-042): có backup khác giữ khóa -> mã 5, không dump, không heartbeat"
mkdir -p "$BACKUP_DIR"
# sh lấy khóa qua fd 8 rồi exec sleep: cùng một PID giữ khóa nên kill $HOLD_PID là nhả khóa (flock <file> <lệnh> fork con)
sh -c 'exec 8>"$1"; flock 8; exec sleep 60' sh "$BACKUP_DIR/.backup.lock" &
HOLD_PID=$!
sleep 1 # chờ tiến trình giữ khóa lấy được khóa
rm -f "$T/curl.log"
DUMPS_BEFORE="$(ls -1 "$BACKUP_DIR"/db | wc -l)"
TS_BEFORE="$(ts_dirs | wc -l)"
run_backup PATH="$FAKE:$PATH" BACKUP_HEARTBEAT_URL="http://hb.invalid/ok-token" BACKUP_HEARTBEAT_FAIL_URL="http://hb.invalid/fail-token"; RC=$?
check "đang bị khóa: thoát 5" '[ "$RC" -eq 5 ]'
check "log báo đã có backup khác đang chạy" 'grep -q "đã có backup khác đang chạy" "$LAST_OUT"'
check "không tạo dump mới" '[ "$(ls -1 "$BACKUP_DIR"/db | wc -l)" -eq "$DUMPS_BEFORE" ]'
check "remote không có thư mục <TS> mới" '[ "$(ts_dirs | wc -l)" -eq "$TS_BEFORE" ]'
check "không gọi heartbeat (cả ok lẫn fail)" '[ ! -s "$T/curl.log" ]'
kill "$HOLD_PID" 2>/dev/null
wait "$HOLD_PID" 2>/dev/null
HOLD_PID=""
run_backup PATH="$FAKE:$PATH" BACKUP_HEARTBEAT_URL="http://hb.invalid/ok-token" BACKUP_HEARTBEAT_FAIL_URL="http://hb.invalid/fail-token"; RC=$?
check "nhả khóa rồi: backup thoát 0" '[ "$RC" -eq 0 ]'
check "nhả khóa rồi: có dump mới và gọi heartbeat ok" '[ "$(ls -1 "$BACKUP_DIR"/db | wc -l)" -gt "$DUMPS_BEFORE" ] && grep -qx '''http://hb.invalid/ok-token''' "$T/curl.log"'

echo
echo "Kết quả: $PASSES PASS, $FAILS FAIL"
[ "$FAILS" -eq 0 ]
