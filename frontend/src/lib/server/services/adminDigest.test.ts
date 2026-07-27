import { describe, it, expect, vi, beforeEach } from 'vitest';
import { metric } from '$lib/server/adminApi/metrics';

const getUnconfiguredEvents = vi.fn();
const getSyncHealth = vi.fn();

vi.mock('$lib/server/services/adminStats/unconfiguredEvents', () => ({
  getUnconfiguredEvents: () => getUnconfiguredEvents(),
  UNCONFIGURED_EVENTS_LIMIT: 100,
}));
vi.mock('$lib/server/services/adminStats/syncHealth', () => ({
  getSyncHealth: () => getSyncHealth(),
  SYNC_STALE_AFTER_HOURS: 3,
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

beforeEach(() => {
  getUnconfiguredEvents.mockReset();
  getSyncHealth.mockReset();
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
