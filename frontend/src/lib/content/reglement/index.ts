/**
 * The règlement intérieur, one immutable file per version.
 *
 * The rules a version obeys (never edited once signed, never deleted, an
 * unknown key throws, a null key resolves to the legacy text) live once in
 * `../versionedDocument.ts` and are not restated here. What is specific to this
 * document is below: it has TWO signers committing at different times, which is
 * what {@link applicableReglementVersion} exists for.
 *
 * Imports are static and explicit on purpose: `?raw` is resolved at build time,
 * so the set of versions has to be knowable without running anything.
 */
import { createVersionedDocument } from '../versionedDocument';
import legacy from './2025-2026.md?raw';
import generic from './2026-2027.md?raw';

const VERSIONS = {
  '2025-2026': legacy,
  '2026-2027': generic,
} as const satisfies Record<string, string>;

const catalogue = createVersionedDocument({
  versions: VERSIONS,
  current: '2026-2027',
  legacy: '2025-2026',
  label: 'règlement',
});

export const REGLEMENT_VERSIONS = catalogue.VERSIONS;

export type ReglementVersion = keyof typeof VERSIONS;

/**
 * The version a signature taken right now commits to. This is the only value
 * ever written to a dossier's `reglementVersion`; everything else reads back
 * what was stored.
 */
export const CURRENT_REGLEMENT_VERSION: ReglementVersion = catalogue.CURRENT;

/** The stage-framed text in force before versioning existed. */
export const LEGACY_REGLEMENT_VERSION: ReglementVersion = catalogue.LEGACY;

export const isReglementVersion = catalogue.isVersion;

/** The markdown a given signature committed to. Pass what was stored on the row. */
export const reglementTextFor = catalogue.contentFor;

/**
 * Which version a signature act applies to, from what the talent already
 * committed to. Two distinct cases hide behind a null column and they resolve
 * opposite ways:
 *
 *  - the talent has not signed yet, so nothing is pinned and the act commits to
 *    the current wording;
 *  - the talent signed before this column existed, so the act must join the
 *    text they were actually shown, never the current one.
 *
 * Bare positional args rather than a talent shape, so the guardian flow and the
 * PDF worker can both call it from whatever row shape they already selected.
 *
 * The droit à l'image has no counterpart to this: a single signer means a new
 * decision always commits to the current wording.
 */
export function applicableReglementVersion(
  talentSignedAt: Date | null | undefined,
  storedVersion: string | null | undefined,
): ReglementVersion {
  if (talentSignedAt == null) return CURRENT_REGLEMENT_VERSION;
  if (storedVersion != null && isReglementVersion(storedVersion)) {
    return storedVersion;
  }
  return LEGACY_REGLEMENT_VERSION;
}
