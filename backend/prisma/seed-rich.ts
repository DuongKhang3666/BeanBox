/*
 * Seed "nhiều" cho demo/dev (D-084): `npm run seed:rich`. Chạy SAU `npm run prisma:seed`, CỘNG THÊM, idempotent,
 * không xóa dữ liệu. Tất định (PRNG mulberry32 theo khóa); chỉ ngày rang/sale/đơn/đánh giá tính tương đối theo
 * thời điểm chạy. Từ chối khi NODE_ENV=production. Chi tiết: docs/decisions.md D-084, docs/testing.md.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import argon2 from 'argon2';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { checkRichSeedAllowed } from './seed-data/rich/guard.js';
import { seedRich } from './seed-data/rich/seed-rich.js';

async function main() {
  const errors = checkRichSeedAllowed(process.env);
  if (errors.length > 0) throw new Error(errors.join('\n'));
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const started = Date.now();
  try {
    // Băm 1 lần, dùng chung cho mọi khách rich (đăng nhập bằng SEED_CUSTOMER_PASSWORD).
    const passwordHash = await argon2.hash(process.env.SEED_CUSTOMER_PASSWORD as string, {
      type: argon2.argon2id,
    });
    const s = await seedRich(prisma, { passwordHash });
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    console.log(
      `Seed nhiều hoàn tất trong ${seconds} giây (cộng thêm, idempotent, không xóa dữ liệu).`,
    );
    console.log(
      `  Sản phẩm rich: ${s.products} | danh mục con: ${s.categories} | thương hiệu: ${s.brands} | mã giảm giá: ${s.coupons}`,
    );
    console.log(`  Khách: ${s.customers} | địa chỉ: ${s.addresses} | wishlist: ${s.wishlist}`);
    console.log(
      `  Đơn: ${s.orders} (dòng hàng ${s.orderItems}, lịch sử ${s.statusHistory}, payment ${s.payments}, lượt dùng mã ${s.redemptions}, ghi chú ${s.orderNotes})`,
    );
    console.log(`  Đánh giá: ${s.reviews} | tin nhắn liên hệ: ${s.contacts}`);
    console.log(
      `  Bản ghi MỚI trong lần chạy này: ${s.inserted}${s.inserted === 0 ? ' (đã có đủ, không đổi gì)' : ''}`,
    );
    console.log('  Lưu ý: đơn lịch sử không trừ tồn kho thật (dữ liệu demo, không khớp sổ kho).');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
