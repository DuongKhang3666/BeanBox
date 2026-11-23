import type { Server } from 'node:http';

/**
 * Giữ kết nối keep-alive lâu hơn proxy phía trước (rewrite của Next, Caddy).
 * Mặc định Node đóng socket nhàn rỗi sau 5 giây; proxy tái dùng socket đúng lúc bị đóng sẽ gặp
 * `ECONNRESET` ("Failed to proxy ...", HTTP 500 ngẫu nhiên). `headersTimeout` phải lớn hơn
 * `keepAliveTimeout` (tài liệu Node).
 */
export const KEEP_ALIVE_TIMEOUT_MS = 65_000;
export const HEADERS_TIMEOUT_MS = 66_000;

export function tuneServerTimeouts(server: Pick<Server, 'keepAliveTimeout' | 'headersTimeout'>) {
  server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;
  server.headersTimeout = HEADERS_TIMEOUT_MS;
  return server;
}
