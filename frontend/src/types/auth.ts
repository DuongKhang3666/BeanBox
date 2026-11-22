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
  /** D-063: đã bật xác thực 2 lớp. */
  twoFactorEnabled: boolean;
  createdAt: string;
}

/** Payload của register / login / refresh. */
export interface Session {
  user: User;
  accessToken: string;
  /** Giây */
  expiresIn: number;
}

/** Bước 1 của đăng nhập khi tài khoản bật 2FA (§5.2): chưa có phiên, chưa có cookie. */
export interface TwoFactorChallenge {
  twoFactorRequired: true;
  challengeToken: string;
  /** ISO; thử thách sống 5 phút. */
  expiresAt: string;
}

export type LoginResult = Session | TwoFactorChallenge;

export function isTwoFactorChallenge(r: LoginResult): r is TwoFactorChallenge {
  return "twoFactorRequired" in r && r.twoFactorRequired === true;
}

/** POST /me/2fa/setup (§6.4). `secret` chỉ trả một lần. */
export interface TwoFactorSetup {
  secret: string;
  otpauthUri: string;
  qrDataUrl: string;
}

export interface MessageResult {
  message: string;
}
