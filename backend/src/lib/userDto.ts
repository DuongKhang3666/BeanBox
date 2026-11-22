import { env } from '../config/env.js';
import type { Role } from '../generated/prisma/client.js';

export interface UserDto {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  birthDate: string | null;
  avatarUrl: string | null;
  role: Role;
  emailVerified: boolean;
  /** D-063: đã bật xác thực 2 lớp (chỉ cờ, không lộ gì khác). */
  twoFactorEnabled: boolean;
  /** D-070: true khi REQUIRE_ADMIN_2FA bật, user là ADMIN và chưa bật 2FA (/admin/* sẽ trả 403). */
  twoFactorRequired: boolean;
  createdAt: string;
}

/** Các cột User được phép đọc ra DTO (cố ý không gồm passwordHash, failedLoginCount, lockedUntil, status). */
export interface UserDtoSource {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  birthDate: Date | null;
  avatarUrl: string | null;
  role: Role;
  emailVerifiedAt: Date | null;
  twoFactorEnabledAt: Date | null;
  createdAt: Date;
}

/** Shape User theo api-contract §5. Dùng whitelist, không spread để không rò thêm trường. */
export function toUserDto(user: UserDtoSource): UserDto {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    birthDate: user.birthDate ? user.birthDate.toISOString().slice(0, 10) : null,
    avatarUrl: user.avatarUrl,
    role: user.role,
    emailVerified: user.emailVerifiedAt !== null,
    twoFactorEnabled: user.twoFactorEnabledAt !== null,
    twoFactorRequired:
      env.REQUIRE_ADMIN_2FA && user.role === 'ADMIN' && user.twoFactorEnabledAt === null,
    createdAt: user.createdAt.toISOString(),
  };
}
