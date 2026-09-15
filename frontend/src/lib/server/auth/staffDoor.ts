import { prisma } from '$lib/server/db';

/**
 * Undo a staff sign-in that `staff/oauth/callback` is about to refuse, without
 * ever destroying an identity the door did not create.
 *
 * BetterAuth resolves the Microsoft door onto a `bauth_user` before Jump gets to
 * say whether the person is staff, and `accountLinking` lets it resolve onto a
 * row that already existed. So by the time the callback decides to refuse, it is
 * holding one of two very different things: a row BetterAuth minted for this
 * sign-in and nobody will ever want again, or somebody's existing identity that
 * the door merely linked onto.
 *
 * The callback used to delete both, and that is correct for the first and
 * destructive for the second. `Talent.userId` is `onDelete: SetNull`, so
 * deleting the row a talent signs in with detaches the talent from their account
 * with no trace; deleting a legal guardian's row ends the parent portal for them
 * until onboarding re-provisions it, which for a dossier already walked is
 * never. Both are reachable rather than theoretical, and the reason is worth
 * keeping because it reads the other way round at first glance: the local
 * `emailVerified` that BetterAuth's link test consults is `true` for every
 * guardian (`ensureParentAccount` and `changeParentEmail` both write it) and
 * becomes `true` for a talent the first time they use the OTP door (BetterAuth
 * promotes an unverified row inside `sign-in/email-otp`). Only a row that has
 * never authenticated still carries `false`. The link test is therefore not what
 * protects those identities, whatever it looks like from the refusal it
 * produces: this is.
 *
 * So the rule is ownership, and it is deliberately not the refusal's reason. A
 * row that is somebody's identity is RELEASED: the link this sign-in made and
 * the session it minted go away, the identity stays. Only a row carrying no
 * identity of its own is deleted, and the branches are ordered so that a lookup
 * finding nothing releases rather than deletes.
 *
 * Releasing the link is the half that is easy to drop and should not be: left
 * behind, it makes a guardian's or a talent's account reachable through the
 * staff Microsoft door for good, which is exactly the disjoint-doors rule this
 * directory's `CLAUDE.md` opens on.
 */
export async function discardStaffSignIn(
  userId: string,
  sessionId: string,
): Promise<void> {
  const user = await prisma.bauth_user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      talent: { select: { id: true } },
      staffProfile: { select: { id: true } },
    },
  });

  // A `StaffProfile` counts even though the callers only reach here when the
  // profile carries no role: somebody provisioned that row, so it is not the
  // door's to discard. It is the domain refusal that meets one, when a member's
  // tenant address stops ending in `@epitech.eu`.
  const carriesAnIdentity =
    !user ||
    user.talent !== null ||
    user.staffProfile !== null ||
    user.role === 'parent';

  if (!carriesAnIdentity) {
    // `bauth_account.user` and `bauth_session.user` are both `onDelete: Cascade`,
    // so this takes the link and the session with it.
    await prisma.bauth_user.delete({ where: { id: userId } });
    return;
  }

  await prisma.$transaction([
    prisma.bauth_account.deleteMany({
      where: { userId, providerId: 'microsoft' },
    }),
    // This session only, not every session the person holds: a guardian reading
    // the parent portal in another tab has done nothing wrong.
    prisma.bauth_session.deleteMany({ where: { id: sessionId } }),
  ]);
}
