import { describe, it, expect } from 'vitest';
import {
  canonicalJson,
  planDigest,
  runTwoStep,
  auditChangeOf,
  StalePlanError,
} from './plan';

describe('canonicalJson', () => {
  it('ignores key order, so the same plan hashes the same either way', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
    expect(planDigest({ b: 1, a: 2 })).toBe(planDigest({ a: 2, b: 1 }));
  });

  it('sorts keys at every depth, not just the top', () => {
    expect(canonicalJson({ x: { b: 1, a: 2 } })).toBe('{"x":{"a":2,"b":1}}');
  });

  it('keeps array order, because for a plan the order is part of the meaning', () => {
    expect(planDigest({ rows: ['a', 'b'] })).not.toBe(
      planDigest({ rows: ['b', 'a'] }),
    );
  });

  it('drops undefined so an absent field and a missing one agree', () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });
});

describe('runTwoStep', () => {
  const plan = { targeted: 2, changes: [{ eventId: 'a' }, { eventId: 'b' }] };

  it('returns the plan and its digest when no digest was sent, changing nothing', async () => {
    let applied = false;
    const outcome = await runTwoStep({
      requestedDigest: undefined,
      buildPlan: async () => plan,
      apply: async () => {
        applied = true;
        return { before: null, after: null };
      },
    });

    expect(applied).toBe(false);
    expect(outcome.applied).toBe(false);
    if (outcome.applied) throw new Error('unreachable');
    expect(outcome.plan).toEqual(plan);
    expect(outcome.planDigest).toBe(planDigest(plan));
  });

  it('applies when the digest still matches the plan it recomputes', async () => {
    const outcome = await runTwoStep({
      requestedDigest: planDigest(plan),
      buildPlan: async () => plan,
      apply: async () => ({ before: { n: 0 }, after: { n: 2 } }),
    });

    expect(outcome).toEqual({
      applied: true,
      before: { n: 0 },
      after: { n: 2 },
    });
  });

  // The point of recomputing rather than storing: a plan that was true when it
  // was shown can be false by the time it is applied, and that is the case a
  // stored plan would happily wave through.
  it('refuses when the world moved between the dry run and the apply', async () => {
    const stale = planDigest(plan);
    const moved = { targeted: 3, changes: [...plan.changes, { eventId: 'c' }] };
    let applied = false;

    await expect(
      runTwoStep({
        requestedDigest: stale,
        buildPlan: async () => moved,
        apply: async () => {
          applied = true;
          return { before: null, after: null };
        },
      }),
    ).rejects.toThrow(StalePlanError);
    expect(applied).toBe(false);
  });

  it('names the fresh digest in the refusal, so the caller can recover', async () => {
    const moved = { targeted: 0, changes: [] };
    await expect(
      runTwoStep({
        requestedDigest: 'nonsense',
        buildPlan: async () => moved,
        apply: async () => ({ before: null, after: null }),
      }),
    ).rejects.toThrow(planDigest(moved));
  });
});

describe('auditChangeOf', () => {
  it('records nothing for a read', () => {
    expect(auditChangeOf('read', { anything: true })).toBeUndefined();
  });

  it('records before and after for an applied write', () => {
    expect(
      auditChangeOf('write', { applied: true, before: 1, after: 2 }),
    ).toEqual({ before: 1, after: 2 });
  });

  // A dry run is a call worth logging, but it changed nothing, and a log that
  // showed a before/after for it would read as a change that happened.
  it('records nothing for a dry run', () => {
    expect(
      auditChangeOf('write', { applied: false, plan: {}, planDigest: 'x' }),
    ).toBeUndefined();
  });
});
