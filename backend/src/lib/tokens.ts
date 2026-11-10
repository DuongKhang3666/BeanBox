import { createHash, randomBytes } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';
import { env } from '../config/env.js';

export const ACCESS_TOKEN_ISSUER = 'beanbox-api';
export const ACCESS_TOKEN_AUDIENCE = 'beanbox-web';

export const generateOpaqueToken = (): string => randomBytes(32).toString('base64url');

export const sha256Hex = (s: string): string => createHash('sha256').update(s).digest('hex');

const payloadSchema = z.object({
  sub: z.string().min(1),
  role: z.enum(['CUSTOMER', 'STAFF', 'ADMIN']),
  sid: z.string().min(1),
});
export type AccessClaims = z.infer<typeof payloadSchema>;

const key = () => new TextEncoder().encode(env.JWT_ACCESS_SECRET);

export function signAccessToken(claims: AccessClaims): Promise<string> {
  return new SignJWT({ role: claims.role, sid: claims.sid })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuer(ACCESS_TOKEN_ISSUER)
    .setAudience(ACCESS_TOKEN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${env.accessTokenTtlSec}s`)
    .sign(key());
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, key(), {
    algorithms: ['HS256'],
    issuer: ACCESS_TOKEN_ISSUER,
    audience: ACCESS_TOKEN_AUDIENCE,
  });
  return payloadSchema.parse(payload);
}
