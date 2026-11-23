/** Rào chạy seed nhiều (D-084). Hàm thuần; thông báo lỗi KHÔNG in mật khẩu. */

type RichEnv = Readonly<Record<string, string | undefined>>;

/** Trả danh sách lỗi (rỗng = được phép chạy). Seed nhiều bị từ chối hoàn toàn khi NODE_ENV=production. */
export function checkRichSeedAllowed(env: RichEnv): string[] {
  const errors: string[] = [];
  if (env.NODE_ENV === 'production') {
    errors.push('seed:rich bị từ chối khi NODE_ENV=production (dữ liệu mẫu chỉ dành cho dev/demo)');
  }
  const pw = env.SEED_CUSTOMER_PASSWORD;
  if (!pw) {
    errors.push('Thiếu biến môi trường SEED_CUSTOMER_PASSWORD');
  } else if (pw.length < 8 || pw.length > 72 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) {
    errors.push('SEED_CUSTOMER_PASSWORD phải dài 8-72 ký tự, có cả chữ và số');
  }
  return errors;
}
