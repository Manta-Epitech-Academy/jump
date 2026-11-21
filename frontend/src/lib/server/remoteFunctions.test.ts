import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every remote function is declared through `gatedQuery` / `gatedCommand`, so
 * none can be mounted without a gate. The route guards never see a remote call
 * (`RemoteGate` in `auth/guards.ts`), so a function declared with kit's own
 * `query` would answer anyone who can reach the server.
 */

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

// Kit's own test for a remote module (`remote_module_pattern`).
const REMOTE_MODULE = /[/.]remote\.[^/]+$/;
const WRAPPER = 'src/lib/server/remoteFunctions.ts';
const KIT_DECLARERS = /import\s*{([^}]*)}\s*from\s*['"]\$app\/server['"]/g;
const DECLARER = /\b(query|command|form|prerender)\b/;
const KIT_NAMESPACE = /import\s*\*\s*as\s+\w+\s+from\s*['"]\$app\/server['"]/;

const sources = walk('src').filter((f) => /\.(ts|js|svelte)$/.test(f));

describe('remote functions', () => {
  it("declare nothing with kit's own query, command, form or prerender", () => {
    const offenders = sources.filter((file) => {
      if (file === WRAPPER) return false;
      const text = readFileSync(file, 'utf8');
      return (
        KIT_NAMESPACE.test(text) ||
        [...text.matchAll(KIT_DECLARERS)].some(([, names]) =>
          DECLARER.test(names),
        )
      );
    });
    expect(offenders).toEqual([]);
  });

  it('export only gated functions from every remote module', () => {
    const remoteModules = sources.filter(
      (f) => REMOTE_MODULE.test(f) && !f.endsWith('.test.ts'),
    );
    const ungated = remoteModules.flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      return [...text.matchAll(/export\s+const\s+(\w+)\s*=\s*(\w+)/g)]
        .filter(([, , declarer]) => !/^gated(Query|Command)$/.test(declarer))
        .map(([, name]) => `${file}: ${name}`);
    });
    expect(ungated).toEqual([]);
  });
});
