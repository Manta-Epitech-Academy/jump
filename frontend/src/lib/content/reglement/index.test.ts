import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '$lib/markdown';
import {
  REGLEMENT_VERSIONS,
  CURRENT_REGLEMENT_VERSION,
  LEGACY_REGLEMENT_VERSION,
  reglementTextFor,
  applicableReglementVersion,
  isReglementVersion,
} from './index';

/**
 * The règlement PDF is regenerated from DB state every time either signer
 * commits, so what these functions return is what a minor's guardian ends up
 * having signed. The invariant under test is narrow and legal: a signature
 * never moves onto a text its signer did not read.
 */
describe('règlement versions', () => {
  it('keeps the legacy and current texts distinct', () => {
    // Guards the mistake that would make every other test here pass while the
    // defect is back: pointing two keys at the same file.
    expect(LEGACY_REGLEMENT_VERSION).not.toBe(CURRENT_REGLEMENT_VERSION);
    expect(REGLEMENT_VERSIONS[LEGACY_REGLEMENT_VERSION]).not.toBe(
      REGLEMENT_VERSIONS[CURRENT_REGLEMENT_VERSION],
    );
  });

  it('keeps the maintainer notes out of the rendered document', () => {
    // Each version file opens with an HTML comment aimed at whoever edits it
    // (this one is a draft / this one is frozen because it has been signed).
    // The file IS the document, so that note has exactly one place it must
    // never appear: the text an élève reads and a guardian signs. DOMPurify
    // drops comment nodes, which is the only reason writing it there is safe.
    for (const [version, markdown] of Object.entries(REGLEMENT_VERSIONS)) {
      const html = renderMarkdown(markdown);
      expect(html, version).not.toContain('<!--');
      expect(html, version).not.toContain('BROUILLON');
      expect(html, version).not.toContain('NE PAS MODIFIER');
      expect(html.trimStart().startsWith('<p>'), version).toBe(true);
    }
  });

  it('serves each version its own text, never the current one', () => {
    expect(reglementTextFor(LEGACY_REGLEMENT_VERSION)).toBe(
      REGLEMENT_VERSIONS[LEGACY_REGLEMENT_VERSION],
    );
    expect(reglementTextFor(LEGACY_REGLEMENT_VERSION)).not.toBe(
      REGLEMENT_VERSIONS[CURRENT_REGLEMENT_VERSION],
    );
  });

  it('resolves a signature with no stored version to the legacy text', () => {
    // Only reachable for a signature taken before the column existed, which is
    // exactly the text that was in force then. Falling back to the current one
    // would rewrite the document the migration backfill exists to protect.
    expect(reglementTextFor(null)).toBe(
      REGLEMENT_VERSIONS[LEGACY_REGLEMENT_VERSION],
    );
    expect(reglementTextFor(undefined)).toBe(
      REGLEMENT_VERSIONS[LEGACY_REGLEMENT_VERSION],
    );
  });

  it('refuses an unknown version instead of substituting a text', () => {
    // A deleted or renamed version file must fail the PDF job loudly, where it
    // shows on /staff/admin/onboarding-pdfs, rather than quietly render some
    // other wording under a signature.
    expect(() => reglementTextFor('2019-2020')).toThrow(/inconnue/);
    expect(isReglementVersion('2019-2020')).toBe(false);
  });

  describe('which version a signature act commits to', () => {
    const signedAt = new Date('2026-03-01T10:00:00Z');

    it('gives the current text to a talent who has not signed yet', () => {
      expect(applicableReglementVersion(null, null)).toBe(
        CURRENT_REGLEMENT_VERSION,
      );
    });

    it('keeps a guardian on the version their child signed', () => {
      expect(
        applicableReglementVersion(signedAt, LEGACY_REGLEMENT_VERSION),
      ).toBe(LEGACY_REGLEMENT_VERSION);
    });

    it('reads an already-signed talent with no version as legacy', () => {
      expect(applicableReglementVersion(signedAt, null)).toBe(
        LEGACY_REGLEMENT_VERSION,
      );
    });
  });
});
