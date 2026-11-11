import type { Address, Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { toUserDto, type UserDto } from '../../lib/userDto.js';
import { resolveLocation } from '../locations/locations.data.js';
import type { CreateAddressInput, UpdateAddressInput, UpdateProfileInput } from './me.schema.js';

export const MAX_ADDRESSES = 10;

export interface AddressDto {
  id: string;
  fullName: string;
  phone: string;
  provinceCode: string;
  provinceName: string;
  wardCode: string;
  wardName: string;
  line1: string;
  isDefault: boolean;
  createdAt: string;
}

export function toAddressDto(a: Address): AddressDto {
  return {
    id: a.id,
    fullName: a.fullName,
    phone: a.phone,
    provinceCode: a.provinceCode,
    provinceName: a.provinceName,
    wardCode: a.wardCode,
    wardName: a.wardName,
    line1: a.line1,
    isDefault: a.isDefault,
    createdAt: a.createdAt.toISOString(),
  };
}

const notFound = () => new AppError(404, 'NOT_FOUND', 'Không tìm thấy địa chỉ');

export async function getProfile(userId: string): Promise<UserDto> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Phiên đăng nhập đã hết hạn');
  return toUserDto(user);
}

export async function updateProfile(userId: string, input: UpdateProfileInput): Promise<UserDto> {
  const data: Prisma.UserUpdateInput = {};
  if (input.fullName !== undefined) data.fullName = input.fullName;
  if (input.phone !== undefined) data.phone = input.phone;
  if (input.birthDate !== undefined) data.birthDate = input.birthDate;
  if (input.avatarUrl !== undefined) data.avatarUrl = input.avatarUrl;
  const user = await prisma.user.update({ where: { id: userId }, data });
  return toUserDto(user);
}

/** Tuần tự hóa mọi thao tác ghi địa chỉ của cùng một user bằng khóa dòng User. */
async function withUserLock<T>(
  userId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    return fn(tx);
  });
}

/** Bỏ mặc định cũ TRƯỚC khi đặt mặc định mới (partial unique index). */
async function clearDefault(tx: Prisma.TransactionClient, userId: string, exceptId?: string) {
  await tx.address.updateMany({
    where: { userId, isDefault: true, ...(exceptId ? { id: { not: exceptId } } : {}) },
    data: { isDefault: false },
  });
}

export async function listAddresses(userId: string): Promise<AddressDto[]> {
  const rows = await prisma.address.findMany({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
  });
  return rows.map(toAddressDto);
}

export async function createAddress(
  userId: string,
  input: CreateAddressInput,
): Promise<AddressDto> {
  return withUserLock(userId, async (tx) => {
    const loc = resolveLocation(input.provinceCode, input.wardCode);
    const count = await tx.address.count({ where: { userId } });
    if (count >= MAX_ADDRESSES) {
      throw new AppError(409, 'ADDRESS_LIMIT_REACHED', 'Bạn chỉ lưu được tối đa 10 địa chỉ');
    }
    const makeDefault = count === 0 || input.isDefault === true;
    if (makeDefault) await clearDefault(tx, userId);
    const created = await tx.address.create({
      data: {
        userId,
        fullName: input.fullName,
        phone: input.phone,
        ...loc,
        line1: input.line1,
        isDefault: makeDefault,
      },
    });
    return toAddressDto(created);
  });
}

export async function updateAddress(
  userId: string,
  id: string,
  input: UpdateAddressInput,
): Promise<AddressDto> {
  return withUserLock(userId, async (tx) => {
    const existing = await tx.address.findFirst({ where: { id, userId } });
    if (!existing) throw notFound(); // quyền sở hữu trước, đối chiếu danh mục sau
    // Chỉ gửi wardCode: phường phải thuộc tỉnh hiện tại của địa chỉ.
    const loc =
      input.wardCode !== undefined
        ? resolveLocation(input.provinceCode ?? existing.provinceCode, input.wardCode)
        : undefined;
    const makeDefault = input.isDefault === true;
    if (makeDefault) await clearDefault(tx, userId, id);
    const updated = await tx.address.update({
      where: { id },
      data: {
        ...loc,
        ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.line1 !== undefined ? { line1: input.line1 } : {}),
        ...(makeDefault ? { isDefault: true } : {}),
      },
    });
    return toAddressDto(updated);
  });
}

export async function deleteAddress(userId: string, id: string): Promise<void> {
  await withUserLock(userId, async (tx) => {
    const existing = await tx.address.findFirst({ where: { id, userId } });
    if (!existing) throw notFound();
    await tx.address.delete({ where: { id } });
    if (existing.isDefault) {
      const next = await tx.address.findFirst({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
    }
  });
}

export async function setDefaultAddress(userId: string, id: string): Promise<AddressDto> {
  return withUserLock(userId, async (tx) => {
    const existing = await tx.address.findFirst({ where: { id, userId } });
    if (!existing) throw notFound();
    if (existing.isDefault) return toAddressDto(existing);
    await clearDefault(tx, userId, id);
    const updated = await tx.address.update({ where: { id }, data: { isDefault: true } });
    return toAddressDto(updated);
  });
}
