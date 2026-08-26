/**
 * The droit à l'image, one immutable pair of files per version.
 *
 * A version holds TWO documents, not one: an authorization and a refusal are
 * both legal artifacts of the same wording, signed by the same guardian on the
 * same screen, and they have to move together. Keying the version on a
 * `{ accepted, refused }` record rather than shipping two independent
 * catalogues is what stops a version existing on one side and not the other.
 *
 * The rules a version obeys (never edited once signed, never deleted, an
 * unknown key throws, a null key resolves to the legacy text) live once in
 * `../versionedDocument.ts` and are not restated here.
 *
 * Why this document needs versioning at all is the same reason the règlement
 * did, and it was already true before the decision became annual: the PDF is
 * regenerated from DB state on every change of mind and every staff correction
 * (`server/services/imageRightsService.ts`), so with the body taken from a
 * single build-time import, editing the markdown rewrote documents already
 * signed. `ImageRightsDecisionRecord.version` pins what each fact committed to,
 * and the year's dossier carries the same value for the render.
 */
import type { ImageRightsDecision } from '$lib/domain/imageRights';
import { createVersionedDocument } from '../versionedDocument';

import autorisation20252026 from './2025-2026-autorisation.md?raw';
import refus20252026 from './2025-2026-refus.md?raw';
import autorisation20262027 from './2026-2027-autorisation.md?raw';
import refus20262027 from './2026-2027-refus.md?raw';

/** The two texts of one version, keyed by the decision they attest. */
export type DroitImageTexts = Record<ImageRightsDecision, string>;

const VERSIONS = {
  '2025-2026': {
    accepted: autorisation20252026,
    refused: refus20252026,
  },
  '2026-2027': {
    accepted: autorisation20262027,
    refused: refus20262027,
  },
} as const satisfies Record<string, DroitImageTexts>;

const catalogue = createVersionedDocument({
  versions: VERSIONS,
  current: '2026-2027',
  legacy: '2025-2026',
  label: "droit à l'image",
});

export const DROIT_IMAGE_VERSIONS = catalogue.VERSIONS;
export type DroitImageVersion = keyof typeof VERSIONS;

/**
 * The version a decision taken right now commits to. This is the only value
 * ever written to `ImageRightsDecisionRecord.version`; everything else reads
 * back what was stored.
 *
 * Unlike the règlement there is no `applicable…` resolver: the règlement has two
 * signers committing at different times, so a guardian has to join the version
 * their child already pinned. The droit à l'image has a single signer, so a new
 * decision always commits to the current wording.
 */
export const CURRENT_DROIT_IMAGE_VERSION: DroitImageVersion = catalogue.CURRENT;

/** The stage-framed texts in force before versioning existed. */
export const LEGACY_DROIT_IMAGE_VERSION: DroitImageVersion = catalogue.LEGACY;

export const isDroitImageVersion = catalogue.isVersion;

/**
 * The full document a given decision committed to, placeholders included: what
 * the PDF renders. Pass the version stored on the row.
 */
export function droitImageDocumentFor(
  version: string | null | undefined,
  decision: ImageRightsDecision,
): string {
  return catalogue.contentFor(version)[decision];
}

/**
 * Marks where the guardian's engagement line ends and the clauses begin.
 *
 * The parent screen states the engagement through its own controls (the two
 * decision buttons and the declaration above them), then shows the clauses of
 * whichever branch was picked. That used to be a second pair of files holding a
 * hand-copied subset of the document, and the copies had already drifted: the
 * refusal shown on screen said « revenir sur ce choix » where the document it
 * signed said « revenir sur cette décision », and it repeated the stage framing
 * in a different place. One file per document, two views of it, is what keeps
 * the text read and the text signed identical.
 */
const CLAUSES_MARKER = '<!-- clauses -->';

/**
 * The clauses of a document, for the screen that shows them before the guardian
 * commits: everything after {@link CLAUSES_MARKER}, minus the signature line
 * (nothing is signed yet at that point).
 *
 * Throws on a version file with no marker rather than returning the whole text
 * or an empty string: the first would show a guardian a line addressed to
 * somebody who has not typed their name yet, the second would show them nothing
 * at all and let them decide blind.
 */
export function droitImageClausesFor(
  version: string | null | undefined,
  decision: ImageRightsDecision,
): string {
  const document = droitImageDocumentFor(version, decision);
  const at = document.indexOf(CLAUSES_MARKER);
  if (at === -1) {
    throw new Error(
      `Le document de droit à l'image (${decision}) ne porte pas le marqueur de clauses, sans lequel l'écran parent ne sait pas quoi afficher.`,
    );
  }
  // A second occurrence means somebody wrote the marker in the file's own
  // maintainer note. The split would then land inside that comment and the
  // screen would show a guardian the editing instructions instead of the
  // clauses they are about to accept, which is why this refuses rather than
  // taking the first one and hoping.
  if (document.indexOf(CLAUSES_MARKER, at + CLAUSES_MARKER.length) !== -1) {
    throw new Error(
      `Le document de droit à l'image (${decision}) porte plusieurs marqueurs de clauses : la découpe entre l'engagement et les clauses est ambiguë.`,
    );
  }
  return document
    .slice(at + CLAUSES_MARKER.length)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(
      (paragraph) =>
        paragraph.length > 0 && !paragraph.includes('{{signatureLine}}'),
    )
    .join('\n\n');
}
