import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';

export const APP_VERSION = '0.1.0';

export async function getHealth() {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Dịch vụ tạm thời không khả dụng');
  }
  return {
    status: 'ok' as const,
    db: 'up' as const,
    version: APP_VERSION,
    uptimeSec: Math.floor(process.uptime()),
    time: new Date().toISOString(),
  };
}
