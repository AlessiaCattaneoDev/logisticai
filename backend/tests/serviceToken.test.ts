// Il formato deve combaciare con data_agent/auth.py (ISSUER, AUDIENCE, HS256, TTL breve).
import { decodeJwt, decodeProtectedHeader } from 'jose';
import { describe, expect, it } from 'vitest';
import { signServiceToken } from '../src/auth/tokens';

describe('JWT di servizio per il data agent', () => {
  it('ha iss, aud, sub, jti e scade in 60 secondi', async () => {
    const token = await signServiceToken('user-1', 'req-1', 's'.repeat(40));
    expect(decodeProtectedHeader(token).alg).toBe('HS256');
    const claims = decodeJwt(token);
    expect(claims).toMatchObject({ iss: 'logisticai-backend', aud: 'data-agent', sub: 'user-1', jti: 'req-1' });
    expect(claims.exp! - claims.iat!).toBe(60);
  });
});
