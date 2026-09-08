import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  USAGE_FEATURES,
  USAGE_FEATURE_KEYS,
  USAGE_FEATURE_DEFS,
  USAGE_VIEW_ROUTES,
  USAGE_MEASURED_ELSEWHERE,
  USAGE_RAW_RETENTION_MONTHS,
  usageRawCutoff,
  usageConnectionFeature,
  usageConnectionFeatures,
  isUsageFeatureKey,
  type UsageFeatureKey,
} from './usage';

const ROUTES = 'src/routes';
const CATALOGUE = 'src/lib/domain/usage.ts';

/** Every file under a directory tree, recursively. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const sourceFiles = walk('src').filter(
  (f) => f.endsWith('.ts') || f.endsWith('.svelte'),
);

/**
 * The route ids SvelteKit would generate, derived the same way it does: the
 * directory path of every `+page.svelte`, relative to `src/routes`, with the
 * group prefix kept (which is what `event.route.id` carries).
 */
const realRouteIds = new Set(
  walk(ROUTES)
    .filter((f) => f.endsWith('/+page.svelte'))
    .map((f) => f.slice(ROUTES.length, -'/+page.svelte'.length))
    .map((id) => (id === '' ? '/' : id)),
);

describe('the usage catalogue', () => {
  it('gives every key a label and a definition that says what one use is', () => {
    for (const key of USAGE_FEATURE_KEYS) {
      const def = USAGE_FEATURE_DEFS[key];
      expect(def, key).toBeDefined();
      expect(def.key, key).toBe(key);
      expect(def.label.length, key).toBeGreaterThan(3);
      // Long enough that it cannot be a bare restatement of the label: a
      // definition is quoted verbatim into a chat answer and into the digest.
      expect(def.definition.length, key).toBeGreaterThan(30);
    }
  });

  it('names each key after the space it belongs to', () => {
    for (const key of USAGE_FEATURE_KEYS) {
      expect(key.startsWith(`${USAGE_FEATURE_DEFS[key].space}_`), key).toBe(
        true,
      );
    }
  });

  it('keeps kind, dedupe and scope coherent', () => {
    for (const key of USAGE_FEATURE_KEYS) {
      const { kind, dedupe, scope, audience, space } = USAGE_FEATURE_DEFS[key];
      // A visit is always bucketed: it is re-emitted by navigation, refetches
      // and hover-preload, none of which are extra uses.
      if (kind === 'view') expect(dedupe, key).toBe('bucket');
      // An export or a document is the occurrence itself.
      if (kind === 'export' || kind === 'document')
        expect(dedupe, key).toBe('each');
      // A connection answers "how often does this person come", so the day is
      // the unit. Leaving one bucketed would count a working day as up to 48
      // arrivals, and the mistake is invisible: `usageDedupeKey` has no branch
      // on `kind` any more, so nothing else would refuse it.
      if (kind === 'connection') expect(dedupe, key).toBe('day');
      // The admin space is national, so a per-campus reading of it would not
      // hold; only dev and talent surfaces carry a campus.
      if (space === 'admin') expect(scope, key).toBe('global');
      // An event-scoped feature lives on a surface that is about one event, so
      // dev or talent, never the national admin space.
      if (scope === 'event') expect(['dev', 'talent'], key).toContain(space);
      expect(audience === 'talent' ? space : 'talent', key).toBe('talent');
    }
  });

  it('recognises its own keys and nothing else', () => {
    for (const key of USAGE_FEATURE_KEYS)
      expect(isUsageFeatureKey(key)).toBe(true);
    expect(isUsageFeatureKey('dev_not_a_feature')).toBe(false);
    expect(isUsageFeatureKey('')).toBe(false);
  });

  it('states a retention window the purge and the charte can both read', () => {
    expect(USAGE_RAW_RETENTION_MONTHS).toBeGreaterThan(0);
    // The charte a minor accepts quotes this number, so it may not silently
    // become a value the purge does not keep.
    const charte = readFileSync(
      'src/lib/content/charte-informatique.md',
      'utf-8',
    );
    expect(charte).toContain('{{usageRetentionMonths}}');
    // And the talent settings page states the same delay. It used to state it
    // as a literal, which is the drift the constant exists to prevent.
    const settings = readFileSync(
      'src/routes/(talent)/settings/+page.svelte',
      'utf-8',
    );
    expect(settings).toContain('USAGE_RAW_RETENTION_MONTHS');
  });

  it('subtracts calendar months, not a fixed number of days', () => {
    // 29 Feb is the case a day-count gets wrong: twelve months before it is
    // 29 Feb 2024, not "365 days earlier".
    const cutoff = usageRawCutoff(new Date('2027-03-15T12:00:00Z'));
    expect(cutoff.getFullYear()).toBe(2026);
    expect(cutoff.getMonth()).toBe(2);
    expect(cutoff.getDate()).toBe(15);
  });
});

describe('the view-route map', () => {
  it('maps only real routes', () => {
    for (const routeId of Object.keys(USAGE_VIEW_ROUTES)) {
      expect(realRouteIds.has(routeId), routeId).toBe(true);
    }
  });

  it('maps only real keys, and only view keys', () => {
    for (const [routeId, key] of Object.entries(USAGE_VIEW_ROUTES)) {
      expect(isUsageFeatureKey(key), routeId).toBe(true);
      expect(USAGE_FEATURE_DEFS[key].kind, routeId).toBe('view');
    }
  });

  it('maps each key at most once', () => {
    const mapped = Object.values(USAGE_VIEW_ROUTES);
    expect(new Set(mapped).size).toBe(mapped.length);
  });

  it('resolves a connection key per space, and none outside them', () => {
    expect(usageConnectionFeature('/(staff)/staff/admin/users')).toBe(
      USAGE_FEATURES.ADMIN_CONNECTION,
    );
    expect(
      usageConnectionFeature('/(staff)/staff/dev/events/[id]/inscrits'),
    ).toBe(USAGE_FEATURES.DEV_CONNECTION);
    expect(usageConnectionFeature('/(talent)/xp')).toBe(
      USAGE_FEATURES.TALENT_CONNECTION,
    );
    // Admin is tested before dev, or every admin route would read as a dev one.
    expect(usageConnectionFeature('/(staff)/staff/admin')).toBe(
      USAGE_FEATURES.ADMIN_CONNECTION,
    );
    expect(usageConnectionFeature('/(parent)/parent')).toBeNull();
    expect(usageConnectionFeature('/f/[slug]')).toBeNull();
  });

  it('gives each space exactly one connection key', () => {
    const spaces = USAGE_FEATURE_KEYS.filter(
      (key) => USAGE_FEATURE_DEFS[key].kind === 'connection',
    ).map((key) => USAGE_FEATURE_DEFS[key].space);
    // Both directions matter. A second key for one space could never be
    // written, since `usageConnectionFeature` returns one per prefix; a space
    // with none would stop counting the days anybody came there at all.
    expect([...spaces].sort()).toEqual(['admin', 'dev', 'talent']);
  });
});

describe('the catalogue and the code cannot drift', () => {
  /**
   * The hole this closes is the one `handles.test.ts` closes for API parameters:
   * a key that is declared and never recorded sits in every answer as a
   * permanent zero, and reads exactly like a feature nobody uses. That is the
   * one wrong answer this whole feature exists to prevent.
   */
  it('records every declared key somewhere, or maps it as a view', () => {
    const callSites = sourceFiles
      .filter((f) => f !== CATALOGUE)
      .map((f) => readFileSync(f, 'utf-8'))
      .join('\n');
    // A connection key is reached through `usageConnectionFeature` and a view
    // key through `USAGE_VIEW_ROUTES`. Both maps live in the catalogue itself,
    // which this scan excludes, so both are counted as recording sites here:
    // what makes them recorded is the map, not a call naming the constant.
    const mappedInHooks = new Set<string>([
      ...Object.values(USAGE_VIEW_ROUTES),
      ...usageConnectionFeatures('staff'),
      ...usageConnectionFeatures('talent'),
    ]);
    const constByKey = new Map<UsageFeatureKey, string>(
      Object.entries(USAGE_FEATURES).map(([c, k]) => [k, c]),
    );

    const orphans = USAGE_FEATURE_KEYS.filter(
      (key) =>
        !mappedInHooks.has(key) &&
        !callSites.includes(`USAGE_FEATURES.${constByKey.get(key)}`),
    );
    expect(orphans).toEqual([]);
  });

  /**
   * No usage recording may be triggered by client code on a talent surface.
   * Instructing a browser to post a result back is an access to the terminal
   * under art. 5(3) ePD, which would drag this into art. 82 consent; a pure
   * server-side log is not. So the recorder must be unreachable from anything
   * that ships to a browser.
   */
  it('never reaches the recorder from client code', () => {
    // `src/hooks.server.ts` is server code by SvelteKit's own convention even
    // though it sits outside `$lib/server`, and it is where visits and
    // connections are counted. Everything else outside `$lib/server` and `src/routes` ships
    // to a browser.
    const serverOnly = new Set(['src/hooks.server.ts']);
    const offenders = sourceFiles
      .filter(
        (f) => !f.startsWith('src/lib/server/') && !f.endsWith('.test.ts'),
      )
      .filter((f) => !f.includes('/routes/') && !serverOnly.has(f))
      .filter((f) => readFileSync(f, 'utf-8').includes('usage/record'));
    expect(offenders).toEqual([]);
  });

  it('never imports the recorder into a .svelte component', () => {
    const offenders = sourceFiles
      .filter((f) => f.endsWith('.svelte'))
      .filter((f) => readFileSync(f, 'utf-8').includes('usage/record'));
    expect(offenders).toEqual([]);
  });

  it('has no /api/usage endpoint, and must never grow one', () => {
    const endpoints = walk(ROUTES).filter((f) => f.includes('/api/usage'));
    expect(endpoints).toEqual([]);
  });
});

describe('what is deliberately measured elsewhere', () => {
  it('points at an operation for every fact it declines to duplicate', () => {
    const entries = Object.entries(USAGE_MEASURED_ELSEWHERE);
    expect(entries.length).toBeGreaterThan(0);
    for (const [fact, operation] of entries) {
      expect(fact.length, operation).toBeGreaterThan(5);
      expect(operation, fact).toMatch(/^(stats|ops)_[a-z_]+$/);
    }
  });
});
