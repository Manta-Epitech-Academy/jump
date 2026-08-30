/**
 * The version a signed document is pinned to.
 *
 * These are read off the catalogue directories rather than imported from
 * `content/reglement` and `content/droit-image`, and the reason is a hard one:
 * those modules pull their text through Vite's `?raw` imports and reach `$lib`,
 * so they do not resolve under plain `bun`. The rest of `src/lib/domain` does,
 * which is why everything else here is imported rather than restated.
 *
 * Reading the directory is not the same as restating a constant. The version
 * files ARE the catalogue - a published one is never edited and never deleted,
 * and a new wording is a new key - so the newest school-year label present is
 * the version in force. Add a version file and the generator pins to it without
 * anybody touching this code, which is the same self-maintaining property the
 * enum coverage check has.
 *
 * The one thing this cannot see is a version that has been written but not yet
 * declared current. If that case ever appears, this picks it up early, and the
 * fix is a marker in the directory rather than a hardcoded string here.
 */

import { readdirSync } from 'node:fs';
import path from 'node:path';

const SCHOOL_YEAR = /^(\d{4}-\d{4})/;

function latestVersionIn(directory: string): string {
  const absolute = path.resolve(
    __dirname,
    '../../../src/lib/content',
    directory,
  );
  const labels = new Set<string>();
  for (const entry of readdirSync(absolute)) {
    const match = SCHOOL_YEAR.exec(entry);
    if (match) labels.add(match[1]!);
  }
  const sorted = [...labels].sort();
  const latest = sorted[sorted.length - 1];
  if (!latest) {
    throw new Error(
      `Aucune version trouvée dans src/lib/content/${directory}.`,
    );
  }
  return latest;
}

export const CURRENT_REGLEMENT_VERSION = latestVersionIn('reglement');
export const CURRENT_DROIT_IMAGE_VERSION = latestVersionIn('droit-image');
