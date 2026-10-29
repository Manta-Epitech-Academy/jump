import { describe, it, expect } from 'vitest';
import {
  identitySchema,
  parentsSchema,
  rulesSchema,
  rulesSchemaWithoutCharter,
} from './onboarding';

/**
 * The last step of the wizard collects two consents, and only one of them
 * belongs to the yearly dossier: the règlement intérieur. The charte
 * informatique is a once-per-account consent whose date is never restamped,
 * which is what the second schema below exists for. The disabled submit button
 * is a convenience; the schema is the enforcement, and a POST can skip the
 * button entirely.
 *
 * So what is under test is narrow: every consent is refused when it is absent
 * and when it is explicitly false, because a checkbox that is left alone submits
 * nothing at all while a tampered one submits `"false"`, and only the schema
 * stands between either and a signed dossier.
 */
const complete = {
  city: 'Paris',
  acceptedCharter: 'true',
  acceptedRules: 'true',
};

describe('rulesSchema', () => {
  const consents = ['acceptedCharter', 'acceptedRules'] as const;

  it('accepts a complete signature', () => {
    expect(rulesSchema.safeParse(complete).success).toBe(true);
  });

  it.each(consents)('refuses a signature with no %s', (field) => {
    const { [field]: _omitted, ...partial } = complete;
    expect(rulesSchema.safeParse(partial).success).toBe(false);
  });

  it.each(consents)('refuses %s set explicitly to false', (field) => {
    const tampered = { ...complete, [field]: 'false' };
    expect(rulesSchema.safeParse(tampered).success).toBe(false);
  });

  it('requires the city, which places and dates the signature', () => {
    // It lands on the dossier as `rulesSignedCity` and is printed in the PDF's
    // signature block, so an empty one produces "Fait à , le …".
    expect(rulesSchema.safeParse({ ...complete, city: '   ' }).success).toBe(
      false,
    );
  });

  it('singles out no clause of the document it signs', () => {
    // A laptop box lived here for a release, required of every signer. The
    // validated 2026-2027 règlement files that clause under "Dispositions
    // propres au stage de seconde", a scope this step cannot know: it is walked
    // once per school year and holds no enrolment to branch on. Adding any
    // per-clause consent back turns this red, which is the point of asserting
    // the whole shape rather than the absence of one field.
    expect(Object.keys(rulesSchema.shape)).toEqual([
      'city',
      'acceptedCharter',
      'acceptedRules',
    ]);
  });
});

describe('rulesSchemaWithoutCharter', () => {
  const { acceptedCharter: _charter, ...withoutCharter } = complete;

  it('signs without the charte being asked again', () => {
    // The charte is a once-per-account consent and its date is never restamped,
    // so for a talent who already gave it the box is not rendered and the field
    // is legitimately absent.
    expect(rulesSchemaWithoutCharter.safeParse(withoutCharter).success).toBe(
      true,
    );
  });

  it('stays bound by the règlement', () => {
    // Dropping the charte must not relax what a yearly dossier signs.
    const { acceptedRules: _omitted, ...partial } = withoutCharter;
    expect(rulesSchemaWithoutCharter.safeParse(partial).success).toBe(false);
  });
});

describe('identitySchema names', () => {
  const identity = {
    civilite: 'femme',
    nom: 'Dupont',
    prenom: 'Léa',
    phone: '+33612345678',
  };

  it.each(['N’Diaye', "N'Golo", 'Marie-Ève', 'Léa (Lily)', 'Ó Súilleabháin'])(
    'accepts the real name %s as typed',
    (name) => {
      // Mails that quote a name escape it themselves, so the form has no
      // reason to refuse a character a real name carries.
      const parsed = identitySchema.safeParse({ ...identity, prenom: name });
      expect(parsed.success && parsed.data.prenom).toBe(name);
    },
  );

  it('counts the two characters once the padding is trimmed', () => {
    expect(
      identitySchema.safeParse({ ...identity, prenom: '  a ' }).success,
    ).toBe(false);
  });
});

// Parent 2 is optional as a whole, and its names are stored as the form
// parses them: trimmed and bounded like every other name, once filled in.
describe('parentsSchema names of parent 2', () => {
  const parents = {
    studentEmail: 'lea@example.test',
    parentType: 'mere',
    parentCivilite: 'femme',
    parentNom: 'Dupont',
    parentPrenom: 'Marie',
    parentEmail: 'marie@example.test',
    parentPhone: '+33612345678',
  };
  const parent2 = {
    parent2Type: 'pere',
    parent2Civilite: 'homme',
    parent2Nom: '  Martin ',
    parent2Prenom: ' Paul',
    parent2Email: 'paul@example.test',
  };

  it('trims them', () => {
    const parsed = parentsSchema.safeParse({ ...parents, ...parent2 });
    expect(parsed.success && parsed.data).toMatchObject({
      parent2Nom: 'Martin',
      parent2Prenom: 'Paul',
    });
  });

  it('caps them like the names of parent 1', () => {
    const parsed = parentsSchema.safeParse({
      ...parents,
      ...parent2,
      parent2Nom: 'x'.repeat(101),
    });
    expect(parsed.success).toBe(false);
  });

  it('still leaves parent 2 out when nothing but blanks was typed', () => {
    expect(
      parentsSchema.safeParse({
        ...parents,
        parent2Nom: '   ',
        parent2Prenom: '',
      }).success,
    ).toBe(true);
  });
});
