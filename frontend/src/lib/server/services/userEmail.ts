import { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import { isParentOrStaffEmail } from '$lib/server/auth/emailIdentity';

/**
 * Raised when a login email can't be moved onto `newEmail`: either the address
 * belongs to a parent/staff account (never adopt it as a student login) or
 * another account already holds it (a Salesforce inversion, or an orphan the
 * student made by signing in directly). The caller decides what to do: leave
 * it for the admin auth-conflicts tool, log it, etc. `changeUserEmail` never
 * force-moves an identity.
 */
export class EmailChangeConflict extends Error {
  constructor(
    readonly kind: 'parent_or_staff' | 'holder',
    message: string,
  ) {
    super(message);
    this.name = 'EmailChangeConflict';
  }
}

/**
 * The single write path for a login account's email (`bauth_user.email`), the
 * source of truth for who a person signs in as. Renames the account to
 * `newEmail`, refusing to move it onto a parent/staff address and surfacing a
 * unique-collision as a typed `EmailChangeConflict`. No-op when already aligned.
 *
 * Centralises what used to be reimplemented across `ensureTalentUser`, the
 * Salesforce sync and the admin repair tool: one guard, one rename, one place a
 * collision is raised.
 */
export async function changeUserEmail(
  userId: string,
  newEmail: string,
): Promise<void> {
  const wanted = newEmail.toLowerCase().trim();
  if (!wanted) throw new Error('changeUserEmail: email vide.');

  const { email: current } = await prisma.bauth_user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true },
  });
  if (wanted === current.toLowerCase().trim()) return;

  // Bad-data guard: an address owned by a parent/staff account is never a
  // student's login. Renaming onto it would steal that identity.
  if (await isParentOrStaffEmail(wanted)) {
    throw new EmailChangeConflict(
      'parent_or_staff',
      `L'adresse "${wanted}" appartient à un compte parent ou staff.`,
    );
  }

  try {
    await prisma.bauth_user.update({
      where: { id: userId },
      data: { email: wanted },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new EmailChangeConflict(
        'holder',
        `L'adresse "${wanted}" est déjà utilisée par un autre compte.`,
      );
    }
    throw err;
  }
}
