import { describe, it, expect, vi, beforeEach } from 'vitest';
import { metric } from '$lib/server/adminApi/metrics';

const getUnconfiguredEvents = vi.fn();
const getSyncHealth = vi.fn();
const getPdfJobsHealth = vi.fn();
const getAccountDeletionQueue = vi.fn();
const getFeatureAdoptionGaps = vi.fn();

vi.mock('$lib/server/services/adminStats/unconfiguredEvents', () => ({
  getUnconfiguredEvents: () => getUnconfiguredEvents(),
  UNCONFIGURED_EVENTS_LIMIT: 100,
}));
vi.mock('$lib/server/services/adminStats/syncHealth', () => ({
  getSyncHealth: () => getSyncHealth(),
}));
vi.mock('$lib/server/services/adminStats/opsQueues', () => ({
  getPdfJobsHealth: () => getPdfJobsHealth(),
  getAccountDeletionQueue: () => getAccountDeletionQueue(),
}));
vi.mock('$lib/server/services/adminStats/featureUsage', () => ({
  getFeatureAdoptionGaps: () => getFeatureAdoptionGaps(),
}));

const { buildAdminDigest } = await import('./adminDigest');

type EventStub = {
  id: string;
  titre: string;
  campus: string;
  dateLabel: string;
  configState: 'unconfigured';
  configStateLabel: string;
  missing: string[];
};

/**
 * `toPrepareTotal` is passed separately on purpose: the aggregate caps its list
 * at UNCONFIGURED_EVENTS_LIMIT while `toPrepare` stays the real total, so the two
 * legitimately disagree and the digest has to count off the total.
 */
function eventsPayload(events: EventStub[], toPrepareTotal = events.length) {
  return {
    filters: { schoolYear: 'toutes', campus: 'tous' },
    toPrepare: metric(toPrepareTotal, 'def'),
    events: metric(events, 'def'),
    truncated: toPrepareTotal > events.length,
  };
}

function eventStub(i: number): EventStub {
  return {
    id: `evt_${i}`,
    titre: `Lille-CodingClub-${i}`,
    campus: 'Lille',
    dateLabel: '12 fév. 2026',
    configState: 'unconfigured',
    configStateLabel: 'À configurer',
    missing: ['nom public'],
  };
}

function syncPayload(over: { unresolved?: number; ageHours?: number } = {}) {
  return {
    lastSync: metric(
      {
        type: 'talents',
        at: '2026-07-26T06:00:00.000Z',
        ageHours: over.ageHours ?? 0.5,
        stale: (over.ageHours ?? 0.5) > 3,
        created: 1,
        updated: 2,
        skipped: 0,
      },
      'def',
    ),
    unresolvedErrors: metric(over.unresolved ?? 0, 'def'),
    errorsByType: metric([], 'def'),
    oldestUnresolvedAgeDays: metric(null, 'def'),
  };
}

/** The sync has never run once: worse than stale, and distinct from it below. */
function neverSyncedPayload(unresolved = 0) {
  return {
    lastSync: metric(null, 'def'),
    unresolvedErrors: metric(unresolved, 'def'),
    errorsByType: metric([], 'def'),
    oldestUnresolvedAgeDays: metric(null, 'def'),
  };
}

function pdfJobsPayload(failed = 0) {
  return {
    pending: metric(0, 'def'),
    processing: metric(0, 'def'),
    failed: metric(failed, 'def'),
    succeeded: metric(0, 'def'),
    retryable: metric(failed, 'def'),
    oldestRetryableAgeMinutes: metric(null, 'def'),
    jobs: metric([], 'def'),
    truncated: false,
  };
}

function deletionsPayload(over: { pending?: number; overdue?: number } = {}) {
  return {
    pending: metric(over.pending ?? 0, 'def'),
    overdue: metric(over.overdue ?? 0, 'def'),
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

beforeEach(() => {
  getUnconfiguredEvents.mockReset();
  getSyncHealth.mockReset();
  // Quiet queues by default, so a test that cares about them says so.
  getPdfJobsHealth.mockReset().mockResolvedValue(pdfJobsPayload());
  getAccountDeletionQueue.mockReset().mockResolvedValue(deletionsPayload());
  getFeatureAdoptionGaps.mockReset().mockResolvedValue(adoptionPayload());
});

describe('buildAdminDigest', () => {
  it('says plainly that nothing needs preparing when the list is empty', async () => {
    getUnconfiguredEvents.mockResolvedValue(eventsPayload([]));
    getSyncHealth.mockResolvedValue(syncPayload());

    const digest = await buildAdminDigest();

    expect(digest.subject).toContain('0 événements à préparer');
    expect(digest.html).toContain('Aucun événement à préparer');
    expect(digest.html).not.toContain('<table');
    // Nothing to act on, so no link to a page that would show an empty list.
    expect(digest.html).not.toContain('/staff/admin/events');
    expect(digest.summary.eventsToPrepare).toBe(0);
  });

  it('lists the events to prepare with what each one is missing', async () => {
    getUnconfiguredEvents.mockResolvedValue(eventsPayload([eventStub(1)]));
    getSyncHealth.mockResolvedValue(syncPayload({ unresolved: 2 }));

    const digest = await buildAdminDigest();

    expect(digest.subject).toBe('Jump - 1 événement à préparer');
    expect(digest.html).toContain('Lille-CodingClub-1');
    expect(digest.html).toContain('nom public');
    expect(digest.html).toContain('erreurs');
    expect(digest.html).toContain('/staff/admin/events');
    expect(digest.html).toContain('/staff/admin/sync-errors');
    expect(digest.text).toContain('Lille-CodingClub-1');
    expect(digest.summary).toEqual({
      eventsToPrepare: 1,
      unresolvedSyncErrors: 2,
      lastSyncAgeHours: 0.5,
      failedPdfJobs: 0,
      overdueDeletionRequests: 0,
      unusedFeatures: 0,
      abandonedFeatures: 0,
      singleCampusFeatures: 0,
    });
  });

  it('names the stuck queues, and says so plainly when there are none', async () => {
    getUnconfiguredEvents.mockResolvedValue(eventsPayload([]));
    getSyncHealth.mockResolvedValue(syncPayload());

    const quiet = await buildAdminDigest();
    expect(quiet.html).toContain('Aucune file en attente');

    getPdfJobsHealth.mockResolvedValue(pdfJobsPayload(3));
    getAccountDeletionQueue.mockResolvedValue(
      deletionsPayload({ pending: 4, overdue: 2 }),
    );

    const busy = await buildAdminDigest();
    expect(busy.html).toContain('3');
    // "Non généré" reads as merely pending; the underlying rows are in the
    // `error` status and need a human to relaunch them, so the mail has to say
    // "échec" and point at the queue that can act on it, not just report a count.
    expect(busy.html).toContain('générations de document en échec');
    expect(busy.html).not.toContain('non généré');
    expect(busy.html).toContain('/staff/admin/onboarding-pdfs');
    // An overdue erasure request is the one figure here with a legal clock on
    // it, so it has to be named rather than folded into "4 en attente".
    expect(busy.html).toContain('dépassé');
    expect(busy.html).toContain('/staff/admin/account-deletions');
    expect(busy.summary).toMatchObject({
      failedPdfJobs: 3,
      overdueDeletionRequests: 2,
    });
  });

  it('says a single failed generation without the wrong plural', async () => {
    getUnconfiguredEvents.mockResolvedValue(eventsPayload([]));
    getSyncHealth.mockResolvedValue(syncPayload());
    getPdfJobsHealth.mockResolvedValue(pdfJobsPayload(1));

    const digest = await buildAdminDigest();

    expect(digest.html).toContain('génération de document en échec');
    expect(digest.html).not.toContain('générations de document en échec');
    expect(digest.html).toContain('le talent concerné');
  });

  it('caps the listed events and points at the cockpit for the rest', async () => {
    const events = Array.from({ length: 18 }, (_, i) => eventStub(i));
    getUnconfiguredEvents.mockResolvedValue(eventsPayload(events));
    getSyncHealth.mockResolvedValue(syncPayload());

    const digest = await buildAdminDigest();

    expect(digest.html).toContain('Lille-CodingClub-14');
    expect(digest.html).not.toContain('Lille-CodingClub-15');
    expect(digest.html).toContain('Et 3 autres');
    expect(digest.summary.eventsToPrepare).toBe(18);
  });

  // The aggregate's list is capped at 100; the mail must still count "et N
  // autres" off the real total, or its own lead paragraph contradicts its table.
  it('counts the remainder off the total, not off the capped list', async () => {
    const capped = Array.from({ length: 100 }, (_, i) => eventStub(i));
    getUnconfiguredEvents.mockResolvedValue(eventsPayload(capped, 200));
    getSyncHealth.mockResolvedValue(syncPayload());

    const digest = await buildAdminDigest();

    expect(digest.subject).toBe('Jump - 200 événements à préparer');
    expect(digest.html).toContain('Et 185 autres');
    expect(digest.text).toContain('et 185 autre(s)');
  });

  it('flags a stale sync and escapes event titles into the HTML', async () => {
    getUnconfiguredEvents.mockResolvedValue(
      eventsPayload([{ ...eventStub(1), titre: 'Lille <script>' }]),
    );
    getSyncHealth.mockResolvedValue(syncPayload({ ageHours: 9 }));

    const digest = await buildAdminDigest();

    expect(digest.html).toContain('9 h');
    // A stale feed is the likeliest alarm here (a dead worker), so it must say
    // where to check it rather than only that it needs checking.
    expect(digest.html).toContain('à vérifier sur');
    expect(digest.html).toContain('/staff/admin"');
    expect(digest.text).toContain('  Voir : /staff/admin');
    expect(digest.html).toContain('Lille &lt;script&gt;');
    expect(digest.html).not.toContain('<script>');
  });

  it('leaves a healthy sync without an alarm or a link', async () => {
    getUnconfiguredEvents.mockResolvedValue(eventsPayload([]));
    getSyncHealth.mockResolvedValue(syncPayload({ ageHours: 0.5 }));

    const digest = await buildAdminDigest();

    expect(digest.html).toContain('Aucune erreur en attente');
    expect(digest.html).not.toContain('à vérifier');
    expect(digest.html).not.toContain('/staff/admin');
  });

  it('flags a never-synced Salesforce feed as its own severity, not as "no errors"', async () => {
    getUnconfiguredEvents.mockResolvedValue(eventsPayload([]));
    getSyncHealth.mockResolvedValue(neverSyncedPayload());

    const digest = await buildAdminDigest();

    expect(digest.html).toContain('jamais été enregistrée');
    expect(digest.html).toContain('à vérifier en priorité');
    expect(digest.html).toContain('/staff/admin');
    // The zero below is true only because zero syncs ran to produce an error;
    // presenting it as reassurance right after the worst possible state is
    // the exact bug this test guards against.
    expect(digest.html).not.toContain('Aucune erreur en attente');
    expect(digest.summary.lastSyncAgeHours).toBeNull();
  });

  it('still surfaces sync errors reported despite no run ever being recorded', async () => {
    getUnconfiguredEvents.mockResolvedValue(eventsPayload([]));
    getSyncHealth.mockResolvedValue(neverSyncedPayload(4));

    const digest = await buildAdminDigest();

    expect(digest.html).toContain('jamais été enregistrée');
    expect(digest.html).toContain('Pourtant, <strong>4</strong> erreurs');
    expect(digest.html).toContain('/staff/admin/sync-errors');
  });

  it('names the features nobody used, and the ones a single campus uses', async () => {
    getUnconfiguredEvents.mockResolvedValue(eventsPayload([]));
    getSyncHealth.mockResolvedValue(syncPayload());
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

    const digest = await buildAdminDigest();

    expect(digest.html).toContain('Adoption');
    expect(digest.html).toContain('Signataire créé ou modifié');
    expect(digest.html).toContain('Génération des badges');
    expect(digest.html).toContain('Lille');
    expect(digest.text).toContain('Signataire créé ou modifié');
    expect(digest.summary.unusedFeatures).toBe(1);
    expect(digest.summary.singleCampusFeatures).toBe(1);
  });

  it('says so plainly when every measured feature has served', async () => {
    getUnconfiguredEvents.mockResolvedValue(eventsPayload([]));
    getSyncHealth.mockResolvedValue(syncPayload());

    const digest = await buildAdminDigest();

    expect(digest.html).toContain('ont servi au moins une fois');
    expect(digest.summary.unusedFeatures).toBe(0);
  });

  it('names what used to serve before what never did, since it is the stronger signal', async () => {
    // A feature nobody ever used may simply never have been found. One that
    // served last year and serves nobody now was found and then abandoned, so
    // it is the retire decision and it goes first.
    getUnconfiguredEvents.mockResolvedValue(eventsPayload([]));
    getSyncHealth.mockResolvedValue(syncPayload());
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

    const digest = await buildAdminDigest();

    expect(digest.html).toContain('l’an dernier et ne sert plus');
    expect(digest.html.indexOf('Génération des badges')).toBeLessThan(
      digest.html.indexOf('Signataire créé ou modifié'),
    );
    expect(digest.summary.abandonedFeatures).toBe(1);
  });

  it('says adoption is unmeasurable rather than naming every feature in Jump', async () => {
    // With an empty cube the never-used list is the whole catalogue. Printing it
    // would read as a finding, and it is the opposite: an absence of
    // measurement, not an absence of use.
    getUnconfiguredEvents.mockResolvedValue(eventsPayload([]));
    getSyncHealth.mockResolvedValue(syncPayload());
    getFeatureAdoptionGaps.mockResolvedValue(unmeasurableAdoptionPayload());

    const digest = await buildAdminDigest();

    expect(digest.html).toContain('Adoption non mesurable');
    expect(digest.html).not.toContain('ont servi au moins une fois');
    expect(digest.text).toContain('Adoption non mesurable');
    expect(digest.summary.unusedFeatures).toBeNull();
    expect(digest.summary.singleCampusFeatures).toBeNull();
  });
});
