import { describe, it, expect } from 'vitest';
import { buildEventIcs, escapeText, foldLine } from './ics';

const NOW = new Date('2026-11-16T08:15:00.000Z');

const lines = (ics: string) => ics.split('\r\n');

describe('buildEventIcs', () => {
  // AC4: the talent's own calendar opens the event, as whole days, with no
  // outside service in between.
  it('writes the event as whole days, the end exclusive', () => {
    const ics = buildEventIcs(
      {
        id: 'evt_1',
        name: 'Halloween Camp',
        date: '2026-10-27',
        endDate: '2026-10-30',
        location: 'Epitech Montpellier',
        description: 'Accueil à 10h00',
      },
      NOW,
    );
    expect(lines(ics)).toEqual(
      expect.arrayContaining([
        'UID:event-evt_1@jump',
        'DTSTAMP:20261116T081500Z',
        'DTSTART;VALUE=DATE:20261027',
        'DTEND;VALUE=DATE:20261031',
        'SUMMARY:Halloween Camp',
        'LOCATION:Epitech Montpellier',
        'DESCRIPTION:Accueil à 10h00',
      ]),
    );
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('ends a one-day event on the next day, across a month end', () => {
    const ics = buildEventIcs(
      {
        id: 'evt_2',
        name: 'Coding Club',
        date: '2026-10-31',
        endDate: null,
        location: 'Epitech Lille',
        description: null,
      },
      NOW,
    );
    expect(lines(ics)).toContain('DTEND;VALUE=DATE:20261101');
    expect(ics).not.toContain('DESCRIPTION');
  });
});

describe('escapeText', () => {
  it('escapes what would end or split a property value', () => {
    expect(escapeText('Camp; jour 1, salle\\2\r\nfin')).toBe(
      'Camp\\; jour 1\\, salle\\\\2\\nfin',
    );
  });
});

describe('foldLine', () => {
  // 75 octets a line, counted in UTF-8, never inside an accented letter.
  it('folds past 75 octets without cutting a character', () => {
    const folded = foldLine(`SUMMARY:${'é'.repeat(60)}`);
    const parts = folded.split('\r\n');
    const encoder = new TextEncoder();
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) {
      expect(encoder.encode(part).length).toBeLessThanOrEqual(75);
      expect(part).not.toContain('�');
    }
    expect(parts.map((p, i) => (i === 0 ? p : p.slice(1))).join('')).toBe(
      `SUMMARY:${'é'.repeat(60)}`,
    );
  });
});
