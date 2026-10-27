import type { Prisma } from '@prisma/client';
import type { ScopedPrismaClient } from '$lib/server/db/scoped';
import type { EventRecord } from '$lib/server/services/stageContext';
import { EVENT_MODULES, eventRunsClosings } from '$lib/domain/eventModules';
import { visibleParticipationWhere } from '$lib/domain/sfMemberStatus';
import { rulesStatus, inscritStatus } from '$lib/domain/dossierCompliance';
import { imageRightsStatus } from '$lib/domain/imageRights';
import { closingListStatus } from '$lib/domain/closing';
import { schoolYearOf } from '$lib/domain/schoolYear';
import { resolvePublishedEventForm } from '$lib/server/feedbackForms';
import {
  loadCohortSubmissions,
  recoQuestionOf,
} from '$lib/server/feedbackStats';
import { countPriorEnrolments } from '$lib/server/services/enrolmentHistory';
import { loadEventDossierSignatures, NO_DOSSIER_SIGNATURES } from './dossiers';
import type {
  InscritInterest,
  InscritRow,
  InscritsCohort,
} from './components/types';

// The talent columns the roster shows and filters on, and nothing else: the
// cohort fetch (~200 rows) must not drag the full Talent row (Salesforce-mirror
// columns). Contact details are not here either: the page never shows them, so
// the XLSX export reads them on its own (`export/+server.ts`) and they never
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
  // The Tech and Perso columns. The interest rows are a handful of short
  // strings, so they ride the cohort rather than a second catalogue query.
  interests: {
    select: {
      interest: {
        select: { id: true, nom: true, emoji: true, kind: true, order: true },
      },
    },
  },
} satisfies Prisma.TalentSelect;

const INSCRIT_PARTICIPATION_SELECT = {
  id: true,
  talentId: true,
  talent: { select: INSCRIT_TALENT_SELECT },
  sfMemberStatus: true,
} satisfies Prisma.ParticipationSelect;

type InterestLink = {
  interest: InscritInterest & { kind: string; order: number };
};

/** A talent's interests split by kind, each in the catalogue's own order. */
function splitInterests(links: InterestLink[]): {
  tech: InscritInterest[];
  perso: InscritInterest[];
} {
  const sorted = links.map((l) => l.interest).sort((a, b) => a.order - b.order);
  const chip = ({ id, nom, emoji }: InscritInterest) => ({ id, nom, emoji });
  return {
    tech: sorted.filter((i) => i.kind === 'tech').map(chip),
    perso: sorted.filter((i) => i.kind !== 'tech').map(chip),
  };
}

/**
 * The event's roster as the Inscrits page and its export show it: one row per
 * enrolment the dev space shows, with everything a column displays or filters
 * on. One builder for both, so the downloaded sheet can never describe a talent
 * differently from the line it was exported from.
 *
 * `talentIds` narrows it to the rows the export was asked for; the page takes
 * the whole cohort, ordered by nom as the table first shows it.
 *
 * A column whose data the event does not have comes back empty and says so:
 * `hasClosings` false when the event runs no closings, `reco` null when it has
 * no live form asking the recommendation question.
 */
export async function loadInscritsCohort(
  db: ScopedPrismaClient,
  event: EventRecord,
  timezone: string,
  { talentIds }: { talentIds?: readonly string[] } = {},
): Promise<InscritsCohort> {
  const hasClosings = eventRunsClosings({
    modules: event.modules,
    hasClosingTemplate: event.closingTemplateId !== null,
  });
  // The bilan module and a live form: the same pair the Bilan page needs, so
  // the column shows exactly when that page exists.
  const form = event.modules.has(EVENT_MODULES.BILAN)
    ? await resolvePublishedEventForm(event)
    : null;
  const reco = form ? recoQuestionOf(form) : null;

  // The règlement applying to this event is the one of the event's own school
  // year, so that is the dossier the statut column reads (see `./dossiers`).
  const schoolYear = schoolYearOf(event.date, timezone).label;

  const [participations, dossiers, closings, submissions] = await Promise.all([
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
    hasClosings
      ? db.closing_Record.findMany({
          where: { eventId: event.id },
          select: { talentId: true, status: true },
        })
      : [],
    form && reco
      ? loadCohortSubmissions(form.id, event.id, reco)
      : new Map<string, never>(),
  ]);
  const prior = await countPriorEnrolments(
    event.campusId,
    participations.map((p) => p.talentId),
    event.date,
  );
  const closingOf = new Map(closings.map((c) => [c.talentId, c]));

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
    const interests = splitInterests(t.interests);
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
      techInterests: interests.tech,
      persoInterests: interests.perso,
      status: inscritStatus(t.niveau, connected, rules, image),
      connected,
      rulesStatus: rules,
      imageStatus: image,
      studentSigned: dossier.rulesSignedAt != null,
      closingStatus: hasClosings
        ? closingListStatus(closingOf.get(p.talentId))
        : null,
      recoOptionId: submissions.get(p.talentId)?.recoOptionId ?? null,
      email: t.user?.email ?? null,
      sfMemberStatus: p.sfMemberStatus,
    };
  });

  return {
    rows,
    hasClosings,
    reco: reco ? { options: reco.options } : null,
  };
}
