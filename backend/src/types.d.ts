import type { Role } from './generated/prisma/client.js';

declare global {
  namespace Express {
    interface Request {
      id: string;
      auth?: { userId: string; role: Role; sessionId: string; twoFactorEnabled: boolean };
    }
  }
}
export {};
