/**
 * The règlement intérieur, one immutable file per version.
 *
 * The PDF is a shared multi-signer artifact regenerated from DB state every
 * time either signer commits (`onboardingPdfJobService`), and its body used to
 * be a single build-time import. Editing the text therefore rewrote the wording
 * of every document regenerated afterwards, under a signature already given.
 * Pinning the version at signature time is what stops that: a talent who signed
 * in 2025 gets the 2025 text re-rendered in 2027.
 *
 * A version key names the school year the text took effect, reusing the
 * canonical label format of `domain/schoolYear.ts`. **A published version file
 * never changes and is never deleted** - a new wording is a new key, because an
 * old key must keep resolving for as long as one signature points at it.
 *
 * Imports are static and explicit on purpose: `?raw` is resolved at build time,
 * so the set of versions has to be knowable without running anything.
 */
import legacy from './2025-2026.md?raw';
import generic from './2026-2027.md?raw';

export const REGLEMENT_VERSIONS = {
  '2025-2026': legacy,
  '2026-2027': generic,
} as const;

export type ReglementVersion = keyof typeof REGLEMENT_VERSIONS;

/**
 * The version a signature taken right now commits to. This is the only value
 * ever written to `Talent.reglementVersion`; everything else reads back what
 * was stored.
 */
export const CURRENT_REGLEMENT_VERSION: ReglementVersion = '2026-2027';

/**
 * The stage-framed text in force before versioning existed. A signature with no
 * stored version necessarily predates the column, so it resolves here rather
 * than to the current text: that fallback is correct by construction, not a
 * guess.
 */
export const LEGACY_REGLEMENT_VERSION: ReglementVersion = '2025-2026';

export function isReglementVersion(v: string): v is ReglementVersion {
  return v in REGLEMENT_VERSIONS;
}

/**
 * The markdown a given signature committed to. Pass what was stored on the row.
 *
 * An unknown key throws instead of falling back: it means a version file was
 * deleted or renamed out from under a signature, and rendering some other text
 * under that signature is worse than a failed PDF job (which surfaces on
 * `/staff/admin/onboarding-pdfs` and can be retried once the file is restored).
 */
export function reglementTextFor(version: string | null | undefined): string {
  if (version == null) return REGLEMENT_VERSIONS[LEGACY_REGLEMENT_VERSION];
  if (!isReglementVersion(version)) {
    throw new Error(
      `Version de règlement inconnue: "${version}". Un fichier de version publiée ne doit jamais être supprimé ni renommé.`,
    );
  }
  return REGLEMENT_VERSIONS[version];
}

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
