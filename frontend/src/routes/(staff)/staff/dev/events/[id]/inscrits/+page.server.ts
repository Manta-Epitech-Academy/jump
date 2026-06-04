import type { PageServerLoad } from './$types';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import { loadEventOr404 } from '$lib/server/services/stageContext';
import { compareNiveaux } from '$lib/domain/niveau';
import {
  isImageRightsCompliant,
  isRulesCompliant,
} from '$lib/domain/stageCompliance';
import { INSCRIT_PARTICIPATION_SELECT } from './components/types';
import type { InscritRow } from './components/types';

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
  // (the client applies the user-chosen sort on top).
  const participations = await db.participation.findMany({
    where,
    select: INSCRIT_PARTICIPATION_SELECT,
    orderBy: [{ talent: { nom: 'asc' } }, { talent: { prenom: 'asc' } }],
  });

  const rows: InscritRow[] = participations.map((p) => {
    const t = p.talent;
    const ready =
      isRulesCompliant(
        t.parentRulesSignedAt,
        p.stageCompliance?.charteSigned,
      ) && isImageRightsCompliant(t.imageRightsDecision);
    return {
      id: p.id,
      talentId: p.talentId,
      nom: t.nom,
      prenom: t.prenom,
      niveau: t.niveau,
      schoolName: t.school?.name ?? null,
      ready,
      email: t.email,
      parentEmail: t.parentEmail,
    };
  });

  const availableNiveaux = Array.from(
    new Set(rows.map((r) => r.niveau).filter((n): n is string => !!n)),
  ).sort(compareNiveaux);

  return { event, timezone, origin, availableNiveaux, rows };
};
