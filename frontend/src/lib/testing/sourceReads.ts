import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Source-walking guards: a unit test that reads the code itself to hold a rule
 * every read has to remember, such as a fragment a Prisma `where` must spread.
 * Shared by the guards in `sfMemberStatus.test.ts` (the cohort the dev space
 * shows) and `eventReadiness.test.ts` (the events anyone but an admin is
 * shown), so the two walk and match the same way. Test-only: nothing in the
 * application imports it.
 */

/** Every file under a directory tree, recursively. */
export function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** The text from an opening bracket to the one that closes it. */
export function balanced(source: string, open: number): string {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '(' || source[i] === '{') depth++;
    else if (source[i] === ')' || source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return source.slice(open);
}

/**
 * The arguments of every read in `source` that names none of its markers. A
 * read is a match of `read` ending on its opening bracket, so the argument it
 * opens is the text checked.
 */
export function readsWithout(
  source: string,
  read: RegExp,
  markers: readonly string[],
): string[] {
  return [...source.matchAll(read)]
    .map((m) => balanced(source, (m.index ?? 0) + m[0].length - 1))
    .filter((arg) => !markers.some((marker) => arg.includes(marker)));
}
