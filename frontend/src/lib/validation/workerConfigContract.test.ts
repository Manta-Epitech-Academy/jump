/**
 * The body Jump answers on `GET /api/worker/config` has to be a body the worker
 * accepts, and this is where that is checked without a network hop.
 *
 * The gap it closes is the one that stopped production syncing: six routes were
 * renamed on the worker's side of the contract and stayed unimplemented on
 * Jump's, and nothing anywhere failed until the first tick returned 404. A
 * contract with two repositories and no shared artifact is a contract nobody
 * holds.
 *
 * `workerConfigAnswerSchema` transcribes `parseWorkerConfig` from jump-sf-worker.
 * These tests run the real decision through it, over the whole matrix, then
 * through `JSON.stringify` as well, because the two failure modes are different:
 * the schema catches a wrong type, and the round trip catches a key that is
 * present in the object and gone from the wire. `since: undefined` is exactly
 * that, and the worker throws on it rather than treating it as null.
 */

import { describe, it, expect } from 'vitest';
import { decideSync, type SyncCadence } from '$lib/domain/syncSchedule';
import { workerConfigAnswerSchema } from './workerSync';

const CADENCES: SyncCadence[] = [
  { mode: 'incremental', intervalMinutes: 180 },
  { mode: 'full', intervalMinutes: 1440 },
];

const NOW = new Date('2026-09-15T12:00:00.000Z');

function ago(minutes: number) {
  const startedAt = new Date(NOW.getTime() - minutes * 60_000);
  return {
    startedAt,
    finishedAt: new Date(startedAt.getTime() + 2 * 60_000),
  };
}

/** The composition the route performs, over one decision. */
function answerFor(
  lastOkFull: ReturnType<typeof ago> | null,
  lastOkIncremental: ReturnType<typeof ago> | null,
  sources: {
    salesforceCampaignId: string;
    kind: string;
    campusExtName: string;
  }[] = [],
) {
  const decision = decideSync({
    now: NOW,
    cadences: CADENCES,
    lastOkFull,
    lastOkIncremental,
  });
  return {
    sources,
    shouldSync: decision.shouldSync,
    mode: decision.mode,
    since: decision.since,
  };
}

/** What the worker actually receives, not what we handed to `json()`. */
function overTheWire(answer: unknown): unknown {
  return JSON.parse(JSON.stringify(answer));
}

describe('the config answer the worker will parse', () => {
  const cases: [string, ReturnType<typeof answerFor>][] = [
    ['nothing has ever run', answerFor(null, null)],
    ['a full pass is due', answerFor(ago(2000), ago(10))],
    ['an incremental is due', answerFor(ago(60), ago(400))],
    ['nothing is due', answerFor(ago(60), ago(30))],
    ['an incremental is due and none ever succeeded', answerFor(ago(60), null)],
  ];

  for (const [label, answer] of cases) {
    it(`is accepted when ${label}`, () => {
      expect(workerConfigAnswerSchema.safeParse(answer).success).toBe(true);
    });

    // A key the worker requires can be present in the object and absent from
    // the JSON: `undefined` does not survive serialisation, and the worker
    // rejects a missing `since` rather than reading it as null.
    it(`survives the wire when ${label}`, () => {
      expect(
        workerConfigAnswerSchema.safeParse(overTheWire(answer)).success,
      ).toBe(true);
    });
  }

  it('carries a real mode even on a heartbeat, since the worker validates it first', () => {
    const answer = answerFor(ago(60), ago(30));

    expect(answer.shouldSync).toBe(false);
    expect(['full', 'incremental']).toContain(answer.mode);
  });

  it('accepts a campus external name that is empty, and a campaign id that is not', () => {
    const withEmptyCampus = answerFor(ago(60), ago(30), [
      {
        salesforceCampaignId: '701Sm00000ccjhUIAQ',
        kind: 'orphan',
        campusExtName: '',
      },
    ]);
    expect(workerConfigAnswerSchema.safeParse(withEmptyCampus).success).toBe(
      true,
    );

    const withEmptyId = answerFor(ago(60), ago(30), [
      { salesforceCampaignId: '', kind: 'orphan', campusExtName: 'paris' },
    ]);
    expect(workerConfigAnswerSchema.safeParse(withEmptyId).success).toBe(false);
  });

  // Every shape below is one the worker's own parser rejects, so a change here
  // that made them pass would mean the transcription had drifted.
  it('refuses the shapes the worker refuses', () => {
    const valid = answerFor(ago(60), ago(30));

    expect(workerConfigAnswerSchema.safeParse(null).success).toBe(false);
    expect(
      workerConfigAnswerSchema.safeParse({ ...valid, shouldSync: 'yes' })
        .success,
    ).toBe(false);
    expect(
      workerConfigAnswerSchema.safeParse({ ...valid, mode: 'delta' }).success,
    ).toBe(false);
    expect(
      workerConfigAnswerSchema.safeParse({ ...valid, since: 123 }).success,
    ).toBe(false);
    expect(
      workerConfigAnswerSchema.safeParse({ ...valid, since: undefined })
        .success,
    ).toBe(false);
    expect(
      workerConfigAnswerSchema.safeParse({ ...valid, sources: null }).success,
    ).toBe(false);
    expect(
      workerConfigAnswerSchema.safeParse({
        ...valid,
        sources: [{ kind: 'parent', campusExtName: 'paris' }],
      }).success,
    ).toBe(false);
    expect(
      workerConfigAnswerSchema.safeParse({
        ...valid,
        sources: [
          { salesforceCampaignId: 'x', kind: 'x', campusExtName: 'paris' },
        ],
      }).success,
    ).toBe(false);
  });
});
