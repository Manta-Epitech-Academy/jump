/**
 * States the application can reach, checked with the application's own logic.
 *
 * The generator writes rows; these functions are what the product actually calls
 * to interpret them. Running the real `getOnboardingStep`, `imageRightsStance`
 * and `eventRunsClosings` over the result is what turns "we wrote some
 * timestamps" into "every rung of the ladder is standing on".
 *
 * It is also the honest answer to a design constraint: the services cannot be
 * called from here, because they reach `$lib/server/db` and `$env/dynamic/private`
 * which do not resolve outside Vite. The pure domain functions have no such
 * dependency, so the check uses the same code the screens do.
 */

import type { PrismaClient } from '@prisma/client';
import {
  ONBOARDING_STEP_ORDER,
  getOnboardingStep,
  type OnboardingStep,
} from '../../../src/lib/domain/talentOnboarding';
import {
  imageRightsStance,
  imageRightsStatus,
} from '../../../src/lib/domain/imageRights';
import { eventRunsClosings } from '../../../src/lib/domain/eventModules';
import {
  SF_MEMBER_STATUSES,
  isVisibleInDevSpace,
  pastEventPresence,
} from '../../../src/lib/domain/sfMemberStatus';
import { effectiveStatus } from '../../../src/lib/domain/eventPresence';

export async function reachabilityFailures(
  prisma: PrismaClient,
  anchor: Date,
): Promise<string[]> {
  const failures: string[] = [];

  // Every rung of the ladder, plus "finished". Production holds three talents
  // stopped part-way out of 887, so this is the check that would otherwise be
  // impossible to satisfy from realistic volume alone.
  const dossiers = await prisma.onboarding_Record.findMany({
    where: { talentId: { startsWith: 'sd_' } },
    select: {
      infoValidatedAt: true,
      highSchoolValidatedAt: true,
      parentsValidatedAt: true,
      techInterestsValidatedAt: true,
      generalInterestsValidatedAt: true,
      equipmentValidatedAt: true,
      processingCompletedAt: true,
      rulesSignedAt: true,
    },
  });
  const stepsSeen = new Set<OnboardingStep | 'complete'>();
  for (const dossier of dossiers)
    stepsSeen.add(getOnboardingStep(dossier) ?? 'complete');
  for (const step of ONBOARDING_STEP_ORDER) {
    if (!stepsSeen.has(step))
      failures.push(`Aucun dossier arrêté à l'étape « ${step} »`);
  }
  if (!stepsSeen.has('complete')) failures.push('Aucun dossier terminé');

  // A guardian the parent workspace can resolve.
  //
  // `guards.ts` finds a guardian's children by matching `Talent.parentEmail`
  // against the address they signed in with, so a dossier that passed the
  // parents rung without one leaves that whole space unreachable and every
  // « parent en attente » count at zero, with no screen anywhere saying so. It
  // is not vacuous: the ladder check above guarantees dossiers past that rung.
  const guardianless = await prisma.talent.count({
    where: {
      id: { startsWith: 'sd_' },
      parentEmail: null,
      onboardingRecords: { some: { parentsValidatedAt: { not: null } } },
    },
  });
  if (guardianless > 0) {
    failures.push(
      `${guardianless} talents dont le dossier a passé l'étape « parents » sans adresse de responsable légal`,
    );
  }

  // The three stances. A lapsed authorisation must read `unknown`, never
  // `authorized`; a lapsed refusal must still read `forbidden`. Reading the
  // projection alone collapses the two, and the marker silently drops off a
  // refused student's badge every September.
  const talents = await prisma.talent.findMany({
    where: { id: { startsWith: 'sd_' } },
    select: {
      id: true,
      imageRightsDecision: true,
      imageRightsDecidedAt: true,
      imageRightsRecords: {
        orderBy: [{ decidedAt: 'desc' }, { createdAt: 'desc' }],
        take: 1,
        select: { decision: true },
      },
    },
  });
  const stances = new Set<string>();
  for (const talent of talents) {
    stances.add(
      imageRightsStance(
        imageRightsStatus(talent),
        talent.imageRightsRecords[0]?.decision ?? null,
      ),
    );
  }
  for (const expected of ['authorized', 'forbidden', 'unknown']) {
    if (!stances.has(expected))
      failures.push(
        `Aucun talent en position « ${expected} » pour le droit à l'image`,
      );
  }

  // An event that runs closings and one that does not. A coverage rate whose
  // denominator is taken over the whole périmètre instead of over the events
  // that actually run them read 18% where it should have read 78%, and nothing
  // could catch it without both cases being present.
  const events = await prisma.event.findMany({
    where: { id: { startsWith: 'sd_' } },
    select: {
      id: true,
      closingTemplateId: true,
      feedbackFormId: true,
      modules: { select: { moduleKey: true } },
    },
  });
  const gates = events.map((event) => ({
    modules: event.modules.map((module) => module.moduleKey),
    hasPlanning: false,
    hasFeedbackForm: event.feedbackFormId !== null,
    hasClosingTemplate: event.closingTemplateId !== null,
  }));
  if (!gates.some((gate) => eventRunsClosings(gate)))
    failures.push('Aucun événement ne conduit de closings');
  if (!gates.some((gate) => !eventRunsClosings(gate)))
    failures.push('Tous les événements conduisent des closings');

  // A talent can only sign in when the mirror's address and the login address
  // agree; the app refuses otherwise, and a seed gets this wrong silently.
  const mismatched = await prisma.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM "Talent" t
    JOIN "TalentSfImport" s ON s."talentId" = t."id"
    JOIN "bauth_user" u ON u."id" = t."userId"
    WHERE t."id" LIKE 'sd_%' AND lower(s."sfEmail") <> lower(u."email")
  `;
  if ((mismatched[0]?.count ?? 0) > 0) {
    failures.push(
      `${mismatched[0]!.count} talents dont l'adresse CRM et l'adresse de connexion divergent`,
    );
  }

  // The Salesforce member statuses, and the presence they imply.
  //
  // This block carries more weight than the ones above, and the reason is worth
  // knowing before anybody trims it: `Participation.sfMemberStatus` is a
  // `String?`, not a Prisma enum, so `assert/enums.ts` cannot see it. The rule
  // that a behaviour ships with its example is enforced by the DMMF everywhere
  // else in this file's neighbourhood; here it is enforced by nothing but these
  // lines.
  const participations = await prisma.participation.findMany({
    where: { eventId: { startsWith: 'sd_' } },
    select: {
      talentId: true,
      sfMemberStatus: true,
      event: { select: { id: true, date: true, endDate: true } },
    },
  });

  const seenStatuses = new Set(
    participations.map((row) => row.sfMemberStatus ?? '(null)'),
  );
  for (const status of SF_MEMBER_STATUSES) {
    if (!seenStatuses.has(status))
      failures.push(`Aucune inscription au statut Salesforce ${status}`);
  }
  if (!seenStatuses.has('(null)'))
    failures.push(
      'Aucune inscription sans statut, alors que celles importées avant juillet 2026 en sont dépourvues',
    );

  // Nobody attended an event that has not happened. A drawn `MEET` on a future
  // event is the one illegal state this generator could produce silently.
  const impossible = participations.filter(
    (row) => row.event.date > anchor && row.sfMemberStatus === 'MEET',
  );
  if (impossible.length > 0)
    failures.push(
      `${impossible.length} inscriptions au statut MEET sur un événement qui n'a pas eu lieu`,
    );

  // One event carrying both sides of the filter, which is what the admin
  // inspector exists to explain and what its visible / masqué split needs.
  const byEvent = new Map<string, boolean[]>();
  for (const row of participations) {
    const seen = byEvent.get(row.event.id) ?? [];
    seen.push(isVisibleInDevSpace(row.sfMemberStatus));
    byEvent.set(row.event.id, seen);
  }
  const mixedEvent = [...byEvent.values()].some(
    (visibilities) =>
      visibilities.includes(true) && visibilities.includes(false),
  );
  if (!mixedEvent)
    failures.push(
      'Aucun événement ne porte à la fois une inscription visible et une inscription masquée',
    );

  const derivedPresences = new Set(
    participations
      .filter((row) => row.event.date <= anchor)
      .map((row) => pastEventPresence(row.sfMemberStatus)),
  );
  for (const expected of ['present', 'absent', null] as const) {
    if (!derivedPresences.has(expected))
      failures.push(
        `pastEventPresence ne produit jamais ${expected ?? 'null'} sur un événement passé`,
      );
  }

  // The one presence shape that consults Salesforce at all: a cell nobody
  // marked, in a closed slot, on a single-day event. Run the product's own
  // `effectiveStatus` over what was written rather than restating its rule.
  const closures = await prisma.eventPresenceClosure.findMany({
    where: { eventId: { startsWith: 'sd_' } },
    select: { eventId: true, day: true, slot: true },
  });
  const marks = await prisma.eventPresence.findMany({
    where: { eventId: { startsWith: 'sd_' } },
    select: {
      eventId: true,
      talentId: true,
      day: true,
      slot: true,
      status: true,
    },
  });
  const markKey = (
    eventId: string,
    talentId: string,
    day: Date,
    slot: string,
  ) => `${eventId}|${talentId}|${day.toISOString().slice(0, 10)}|${slot}`;
  const markByKey = new Map(
    marks.map((mark) => [
      markKey(mark.eventId, mark.talentId, mark.day, mark.slot),
      mark.status,
    ]),
  );

  const projected = new Set<string>();
  let overridden = 0;
  for (const closure of closures) {
    const roster = participations.filter(
      (row) => row.event.id === closure.eventId,
    );
    // `isSingleDayEvent` in the émargement loader is `slots.length <= 2`, which
    // for a generated event is exactly "one weekday".
    const singleDay = roster[0]?.event.endDate === null;
    for (const row of roster) {
      const stored = markByKey.get(
        markKey(closure.eventId, row.talentId, closure.day, closure.slot),
      );
      const resolved = effectiveStatus(stored ?? 'pending', true, {
        isSingleDayEvent: singleDay,
        sfMemberStatus: row.sfMemberStatus,
      });
      if (stored === undefined) projected.add(resolved);
      else if (
        stored !==
        effectiveStatus('pending', true, {
          isSingleDayEvent: singleDay,
          sfMemberStatus: row.sfMemberStatus,
        })
      )
        overridden += 1;
    }
  }
  if (!projected.has('present'))
    failures.push(
      'Aucune cellule non marquée d’un créneau clos ne se lit « présent » depuis Salesforce',
    );
  if (!projected.has('absent'))
    failures.push(
      'Aucune cellule non marquée d’un créneau clos ne se lit « absent »',
    );
  if (overridden === 0)
    failures.push(
      'Aucune marque manuelle ne contredit le statut Salesforce, donc « la saisie humaine l’emporte » n’est démontré nulle part',
    );

  return failures;
}
