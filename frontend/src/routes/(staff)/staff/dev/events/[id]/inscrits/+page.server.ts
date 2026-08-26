import type { PageServerLoad } from './$types';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import {
  loadEventOr404,
  requireEventModule,
  eventEndOrDefault,
  eventModuleSettings,
} from '$lib/server/services/stageContext';
import { EVENT_MODULES } from '$lib/domain/eventModules';
import { resolveEventDiplomaIdentity } from '$lib/server/diplomaTemplates';
import { compareNiveaux } from '$lib/domain/niveau';
import { rulesStatus, inscritStatus } from '$lib/domain/dossierCompliance';
import { imageRightsStatus } from '$lib/domain/imageRights';
import {
  getLifecycleBounds,
  getEventStatus,
  applyPhaseOverride,
} from '$lib/domain/eventLifecycle';
import { effectiveStartMinutes } from '$lib/domain/event';
import { composeEventStartInstant } from '$lib/server/eventTime';
import {
  rankLyceesByCohort,
  rankInterestsByCohort,
  eventCohortWhere,
  toBreakdown,
} from '$lib/server/services/cohortOverview';
import { INSCRIT_PARTICIPATION_SELECT } from './components/types';
import { loadEventDossierSignatures, NO_DOSSIER_SIGNATURES } from './dossiers';
import { schoolYearOf } from '$lib/domain/schoolYear';
import type { InscritRow, InscritsCohort } from './components/types';
import { stageCountdown } from '$lib/domain/eventPresence';
import { visibleParticipationWhere } from '$lib/domain/sfMemberStatus';

// The sidebar cards are narrower than the dashboard's side-by-side breakdowns,
// so they show a shorter head with the tail folded into "Autres".
const SIDEBAR_BREAKDOWN_TOP_N = 5;

function originConditions(schoolId: string | null, interestId: string | null) {
  const conds: object[] = [];
  if (schoolId) conds.push({ talent: { schoolId } });
  if (interestId)
    conds.push({ talent: { interests: { some: { interestId } } } });
  return conds;
}

export const load: PageServerLoad = async ({ params, locals, url }) => {
  const campusId = getCampusId(locals);
  const event = await loadEventOr404(params.id, campusId);
  requireEventModule(event, EVENT_MODULES.INSCRITS);
  const db = scopedPrisma(campusId);
  const timezone = getCampusTimezone(locals);

  // Stage countdown context (same source as the dashboard prep hero): the phase
  // the workspace is showing, the effective opening instant, and the day index
  // while the stage runs.
  const bounds = getLifecycleBounds(timezone);
  const status = applyPhaseOverride(
    getEventStatus(event, bounds),
    locals.stagePhaseOverride,
  );
  const eventEnd = eventEndOrDefault(event);
  const { dayN, totalDays } = stageCountdown(event, timezone, bounds.now);
  const countdown = {
    status,
    openDate: composeEventStartInstant(
      event.date,
      effectiveStartMinutes(event.startMinutes),
      timezone,
    ),
    startMinutes: event.startMinutes,
    endDate: eventEnd,
    dayN,
    totalDays,
  };

  // The `lycee` filter param carries a canonical School id; resolve it to a name
  // for the origin chip and filter participations on the talent's schoolId.
  const schoolId = url.searchParams.get('lycee');
  const interestId = url.searchParams.get('interest');

  const [activeSchool, activeInterest] = await Promise.all([
    schoolId
      ? db.school.findUnique({
          where: { id: schoolId },
          select: { name: true },
        })
      : Promise.resolve(null),
    interestId
      ? db.interest.findUnique({
          where: { id: interestId },
          select: { id: true, nom: true, emoji: true },
        })
      : Promise.resolve(null),
  ]);
  const origin = {
    lycee: activeSchool ? { nom: activeSchool.name } : null,
    interest: activeInterest,
  };
  const originAnd = originConditions(
    activeSchool ? schoolId : null,
    activeInterest?.id ?? null,
  );

  const scopedAnd = [
    { eventId: event.id },
    visibleParticipationWhere,
    ...originAnd,
  ];
  const where = scopedAnd.length === 1 ? scopedAnd[0] : { AND: scopedAnd };

  // Stream the cohort: the page shell (header + countdown + rail skeleton) paints
  // immediately while this resolves, instead of the client navigation blocking on
  // it. One phase-agnostic query: every inscrit, sorted by nom for a stable order
  // (the client applies the user-chosen sort on top). The cohort overview
  // (counter + origin breakdowns + lycée picker) is whole-event on purpose —
  // it ignores the `?lycee`/`?interest` origin filter so it stays a stable map
  // the user drills into, never collapsing to the row currently filtered.
  // The règlement applying to this event is the one of the event's own school
  // year, so that is the dossier the statut column reads (see `./dossiers`).
  const eventSchoolYear = schoolYearOf(event.date, timezone).label;

  const cohort: Promise<InscritsCohort> = (async () => {
    const [
      participations,
      lyceeRanking,
      interestRanking,
      cohortTotal,
      dossiers,
    ] = await Promise.all([
      db.participation.findMany({
        where,
        select: INSCRIT_PARTICIPATION_SELECT,
        orderBy: [{ talent: { nom: 'asc' } }, { talent: { prenom: 'asc' } }],
      }),
      rankLyceesByCohort(db, eventCohortWhere(event.id)),
      // The interests sidebar shows only tech interests (the recruitment
      // signal); the lycée breakdown stays the full origin picture.
      rankInterestsByCohort(db, eventCohortWhere(event.id), {
        techOnly: true,
      }),
      db.participation.count({
        where: { eventId: event.id, ...visibleParticipationWhere },
      }),
      loadEventDossierSignatures(db, event.id, eventSchoolYear),
    ]);

    const rows: InscritRow[] = participations.map((p) => {
      const t = p.talent;
      const dossier = dossiers.get(p.talentId) ?? NO_DOSSIER_SIGNATURES;
      const rules = rulesStatus(
        dossier.parentRulesSignedAt,
        dossier.rulesSignedAt,
      );
      // Off the event's own dossier, like the règlement beside it: the flat
      // column would answer for whichever year this talent last opened.
      const image = imageRightsStatus(dossier);
      const connected = t.firstLoginAt != null;
      return {
        id: p.id,
        talentId: p.talentId,
        nom: t.nom,
        prenom: t.prenom,
        niveau: t.niveau,
        schoolName: t.school?.name ?? null,
        xp: t.xp,
        status: inscritStatus(t.niveau, connected, rules, image),
        connected,
        rulesStatus: rules,
        imageStatus: image,
        studentSigned: dossier.rulesSignedAt != null,
        email: t.user?.email ?? null,
        sfMemberStatus: p.sfMemberStatus,
      };
    });

    const availableNiveaux = Array.from(
      new Set(rows.map((r) => r.niveau).filter((n): n is string => !!n)),
    ).sort(compareNiveaux);

    return {
      rows,
      availableNiveaux,
      // Full lycée ranking feeds the toolbar picker (every lycée, ranked by
      // headcount); the capped slices feed the read-only sidebar cards.
      // Interests are read-only (no picker), so only the capped tech slice.
      lyceeOptions: lyceeRanking,
      lyceesBreakdown: toBreakdown(lyceeRanking, SIDEBAR_BREAKDOWN_TOP_N),
      interestsCloud: toBreakdown(interestRanking, SIDEBAR_BREAKDOWN_TOP_N),
      cohort: { total: cohortTotal },
    };
  })();

  return {
    event,
    timezone,
    origin,
    countdown,
    // Inscrits sub-option: hide the dossier/statut funnel column for events whose
    // campus doesn't onboard. Cheap shell value, so it rides the first paint.
    showStatutColumn: eventModuleSettings(event, EVENT_MODULES.INSCRITS)
      .showStatutColumn,
    // Which certificate this event issues, or null when it issues none, which is
    // what hides the export. Only the identity: the page needs the label to name
    // the download, never the design's kilobytes of CSS.
    diploma: await resolveEventDiplomaIdentity(event),
    // Un-awaited on purpose: SvelteKit streams it so the shell paints first.
    cohort,
  };
};
