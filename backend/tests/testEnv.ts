/** Biến môi trường dùng chung cho test. DB test luôn tách khỏi DB dev. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://beanbox:beanbox@localhost:5432/beanbox_test';

export function applyTestEnv(): void {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.JWT_ACCESS_SECRET = 'test-only-secret-0123456789abcdefghij';
  process.env.FRONTEND_ORIGINS = 'http://localhost:3000';
  process.env.LOG_LEVEL = 'silent';
}
