# syntax=docker/dockerfile:1
# Image cho service `backup` (D-034, D-038, D-041): cùng bản major với DB (postgres:17) + rclone/age để đẩy backup off-site.
# - rclone: GHIM phiên bản, tải zip chính thức từ downloads.rclone.org và kiểm sha256 với checksum HARDCODE bên dưới
#   (lấy từ SHA256SUMS đã kiểm chữ ký GPG của rclone). Nâng bản: đổi RCLONE_VERSION + 2 checksum rồi chạy selftest-offsite.sh.
# - age: cài từ apt của Debian (không ghim; xem bản bằng `docker run --rm --entrypoint sh <image> -c "rclone version; age --version"`).

# ---- Stage tải rclone (dùng postgres:17 để chung cache lớp với stage cuối) ----
FROM postgres:17 AS rclone-fetch
ARG RCLONE_VERSION=1.76.0
ARG RCLONE_SHA256_AMD64=b00f00b3266c3764413afe599d3ec316f6f43b3e0ea8a0bc1d186d2133e46df7
ARG RCLONE_SHA256_ARM64=ee169016675e23a69d77240565133ff7dbc9b33d16fa8f7053d4af39f1eaeb78
ARG TARGETARCH
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl unzip ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN set -eu; \
    case "${TARGETARCH:-}" in \
      amd64) ARCH=amd64; SHA="$RCLONE_SHA256_AMD64" ;; \
      arm64) ARCH=arm64; SHA="$RCLONE_SHA256_ARM64" ;; \
      *) echo "LỖI: kiến trúc '${TARGETARCH:-}' chưa được hỗ trợ (chỉ amd64, arm64); thêm checksum vào Dockerfile" >&2; exit 1 ;; \
    esac; \
    ZIP="rclone-v${RCLONE_VERSION}-linux-${ARCH}.zip"; \
    curl -fsSL --retry 3 -o "/tmp/$ZIP" "https://downloads.rclone.org/v${RCLONE_VERSION}/$ZIP"; \
    echo "$SHA  /tmp/$ZIP" | sha256sum -c -; \
    unzip -j "/tmp/$ZIP" "rclone-v${RCLONE_VERSION}-linux-${ARCH}/rclone" -d /tmp/out; \
    chmod 0755 /tmp/out/rclone

# ---- Stage cuối ----
FROM postgres:17
RUN apt-get update \
    && apt-get install -y --no-install-recommends age curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=rclone-fetch --chmod=0755 /tmp/out/rclone /usr/local/bin/rclone
