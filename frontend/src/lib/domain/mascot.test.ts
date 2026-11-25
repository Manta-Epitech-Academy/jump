import { describe, it, expect } from 'vitest';
import { Mascot_Glasses, Mascot_Hair, Mascot_Scarf } from '@prisma/client';
import {
  MASCOT_AWAY_DAYS,
  MASCOT_GLASSES,
  MASCOT_HAIRS,
  MASCOT_SCARVES,
  arrivalCues,
  fillLine,
  greetingFor,
  streakToday,
  mascotLookOf,
  unknownMascotTokens,
} from './mascot';

describe('the accessory catalogues', () => {
  it('offer exactly the values the database stores', () => {
    expect(Object.keys(MASCOT_GLASSES)).toEqual(Object.values(Mascot_Glasses));
    expect(Object.keys(MASCOT_SCARVES)).toEqual(Object.values(Mascot_Scarf));
    expect(Object.keys(MASCOT_HAIRS)).toEqual(Object.values(Mascot_Hair));
  });
});

describe('streakToday', () => {
  const TODAY = '2026-11-22';
  // The page may read the talent row before today's visit is written.
  it('counts today into a run that ended yesterday', () => {
    expect(
      streakToday({ lastDay: '2026-11-21', previousDay: null }, 6, TODAY),
    ).toBe(7);
  });

  it('reads the run as written once today is counted', () => {
    expect(
      streakToday({ lastDay: TODAY, previousDay: '2026-11-21' }, 7, TODAY),
    ).toBe(7);
  });

  it('starts again at 1 after a gap, and on a first visit', () => {
    expect(
      streakToday({ lastDay: '2026-11-19', previousDay: null }, 12, TODAY),
    ).toBe(1);
    expect(streakToday({ lastDay: null, previousDay: null }, 0, TODAY)).toBe(1);
  });
});

describe('arrivalCues', () => {
  const TODAY = '2026-11-22';
  const yesterday = { lastDay: '2026-11-21', previousDay: null };
  const event = (date: string, endDate = date, name = 'Coding Club') => ({
    name,
    date,
    endDate,
    today: TODAY,
  });
  const cues = (over: Partial<Parameters<typeof arrivalCues>[0]> = {}) =>
    arrivalCues({
      visits: yesterday,
      streakDays: 1,
      today: TODAY,
      events: [],
      ...over,
    });

  it('says nothing on a first meeting, even with an event today', () => {
    expect(
      cues({
        visits: { lastDay: null, previousDay: null },
        events: [event(TODAY)],
      }),
    ).toEqual([]);
  });

  it('ends on hello, the line he falls back on', () => {
    expect(cues()).toEqual([{ moment: 'hello' }]);
  });

  it('offers the milestone of the run on the day it is reached', () => {
    expect(cues({ streakDays: 6 })).toEqual([
      { moment: 'streak', tokens: { serie: '7' } },
      { moment: 'hello' },
    ]);
    expect(cues({ streakDays: 7 })).toEqual([{ moment: 'hello' }]);
  });

  it('welcomes back after weeks away rather than counting anything', () => {
    expect(
      cues({ visits: { lastDay: '2026-10-01', previousDay: null } }),
    ).toEqual([
      { moment: 'away', tokens: { jours: '52' } },
      { moment: 'hello' },
    ]);
  });

  it('ranks an event today over a milestone, and a milestone over tomorrow', () => {
    expect(
      cues({
        streakDays: 6,
        events: [
          event('2026-11-23', '2026-11-23', 'Demain'),
          event('2026-11-21', '2026-11-23', 'En cours'),
        ],
      }),
    ).toEqual([
      { moment: 'eventToday', tokens: { evenement: 'En cours' } },
      { moment: 'streak', tokens: { serie: '7' } },
      { moment: 'eventTomorrow', tokens: { evenement: 'Demain' } },
      { moment: 'hello' },
    ]);
  });

  it('puts the welcome back before any event', () => {
    expect(
      cues({
        visits: { lastDay: '2026-10-01', previousDay: null },
        events: [event('2026-11-23')],
      }).map((cue) => cue.moment),
    ).toEqual(['away', 'eventTomorrow', 'hello']);
  });

  it('says nothing about an event further away, or over', () => {
    expect(
      cues({
        events: [event('2026-11-24'), event('2026-11-20', '2026-11-21')],
      }),
    ).toEqual([{ moment: 'hello' }]);
  });
});

describe('greetingFor', () => {
  const TODAY = '2026-11-22';
  /** A talent whose day has not been counted yet: `lastDay` is before today. */
  const notYetToday = (lastDay: string | null) => ({
    lastDay,
    previousDay: null,
  });
  /** A talent whose day was counted already, which kept `previousDay`. */
  const countedToday = (previousDay: string | null) => ({
    lastDay: TODAY,
    previousDay,
  });

  it('leaves a first meeting to the welcome screen, the rest of that day too', () => {
    expect(greetingFor(notYetToday(null), TODAY)).toBeNull();
    expect(greetingFor(countedToday(null), TODAY)).toBeNull();
  });

  it('says hello after a short gap and welcomes back after a long one', () => {
    expect(greetingFor(notYetToday('2026-11-21'), TODAY)).toEqual({
      moment: 'hello',
      daysAway: 1,
    });
    expect(greetingFor(notYetToday('2026-11-09'), TODAY)).toEqual({
      moment: 'hello',
      daysAway: MASCOT_AWAY_DAYS - 1,
    });
    expect(greetingFor(notYetToday('2026-11-08'), TODAY)).toEqual({
      moment: 'away',
      daysAway: MASCOT_AWAY_DAYS,
    });
  });

  it('still welcomes back once an earlier request counted the day', () => {
    // A guard redirected the first request of the day, which moved the
    // streak before the page that greets was ever loaded.
    expect(greetingFor(countedToday('2026-11-01'), TODAY)).toEqual({
      moment: 'away',
      daysAway: 21,
    });
    expect(greetingFor(countedToday('2026-11-21'), TODAY)).toEqual({
      moment: 'hello',
      daysAway: 1,
    });
  });

  it('counts days across a month and a year', () => {
    expect(greetingFor(notYetToday('2025-12-31'), '2026-01-01')?.daysAway).toBe(
      1,
    );
  });
});

describe('a line and its tokens', () => {
  it("refuses a token its moment does not offer, the moment's own included", () => {
    expect(unknownMascotTokens('poke', 'Coin {prenom} {canard}')).toEqual([]);
    expect(unknownMascotTokens('poke', '{jours} jours sans toi')).toEqual([
      'jours',
    ]);
    expect(unknownMascotTokens('away', '{jours} jours sans toi')).toEqual([]);
    expect(unknownMascotTokens('hello', '{prénom} {nom} {nom}')).toEqual([
      'nom',
    ]);
  });

  it('fills the tokens, and renders one it has no value for as nothing', () => {
    expect(
      fillLine('Salut {prenom}, moi c’est {canard} !', {
        prenom: 'Inès',
        canard: 'Gaston',
      }),
    ).toBe('Salut Inès, moi c’est Gaston !');
    expect(fillLine('Salut {prenom} !', {})).toBe('Salut  !');
    expect(fillLine('{a} reste {a}', { prenom: 'x' })).toBe('{a} reste {a}');
  });
});

describe('mascotLookOf', () => {
  it('answers to EpiDuck until the talent names it', () => {
    const talent = {
      mascotGlasses: 'sun',
      mascotScarf: 'pink',
      mascotHair: 'beanie',
    } as const;
    expect(mascotLookOf({ ...talent, mascotName: null }).name).toBe('EpiDuck');
    expect(mascotLookOf({ ...talent, mascotName: '   ' }).name).toBe('EpiDuck');
    expect(mascotLookOf({ ...talent, mascotName: ' Gaston ' })).toEqual({
      name: 'Gaston',
      glasses: 'sun',
      scarf: 'pink',
      hair: 'beanie',
    });
  });
});
