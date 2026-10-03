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
import {
  eventRunsClosings,
  reachableSurfaces,
} from '../../../src/lib/domain/eventModules';
import { schoolYearOf } from '../../../src/lib/domain/schoolYear';
import { classifySfStatus } from '../../../src/lib/domain/sfMemberStatus';
import { DEFAULT_SHOWN_STATUSES, SF_STATUSES } from '../world';
import {
  ACTIVATION_BLOCKERS,
  activationBlockerKeys,
} from '../../../src/lib/domain/eventReadiness';

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

  // The school-year ledger's central invariant: a talent's projection
  // describes the MOST RECENT record, not the current year. That is only
  // demonstrable from a talent who carries a record for a past year as well
  // as the current one - `Schooling_YearRecord`'s unique constraint on
  // `(talentId, schoolYear)` means each grouped row IS a distinct year, so
  // counting rows per talent is enough.
  const schoolingSpread = await prisma.schooling_YearRecord.groupBy({
    by: ['talentId'],
    where: { talentId: { startsWith: 'sd_' } },
    _count: { _all: true },
  });
  if (!schoolingSpread.some((row) => row._count._all >= 2)) {
    failures.push(
      'Aucun talent ne porte deux Schooling_YearRecord sur des années différentes',
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
      date: true,
      endDate: true,
      publicName: true,
      cohortNoun: true,
      devActivatedAt: true,
      closingTemplateId: true,
      feedbackFormId: true,
      modules: { select: { moduleKey: true } },
      campus: { select: { timezone: true } },
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

  // The visibility gate, from both sides.
  //
  // `World.addEvent` already refuses to activate an event the application would
  // refuse, so the first half below can only fail if somebody bypasses it. The
  // half that earns its keep is the second: each of the three blockers has to
  // have an example, because the admin cockpit's « il manque : ... » inventory
  // and the configuration dialog's refusal are both read off this rule, and a
  // blocker no event carries is a sentence nobody has ever seen rendered.
  const activationBlockerFields = events.map((event) => ({
    publicName: event.publicName,
    cohortNoun: event.cohortNoun,
    endDate: event.endDate === null ? null : event.endDate.toISOString(),
    modules: event.modules,
    devActivated: event.devActivatedAt !== null,
  }));
  const activatedButRefused = events.filter(
    (event, index) =>
      event.devActivatedAt !== null &&
      activationBlockerKeys(activationBlockerFields[index]!).length > 0,
  );
  if (activatedButRefused.length > 0) {
    failures.push(
      `${activatedButRefused.length} événements visibles dans l'espace dev que l'écran de configuration refuserait d'activer`,
    );
  }
  const blockersSeen = new Set(
    activationBlockerFields.flatMap((fields) => activationBlockerKeys(fields)),
  );
  for (const blocker of ACTIVATION_BLOCKERS) {
    if (!blockersSeen.has(blocker)) {
      failures.push(
        `Aucun événement bloqué à l'activation par « ${blocker} », donc ce motif de refus n'a pas d'exemple`,
      );
    }
  }

  // The school-year switcher's own list: at least two years' worth of
  // navigable events, or `SchoolYearMenu` has nothing to switch between.
  // Built from the same `gates` above rather than a second query, and from
  // the real `reachableSurfaces` + `schoolYearOf` rather than restating
  // either's rule.
  const navigableYears = new Set(
    events
      .filter((event, index) => reachableSurfaces(gates[index]!).length > 0)
      .map((event) => schoolYearOf(event.date, event.campus.timezone).label),
  );
  if (navigableYears.size < 2) {
    failures.push(
      `Un seul millésime scolaire d'événements navigables (${[...navigableYears].join(', ') || 'aucun'}), le sélecteur d'année n'a rien à changer`,
    );
  }

  // A closing-coverage figure distinguishes null (never configured) from a
  // real zero (configured, past, enrolled, nobody's closing conducted) - see
  // `campusComparison.ts`'s own doc comment on `closingCoverage`. Both counts
  // are queried once and matched back onto `events` by id rather than
  // per-event, for the same reason the model coverage check reads one row
  // per table instead of one query per column.
  const enrolmentCounts = await prisma.participation.groupBy({
    by: ['eventId'],
    where: { eventId: { startsWith: 'sd_' } },
    _count: { _all: true },
  });
  const enrolmentCountByEvent = new Map(
    enrolmentCounts.map((row) => [row.eventId, row._count._all]),
  );
  const closingCounts = await prisma.closing_Record.groupBy({
    by: ['eventId'],
    where: { id: { startsWith: 'sd_' } },
    _count: { _all: true },
  });
  const closingCountByEvent = new Map(
    closingCounts.map((row) => [row.eventId, row._count._all]),
  );
  const hasGenuineZeroCoverage = events.some((event, index) => {
    const gate = gates[index]!;
    if (!eventRunsClosings(gate)) return false;
    if (event.date > anchor) return false;
    const enrolled = enrolmentCountByEvent.get(event.id) ?? 0;
    const conducted = closingCountByEvent.get(event.id) ?? 0;
    return enrolled > 0 && conducted === 0;
  });
  if (!hasGenuineZeroCoverage) {
    failures.push(
      "Aucun événement configuré pour les closings, passé et inscrit, ne montre une couverture à zéro plutôt qu'une absence de configuration",
    );
  }

  // `Closing_Record` carries no foreign key to `Participation` on purpose,
  // so a closing can survive a participation the Salesforce sync has since
  // deleted - see the schema's own comment on `Closing_Record` and
  // `closingLifecycle.integration.test.ts`'s test on keeping a closing whose
  // participation the sync has since pruned.
  const orphanedClosings = await prisma.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM "Closing_Record" cr
    WHERE cr."id" LIKE 'sd_%'
      AND NOT EXISTS (
        SELECT 1 FROM "Participation" p
        WHERE p."talentId" = cr."talentId" AND p."eventId" = cr."eventId"
      )
  `;
  if ((orphanedClosings[0]?.count ?? 0) === 0) {
    failures.push(
      'Aucun closing ne survit à une participation supprimée derrière lui',
    );
  }

  // The usage coverage matrix masks a campus × fonctionnalité cell below
  // five distinct talent actors in one month (`USAGE_SMALL_CELL_FLOOR` in
  // `adminStats/featureUsage.ts`, a `$lib/server` module unreachable from
  // this Vite-free script, which is why the threshold is restated rather
  // than imported). A dataset producing only masked cells cannot tell a
  // working mask from a broken query.
  const unmaskedCells = await prisma.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM (
      SELECT COUNT(DISTINCT "actorHash") AS distinct_actors
      FROM "Usage_FeatureUse"
      WHERE "id" LIKE 'sd_%'
        AND "actorKind" = 'talent'
        AND "campusId" IS NOT NULL
        AND "impersonated" = false
      GROUP BY "feature", "campusId", to_char("occurredAt", 'YYYY-MM')
    ) cells
    WHERE distinct_actors >= 5
  `;
  if ((unmaskedCells[0]?.count ?? 0) === 0) {
    failures.push(
      'Aucune cellule campus × fonctionnalité talent ne dépasse le plancher de masquage à cinq acteurs',
    );
  }

  // A talent can only sign in when the mirror's address and the login address
  // agree; the app refuses otherwise, and a seed gets this wrong silently.
  //
  // This is also, deliberately, the one divergence this generator can never
  // place: it is an integrity invariant the seed asserts holds, not debt.
  // `/staff/admin/sf-conflicts`' AUTH tab is therefore validated live, by
  // demonstrating a real duplicate-email import, never from seed.
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

  // The Salesforce member statuses, and what each event's dev space does with
  // them.
  //
  // This block carries more weight than the ones above, and the reason is worth
  // knowing before anybody trims it: `Participation.sfMemberStatus` is a
  // `String?`, not a Prisma enum, so `assert/enums.ts` cannot see it, and the
  // vocabulary it is checked against is data (`Sync_MemberStatus`), not code.
  const [participations, catalogue, policy] = await Promise.all([
    prisma.participation.findMany({
      where: { eventId: { startsWith: 'sd_' } },
      select: {
        sfMemberStatus: true,
        shownInDevSpace: true,
        event: { select: { id: true, date: true } },
      },
    }),
    prisma.sync_MemberStatus.findMany({
      select: { status: true, shownByDefault: true },
    }),
    prisma.eventConfig_ShownStatus.findMany({
      where: { eventId: { startsWith: 'sd_' } },
      select: { eventId: true, status: true },
    }),
  ]);

  // The generator plays Salesforce with its own list of words, and the two have
  // to agree in both directions: a word it sends that Jump does not know would
  // be an unrecognised status nobody meant to place, and a word of the
  // catalogue it never sends is a behaviour with no example.
  const known = new Set(catalogue.map((row) => row.status));
  const sent = new Set<string>(Object.values(SF_STATUSES));
  for (const status of sent) {
    if (!known.has(status))
      failures.push(
        `Le générateur envoie le statut ${status}, absent du catalogue Sync_MemberStatus`,
      );
  }
  for (const status of known) {
    if (!sent.has(status))
      failures.push(
        `Le statut ${status} du catalogue n'est envoyé par aucun scénario`,
      );
  }
  // What a new event shows here is what the worker gives one in production.
  const byDefault = catalogue
    .filter((row) => row.shownByDefault)
    .map((row) => row.status)
    .sort();
  if (byDefault.join(',') !== [...DEFAULT_SHOWN_STATUSES].sort().join(','))
    failures.push(
      `Les statuts affichés par défaut du générateur (${DEFAULT_SHOWN_STATUSES.join(', ')}) ne sont pas ceux du catalogue (${byDefault.join(', ')})`,
    );

  const shownBy = new Map<string, Set<string>>();
  for (const row of policy) {
    const shown = shownBy.get(row.eventId) ?? new Set<string>();
    shown.add(row.status);
    shownBy.set(row.eventId, shown);
  }
  const classOf = (row: (typeof participations)[number]) =>
    classifySfStatus(row.sfMemberStatus, {
      known,
      shown: shownBy.get(row.event.id) ?? new Set(),
    });

  const seenStatuses = new Set(
    participations.map((row) => row.sfMemberStatus ?? '(null)'),
  );
  for (const status of known) {
    if (!seenStatuses.has(status))
      failures.push(`Aucune inscription au statut Salesforce ${status}`);
  }
  // Every way the dev space treats a status, the unknown word included: that is
  // the class only `stats_sync_health` and the inspector badge report.
  const seenClasses = new Set(participations.map(classOf));
  for (const statusClass of [
    'shown',
    'hidden',
    'unrecognised',
    'missing',
  ] as const) {
    if (!seenClasses.has(statusClass))
      failures.push(
        `Aucune inscription dont le statut Salesforce se classe « ${statusClass} »`,
      );
  }
  if (!seenStatuses.has('(null)'))
    failures.push(
      'Aucune inscription sans statut, alors que celles importées avant juillet 2026 en sont dépourvues',
    );

  // The point of a per-event policy: one word, shown on one event and masked
  // on another. Without it, every screen reads as if the rule were global.
  const shownSomewhere = new Set<string>();
  const hiddenSomewhere = new Set<string>();
  for (const row of participations) {
    if (row.sfMemberStatus === null) continue;
    const statusClass = classOf(row);
    if (statusClass === 'shown') shownSomewhere.add(row.sfMemberStatus);
    if (statusClass === 'hidden') hiddenSomewhere.add(row.sfMemberStatus);
  }
  if (![...shownSomewhere].some((status) => hiddenSomewhere.has(status)))
    failures.push(
      'Aucun statut Salesforce n’est affiché sur un événement et masqué sur un autre',
    );

  // Nobody attended an event that has not happened. A drawn `MET` on a future
  // event is the one illegal state this generator could produce silently.
  const impossible = participations.filter(
    (row) =>
      row.event.date > anchor && row.sfMemberStatus === SF_STATUSES.attended,
  );
  if (impossible.length > 0)
    failures.push(
      `${impossible.length} inscriptions au statut ${SF_STATUSES.attended} sur un événement qui n'a pas eu lieu`,
    );

  // One event carrying both sides of the filter, which is what the admin
  // inspector exists to explain and what its visible / masqué split needs.
  const byEvent = new Map<string, boolean[]>();
  for (const row of participations) {
    const seen = byEvent.get(row.event.id) ?? [];
    seen.push(row.shownInDevSpace);
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

  return failures;
}
