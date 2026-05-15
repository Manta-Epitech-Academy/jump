import { SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';
import { env } from '$env/dynamic/private';

export interface MintedJwt {
  token: string;
  jti: string;
}

export async function mintGameJwt(
  playerId: string,
  game: string,
  level: number,
): Promise<MintedJwt> {
  const secret = env.JUMP_GAMES_SECRET;
  if (!secret) {
    throw new Error('JUMP_GAMES_SECRET is not configured');
  }
  const key = new TextEncoder().encode(secret);
  const jti = randomUUID();
  const token = await new SignJWT({ playerId, game, level })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('intra')
    .setAudience('jump-games')
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 300)
    .sign(key);
  return { token, jti };
}
