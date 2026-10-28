/**
 * Fold several talents that are one Salesforce person back into one.
 *
 * Jump used to key a talent on a Salesforce Lead even once that Lead had become
 * a Contact, and a Contact can absorb several Leads (one per salon the student
 * was met at). So one person became one talent per Lead: each kept its own
 * enrolments, the first one took the login address, and the others could never
 * get a login. The worker now keys a talent on its Contact and names the Leads
 * converted into it; the sync then folds the talents those Leads became into
 * the one it keeps, here.
 *
 * Everything the absorbed talents hold moves to the survivor, table by table,
 * and the survivor's row wins wherever both hold the same fact (one enrolment
 * per event, one dossier per school year...): it is the record the talent and
 * the staff have been reading. The absorbed talents' own Salesforce mirror and
 * sync errors go, since the pass that merges re-derives the survivor's, and so
 * do their logins, which nobody ever used: deciding which talent survives, and
 * refusing a merge when more than one of them was used, is
 * `claimSalesforcePerson`'s job below, because a used login or a dossier is
 * something only a person can choose between.
 *
 * Every table holding a talent's rows has its fate here, and
 * `talentScopedData.integration.test.ts` fails on a new one until it does.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import { dropLogin } from '$lib/server/authIdentityRepairCore';
import {
  moveTalentGrants,
  recomputeEventsCount,
} from '$lib/server/services/xpService';

/**
 * A table whose rows move from an absorbed talent to the survivor: the column
 * that names the talent, and the columns that, with it, make a row unique. A
 * row whose key the survivor already holds is the same fact twice, and the
 * survivor's stands.
 */
type MovedRows = {
  table: Prisma.ModelName;
  column?: string;
  sameFact?: readonly string[];
};

const MOVED: readonly MovedRows[] = [
  { table: 'Participation', sameFact: ['eventId'] },
  { table: 'EventPresence', sameFact: ['eventId', 'day', 'slot'] },
  { table: 'Closing_Record', sameFact: ['eventId'] },
  { table: 'Closing_ResetEvent' },
  { table: 'Feedback_Submission', sameFact: ['formId', 'eventId'] },
  { table: 'MinigameAttempt', sameFact: ['publicationId'] },
  { table: 'Workshop_Participation', sameFact: ['activityId'] },
  { table: 'Schooling_YearRecord', sameFact: ['schoolYear'] },
  { table: 'Onboarding_Record', sameFact: ['schoolYear'] },
  { table: 'OnboardingPdfJob' },
  { table: 'ImageRightsDecisionRecord' },
  { table: 'Note_TalentNote' },
  { table: 'TalentDeletionRequest' },
  { table: 'TalentInterest', sameFact: ['interestId'] },
  { table: 'BroadcastRecipient' },
  { table: 'BroadcastRecipient', column: 'parentOfTalentId' },
  // An audit of the repairs made to the login of the person, kept with it.
  { table: 'AuthIdentityRepair' },
];

/**
 * Set-based on purpose: a merge runs inside the sync, per person, and a talent
 * can carry a few hundred presence cells. The identifiers are the constants
 * above, never input.
 */
async function moveRows(
  tx: Prisma.TransactionClient,
  { table, column = 'talentId', sameFact = [] }: MovedRows,
  from: string,
  to: string,
): Promise<void> {
  const t = Prisma.raw(`"${table}"`);
  const c = Prisma.raw(`"${column}"`);
  if (sameFact.length > 0) {
    const same = Prisma.raw(
      sameFact.map((k) => `moved."${k}" = kept."${k}"`).join(' AND '),
    );
    await tx.$executeRaw`
      DELETE FROM ${t} moved USING ${t} kept
      WHERE moved.${c} = ${from} AND kept.${c} = ${to} AND ${same}
    `;
  }
  await tx.$executeRaw`UPDATE ${t} SET ${c} = ${to} WHERE ${c} = ${from}`;
}

/**
 * Move everything `absorbedIds` hold onto `survivorId`, then delete them and
 * their logins, and recompute the survivor's projections. Runs in the caller's
 * transaction, so a person is merged whole or not at all.
 *
 * The absorbed talents are taken one at a time: two of them may hold the same
 * fact, and only the survivor's row is checked against.
 */
export async function mergeTalents(
  tx: Prisma.TransactionClient,
  survivorId: string,
  absorbedIds: readonly string[],
): Promise<void> {
  for (const absorbedId of absorbedIds) {
    const absorbed = await tx.talent.findUniqueOrThrow({
      where: { id: absorbedId },
      select: {
        externalId: true,
        userId: true,
        user: { select: { email: true } },
      },
    });

    for (const moved of MOVED)
      await moveRows(tx, moved, absorbedId, survivorId);
    await moveTalentGrants(tx, absorbedId, survivorId);

    // Re-derived for the survivor by the pass that merges: the mirror from
    // Salesforce's claim, the errors from what that pass meets. A nameless
    // contact carrying the address is met again on its own next pass.
    await tx.talentSfImport.deleteMany({ where: { talentId: absorbedId } });
    const email = absorbed.user?.email;
    await tx.sync_Error.deleteMany({
      where: {
        OR: [
          { talentId: absorbedId },
          ...(absorbed.externalId ? [{ externalId: absorbed.externalId }] : []),
          ...(email
            ? [{ email: { equals: email, mode: 'insensitive' as const } }]
            : []),
        ],
      },
    });

    await tx.talent.delete({ where: { id: absorbedId } });
    if (absorbed.userId) await dropLogin(tx, absorbed.userId);
  }

  await recomputeEventsCount(tx, survivorId);
}

/**
 * Make the talent of one Salesforce person, if Jump has one, the talent keyed
 * on its `externalId`, so the rest of the talents push finds it there.
 *
 * `convertedLeadIds` are the Leads Salesforce converted into the contact. A
 * talent Jump made of one of them is the same person: when several talents
 * answer, they are merged into one, and the one kept is rekeyed to the
 * contact. Keyed on Salesforce's own conversion link and never on an address,
 * since siblings share one.
 *
 * The talent kept is the one a person used (logged in, or started a dossier),
 * otherwise the one already keyed on the contact, otherwise the oldest. A login
 * is read on `firstLoginAt` and on the charte, which only the talent accepts,
 * from inside the app: `firstLoginAt` was backfilled from the sessions still
 * alive when it was added, so a talent who logged in before then and never
 * again has none, and the charte is what still shows it. When
 * more than one was used, nothing is merged and the answer is `refused`: which
 * login and which dossier the person keeps is not Jump's to guess, and the
 * caller records it for an admin. A refusal changes nothing, so the next pass
 * meets it again until someone settles it.
 *
 * The talents are locked before they are read, so that decision holds until
 * the merge commits: a login, a dossier or another pass reaching one of them
 * meanwhile waits, and lands either before the read, which then sees it, or
 * after the merge.
 */
export async function claimSalesforcePerson(
  externalId: string,
  convertedLeadIds: readonly string[],
): Promise<'ready' | 'refused'> {
  const formerIds = convertedLeadIds.filter((id) => id !== externalId);
  if (formerIds.length === 0) return 'ready';
  const personIds = [externalId, ...formerIds];

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      SELECT 1 FROM "Talent"
      WHERE "externalId" IN (${Prisma.join(personIds)})
      FOR UPDATE
    `;
    const talents = await tx.talent.findMany({
      where: { externalId: { in: personIds } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        externalId: true,
        firstLoginAt: true,
        charterAcceptedAt: true,
        _count: { select: { onboardingRecords: true } },
      },
    });
    const used = talents.filter(
      (t) =>
        t.firstLoginAt !== null ||
        t.charterAcceptedAt !== null ||
        t._count.onboardingRecords > 0,
    );
    if (used.length > 1) return 'refused';
    const kept =
      used[0] ?? talents.find((t) => t.externalId === externalId) ?? talents[0];
    if (!kept) return 'ready';

    const absorbed = talents.filter((t) => t.id !== kept.id).map((t) => t.id);
    if (absorbed.length > 0) await mergeTalents(tx, kept.id, absorbed);
    if (kept.externalId !== externalId)
      await tx.talent.update({ where: { id: kept.id }, data: { externalId } });
    return 'ready';
  });
}
