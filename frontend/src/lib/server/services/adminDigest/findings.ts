/**
 * What the weekly admin digest says, read off the services it shares with the
 * admin API.
 *
 * Pure: the payloads come in already read (`index.ts` reads them), and a
 * `DigestDocument` comes out for `render.ts` to turn into HTML and text. Copy is
 * written here and only here, so the two parts of the mail cannot disagree.
 *
 * The mail is a list of findings, each with a severity. Those that need acting
 * on now (`urgent`) open the mail under « À traiter en priorité » and name it in
 * the subject; the rest stay in their topic section. Every section yields at
 * least one finding, its all-clear line included, so a section is left out only
 * when everything it had to say was lifted to the top. The mail used to be the
 * same four sections in the same order every week with an events count for a
 * subject, so a stale Salesforce feed or an overdue erasure request sat at the
 * bottom of a mail that looked like last week's.
 *
 * "Nouveau" is counted from `baseline`: the moment the previous digest that
 * reached somebody read its figures, or seven days back before there was one
 * (`ledger.ts`). The services count it, from that same instant, so the inbox
 * and a chat asking with `since` read the same numbers.
 */

import type {
  EventsConfigList,
  EventsConfigSince,
} from '$lib/server/services/adminStats/eventsList';
import type {
  SyncHealth,
  SyncHealthSince,
} from '$lib/server/services/adminStats/syncHealth';
import type { getDataFreshness } from '$lib/server/services/adminStats/dataFreshness';
import type {
  DeletionQueue,
  DeletionQueueSince,
  PdfJobsHealth,
  PdfJobsSince,
} from '$lib/server/services/adminStats/opsQueues';
import type { getFeatureAdoptionGaps } from '$lib/server/services/adminStats/featureUsage';
import type { EmargementCoverage } from '$lib/server/services/adminStats/emargementCoverage';
import {
  EVENT_MISSING_LABELS,
  IMMINENT_WITHIN_DAYS,
  SOON_WITHIN_DAYS,
  type PreparationHorizon,
} from '$lib/domain/eventReadiness';
import type { DigestBlock, DigestDocument, Segment } from './render';

/** How many events to list per band before deferring to the cockpit. */
export const LISTED_EVENTS = 15;

/**
 * The adoption window, in days.
 *
 * Wider than the weekly cadence on purpose: a feature unused for one week is
 * noise (a stage between two cohorts uses almost nothing), a feature unused for a
 * quarter is a finding. So the list changes slowly, and that is why it appears
 * in the first digest of each month only (`adoptionDue`): printed every Monday,
 * the same names week after week taught the reader to skim the whole mail.
 */
export const ADOPTION_WINDOW_DAYS = 90;

/** How many unused features to name before deferring to the API. */
const LISTED_UNUSED = 8;

/** Where "nouveau" starts, and whether a previous digest set it (`ledger.ts`). */
export type DigestBaseline = { since: Date; previous: boolean };

/** The payloads the digest reads, each from the service the API answers with. */
export type DigestInput = {
  baseline: DigestBaseline;
  events: EventsConfigList & EventsConfigSince;
  sync: SyncHealth & SyncHealthSince;
  freshness: Awaited<ReturnType<typeof getDataFreshness>>;
  pdfJobs: PdfJobsHealth & PdfJobsSince;
  deletions: DeletionQueue & DeletionQueueSince;
  /** Restricted to the events still under way at the baseline or later. */
  emargement: EmargementCoverage;
  /** Null in a week that does not carry it: only the month's first digest does. */
  adoption: Awaited<ReturnType<typeof getFeatureAdoptionGaps>> | null;
};

/** The admin pages a figure links to, as paths, filtered to what it counts. */
export const DIGEST_PAGES = {
  dashboard: '/staff/admin',
  // `periode=prep` is the page's own « À préparer » filter, `isEventToPrepare`,
  // so the link lands on the set the mail counted and not on every upcoming
  // event, visible ones included.
  events: '/staff/admin/events?periode=prep',
  syncErrors: '/staff/admin/sync-errors',
  onboardingPdfs: '/staff/admin/onboarding-pdfs?statut=error',
  accountDeletions: '/staff/admin/account-deletions',
} as const;

type Severity = 'urgent' | 'action' | 'info';

type SectionKey = 'events' | 'emargement' | 'queues' | 'sync' | 'adoption';

type DigestFinding = {
  section: SectionKey;
  severity: Severity;
  /** What the subject line says of an urgent finding. */
  subject?: string;
  blocks: DigestBlock[];
};

/** Topic sections, in reading order. */
const SECTIONS: { key: SectionKey; title: string }[] = [
  { key: 'events', title: 'Événements à préparer' },
  { key: 'emargement', title: 'Émargement' },
  { key: 'queues', title: 'Files en attente' },
  { key: 'sync', title: 'Synchronisation' },
  { key: 'adoption', title: 'Adoption' },
];

/**
 * The order urgent findings open the mail in. Salesforce first, because every
 * other figure is only as current as the feed; then the erasure requests, which
 * carry a legal clock; then the events about to start.
 */
const URGENCY_ORDER: SectionKey[] = ['sync', 'queues', 'events'];

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

const link = (href: string, label: string): Segment => ({
  link: { href, label },
});

const strong = (n: number | string): Segment => ({ strong: String(n) });

const item = (...segments: Segment[]): DigestBlock => ({
  kind: 'item',
  segments,
});

const paragraph = (...segments: Segment[]): DigestBlock => ({
  kind: 'paragraph',
  segments,
});

const note = (...segments: Segment[]): DigestBlock => ({
  kind: 'note',
  segments,
});

const PARIS_DAY = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'Europe/Paris',
});

/** « depuis le point du lundi 2 novembre », or the seven-day fallback. */
function windowFr({ since, previous }: DigestBaseline): string {
  return previous
    ? `depuis le point du ${PARIS_DAY.format(since)}`
    : 'sur les 7 derniers jours';
}

/**
 * How many of `total` are new: « , dont 2 nouvelles depuis le point du lundi
 * 2 novembre », or « , toutes nouvelles … » when every one is, since « 1 erreur,
 * dont 1 nouvelle » reads as two facts where there is one. Nothing when none is.
 */
function ofWhichNew(
  n: number,
  total: number,
  baseline: DigestBaseline,
  words: { one: string; many: string; all: string },
): string {
  if (n === 0) return '';
  const window = windowFr(baseline);
  if (n === total) return `, ${total === 1 ? words.one : words.all} ${window}`;
  return `, dont ${n} ${plural(n, words.one, words.many)} ${window}`;
}

const HOURS = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

/** « 1,2 h », the decimal comma included. */
const hoursFr = (hours: number) => `${HOURS.format(hours)} h`;

// ── Events ───────────────────────────────────────────────────────────────────

type EventRow = EventsConfigList['list']['value'][number];

/**
 * What is left to do on one event, blockers first. « Ce qui manque » used to
 * print `missing` whole, where a cohort noun nobody needs sat beside the public
 * name that stops the event from going live, and read as just as urgent.
 */
function todoOf(row: EventRow): string {
  const blockers = row.activationBlockers;
  const rest = row.missing.filter(
    (m) => !blockers.includes(m) && m !== EVENT_MISSING_LABELS.activation,
  );
  const first = blockers.length
    ? `Bloque la mise en ligne : ${blockers.join(', ')}`
    : "Prêt, il reste à l'activer";
  return rest.length ? `${first} ; reste : ${rest.join(', ')}` : first;
}

function eventsTable(rows: EventRow[], since: Date): DigestBlock {
  return {
    kind: 'table',
    head: ['Événement (Salesforce)', 'Campus', 'Dates', 'À faire'],
    rows: rows.map((row) => [
      new Date(row.addedAt) >= since
        ? [row.salesforceName, ' (', { strong: 'nouveau' }, ')']
        : [row.salesforceName],
      [row.campus],
      [row.dateLabel],
      [todoOf(row)],
    ]),
  };
}

/** One band of the events to prepare: its lead, its rows, what it left out. */
function eventBand(
  input: DigestInput,
  horizon: Exclude<PreparationHorizon, 'later'>,
  lead: (n: number) => Segment[],
): DigestBlock[] {
  const { events, baseline } = input;
  const total = events.byHorizon.value[horizon];
  // The list is soonest first and capped, so the near bands are whole in it
  // unless more than the cap start within three weeks; the remainder is
  // counted off the band's total either way, never off the list.
  const listed = events.list.value
    .filter((row) => row.horizon === horizon)
    .slice(0, LISTED_EVENTS);
  const remaining = total - listed.length;
  return [
    paragraph(
      ...lead(total),
      ' ',
      link(DIGEST_PAGES.events, 'Voir sur la page Événements'),
      '.',
    ),
    eventsTable(listed, baseline.since),
    ...(remaining > 0
      ? [note(`Et ${remaining} ${plural(remaining, 'autre', 'autres')}.`)]
      : []),
  ];
}

function eventFindings(input: DigestInput): DigestFinding[] {
  const { events, baseline } = input;
  if (events.events.value === 0)
    return [
      {
        section: 'events',
        severity: 'info',
        blocks: [
          paragraph(
            'Aucun événement à préparer : tout ce qui arrive est configuré et visible.',
          ),
        ],
      },
    ];

  const { imminent, soon, later } = events.byHorizon.value;
  const findings: DigestFinding[] = [];

  if (imminent > 0)
    findings.push({
      section: 'events',
      severity: 'urgent',
      subject: `${imminent} ${plural(imminent, 'événement à préparer', 'événements à préparer')} cette semaine`,
      blocks: eventBand(input, 'imminent', (n) => [
        strong(n),
        ` ${plural(n, 'événement commence', 'événements commencent')} dans les ${IMMINENT_WITHIN_DAYS} jours, ou ${plural(n, 'a', 'ont')} déjà commencé, sans être ${plural(n, 'visible', 'visibles')} dans l'espace dev.`,
      ]),
    });

  if (soon > 0)
    findings.push({
      section: 'events',
      severity: 'action',
      blocks: eventBand(input, 'soon', (n) => [
        strong(n),
        ` ${plural(n, 'événement commence', 'événements commencent')} dans les ${SOON_WITHIN_DAYS} jours et ${plural(n, "n'est", 'ne sont')} pas encore ${plural(n, 'visible', 'visibles')} dans l'espace dev.`,
      ]),
    });

  if (later > 0)
    findings.push({
      section: 'events',
      severity: 'info',
      blocks: [
        paragraph(
          strong(later),
          ` ${plural(later, 'autre événement à préparer commence', 'autres événements à préparer commencent')} dans plus de ${SOON_WITHIN_DAYS} jours. `,
          link(DIGEST_PAGES.events, 'Voir sur la page Événements'),
          '.',
        ),
      ],
    });

  const added = events.addedSince.value;
  if (added > 0)
    findings.push({
      section: 'events',
      severity: 'info',
      blocks: [
        note(
          `Parmi les événements à préparer, ${added} ${plural(added, 'est arrivé', 'sont arrivés')} dans Jump ${windowFr(baseline)}.`,
        ),
      ],
    });

  return findings;
}

// ── Émargement ───────────────────────────────────────────────────────────────

/** How many events with unkept half-days to name before deferring to the API. */
const LISTED_UNKEPT = 10;

const capitalised = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Last week's registers with a half-day nobody filled in. Such a half-day reads
 * as the whole cohort absent, in the attendance figures and on every talent's
 * record, and it is only cheap to put right while the team still remembers who
 * came: a week later, nobody does. Silent when every register was kept.
 */
function emargementFindings({
  emargement,
  baseline,
}: DigestInput): DigestFinding[] {
  const n = emargement.eventsWithUnkeptSlots.value;
  if (n === 0) return [];
  const unkept = emargement.perEvent.value.filter((e) => e.unkeptSlots > 0);
  const listed = unkept.slice(0, LISTED_UNKEPT);
  const remaining = n - listed.length;
  return [
    {
      section: 'emargement',
      severity: 'action',
      blocks: [
        paragraph(
          `${capitalised(windowFr(baseline))}, `,
          strong(n),
          ` ${plural(n, 'événement a', 'événements ont')} laissé des demi-journées sans aucun pointage : la cohorte y compte comme absente tant que la feuille n'est pas remplie.`,
        ),
        ...listed.map((e) =>
          item(
            `${e.event} (${e.campus}, ${e.dateLabel}) : `,
            strong(e.unkeptSlots),
            ` ${plural(e.unkeptSlots, 'demi-journée', 'demi-journées')} sur ${e.elapsedSlots} sans pointage.`,
          ),
        ),
        ...(remaining > 0
          ? [note(`Et ${remaining} ${plural(remaining, 'autre', 'autres')}.`)]
          : []),
      ],
    },
  ];
}

// ── Queues ───────────────────────────────────────────────────────────────────

// Two queues nothing else chases. A failed document means a talent has no
// règlement to download; an overdue erasure request is a legal exposure with
// a clock on it, and until now it only surfaced if somebody opened the page.
function queueFindings({
  pdfJobs,
  deletions,
  baseline,
}: DigestInput): DigestFinding[] {
  const failed = pdfJobs.failed.value;
  const overdue = deletions.overdue.value;
  const pending = deletions.pending.value;
  const findings: DigestFinding[] = [];

  if (overdue > 0)
    findings.push({
      section: 'queues',
      severity: 'urgent',
      subject: `${overdue} ${plural(overdue, 'demande de suppression hors délai', 'demandes de suppression hors délai')}`,
      blocks: [
        item(
          strong(overdue),
          ` ${plural(overdue, 'demande de suppression de compte a dépassé', 'demandes de suppression de compte ont dépassé')} le délai que nous nous imposons${ofWhichNew(deletions.overdueSince.value, overdue, baseline, { one: 'devenue hors délai', many: 'devenues hors délai', all: 'toutes devenues hors délai' })}. `,
          link(DIGEST_PAGES.accountDeletions, 'Voir les demandes'),
          '.',
        ),
      ],
    });
  else if (pending > 0)
    findings.push({
      section: 'queues',
      severity: 'info',
      blocks: [
        item(
          `${pending} ${plural(pending, 'demande de suppression de compte est en attente', 'demandes de suppression de compte sont en attente')}, encore dans les délais${ofWhichNew(deletions.pendingSince.value, pending, baseline, { one: 'arrivée', many: 'arrivées', all: 'toutes arrivées' })}.`,
        ),
      ],
    });

  if (failed > 0)
    findings.push({
      section: 'queues',
      severity: 'action',
      blocks: [
        item(
          strong(failed),
          ` ${plural(failed, 'génération de document en échec', 'générations de document en échec')}${ofWhichNew(pdfJobs.failedSince.value, failed, baseline, { one: 'nouvelle', many: 'nouvelles', all: 'toutes nouvelles' })} : tant qu'${plural(failed, "elle n'est pas relancée", 'elles ne sont pas relancées')}, ${plural(failed, "le talent concerné n'a", "les talents concernés n'ont")} pas de document à télécharger. `,
          link(DIGEST_PAGES.onboardingPdfs, 'Voir la file'),
          '.',
        ),
      ],
    });

  if (findings.length === 0)
    findings.push({
      section: 'queues',
      severity: 'info',
      blocks: [
        paragraph(
          'Aucune file en attente : documents générés, aucune demande de suppression en retard.',
        ),
      ],
    });
  return findings;
}

// ── Synchronisation ──────────────────────────────────────────────────────────

function syncFindings({
  sync,
  freshness,
  baseline,
}: DigestInput): DigestFinding[] {
  // Freshness is "when did data last land", whichever pass brought it, and
  // `dataFreshness` owns that judgement for the whole codebase. `sync` splits
  // the two passes because an operator needs them apart; this mail does not,
  // and reading one of them here would call a platform stale on the strength of
  // a pass that is simply not due yet.
  const last = freshness.value;
  const openErrors = sync.openErrors.value;
  const prunesHeld = sync.prunesHeldEvents.value;
  const unrecognised = sync.unrecognisedStatuses.value;
  const unrecognisedEvents = sync.unrecognisedStatusEvents.value.length;
  const findings: DigestFinding[] = [];

  // Two lines, because they answer two questions and only one of them is ever
  // reassuring. `last === null` means the sync has NEVER run, worse than merely
  // stale, so it must not sit next to "aucune erreur en attente": that zero is
  // true here only because no sync ran to produce an error, and pairing them
  // reads as reassurance for the worst possible state.
  if (!last)
    findings.push({
      section: 'sync',
      severity: 'urgent',
      subject: 'aucune synchronisation Salesforce enregistrée',
      blocks: [
        paragraph(
          "Aucune synchronisation Salesforce n'a jamais été enregistrée : à vérifier en priorité sur ",
          link(DIGEST_PAGES.dashboard, 'le tableau de bord admin'),
          '.',
        ),
      ],
    });
  else if (last.stale)
    findings.push({
      section: 'sync',
      severity: 'urgent',
      subject: `Salesforce muet depuis ${hoursFr(last.ageHours)}`,
      blocks: [
        paragraph(
          'Dernière synchronisation Salesforce il y a ',
          strong(hoursFr(last.ageHours)),
          ' : à vérifier sur ',
          link(DIGEST_PAGES.dashboard, 'le tableau de bord admin'),
          '.',
        ),
      ],
    });
  else
    findings.push({
      section: 'sync',
      severity: 'info',
      blocks: [
        paragraph(
          'Dernière synchronisation Salesforce il y a ',
          strong(hoursFr(last.ageHours)),
          '.',
        ),
      ],
    });

  if (openErrors > 0)
    findings.push({
      section: 'sync',
      severity: 'action',
      blocks: [
        paragraph(
          strong(openErrors),
          ` ${plural(openErrors, 'erreur', 'erreurs')} de synchronisation ${plural(openErrors, 'est ouverte', 'sont ouvertes')}${ofWhichNew(sync.openErrorsSince.value, openErrors, baseline, { one: 'nouvelle', many: 'nouvelles', all: 'toutes nouvelles' })}, avec ce qu'elles empêchent et qui peut les corriger sur `,
          link(DIGEST_PAGES.syncErrors, 'la page dédiée'),
          '.',
        ),
      ],
    });
  else if (last)
    findings.push({
      section: 'sync',
      severity: 'info',
      blocks: [paragraph('Aucune erreur de synchronisation ouverte.')],
    });

  // A held prune fails nothing, so without this line it reaches nobody: the run
  // closes ok and the freshness above reads healthy. Its two ways out are a
  // nameless contact completed in Salesforce (listed on the page linked) or
  // confirming that the campaign was emptied, which only the admin API can do.
  if (prunesHeld > 0)
    findings.push({
      section: 'sync',
      severity: 'action',
      blocks: [
        paragraph(
          strong(prunesHeld),
          ` ${plural(prunesHeld, 'événement garde', 'événements gardent')} des inscriptions qu'une reprise complète n'a pas pu confirmer comme retirées de Salesforce${ofWhichNew(sync.prunesHeldSince.value, prunesHeld, baseline, { one: 'nouveau', many: 'nouveaux', all: 'tous nouveaux' })}, et rien n'y est supprimé sans preuve. Les contacts sans nom qui les retiennent sont sur `,
          link(DIGEST_PAGES.syncErrors, 'la page dédiée'),
          " ; une campagne réellement vidée se confirme par l'API d'administration.",
        ),
      ],
    });

  // Same reason as the held prunes: a status Jump does not know fails nothing,
  // it only masks the enrolment from the dev space, and that is how every
  // attendee went missing for a month before anyone saw it (#368).
  if (unrecognised > 0)
    findings.push({
      section: 'sync',
      severity: 'action',
      blocks: [
        paragraph(
          strong(unrecognised),
          ` ${plural(unrecognised, 'inscription porte', 'inscriptions portent')} un statut Salesforce que Jump ne connaît pas, sur ${unrecognisedEvents}${sync.unrecognisedStatusEventsTruncated ? ' événements ou plus' : ` ${plural(unrecognisedEvents, 'événement', 'événements')}`} : ${plural(unrecognised, 'elle est bien dans Jump mais masquée', 'elles sont bien dans Jump mais masquées')} de l'espace dev. Les statuts reçus et les événements concernés se lisent par l'API d'administration.`,
        ),
      ],
    });

  return findings;
}

// ── Adoption ─────────────────────────────────────────────────────────────────

// Adoption. Two lists rather than a score, because the two decisions differ: a
// feature no campus touched is a candidate for removal, one a single campus
// uses is the opposite and a training question.
//
// `aRetirer` is null when NOTHING was measured over the window, which is an
// absence of MEASUREMENT and not an absence of use. Saying so beats the
// alternative: with nothing recorded the never-used list is every feature in
// Jump, and a mail naming all of them would read as a finding.
//
// "Nothing measured" has to mean it whichever store answers, and this window
// is the case in point: ninety days always sits inside the raw retention, so
// the cube is never consulted here. While the detailed path asserted it had
// measured, this branch was unreachable and the first digests after deploy
// would have named the whole catalogue as unused.
function adoptionFindings({ adoption }: DigestInput): DigestFinding[] {
  if (!adoption) return [];
  const info = (block: DigestBlock): DigestFinding => ({
    section: 'adoption',
    severity: 'info',
    blocks: [block],
  });

  if (adoption.aRetirer.value === null)
    return [
      info(
        paragraph(
          'Adoption non mesurable ce mois-ci : les totaux mensuels n’ont pas été calculés sur la période, ce qui n’est pas la même chose qu’une absence d’usage.',
        ),
      ),
    ];

  const unused = adoption.jamaisUtilisees.value;
  const abandoned = adoption.devenuesInutilisees.value;
  const singleCampus = adoption.unSeulCampus.value;
  const listedUnused = unused.slice(0, LISTED_UNUSED);
  const remainingUnused = unused.length - listedUnused.length;
  const findings: DigestFinding[] = [];

  // First, because it is the strong signal: a feature that was never used may
  // never have been found, one that stopped being used was found and then
  // abandoned.
  if (abandoned.length > 0)
    findings.push(
      info(
        item(
          strong(abandoned.length),
          ` ${plural(abandoned.length, 'fonctionnalité servait', 'fonctionnalités servaient')} l’an dernier et ne ${plural(abandoned.length, 'sert', 'servent')} plus : ${abandoned
            .slice(0, LISTED_UNUSED)
            .map((f) => f.libelle)
            .join(', ')}.`,
        ),
      ),
    );
  if (unused.length > 0)
    findings.push(
      info(
        item(
          strong(unused.length),
          ` ${plural(unused.length, 'fonctionnalité n’a', 'fonctionnalités n’ont')} servi à personne depuis ${ADOPTION_WINDOW_DAYS} jours : ${listedUnused.map((f) => f.libelle).join(', ')}${remainingUnused > 0 ? `, et ${remainingUnused} ${plural(remainingUnused, 'autre', 'autres')}` : ''}.`,
        ),
      ),
    );
  if (singleCampus.length > 0)
    findings.push(
      info(
        item(
          strong(singleCampus.length),
          ` ${plural(singleCampus.length, 'fonctionnalité n’est utilisée que par un seul campus', 'fonctionnalités ne sont utilisées que par un seul campus')} : ${singleCampus
            .slice(0, LISTED_UNUSED)
            .map((f) => `${f.libelle} (${f.campus})`)
            .join(', ')}.`,
        ),
      ),
    );

  if (findings.length === 0)
    findings.push(
      info(
        paragraph(
          `Toutes les fonctionnalités mesurées ont servi au moins une fois sur les ${ADOPTION_WINDOW_DAYS} derniers jours, et aucune n’est restée cantonnée à un seul campus.`,
        ),
      ),
    );
  return findings;
}

// ── The mail ─────────────────────────────────────────────────────────────────

/** At most this many urgent findings are named in the subject. */
const SUBJECT_NAMES = 2;

function subjectOf(urgent: DigestFinding[]): string {
  const named = urgent.flatMap((f) => (f.subject ? [f.subject] : []));
  if (named.length === 0) return "Jump - point hebdomadaire, rien d'urgent";
  const shown = named.slice(0, SUBJECT_NAMES);
  const more = named.length - shown.length;
  return `Jump - ${shown.join(', ')}${more > 0 ? ` et ${more} ${plural(more, 'autre point urgent', 'autres points urgents')}` : ''}`;
}

/** The whole mail, in reading order. */
export function composeDigest(input: DigestInput): DigestDocument {
  const findings = [
    ...eventFindings(input),
    ...emargementFindings(input),
    ...queueFindings(input),
    ...syncFindings(input),
    ...adoptionFindings(input),
  ];
  const urgent = findings
    .filter((f) => f.severity === 'urgent')
    .sort(
      (a, b) =>
        URGENCY_ORDER.indexOf(a.section) - URGENCY_ORDER.indexOf(b.section),
    );

  const topics = SECTIONS.flatMap(({ key, title }) => {
    const rest = findings.filter(
      (f) => f.section === key && f.severity !== 'urgent',
    );
    return rest.length
      ? [{ title, blocks: rest.flatMap((f) => f.blocks) }]
      : [];
  });

  return {
    subject: subjectOf(urgent),
    title: 'Point hebdomadaire',
    intro: `Ce qui demande une action, et ce qui est nouveau ${windowFr(input.baseline)}.`,
    sections: [
      ...(urgent.length
        ? [
            {
              title: 'À traiter en priorité',
              blocks: urgent.flatMap((f) => f.blocks),
            },
          ]
        : []),
      ...topics,
    ],
    footer:
      "Message automatique, envoyé chaque lundi aux administrateurs désignés par l'équipe Jump. L'adoption des fonctionnalités paraît dans le premier point de chaque mois.",
  };
}
