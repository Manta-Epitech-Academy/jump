/**
 * The decision the whole worker surface hangs off: run or not, which pass, and
 * from when.
 *
 * Worth a matrix rather than a case or two, because every branch is a real
 * incident somewhere. Deciding "not due" too easily stops the platform being
 * fed with nothing failing; deciding it too eagerly turns a 15 min cadence into
 * a permanent full reconcile; and resuming an incremental from the wrong edge
 * drops records silently, which is the failure nobody notices until a cohort is
 * missing.
 */

import { describe, it, expect } from 'vitest';
import {
  decideSync,
  staleAfterHours,
  syncCadenceNote,
  SYNC_WATERMARK_MARGIN_MINUTES,
  type SyncCadence,
  type SyncRequests,
} from './syncSchedule';

const CADENCES: SyncCadence[] = [
  { mode: 'incremental', intervalMinutes: 180 },
  { mode: 'full', intervalMinutes: 1440 },
];

const NOW = new Date('2026-09-15T12:00:00.000Z');

const NO_REQUESTS: SyncRequests = { full: null, incremental: null };

/** A request a person made `minutesAgo` minutes before NOW. */
function askedAgo(minutesAgo: number) {
  return new Date(NOW.getTime() - minutesAgo * 60_000);
}

/** A run that started `startedAgo` minutes ago and took `tookMinutes`. */
function ranAgo(startedAgo: number, tookMinutes = 2) {
  const startedAt = new Date(NOW.getTime() - startedAgo * 60_000);
  return {
    startedAt,
    finishedAt: new Date(startedAt.getTime() + tookMinutes * 60_000),
  };
}

describe('decideSync', () => {
  it('asks for a full pass when nothing has ever run', () => {
    const decision = decideSync({
      now: NOW,
      requests: NO_REQUESTS,
      cadences: CADENCES,
      lastOkFull: null,
      lastOkIncremental: null,
    });

    expect(decision).toEqual({
      shouldSync: true,
      mode: 'full',
      since: null,
      reason: 'cadence',
    });
  });

  it('stays quiet when both modes are within their interval', () => {
    const decision = decideSync({
      now: NOW,
      requests: NO_REQUESTS,
      cadences: CADENCES,
      lastOkFull: ranAgo(60),
      lastOkIncremental: ranAgo(30),
    });

    expect(decision.shouldSync).toBe(false);
  });

  // The worker validates `mode` before it ever looks at `shouldSync`, so a
  // heartbeat answer carrying an empty or absent mode makes the run throw
  // instead of exiting 0. And `since` has to be a key, not a missing property.
  it('still names a valid mode and carries a since key when nothing is due', () => {
    const decision = decideSync({
      now: NOW,
      requests: NO_REQUESTS,
      cadences: CADENCES,
      lastOkFull: ranAgo(60),
      lastOkIncremental: ranAgo(30),
    });

    expect(decision.mode).toBe('incremental');
    expect('since' in decision).toBe(true);
  });

  it('asks for an incremental once its interval has elapsed', () => {
    const decision = decideSync({
      now: NOW,
      requests: NO_REQUESTS,
      cadences: CADENCES,
      lastOkFull: ranAgo(200),
      lastOkIncremental: ranAgo(190),
    });

    expect(decision.shouldSync).toBe(true);
    expect(decision.mode).toBe('incremental');
    expect(decision.since).not.toBeNull();
  });

  // Running the incremental first would push its watermark across a window the
  // full pass is about to re-read anyway, spending a run to learn nothing.
  it('prefers the full pass when both are due', () => {
    const decision = decideSync({
      now: NOW,
      requests: NO_REQUESTS,
      cadences: CADENCES,
      lastOkFull: ranAgo(1500),
      lastOkIncremental: ranAgo(400),
    });

    expect(decision.mode).toBe('full');
    expect(decision.since).toBeNull();
  });

  it('measures dueness from the end of the last run, not its start', () => {
    // Started 185 min ago but took 10, so it landed 175 min ago: not due yet on
    // a 180 min cadence, even though its start is older than the interval.
    const decision = decideSync({
      now: NOW,
      requests: NO_REQUESTS,
      cadences: CADENCES,
      lastOkFull: ranAgo(200),
      lastOkIncremental: ranAgo(185, 10),
    });

    expect(decision.shouldSync).toBe(false);
  });

  // The other half of the same pair, and the one that loses data when it is
  // wrong: a record modified while a run was executing carries a modstamp that
  // run's finishedAt has already passed.
  it('resumes an incremental from the start of the last one, minus the margin', () => {
    const last = ranAgo(200, 10);
    const decision = decideSync({
      now: NOW,
      requests: NO_REQUESTS,
      cadences: CADENCES,
      lastOkFull: ranAgo(300),
      lastOkIncremental: last,
    });

    const expected = new Date(
      last.startedAt.getTime() - SYNC_WATERMARK_MARGIN_MINUTES * 60_000,
    );
    expect(decision.since).toBe(expected.toISOString());
    expect(new Date(decision.since!).getTime()).toBeLessThan(
      last.finishedAt.getTime(),
    );
  });

  it('takes the whole whitelist when an incremental is due but none ever succeeded', () => {
    const decision = decideSync({
      now: NOW,
      requests: NO_REQUESTS,
      cadences: CADENCES,
      // A full ran an hour ago, so it is not due; no incremental has ever
      // landed, so that one is, and it has no floor to resume from.
      lastOkFull: ranAgo(60),
      lastOkIncremental: null,
    });

    expect(decision).toEqual({
      shouldSync: true,
      mode: 'incremental',
      since: null,
      reason: 'cadence',
    });
  });

  it('follows the configured cadence rather than a built-in one', () => {
    const tightened: SyncCadence[] = [
      { mode: 'incremental', intervalMinutes: 15 },
      { mode: 'full', intervalMinutes: 1440 },
    ];

    const onDefaults = decideSync({
      now: NOW,
      requests: NO_REQUESTS,
      cadences: CADENCES,
      lastOkFull: ranAgo(60),
      lastOkIncremental: ranAgo(20),
    });
    const onTightened = decideSync({
      now: NOW,
      requests: NO_REQUESTS,
      cadences: tightened,
      lastOkFull: ranAgo(60),
      lastOkIncremental: ranAgo(20),
    });

    expect(onDefaults.shouldSync).toBe(false);
    expect(onTightened.shouldSync).toBe(true);
  });

  // A guessed default would run the platform on a cadence nobody chose, in
  // whichever direction the guess happened to take.
  it('refuses to decide rather than invent a cadence that is not configured', () => {
    expect(() =>
      decideSync({
        now: NOW,
        requests: NO_REQUESTS,
        cadences: [{ mode: 'incremental', intervalMinutes: 180 }],
        lastOkFull: ranAgo(60),
        lastOkIncremental: ranAgo(20),
      }),
    ).toThrow(/full/);
  });
});

// A person asking for a pass now. Every case starts from a platform where
// nothing is due on cadence (full 60 min ago, incremental 30), so whatever runs
// runs because of the request.
describe('decideSync with a requested pass', () => {
  const quiet = { lastOkFull: ranAgo(60), lastOkIncremental: ranAgo(30) };
  const decide = (
    requests: Partial<SyncRequests>,
    runs: Partial<typeof quiet> = {},
  ) =>
    decideSync({
      now: NOW,
      cadences: CADENCES,
      requests: { ...NO_REQUESTS, ...requests },
      ...quiet,
      ...runs,
    });

  it('runs an incremental that was asked for, though none is due', () => {
    expect(decide({ incremental: askedAgo(5) })).toMatchObject({
      shouldSync: true,
      mode: 'incremental',
      reason: 'requested',
    });
  });

  it('runs a full pass that was asked for, though none is due', () => {
    expect(decide({ full: askedAgo(5) })).toEqual({
      shouldSync: true,
      mode: 'full',
      since: null,
      reason: 'requested',
    });
  });

  it('goes quiet once a successful run started after the request', () => {
    // Asked 20 min ago; the incremental that ran started 10 min ago.
    expect(
      decide({ incremental: askedAgo(20) }, { lastOkIncremental: ranAgo(10) }),
    ).toMatchObject({ shouldSync: false, reason: 'cadence' });
  });

  // The run may have read Salesforce before the change the person is waiting
  // for, so finishing after the request is not enough: it had to start after.
  it('is not satisfied by a run that was already in flight when it landed', () => {
    // Started 10 min ago, took 8, so it finished 2 min ago: after the request
    // made 5 min ago, but started before it.
    expect(
      decide(
        { incremental: askedAgo(5) },
        { lastOkIncremental: ranAgo(10, 8) },
      ),
    ).toMatchObject({ shouldSync: true, reason: 'requested' });
  });

  // A failed run moves no watermark and leaves no `ok` row, so from here it
  // looks like no run at all: asked 25 min ago, and the last successful runs
  // both started before that, so the request is still there at the next tick.
  it('stays pending while no run covering it has succeeded', () => {
    expect(decide({ incremental: askedAgo(25) })).toMatchObject({
      shouldSync: true,
      reason: 'requested',
    });
  });

  it('counts a full pass as covering an incremental request', () => {
    expect(
      decide({ incremental: askedAgo(20) }, { lastOkFull: ranAgo(10) }),
    ).toMatchObject({ shouldSync: false });
  });

  // Only a full pass sees a deletion, so a person asking for one is not
  // answered by an incremental, however recent.
  it('does not count an incremental as covering a full request', () => {
    expect(
      decide({ full: askedAgo(20) }, { lastOkIncremental: ranAgo(10) }),
    ).toMatchObject({ shouldSync: true, mode: 'full', reason: 'requested' });
  });

  it('serves a requested full pass before an incremental due on cadence', () => {
    expect(
      decide({ full: askedAgo(5) }, { lastOkIncremental: ranAgo(400) }),
    ).toMatchObject({ mode: 'full', reason: 'requested' });
  });
});

describe('staleAfterHours', () => {
  it('flags a stale feed after three missed incremental passes', () => {
    expect(staleAfterHours(CADENCES, 'incremental')).toBe(9);
  });

  // The regression: one threshold read off the incremental was applied to both
  // passes, so on the shipped cadences a full reconcile was called stale nine
  // hours after succeeding and stayed so for the fifteen hours until the next
  // one was even due. A pass is judged on its own cadence.
  it('judges the full reconcile on its own cadence, not the incremental one', () => {
    expect(staleAfterHours(CADENCES, 'full')).toBe(72);
    expect(staleAfterHours(CADENCES, 'full')).toBeGreaterThan(
      cadenceHours('full'),
    );
  });

  it('holds a floor so a tight cadence does not alarm on one slow run', () => {
    expect(
      staleAfterHours(
        [
          { mode: 'incremental', intervalMinutes: 15 },
          { mode: 'full', intervalMinutes: 1440 },
        ],
        'incremental',
      ),
    ).toBe(1);
  });

  it('refuses to guess when the mode has no cadence row', () => {
    expect(() =>
      staleAfterHours([{ mode: 'incremental', intervalMinutes: 180 }], 'full'),
    ).toThrow(/full/);
  });
});

/** The interval of one mode, in hours, straight off the fixture. */
function cadenceHours(mode: 'full' | 'incremental'): number {
  return CADENCES.find((c) => c.mode === mode)!.intervalMinutes / 60;
}

describe('syncCadenceNote', () => {
  // This sentence is interpolated into `metric()` definitions, which are quoted
  // verbatim into the weekly digest and into MCP answers. A hardcoded one goes
  // false the first time the team tightens the cadence, and keeps being quoted.
  it('states the cadence in force, not a fixed one', () => {
    expect(syncCadenceNote(CADENCES)).toBe(
      'le worker de synchronisation tourne toutes les 3 heures, avec une reprise complète toutes les 24 heures',
    );
  });

  it('follows an edit to the cadence', () => {
    expect(
      syncCadenceNote([
        { mode: 'incremental', intervalMinutes: 15 },
        { mode: 'full', intervalMinutes: 720 },
      ]),
    ).toBe(
      'le worker de synchronisation tourne toutes les 15 minutes, avec une reprise complète toutes les 12 heures',
    );
  });
});
