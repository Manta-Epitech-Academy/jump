/**
 * Which Salesforce statuses the dev space shows, and which of them count as a
 * visit, event by event, and the projection that makes it cheap to read.
 *
 * The one writer of the catalogue (`Sync_MemberStatus`), of
 * `EventConfig_ShownStatus` and of `Participation.shownInDevSpace` outside the
 * sync, so the projection cannot be recomputed in one place and forgotten in
 * another: the admin API's event writes, the bulk edits and the template copies
 * all come through here, and each policy change also re-derives « venu »
 * (`attendance.ts`).
 *
 * The rule itself is `isShownInDevSpace` in `domain/sfMemberStatus.ts`; the
 * statement below is its set-based twin, applied to every enrolment of the
 * events whose policy just changed.
 */

import { error } from '@sveltejs/kit';
import { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import { normalizeSfStatus } from '$lib/domain/sfMemberStatus';
import { recomputeAttendance } from './attendance';

type Db = Prisma.TransactionClient | typeof prisma;

/** The vocabulary Jump knows, alphabetically. */
export async function memberStatusCatalogue(): Promise<
  { status: string; shownByDefault: boolean; attestsByDefault: boolean }[]
> {
  return prisma.sync_MemberStatus.findMany({
    orderBy: { status: 'asc' },
    select: { status: true, shownByDefault: true, attestsByDefault: true },
  });
}

/**
 * Add a word to the catalogue, or change what a newly created event does with
 * it: show it (`shownByDefault`), count it as a visit (`attestsByDefault`). The
 * one writer of `Sync_MemberStatus`, behind `write_sync_member_status`.
 *
 * Changes no event: an event shows a word only once its own policy says so,
 * which is what keeps a new word from appearing on every cohort at once. What it
 * does change is that the word stops being reported as unknown. Masked on new
 * events unless asked, since a word nobody has looked at yet should not start
 * filling cohorts on its own. A word counts as a visit by default only if it is
 * shown by default, which the database holds too; the refusal here says so in
 * words. An upsert on the word, so safe to repeat.
 */
export async function upsertMemberStatus(
  raw: string,
  defaults: { shownByDefault?: boolean; attestsByDefault?: boolean } = {},
): Promise<string> {
  const status = normalizeSfStatus(raw);
  if (status === null) throw error(400, 'Le statut Salesforce est vide.');
  const current = await prisma.sync_MemberStatus.findUnique({
    where: { status },
    select: { shownByDefault: true, attestsByDefault: true },
  });
  const shownByDefault =
    defaults.shownByDefault ?? current?.shownByDefault ?? false;
  // Masking a word by default also stops it counting by default, as hiding a
  // word on an event does.
  const attestsByDefault =
    defaults.attestsByDefault ??
    ((current?.attestsByDefault ?? false) && shownByDefault);
  if (attestsByDefault && !shownByDefault) {
    throw error(
      400,
      `${status} ne peut compter comme une venue par défaut sans être affiché par défaut : passez aussi shownByDefault à true.`,
    );
  }
  await prisma.sync_MemberStatus.upsert({
    where: { status },
    create: { status, shownByDefault, attestsByDefault },
    update: { shownByDefault, attestsByDefault },
  });
  return status;
}

/**
 * What a newly created event starts showing, and which of those it counts as
 * attended: the catalogue's `shownByDefault` and `attestsByDefault`, as the rows
 * the event is created with.
 */
export async function defaultShownStatuses(): Promise<
  { status: string; attestsAttendance: boolean }[]
> {
  const rows = await prisma.sync_MemberStatus.findMany({
    where: { shownByDefault: true },
    orderBy: { status: 'asc' },
    select: { status: true, attestsByDefault: true },
  });
  return rows.map((row) => ({
    status: row.status,
    attestsAttendance: row.attestsByDefault,
  }));
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
 * What an event does with the Salesforce words it knows: the ones its dev space
 * shows, and among them the ones it counts as a visit (MET on a Coding Club,
 * « 4 - En stage » on a stage). Only a shown word can count, which is why
 * `attending` is a subset of `shown` rather than a second list.
 */
export type StatusPolicy = {
  shown: readonly string[];
  attending: readonly string[];
};

/**
 * Refuse a word asked to count as a visit that the dev space would not show.
 * The refusal names the words that are shown, so the caller can correct itself,
 * and says what showing it would take.
 */
export function refuseAttendingNotShown(
  attending: readonly string[],
  shown: readonly string[],
): void {
  const shownSet = new Set(shown);
  const notShown = attending.filter((status) => !shownSet.has(status));
  if (notShown.length > 0) {
    throw error(
      400,
      `Un statut ne compte comme une venue que s'il est affiché : ${notShown.join(', ')} ne l'est pas. ` +
        `Statuts affichés : ${shown.length > 0 ? shown.join(', ') : 'aucun'}. ` +
        'Affichez-le d’abord (shownStatuses), ou retirez-le des statuts comptés comme une venue.',
    );
  }
}

/**
 * Give one event exactly this policy, and recompute its enrolments in the same
 * transaction. Refuses a word the catalogue does not hold, and a word counted
 * as a visit that is not shown.
 */
export async function setEventStatusPolicy(
  tx: Prisma.TransactionClient,
  eventId: string,
  policy: StatusPolicy,
): Promise<void> {
  const shown = await resolveKnownStatuses(policy.shown, tx);
  const attending = await resolveKnownStatuses(policy.attending, tx);
  refuseAttendingNotShown(attending, shown);
  await replaceShownStatuses(tx, [eventId], { shown, attending });
}

/**
 * Give every one of these events exactly this policy, which is what applying a
 * template does. Set-based, so the cost does not grow with the selection. The
 * words are expected to be resolved and checked already
 * (`resolveKnownStatuses`, `refuseAttendingNotShown`, or read off a template
 * whose rows the catalogue already binds).
 */
export async function replaceShownStatuses(
  tx: Prisma.TransactionClient,
  eventIds: readonly string[],
  policy: StatusPolicy,
): Promise<void> {
  if (eventIds.length === 0) return;
  const events = { in: [...eventIds] };
  await tx.eventConfig_ShownStatus.deleteMany({
    where: { eventId: events, status: { notIn: [...policy.shown] } },
  });
  if (policy.shown.length > 0) {
    await tx.eventConfig_ShownStatus.createMany({
      data: eventIds.flatMap((eventId) =>
        policy.shown.map((status) => ({ eventId, status })),
      ),
      skipDuplicates: true,
    });
  }
  await tx.eventConfig_ShownStatus.updateMany({
    where: { eventId: events },
    data: { attestsAttendance: false },
  });
  if (policy.attending.length > 0) {
    await tx.eventConfig_ShownStatus.updateMany({
      where: { eventId: events, status: { in: [...policy.attending] } },
      data: { attestsAttendance: true },
    });
  }
  await recomputeShownInDevSpace(tx, eventIds);
  await recomputeAttendance(tx, { eventIds });
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
