import { jwtVerify, SignJWT } from 'jose';
import type { Role } from '@logisticai/shared';

const encode = (secret: string) => new TextEncoder().encode(secret);

export interface UserClaims {
  sub: string;
  role: Role;
}

export async function signUserToken(user: { id: string; role: Role }, secret: string, expiresIn: string): Promise<string> {
  return new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(encode(secret));
}

export async function verifyUserToken(token: string, secret: string): Promise<UserClaims> {
  const { payload } = await jwtVerify(token, encode(secret), { algorithms: ['HS256'] });
  return { sub: payload.sub as string, role: payload.role as Role };
}

// JWT di servizio per il data agent (verificato da data_agent/auth.py).
export const SERVICE_ISSUER = 'logisticai-backend';
export const SERVICE_AUDIENCE = 'data-agent';

export async function signServiceToken(userId: string, requestId: string, secret: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(SERVICE_ISSUER)
    .setAudience(SERVICE_AUDIENCE)
    .setSubject(userId)
    .setJti(requestId)
    .setIssuedAt()
    .setExpirationTime('60s')
    .sign(encode(secret));
}
