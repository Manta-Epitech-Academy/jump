/**
 * Whether a generated database asks a background worker to do anything.
 *
 * Every other check in this directory reads the dataset as a description of the
 * past: which enum values appear, whether a projection agrees with its ledger,
 * whether the ladder is standing on every rung. None of them can tell a fact
 * apart from an INSTRUCTION, and a queue row is an instruction. The cron that
 * drains it does not know it is looking at seeded data, and it is not supposed
 * to: it takes the oldest outstanding row and calls a provider.
 *
 * It cost six SMS on a team member's personal phone, out of a plain `bun run
 * seed`, to learn that. `AGENTS.md` tells that story once, under « A seeded
 * database is inert to every background worker », along with the older half of
 * the same rule: no `Campus.externalName` is written, so the Salesforce worker
 * has nothing to resolve. Inertness by data, never by a gate somebody re-enables
 * by forgetting. Every queue owes the same guarantee; this is where each one is
 * held to it.
 *
 * ── What belongs here, and what does not ──────────────────────────────────────
 *
 * One entry per queue a scheduler actually drains, keyed on the rows that
 * scheduler claims. Two neighbours deliberately have no entry:
 *
 *   - `OnboardingPdfJob`, whose `pending` rows are inert. `runOnboardingPdfJob`
 *     is only ever called with an explicit job id (fire-and-forget after the
 *     enqueueing transaction, or from the admin retry page). Nothing sweeps for
 *     pending rows, so a seeded one renders nothing until a person asks.
 *   - `/api/jobs/publish-minigame`, which rotates the daily publication on every
 *     tick whatever the database holds. It acts on an empty database too, so it
 *     is not the seed that makes it act, and there is no row here to withhold.
 *
 * The test for a new entry is therefore not "is this a job table" but: is there
 * a scheduled caller that finds these rows BY ITSELF?
 *
 * Every query here is narrowed to `sd_` ids, and that is not tidiness: `--check`
 * can be pointed at a database somebody has since logged into and used, where a
 * campaign genuinely queued from the composer is a correct row and not a defect
 * to report. What this check owns is what the GENERATOR wrote.
 */

import type { PrismaClient } from '@prisma/client';
import { BROADCAST_OUTSTANDING_STATUSES } from '../../../src/lib/domain/broadcasts';
import { SEED_ID_PREFIX } from '../ids';

export async function inertnessFailures(
  prisma: PrismaClient,
): Promise<string[]> {
  const failures: string[] = [];

  // The statuses come from the domain's own classification of a broadcast
  // status, the same one the orchestrator's claim is two halves of, so a status
  // added tomorrow is refused here on arrival rather than read as terminal.
  const seeded = { startsWith: SEED_ID_PREFIX };

  const claimable = await prisma.broadcast.groupBy({
    by: ['status'],
    where: { id: seeded, status: { in: BROADCAST_OUTSTANDING_STATUSES } },
    _count: { _all: true },
  });
  for (const row of claimable) {
    failures.push(
      `${row._count._all} campagne(s) en statut « ${row.status} » : c’est du travail que /api/jobs/broadcasts/process réclame et envoie. Une campagne semée doit être dans un statut terminal.`,
    );
  }

  // A pending recipient under a terminal campaign is the same send, one layer
  // down: the pager selects on the recipient's status, and a stale-`sending`
  // takeover or a manual requeue is all it takes to reach it.
  const pending = await prisma.broadcastRecipient.count({
    where: { id: seeded, status: 'pending' },
  });
  if (pending > 0) {
    failures.push(
      `${pending} destinataire(s) de campagne en attente : c’est la ligne que l’envoi pagine. Un destinataire semé est « sent » ou « failed ».`,
    );
  }

  return failures;
}
