import { prisma } from '$lib/server/db';

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const SIGN_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

export async function storeParentOtp(email: string, otp: string) {
  // Upsert: replace any existing OTP for this email
  await prisma.parentToken.deleteMany({ where: { email, type: 'otp' } });
  await prisma.parentToken.create({
    data: {
      email,
      talentId: '',
      type: 'otp',
      value: otp,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });
}

export async function consumeParentOtp(email: string): Promise<string | null> {
  const token = await prisma.parentToken.findFirst({
    where: { email, type: 'otp', expiresAt: { gt: new Date() } },
  });
  if (!token) return null;
  await prisma.parentToken.delete({ where: { id: token.id } });
  return token.value;
}

export async function createSignToken(
  talentId: string,
  email: string,
): Promise<string> {
  const value = crypto.randomUUID();
  await prisma.parentToken.create({
    data: {
      email,
      talentId,
      type: 'sign',
      value,
      expiresAt: new Date(Date.now() + SIGN_TOKEN_TTL_MS),
    },
  });
  return value;
}

export async function verifySignToken(
  signToken: string,
  talentId: string,
): Promise<boolean> {
  const token = await prisma.parentToken.findFirst({
    where: {
      value: signToken,
      type: 'sign',
      talentId,
      expiresAt: { gt: new Date() },
    },
  });
  if (!token) return false;
  // Consume token (single use)
  await prisma.parentToken.delete({ where: { id: token.id } });
  return true;
}

/** Cleanup expired tokens (can be called periodically) */
export async function cleanupExpiredTokens() {
  await prisma.parentToken.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
}
