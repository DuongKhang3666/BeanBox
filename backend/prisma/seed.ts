/* Entry seed dev: tài khoản, danh mục, thương hiệu, sản phẩm, setting, coupon. Dữ liệu nằm ở prisma/seed-data/. */
import 'dotenv/config';
import argon2 from 'argon2';
import { Prisma, PrismaClient, Role, CouponType } from '@prisma/client';
import { BRANDS, CATEGORIES } from './seed-data/catalog.js';
import { seedProducts } from './seed-data/seed-products.js';

const prisma = new PrismaClient();

function requirePassword(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Thiếu biến môi trường ${name}`);
  if (v.length < 8 || v.length > 72 || !/[A-Za-z]/.test(v) || !/\d/.test(v)) {
    throw new Error(`${name} phải dài 8-72 ký tự, có cả chữ và số`);
  }
  return v;
}

async function seedUsers() {
  const users: { email: string; fullName: string; role: Role; passwordVar: string }[] = [
    {
      email: 'admin@beanbox.local',
      fullName: 'Quản trị viên',
      role: 'ADMIN',
      passwordVar: 'SEED_ADMIN_PASSWORD',
    },
    {
      email: 'staff@beanbox.local',
      fullName: 'Nhân viên cửa hàng',
      role: 'STAFF',
      passwordVar: 'SEED_STAFF_PASSWORD',
    },
    {
      email: 'customer@beanbox.local',
      fullName: 'Khách hàng mẫu',
      role: 'CUSTOMER',
      passwordVar: 'SEED_CUSTOMER_PASSWORD',
    },
  ];
  for (const u of users) {
    const passwordHash = await argon2.hash(requirePassword(u.passwordVar), {
      type: argon2.argon2id,
    });
    const now = new Date();
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        passwordHash,
        fullName: u.fullName,
        role: u.role,
        status: 'ACTIVE',
        emailVerifiedAt: now,
      },
      create: {
        email: u.email,
        passwordHash,
        fullName: u.fullName,
        role: u.role,
        emailVerifiedAt: now,
      },
    });
  }
}

async function seedCategories() {
  let order = 0;
  for (const c of CATEGORIES) {
    const parent = await prisma.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, sortOrder: order, parentId: null },
      create: { slug: c.slug, name: c.name, sortOrder: order },
    });
    order += 1;
    let childOrder = 0;
    for (const ch of c.children ?? []) {
      await prisma.category.upsert({
        where: { slug: ch.slug },
        update: { name: ch.name, sortOrder: childOrder, parentId: parent.id },
        create: { slug: ch.slug, name: ch.name, sortOrder: childOrder, parentId: parent.id },
      });
      childOrder += 1;
    }
  }
}

async function seedBrands() {
  for (const b of BRANDS) {
    await prisma.brand.upsert({ where: { slug: b.slug }, update: { name: b.name }, create: b });
  }
}

const SETTINGS: Record<string, Prisma.InputJsonValue> = {
  'shipping.rates': {
    inner: { STANDARD: 20000, EXPRESS: 35000 },
    other: { STANDARD: 35000, EXPRESS: 55000 },
  },
  'shipping.innerCityProvinceCodes': ['01', '79'],
  'shipping.freeShippingThreshold': 500000,
  'shipping.weightSurcharge': { freeGram: 2000, stepGram: 1000, feePerStep: 5000 },
  'order.paymentExpiryMinutes': 15,
  'store.contact': { name: 'BeanBox', phone: '', email: 'hello@beanbox.local', address: '' },
  'home.banners': [],
};

async function seedSettings() {
  for (const [key, value] of Object.entries(SETTINGS)) {
    // Không ghi đè giá trị admin đã chỉnh: update rỗng
    await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value } });
  }
}

async function seedCoupons() {
  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const coupons: Prisma.CouponCreateInput[] = [
    {
      code: 'WELCOME10',
      description: 'Giảm 10% (tối đa 50.000đ) cho đơn từ 200.000đ',
      type: CouponType.PERCENT,
      value: 10,
      maxDiscount: 50000,
      minOrder: 200000,
    },
    {
      code: 'FREESHIP30',
      description: 'Giảm tối đa 30.000đ phí vận chuyển',
      type: CouponType.FREESHIP,
      value: 0,
      maxDiscount: 30000,
    },
    {
      code: 'GIAM50K',
      description: 'Giảm 50.000đ cho đơn từ 500.000đ',
      type: CouponType.FIXED,
      value: 50000,
      minOrder: 500000,
    },
    {
      code: 'HETHAN',
      description: 'Mã đã hết hạn (dùng để kiểm thử lỗi)',
      type: CouponType.FIXED,
      value: 20000,
      startsAt: new Date(now - 60 * day),
      endsAt: new Date(now - 30 * day),
    },
  ];
  for (const c of coupons) {
    const { code, ...rest } = c;
    await prisma.coupon.upsert({ where: { code }, update: rest, create: c });
  }
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seed bị từ chối khi NODE_ENV=production');
  }
  await seedUsers();
  await seedCategories();
  await seedBrands();
  const productCount = await seedProducts(prisma);
  await seedSettings();
  await seedCoupons();
  console.log('Seed hoàn tất: 3 tài khoản, danh mục, thương hiệu, setting, 4 coupon.');
  console.log('Đã seed ' + productCount + ' sản phẩm.');
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
