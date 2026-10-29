import { describe, it, expect } from 'vitest';
import { renderImageRightsDocument } from './onboardingDocumentGenerator';
import {
  CURRENT_DROIT_IMAGE_VERSION,
  LEGACY_DROIT_IMAGE_VERSION,
} from '$lib/content/droit-image';
import type { ImageRightsDecision } from '$lib/domain/imageRights';

/**
 * Filling the droit-à-l'image document.
 *
 * The worker renders it from the dossier row rather than from a job payload, so
 * an admin retry from `/staff/admin/onboarding-pdfs` reaches rows written by
 * every past shape of this feature, including decisions taken before the ledger
 * captured the signer, their qualité or the place of signature. Those fields are
 * therefore optional in practice, and what a missing one renders as is the point
 * of this file: a legal document that says "Mme/Mr" followed by nothing is not
 * one anybody can hand to a family.
 */
const base = {
  decision: 'accepted' as ImageRightsDecision,
  signerName: 'Marie Dupont',
  relationship: 'mère',
  studentName: 'Léa Martin',
  city: 'Lille',
  schoolYear: '2026-2027',
  formattedDate: '15 septembre 2026',
};

const current = (fields: Partial<typeof base> = {}) =>
  renderImageRightsDocument({
    ...base,
    ...fields,
    version: CURRENT_DROIT_IMAGE_VERSION,
  });

const count = (html: string, pattern: RegExp) =>
  html.match(new RegExp(pattern, 'g'))?.length ?? 0;

describe("filling the droit à l'image", () => {
  it('leaves no placeholder unsubstituted', () => {
    const filled = current();
    expect(filled).not.toMatch(/\{\{.+?\}\}/);
    expect(filled).toContain('<strong>Marie Dupont</strong>');
    expect(filled).toContain('<strong>Léa Martin</strong>');
    expect(filled).toContain('<strong>2026-2027</strong>');
    expect(filled).toContain('Fait à Lille, le 15 septembre 2026');
  });

  it('names the signer neutrally when none was recorded', () => {
    // 114 of the 831 decisions in production carry no signer name.
    const filled = current({ signerName: '   ' });
    expect(filled).toContain('<strong>Responsable légal</strong>');
  });

  it('names the qualité neutrally when none was recorded', () => {
    const filled = current({ relationship: '' });
    expect(filled).toContain('<strong>représentant légal</strong>');
  });

  it('drops the place of signature rather than leaving a gap', () => {
    // 813 of those decisions carry no city either, and "Fait à , le …" is the
    // shape that leaks when a caller passes an empty string through.
    const filled = current({ city: '' });
    expect(filled).toContain('Fait le 15 septembre 2026');
    expect(filled).not.toContain('Fait à ,');
  });

  it("renders the wording the decision committed to, not today's", () => {
    // The whole reason the version is pinned: this document is regenerated from
    // DB state on every change of mind, so a re-render must not move a decision
    // onto a text nobody agreed to.
    const legacy = renderImageRightsDocument({
      ...base,
      version: LEGACY_DROIT_IMAGE_VERSION,
    });
    expect(legacy).toContain('stage de seconde');
    expect(legacy).not.toContain("activités d'Epitech Academy");

    // A decision with no stored version predates the column, so it resolves to
    // the same legacy text rather than to the current one.
    expect(renderImageRightsDocument({ ...base, version: null })).toBe(legacy);
  });

  it('leaves no year token behind on a version that names no year', () => {
    // `{{schoolYear}}` only exists in the versions written after the decision
    // became annual. A stray token on an older one would print verbatim.
    const legacy = renderImageRightsDocument({
      ...base,
      version: LEGACY_DROIT_IMAGE_VERSION,
    });
    expect(legacy).not.toMatch(/\{\{.+?\}\}/);
  });

  it('picks the refusal wording for a refusal', () => {
    const refused = current({ decision: 'refused' });
    expect(refused).toContain('refuse');
    expect(refused).not.toMatch(/\{\{.+?\}\}/);
  });
});

/**
 * The names and the place are typed by the talent (their own name, at
 * onboarding) and by the guardian (signer, qualité, city), and this document is
 * the record of a minor's image-rights decision. Whatever they type has to
 * print as the characters it is: never as markup that hides the decision's
 * paragraph, adds one, or moves the template's own clauses around.
 */
describe('what a talent or a guardian types into the droit à l’image', () => {
  it('prints a real name exactly as written', () => {
    const filled = current({
      signerName: 'Marie-Ève N’Diaye',
      studentName: 'Zoé O’Connor',
    });
    expect(filled).toContain('<strong>Marie-Ève N’Diaye</strong>');
    expect(filled).toContain('<strong>Zoé O’Connor</strong>');
  });

  it('cannot hide the refusal behind styles and a paragraph of its own', () => {
    const baseline = current({ decision: 'refused' });
    const filled = current({
      decision: 'refused',
      studentName:
        'Léa** et autorise **Epitech</p><style>p{display:none}.x{display:block}</style><p class="x">autorise',
    });
    expect(filled).not.toContain('<style');
    expect(filled).toContain('&lt;style&gt;');
    expect(count(filled, /<p[\s>]/)).toBe(count(baseline, /<p[\s>]/));
    expect(count(filled, /<strong>/)).toBe(count(baseline, /<strong>/));
  });

  it('cannot add a heading through the place of signature', () => {
    const filled = current({ city: 'Lille**</p><h1>OFFICIEL</h1><p>' });
    expect(filled).not.toContain('<h1>');
    expect(filled).toContain('Fait à Lille**&lt;/p&gt;&lt;h1&gt;OFFICIEL');
  });

  it('cannot pull the rest of the template into a name', () => {
    // A `$'` in a replacement string means "everything after the match".
    const filled = current({ signerName: "Jean $' Dupont" });
    expect(filled).toContain('<strong>Jean $&#39; Dupont</strong>');
    expect(filled).not.toMatch(/\{\{.+?\}\}/);
    expect(count(filled, /Je soussigné/)).toBe(1);
  });

  it('cannot take over a placeholder the template has not reached yet', () => {
    // Filled one token after another, a signer named after a later token would
    // be the one substituted, and the document's own signature line would
    // print as `{{signatureLine}}`.
    const filled = current({ signerName: '{{signatureLine}}' });
    expect(filled).toContain('Mme/Mr <strong>{{signatureLine}}</strong>');
    expect(filled).toMatch(
      /<strong>Fait à Lille, le 15 septembre 2026<\/strong>\s*<\/p>\s*$/,
    );
  });
});
