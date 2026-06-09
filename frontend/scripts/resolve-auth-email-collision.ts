/**
 * Resolve a single ORPHAN_HOLDER auth-email collision (see
 * inspect-auth-email-collision.ts for the diagnosis and the verdict vocabulary).
 *
 * The ORPHAN_HOLDER case: a talent is linked to a stale account (wrong email),
 * while the email it should log in with is already held by an ORPHAN account
 * (no talent / staff / parent link) where the student's live sessions actually
 * are. The fix preserves those sessions: repoint Talent.userId → the orphan,
 * promote it to a student, hard-delete the stale account.
 *
 * The actual verify + mutation lives in the shared core
 * (`src/lib/server/authIdentityRepairCore.ts`), which the admin UI also drives,
 * so this script and the UI can never resolve a case differently. The script
 * imports the core by relative path (not `$lib`) so it stays standalone and
 * runnable in the prod container.
 *
 * Safety: DRY-RUN BY DEFAULT (pass --apply to mutate); the core re-verifies
 * every precondition inside the transaction and refuses anything that is not a
 * clean ORPHAN_HOLDER, rolling back untouched.
 *
 * Run (dry-run):  bun run scripts/resolve-auth-email-collision.ts <talentId>
 *     (apply):    bun run scripts/resolve-auth-email-collision.ts <talentId> --apply
 *   talentId defaults to the known Linoa case if omitted.
 */

import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  planRepointAndDrop,
  applyRepointAndDrop,
} from '../src/lib/server/authIdentityRepairCore';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const talentId =
  args.find((a) => !a.startsWith('--')) ?? 'cmp3zarym04ww01l6c5i9j9i2';

async function main() {
  // Dry-run plan (read-only); throws a human reason if it is not a clean orphan.
  const plan = await planRepointAndDrop(prisma, talentId);

  console.log(`\nTALENT  ${talentId}  (${plan.talentName})`);
  console.log(`\nPLAN (ORPHAN_HOLDER → repoint + drop):`);
  console.log(
    `  1. Talent.userId : ${plan.staleUserId}  →  ${plan.orphanUserId}`,
  );
  console.log(
    `  2. orphan ${plan.orphanUserId} : role → 'student', name → '${plan.talentName}'`,
  );
  console.log(
    `  3. delete stale  ${plan.staleUserId} (email '${plan.staleEmail}') + its sessions/accounts`,
  );
  console.log(
    `     → orphan keeps its live sessions; student logs in unchanged on '${plan.targetEmail}'.`,
  );

  if (!apply) {
    console.log(
      '\n[dry-run] No changes written. Re-run with --apply to execute.',
    );
    return;
  }

  await prisma.$transaction((tx) => applyRepointAndDrop(tx, talentId, 'cli'));
  console.log(
    '\n✓ Applied. Talent repointed onto the orphan; stale account removed.',
  );
}

main()
  .catch((err) => {
    console.error(`\n✗ ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
