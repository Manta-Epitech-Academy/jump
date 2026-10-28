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
 * refusing a merge when more than one of them was used, is the caller's job
 * (`claimSalesforcePerson`), because a used login or a dossier is something
 * only a person can choose between.
 *
 * Every table holding a talent's rows has its fate here, and
 * `talentScopedData.integration.test.ts` fails on a new one until it does.
 */

import { Prisma } from '@prisma/client';
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
