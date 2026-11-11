/** Biến môi trường dùng chung cho test. DB test luôn tách khỏi DB dev. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://beanbox:beanbox@localhost:5432/beanbox_test';

export function applyTestEnv(): void {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.JWT_ACCESS_SECRET = 'test-only-secret-0123456789abcdefghij';
  process.env.INTERNAL_API_SECRET = 'test-internal-secret-0123456789abcdefghij';
  process.env.FRONTEND_ORIGINS = 'http://localhost:3000';
  process.env.LOG_LEVEL = 'silent';
  // Thanh toán online luôn tắt mặc định trong test (dotenv không ghi đè biến đã đặt, kể cả rỗng);
  // test cần bật thì tiêm paymentConfig giả qua createApp().
  for (const k of [
    'VNPAY_TMN_CODE',
    'VNPAY_HASH_SECRET',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
  ]) {
    process.env[k] = '';
  }
}
