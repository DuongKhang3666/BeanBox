import type { Role } from '@prisma/client';

export interface UserDto {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  birthDate: string | null;
  avatarUrl: string | null;
  role: Role;
  emailVerified: boolean;
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
    createdAt: user.createdAt.toISOString(),
  };
}
