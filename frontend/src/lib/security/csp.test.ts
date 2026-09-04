/**
 * The executable half of the Content-Security-Policy, mirroring what
 * `design/contract.test.ts` does for DESIGN.md.
 *
 * Issue #277 removed `'unsafe-inline'` and `'unsafe-hashes'` from `script-src`
 * by moving the fixed directives to `kit.csp`, which hands out a real
 * per-request nonce. The header itself is asserted end to end in
 * `tests/e2e/csp.spec.ts`, against a real server, because that is the only place
 * the nonce exists.
 *
 * What is asserted HERE is the half a running server cannot show: that the
 * concession is gone from the SOURCE, and that the Umami session recorder which
 * was its only justification (issue #275) cannot come back without a test going
 * red. Both were prose in a comment until now, and a comment does not fail.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { frameSrcDirective, LOCKED_DOWN_CSP } from './csp';

/** Every file under a directory tree, recursively. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const SELF = 'src/lib/security/csp.test.ts';
const CONFIG = 'svelte.config.js';
const HOOKS = 'src/hooks.server.ts';

const sourceFiles = walk('src').filter(
  (f) => f.endsWith('.ts') || f.endsWith('.svelte'),
);

/**
 * A file's code, without its comments.
 *
 * Needed because AC5 of #277 asks these files to EXPLAIN the policy they
 * implement, so both of them legitimately name `'unsafe-inline'` in prose while
 * declaring it nowhere. Asserting over the raw text would make the honest
 * comment the thing that fails, and the fix would be to delete the explanation.
 *
 * Line-leading only, deliberately: a mid-line `//` is far more often part of a
 * URL (`https://client.crisp.chat`) than the start of a comment, and eating
 * those would blind the assertion to the very strings it exists to read.
 */
function code(path: string): string {
  return readFileSync(path, 'utf-8')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');
}

describe('the script-src concession is gone, and stays gone', () => {
  /**
   * `style-src` is the deliberate exception, and it is why this reads
   * `script-src` alone rather than the whole file: Svelte transitions assign
   * `element.style` at runtime, and a property assignment carries no nonce, so
   * `'unsafe-inline'` there is structural. A whole-file assertion would either
   * fail on that line or have to be weakened until it proved nothing.
   */
  it('names neither unsafe-inline nor unsafe-hashes in script-src', () => {
    const scriptSrc = code(CONFIG).match(/'script-src':\s*\[([^\]]*)\]/)?.[1];
    expect(scriptSrc, `no script-src array found in ${CONFIG}`).toBeDefined();
    expect(scriptSrc).not.toContain('unsafe-inline');
    expect(scriptSrc).not.toContain('unsafe-hashes');
  });

  /**
   * `mode: 'auto'` is what produces the nonce. Left off, kit falls back to
   * hashing the inline scripts it emitted: a valid policy that silently covers
   * nothing added afterwards, and a header that still looks hardened.
   */
  it('lets kit.csp issue a nonce rather than hashing what it happened to emit', () => {
    expect(code(CONFIG)).toMatch(/mode:\s*'auto'/);
  });

  /**
   * The hand-built policy is what carried the concession, and re-introducing one
   * would be invisible: `setSecurityHeaders` would overwrite kit's header, nonce
   * and all, while every assertion above still passed.
   *
   * `default-src` is the tell, and it occurs exactly once, in the locked-down
   * policy for responses kit never rendered. A second occurrence means a page
   * policy has grown back here.
   */
  it('never rebuilds a whole policy in hooks.server.ts', () => {
    expect(code(HOOKS)).not.toMatch(
      /unsafe-inline|unsafe-hashes|default-src|script-src|frame-src/,
    );
  });
});

describe('frame-src, the directive still computed per request', () => {
  it('carries the deployed wildcards with no games URL configured', () => {
    const directive = frameSrcDirective(undefined);
    expect(directive).toBe(
      "frame-src 'self' https://*.epiboost.eu https://*.epiboost.fr",
    );
  });

  /**
   * The case the directive exists for. A deployed games host already matches the
   * wildcard, so if this ever silently returned the wildcards alone, nothing
   * outside a developer's own machine would notice.
   */
  it('appends a local jump-games origin', () => {
    expect(frameSrcDirective('http://localhost:5174')).toContain(
      'http://localhost:5174',
    );
  });

  /** The origin, not the URL: a path would make the whole directive invalid. */
  it('reduces a games URL to its origin', () => {
    const directive = frameSrcDirective('http://localhost:5174/games/list?a=1');
    expect(directive).toContain('http://localhost:5174');
    expect(directive).not.toContain('/games/list');
    expect(directive).not.toContain('?a=1');
  });

  /**
   * A typo in an env var must cost a mini-game that will not frame, never a
   * request that 500s and never a policy that fails open.
   */
  it('falls back to the wildcards on a malformed URL rather than throwing', () => {
    expect(frameSrcDirective('not a url')).toBe(frameSrcDirective(undefined));
    expect(frameSrcDirective('')).toBe(frameSrcDirective(undefined));
  });
});

describe('the policy for a response kit never rendered', () => {
  /**
   * `default-src 'none'` is the whole point: these are guard redirects, JSON
   * action results and `+server.ts` endpoints, and a permissive page policy
   * applied to them was what this replaced.
   */
  it('refuses every fetch directive', () => {
    expect(LOCKED_DOWN_CSP).toContain("default-src 'none'");
    expect(LOCKED_DOWN_CSP).not.toContain("'self'");
    expect(LOCKED_DOWN_CSP).not.toContain('unsafe');
  });

  it('still forbids being framed, and pins the two injection sinks', () => {
    expect(LOCKED_DOWN_CSP).toContain("frame-ancestors 'none'");
    expect(LOCKED_DOWN_CSP).toContain("base-uri 'none'");
    expect(LOCKED_DOWN_CSP).toContain("form-action 'none'");
  });
});

describe('the Umami session recorder', () => {
  /**
   * It filmed minors on the talent and parent portals, and their contact details
   * off the staff screens that display them, and it was the only reason the CSP
   * carried `'unsafe-inline'`. Bringing it back is a one-line change in
   * `Umami.svelte`, so the ban is asserted over the whole tree rather than over
   * that one file.
   */
  it('is referenced by no source file', () => {
    const offenders = sourceFiles
      .filter((f) => f !== SELF)
      .filter((f) => {
        const body = readFileSync(f, 'utf-8');
        return (
          body.includes('recorder.js') || body.includes('PUBLIC_UMAMI_RECORDER')
        );
      });
    expect(offenders).toEqual([]);
  });

  /**
   * Page views and named events are out of scope of both issues, and a cleanup
   * that mistook them for the recorder would take with them the only client-side
   * error signal Jump has: every `_failed` event's denominator. So the tracker is
   * asserted PRESENT, not merely permitted.
   */
  it('left the page-view tracker in place', () => {
    const umami = readFileSync('src/lib/components/Umami.svelte', 'utf-8');
    expect(umami).toContain('/script.js');
    expect(umami).toContain('PUBLIC_UMAMI_WEBSITE_ID');
  });
});
