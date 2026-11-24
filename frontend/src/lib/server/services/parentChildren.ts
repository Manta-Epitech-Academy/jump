import { error } from '@sveltejs/kit';
import type { Prisma } from '@prisma/client';
import { prisma } from '#lib/server/db.ts';

/**
 * A guardian's child, found by id among the talents whose guardian address is
 * the one the guardian signed in with, or `null`. One query, where the parent
 * pages used to read any talent by id and compare its `parentEmail` afterwards,
 * each page in its own words.
 */
export async function findOwnChild<S extends Prisma.TalentSelect>(
  parentEmail: string,
  talentId: string,
  select: S,
): Promise<Prisma.TalentGetPayload<{ select: S }> | null> {
  return (await prisma.talent.findFirst({
    where: { id: talentId, parentEmail },
    select,
  })) as Prisma.TalentGetPayload<{ select: S }> | null;
}

/** {@link findOwnChild}, or a 403: a signature names a child of somebody else. */
export async function requireOwnChild<S extends Prisma.TalentSelect>(
  parentEmail: string,
  talentId: string,
  select: S,
): Promise<Prisma.TalentGetPayload<{ select: S }>> {
  const child = await findOwnChild(parentEmail, talentId, select);
  if (!child) throw error(403, 'Accès non autorisé pour cet enfant.');
  return child;
}
