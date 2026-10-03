import { describe, it, expect } from 'vitest';
import {
  SF_VISIBLE_STATUSES,
  SF_HIDDEN_STATUSES,
  SF_MEMBER_STATUSES,
  SF_STATUS_ATTENDED,
  classifySfStatus,
  isVisibleInDevSpace,
  normalizeSfStatus,
} from './sfMemberStatus';

describe('sfMemberStatus domain logic', () => {
  describe('the status catalogue', () => {
    it('is the visible and the hidden halves, with nothing in common', () => {
      expect(SF_MEMBER_STATUSES).toEqual([
        ...SF_VISIBLE_STATUSES,
        ...SF_HIDDEN_STATUSES,
      ]);
      const overlap = SF_VISIBLE_STATUSES.filter((status) =>
        (SF_HIDDEN_STATUSES as readonly string[]).includes(status),
      );
      expect(overlap).toEqual([]);
    });

    it('agrees with isVisibleInDevSpace on every value it declares', () => {
      for (const status of SF_VISIBLE_STATUSES) {
        expect(isVisibleInDevSpace(status)).toBe(true);
      }
      for (const status of SF_HIDDEN_STATUSES) {
        expect(isVisibleInDevSpace(status)).toBe(false);
      }
    });

    it('stays open: a word it does not declare is still stored as it arrives', () => {
      expect(normalizeSfStatus(' rescheduled ')).toBe('RESCHEDULED');
      expect(isVisibleInDevSpace('RESCHEDULED')).toBe(false);
    });

    // Regression for #368: the attended word is the one Salesforce sends. The
    // seminar's `MEET` is not a status at all, and must read as unknown.
    it('shows MET, and reads MEET as a word it does not know', () => {
      expect(SF_STATUS_ATTENDED).toBe('MET');
      expect(classifySfStatus('Met')).toBe('shown');
      expect(classifySfStatus('MEET')).toBe('unrecognised');
    });
  });

  describe('classifySfStatus', () => {
    it('keeps an unknown word apart from a deliberately hidden one', () => {
      expect(classifySfStatus('CONNECTED')).toBe('hidden');
      expect(classifySfStatus('NO_SHOW')).toBe('unrecognised');
    });

    it('calls a blank status missing, like a null one', () => {
      expect(classifySfStatus(null)).toBe('missing');
      expect(classifySfStatus('  ')).toBe('missing');
    });
  });

  describe('isVisibleInDevSpace', () => {
    it('returns true for null (legacy participations)', () => {
      expect(isVisibleInDevSpace(null)).toBe(true);
    });

    it('returns true for READY and MET (case-insensitive)', () => {
      expect(isVisibleInDevSpace('READY')).toBe(true);
      expect(isVisibleInDevSpace('ready')).toBe(true);
      expect(isVisibleInDevSpace('Ready  ')).toBe(true);
      expect(isVisibleInDevSpace('MET')).toBe(true);
      expect(isVisibleInDevSpace('met')).toBe(true);
    });

    it('returns false for CONNECTED, DESISTED, and unknown statuses', () => {
      expect(isVisibleInDevSpace('CONNECTED')).toBe(false);
      expect(isVisibleInDevSpace('connected')).toBe(false);
      expect(isVisibleInDevSpace('DESISTED')).toBe(false);
      expect(isVisibleInDevSpace('desisted')).toBe(false);
      expect(isVisibleInDevSpace('NO_SHOW')).toBe(false);
    });
  });

  describe('normalizeSfStatus', () => {
    it('returns null for null, undefined, or empty string', () => {
      expect(normalizeSfStatus(null)).toBe(null);
      expect(normalizeSfStatus(undefined)).toBe(null);
      expect(normalizeSfStatus('')).toBe(null);
      expect(normalizeSfStatus('')).toBe(null);
    });

    it('trims and uppercases valid status strings', () => {
      expect(normalizeSfStatus('ready')).toBe('READY');
      expect(normalizeSfStatus('met  ')).toBe('MET');
      expect(normalizeSfStatus('Connected')).toBe('CONNECTED');
    });
  });
});
