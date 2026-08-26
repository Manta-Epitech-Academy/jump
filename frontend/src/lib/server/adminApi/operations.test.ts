/**
 * Invariants of the catalogue itself.
 *
 * These are the rules that are easy to break by adding an entry and easy to
 * miss in review, because nothing fails until somebody calls the operation: a
 * write granted to leadership, a bulk tool with no way to pass a plan digest, a
 * write whose description never says whether retrying is safe.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { adminEventSchema } from '$lib/validation/events';
import {
  ADMIN_API_OPERATIONS,
  ADMIN_API_WRITE_NAMES,
  ADMIN_API_OPERATION_NAMES,
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

/**
 * Where each field of the admin event form is reachable from, as
 * `operation.param`. Explicit and exhaustive, with a throwing default, for the
 * same reason `requiredArgsFor` is: a new config field then fails this test until
 * somebody decides how the API exposes it, instead of quietly having no API at
 * all. Three params are deliberately named differently from the form field, which
 * is why this cannot be a key intersection.
 */
const EVENT_FIELD_WRITES: Record<string, string> = {
  id: 'write_event_config.eventId',
  publicName: 'write_event_config.publicName',
  cohortNoun: 'write_event_config.cohortNoun',
  startTime: 'write_event_config.startTime',
  endDate: 'write_event_config.endDate',
  modules: 'write_event_config.modules',
  moduleSettings: 'write_event_inscrits_options.showStatutColumn',
  devActivated: 'write_event_activation.visible',
  feedbackFormId: 'write_event_feedback_form.formId',
  diplomaTemplateId: 'write_event_diploma_template.templateId',
  closingTemplateId: 'write_event_closing_template.closingTemplateId',
};

/** Every operation name a `+server.ts` under /api/admin actually mounts. */
function mountedOperationNames(): string[] {
  const root = join(process.cwd(), 'src/routes/api/admin');
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name === '+server.ts') {
        for (const [, name] of readFileSync(path, 'utf8').matchAll(
          /adminApi(?:Read|Write|Image)\(\s*'([^']+)'/g,
        )) {
          found.push(name);
        }
      }
    }
  };
  walk(root);
  return found;
}

describe('the API is the floor under the UI', () => {
  // Event configuration is fully MCP-driven, so a field an admin can change in
  // the wizard and nowhere else is a hole. This is the executable half of that
  // rule; it was written after finding `moduleSettings` reachable through no
  // write at all.
  it('exposes every admin event-config field through some write', () => {
    for (const field of Object.keys(adminEventSchema.shape)) {
      const reachable = EVENT_FIELD_WRITES[field];
      if (!reachable) {
        throw new Error(
          `adminEventSchema.${field} is reachable through no write operation. ` +
            'Add one, then name it in EVENT_FIELD_WRITES.',
        );
      }
      const [name, param] = reachable.split('.');
      const operation = ADMIN_API_OPERATIONS[
        name as keyof typeof ADMIN_API_OPERATIONS
      ] as AdminApiOperation | undefined;
      expect(operation, `${field} -> ${name}`).toBeDefined();
      expect(operation?.kind, `${field} -> ${name}`).toBe('write');
      expect(
        Object.keys(operation!.schema.shape),
        `${field} -> ${reachable}`,
      ).toContain(param);
    }
  });

  // MCP registers tools straight from the catalogue, but HTTP needs a route file,
  // and nothing else checks for one: an entry with no `+server.ts` is a tool over
  // MCP and a 404 over HTTP, with no failing test to say so.
  it('mounts every catalogue operation on an HTTP route, exactly once', () => {
    const mounted = mountedOperationNames();
    expect(mounted.length).toBeGreaterThan(0);
    expect([...mounted].sort()).toEqual([...ADMIN_API_OPERATION_NAMES].sort());
  });
});
