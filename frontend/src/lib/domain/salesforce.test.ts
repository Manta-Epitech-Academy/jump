import { describe, it, expect } from 'vitest';
import { salesforceId18, salesforceUrl } from './salesforce';

// A talent is keyed on a Contact once it has one, on a Lead before: a link
// that assumed a Lead opened nothing for every converted talent.
describe('salesforceUrl', () => {
  it('opens the record the id names, read off its key prefix', () => {
    expect(salesforceUrl('003Sm00000JifULMAZ')).toBe(
      'https://epitech.lightning.force.com/lightning/r/Contact/003Sm00000JifULMAZ/view',
    );
    expect(salesforceUrl('00QSm00000niAlrMAE')).toBe(
      'https://epitech.lightning.force.com/lightning/r/Lead/00QSm00000niAlrMAE/view',
    );
    expect(salesforceUrl('701Sm00000wEV4AIAW')).toBe(
      'https://epitech.lightning.force.com/lightning/r/Campaign/701Sm00000wEV4AIAW/view',
    );
  });

  it('still opens an id of another object, through the bare-id address', () => {
    expect(salesforceUrl('001Sm00000AbCdEfGH')).toBe(
      'https://epitech.lightning.force.com/001Sm00000AbCdEfGH',
    );
  });
});

// Salesforce shows the 15-character id in its URLs and reports, which is what
// an admin copies, while the API, and so Jump, holds the 18-character one.
describe('salesforceId18', () => {
  // Ids Salesforce issued, checksum and all.
  it.each(['00QSm00000niAlrMAE', '701Sm00000wEV4AIAW'])(
    'restores %s from the 15 characters Salesforce shows',
    (id18) => {
      expect(salesforceId18(id18.slice(0, 15))).toBe(id18);
    },
  );

  it('returns an 18-character id as it is', () => {
    expect(salesforceId18('003Sm00000JifULMAZ')).toBe('003Sm00000JifULMAZ');
  });
});
