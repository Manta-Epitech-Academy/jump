import { describe, it, expect } from 'vitest';
import { rulesSchema, rulesSchemaWithoutCharter } from './onboarding';

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
