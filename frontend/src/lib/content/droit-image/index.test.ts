import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '$lib/markdown';
import {
  DROIT_IMAGE_VERSIONS,
  CURRENT_DROIT_IMAGE_VERSION,
  LEGACY_DROIT_IMAGE_VERSION,
  droitImageDocumentFor,
  droitImageClausesFor,
} from './index';
import { IMAGE_RIGHTS_DECISIONS } from '$lib/domain/imageRights';

/**
 * The droit-à-l'image PDF is regenerated from DB state on every change of mind
 * and every staff correction, so what these functions return is what a minor's
 * legal guardian ends up having signed. The shared resolution rules are covered
 * in `../versionedDocument.test.ts`; what is tested here is specific to this
 * document: two texts per version, the maintainer notes, the placeholders, and
 * the split between what the screen shows and what the PDF renders.
 */
describe("droit à l'image versions", () => {
  const entries = Object.entries(DROIT_IMAGE_VERSIONS);

  it('keeps the legacy and current texts distinct, on both branches', () => {
    // Guards the mistake that would make every other test here pass while the
    // defect is back: pointing two keys at the same file.
    expect(LEGACY_DROIT_IMAGE_VERSION).not.toBe(CURRENT_DROIT_IMAGE_VERSION);
    for (const decision of IMAGE_RIGHTS_DECISIONS) {
      expect(
        DROIT_IMAGE_VERSIONS[LEGACY_DROIT_IMAGE_VERSION][decision],
        decision,
      ).not.toBe(DROIT_IMAGE_VERSIONS[CURRENT_DROIT_IMAGE_VERSION][decision]);
    }
  });

  it('never confuses the authorization with the refusal', () => {
    // The same document type backs both outcomes, and the generator picks by
    // decision. Swapping the two files would hand a guardian who refused a
    // document saying they authorized.
    for (const [version, texts] of entries) {
      expect(texts.accepted, version).not.toBe(texts.refused);
      expect(texts.accepted, version).toMatch(/autorise/);
      expect(texts.refused, version).toMatch(/refuse/);
    }
  });

  it('keeps the maintainer notes out of the rendered document', () => {
    // Each version file opens with an HTML comment aimed at whoever edits it,
    // and carries a second one splitting the engagement from the clauses. The
    // file IS the document, so those have exactly one place they must never
    // appear: the text a guardian signs. DOMPurify drops comment nodes, which is
    // the only reason writing them there is safe.
    for (const [version, texts] of entries) {
      for (const decision of IMAGE_RIGHTS_DECISIONS) {
        const html = renderMarkdown(texts[decision]);
        const label = `${version}/${decision}`;
        expect(html, label).not.toContain('<!--');
        expect(html, label).not.toContain('NE PAS MODIFIER');
        expect(html, label).not.toContain('Version en vigueur');
        expect(html.trimStart().startsWith('<p>'), label).toBe(true);
      }
    }
  });

  it('keeps every placeholder the generator substitutes', () => {
    // A placeholder dropped from a file renders as a document with a hole where
    // the signer's name should be, and nothing else would catch it: the
    // substitution is a plain string replace, so a missing token is a no-op.
    for (const [version, texts] of entries) {
      for (const decision of IMAGE_RIGHTS_DECISIONS) {
        const label = `${version}/${decision}`;
        expect(texts[decision], label).toContain('{{signerName}}');
        expect(texts[decision], label).toContain('{{relationship}}');
        expect(texts[decision], label).toContain('{{studentName}}');
        expect(texts[decision], label).toContain('{{signatureLine}}');
      }
    }
  });

  it('names the school year it covers, from the version that became annual', () => {
    // The decision is redemandée every year, so the document has to say which
    // one it covers. The legacy text predates that and legitimately does not.
    for (const decision of IMAGE_RIGHTS_DECISIONS) {
      expect(
        DROIT_IMAGE_VERSIONS[CURRENT_DROIT_IMAGE_VERSION][decision],
        decision,
      ).toContain('{{schoolYear}}');
      expect(
        DROIT_IMAGE_VERSIONS[LEGACY_DROIT_IMAGE_VERSION][decision],
        decision,
      ).not.toContain('{{schoolYear}}');
    }
  });

  it('drops the stage framing from the version in force', () => {
    // The wording said "dans le cadre du stage de seconde" while Coding Clubs
    // resumed on the platform, which is exactly the mismatch this version fixes.
    // The legacy file keeps it: it is what people actually signed.
    //
    // Asserted on the RENDERED document, not the raw file, because that is where
    // the promise is made: a maintainer note is free to name the framing it
    // removed, and DOMPurify drops it before any guardian sees it.
    for (const decision of IMAGE_RIGHTS_DECISIONS) {
      expect(
        renderMarkdown(
          DROIT_IMAGE_VERSIONS[CURRENT_DROIT_IMAGE_VERSION][decision],
        ),
        decision,
      ).not.toContain('stage de seconde');
      expect(
        renderMarkdown(
          DROIT_IMAGE_VERSIONS[LEGACY_DROIT_IMAGE_VERSION][decision],
        ),
        decision,
      ).toContain('stage de seconde');
    }
  });

  it('carries exactly one clauses marker per document', () => {
    // A second one, typically written into the file's own maintainer note, moves
    // the split inside that comment: the screen would then show a guardian the
    // editing instructions instead of the clauses they are about to accept.
    // `droitImageClausesFor` refuses in that case, and this is what keeps the
    // refusal from being the way anybody finds out.
    for (const [version, texts] of entries) {
      for (const decision of IMAGE_RIGHTS_DECISIONS) {
        const occurrences =
          texts[decision].split('<!-- clauses -->').length - 1;
        expect(occurrences, `${version}/${decision}`).toBe(1);
      }
    }
  });

  describe('the clauses the parent screen shows', () => {
    it('are a strict part of the document being signed', () => {
      // They used to be a second pair of files holding a hand-copied subset, and
      // the copies had drifted: the refusal on screen said « revenir sur ce
      // choix » where the document said « revenir sur cette décision ».
      for (const [version, texts] of entries) {
        for (const decision of IMAGE_RIGHTS_DECISIONS) {
          const clauses = droitImageClausesFor(version, decision);
          expect(texts[decision], `${version}/${decision}`).toContain(clauses);
        }
      }
    });

    it('leave out the engagement line and the signature line', () => {
      // Nothing is signed at the point the clauses are read, and the engagement
      // is expressed by the form's own buttons, so neither belongs on screen.
      for (const [version, texts] of entries) {
        for (const decision of IMAGE_RIGHTS_DECISIONS) {
          const clauses = droitImageClausesFor(version, decision);
          const label = `${version}/${decision}`;
          expect(clauses, label).not.toContain('{{signatureLine}}');
          expect(clauses, label).not.toContain('{{signerName}}');
          expect(clauses.length, label).toBeGreaterThan(0);
          expect(clauses.length, label).toBeLessThan(texts[decision].length);
        }
      }
    });
  });

  it('resolves a decision with no stored version to the legacy text', () => {
    for (const decision of IMAGE_RIGHTS_DECISIONS) {
      expect(droitImageDocumentFor(null, decision)).toBe(
        DROIT_IMAGE_VERSIONS[LEGACY_DROIT_IMAGE_VERSION][decision],
      );
    }
  });
});
