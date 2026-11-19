import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 không tự nạp .env (đã import dotenv ở trên; dotenv không ghi đè biến đã có trong môi trường).
 * Không dùng helper env() vì nó ném lỗi khi thiếu biến, mà `prisma generate` (Docker build, CI) không cần DB.
 * Lệnh cần DB (migrate...) sẽ báo lỗi rõ ràng của Prisma khi URL rỗng.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
    ...(process.env.SHADOW_DATABASE_URL
      ? { shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL }
      : {}),
  },
});
