import { describe, it, expect } from 'vitest';
import { createVersionedDocument } from './versionedDocument';

/**
 * The four rules every versioned legal document obeys, tested once here rather
 * than re-tested per document. What they protect is narrow and legal: a
 * signature never moves onto a text its signer did not read.
 *
 * Each document's own test file covers what is specific to it (its files, its
 * markers, its placeholders); this covers the resolution rules they share.
 */
describe('versioned document', () => {
  const catalogue = createVersionedDocument({
    versions: { '2024-2025': 'ancien', '2025-2026': 'courant' },
    current: '2025-2026',
    legacy: '2024-2025',
    label: 'test',
  });

  it('serves each version its own text, never the current one', () => {
    expect(catalogue.contentFor('2024-2025')).toBe('ancien');
    expect(catalogue.contentFor('2025-2026')).toBe('courant');
  });

  it('resolves a signature with no stored version to the legacy text', () => {
    // Only reachable for a signature taken before the version column existed,
    // which is exactly the text that was in force then. Falling back to the
    // current one would rewrite the document the migration backfill protects.
    expect(catalogue.contentFor(null)).toBe('ancien');
    expect(catalogue.contentFor(undefined)).toBe('ancien');
  });

  it('refuses an unknown version instead of substituting a text', () => {
    // A deleted or renamed version file must fail the PDF job loudly, where it
    // shows on /staff/admin/onboarding-pdfs, rather than quietly render some
    // other wording under a signature.
    expect(() => catalogue.contentFor('2019-2020')).toThrow(/inconnue/);
    expect(catalogue.isVersion('2019-2020')).toBe(false);
    expect(catalogue.isVersion('2024-2025')).toBe(true);
  });

  it('names the document in the refusal, for whoever reads the failed job', () => {
    // The message lands in `OnboardingPdfJob.errorMessage` and is read off the
    // admin page by a human who needs to know WHICH document lost its file.
    expect(() => catalogue.contentFor('2019-2020')).toThrow(/test/);
  });

  it('does not let a lookup reach an inherited property', () => {
    // `contentFor('toString')` resolving to Object.prototype.toString would hand
    // a function to a renderer instead of throwing.
    expect(() => catalogue.contentFor('toString')).toThrow(/inconnue/);
    expect(catalogue.isVersion('constructor')).toBe(false);
  });
});
