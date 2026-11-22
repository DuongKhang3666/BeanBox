import { createApp } from './app.js';
import { env } from './config/env.js';
import { startBackgroundJobs } from './jobs/cleanup.js';
import { logger } from './lib/logger.js';
import { loadLocations } from './modules/locations/locations.data.js';
import { disconnectPrisma } from './lib/prisma.js';

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

const stopJobs = env.JOBS_ENABLED ? startBackgroundJobs() : () => undefined;

async function shutdown(signal: string) {
  logger.info(`Nhận ${signal}, đang tắt...`);
  stopJobs();
  server.close(async () => {
    await disconnectPrisma();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
