import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  classifySfStatus,
  isShownInDevSpace,
  normalizeSfStatus,
} from './sfMemberStatus';

/** The vocabulary the migration ships, and a stage that shows two of it. */
const known = new Set(['READY', 'MET', 'CONNECTED', 'DESISTED']);
const stage = new Set(['READY', 'MET']);
const codingClub = new Set(['READY', 'MET', 'CONNECTED']);

describe('sfMemberStatus domain logic', () => {
  describe('isShownInDevSpace', () => {
    it('shows a word the event shows, whatever its case', () => {
      expect(isShownInDevSpace('MET', stage)).toBe(true);
      expect(isShownInDevSpace('ready  ', stage)).toBe(true);
    });

    it('follows the event, not a platform-wide rule', () => {
      expect(isShownInDevSpace('CONNECTED', stage)).toBe(false);
      expect(isShownInDevSpace('CONNECTED', codingClub)).toBe(true);
    });

    // A row synced before the column existed: no event can name the absence of
    // a word, so it is shown everywhere, even on an event that shows nothing.
    it('always shows a row without a status', () => {
      expect(isShownInDevSpace(null, new Set())).toBe(true);
      expect(isShownInDevSpace('  ', new Set())).toBe(true);
    });
  });

  describe('classifySfStatus', () => {
    it('tells a word the event shows from one it masks', () => {
      expect(classifySfStatus('Met', { known, shown: stage })).toBe('shown');
      expect(classifySfStatus('CONNECTED', { known, shown: stage })).toBe(
        'hidden',
      );
      expect(classifySfStatus('CONNECTED', { known, shown: codingClub })).toBe(
        'shown',
      );
    });

    // Regression for #368: the seminar's `MEET` is not a status Salesforce
    // sends, and a word missing from the catalogue must read as unknown rather
    // than as one somebody chose to hide.
    it('keeps a word the catalogue lacks apart from a hidden one', () => {
      expect(classifySfStatus('MEET', { known, shown: stage })).toBe(
        'unrecognised',
      );
    });

    it('treats an empty status as missing', () => {
      expect(classifySfStatus(null, { known, shown: stage })).toBe('missing');
      expect(classifySfStatus('  ', { known, shown: stage })).toBe('missing');
    });
  });

  describe('normalizeSfStatus', () => {
    it('returns null for null, undefined, or empty string', () => {
      expect(normalizeSfStatus(null)).toBe(null);
      expect(normalizeSfStatus(undefined)).toBe(null);
      expect(normalizeSfStatus('')).toBe(null);
    });

    it('trims and uppercases valid status strings', () => {
      expect(normalizeSfStatus('ready')).toBe('READY');
      expect(normalizeSfStatus('met  ')).toBe('MET');
      expect(normalizeSfStatus('Connected')).toBe('CONNECTED');
    });
  });
});

/** Every file under a directory tree, recursively. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/**
 * The reads a dev surface makes of a cohort, each with the marker that scopes
 * it to the cohort the dev space shows: an enrolment read (a delegate call, or a
 * relation filter on them) spreads `visibleParticipationWhere`, and a read of
 * bilan answers goes through `shownCohortOf`, which applies it on the answer's
 * enrolment.
 */
const COHORT_READS = [
  {
    read: /\bparticipation\.(findMany|findFirst|findFirstOrThrow|findUnique|findUniqueOrThrow|count|groupBy|aggregate)\(|\bparticipations:\s*\{/g,
    marker: 'visibleParticipationWhere',
  },
  {
    read: /\bfeedback_Submission\.(findMany|findFirst|findFirstOrThrow|findUnique|findUniqueOrThrow|count|groupBy|aggregate)\(|\bcomputeFormStats\(/g,
    marker: 'shownCohortOf',
  },
] as const;

/** The text from an opening bracket to the one that closes it. */
function balanced(source: string, open: number): string {
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

/** The arguments of every cohort read in a source that do not carry its marker. */
function readsWithoutFragment(source: string): string[] {
  return COHORT_READS.flatMap(({ read, marker }) =>
    [...source.matchAll(read)]
      .map((m) => balanced(source, (m.index ?? 0) + m[0].length - 1))
      .filter((arg) => !arg.includes(marker)),
  );
}

const DEV_ROUTES = 'src/routes/(staff)/staff/dev';

/**
 * Where a dev-workspace roster can be read: every route of the workspace, and
 * every server module that reads through the campus-scoped client.
 */
const devReaders = [
  ...walk(DEV_ROUTES),
  ...walk('src/lib').filter(
    (f) =>
      !f.endsWith('db/scoped.ts') &&
      readFileSync(f, 'utf-8').includes('$lib/server/db/scoped'),
  ),
].filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));

/**
 * A roster the dev space prints or exports must be the one it shows. That was a
 * fragment each read had to remember, and five forgot it (certificates, badges,
 * both exports, the bilan denominator), so a withdrawn talent got a certificate
 * and their phone number went out in a spreadsheet the screen never showed them in.
 * The bilan's own figures and export read answers rather than enrolments, and
 * listed a withdrawn talent's name and address the same way.
 */
describe('every dev roster reads the visible cohort', () => {
  it('finds a read that drops the fragment', () => {
    const doctored = `db.participation.findMany({ where: { eventId } });
      db.participation.count({ where: { eventId, ...visibleParticipationWhere } });
      computeFormStats(form.id, { eventId });
      computeFormStats(form.id, { shownCohortOf: eventId });`;
    expect(readsWithoutFragment(doctored)).toHaveLength(2);
  });

  it('walks the workspace', () => {
    expect(devReaders).toContain(
      `${DEV_ROUTES}/events/[id]/emargement/+page.server.ts`,
    );
  });

  it('scopes every cohort read to the cohort the dev space shows', () => {
    const offenders = devReaders.flatMap((file) => {
      const missing = readsWithoutFragment(readFileSync(file, 'utf-8'));
      return missing.length === 0
        ? []
        : [`${file}: ${missing.length} read(s) without the cohort`];
    });
    expect(offenders).toEqual([]);
  });
});
