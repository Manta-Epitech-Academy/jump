import { describe, it, expect } from 'vitest';
import { fillImageRightsDocument } from './onboardingDocumentGenerator';
import {
  CURRENT_DROIT_IMAGE_VERSION,
  LEGACY_DROIT_IMAGE_VERSION,
} from '$lib/content/droit-image';

/**
 * Filling the droit-à-l'image document.
 *
 * The worker renders it from the dossier row rather than from a job payload, so
 * an admin retry from `/staff/admin/onboarding-pdfs` reaches rows written by
 * every past shape of this feature, including decisions taken before the ledger
 * captured the signer, their qualité or the place of signature. Those fields are
 * therefore optional in practice, and what a missing one renders as is the point
 * of this file: a legal document that says "Mme/Mr ****" is not one anybody can
 * hand to a family.
 */
const base = {
  decision: 'accepted' as const,
  signerName: 'Marie Dupont',
  relationship: 'mère',
  studentName: 'Léa Martin',
  city: 'Lille',
  schoolYear: '2026-2027',
  formattedDate: '15 septembre 2026',
};

describe("filling the droit à l'image", () => {
  it('leaves no placeholder unsubstituted', () => {
    const filled = fillImageRightsDocument({
      ...base,
      version: CURRENT_DROIT_IMAGE_VERSION,
    });
    expect(filled).not.toMatch(/\{\{.+?\}\}/);
    expect(filled).toContain('Marie Dupont');
    expect(filled).toContain('Léa Martin');
    expect(filled).toContain('2026-2027');
    expect(filled).toContain('Fait à Lille, le 15 septembre 2026');
  });

  it('names the signer neutrally when none was recorded', () => {
    // 114 of the 831 decisions in production carry no signer name. Bolding an
    // empty string emits `****`, which markdown renders as four literal
    // asterisks in the middle of "Je soussigné(e), Mme/Mr ****".
    const filled = fillImageRightsDocument({
      ...base,
      version: CURRENT_DROIT_IMAGE_VERSION,
      signerName: '   ',
    });
    expect(filled).not.toContain('****');
    expect(filled).toContain('Responsable légal');
  });

  it('names the qualité neutrally when none was recorded', () => {
    const filled = fillImageRightsDocument({
      ...base,
      version: CURRENT_DROIT_IMAGE_VERSION,
      relationship: '',
    });
    expect(filled).not.toContain('****');
    expect(filled).toContain('représentant légal');
  });

  it('drops the place of signature rather than leaving a gap', () => {
    // 813 of those decisions carry no city either, and "Fait à , le …" is the
    // shape that leaks when a caller passes an empty string through.
    const filled = fillImageRightsDocument({
      ...base,
      version: CURRENT_DROIT_IMAGE_VERSION,
      city: '',
    });
    expect(filled).toContain('Fait le 15 septembre 2026');
    expect(filled).not.toContain('Fait à ,');
  });

  it("renders the wording the decision committed to, not today's", () => {
    // The whole reason the version is pinned: this document is regenerated from
    // DB state on every change of mind, so a re-render must not move a decision
    // onto a text nobody agreed to.
    const legacy = fillImageRightsDocument({
      ...base,
      version: LEGACY_DROIT_IMAGE_VERSION,
    });
    expect(legacy).toContain('stage de seconde');
    expect(legacy).not.toContain("activités d'Epitech Academy");

    // A decision with no stored version predates the column, so it resolves to
    // the same legacy text rather than to the current one.
    expect(fillImageRightsDocument({ ...base, version: null })).toBe(legacy);
  });

  it('leaves no year token behind on a version that names no year', () => {
    // `{{schoolYear}}` only exists in the versions written after the decision
    // became annual. A stray token on an older one would print verbatim.
    const legacy = fillImageRightsDocument({
      ...base,
      version: LEGACY_DROIT_IMAGE_VERSION,
    });
    expect(legacy).not.toMatch(/\{\{.+?\}\}/);
  });

  it('picks the refusal wording for a refusal', () => {
    const refused = fillImageRightsDocument({
      ...base,
      version: CURRENT_DROIT_IMAGE_VERSION,
      decision: 'refused',
    });
    expect(refused).toContain('refuse');
    expect(refused).not.toMatch(/\{\{.+?\}\}/);
  });
});
