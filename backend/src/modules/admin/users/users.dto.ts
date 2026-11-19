import type { Role, UserStatus } from '../../../generated/prisma/client.js';

/** `select` tường minh: không bao giờ lấy passwordHash hay token. */
export const USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  role: true,
  status: true,
  emailVerifiedAt: true,
  lastLoginAt: true,
  lockedUntil: true,
  createdAt: true,
  _count: { select: { orders: true } },
} as const;

export interface UserRow {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: Role;
  status: UserStatus;
  emailVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  lockedUntil: Date | null;
  createdAt: Date;
  _count: { orders: number };
}

export interface AdminUserItem {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: Role;
  status: UserStatus;
  emailVerified: boolean;
  lastLoginAt: string | null;
  lockedUntil: string | null;
  createdAt: string;
  orderCount: number;
}

export function toUserItem(u: UserRow): AdminUserItem {
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    phone: u.phone,
    role: u.role,
    status: u.status,
    emailVerified: u.emailVerifiedAt !== null,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    lockedUntil: u.lockedUntil?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
    orderCount: u._count.orders,
  };
}
