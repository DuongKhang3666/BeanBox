/** Kiểu Auth theo docs/api-contract.md §5. */

export type UserRole = "CUSTOMER" | "STAFF" | "ADMIN";

export interface User {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  /** YYYY-MM-DD */
  birthDate: string | null;
  avatarUrl: string | null;
  role: UserRole;
  emailVerified: boolean;
  createdAt: string;
}

/** Payload của register / login / refresh. */
export interface Session {
  user: User;
  accessToken: string;
  /** Giây */
  expiresIn: number;
}

export interface MessageResult {
  message: string;
}
