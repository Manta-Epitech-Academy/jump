import { describe, it, expect } from 'vitest';
import { Mascot_Glasses, Mascot_Hair, Mascot_Scarf } from '@prisma/client';
import {
  MASCOT_AWAY_DAYS,
  MASCOT_GLASSES,
  MASCOT_HAIRS,
  MASCOT_SCARVES,
  fillLine,
  greetingFor,
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

  it('leaves a first meeting to #540, the rest of that first day too', () => {
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
