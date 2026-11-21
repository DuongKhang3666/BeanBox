import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * Prisma 7 bắt buộc driver adapter. Pool `pg` tối đa `DATABASE_POOL_MAX` kết nối (mặc định 10,
 * như mặc định của pg; Prisma 6: num_cpus*2+1).
 * `connectionTimeoutMillis` = 5 giây như timeout lấy kết nối của Prisma 6 (pg mặc định 0 = chờ vô hạn).
 */
export const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
    max: env.DATABASE_POOL_MAX,
  }),
});

/**
 * Client thứ hai CHỈ cho truy vấn của module phân tích (D-058): pool riêng nhỏ (`ANALYTICS_POOL_MAX`)
 * để truy vấn nặng không chiếm hết kết nối của luồng đặt hàng, và `statement_timeout` ở mức kết nối
 * (tham số `statement_timeout` của pg, gửi ngay lúc bắt tay) để truy vấn quá lâu bị Postgres hủy (mã 57014).
 * Cả hai client trỏ cùng một DB; kết nối được mở lười nên không tốn gì khi chưa dùng.
 */
export const analyticsPrisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
    max: env.ANALYTICS_POOL_MAX,
    statement_timeout: env.ANALYTICS_STATEMENT_TIMEOUT_MS,
  }),
});

/** Đóng cả hai client (shutdown). */
export async function disconnectPrisma(): Promise<void> {
  await Promise.all([prisma.$disconnect(), analyticsPrisma.$disconnect()]);
}
