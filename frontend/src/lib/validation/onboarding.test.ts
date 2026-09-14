import { describe, it, expect } from 'vitest';
import { rulesSchema, rulesSchemaWithoutCharter } from './onboarding';

/**
 * The last step of the wizard is where a minor commits to the three things a
 * yearly dossier is made of: the règlement intérieur, the charte informatique,
 * and the school-wide undertaking to come with their own laptop. The disabled
 * submit button is a convenience; the schema is the enforcement, and a POST can
 * skip the first entirely.
 *
 * So what is under test is narrow: every consent is refused when it is absent
 * and when it is explicitly false, because a checkbox that is left alone submits
 * nothing at all while a tampered one submits `"false"`, and only the schema
 * stands between either and a signed dossier.
 */
describe('étape 7, le règlement et ses consentements', () => {
  const complete = {
    city: 'Paris',
    acceptedCharter: 'true',
    acceptedRules: 'true',
    acceptedEquipment: 'true',
  };

  const consents = [
    'acceptedCharter',
    'acceptedRules',
    'acceptedEquipment',
  ] as const;

  it('accepte la signature complète', () => {
    expect(rulesSchema.safeParse(complete).success).toBe(true);
  });

  it.each(consents)('refuse une signature sans %s', (field) => {
    const { [field]: _omitted, ...partial } = complete;
    expect(rulesSchema.safeParse(partial).success).toBe(false);
  });

  it.each(consents)('refuse %s explicitement à false', (field) => {
    const tampered = { ...complete, [field]: 'false' };
    expect(rulesSchema.safeParse(tampered).success).toBe(false);
  });

  it('exige la ville, qui date et situe la signature', () => {
    // It lands on the dossier as `rulesSignedCity` and is printed in the PDF's
    // signature block, so an empty one produces "Fait à , le …".
    expect(rulesSchema.safeParse({ ...complete, city: '   ' }).success).toBe(
      false,
    );
  });

  describe('un talent qui a déjà donné la charte une autre année', () => {
    const { acceptedCharter: _charter, ...withoutCharter } = complete;

    it('signe sans que la charte lui soit redemandée', () => {
      // The charte is a once-per-account consent and its date is never
      // restamped, so the box is not rendered and the field is legitimately
      // absent.
      expect(rulesSchemaWithoutCharter.safeParse(withoutCharter).success).toBe(
        true,
      );
    });

    it.each(['acceptedRules', 'acceptedEquipment'] as const)(
      'reste tenu par %s',
      (field) => {
        // Dropping the charte must not relax what a yearly dossier signs.
        const { [field]: _omitted, ...partial } = withoutCharter;
        expect(rulesSchemaWithoutCharter.safeParse(partial).success).toBe(
          false,
        );
      },
    );
  });
});
