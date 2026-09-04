/**
 * Provision the first admin accounts of a fresh database.
 *
 *   bun run scripts/bootstrap-admins.ts nadia.lemoine@epitech.eu julien.david@epitech.eu
 *
 * Staff sign in with Microsoft OAuth only, and `staff/oauth/callback` refuses
 * anybody who has neither a pending `StaffInvitation` nor an already-provisioned
 * `StaffProfile`: it deletes the `bauth_user` BetterAuth just created and bounces
 * them with `NotInvited`. Invitations are written from `/staff/admin/users`,
 * which needs an admin. So the first admin of a database cannot invite itself,
 * and that gap is the one this script fills - nothing else.
 *
 * Admins only, deliberately. Everyone after them is invited from
 * `/staff/admin/users`, which is the real path, is audited, and assigns a campus.
 * A script that could mint any role would be a second provisioning mechanism
 * competing with that one.
 *
 * It writes no invitation, and that is not a shortcut. `StaffInvitation`
 * requires `invitedByUserId`, an FK to `bauth_user` with `onDelete: Cascade`: on
 * a fresh database there is no non-generated account to attribute one to, and
 * attributing it to a generated one means the next `bun run seed` cascades the
 * invitation away. So it writes what the invitation would have produced -
 * `bauth_user` plus `StaffProfile` - which the callback then finds and lets
 * through.
 *
 * No credential is minted. No password, no session, no OAuth account row: the
 * person still proves they hold the mailbox through Microsoft, and
 * `accountLinking.trustedProviders` carries `microsoft`, which is what makes a
 * pre-existing `bauth_user` link on that first login instead of failing with
 * `account_not_linked`.
 *
 * No campus, because an admin legitimately has none - the callback says so where
 * it declines to treat a null `campusId` as "not provisioned".
 *
 * Idempotent: safe to re-run, and it re-runs after every `prisma migrate reset`,
 * which is what destroys these rows. A `bun run seed` does not: the wipe matches
 * the `sd_` id prefix and these accounts carry a cuid.
 *
 * Standalone by construction (no `src/` import), so it runs in the deployed image
 * under `kubectl exec`, the same reason `accept-invitation.ts` inlines what it
 * needs.
 *
 * Required env: DATABASE_URL
 */

import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/** The domain the OAuth callback enforces. An address outside it cannot log in. */
const STAFF_EMAIL_DOMAIN = '@epitech.eu';

const USAGE = `bun run scripts/bootstrap-admins.ts <email> [email...]

  Provisions each address as an admin so it can sign in with Microsoft.
  Addresses are explicit arguments on purpose: nothing is defaulted, and no
  environment variable grants admin.`;

type Outcome = 'created' | 'already an admin' | 'refused';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function provision(email: string): Promise<[Outcome, string]> {
  if (!email.endsWith(STAFF_EMAIL_DOMAIN)) {
    return [
      'refused',
      `outside ${STAFF_EMAIL_DOMAIN}; the OAuth callback would reject it`,
    ];
  }

  const existing = await prisma.bauth_user.findUnique({
    where: { email },
    select: {
      id: true,
      role: true,
      talent: { select: { id: true } },
      staffProfile: { select: { staffRole: true } },
    },
  });

  // `bauth_user.email` is one namespace shared by staff, talents and parents, so
  // an address already carrying a talent is a collision, not an account to
  // promote. Overwriting the role here would lock that person out of their own
  // space and hand their session the admin one.
  if (existing?.talent) {
    return ['refused', 'this address already carries a talent account'];
  }

  const role = existing?.staffProfile?.staffRole;
  if (role && role !== 'admin') {
    return [
      'refused',
      `already provisioned as ${role}; change the role from /staff/admin/users`,
    ];
  }
  if (role === 'admin') return ['already an admin', ''];

  await prisma.$transaction(async (tx) => {
    const user = await tx.bauth_user.upsert({
      where: { email },
      update: { role: 'admin', emailVerified: true },
      create: {
        email,
        name: email.split('@')[0],
        role: 'admin',
        emailVerified: true,
      },
    });
    await tx.staffProfile.upsert({
      where: { userId: user.id },
      update: { staffRole: 'admin' },
      create: { userId: user.id, staffRole: 'admin' },
    });
  });

  return ['created', ''];
}

async function main(): Promise<void> {
  const emails = process.argv
    .slice(2)
    .map((value) => value.toLowerCase().trim())
    .filter((value) => value.length > 0);

  if (emails.length === 0) {
    console.log(USAGE);
    process.exit(1);
  }

  let refused = 0;
  for (const email of emails) {
    const [outcome, detail] = await provision(email);
    if (outcome === 'refused') refused += 1;
    console.log(
      `${outcome === 'refused' ? '✗' : '✓'} ${email}: ${outcome}${detail ? ` (${detail})` : ''}`,
    );
  }

  console.log(
    '\nEach of them signs in at /staff/login with Microsoft. The account is linked on that first login.',
  );

  // A refusal is an exit code, so a deployment step that calls this cannot
  // report success over an address that was skipped.
  if (refused > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error('Failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
