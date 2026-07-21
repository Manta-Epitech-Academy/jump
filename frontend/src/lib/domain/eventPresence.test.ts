import { describe, it, expect } from 'vitest';
import {
  effectiveStatus,
  presenceDays,
  presenceSlots,
  stageCountdown,
  computeSlotStats,
  computeAttendanceRate,
  defaultActiveSlotKey,
} from './eventPresence';

describe('eventPresence Domain Logic & Projections', () => {
  describe('effectiveStatus', () => {
    it('returns stored status as-is if not pending', () => {
      expect(effectiveStatus('present', true)).toBe('present');
      expect(effectiveStatus('late', true)).toBe('late');
      expect(effectiveStatus('excused', true)).toBe('excused');
      expect(effectiveStatus('absent', true)).toBe('absent');
      expect(effectiveStatus('present', false)).toBe('present');
    });

    it('returns pending for open slots', () => {
      expect(effectiveStatus('pending', false)).toBe('pending');
      expect(
        effectiveStatus('pending', false, {
          sfMemberStatus: 'MEET',
          isSingleDayEvent: true,
        }),
      ).toBe('pending');
    });

    it('projects absent for closed slots when no SF status or multi-day event', () => {
      expect(effectiveStatus('pending', true)).toBe('absent');
      expect(
        effectiveStatus('pending', true, {
          sfMemberStatus: 'READY',
          isSingleDayEvent: true,
        }),
      ).toBe('absent');
      expect(
        effectiveStatus('pending', true, {
          sfMemberStatus: 'MEET',
          isSingleDayEvent: false, // multi-day stage
        }),
      ).toBe('absent');
    });

    it('falls back to present for closed slots on single-day event when SF status is MEET', () => {
      expect(
        effectiveStatus('pending', true, {
          sfMemberStatus: 'MEET',
          isSingleDayEvent: true,
        }),
      ).toBe('present');

      expect(
        effectiveStatus('pending', true, {
          sfMemberStatus: 'meet',
          isSingleDayEvent: true,
        }),
      ).toBe('present');
    });
  });

  describe('presenceDays & presenceSlots', () => {
    it('generates 1 day for single-day event (no endDate)', () => {
      const event = {
        date: new Date('2026-06-15T22:00:00.000Z'),
        endDate: null,
      };
      const days = presenceDays(event, 'Europe/Paris');
      expect(days).toEqual(['2026-06-16']);

      const slots = presenceSlots(event, 'Europe/Paris');
      expect(slots).toHaveLength(2);
      expect(slots[0]).toEqual({
        day: '2026-06-16',
        slot: 'morning',
        key: '2026-06-16|morning',
      });
      expect(slots[1]).toEqual({
        day: '2026-06-16',
        slot: 'afternoon',
        key: '2026-06-16|afternoon',
      });
    });

    it('filters out weekends for multi-day stage events', () => {
      // Monday June 15 to Friday June 26 (2 weeks = 10 working days)
      const stageEvent = {
        date: new Date('2026-06-14T22:00:00.000Z'), // Monday June 15 local
        endDate: new Date('2026-06-26T20:00:00.000Z'), // Friday June 26 local
      };
      const days = presenceDays(stageEvent, 'Europe/Paris');
      expect(days).toHaveLength(10); // 10 weekdays
      expect(days).not.toContain('2026-06-20'); // Saturday
      expect(days).not.toContain('2026-06-21'); // Sunday
    });

    it('falls back to all days when workdaysOnly returns empty array for weekend events', () => {
      // Saturday September 19, 2026
      const weekendEvent = {
        date: new Date('2026-09-18T22:00:00.000Z'),
        endDate: new Date('2026-09-19T21:59:00.000Z'),
      };
      const days = presenceDays(weekendEvent, 'Europe/Paris');
      expect(days).toEqual(['2026-09-19']);

      const slots = presenceSlots(weekendEvent, 'Europe/Paris');
      expect(slots).toHaveLength(2);
    });
  });

  describe('stageCountdown', () => {
    it('computes correct dayN and totalDays for stage', () => {
      const stageEvent = {
        date: new Date('2026-06-14T22:00:00.000Z'), // June 15
        endDate: new Date('2026-06-26T20:00:00.000Z'), // June 26
      };
      // Mid-stage Wednesday June 17
      const now = new Date('2026-06-17T10:00:00.000Z');
      const { dayN, totalDays } = stageCountdown(
        stageEvent,
        'Europe/Paris',
        now,
      );
      expect(totalDays).toBe(10);
      expect(dayN).toBe(3); // 3rd working day
    });
  });

  describe('computeSlotStats & computeAttendanceRate', () => {
    it('accurately aggregates slot statuses and percentages', () => {
      const statuses = ['present', 'present', 'late', 'absent', 'pending'];
      const stats = computeSlotStats(statuses as any);

      expect(stats.present).toBe(2);
      expect(stats.late).toBe(1);
      expect(stats.absent).toBe(1);
      expect(stats.pending).toBe(1);
      expect(stats.total).toBe(5);

      // Present or late = 3 out of 5 = 60%
      expect(stats.presentPct).toBe(60);
      // Handled (anything except pending) = 4 out of 5 = 80%
      expect(stats.handledPct).toBe(80);
    });

    it('calculates overall attendance rate array correctly', () => {
      const effective = ['present', 'late', 'absent', 'absent'] as any;
      expect(computeAttendanceRate(effective)).toBe(50); // 2/4 = 50%
    });
  });

  describe('defaultActiveSlotKey', () => {
    it('lands on morning when hour < 13 for today', () => {
      const slots = [
        { day: '2026-06-16', slot: 'morning', key: '2026-06-16|morning' },
        { day: '2026-06-16', slot: 'afternoon', key: '2026-06-16|afternoon' },
      ];
      expect(defaultActiveSlotKey(slots as any, '2026-06-16', 10)).toBe(
        '2026-06-16|morning',
      );
      expect(defaultActiveSlotKey(slots as any, '2026-06-16', 14)).toBe(
        '2026-06-16|afternoon',
      );
    });

    it('lands on first upcoming slot if today is before event', () => {
      const slots = [
        { day: '2026-09-19', slot: 'morning', key: '2026-09-19|morning' },
        { day: '2026-09-19', slot: 'afternoon', key: '2026-09-19|afternoon' },
      ];
      expect(defaultActiveSlotKey(slots as any, '2026-07-22', 10)).toBe(
        '2026-09-19|morning',
      );
    });
  });
});
