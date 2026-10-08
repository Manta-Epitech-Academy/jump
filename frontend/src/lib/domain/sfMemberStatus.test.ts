import { describe, it, expect } from 'vitest';
import {
  classifySfStatus,
  isShownInDevSpace,
  normalizeSfStatus,
} from './sfMemberStatus';

/** The vocabulary the migration ships, and a stage that shows two of it. */
const known = new Set(['READY', 'MET', 'CONNECTED', 'DESISTED']);
const stage = new Set(['READY', 'MET']);
const codingClub = new Set(['READY', 'MET', 'CONNECTED']);

describe('sfMemberStatus domain logic', () => {
  describe('isShownInDevSpace', () => {
    it('shows a word the event shows, whatever its case', () => {
      expect(isShownInDevSpace('MET', stage)).toBe(true);
      expect(isShownInDevSpace('ready  ', stage)).toBe(true);
    });

    it('follows the event, not a platform-wide rule', () => {
      expect(isShownInDevSpace('CONNECTED', stage)).toBe(false);
      expect(isShownInDevSpace('CONNECTED', codingClub)).toBe(true);
    });

    // A row synced before the column existed: no event can name the absence of
    // a word, so it is shown everywhere, even on an event that shows nothing.
    it('always shows a row without a status', () => {
      expect(isShownInDevSpace(null, new Set())).toBe(true);
      expect(isShownInDevSpace('  ', new Set())).toBe(true);
    });
  });

  describe('classifySfStatus', () => {
    it('tells a word the event shows from one it masks', () => {
      expect(classifySfStatus('Met', { known, shown: stage })).toBe('shown');
      expect(classifySfStatus('CONNECTED', { known, shown: stage })).toBe(
        'hidden',
      );
      expect(classifySfStatus('CONNECTED', { known, shown: codingClub })).toBe(
        'shown',
      );
    });

    // Regression for #368: the seminar's `MEET` is not a status Salesforce
    // sends, and a word missing from the catalogue must read as unknown rather
    // than as one somebody chose to hide.
    it('keeps a word the catalogue lacks apart from a hidden one', () => {
      expect(classifySfStatus('MEET', { known, shown: stage })).toBe(
        'unrecognised',
      );
    });

    it('treats an empty status as missing', () => {
      expect(classifySfStatus(null, { known, shown: stage })).toBe('missing');
      expect(classifySfStatus('  ', { known, shown: stage })).toBe('missing');
    });
  });

  describe('normalizeSfStatus', () => {
    it('returns null for null, undefined, or empty string', () => {
      expect(normalizeSfStatus(null)).toBe(null);
      expect(normalizeSfStatus(undefined)).toBe(null);
      expect(normalizeSfStatus('')).toBe(null);
    });

    it('trims and uppercases valid status strings', () => {
      expect(normalizeSfStatus('ready')).toBe('READY');
      expect(normalizeSfStatus('met  ')).toBe('MET');
      expect(normalizeSfStatus('Connected')).toBe('CONNECTED');
    });
  });
});
