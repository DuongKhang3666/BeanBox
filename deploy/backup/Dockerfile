# syntax=docker/dockerfile:1
# Image cho service `backup` (D-034, M8): cùng bản major với DB (postgres:17) + rclone/age để đẩy backup off-site.
# rclone, age cài từ apt của Debian (bản do Debian đóng gói, không ghim ở đây; xem phiên bản bằng
# `docker run --rm --entrypoint sh <image> -c "rclone version; age --version"`).
FROM postgres:17
RUN apt-get update \
    && apt-get install -y --no-install-recommends rclone age curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
