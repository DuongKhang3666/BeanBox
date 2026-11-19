/** Kiểm tra điều kiện chạy seed (D-031). Hàm thuần; thông báo lỗi KHÔNG in mật khẩu. */

/** Giá trị mẫu trong backend/.env.example: cấm dùng ở production. */
export const SAMPLE_SEED_PASSWORDS: readonly string[] = [
  'Admin12345',
  'Staff12345',
  'Customer12345',
];

export const SEED_PASSWORD_VARS = [
  'SEED_ADMIN_PASSWORD',
  'SEED_STAFF_PASSWORD',
  'SEED_CUSTOMER_PASSWORD',
] as const;

export const PROD_MIN_PASSWORD_LENGTH = 12;

type SeedEnv = Readonly<Record<string, string | undefined>>;

/** Trả danh sách lỗi (rỗng = được phép chạy). Ngoài production luôn rỗng. */
export function checkSeedAllowed(env: SeedEnv): string[] {
  if (env.NODE_ENV !== 'production') return [];
  if (env.SEED_ALLOW_PRODUCTION !== 'true') {
    return [
      'Seed bị từ chối khi NODE_ENV=production (cần đặt SEED_ALLOW_PRODUCTION=true để cho phép)',
    ];
  }
  const errors: string[] = [];
  for (const name of SEED_PASSWORD_VARS) {
    const v = env[name];
    if (!v) {
      errors.push(`Thiếu biến môi trường ${name}`);
    } else if (v.length < PROD_MIN_PASSWORD_LENGTH || !/[A-Za-z]/.test(v) || !/\d/.test(v)) {
      errors.push(
        `${name} phải từ ${PROD_MIN_PASSWORD_LENGTH} ký tự trở lên, có cả chữ và số (production)`,
      );
    } else if (SAMPLE_SEED_PASSWORDS.includes(v)) {
      errors.push(`${name} đang dùng giá trị mẫu trong .env.example; hãy đặt mật khẩu riêng`);
    }
  }
  return errors;
}
