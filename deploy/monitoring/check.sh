#!/bin/sh
# Kiểm nhanh BeanBox từ BÊN NGOÀI VPS (M8, docs/deployment.md mục 16 "Giám sát uptime"). Chỉ cần curl + openssl.
# Cách dùng:
#   check.sh [--insecure] [--min-tls-days N] [--home-keyword TỪ] [--timeout GIÂY] <base-url>
#   ví dụ: check.sh https://shop.example.com
#          check.sh --insecure --min-tls-days 0 https://localhost:8443     (thử cục bộ với CA nội bộ của Caddy)
# Kiểm: (1) GET /api/v1/health = 200 và chứa "db":"up"; (2) GET / = 200 và chứa từ khóa (mặc định BeanBox);
#       (3) chứng chỉ TLS còn >= N ngày (mặc định 14; chỉ khi URL là https).
# In OK/FAIL từng mục. Thoát 0 nếu tất cả OK, 1 nếu có FAIL, 2 nếu sai cách dùng. Dùng được từ cron máy khác
# (cron gửi mail khi script in ra lỗi/thoát khác 0, hoặc nối với heartbeat: check.sh URL && curl -fsS <heartbeat>).
# --insecure: bỏ kiểm tra chuỗi chứng chỉ/hostname (chỉ để thử với CA nội bộ), vẫn đọc được ngày hết hạn.
set -eu

MIN_DAYS=14
KEYWORD="BeanBox"
TIMEOUT=10
INSECURE=0
BASE=""

usage() {
  echo "Cách dùng: check.sh [--insecure] [--min-tls-days N] [--home-keyword TỪ] [--timeout GIÂY] <base-url>" >&2
  exit 2
}

while [ $# -gt 0 ]; do
  case "$1" in
    --insecure) INSECURE=1; shift ;;
    --min-tls-days) [ $# -ge 2 ] || usage; MIN_DAYS="$2"; shift 2 ;;
    --home-keyword) [ $# -ge 2 ] || usage; KEYWORD="$2"; shift 2 ;;
    --timeout) [ $# -ge 2 ] || usage; TIMEOUT="$2"; shift 2 ;;
    -h|--help) usage ;;
    -*) echo "Tùy chọn không hợp lệ: $1" >&2; usage ;;
    *) [ -z "$BASE" ] || usage; BASE="$1"; shift ;;
  esac
done
[ -n "$BASE" ] || usage
for n in "$MIN_DAYS" "$TIMEOUT"; do
  case "$n" in ''|*[!0-9]*) echo "--min-tls-days và --timeout phải là số nguyên không âm" >&2; exit 2 ;; esac
done
command -v curl >/dev/null 2>&1 || { echo "Thiếu curl" >&2; exit 2; }

# Tách scheme/host/port; bỏ path và dấu / cuối
case "$BASE" in
  https://*) SCHEME=https; REST="${BASE#https://}"; PORT=443 ;;
  http://*) SCHEME=http; REST="${BASE#http://}"; PORT=80 ;;
  *) echo "URL phải bắt đầu bằng https:// hoặc http://" >&2; exit 2 ;;
esac
HOSTPORT="${REST%%/*}"
case "$HOSTPORT" in
  \[*\]:*) HOST="${HOSTPORT%%\]:*}]"; PORT="${HOSTPORT##*\]:}" ;;
  \[*\]) HOST="$HOSTPORT" ;;
  *:*) HOST="${HOSTPORT%%:*}"; PORT="${HOSTPORT##*:}" ;;
  *) HOST="$HOSTPORT" ;;
esac
[ -n "$HOST" ] || { echo "URL thiếu host" >&2; exit 2; }
case "$PORT" in ''|*[!0-9]*) echo "Cổng không hợp lệ trong URL" >&2; exit 2 ;; esac
ORIGIN="$SCHEME://$HOSTPORT"

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
FAILS=0
ok() { echo "OK    $1"; }
bad() { echo "FAIL  $1"; FAILS=$((FAILS + 1)); }

CURL_K=""
[ "$INSECURE" -eq 0 ] || CURL_K="-k"

# fetch <path>: ghi body vào $TMP, in mã HTTP (000 nếu không kết nối được)
fetch() {
  # shellcheck disable=SC2086  # $CURL_K rỗng hoặc đúng một cờ
  curl -sS $CURL_K -m "$TIMEOUT" -o "$TMP" -w '%{http_code}' "$ORIGIN$1" 2>/dev/null || true
}

# (1) health
CODE="$(fetch /api/v1/health)"
if [ "$CODE" = "200" ] && grep -q '"db":"up"' "$TMP"; then
  ok "health: $ORIGIN/api/v1/health 200 và db up"
else
  bad "health: $ORIGIN/api/v1/health trả HTTP $CODE (cần 200 và chứa \"db\":\"up\")"
fi

# (2) trang chủ
CODE="$(fetch /)"
if [ "$CODE" = "200" ] && grep -q -- "$KEYWORD" "$TMP"; then
  ok "trang chủ: $ORIGIN/ 200 và chứa \"$KEYWORD\""
else
  bad "trang chủ: $ORIGIN/ trả HTTP $CODE (cần 200 và chứa \"$KEYWORD\")"
fi

# (3) TLS
if [ "$SCHEME" = "https" ]; then
  if ! command -v openssl >/dev/null 2>&1; then
    bad "tls: thiếu openssl"
  else
    VERIFY="-verify_return_error -verify_hostname $HOST"
    [ "$INSECURE" -eq 0 ] || VERIFY=""
    CERT="$(mktemp)"
    # shellcheck disable=SC2086  # $VERIFY là danh sách cờ
    if echo | openssl s_client -connect "$HOST:$PORT" -servername "$HOST" $VERIFY 2>/dev/null \
        | openssl x509 > "$CERT" 2>/dev/null && [ -s "$CERT" ]; then
      END="$(openssl x509 -noout -enddate < "$CERT" | sed 's/^notAfter=//')"
      if openssl x509 -noout -checkend $((MIN_DAYS * 86400)) < "$CERT" >/dev/null; then
        ok "tls: chứng chỉ hết hạn $END (còn >= $MIN_DAYS ngày)"
      else
        bad "tls: chứng chỉ hết hạn $END (còn < $MIN_DAYS ngày hoặc đã hết hạn)"
      fi
    else
      bad "tls: không lấy được chứng chỉ từ $HOST:$PORT (kết nối lỗi hoặc chứng chỉ không hợp lệ)"
    fi
    rm -f "$CERT"
  fi
else
  echo "SKIP  tls: URL là http, bỏ qua kiểm chứng chỉ"
fi

if [ "$FAILS" -eq 0 ]; then
  echo "Tất cả OK"
  exit 0
fi
echo "$FAILS mục FAIL"
exit 1
