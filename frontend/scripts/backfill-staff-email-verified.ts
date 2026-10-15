/**
 * Set `bauth_user.emailVerified` on every account that holds a `StaffProfile`,
 * so a staff member can re-link their Microsoft identity after the v3 migration
 * `20260831120000_add_bauth_account_issuer` deleted every `bauth_account` row.
 *
 * The incident, because the fix reads as a no-op otherwise. That migration
 * deletes the OAuth links and states that `accountLinking.trustedProviders`
 * (which carries `microsoft`) recreates them on the member's next sign-in. It
 * does not. BetterAuth's link path ANDs a second condition the migration did
 * not account for, in `oauth2/link-account.mjs`:
 *
 *     const requireLocalEmailVerified =
 *       accountLinking?.requireLocalEmailVerified ?? true;
 *     if (!isTrustedProvider && !userInfo.emailVerified
 *         || requireLocalEmailVerified && !dbUser.user.emailVerified
 *         || ...) return { error: 'account not linked' };
 *
 * `trustedProviders` only neutralises the PROVIDER side of that test
 * (`userInfo.emailVerified`). The LOCAL side (`bauth_user.emailVerified`) is
 * required by default, and Microsoft Entra ID does not emit an `email_verified`
 * claim unless it is configured as an optional claim on the app registration,
 * so every staff row BetterAuth created through the OAuth register path carries
 * `false`. Result: the link is refused and the member is bounced with
 * `account_not_linked`, on the only door staff have (the OTP door was closed to
 * staff addresses by #311). On the preprod clone of production data that is 134
 * of 139 staff profiles; the 5 that still work were provisioned by
 * `bootstrap-admins.ts`, `add-admin-user.ts` or `accept-invitation.ts`, which
 * all write `emailVerified: true` themselves.
 *
 * Why writing `true` here is a statement of fact and not a convenience: a
 * `StaffProfile` row only ever exists because `staff/oauth/callback` ran for
 * that user, which means Entra ID authenticated that address against the
 * tenant. The proof of it was the `bauth_account` row, and our own migration
 * deleted it. So this restores information the deploy destroyed, on exactly the
 * rows that carry the proof, and on no others.
 *
 * Why the fix is NOT `requireLocalEmailVerified: false` in `server/auth.ts`,
 * which would be one line: that opens implicit linking to every pre-existing
 * local row, and the harmful shape already exists in production data. A handful
 * of `bauth_user` rows carry an `@epitech.eu` address with `role: 'student'` and
 * a `Talent` attached (Salesforce holding a staff address on a contact). Today
 * those refuse to link. With the guard off they would link, and the staff
 * callback, finding neither a `StaffProfile` nor a `StaffInvitation`, deletes
 * the `bauth_user`; `Talent.userId` is `onDelete: SetNull`, so the talent
 * silently loses their account. A blocked login is the better failure.
 *
 * Talents and parents are untouched by the incident and by this script. Their
 * door is the OTP one, which never reaches `handleOAuthUserInfo`: the
 * `sign-in/email-otp` route sets `emailVerified` to true itself when it is
 * false, so the 4501 unverified student rows sign in normally.
 *
 * Nothing in Jump reads `emailVerified` (`rg emailVerified src` returns writes
 * only), so this changes no application behaviour. It only satisfies
 * BetterAuth's linking condition.
 *
 * Idempotent: it narrows on `emailVerified: false`, so a second run reports
 * zero and writes nothing.
 *
 * ORDER OF OPERATIONS, and it matters on production:
 *
 *   preprod  run it now. The migration has already run there (the links are
 *            already gone), so every staff member is locked out until it does.
 *   prod     run it BEFORE deploying v3. The migration runs from the
 *            container's CMD, so it deletes the links at deploy time; going
 *            first means there is no window in which anybody is locked out.
 *            Running it against the current v2 database is inert: the column is
 *            read by nothing, and the links it protects still exist.
 *
 * Standalone by construction (no `src/` import), so it runs inside the deployed
 * image under `kubectl exec`, the same reason `bootstrap-admins.ts` inlines what
 * it needs.
 *
 * Required env: DATABASE_URL
 *
 * Run: bun run scripts/backfill-staff-email-verified.ts [--dry-run]
 */

import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const dryRun = process.argv.includes('--dry-run');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  console.log(
    `Staff emailVerified backfill: ${dryRun ? 'DRY RUN (no writes)' : 'LIVE'}\n`,
  );

  const [staffTotal, linkedAccounts] = await Promise.all([
    prisma.staffProfile.count(),
    prisma.bauth_account.count({ where: { providerId: 'microsoft' } }),
  ]);

  // Reported rather than acted on: it tells the operator which side of the
  // deploy this database is on. A non-zero count before the migration is the
  // normal v2 state; zero after it is the wipe this script exists to survive.
  console.log(`StaffProfile rows:                  ${staffTotal}`);
  console.log(`Microsoft bauth_account rows:       ${linkedAccounts}`);

  const blocked = await prisma.bauth_user.findMany({
    where: { emailVerified: false, staffProfile: { isNot: null } },
    select: { id: true, email: true },
    orderBy: { email: 'asc' },
  });

  console.log(`Staff accounts that cannot re-link: ${blocked.length}\n`);

  if (blocked.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  if (dryRun) {
    for (const user of blocked) console.log(`  ${user.email}`);
    console.log('\nDRY RUN: no rows written.');
    return;
  }

  const { count } = await prisma.bauth_user.updateMany({
    where: { emailVerified: false, staffProfile: { isNot: null } },
    data: { emailVerified: true },
  });

  const remaining = await prisma.bauth_user.count({
    where: { emailVerified: false, staffProfile: { isNot: null } },
  });

  console.log(`Updated ${count} account(s). Remaining blocked: ${remaining}.`);
  console.log(
    '\nEach member re-links on their next Microsoft sign-in; no further action.',
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
