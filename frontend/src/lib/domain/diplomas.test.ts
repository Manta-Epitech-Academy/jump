/**
 * The placeholder contract for a certificate design.
 *
 * A design is authored at runtime and printed on paper handed to a student, so
 * the failure modes here are all silent-in-production: a token that vanishes, a
 * typo that prints as-is, a value that carries markup into the page.
 */
import { describe, it, expect } from 'vitest';
import {
  CERTIFICATE_TOKENS,
  interpolateCertificate,
  unknownCertificateTokens,
} from './diplomas';

describe('certificate placeholders', () => {
  it('fills in the tokens it is given', () => {
    expect(
      interpolateCertificate('Fait à {ville}, le {dateDuJour}', {
        ville: 'Lille',
        dateDuJour: '24 août 2026',
      }),
    ).toBe('Fait à Lille, le 24 août 2026');
  });

  it('leaves a known token alone when this call carries no value for it', () => {
    // The regression that shipped once in development: substituting on "is a
    // known token" blanked {prenom} during an event-level pass, so the name was
    // erased before anything got to supply it, and the certificate printed with a
    // gap where the student should be.
    const out = interpolateCertificate('{prenom} {nom} - {ville}', {
      ville: 'Lille',
    });
    expect(out).toBe('{prenom} {nom} - Lille');
  });

  it('treats an explicit undefined as "nothing to print", not as absent', () => {
    // A signatory-less event asks for {signatures} with no blocks to render.
    expect(
      interpolateCertificate('a{signatures}b', { signatures: undefined }),
    ).toBe('ab');
  });

  it('leaves an unknown token as written rather than swallowing it', () => {
    // It prints literally, which is glaring and diagnosable. The write operation
    // is what stops it ever reaching a document, using the reporter below.
    expect(interpolateCertificate('{dateDbut}', { dateDebut: 'x' })).toBe(
      '{dateDbut}',
    );
  });

  it('reports a misspelled token so the write can refuse it', () => {
    expect(unknownCertificateTokens('{dateDbut} et {vile}')).toEqual([
      'dateDbut',
      'vile',
    ]);
  });

  it('reports each unknown token once, and says nothing about a valid design', () => {
    expect(unknownCertificateTokens('{oops} {oops}')).toEqual(['oops']);
    expect(
      unknownCertificateTokens(
        Object.keys(CERTIFICATE_TOKENS)
          .map((t) => `{${t}}`)
          .join(' '),
      ),
    ).toEqual([]);
  });

  it('documents every token it accepts', () => {
    // The authoring contract is served to whoever writes a design through
    // config_diploma_templates, so a token with no definition is unusable. No
    // length threshold: "Nom du jeune." says everything there is to say.
    for (const [token, definition] of Object.entries(CERTIFICATE_TOKENS)) {
      expect(definition.trim(), token).not.toBe('');
    }
  });
});
