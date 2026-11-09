/**
 * What the weekly admin digest says, read off the services it shares with the
 * admin API.
 *
 * Pure: the payloads come in already read (`index.ts` reads them), and a
 * `DigestDocument` comes out for `render.ts` to turn into HTML and text. Copy is
 * written here and only here, so the two parts of the mail cannot disagree.
 */

import type { getEventsConfigList } from '$lib/server/services/adminStats/eventsList';
import type { getSyncHealth } from '$lib/server/services/adminStats/syncHealth';
import type { getDataFreshness } from '$lib/server/services/adminStats/dataFreshness';
import type {
  getPdfJobsHealth,
  getAccountDeletionQueue,
} from '$lib/server/services/adminStats/opsQueues';
import type { getFeatureAdoptionGaps } from '$lib/server/services/adminStats/featureUsage';
import type {
  DigestBlock,
  DigestDocument,
  DigestSectionView,
  Segment,
} from './render';

/** How many events to list in the mail before deferring to the cockpit. */
export const LISTED_EVENTS = 15;

/**
 * The adoption window, in days.
 *
 * Wider than the weekly cadence on purpose: a feature unused for one week is
 * noise (a stage between two cohorts uses almost nothing), a feature unused for a
 * quarter is a finding. So the section repeats the same names for weeks and that
 * is the point, it is a standing list and not a news item.
 */
export const ADOPTION_WINDOW_DAYS = 90;

/** How many unused features to name before deferring to the API. */
const LISTED_UNUSED = 8;

/** The payloads the digest reads, each from the service the API answers with. */
export type DigestInput = {
  events: Awaited<ReturnType<typeof getEventsConfigList>>;
  sync: Awaited<ReturnType<typeof getSyncHealth>>;
  freshness: Awaited<ReturnType<typeof getDataFreshness>>;
  pdfJobs: Awaited<ReturnType<typeof getPdfJobsHealth>>;
  deletions: Awaited<ReturnType<typeof getAccountDeletionQueue>>;
  adoption: Awaited<ReturnType<typeof getFeatureAdoptionGaps>>;
};

/** The admin pages a figure links to, as paths. */
export const DIGEST_PAGES = {
  dashboard: '/staff/admin',
  events: '/staff/admin/events',
  syncErrors: '/staff/admin/sync-errors',
  onboardingPdfs: '/staff/admin/onboarding-pdfs',
  accountDeletions: '/staff/admin/account-deletions',
} as const;

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

function eventsSection({ events }: DigestInput): DigestSectionView {
  const toPrepare = events.events.value;
  const listed = events.list.value.slice(0, LISTED_EVENTS);
  // Counted off the total, NOT off the returned list: that list is itself capped
  // at EVENTS_LIST_LIMIT, so subtracting from its length made the mail
  // contradict its own lead ("200 événements demandent une action" above a table
  // of 15 plus "et 85 autres") as soon as the cap was reached.
  const remaining = toPrepare - listed.length;

  const blocks: DigestBlock[] =
    toPrepare === 0
      ? [
          paragraph(
            'Aucun événement à préparer : tout ce qui arrive est configuré et visible.',
          ),
        ]
      : [
          paragraph(
            strong(toPrepare),
            ` ${plural(toPrepare, 'événement demande', 'événements demandent')} encore une action avant l'arrivée de ${plural(toPrepare, 'sa cohorte', 'leurs cohortes')}. `,
            link(DIGEST_PAGES.events, 'Voir sur la page Événements'),
            '.',
          ),
          {
            kind: 'table',
            head: [
              'Événement (Salesforce)',
              'Campus',
              'Dates',
              'Ce qui manque',
            ],
            rows: listed.map((e) => [
              [e.salesforceName],
              [e.campus],
              [e.dateLabel],
              [e.missing.join(', ') || e.configStateLabel],
            ]),
          },
          ...(remaining > 0
            ? [
                {
                  kind: 'note',
                  segments: [
                    `Et ${remaining} ${plural(remaining, 'autre', 'autres')}.`,
                  ],
                } satisfies DigestBlock,
              ]
            : []),
        ];

  return { title: 'Événements à préparer', blocks };
}

// Two queues nothing else chases. A failed document means a talent has no
// règlement to download; an overdue erasure request is a legal exposure with
// a clock on it, and until now it only surfaced if somebody opened the page.
function queuesSection({ pdfJobs, deletions }: DigestInput): DigestSectionView {
  const failed = pdfJobs.failed.value;
  const overdue = deletions.overdue.value;
  const pending = deletions.pending.value;

  const blocks: DigestBlock[] = [];
  if (failed > 0)
    blocks.push(
      item(
        strong(failed),
        ` ${plural(failed, 'génération de document en échec', 'générations de document en échec')} : tant qu'${plural(failed, "elle n'est pas relancée", 'elles ne sont pas relancées')}, ${plural(failed, "le talent concerné n'a", "les talents concernés n'ont")} pas de document à télécharger. `,
        link(DIGEST_PAGES.onboardingPdfs, 'Voir la file'),
        '.',
      ),
    );
  if (overdue > 0)
    blocks.push(
      item(
        strong(overdue),
        ` ${plural(overdue, 'demande de suppression de compte a dépassé', 'demandes de suppression de compte ont dépassé')} le délai que nous nous imposons. `,
        link(DIGEST_PAGES.accountDeletions, 'Voir les demandes'),
        '.',
      ),
    );
  else if (pending > 0)
    blocks.push(
      item(
        `${pending} ${plural(pending, 'demande de suppression de compte est en attente', 'demandes de suppression de compte sont en attente')}, encore dans les délais.`,
      ),
    );

  return {
    title: 'Files en attente',
    blocks: blocks.length
      ? blocks
      : [
          paragraph(
            'Aucune file en attente : documents générés, aucune demande de suppression en retard.',
          ),
        ],
  };
}

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
function adoptionSection({ adoption }: DigestInput): DigestSectionView {
  const title = 'Adoption';
  if (adoption.aRetirer.value === null)
    return {
      title,
      blocks: [
        paragraph(
          'Adoption non mesurable cette semaine : les totaux mensuels n’ont pas été calculés sur la période, ce qui n’est pas la même chose qu’une absence d’usage.',
        ),
      ],
    };

  const unused = adoption.jamaisUtilisees.value;
  const abandoned = adoption.devenuesInutilisees.value;
  const singleCampus = adoption.unSeulCampus.value;
  const listedUnused = unused.slice(0, LISTED_UNUSED);
  const remainingUnused = unused.length - listedUnused.length;

  const blocks: DigestBlock[] = [];
  // First, because it is the strong signal: a feature that was never used may
  // never have been found, one that stopped being used was found and then
  // abandoned.
  if (abandoned.length > 0)
    blocks.push(
      item(
        strong(abandoned.length),
        ` ${plural(abandoned.length, 'fonctionnalité servait', 'fonctionnalités servaient')} l’an dernier et ne ${plural(abandoned.length, 'sert', 'servent')} plus : ${abandoned
          .slice(0, LISTED_UNUSED)
          .map((f) => f.libelle)
          .join(', ')}.`,
      ),
    );
  if (unused.length > 0)
    blocks.push(
      item(
        strong(unused.length),
        ` ${plural(unused.length, 'fonctionnalité n’a', 'fonctionnalités n’ont')} servi à personne depuis ${ADOPTION_WINDOW_DAYS} jours : ${listedUnused.map((f) => f.libelle).join(', ')}${remainingUnused > 0 ? `, et ${remainingUnused} ${plural(remainingUnused, 'autre', 'autres')}` : ''}.`,
      ),
    );
  if (singleCampus.length > 0)
    blocks.push(
      item(
        strong(singleCampus.length),
        ` ${plural(singleCampus.length, 'fonctionnalité n’est utilisée que par un seul campus', 'fonctionnalités ne sont utilisées que par un seul campus')} : ${singleCampus
          .slice(0, LISTED_UNUSED)
          .map((f) => `${f.libelle} (${f.campus})`)
          .join(', ')}.`,
      ),
    );

  return {
    title,
    blocks: blocks.length
      ? blocks
      : [
          paragraph(
            `Toutes les fonctionnalités mesurées ont servi au moins une fois sur les ${ADOPTION_WINDOW_DAYS} derniers jours, et aucune n’est restée cantonnée à un seul campus.`,
          ),
        ],
  };
}

function syncSection({ sync, freshness }: DigestInput): DigestSectionView {
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
  const blocks: DigestBlock[] = [];

  // Two lines, because they answer two questions and only one of them is ever
  // reassuring. `last === null` means the sync has NEVER run, worse than merely
  // stale, so it must not sit next to "aucune erreur en attente": that zero is
  // true here only because no sync ran to produce an error, and pairing them
  // reads as reassurance for the worst possible state.
  blocks.push(
    !last
      ? paragraph(
          "Aucune synchronisation Salesforce n'a jamais été enregistrée : à vérifier en priorité sur ",
          link(DIGEST_PAGES.dashboard, 'le tableau de bord admin'),
          '.',
        )
      : last.stale
        ? paragraph(
            'Dernière synchronisation Salesforce il y a ',
            strong(`${last.ageHours} h`),
            ' : à vérifier sur ',
            link(DIGEST_PAGES.dashboard, 'le tableau de bord admin'),
            '.',
          )
        : paragraph(
            'Dernière synchronisation Salesforce il y a ',
            strong(`${last.ageHours} h`),
            '.',
          ),
  );

  if (openErrors > 0)
    blocks.push(
      paragraph(
        last ? '' : 'Pourtant, ',
        strong(openErrors),
        ` ${plural(openErrors, 'erreur', 'erreurs')} de synchronisation ${plural(openErrors, 'est ouverte', 'sont ouvertes')}, avec ce qu'elles empêchent et qui peut les corriger sur `,
        link(DIGEST_PAGES.syncErrors, 'la page dédiée'),
        '.',
      ),
    );
  else if (last)
    blocks.push(paragraph('Aucune erreur de synchronisation ouverte.'));

  // A held prune fails nothing, so without this line it reaches nobody: the run
  // closes ok and the freshness above reads healthy. Its two ways out are a
  // nameless contact completed in Salesforce (listed on the page linked) or
  // confirming that the campaign was emptied, which only the admin API can do.
  if (prunesHeld > 0)
    blocks.push(
      paragraph(
        strong(prunesHeld),
        ` ${plural(prunesHeld, 'événement garde', 'événements gardent')} des inscriptions qu'une reprise complète n'a pas pu confirmer comme retirées de Salesforce, et rien n'y est supprimé sans preuve. Les contacts sans nom qui les retiennent sont sur `,
        link(DIGEST_PAGES.syncErrors, 'la page dédiée'),
        " ; une campagne réellement vidée se confirme par l'API d'administration.",
      ),
    );

  // Same reason as the held prunes: a status Jump does not know fails nothing,
  // it only masks the enrolment from the dev space, and that is how every
  // attendee went missing for a month before anyone saw it (#368).
  if (unrecognised > 0)
    blocks.push(
      paragraph(
        strong(unrecognised),
        ` ${plural(unrecognised, 'inscription porte', 'inscriptions portent')} un statut Salesforce que Jump ne connaît pas, sur ${unrecognisedEvents}${sync.unrecognisedStatusEventsTruncated ? ' événements ou plus' : ` ${plural(unrecognisedEvents, 'événement', 'événements')}`} : ${plural(unrecognised, 'elle est bien dans Jump mais masquée', 'elles sont bien dans Jump mais masquées')} de l'espace dev. Les statuts reçus et les événements concernés se lisent par l'API d'administration.`,
      ),
    );

  return { title: 'Synchronisation', blocks };
}

/** The whole mail, in reading order. */
export function composeDigest(input: DigestInput): DigestDocument {
  const toPrepare = input.events.events.value;
  return {
    subject: `Jump - ${toPrepare} ${plural(toPrepare, 'événement à préparer', 'événements à préparer')}`,
    title: 'Point hebdomadaire',
    intro:
      'Préparation des événements, files en attente, adoption des fonctionnalités et santé de la synchronisation Salesforce.',
    sections: [
      eventsSection(input),
      queuesSection(input),
      adoptionSection(input),
      syncSection(input),
    ],
    footer:
      "Message automatique, envoyé chaque lundi aux administrateurs désignés par l'équipe Jump.",
  };
}
