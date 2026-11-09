import { describe, it, expect, vi, beforeEach } from 'vitest';
import { metric } from '$lib/server/adminApi/metrics';
import type { PreparationHorizon } from '$lib/domain/eventReadiness';

const getEventsConfigList = vi.fn();
const getSyncHealth = vi.fn();
const getDataFreshness = vi.fn();
const getPdfJobsHealth = vi.fn();
const getAccountDeletionQueue = vi.fn();
const getFeatureAdoptionGaps = vi.fn();
const getEmargementCoverage = vi.fn();

vi.mock('$lib/server/services/adminStats/eventsList', () => ({
  getEventsConfigList: (...args: unknown[]) => getEventsConfigList(...args),
  EVENTS_LIST_LIMIT: 100,
}));
vi.mock('$lib/server/services/adminStats/syncHealth', () => ({
  getSyncHealth: (...args: unknown[]) => getSyncHealth(...args),
}));
vi.mock('$lib/server/services/adminStats/dataFreshness', () => ({
  getDataFreshness: () => getDataFreshness(),
}));
vi.mock('$lib/server/services/adminStats/opsQueues', () => ({
  getPdfJobsHealth: (...args: unknown[]) => getPdfJobsHealth(...args),
  getAccountDeletionQueue: (...args: unknown[]) =>
    getAccountDeletionQueue(...args),
}));
vi.mock('$lib/server/services/adminStats/emargementCoverage', () => ({
  getEmargementCoverage: (...args: unknown[]) => getEmargementCoverage(...args),
}));
vi.mock('$lib/server/services/adminStats/featureUsage', () => ({
  getFeatureAdoptionGaps: () => getFeatureAdoptionGaps(),
}));

const { buildAdminDigest } = await import('./index');

/** The previous digest read its figures on Monday 2 November 2026, 08:00 Paris. */
const PREVIOUS = new Date('2026-11-02T07:00:00.000Z');
const baseline = { since: PREVIOUS, previous: true };
/** An ordinary Monday: adoption is the month's first digest's alone. */
const week = { baseline, adoption: false };
const firstOfMonth = { baseline, adoption: true };
const firstEver = {
  baseline: { since: new Date('2026-11-02T08:00:00.000Z'), previous: false },
  adoption: true,
};
const OLD = '2026-09-01T00:00:00.000Z';
const NEW = '2026-11-05T00:00:00.000Z';

type EventStub = {
  eventId: string;
  salesforceName: string;
  campus: string;
  dateLabel: string;
  horizon: PreparationHorizon;
  addedAt: string;
  missing: string[];
  activationBlockers: string[];
};

function eventStub(i: number, over: Partial<EventStub> = {}): EventStub {
  return {
    eventId: `evt_${i}`,
    salesforceName: `Lille-CodingClub-${i}`,
    campus: 'Lille',
    dateLabel: '12 fév. 2026',
    horizon: 'imminent',
    addedAt: OLD,
    missing: ['nom public'],
    activationBlockers: ['nom public'],
    ...over,
  };
}

/**
 * `total` and the horizon counts are passed apart from the list on purpose: the
 * list is capped at EVENTS_LIST_LIMIT while the counts are over every match, so
 * the two legitimately disagree and the digest has to count off the counts.
 */
function eventsPayload(
  events: EventStub[],
  over: {
    total?: number;
    byHorizon?: Partial<Record<PreparationHorizon, number>>;
    addedSince?: number;
  } = {},
) {
  const count = (h: PreparationHorizon) =>
    events.filter((e) => e.horizon === h).length;
  const byHorizon = {
    imminent: count('imminent'),
    soon: count('soon'),
    later: count('later'),
    ...over.byHorizon,
  };
  const total =
    over.total ?? byHorizon.imminent + byHorizon.soon + byHorizon.later;
  return {
    filters: {
      schoolYear: 'toutes',
      campus: 'tous',
      status: 'tous',
      state: 'to_prepare',
    },
    events: metric(total, 'def'),
    list: metric(events, 'def'),
    byHorizon: metric(byHorizon, 'def'),
    addedSince: metric(over.addedSince ?? 0, 'def'),
    truncated: total > events.length,
  };
}

function syncPayload(
  over: {
    openErrors?: number;
    openErrorsSince?: number;
    prunesHeld?: number;
    prunesHeldSince?: number;
    unrecognised?: number;
  } = {},
) {
  const unrecognised = over.unrecognised ?? 0;
  return {
    openErrors: metric(over.openErrors ?? 0, 'def'),
    openErrorsSince: metric(over.openErrorsSince ?? 0, 'def'),
    errorsBySituation: metric([], 'def'),
    oldestOpenAgeDays: metric(null, 'def'),
    prunesHeldEvents: metric(over.prunesHeld ?? 0, 'def'),
    prunesHeldSince: metric(over.prunesHeldSince ?? 0, 'def'),
    unrecognisedStatuses: metric(unrecognised, 'def'),
    unrecognisedStatusEvents: metric(
      unrecognised > 0
        ? [
            {
              eventId: 'evt',
              event: 'Coding Club',
              campus: 'Nancy',
              date: '2026-09-30',
              count: unrecognised,
              statuses: ['ATTENDED'],
            },
          ]
        : [],
      'def',
    ),
    unrecognisedStatusEventsTruncated: false,
  };
}

/**
 * When data last landed, whichever pass brought it. The mail reads this rather
 * than either pass of `stats_sync_health`: one of the two is routinely not due,
 * and calling the platform stale on that basis would be wrong every night.
 */
function freshnessPayload(ageHours = 0.5) {
  return metric(
    {
      at: '2026-07-26T06:00:00.000Z',
      ageHours,
      stale: ageHours > 3,
    },
    'def',
  );
}

function pdfJobsPayload(failed = 0, failedSince = 0) {
  return {
    pending: metric(0, 'def'),
    processing: metric(0, 'def'),
    failed: metric(failed, 'def'),
    failedSince: metric(failedSince, 'def'),
    succeeded: metric(0, 'def'),
    retryable: metric(failed, 'def'),
    oldestRetryableAgeMinutes: metric(null, 'def'),
    jobs: metric([], 'def'),
    truncated: false,
  };
}

function deletionsPayload(
  over: {
    pending?: number;
    overdue?: number;
    pendingSince?: number;
    overdueSince?: number;
  } = {},
) {
  return {
    pending: metric(over.pending ?? 0, 'def'),
    overdue: metric(over.overdue ?? 0, 'def'),
    pendingSince: metric(over.pendingSince ?? 0, 'def'),
    overdueSince: metric(over.overdueSince ?? 0, 'def'),
    oldestPendingAgeDays: metric(null, 'def'),
    fulfilledLast30Days: metric(0, 'def'),
    rejectedLast30Days: metric(0, 'def'),
  };
}

/**
 * Adoption gaps, empty by default: the section has to render nothing when there
 * is nothing to say, or every other test's "quiet digest" assertions would be
 * measuring this section instead.
 */
function adoptionPayload(
  unused: { feature: string; libelle: string; espace: string }[] = [],
  singleCampus: { feature: string; libelle: string; campus: string }[] = [],
  abandoned: {
    feature: string;
    libelle: string;
    espace: string;
    utilisationsPeriodeReference: number;
  }[] = [],
) {
  return {
    filters: { schoolYear: 'toutes', campus: 'tous', jours: 90 },
    source: metric(
      {
        store: 'lignes détaillées' as const,
        du: '2026-05-30T00:00:00.000Z',
        au: '2026-08-28T00:00:00.000Z',
        mois: null,
        calculeLe: null,
      },
      'def',
    ),
    jamaisUtilisees: metric(unused, 'def'),
    devenuesInutilisees: metric(abandoned, 'def'),
    unSeulCampus: metric(singleCampus, 'def'),
    aRetirer: metric(unused.length, 'def'),
    aSurveiller: metric(abandoned.length, 'def'),
    aFormer: metric(singleCampus.length, 'def'),
  };
}

/** The shape the service returns when the monthly cube holds nothing. */
function unmeasurableAdoptionPayload() {
  return {
    ...adoptionPayload(),
    source: metric(
      {
        store: 'totaux mensuels' as const,
        du: '2025-01-01T00:00:00.000Z',
        au: '2025-04-01T00:00:00.000Z',
        mois: ['2025-01', '2025-02', '2025-03'],
        calculeLe: null,
      },
      'def',
    ),
    aRetirer: metric(null, 'def'),
    aSurveiller: metric(null, 'def'),
    aFormer: metric(null, 'def'),
  };
}

type CoverageStub = {
  eventId: string;
  event: string;
  campus: string;
  dateLabel: string;
  elapsedSlots: number;
  unkeptSlots: number;
};

/** Registers of the window; `withUnkept` is over every event, not the list. */
function emargementPayload(perEvent: CoverageStub[] = [], withUnkept?: number) {
  return {
    eventsWithUnkeptSlots: metric(
      withUnkept ?? perEvent.filter((e) => e.unkeptSlots > 0).length,
      'def',
    ),
    perEvent: metric(perEvent, 'def'),
  };
}

/** Where a section starts in the text part, by its upper-cased title. */
const at = (text: string, title: string) => text.indexOf(`\n${title}\n`);

beforeEach(() => {
  // A quiet platform by default, so a test that cares about a section says so.
  getEventsConfigList.mockReset().mockResolvedValue(eventsPayload([]));
  getSyncHealth.mockReset().mockResolvedValue(syncPayload());
  getDataFreshness.mockReset().mockResolvedValue(freshnessPayload());
  getPdfJobsHealth.mockReset().mockResolvedValue(pdfJobsPayload());
  getAccountDeletionQueue.mockReset().mockResolvedValue(deletionsPayload());
  getFeatureAdoptionGaps.mockReset().mockResolvedValue(adoptionPayload());
  getEmargementCoverage.mockReset().mockResolvedValue(emargementPayload());
});

describe('buildAdminDigest', () => {
  // The figures marked new must be the ones a chat gets by asking with the
  // same instant, so every service is asked with the baseline itself.
  it('asks every moving figure since the baseline, as the API would', async () => {
    await buildAdminDigest(week);

    expect(getEventsConfigList).toHaveBeenCalledWith(
      {},
      { state: 'to_prepare' },
      { since: PREVIOUS },
    );
    expect(getSyncHealth).toHaveBeenCalledWith({ since: PREVIOUS });
    expect(getPdfJobsHealth).toHaveBeenCalledWith({ since: PREVIOUS });
    expect(getAccountDeletionQueue).toHaveBeenCalledWith({ since: PREVIOUS });
    expect(getEmargementCoverage).toHaveBeenCalledWith({}, { since: PREVIOUS });
  });

  // A half-day nobody marked reads as the whole cohort absent, and it is only
  // cheap to fill in while the team still remembers who came.
  it("names last week's registers with a half-day nobody marked", async () => {
    getEmargementCoverage.mockResolvedValue(
      emargementPayload([
        {
          eventId: 'e1',
          event: 'Stage Web',
          campus: 'Lyon',
          dateLabel: '3 nov. 2026 → 7 nov. 2026',
          elapsedSlots: 10,
          unkeptSlots: 2,
        },
        {
          eventId: 'e2',
          event: 'Coding Club',
          campus: 'Lille',
          dateLabel: '4 nov. 2026',
          elapsedSlots: 2,
          unkeptSlots: 0,
        },
      ]),
    );

    const digest = await buildAdminDigest(week);

    expect(digest.text).toContain(
      'Depuis le point du lundi 2 novembre, 1 événement a laissé des demi-journées sans aucun pointage',
    );
    expect(digest.text).toContain(
      '- Stage Web (Lyon, 3 nov. 2026 → 7 nov. 2026) : 2 demi-journées sur 10 sans pointage.',
    );
    expect(digest.text).not.toContain('Coding Club');
    expect(digest.text).not.toContain('À TRAITER EN PRIORITÉ');
  });

  it('says nothing of the registers when every one was kept', async () => {
    const digest = await buildAdminDigest(week);

    expect(at(digest.text, 'ÉMARGEMENT')).toBe(-1);
  });

  it('says so in the subject when nothing is urgent, and opens on no priority block', async () => {
    const digest = await buildAdminDigest(week);

    expect(digest.subject).toBe("Jump - point hebdomadaire, rien d'urgent");
    expect(digest.text).not.toContain('À TRAITER EN PRIORITÉ');
    expect(digest.text).toContain(
      'Aucun événement à préparer : tout ce qui arrive est configuré et visible.',
    );
    expect(digest.html).not.toContain('<table');
    // Nothing to act on, so no link to a page that would show an empty list.
    expect(digest.html).not.toContain('/staff/admin');
    expect(digest.text).toContain(
      'nouveau depuis le point du lundi 2 novembre',
    );
  });

  // The mail used to open on the events and bury a dead feed or an overdue
  // erasure request at the bottom, under a subject counting events.
  it('opens on what is urgent, names it in the subject, and leaves it out of its section', async () => {
    getEventsConfigList.mockResolvedValue(
      eventsPayload([eventStub(1), eventStub(2, { horizon: 'soon' })]),
    );
    getAccountDeletionQueue.mockResolvedValue(
      deletionsPayload({ pending: 2, overdue: 2, overdueSince: 1 }),
    );
    getDataFreshness.mockResolvedValue(freshnessPayload(9));

    const digest = await buildAdminDigest(week);

    expect(digest.subject).toBe(
      'Jump - Salesforce muet depuis 9 h, 2 demandes de suppression hors délai et 1 autre point urgent',
    );
    const priority = at(digest.text, 'À TRAITER EN PRIORITÉ');
    expect(priority).toBeGreaterThan(-1);
    // Feed first, then the legal clock, then the events about to start.
    const feed = digest.text.indexOf(
      'Dernière synchronisation Salesforce il y a 9 h',
    );
    const erasure = digest.text.indexOf('2 demandes de suppression de compte');
    const imminent = digest.text.indexOf(
      '1 événement commence dans les 7 jours',
    );
    expect(priority).toBeLessThan(feed);
    expect(feed).toBeLessThan(erasure);
    expect(erasure).toBeLessThan(imminent);
    expect(digest.text).toContain(
      'dont 1 devenue hors délai depuis le point du lundi 2 novembre',
    );
    // Lifted, so not said twice: the queue section had nothing else to say.
    expect(at(digest.text, 'FILES EN ATTENTE')).toBe(-1);
    // The section keeps what was not lifted.
    expect(at(digest.text, 'ÉVÉNEMENTS À PRÉPARER')).toBeGreaterThan(imminent);
    expect(digest.text).toContain('1 événement commence dans les 21 jours');
  });

  it('details the events of the next three weeks and only counts the later ones', async () => {
    getEventsConfigList.mockResolvedValue(
      eventsPayload(
        [
          eventStub(1),
          eventStub(2, { horizon: 'soon' }),
          eventStub(3, { horizon: 'later' }),
        ],
        { byHorizon: { later: 40 } },
      ),
    );

    const digest = await buildAdminDigest(week);

    expect(digest.subject).toBe('Jump - 1 événement à préparer cette semaine');
    expect(digest.html).toContain('Lille-CodingClub-1');
    expect(digest.html).toContain('Lille-CodingClub-2');
    expect(digest.html).not.toContain('Lille-CodingClub-3');
    expect(digest.text).toContain(
      '40 autres événements à préparer commencent dans plus de 21 jours.',
    );
    expect(digest.html).toContain('/staff/admin/events?periode=prep');
    expect(digest.summary).toMatchObject({
      eventsToPrepare: 42,
      imminentEvents: 1,
    });
  });

  // A cohort noun nobody needs used to sit beside the public name that stops
  // the event from going live, in one undifferentiated list.
  it('tells what blocks going live apart from what merely remains', async () => {
    getEventsConfigList.mockResolvedValue(
      eventsPayload([
        eventStub(1, {
          missing: [
            'nom public',
            'nom des participants',
            "pas encore activé pour l'espace dev",
          ],
          activationBlockers: ['nom public'],
        }),
        eventStub(2, {
          missing: ["pas encore activé pour l'espace dev"],
          activationBlockers: [],
        }),
      ]),
    );

    const digest = await buildAdminDigest(week);

    expect(digest.text).toContain(
      'Bloque la mise en ligne : nom public ; reste : nom des participants',
    );
    expect(digest.text).toContain("Prêt, il reste à l'activer");
    expect(digest.text).not.toContain('pas encore activé');
  });

  it('marks the events that arrived since the last digest', async () => {
    getEventsConfigList.mockResolvedValue(
      eventsPayload([eventStub(1, { addedAt: NEW }), eventStub(2)], {
        addedSince: 1,
      }),
    );

    const digest = await buildAdminDigest(week);

    expect(digest.html).toContain(
      'Lille-CodingClub-1 (<strong>nouveau</strong>)',
    );
    expect(digest.html).not.toContain('Lille-CodingClub-2 (');
    expect(digest.text).toContain(
      'Parmi les événements à préparer, 1 est arrivé dans Jump depuis le point du lundi 2 novembre.',
    );
  });

  it('counts the new ones over the last seven days before any digest went out', async () => {
    getSyncHealth.mockResolvedValue(
      syncPayload({ openErrors: 3, openErrorsSince: 2 }),
    );

    const digest = await buildAdminDigest(firstEver);

    expect(digest.text).toContain(
      '3 erreurs de synchronisation sont ouvertes, dont 2 nouvelles sur les 7 derniers jours',
    );
    expect(digest.html).toContain('/staff/admin/sync-errors');
  });

  // The band's remainder is counted off its own total, never off the capped
  // list, or the lead paragraph contradicts its own table.
  it('caps a band and counts its remainder off the band total', async () => {
    const capped = Array.from({ length: 100 }, (_, i) => eventStub(i));
    getEventsConfigList.mockResolvedValue(
      eventsPayload(capped, { byHorizon: { imminent: 120 } }),
    );

    const digest = await buildAdminDigest(week);

    expect(digest.html).toContain('Lille-CodingClub-14');
    expect(digest.html).not.toContain('Lille-CodingClub-15<');
    expect(digest.text).toContain('120 événements commencent dans les 7 jours');
    expect(digest.text).toContain('Et 105 autres.');
  });

  it('says when a full pass is holding deletions, which fails no run', async () => {
    getSyncHealth.mockResolvedValue(
      syncPayload({ prunesHeld: 2, prunesHeldSince: 1 }),
    );

    const digest = await buildAdminDigest(week);

    expect(digest.html).toContain('<strong>2</strong> événements gardent');
    expect(digest.text).toContain(
      "n'a pas pu confirmer comme retirées de Salesforce, dont 1 nouveau depuis",
    );
    expect(digest.summary.prunesHeldEvents).toBe(2);

    getSyncHealth.mockResolvedValue(syncPayload());
    const quiet = await buildAdminDigest(week);
    expect(quiet.text).not.toContain('gardent des inscriptions');
  });

  // An unknown status masks an enrolment and fails nothing, which is how every
  // attendee went missing from the dev space for a month (#368).
  it('says when Salesforce sends a status Jump does not know', async () => {
    getSyncHealth.mockResolvedValue(syncPayload({ unrecognised: 3 }));

    const digest = await buildAdminDigest(week);

    expect(digest.text).toContain(
      '3 inscriptions portent un statut Salesforce que Jump ne connaît pas, sur 1 événement',
    );
    expect(digest.text).toContain(
      "Les statuts reçus et les événements concernés se lisent par l'API d'administration.",
    );
    expect(digest.summary.unrecognisedSfStatuses).toBe(3);

    getSyncHealth.mockResolvedValue(syncPayload());
    const quiet = await buildAdminDigest(week);
    expect(quiet.text).not.toContain(
      'statut Salesforce que Jump ne connaît pas',
    );
  });

  it('names the failed generations, the new ones counted apart', async () => {
    getPdfJobsHealth.mockResolvedValue(pdfJobsPayload(3, 1));

    const digest = await buildAdminDigest(week);

    // "Non généré" reads as merely pending; the underlying rows are in the
    // `error` status and need a human to relaunch them, so the mail has to say
    // "échec" and point at the queue that can act on it, not just report a count.
    expect(digest.text).toContain(
      '3 générations de document en échec, dont 1 nouvelle depuis le point du lundi 2 novembre',
    );
    expect(digest.text).not.toContain('non généré');
    expect(digest.html).toContain('/staff/admin/onboarding-pdfs?statut=error');
    expect(digest.subject).toBe("Jump - point hebdomadaire, rien d'urgent");
  });

  // « 1 demande, dont 1 devenue hors délai » reads as two facts where there is
  // one; an hour count prints with the decimal comma its reader expects.
  it('says "all new" without counting them twice, and hours the French way', async () => {
    getAccountDeletionQueue.mockResolvedValue(
      deletionsPayload({ pending: 1, overdue: 1, overdueSince: 1 }),
    );
    getSyncHealth.mockResolvedValue(
      syncPayload({ openErrors: 2, openErrorsSince: 2 }),
    );
    getDataFreshness.mockResolvedValue(freshnessPayload(1.2));

    const digest = await buildAdminDigest(week);

    expect(digest.text).toContain(
      'le délai que nous nous imposons, devenue hors délai depuis le point du lundi 2 novembre.',
    );
    expect(digest.text).toContain(
      '2 erreurs de synchronisation sont ouvertes, toutes nouvelles depuis',
    );
    expect(digest.text).toContain('il y a 1,2 h.');
  });

  it('says a single failed generation without the wrong plural', async () => {
    getPdfJobsHealth.mockResolvedValue(pdfJobsPayload(1));

    const digest = await buildAdminDigest(week);

    expect(digest.text).toContain('1 génération de document en échec');
    expect(digest.text).toContain('le talent concerné');
  });

  it('keeps pending erasure requests within the delay out of the priorities', async () => {
    getAccountDeletionQueue.mockResolvedValue(
      deletionsPayload({ pending: 4, pendingSince: 2 }),
    );

    const digest = await buildAdminDigest(week);

    expect(digest.text).toContain(
      '4 demandes de suppression de compte sont en attente, encore dans les délais, dont 2 arrivées depuis',
    );
    expect(digest.text).not.toContain('À TRAITER EN PRIORITÉ');
  });

  it('escapes event titles into the HTML', async () => {
    getEventsConfigList.mockResolvedValue(
      eventsPayload([eventStub(1, { salesforceName: 'Lille <script>' })]),
    );

    const digest = await buildAdminDigest(week);

    expect(digest.html).toContain('Lille &lt;script&gt;');
    expect(digest.html).not.toContain('<script>');
  });

  it('flags a stale sync with where to check it', async () => {
    getDataFreshness.mockResolvedValue(freshnessPayload(9));

    const digest = await buildAdminDigest(week);

    // A stale feed is the likeliest alarm here (a dead worker), so it must say
    // where to check it rather than only that it needs checking.
    expect(digest.text).toContain(
      'Dernière synchronisation Salesforce il y a 9 h : à vérifier sur le tableau de bord admin (/staff/admin).',
    );
  });

  it('leaves a healthy sync without an alarm or a link', async () => {
    const digest = await buildAdminDigest(week);

    expect(digest.text).toContain('Aucune erreur de synchronisation ouverte');
    expect(digest.text).not.toContain('à vérifier');
  });

  it('flags a never-synced Salesforce feed as its own severity, not as "no errors"', async () => {
    getDataFreshness.mockResolvedValue(metric(null, 'def'));

    const digest = await buildAdminDigest(week);

    expect(digest.subject).toBe(
      'Jump - aucune synchronisation Salesforce enregistrée',
    );
    expect(digest.text).toContain('jamais été enregistrée');
    expect(digest.text).toContain('à vérifier en priorité');
    // The zero below is true only because zero syncs ran to produce an error;
    // presenting it as reassurance right after the worst possible state is
    // the exact bug this test guards against.
    expect(digest.text).not.toContain(
      'Aucune erreur de synchronisation ouverte',
    );
    expect(digest.summary.lastSyncAgeHours).toBeNull();
  });

  it('still surfaces sync errors reported despite no run ever being recorded', async () => {
    getSyncHealth.mockResolvedValue(syncPayload({ openErrors: 4 }));
    getDataFreshness.mockResolvedValue(metric(null, 'def'));

    const digest = await buildAdminDigest(week);

    expect(digest.text).toContain('jamais été enregistrée');
    expect(digest.text).toContain('4 erreurs de synchronisation sont ouvertes');
  });

  // The adoption list changes over months; printed every Monday, the same
  // names taught the reader to skim the whole mail.
  it("leaves adoption to the month's first digest, without even reading it", async () => {
    const digest = await buildAdminDigest(week);

    expect(getFeatureAdoptionGaps).not.toHaveBeenCalled();
    expect(at(digest.text, 'ADOPTION')).toBe(-1);
    expect(digest.includesAdoption).toBe(false);
    expect(digest.summary.unusedFeatures).toBeNull();
    expect(digest.text).toContain(
      "L'adoption des fonctionnalités paraît dans le premier point de chaque mois.",
    );

    const monthly = await buildAdminDigest(firstOfMonth);
    expect(monthly.includesAdoption).toBe(true);
    expect(at(monthly.text, 'ADOPTION')).toBeGreaterThan(-1);
  });

  it('names the features nobody used, and the ones a single campus uses', async () => {
    getFeatureAdoptionGaps.mockResolvedValue(
      adoptionPayload(
        [
          {
            feature: 'admin_signatory_write',
            libelle: 'Signataire créé ou modifié',
            espace: 'admin',
          },
        ],
        [
          {
            feature: 'dev_badges_render',
            libelle: 'Génération des badges',
            campus: 'Lille',
          },
        ],
      ),
    );

    const digest = await buildAdminDigest(firstOfMonth);

    expect(digest.text).toContain('ADOPTION');
    expect(digest.text).toContain('Signataire créé ou modifié');
    expect(digest.text).toContain('Génération des badges (Lille)');
    expect(digest.summary.unusedFeatures).toBe(1);
    expect(digest.summary.singleCampusFeatures).toBe(1);
  });

  it('says so plainly when every measured feature has served', async () => {
    const digest = await buildAdminDigest(firstOfMonth);

    expect(digest.text).toContain('ont servi au moins une fois');
    expect(digest.summary.unusedFeatures).toBe(0);
  });

  it('names what used to serve before what never did, since it is the stronger signal', async () => {
    // A feature nobody ever used may simply never have been found. One that
    // served last year and serves nobody now was found and then abandoned, so
    // it is the retire decision and it goes first.
    getFeatureAdoptionGaps.mockResolvedValue(
      adoptionPayload(
        [
          {
            feature: 'admin_signatory_write',
            libelle: 'Signataire créé ou modifié',
            espace: 'admin',
          },
        ],
        [],
        [
          {
            feature: 'dev_badges_render',
            libelle: 'Génération des badges',
            espace: 'dev',
            utilisationsPeriodeReference: 42,
          },
        ],
      ),
    );

    const digest = await buildAdminDigest(firstOfMonth);

    expect(digest.text).toContain('l’an dernier et ne sert plus');
    expect(digest.text.indexOf('Génération des badges')).toBeLessThan(
      digest.text.indexOf('Signataire créé ou modifié'),
    );
    expect(digest.summary.abandonedFeatures).toBe(1);
  });

  it('says adoption is unmeasurable rather than naming every feature in Jump', async () => {
    // With an empty cube the never-used list is the whole catalogue. Printing it
    // would read as a finding, and it is the opposite: an absence of
    // measurement, not an absence of use.
    getFeatureAdoptionGaps.mockResolvedValue(unmeasurableAdoptionPayload());

    const digest = await buildAdminDigest(firstOfMonth);

    expect(digest.text).toContain('Adoption non mesurable');
    expect(digest.text).not.toContain('ont servi au moins une fois');
    expect(digest.summary.unusedFeatures).toBeNull();
    expect(digest.summary.singleCampusFeatures).toBeNull();
  });
});
