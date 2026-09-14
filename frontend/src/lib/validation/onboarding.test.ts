import { describe, it, expect } from 'vitest';
import { rulesSchema, rulesSchemaWithoutCharter } from './onboarding';

/**
 * The last step of the wizard collects three consents, and only two of them
 * belong to the yearly dossier: the règlement intérieur and the school-wide
 * undertaking to come with one's own laptop. The charte informatique is a
 * once-per-account consent whose date is never restamped, which is what the
 * second schema below exists for. The disabled submit button is a convenience;
 * the schema is the enforcement, and a POST can skip the button entirely.
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
  acceptedEquipment: 'true',
};

describe('rulesSchema', () => {
  const consents = [
    'acceptedCharter',
    'acceptedRules',
    'acceptedEquipment',
  ] as const;

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

  it.each(['acceptedRules', 'acceptedEquipment'] as const)(
    'stays bound by %s',
    (field) => {
      // Dropping the charte must not relax what a yearly dossier signs.
      const { [field]: _omitted, ...partial } = withoutCharter;
      expect(rulesSchemaWithoutCharter.safeParse(partial).success).toBe(false);
    },
  );
});
