import { describe, it, expect } from 'vitest';
import {
  SF_VISIBLE_STATUSES,
  SF_HIDDEN_STATUSES,
  SF_MEMBER_STATUSES,
  isVisibleInDevSpace,
  pastEventPresence,
  normalizeSfStatus,
  presenceLabel,
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
  });

  describe('isVisibleInDevSpace', () => {
    it('returns true for null (legacy participations)', () => {
      expect(isVisibleInDevSpace(null)).toBe(true);
    });

    it('returns true for READY and MEET (case-insensitive)', () => {
      expect(isVisibleInDevSpace('READY')).toBe(true);
      expect(isVisibleInDevSpace('ready')).toBe(true);
      expect(isVisibleInDevSpace('Ready  ')).toBe(true);
      expect(isVisibleInDevSpace('MEET')).toBe(true);
      expect(isVisibleInDevSpace('meet')).toBe(true);
    });

    it('returns false for CONNECTED, DESISTED, and unknown statuses', () => {
      expect(isVisibleInDevSpace('CONNECTED')).toBe(false);
      expect(isVisibleInDevSpace('connected')).toBe(false);
      expect(isVisibleInDevSpace('DESISTED')).toBe(false);
      expect(isVisibleInDevSpace('desisted')).toBe(false);
      expect(isVisibleInDevSpace('NO_SHOW')).toBe(false);
    });
  });

  describe('pastEventPresence', () => {
    it('returns null for null status', () => {
      expect(pastEventPresence(null)).toBe(null);
    });

    it('maps MEET to present', () => {
      expect(pastEventPresence('MEET')).toBe('present');
      expect(pastEventPresence('meet')).toBe('present');
      expect(pastEventPresence('Meet  ')).toBe('present');
    });

    it('maps READY to absent', () => {
      expect(pastEventPresence('READY')).toBe('absent');
      expect(pastEventPresence('ready')).toBe('absent');
    });

    it('returns null for other statuses', () => {
      expect(pastEventPresence('CONNECTED')).toBe(null);
      expect(pastEventPresence('DESISTED')).toBe(null);
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
      expect(normalizeSfStatus('meet  ')).toBe('MEET');
      expect(normalizeSfStatus('Connected')).toBe('CONNECTED');
    });
  });

  describe('presenceLabel', () => {
    it('returns French labels', () => {
      expect(presenceLabel('present')).toBe('Présent');
      expect(presenceLabel('absent')).toBe('Absent');
    });
  });
});
