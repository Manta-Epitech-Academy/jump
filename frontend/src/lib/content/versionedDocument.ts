/**
 * The rules a versioned legal document obeys, stated once for every document
 * that has one.
 *
 * A document needs versioning as soon as its rendered PDF is regenerated from
 * DB state rather than kept as the bytes that were signed. Both of Jump's are:
 * the règlement intérieur re-renders on every guardian co-signature, and the
 * droit à l'image re-renders on every change of mind or staff correction. With
 * the body taken from a single build-time import, editing the markdown rewrote
 * the wording of documents already signed, under signatures already given.
 * Pinning the version at signature time is what stops that.
 *
 * Four rules, and each of them is why this module exists rather than a plain
 * `Record` per document:
 *
 *  1. **A version key names the school year the text took effect**, reusing the
 *     canonical label format of `domain/schoolYear.ts`.
 *  2. **A published version file never changes and is never deleted.** A new
 *     wording is a new key, because an old key must keep resolving for as long
 *     as one signature points at it.
 *  3. **A stored version of `null` resolves to the legacy text, never to the
 *     current one.** A signature with no stored version necessarily predates the
 *     column, so the legacy text is what was in force then: that fallback is
 *     correct by construction, not a guess.
 *  4. **An unknown key throws instead of falling back.** It means a version file
 *     was deleted or renamed out from under a signature, and rendering some
 *     other text under that signature is worse than a failed PDF job, which
 *     surfaces on `/staff/admin/onboarding-pdfs` and can be retried once the
 *     file is restored.
 *
 * Generic over what a version holds: the règlement holds one markdown string,
 * the droit à l'image holds one per decision (an authorization and a refusal are
 * two texts of the same version). Imports on the calling side stay static and
 * explicit, because `?raw` is resolved at build time and the set of versions has
 * to be knowable without running anything.
 */

export interface VersionedDocument<Content, Version extends string> {
  /** Every published version, keyed by school-year label. */
  readonly VERSIONS: Record<Version, Content>;
  /** The version a signature taken right now commits to. */
  readonly CURRENT: Version;
  /** The text in force before versioning existed, for a null stored version. */
  readonly LEGACY: Version;
  isVersion(v: string): v is Version;
  /**
   * What a given signature committed to. Pass what was stored on the row: null
   * resolves to {@link LEGACY} (rule 3), an unknown key throws (rule 4).
   */
  contentFor(version: string | null | undefined): Content;
}

export function createVersionedDocument<Content, Version extends string>(opts: {
  versions: Record<Version, Content>;
  current: Version;
  legacy: Version;
  /**
   * French name of the document, used in the refusal message. It lands in
   * `OnboardingPdfJob.errorMessage` and is read off the admin PDF page by a
   * French-speaking human, so it is French like the message around it.
   */
  label: string;
}): VersionedDocument<Content, Version> {
  const { versions, current, legacy, label } = opts;

  const isVersion = (v: string): v is Version => Object.hasOwn(versions, v);

  return {
    VERSIONS: versions,
    CURRENT: current,
    LEGACY: legacy,
    isVersion,
    contentFor(version) {
      if (version == null) return versions[legacy];
      if (!isVersion(version)) {
        throw new Error(
          `Version de ${label} inconnue: "${version}". Un fichier de version publiée ne doit jamais être supprimé ni renommé.`,
        );
      }
      return versions[version];
    },
  };
}
