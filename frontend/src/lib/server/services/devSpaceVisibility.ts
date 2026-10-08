/**
 * Which Salesforce statuses the dev space shows, event by event, and the
 * projection that makes it cheap to read.
 *
 * The one writer of the catalogue (`Sync_MemberStatus`), of
 * `EventConfig_ShownStatus` and of `Participation.shownInDevSpace` outside the
 * sync, so the projection cannot be recomputed in one place and forgotten in
 * another: the config wizard, the admin API, the bulk edits, the template copies
 * and the « Membres Salesforce » dialog all come through here.
 *
 * The rule itself is `isShownInDevSpace` in `domain/sfMemberStatus.ts`; the
 * statement below is its set-based twin, applied to every enrolment of the
 * events whose policy just changed.
 */

import { error } from '@sveltejs/kit';
import { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import { normalizeSfStatus } from '$lib/domain/sfMemberStatus';

type Db = Prisma.TransactionClient | typeof prisma;

/** The vocabulary Jump knows, alphabetically. */
export async function memberStatusCatalogue(): Promise<
  { status: string; shownByDefault: boolean }[]
> {
  return prisma.sync_MemberStatus.findMany({
    orderBy: { status: 'asc' },
    select: { status: true, shownByDefault: true },
  });
}

/**
 * Add a word to the catalogue, or change whether a newly created event shows it.
 * The one writer of `Sync_MemberStatus`: `write_sync_member_status` and the
 * « Membres Salesforce » dialog both come through here.
 *
 * Changes no event: an event shows a word only once its own policy says so,
 * which is what keeps a new word from appearing on every cohort at once. What it
 * does change is that the word stops being reported as unknown. Masked on new
 * events unless asked, since a word nobody has looked at yet should not start
 * filling cohorts on its own. An upsert on the word, so safe to repeat.
 */
export async function upsertMemberStatus(
  raw: string,
  shownByDefault?: boolean,
): Promise<string> {
  const status = normalizeSfStatus(raw);
  if (status === null) throw error(400, 'Le statut Salesforce est vide.');
  await prisma.sync_MemberStatus.upsert({
    where: { status },
    create: { status, shownByDefault: shownByDefault ?? false },
    update: shownByDefault !== undefined ? { shownByDefault } : {},
  });
  return status;
}

/** What a newly created event starts showing. */
export async function defaultShownStatuses(): Promise<string[]> {
  const rows = await prisma.sync_MemberStatus.findMany({
    where: { shownByDefault: true },
    orderBy: { status: 'asc' },
    select: { status: true },
  });
  return rows.map((row) => row.status);
}

/** The words each event shows, keyed by event id. An event with none maps to an empty set. */
export async function shownStatusesByEvent(
  eventIds: readonly string[],
  db: Db = prisma,
): Promise<Map<string, Set<string>>> {
  const rows = await db.eventConfig_ShownStatus.findMany({
    where: { eventId: { in: [...eventIds] } },
    select: { eventId: true, status: true },
  });
  const byEvent = new Map<string, Set<string>>(
    eventIds.map((id) => [id, new Set<string>()]),
  );
  for (const row of rows) byEvent.get(row.eventId)?.add(row.status);
  return byEvent;
}

/**
 * Normalize and deduplicate a requested list of words, refusing any the
 * catalogue does not hold. The refusal lists the known ones, so the caller can
 * correct itself, and says where a new word is added: showing an unknown word
 * is a decision about the vocabulary first, and only then about one event.
 */
export async function resolveKnownStatuses(
  requested: readonly string[],
  db: Db = prisma,
): Promise<string[]> {
  const wanted = [
    ...new Set(
      requested
        .map((raw) => normalizeSfStatus(raw))
        .filter((s): s is string => s !== null),
    ),
  ];
  const known = await db.sync_MemberStatus.findMany({
    orderBy: { status: 'asc' },
    select: { status: true },
  });
  const knownSet = new Set(known.map((row) => row.status));
  const unknown = wanted.filter((status) => !knownSet.has(status));
  if (unknown.length > 0) {
    throw error(
      400,
      `Statut Salesforce inconnu de Jump : ${unknown.join(', ')}. ` +
        `Statuts connus : ${known.map((row) => row.status).join(', ')}. ` +
        'Un nouveau statut s’ajoute d’abord au catalogue (write_sync_member_status).',
    );
  }
  return wanted.sort();
}

/**
 * Make one event show exactly `statuses`, and recompute its enrolments in the
 * same transaction. Refuses a word the catalogue does not hold.
 */
export async function setEventShownStatuses(
  tx: Prisma.TransactionClient,
  eventId: string,
  statuses: readonly string[],
): Promise<void> {
  await replaceShownStatuses(
    tx,
    [eventId],
    await resolveKnownStatuses(statuses, tx),
  );
}

/**
 * Make every one of these events show exactly `statuses`, which is what applying
 * a template does. Set-based, so the cost does not grow with the selection. The
 * words are expected to be resolved already (`resolveKnownStatuses`, or read off
 * a template whose rows the catalogue already binds).
 */
export async function replaceShownStatuses(
  tx: Prisma.TransactionClient,
  eventIds: readonly string[],
  statuses: readonly string[],
): Promise<void> {
  if (eventIds.length === 0) return;
  await tx.eventConfig_ShownStatus.deleteMany({
    where: { eventId: { in: [...eventIds] }, status: { notIn: [...statuses] } },
  });
  if (statuses.length > 0) {
    await tx.eventConfig_ShownStatus.createMany({
      data: eventIds.flatMap((eventId) =>
        statuses.map((status) => ({ eventId, status })),
      ),
      skipDuplicates: true,
    });
  }
  await recomputeShownInDevSpace(tx, eventIds);
}

/**
 * Add `show` to, and remove `hide` from, what many events show, keeping
 * whatever else each one shows. Set-based, so the cost does not grow with the
 * selection: one insert, one delete, one recompute. The words are expected to be
 * resolved already (`resolveKnownStatuses`), which is where the refusal lives.
 */
export async function changeShownStatuses(
  tx: Prisma.TransactionClient,
  eventIds: readonly string[],
  change: { show: readonly string[]; hide: readonly string[] },
): Promise<void> {
  if (eventIds.length === 0) return;
  if (change.hide.length > 0) {
    await tx.eventConfig_ShownStatus.deleteMany({
      where: {
        eventId: { in: [...eventIds] },
        status: { in: [...change.hide] },
      },
    });
  }
  if (change.show.length > 0) {
    await tx.eventConfig_ShownStatus.createMany({
      data: eventIds.flatMap((eventId) =>
        change.show.map((status) => ({ eventId, status })),
      ),
      skipDuplicates: true,
    });
  }
  await recomputeShownInDevSpace(tx, eventIds);
}

/**
 * Re-derive `shownInDevSpace` for every enrolment of these events from their
 * current policy. One statement, so the projection never disagrees with the
 * rows it was read from inside the caller's transaction.
 *
 * The sync calls it too, once a roster is written. It derives each row as it
 * upserts it, from the policy it read before the loop, so a policy change that
 * commits mid-roster would otherwise be overwritten on the rows still to come,
 * and an incremental pass never sends those members again.
 */
export async function recomputeShownInDevSpace(
  db: Db,
  eventIds: readonly string[],
): Promise<void> {
  await db.$executeRaw`
    UPDATE "Participation" p
    SET "shownInDevSpace" = (
      p."sfMemberStatus" IS NULL
      OR EXISTS (
        SELECT 1 FROM "EventConfig_ShownStatus" s
        WHERE s."eventId" = p."eventId" AND s."status" = p."sfMemberStatus"
      )
    )
    WHERE p."eventId" = ANY(${[...eventIds]})
  `;
}
