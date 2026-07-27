import { describe, it, expect, vi, beforeEach } from 'vitest';
import { metric } from '$lib/server/adminApi/metrics';

const getUnconfiguredEvents = vi.fn();
const getSyncHealth = vi.fn();
const getPdfJobsHealth = vi.fn();
const getAccountDeletionQueue = vi.fn();

vi.mock('$lib/server/services/adminStats/unconfiguredEvents', () => ({
  getUnconfiguredEvents: () => getUnconfiguredEvents(),
  UNCONFIGURED_EVENTS_LIMIT: 100,
}));
vi.mock('$lib/server/services/adminStats/syncHealth', () => ({
  getSyncHealth: () => getSyncHealth(),
  SYNC_STALE_AFTER_HOURS: 3,
}));
vi.mock('$lib/server/services/adminStats/opsQueues', () => ({
  getPdfJobsHealth: () => getPdfJobsHealth(),
  getAccountDeletionQueue: () => getAccountDeletionQueue(),
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

beforeEach(() => {
  getUnconfiguredEvents.mockReset();
  getSyncHealth.mockReset();
  // Quiet queues by default, so a test that cares about them says so.
  getPdfJobsHealth.mockReset().mockResolvedValue(pdfJobsPayload());
  getAccountDeletionQueue.mockReset().mockResolvedValue(deletionsPayload());
});

describe('buildAdminDigest', () => {
  it('says plainly that nothing needs preparing when the list is empty', async () => {
    getUnconfiguredEvents.mockResolvedValue(eventsPayload([]));
    getSyncHealth.mockResolvedValue(syncPayload());

    const digest = await buildAdminDigest();

    expect(digest.subject).toContain('0 événements à préparer');
    expect(digest.html).toContain('Aucun événement à préparer');
    expect(digest.html).not.toContain('<table');
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
    expect(digest.text).toContain('Lille-CodingClub-1');
    expect(digest.summary).toEqual({
      eventsToPrepare: 1,
      unresolvedSyncErrors: 2,
      lastSyncAgeHours: 0.5,
      failedPdfJobs: 0,
      overdueDeletionRequests: 0,
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
    expect(busy.html).toContain('documents non générés');
    // An overdue erasure request is the one figure here with a legal clock on
    // it, so it has to be named rather than folded into "4 en attente".
    expect(busy.html).toContain('dépassé');
    expect(busy.summary).toMatchObject({
      failedPdfJobs: 3,
      overdueDeletionRequests: 2,
    });
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
    expect(digest.html).toContain('(à vérifier)');
    expect(digest.html).toContain('Lille &lt;script&gt;');
    expect(digest.html).not.toContain('<script>');
  });
});
