import { prisma } from '$lib/server/db';
import { randomBytes } from 'node:crypto';

const CODE_LENGTH = 6;
const CODE_EXPIRY_HOURS = 72;

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  const bytes = randomBytes(CODE_LENGTH);
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

export async function createParentCode(studentProfileId: string): Promise<string> {
  await prisma.parentAccessCode.updateMany({
    where: { studentProfileId, usedAt: null },
    data: { usedAt: new Date() },
  });

  const code = generateCode();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + CODE_EXPIRY_HOURS);

  await prisma.parentAccessCode.create({
    data: {
      code,
      studentProfileId,
      expiresAt,
    },
  });

  return code;
}

export async function verifyParentCode(code: string) {
  const record = await prisma.parentAccessCode.findUnique({
    where: { code },
    include: {
      studentProfile: {
        include: { user: true },
      },
    },
  });

  if (!record) return null;
  if (record.usedAt) return null;
  if (record.expiresAt < new Date()) return null;

  return record;
}

export async function markCodeUsed(codeId: string) {
  await prisma.parentAccessCode.update({
    where: { id: codeId },
    data: { usedAt: new Date() },
  });
}
