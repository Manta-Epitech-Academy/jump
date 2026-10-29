import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import type { ScopedPrismaClient } from '$lib/server/db/scoped';
import type { EventRecord } from '$lib/server/services/stageContext';
import {
  resolvePublishedEventForm,
  type FeedbackFormGraph,
} from '$lib/server/feedbackForms';
import { resolveEventClosingIdentity } from '$lib/server/closingTemplates';
import { answerCells, buildSubmissionWhere } from '$lib/server/feedbackStats';
import { isSlotClosed } from '$lib/server/presence/slotClosure';
import { loadInscritsCohort } from '$lib/server/services/inscritsCohort';
import { loadClosingsRoster } from '$lib/server/services/closingsRoster';
import type { XlsxSheet } from '$lib/server/xlsx';
import { visibleParticipationWhere } from '$lib/domain/sfMemberStatus';
import {
  EVENT_MODULES,
  eventHasModule,
  type EventModuleKey,
} from '$lib/domain/eventModules';
import { niveauLabel } from '$lib/domain/niveau';
import { civiliteLabel } from '$lib/domain/profile';
import { parcoursLabel } from '$lib/domain/enrolmentHistory';
import {
  INSCRIT_STATUS_LABELS,
  RULES_STATUS_LABELS,
} from '$lib/domain/dossierCompliance';
import {
  imageRightsDisplayStatus,
  IMAGE_RIGHTS_DISPLAY_LABELS,
} from '$lib/domain/imageRights';
import {
  presenceSlots,
  slotLabelLong,
  statusLabelFr,
  effectiveStatus,
  dbDateToKey,
  indexPresences,
  cellOf,
} from '$lib/domain/eventPresence';
import {
  CLOSING_RECOMMENDATIONS,
  CLOSING_STATUS_LABELS,
} from '$lib/domain/closing';
import { closingVerdict, conductorLabel } from '$lib/domain/closingsRoster';

/**
 * The sheets an event's exports are made of, one builder per section. Each
 * page's own export downloads its sheet alone, and the event home's export
 * gathers the sheets of every section the event has into one workbook, so a
 * section reads the same in both files.
 *
 * A builder does not gate: the route calling it has already checked the
 * section is on (and its data gate, a form or a grid), exactly as it would for
 * its own page.
 */

/**
 * The Inscrits sheet. Richer than the on-screen table on purpose: a download is
 * where the dev actually works the cohort, so it adds student and parent
 * phone/email and splits the folded "Statut" into its two gates (règlement,
 * droit à l'image), and the file doubles as a contact list and a "who owes
 * what" triage sheet. The contacts are read here only, so they never travel in
 * the page's payload.
 *
 * `talentIds` narrows it to the rows the Inscrits page is showing, in its
 * order; without it, the whole roster by nom.
 */
export async function inscritsSheet(
  db: ScopedPrismaClient,
  event: EventRecord,
  timezone: string,
  { talentIds }: { talentIds?: readonly string[] } = {},
): Promise<XlsxSheet> {
  const [cohort, contacts] = await Promise.all([
    loadInscritsCohort(db, event, timezone, { talentIds }),
    talentIds?.length === 0
      ? []
      : db.participation.findMany({
          where: {
            eventId: event.id,
            ...(talentIds ? { talentId: { in: [...talentIds] } } : {}),
            ...visibleParticipationWhere,
          },
          select: {
            talentId: true,
            talent: {
              select: {
                phone: true,
                parentPrenom: true,
                parentNom: true,
                parentEmail: true,
                parentPhone: true,
              },
            },
          },
        }),
  ]);
  const contactOf = new Map(contacts.map((c) => [c.talentId, c.talent]));

  // Preserve the page's filtered + sorted order when it sent one.
  const byTalent = new Map(cohort.rows.map((r) => [r.talentId, r]));
  const ordered = talentIds
    ? talentIds
        .map((id) => byTalent.get(id))
        .filter((r): r is NonNullable<typeof r> => !!r)
    : cohort.rows;

  const rows = ordered.map((r) => {
    const contact = contactOf.get(r.talentId);
    const parentName = [contact?.parentPrenom, contact?.parentNom]
      .filter(Boolean)
      .join(' ');
    return [
      civiliteLabel(r.civilite),
      r.prenom,
      r.nom,
      r.xp,
      parcoursLabel(r.priorEnrolments),
      r.techInterests.map((i) => i.nom).join(', '),
      r.schoolName ?? '',
      r.niveau ? niveauLabel(r.niveau) : '',
      INSCRIT_STATUS_LABELS[r.status],
      r.connected ? 'Oui' : 'Non',
      RULES_STATUS_LABELS[r.rulesStatus],
      IMAGE_RIGHTS_DISPLAY_LABELS[
        imageRightsDisplayStatus(r.imageStatus, r.studentSigned)
      ],
      r.email ?? '',
      contact?.phone ?? '',
      parentName,
      contact?.parentEmail ?? '',
      contact?.parentPhone ?? '',
    ];
  });

  return {
    name: 'Inscrits',
    headers: [
      'Genre',
      'Prénom',
      'Nom',
      'XP',
      'Parcours',
      'Intérêts tech',
      'Lycée',
      'Niveau',
      'Statut',
      'Connexion',
      'Règlement intérieur',
      "Droit à l'image",
      'Email élève',
      'Téléphone élève',
      'Parent',
      'Email parent',
      'Téléphone parent',
    ],
    rows,
    colWidths: [
      8, 16, 16, 8, 22, 26, 30, 10, 12, 11, 18, 16, 26, 16, 22, 26, 16,
    ],
  };
}

// The émargement sheet's roster: the on-screen roster plus the two phone
// columns, which are loaded only here, never in the page's stream.
const PRESENCE_EXPORT_SELECT = {
  talentId: true,
  talent: {
    select: {
      nom: true,
      prenom: true,
      niveau: true,
      phone: true,
      parentPhone: true,
    },
  },
} satisfies Prisma.ParticipationSelect;

/**
 * The full-period émargement sheet: one row per enrolled talent, one column per
 * créneau (≈20 over a 2-week stage, a single one for an afternoon club), each
 * cell the recorded state (an unmarked talent reads "Absent" once the créneau is
 * closed, "En attente" while it is still open). Always the whole grid (not the
 * on-screen filter), so the file is the complete attendance record.
 */
export async function presenceSheet(
  db: ScopedPrismaClient,
  event: EventRecord,
  timezone: string,
  now: Date = new Date(),
): Promise<XlsxSheet> {
  const slots = presenceSlots(event, timezone);

  const [participations, presenceRows, closureRows] = await Promise.all([
    db.participation.findMany({
      where: { eventId: event.id, ...visibleParticipationWhere },
      select: PRESENCE_EXPORT_SELECT,
      orderBy: [{ talent: { nom: 'asc' } }, { talent: { prenom: 'asc' } }],
    }),
    db.eventPresence.findMany({
      where: { eventId: event.id },
      select: {
        talentId: true,
        day: true,
        slot: true,
        status: true,
        source: true,
      },
    }),
    db.eventPresenceClosure.findMany({
      where: { eventId: event.id },
      select: { day: true, slot: true },
    }),
  ]);

  const index = indexPresences(
    presenceRows.map((r) => ({ ...r, day: dbDateToKey(r.day) })),
  );

  // An unmarked talent in a closed créneau exports as absent (the same
  // projection the screen shows), never a stored row.
  const closed = new Set(
    slots
      .filter((s) => isSlotClosed(s.day, s.slot, closureRows, timezone, now))
      .map((s) => s.key),
  );

  const rows = participations.map((p) => {
    const t = p.talent;
    const base = [
      t.prenom,
      t.nom,
      t.niveau ? niveauLabel(t.niveau) : '',
      t.phone ?? '',
      t.parentPhone ?? '',
    ];
    const slotCells = slots.map((s) =>
      statusLabelFr(
        effectiveStatus(
          cellOf(index, p.talentId, s.day, s.slot).status,
          closed.has(s.key),
        ),
      ),
    );
    return [...base, ...slotCells];
  });

  return {
    name: 'Émargement',
    headers: [
      'Prénom',
      'Nom',
      'Niveau',
      'Tél. élève',
      'Tél. parent',
      ...slots.map(slotLabelLong),
    ],
    rows,
    colWidths: [16, 16, 10, 16, 16, ...slots.map(() => 18)],
  };
}

/**
 * The feedback sheet: one row per answer of the cohort the dev space shows
 * (`shownCohortOf`), one column per question that is not an identity field.
 * XLSX inline strings are inert, so no CSV-style formula guard is needed on the
 * untrusted respondent input.
 */
export async function feedbackSheet(
  event: Pick<EventRecord, 'id'>,
  form: FeedbackFormGraph,
): Promise<XlsxSheet> {
  const submissions = await prisma.feedback_Submission.findMany({
    where: buildSubmissionWhere(form.id, { shownCohortOf: event.id }),
    orderBy: { submittedAt: 'asc' },
    include: {
      talent: {
        select: { prenom: true, nom: true, user: { select: { email: true } } },
      },
      answers: {
        select: {
          questionId: true,
          freeText: true,
          selectedOptions: { select: { option: { select: { label: true } } } },
        },
      },
    },
  });

  const columns = form.questions.filter((q) => q.identityField == null);
  return {
    name: 'Feedback',
    headers: ['Prenom', 'Nom', 'E-mail', ...columns.map((q) => q.prompt)],
    rows: submissions.map((sub) => [
      sub.talent?.prenom ?? sub.respondentFirstName ?? '',
      sub.talent?.nom ?? sub.respondentLastName ?? '',
      sub.talent?.user?.email ?? sub.respondentEmail ?? '',
      ...answerCells(sub.answers, columns),
    ]),
    colWidths: [16, 16, 24, ...columns.map(() => 28)],
  };
}

/**
 * The closings sheet: where each enrolment stands, who conducted it, when, and
 * the team's verdict once finalised. Never the answers and never a note
 * (`closings.md`): the file leaves the platform, and the team's prose about a
 * minor stays on the fiche.
 */
export async function closingsSheet(
  db: ScopedPrismaClient,
  event: Pick<EventRecord, 'id'>,
  timezone: string,
): Promise<XlsxSheet> {
  const { rows } = await loadClosingsRoster(db, event.id);
  const dateFmt = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: timezone,
  });
  return {
    name: 'Closings',
    headers: ['Prénom', 'Nom', 'Statut', 'Mené par', 'Date', 'Avis'],
    rows: rows.map((r) => {
      const verdict = closingVerdict(r);
      return [
        r.prenom,
        r.nom,
        CLOSING_STATUS_LABELS[r.status],
        conductorLabel(r) ?? '',
        r.conductedAt ? dateFmt.format(new Date(r.conductedAt)) : '',
        verdict ? CLOSING_RECOMMENDATIONS[verdict].label : '',
      ];
    }),
    colWidths: [16, 16, 12, 22, 12, 26],
  };
}

/**
 * Which sheets the event's whole export carries: a section's sheet only when
 * its own page would answer, the module on and its data gate passed (a
 * published form for Feedback, a grid for Closings). The same reading the
 * section's own export makes, so the whole file never holds a section its page
 * would refuse.
 */
export type EventWorkbookPlan = {
  inscrits: boolean;
  emargement: boolean;
  /** The form the Feedback sheet reads, null when there is no such sheet. */
  feedbackForm: FeedbackFormGraph | null;
  closings: boolean;
};

export async function planEventWorkbook(
  event: EventRecord,
): Promise<EventWorkbookPlan> {
  const on = (key: EventModuleKey) => eventHasModule(event.modules, key);
  const [feedbackForm, closingGrid] = await Promise.all([
    on(EVENT_MODULES.BILAN) ? resolvePublishedEventForm(event) : null,
    on(EVENT_MODULES.CLOSINGS) ? resolveEventClosingIdentity(event) : null,
  ]);
  return {
    inscrits: on(EVENT_MODULES.INSCRITS),
    emargement: on(EVENT_MODULES.EMARGEMENT),
    feedbackForm,
    closings: closingGrid !== null,
  };
}

/** The sections the plan carries, in the order of the event's menu: the one
 *  list the export's sheets and the home's description of it both read. */
export function workbookSections(plan: EventWorkbookPlan): string[] {
  return [
    plan.inscrits && 'Inscrits',
    plan.emargement && 'Émargement',
    plan.feedbackForm && 'Feedback',
    plan.closings && 'Closings',
  ].filter((s): s is string => typeof s === 'string');
}

/** The sheets of the whole export, in the order of the event's menu. */
export async function eventWorkbookSheets(
  db: ScopedPrismaClient,
  event: EventRecord,
  timezone: string,
  plan: EventWorkbookPlan,
): Promise<XlsxSheet[]> {
  const sheets = await Promise.all([
    plan.inscrits ? inscritsSheet(db, event, timezone) : null,
    plan.emargement ? presenceSheet(db, event, timezone) : null,
    plan.feedbackForm ? feedbackSheet(event, plan.feedbackForm) : null,
    plan.closings ? closingsSheet(db, event, timezone) : null,
  ]);
  return sheets.filter((s): s is XlsxSheet => s !== null);
}
