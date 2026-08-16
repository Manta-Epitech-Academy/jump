/**
 * Invariants of the catalogue itself.
 *
 * These are the rules that are easy to break by adding an entry and easy to
 * miss in review, because nothing fails until somebody calls the operation: a
 * write granted to leadership, a bulk tool with no way to pass a plan digest, a
 * write whose description never says whether retrying is safe.
 */

import { describe, it, expect } from 'vitest';
import {
  ADMIN_API_OPERATIONS,
  ADMIN_API_WRITE_NAMES,
  operationsForTier,
  isOperationAllowedForTier,
  operationsOfferedTo,
  type AdminApiOperation,
} from './operations';

const entries = Object.entries(ADMIN_API_OPERATIONS) as [
  string,
  AdminApiOperation,
][];

describe('the operation catalogue', () => {
  it('gives every entry a description a model can choose on', () => {
    for (const [name, operation] of entries) {
      expect(operation.description.length, name).toBeGreaterThan(40);
    }
  });

  it('refuses unknown parameters everywhere, in both consumers', () => {
    for (const [name, operation] of entries) {
      const parsed = operation.schema.safeParse({ definitelyNotAParam: 1 });
      expect(parsed.success, name).toBe(false);
    }
  });

  // The whole containment rule in one assertion: leadership is a subset, and it
  // is a subset of reads.
  it('never grants a write to a leadership token', () => {
    for (const [name, operation] of entries) {
      if (operation.kind !== 'write') continue;
      expect(operation.leadership, name).toBe(false);
    }
  });

  it('keeps the leadership tier a strict subset of what the core team sees', () => {
    const core = operationsForTier('core').map(([name]) => name);
    const leadership = operationsForTier('leadership').map(([name]) => name);

    expect(leadership.length).toBeGreaterThan(0);
    expect(leadership.length).toBeLessThan(core.length);
    for (const name of leadership) expect(core).toContain(name);
  });

  it('hides every operational and configuration answer from leadership', () => {
    for (const [name] of operationsForTier('leadership')) {
      expect(name.startsWith('ops_'), name).toBe(false);
      expect(name.startsWith('config_'), name).toBe(false);
      expect(name.startsWith('write_'), name).toBe(false);
      expect(name.startsWith('bulk_'), name).toBe(false);
    }
  });

  // The tier names a usage, not a job title: a directeur des opérations holds a
  // leadership token like every other national director, and his operational
  // questions stay with the internal admin team. So this rule cannot be relaxed
  // "just for one person", and the assertion above is what says so.
  it('grants leadership only to reads', () => {
    for (const [name, operation] of operationsForTier('leadership')) {
      expect(operation.kind, name).toBe('read');
    }
  });

  it('states in every write description whether repeating it is safe', () => {
    for (const [name, operation] of entries) {
      if (operation.kind !== 'write') continue;
      expect(operation.description, name).toMatch(/repeat/i);
    }
  });

  it('gives every two-step write a way to send back the plan digest', () => {
    const twoStep = entries.filter(([, operation]) => operation.twoStep);
    expect(twoStep.length).toBeGreaterThan(0);

    for (const [name, operation] of twoStep) {
      expect(Object.keys(operation.schema.shape), name).toContain('planDigest');
      // The contract has to be in the description too: the wrapper enforces it,
      // but only the description tells a model to dry-run first.
      expect(operation.description, name).toMatch(/planDigest/);
    }
  });

  it('lists exactly the writes under the name the write quota counts', () => {
    const writes = entries
      .filter(([, operation]) => operation.kind === 'write')
      .map(([name]) => name);
    expect([...ADMIN_API_WRITE_NAMES].sort()).toEqual(writes.sort());
    expect(writes.length).toBeGreaterThan(0);
  });

  // A shape check accepts 30 February, and the built-in date parser rolls it
  // over to March, which would save a day nobody asked for. The regression the
  // caller has to see is a refusal naming the problem.
  it('refuses a date that does not exist on the calendar', () => {
    const config = ADMIN_API_OPERATIONS.write_event_config.schema;

    expect(
      config.safeParse({ eventId: 'e', endDate: '2026-06-31' }).success,
    ).toBe(false);
    expect(
      config.safeParse({ eventId: 'e', endDate: '2026-02-30' }).success,
    ).toBe(false);
    expect(
      config.safeParse({ eventId: 'e', endDate: '2026-06-30' }).success,
    ).toBe(true);
  });

  it('lets a core token reach everything, by construction', () => {
    for (const [, operation] of entries) {
      expect(isOperationAllowedForTier(operation, 'core')).toBe(true);
    }
  });
});

describe('what a credential is offered as tools', () => {
  const names = (credential: {
    tier: 'core' | 'leadership';
    writeEnabled: boolean;
  }) => operationsOfferedTo(credential).map(([name]) => name);

  it('shows a read-only core token every read and no write', () => {
    const offered = names({ tier: 'core', writeEnabled: false });
    expect(offered.some((n) => n.startsWith('write_'))).toBe(false);
    expect(offered.some((n) => n.startsWith('bulk_'))).toBe(false);
    expect(offered).toContain('stats_events_overview');
  });

  it('shows a write-enabled core token the writes as well', () => {
    const offered = names({ tier: 'core', writeEnabled: true });
    expect(offered).toContain('write_event_config');
    expect(offered).toContain('bulk_event_modules');
  });

  // Belt and braces with the catalogue rule: even a leadership token that
  // somehow carried the write capability is offered nothing that mutates.
  //
  // Asserted as "nothing that mutates" rather than as a list of allowed prefixes:
  // the earlier version enumerated `stats_` plus the one `meta_` entry that
  // existed, so adding a second meta entry failed a test about writes.
  it('never shows a leadership token a write, whatever its capability says', () => {
    for (const writeEnabled of [false, true]) {
      const offered = names({ tier: 'leadership', writeEnabled });
      expect(offered.length).toBeGreaterThan(0);
      for (const name of offered) {
        expect(name.startsWith('write_'), name).toBe(false);
        expect(name.startsWith('bulk_'), name).toBe(false);
      }
    }
  });
});
