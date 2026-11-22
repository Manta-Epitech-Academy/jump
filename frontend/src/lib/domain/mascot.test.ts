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
  it('leaves a first meeting to #540 and greets a talent back the same day', () => {
    expect(greetingFor(null, '2026-11-22')).toBeNull();
    expect(greetingFor('2026-11-22', '2026-11-22')).toEqual({
      moment: 'hello',
      daysAway: 0,
    });
  });

  it('says hello after a short gap and welcomes back after a long one', () => {
    expect(greetingFor('2026-11-21', '2026-11-22')).toEqual({
      moment: 'hello',
      daysAway: 1,
    });
    expect(greetingFor('2026-11-09', '2026-11-22')).toEqual({
      moment: 'hello',
      daysAway: MASCOT_AWAY_DAYS - 1,
    });
    expect(greetingFor('2026-11-08', '2026-11-22')).toEqual({
      moment: 'away',
      daysAway: MASCOT_AWAY_DAYS,
    });
  });

  it('counts days across a month and a year', () => {
    expect(greetingFor('2025-12-31', '2026-01-01')?.daysAway).toBe(1);
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
