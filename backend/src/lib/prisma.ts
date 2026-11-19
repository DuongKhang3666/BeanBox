import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * Prisma 7 bắt buộc driver adapter. Pool `pg` mặc định tối đa 10 kết nối (Prisma 6: num_cpus*2+1).
 * `connectionTimeoutMillis` = 5 giây như timeout lấy kết nối của Prisma 6 (pg mặc định 0 = chờ vô hạn).
 */
export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 5000 }),
});
