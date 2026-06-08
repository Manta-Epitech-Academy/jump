import type { PageServerLoad } from './$types';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import {
  loadEventOr404,
  stageEndOrDefault,
} from '$lib/server/services/stageContext';
import { compareNiveaux } from '$lib/domain/niveau';
import { rulesStatus, dossierReadiness } from '$lib/domain/stageCompliance';
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
  toBreakdown,
} from '$lib/server/services/cohortOverview';
import { INSCRIT_PARTICIPATION_SELECT } from './components/types';
import type { InscritRow } from './components/types';

// The sidebar cards are narrower than the dashboard's side-by-side breakdowns,
// so they show a shorter head with the tail folded into "Autres".
const SIDEBAR_BREAKDOWN_TOP_N = 5;
const MS_PER_DAY = 86_400_000;

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
  const stageEnd = stageEndOrDefault(event);
  const totalDays = Math.max(
    1,
    Math.ceil((stageEnd.getTime() - event.date.getTime()) / MS_PER_DAY),
  );
  const dayN = Math.min(
    totalDays,
    Math.max(
      1,
      Math.ceil(
        (bounds.endOfDay.getTime() - event.date.getTime()) / MS_PER_DAY,
      ),
    ),
  );
  const countdown = {
    status,
    openDate: composeEventStartInstant(
      event.date,
      effectiveStartMinutes(event.eventType, event.startMinutes),
      timezone,
    ),
    startMinutes: event.startMinutes,
    endDate: stageEnd,
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

  const scopedAnd = [{ eventId: event.id }, ...originAnd];
  const where = scopedAnd.length === 1 ? scopedAnd[0] : { AND: scopedAnd };

  // One phase-agnostic query: every inscrit, sorted by nom for a stable order
  // (the client applies the user-chosen sort on top). The cohort overview
  // (counter + origin breakdowns + lycée picker) is whole-event on purpose —
  // it ignores the `?lycee`/`?interest` origin filter so it stays a stable map
  // the user drills into, never collapsing to the row currently filtered.
  const [participations, lyceeRanking, interestRanking, cohortTotal] =
    await Promise.all([
      db.participation.findMany({
        where,
        select: INSCRIT_PARTICIPATION_SELECT,
        orderBy: [{ talent: { nom: 'asc' } }, { talent: { prenom: 'asc' } }],
      }),
      rankLyceesByCohort(db, event.id),
      // The interests sidebar shows only tech interests (the recruitment signal);
      // the lycée breakdown stays the full origin picture.
      rankInterestsByCohort(db, event.id, { techOnly: true }),
      db.participation.count({ where: { eventId: event.id } }),
    ]);

  const rows: InscritRow[] = participations.map((p) => {
    const t = p.talent;
    const rules = rulesStatus(
      t.parentRulesSignedAt,
      p.stageCompliance?.charteSigned,
      t.rulesSignedAt,
    );
    const image = imageRightsStatus(t);
    return {
      id: p.id,
      talentId: p.talentId,
      nom: t.nom,
      prenom: t.prenom,
      niveau: t.niveau,
      schoolName: t.school?.name ?? null,
      readiness: dossierReadiness(rules, image),
      rulesStatus: rules,
      imageStatus: image,
      email: t.email,
      parentEmail: t.parentEmail,
    };
  });

  const availableNiveaux = Array.from(
    new Set(rows.map((r) => r.niveau).filter((n): n is string => !!n)),
  ).sort(compareNiveaux);

  return {
    event,
    timezone,
    origin,
    availableNiveaux,
    rows,
    countdown,
    // Full lycée ranking feeds the toolbar picker (every lycée, ranked by
    // headcount); the capped slices feed the read-only sidebar cards. Interests
    // are read-only (no picker), so only the capped tech slice is needed.
    lyceeOptions: lyceeRanking,
    lyceesBreakdown: toBreakdown(lyceeRanking, SIDEBAR_BREAKDOWN_TOP_N),
    interestsCloud: toBreakdown(interestRanking, SIDEBAR_BREAKDOWN_TOP_N),
    cohort: { total: cohortTotal },
  };
};
