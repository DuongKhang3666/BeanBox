import { createApp } from './app.js';
import { env } from './config/env.js';
import { startBackgroundJobs, stopBackgroundJobs } from './jobs/cleanup.js';
import { logger } from './lib/logger.js';
import { loadLocations } from './modules/locations/locations.data.js';
import { disconnectPrisma } from './lib/prisma.js';
import { tuneServerTimeouts } from './lib/serverTimeouts.js';
import { createShutdown, installProcessHandlers } from './lib/shutdown.js';

const app = createApp();
if (env.PAYMENT_MOCKS_ENABLED) {
  logger.warn(
    'PAYMENT_MOCKS_ENABLED=true: VNPay/MoMo là cổng thanh toán GIẢ LẬP (chỉ dùng demo, không trừ tiền thật).',
  );
  if (env.PAYMENT_MOCK_SECRET_GENERATED) {
    logger.warn(
      'PAYMENT_MOCK_SECRET chưa đặt: đã sinh khóa ngẫu nhiên cho lần chạy này (liên kết cổng giả cũ sẽ hết hiệu lực khi khởi động lại).',
    );
  }
}
const locations = loadLocations();
logger.info(
  `Đã nạp danh mục hành chính: ${locations.provinceCount} tỉnh/thành, ${locations.wardCount} phường/xã`,
);
const server = app.listen(env.PORT, env.HOST, () => {
  logger.info(`BeanBox API lắng nghe tại ${env.HOST}:${env.PORT}`);
});

tuneServerTimeouts(server);
if (env.JOBS_ENABLED) startBackgroundJobs();

// D-079: tắt êm đúng một lần; lỗi cấp tiến trình cũng đi qua đây (exit 1).
const shutdown = createShutdown({
  closeServer: () =>
    new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    }),
  closeIdleConnections: () => server.closeIdleConnections(),
  stopJobs: stopBackgroundJobs,
  disconnect: disconnectPrisma,
  exit: (code) => process.exit(code),
  log: logger,
  timeoutMs: env.SHUTDOWN_TIMEOUT_MS,
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (h) => clearTimeout(h as NodeJS.Timeout),
});
installProcessHandlers(process, shutdown, logger);
