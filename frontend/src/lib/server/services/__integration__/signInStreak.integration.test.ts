/**
 * The run of consecutive days (#447), checked on a real database, because the
 * two things that can go wrong are both the database's to settle.
 *
 * ONE INCREMENT A DAY, WHATEVER THE RACE. Every request of a talent reaches
 * `recordSignInDay`, and several of the first ones of a day arrive together
 * (the page and its data requests, on two pods). Each decides from the row it
 * loaded, so the guard has to be in the statement: a read-then-write would count
 * a day twice, and no mocked client can show that it does not.
 *
 * THE DAY IS THE CAMPUS'S. 21:30 UTC is still today in Paris and already
 * tomorrow at La Réunion, so the same instant extends a run in one zone and
 * leaves it alone in the other.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { recordSignInDay } from '$lib/server/services/signInStreak';
import { dateKeyToDbDate, dbDateToKey } from '$lib/domain/eventPresence';
import { assertTestDatabase } from './testDatabase';

const stamp = Date.now();
/** 11:00 in Paris, 14:00 at La Réunion: the same day in both. */
const NOW = new Date('2026-10-27T10:00:00.000Z');
const created: string[] = [];

/** A talent whose run is `days` long and last grew on `lastDay`. */
async function talentWith(days: number, lastDay: string | null) {
  const talent = await prisma.talent.create({
    data: {
      prenom: 'Streak',
      nom: `Streak${stamp}-${created.length}`,
      streakDays: days,
      streakLastDay: lastDay ? dateKeyToDbDate(lastDay) : null,
    },
    select: { id: true, streakLastDay: true },
  });
  created.push(talent.id);
  return talent;
}

async function streakOf(id: string) {
  const row = await prisma.talent.findUniqueOrThrow({
    where: { id },
    select: { streakDays: true, streakLastDay: true },
  });
  return {
    days: row.streakDays,
    lastDay: row.streakLastDay && dbDateToKey(row.streakLastDay),
  };
}

beforeAll(() => {
  assertTestDatabase();
});

afterAll(async () => {
  await prisma.talent.deleteMany({ where: { id: { in: created } } });
});

describe('recordSignInDay', () => {
  it('starts a run at 1 for a talent who never had one', async () => {
    const talent = await talentWith(0, null);
    await recordSignInDay(talent, 'Europe/Paris', NOW);
    expect(await streakOf(talent.id)).toEqual({
      days: 1,
      lastDay: '2026-10-27',
    });
  });

  it('extends a run whose last day was yesterday', async () => {
    const talent = await talentWith(4, '2026-10-26');
    await recordSignInDay(talent, 'Europe/Paris', NOW);
    expect(await streakOf(talent.id)).toEqual({
      days: 5,
      lastDay: '2026-10-27',
    });
  });

  it('restarts at 1 a run that missed a day', async () => {
    const talent = await talentWith(9, '2026-10-25');
    await recordSignInDay(talent, 'Europe/Paris', NOW);
    expect(await streakOf(talent.id)).toEqual({
      days: 1,
      lastDay: '2026-10-27',
    });
  });

  it('changes nothing on a later visit the same day', async () => {
    const talent = await talentWith(4, '2026-10-26');
    await recordSignInDay(talent, 'Europe/Paris', NOW);
    // The loaded row is still yesterday's, as a request already in flight has
    // it: only the statement's guard can refuse this one.
    await recordSignInDay(talent, 'Europe/Paris', NOW);
    expect(await streakOf(talent.id)).toEqual({
      days: 5,
      lastDay: '2026-10-27',
    });
  });

  it('counts a day once when its first requests arrive together', async () => {
    const talent = await talentWith(4, '2026-10-26');
    await Promise.all(
      Array.from({ length: 5 }, () =>
        recordSignInDay(talent, 'Europe/Paris', NOW),
      ),
    );
    expect(await streakOf(talent.id)).toEqual({
      days: 5,
      lastDay: '2026-10-27',
    });
  });

  it('reads the day in the campus timezone', async () => {
    // 22:30 in Paris on the 26th, 01:30 at La Réunion on the 27th.
    const evening = new Date('2026-10-26T21:30:00.000Z');
    const paris = await talentWith(4, '2026-10-26');
    const reunion = await talentWith(4, '2026-10-26');
    await recordSignInDay(paris, 'Europe/Paris', evening);
    await recordSignInDay(reunion, 'Indian/Reunion', evening);
    expect(await streakOf(paris.id)).toEqual({
      days: 4,
      lastDay: '2026-10-26',
    });
    expect(await streakOf(reunion.id)).toEqual({
      days: 5,
      lastDay: '2026-10-27',
    });
  });
});
