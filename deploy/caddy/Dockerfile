# syntax=docker/dockerfile:1
# Caddy 2 kèm plugin rate limit (D-026). Ghim phiên bản Caddy và commit plugin để build lặp lại được.
# caddy-ratelimit chưa có tag mới sau v0.1.0 nên ghim theo commit.
ARG CADDY_VERSION=2.11.9
ARG RATELIMIT_REF=5625512f24f6f59d6f64fb3aafe5eecff0b286db

FROM caddy:${CADDY_VERSION}-builder AS builder
ARG CADDY_VERSION
ARG RATELIMIT_REF
RUN xcaddy build v${CADDY_VERSION} --with github.com/mholt/caddy-ratelimit@${RATELIMIT_REF}

FROM caddy:${CADDY_VERSION}-alpine
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
# Chạy không phải root: binary mới copy mất capability nên cấp lại quyền bind cổng 80/443.
# Image gốc đã đặt XDG_DATA_HOME=/data và XDG_CONFIG_HOME=/config.
RUN apk add --no-cache libcap \
    && setcap cap_net_bind_service=+ep /usr/bin/caddy \
    && apk del libcap \
    && addgroup -S caddy \
    && adduser -S -G caddy -H -h /data -s /sbin/nologin caddy \
    && mkdir -p /data /config \
    && chown -R caddy:caddy /data /config
USER caddy
