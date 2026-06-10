import { prisma } from '$lib/server/db';

/**
 * True when `email` belongs to a parent contact or a staff / parent account —
 * an address a student's login identity must never be moved onto.
 *
 * Bad Salesforce data (a minor onboarded or synced with a parent's email in the
 * student record) must surface as a conflict to escalate, NOT be propagated into
 * the auth identity: renaming a student's `bauth_user` onto a parent's address
 * would hand that parent control of the student's dashboard and collide with the
 * parent's own login. Both the login path (`ensureTalentUser`) and the
 * Salesforce sync (`syncService`) gate their `bauth_user.email` realignment on
 * this, so the divergence instead shows up as PARENT_HOLDER / STAFF_HOLDER in
 * the admin auth-conflicts tool.
 *
 * A P2002 only catches an email that already has an account; a parent contact
 * email with no account yet would rename straight through without this check.
 */
export async function isParentOrStaffEmail(email: string): Promise<boolean> {
  const e = email.toLowerCase().trim();
  if (!e) return false;
  const [parentContact, staffOrParentAccount] = await Promise.all([
    prisma.talent.findFirst({
      where: {
        OR: [
          { parentEmail: { equals: e, mode: 'insensitive' } },
          { parent2Email: { equals: e, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    }),
    prisma.bauth_user.findFirst({
      where: {
        email: { equals: e, mode: 'insensitive' },
        OR: [{ staffProfile: { isNot: null } }, { role: 'parent' }],
      },
      select: { id: true },
    }),
  ]);
  return parentContact !== null || staffOrParentAccount !== null;
}
