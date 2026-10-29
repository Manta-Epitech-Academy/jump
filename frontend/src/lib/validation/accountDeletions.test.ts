import { describe, expect, it } from 'vitest';
import { readmitContactSchema } from './accountDeletions';

// An admin copies the 15-character id Salesforce shows, while the bar holds
// the 18-character one the API sends: without the conversion every
// readmission by the copied id answers that nothing is barred.
describe('readmitContactSchema', () => {
  it('looks a copied 15-character id up by its 18-character spelling', () => {
    const parsed = readmitContactSchema.parse({
      externalId: ' 00QSm00000niAlr ',
    });
    expect(parsed.externalId).toBe('00QSm00000niAlrMAE');
  });

  it('refuses what is no Salesforce id', () => {
    expect(
      readmitContactSchema.safeParse({ externalId: '00QSm00000niAl' }).success,
    ).toBe(false);
  });
});
