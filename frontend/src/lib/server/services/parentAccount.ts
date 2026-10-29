import { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import { sendParentWelcomeEmail } from '$lib/server/otp';
import { isStaffEmailAddress } from '$lib/domain/staff';
import { lockTalent } from './onboardingYearService';

const norm = (v: string | null | undefined): string =>
  (v ?? '').trim().toLowerCase();

export type SetParentLoginResult =
  | { ok: false; reason: 'email_taken' | 'staff_address' }
  | { ok: true; changed: boolean };

/**
 * Point a talent's parent 1 at `next.email` and keep the parent login in step:
 * the only writer of `Talent.parentEmail`, shared by the wizard's parents step
 * and the admin correction, in the caller's transaction.
 *
 * Why this isn't a one-line `Talent.parentEmail` update: the parent's login
 * identity is a separate `bauth_user` row keyed by a UNIQUE `email` (role
 * `parent`, verified), and the parent portal authorises access by matching
 * `Talent.parentEmail === session.user.email`. Touch only one of the two and
 * the parent is locked out either way (the address they type has no parent
 * account, or it logs in but matches no child).
 *
 *   - An address held by a NON-parent login (a student's, a staff member's) is
 *     refused: one email is one account with one role, and repurposing theirs
 *     would hand this talent's guardian their identity.
 *   - A staff address is refused even with no login behind it yet: a member
 *     invited but not yet signed in has none, and a parent login minted on
 *     their address is a row the staff door then refuses to turn into staff
 *     (`auth/staffDoor.ts`), locking them out of Jump on a talent's typing.
 *   - An address that already hosts a parent login (a sibling's parent) is
 *     joined as it stands. Its name is left alone: it belongs to the family that
 *     declared it first, and a talent typing someone else's address must not
 *     rewrite what that family's guardian is greeted with.
 *   - Otherwise a fresh login is minted under `next.name`.
 *   - The previous login is deleted, sessions included, once nothing else
 *     references it ({@link findUnreferencedParentAccount}). It is never renamed
 *     onto the new address: whoever held the old address may have opened a
 *     session from the welcome link (a typo lands it in a stranger's mailbox),
 *     and a rename would carry that session over to the corrected guardian's
 *     child. Deleting also keeps the wizard's back-and-forth from leaving a
 *     verified parent login behind every address a talent ever typed, each of
 *     which a later Salesforce import of that address then fails on
 *     (`ensureTalentUser` refuses to adopt a parent login).
 *
 * Unchanged address: the login is minted if it is missing, and its name is
 * refreshed only while this talent is the sole one pointing at it, so a
 * corrected spelling still propagates without one sibling overwriting another.
 *
 * Guardian acts already recorded (règlement co-signature, image-rights
 * decision) are not voided by an address change: they live in the dossier and
 * the decision ledger, and staff correct them there.
 *
 * The talent's row is locked before the current address is read
 * ({@link lockTalent}), so two changes of one talent's address serialize: the
 * second reads the address the first committed, and deletes the login the
 * first minted rather than leaving it unreferenced.
 *
 * Creating can lose a race on the unique email to a concurrent provision of the
 * same address (two siblings submitting at once), which aborts the caller's
 * transaction: map it with {@link isParentLoginRace} once the transaction has
 * rejected.
 */
export async function setParentLogin(
  tx: Prisma.TransactionClient,
  talentId: string,
  next: { email: string; name: string | null },
): Promise<SetParentLoginResult> {
  const newEmail = norm(next.email);
  if (isStaffEmailAddress(newEmail))
    return { ok: false, reason: 'staff_address' };
  await lockTalent(tx, talentId);
  const { parentEmail } = await tx.talent.findUniqueOrThrow({
    where: { id: talentId },
    select: { parentEmail: true },
  });
  const oldEmail = norm(parentEmail);

  const target = await tx.bauth_user.findUnique({
    where: { email: newEmail },
    select: { id: true, role: true },
  });
  if (target && target.role !== 'parent') {
    return { ok: false, reason: 'email_taken' };
  }

  if (!target) {
    await tx.bauth_user.create({
      data: {
        email: newEmail,
        role: 'parent',
        emailVerified: true,
        name: next.name,
      },
    });
  } else if (newEmail === oldEmail) {
    const soleLogin = await findUnreferencedParentAccount(
      tx,
      newEmail,
      talentId,
    );
    if (soleLogin) {
      await tx.bauth_user.update({
        where: { id: soleLogin.id },
        data: { name: next.name },
      });
    }
  }

  if (newEmail === oldEmail) return { ok: true, changed: false };

  await tx.talent.update({
    where: { id: talentId },
    data: { parentEmail: newEmail },
  });
  if (oldEmail) {
    const orphan = await findUnreferencedParentAccount(tx, oldEmail, talentId);
    if (orphan) await deleteParentAccountCascade(tx, orphan.id);
  }
  return { ok: true, changed: true };
}

/**
 * True when a transaction that ran {@link setParentLogin} rejected because a
 * concurrent provision took the address first: the caller answers it as
 * `email_taken`, the address being someone's now.
 */
export function isParentLoginRace(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
  );
}

export type ChangeParentEmailResult =
  | { ok: false; reason: 'same_as_student' | 'email_taken' | 'staff_address' }
  | { ok: true; changed: boolean; welcomeSent: boolean };

/**
 * The admin correction of parent 1's address ({@link setParentLogin}), with an
 * optional resend of the welcome link, also honoured on an unchanged address so
 * staff can re-trigger it without changing anything.
 *
 * Salesforce never writes parent fields, so there is no sync-clobber to guard
 * against (unlike Talent.email): the edit sticks.
 */
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
      parentNom: true,
      parentPrenom: true,
    },
  });

  // Refuse the student's own address: a parent logging in there would resolve to
  // the talent identity, and provisioning refuses to repurpose it anyway.
  if (newEmail && newEmail === norm(talent.user?.email ?? null)) {
    return { ok: false, reason: 'same_as_student' };
  }

  let change: SetParentLoginResult;
  try {
    change = await prisma.$transaction((tx) =>
      setParentLogin(tx, talentId, {
        email: newEmail,
        name:
          `${talent.parentPrenom ?? ''} ${talent.parentNom ?? ''}`.trim() ||
          null,
      }),
    );
  } catch (err) {
    if (isParentLoginRace(err)) return { ok: false, reason: 'email_taken' };
    throw err;
  }
  if (!change.ok) return change;

  const welcomeSent = opts.resendWelcome
    ? await trySendWelcome(newEmail, talent)
    : false;
  return { ok: true, changed: change.changed, welcomeSent };
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
 * pointer: a full reset to import, an RGPD anonymization, and a change of
 * parent 1's address ({@link setParentLogin}, from the wizard or an admin
 * correction), and each must apply the SAME guard before touching the account,
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
