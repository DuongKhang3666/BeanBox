# syntax=docker/dockerfile:1
# Stage cuối (runtime) là mặc định. Stage `tools` dùng cho service seed (D-031).
FROM node:22-bookworm-slim AS base
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Toàn bộ dependency (kể cả dev) để build và chạy seed
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# Chỉ dependency production + prisma CLI (cần cho `migrate deploy` khi khởi động)
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY prisma ./prisma
RUN npm i --no-save prisma@~6.19 && node_modules/.bin/prisma generate

# Công cụ: seed demo (tsx + dev deps + src + prisma + data). KHÔNG dùng để chạy server.
FROM build AS tools
ENV CHECKPOINT_DISABLE=1
COPY data ./data
USER node
CMD ["node_modules/.bin/tsx", "prisma/seed.ts"]

FROM base AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4000 CHECKPOINT_DISABLE=1
COPY --chown=node:node --from=prod-deps /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node package.json ./
COPY --chown=node:node prisma ./prisma
# Danh mục tỉnh/phường (đọc lúc khởi động, fail-fast nếu thiếu)
COPY --chown=node:node data ./data
# Ảnh tĩnh phục vụ tại /uploads (ảnh seed trong uploads/seed). Volume named khởi tạo từ nội dung này,
# nên thư mục phải thuộc user node để backend ghi được ảnh tải lên.
COPY --chown=node:node uploads ./uploads
# Entrypoint: migrate rồi exec node (PID 1 nhận SIGTERM; kết hợp `init: true` ở compose). Không dùng npx/mạng.
COPY --chmod=755 <<'SH' /usr/local/bin/docker-entrypoint.sh
#!/bin/sh
set -e
node_modules/.bin/prisma migrate deploy
exec node dist/server.js
SH
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
ENTRYPOINT ["docker-entrypoint.sh"]
