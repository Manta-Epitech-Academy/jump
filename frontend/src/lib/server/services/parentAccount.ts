import { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import { sendParentWelcomeEmail } from '$lib/server/otp';

/**
 * Change the email parent-1 of a talent signs in with.
 *
 * Why this isn't a one-line `Talent.parentEmail` update: the parent's login
 * identity is a separate `bauth_user` row keyed by a UNIQUE `email` (role
 * `parent`, minted at onboarding), and the parent portal authorises access by
 * matching `Talent.parentEmail === session.user.email`. Touch only one of the
 * two and the parent is locked out either way (the address they type no longer
 * has a parent account, or it logs in but matches no child). So the two move
 * together, in one transaction, with the same safety rails the reset path uses:
 *
 *   - never hijack a NON-parent account (a student's / staff's login) that
 *     already holds the new address → refuse;
 *   - never rename a parent account that a SIBLING still points at (shared
 *     address) → leave it and mint/point a separate one, so the sibling keeps
 *     their login;
 *   - the new address must differ from the student's own email (that would hand
 *     the parent the student's identity at login).
 *
 * When the new address already hosts a parent account (a sibling's, say), the
 * talent is pointed at it and the previous login is dropped if nothing else
 * references it — the same no-orphan rule the reset / anonymization paths follow
 * (see {@link findUnreferencedParentAccount}).
 *
 * Salesforce never writes parent fields, so there is no sync-clobber to guard
 * against (unlike Talent.email): the edit sticks.
 */

const norm = (v: string | null | undefined): string =>
  (v ?? '').trim().toLowerCase();

type ChangeAction = 'renamed' | 'created' | 'linked-existing' | 'noop';

export type ChangeParentEmailResult =
  | { ok: false; reason: 'same_as_student' | 'email_taken' }
  | { ok: true; changed: boolean; action: ChangeAction; welcomeSent: boolean };

export async function changeParentEmail(
  talentId: string,
  rawEmail: string,
  opts: { resendWelcome?: boolean } = {},
): Promise<ChangeParentEmailResult> {
  const newEmail = norm(rawEmail);

  const talent = await prisma.talent.findUniqueOrThrow({
    where: { id: talentId },
    select: {
      id: true,
      user: { select: { email: true } },
      prenom: true,
      parentEmail: true,
      parentNom: true,
      parentPrenom: true,
    },
  });

  // Refuse the student's own address: a parent logging in there would resolve to
  // the talent identity, and provisioning refuses to repurpose it anyway.
  if (newEmail && newEmail === norm(talent.user?.email ?? null)) {
    return { ok: false, reason: 'same_as_student' };
  }

  const oldEmail = norm(talent.parentEmail);
  if (newEmail === oldEmail) {
    // Address unchanged. Still honour an explicit "resend the link" so staff can
    // re-trigger the welcome without changing anything.
    const welcomeSent = opts.resendWelcome
      ? await trySendWelcome(newEmail, talent)
      : false;
    return { ok: true, changed: false, action: 'noop', welcomeSent };
  }

  // Inspect the target address. A non-parent owner (student/staff) is off-limits.
  const targetUser = await prisma.bauth_user.findUnique({
    where: { email: newEmail },
    select: { id: true, role: true },
  });
  if (targetUser && targetUser.role !== 'parent') {
    return { ok: false, reason: 'email_taken' };
  }

  // The current parent login, and whether the old address is shared by a sibling
  // (so we must not rename it out from under them).
  const currentUser = oldEmail
    ? await prisma.bauth_user.findUnique({
        where: { email: oldEmail },
        select: { id: true, role: true },
      })
    : null;
  const sharedOld = oldEmail
    ? (await prisma.talent.count({
        where: {
          id: { not: talentId },
          OR: [{ parentEmail: oldEmail }, { parent2Email: oldEmail }],
        },
      })) > 0
    : false;

  let action: ChangeAction;
  try {
    action = await prisma.$transaction(async (tx) => {
      await tx.talent.update({
        where: { id: talentId },
        data: { parentEmail: newEmail },
      });

      if (targetUser) {
        // A parent account already exists at the new address (e.g. a sibling's
        // already-correct parent). The talent now points at it (updated above);
        // drop the previous login if no one else still references it, so the
        // correction never strands an orphaned parent account.
        if (oldEmail) {
          const orphan = await findUnreferencedParentAccount(
            tx,
            oldEmail,
            talentId,
          );
          if (orphan) await deleteParentAccountCascade(tx, orphan.id);
        }
        return 'linked-existing';
      }
      if (currentUser?.role === 'parent' && !sharedOld) {
        // Sole owner of the old address → rename the login in place so any
        // existing session/identity carries over to the corrected email.
        await tx.bauth_user.update({
          where: { id: currentUser.id },
          data: { email: newEmail },
        });
        return 'renamed';
      }
      // No reusable account (never provisioned, or the old one is shared and must
      // stay) → mint a fresh verified parent login at the new address.
      await tx.bauth_user.create({
        data: {
          email: newEmail,
          role: 'parent',
          emailVerified: true,
          name:
            `${talent.parentPrenom ?? ''} ${talent.parentNom ?? ''}`.trim() ||
            null,
        },
      });
      return 'created';
    });
  } catch (err) {
    // Lost a race on the unique email (a concurrent provision landed first).
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      return { ok: false, reason: 'email_taken' };
    }
    throw err;
  }

  const welcomeSent = opts.resendWelcome
    ? await trySendWelcome(newEmail, talent)
    : false;
  return { ok: true, changed: true, action, welcomeSent };
}

/**
 * Send the parent welcome (passwordless fastlogin link) to the corrected
 * address. Best-effort: the address change has already committed, so a mail
 * failure is reported but never rolls it back.
 */
async function trySendWelcome(
  email: string,
  talent: { id: string; prenom: string; parentNom: string | null },
): Promise<boolean> {
  try {
    await sendParentWelcomeEmail(
      email,
      talent.parentNom ?? '',
      talent.prenom,
      talent.id,
    );
    return true;
  } catch (err) {
    console.error('[changeParentEmail] welcome email failed', err);
    return false;
  }
}

/**
 * The parent-login lifecycle keeps one invariant: no parent `bauth_user` row
 * outlives the last talent that points at it. Three flows can sever that final
 * pointer — a full reset to import, an RGPD anonymization, and a parent-email
 * correction — and each must apply the SAME guard before touching the account,
 * or a drifting copy risks clobbering a sibling's shared login or a staff /
 * student account that merely happens to hold the address. This is that single
 * guard: it returns the parent account safe to act on, or `null`.
 *
 *   - `null` while a *sibling* still references the address (a shared parent),
 *     so the login another talent depends on is never touched;
 *   - `null` unless the row's role is `parent`: a student / staff account that
 *     happens to hold the email is off-limits (it can also carry blocking FK
 *     rows like authored tickets that would trip a hard delete).
 *
 * `excludeTalentId` is the talent whose pointer just moved away; its own row is
 * excluded from the reference count. Call inside the transaction that runs the
 * action which follows (delete or scrub).
 */
export async function findUnreferencedParentAccount(
  tx: Prisma.TransactionClient,
  email: string,
  excludeTalentId: string,
): Promise<{ id: string } | null> {
  const stillReferenced = await tx.talent.count({
    where: {
      id: { not: excludeTalentId },
      OR: [{ parentEmail: email }, { parent2Email: email }],
    },
  });
  if (stillReferenced > 0) return null;

  const parentUser = await tx.bauth_user.findUnique({
    where: { email },
    select: { id: true, role: true },
  });
  if (!parentUser || parentUser.role !== 'parent') return null;
  return { id: parentUser.id };
}

/**
 * Hard-delete a parent `bauth_user` along with its BetterAuth session / account
 * rows (which don't cascade at the DB level). Only ever call with an id from
 * {@link findUnreferencedParentAccount}, which proves the row is a parent login
 * no other talent references. Call inside a transaction.
 */
export async function deleteParentAccountCascade(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  await tx.bauth_session.deleteMany({ where: { userId } });
  await tx.bauth_account.deleteMany({ where: { userId } });
  await tx.bauth_user.delete({ where: { id: userId } });
}
