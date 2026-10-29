import type { Prisma } from '@prisma/client';
import type { ScopedPrismaClient } from '$lib/server/db/scoped';
import type { EventRecord } from '$lib/server/services/stageContext';
import { visibleParticipationWhere } from '$lib/domain/sfMemberStatus';
import { rulesStatus, inscritStatus } from '$lib/domain/dossierCompliance';
import { imageRightsStatus } from '$lib/domain/imageRights';
import { schoolYearOf } from '$lib/domain/schoolYear';
import { countPriorEnrolments } from '$lib/server/services/enrolmentHistory';
import {
  loadEventDossierSignatures,
  NO_DOSSIER_SIGNATURES,
} from './eventDossierSignatures';
import type {
  InscritInterest,
  InscritRow,
  InscritsCohort,
} from '$lib/domain/inscritsRoster';

// The talent columns the roster shows and filters on, and nothing else: the
// cohort fetch (~200 rows) must not drag the full Talent row (Salesforce-mirror
// columns). Contact details are not here either: the page never shows them, so
// the XLSX export reads them on its own (`inscrits/export/+server.ts`) and they never
// reach the page's payload.
const INSCRIT_TALENT_SELECT = {
  id: true,
  nom: true,
  prenom: true,
  niveau: true,
  // Cumulative XP (cached projection of the XpGrant ledger): the cohort table's
  // engagement signal - who is actually training on JUMP. The events count
  // stays off here: the Parcours column carries the history, the fiche the
  // fuller breakdown.
  xp: true,
  user: { select: { email: true } },
  // Neither the règlement signatures NOR the image-rights decision are selected
  // here: all three belong to the dossier of the EVENT's school year, which the
  // flat columns cannot answer for (they hold the talent's most recent dossier).
  // They are read from `loadEventDossierSignatures` instead, so they cannot
  // drift onto the wrong year. `imageRightsDecision` was still here when only
  // the règlement was annual, which is how one badge came to answer about two
  // different years.
  //
  // Has the talent ever genuinely logged in? Gates the statut badge. Read from
  // the durable `firstLoginAt` projection (stamped once on first real,
  // non-impersonated login), not a bauth_session probe: sessions are deleted by
  // logout / identity repair, which would drop a real login back to "never
  // connected". Same definition as the fiche's "première connexion".
  firstLoginAt: true,
  school: { select: { id: true, name: true } },
  // The Genre column, and the parcours wording agrees with it.
  civilite: true,
  // The Tech column. The interest rows are a handful of short strings, so
  // they ride the cohort rather than a second catalogue query.
  interests: {
    where: { interest: { kind: 'tech' } },
    select: {
      interest: { select: { id: true, nom: true, emoji: true, order: true } },
    },
  },
} satisfies Prisma.TalentSelect;

const INSCRIT_PARTICIPATION_SELECT = {
  id: true,
  talentId: true,
  talent: { select: INSCRIT_TALENT_SELECT },
  sfMemberStatus: true,
} satisfies Prisma.ParticipationSelect;

type InterestLink = { interest: InscritInterest & { order: number } };

/** A talent's tech interests in the catalogue's own order. */
function techInterests(links: InterestLink[]): InscritInterest[] {
  return links
    .map((l) => l.interest)
    .sort((a, b) => a.order - b.order)
    .map(({ id, nom, emoji }) => ({ id, nom, emoji }));
}

/**
 * How many people the dev space shows on an event, the cohort every page of the
 * event lists. A page's shell reads it before streaming its body, so it offers
 * no export of an event with no one in it: that export is an empty workbook.
 */
export async function countShownCohort(
  db: ScopedPrismaClient,
  eventId: string,
): Promise<number> {
  return db.participation.count({
    where: { eventId, ...visibleParticipationWhere },
  });
}

/**
 * The event's roster as the Inscrits page and its export show it: one row per
 * enrolment the dev space shows, with everything a column displays or filters
 * on. One builder for both, so the downloaded sheet can never describe a talent
 * differently from the line it was exported from.
 *
 * `talentIds` narrows it to the rows the export was asked for; the page takes
 * the whole cohort, ordered by nom as the table first shows it.
 */
export async function loadInscritsCohort(
  db: ScopedPrismaClient,
  event: EventRecord,
  timezone: string,
  { talentIds }: { talentIds?: readonly string[] } = {},
): Promise<InscritsCohort> {
  // The règlement applying to this event is the one of the event's own school
  // year, so that is the dossier the statut column reads (see
  // `./eventDossierSignatures`).
  const schoolYear = schoolYearOf(event.date, timezone).label;

  const [participations, dossiers] = await Promise.all([
    db.participation.findMany({
      where: {
        eventId: event.id,
        ...visibleParticipationWhere,
        ...(talentIds ? { talentId: { in: [...talentIds] } } : {}),
      },
      select: INSCRIT_PARTICIPATION_SELECT,
      orderBy: [{ talent: { nom: 'asc' } }, { talent: { prenom: 'asc' } }],
    }),
    loadEventDossierSignatures(db, event.id, schoolYear),
  ]);
  const prior = await countPriorEnrolments(
    event.campusId,
    participations.map((p) => p.talentId),
    event.date,
  );

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
      civilite: t.civilite,
      niveau: t.niveau,
      schoolId: t.school?.id ?? null,
      schoolName: t.school?.name ?? null,
      xp: t.xp,
      priorEnrolments: prior.get(p.talentId) ?? 0,
      techInterests: techInterests(t.interests),
      status: inscritStatus(t.niveau, connected, rules, image),
      connected,
      rulesStatus: rules,
      imageStatus: image,
      studentSigned: dossier.rulesSignedAt != null,
      email: t.user?.email ?? null,
      sfMemberStatus: p.sfMemberStatus,
    };
  });

  return { rows };
}
