import type { AdminUserDetail, AdminUserItem } from "@/types/adminUsers";

export function makeAdminUserItem(over: Partial<AdminUserItem> = {}): AdminUserItem {
  return {
    id: "ckuser1",
    email: "khach@example.com",
    fullName: "Lê Khách Hàng",
    phone: "0901234567",
    role: "CUSTOMER",
    status: "ACTIVE",
    emailVerified: true,
    twoFactorEnabled: false,
    lastLoginAt: "2026-11-11T03:00:00.000Z",
    lockedUntil: null,
    deleted: false,
    createdAt: "2026-11-01T08:30:00.000Z",
    orderCount: 3,
    ...over,
  };
}

export function makeAdminUserDetail(over: Partial<AdminUserDetail> = {}): AdminUserDetail {
  return {
    ...makeAdminUserItem(),
    addressCount: 2,
    orders: {
      count: 3,
      paidTotal: 1250000,
      recent: [
        {
          code: "BB-261110-K7QP",
          status: "DELIVERED",
          grandTotal: 450000,
          createdAt: "2026-11-10T08:30:00.000Z",
        },
      ],
    },
    activeSessions: 1,
    ...over,
  };
}
