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

function versionsIn(directory: string): string[] {
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
  if (sorted.length === 0) {
    throw new Error(
      `Aucune version trouvée dans src/lib/content/${directory}.`,
    );
  }
  return sorted;
}

/** Every published version, oldest first. A frozen one is still a real state. */
export const REGLEMENT_VERSIONS = versionsIn('reglement');
export const DROIT_IMAGE_VERSIONS = versionsIn('droit-image');

export const CURRENT_REGLEMENT_VERSION =
  REGLEMENT_VERSIONS[REGLEMENT_VERSIONS.length - 1]!;
export const CURRENT_DROIT_IMAGE_VERSION =
  DROIT_IMAGE_VERSIONS[DROIT_IMAGE_VERSIONS.length - 1]!;

/**
 * The version in force for a school year.
 *
 * A version label IS a school year, and a published version is never edited, so
 * the wording a dossier was signed under is the newest version at or before its
 * year. Pinning every dossier to the current version instead would say that a
 * document signed last year carries this year's wording, which is precisely what
 * version-pinning exists to prevent - and it left the frozen version with no row
 * anywhere in the dataset, so nothing exercised the re-render path.
 */
export function versionForYear(
  versions: readonly string[],
  schoolYear: string,
): string {
  const applicable = versions.filter((version) => version <= schoolYear);
  return applicable[applicable.length - 1] ?? versions[0]!;
}

/**
 * The versions a signature can already have been given under, at a school year.
 *
 * A version published for a year that has not begun is a real row in the
 * catalogue and an impossible row in the database, so a coverage check has to
 * know the difference.
 */
export function versionsInForceAt(
  versions: readonly string[],
  schoolYear: string,
): readonly string[] {
  return versions.filter((version) => version <= schoolYear);
}
