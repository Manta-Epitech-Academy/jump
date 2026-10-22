/**
 * An event's days, as the sync writes them from the campaign's `StartDate` and
 * `EndDate`.
 *
 * Salesforce owns both and nothing in Jump edits them, so the sync is the only
 * writer, and each way it can get a day wrong is a test:
 *  - a day read in the server's timezone instead of the campus's lands on the
 *    day before for any campus east of the server;
 *  - a change made in Salesforce that does not land leaves Jump on the old day
 *    with nobody able to correct it there;
 *  - a worker that does not send the days yet must not wipe them;
 *  - a new campaign with no start day must not land on the day the worker ran.
 *
 * The campus sits in `Indian/Reunion` (UTC+4, no daylight saving) so that a
 * day read in any European or UTC server timezone shows up as a wrong instant.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { syncEvents } from '../syncService';
import { assertTestDatabase } from './testDatabase';

describe('event days from the Salesforce campaign (integration)', () => {
  const stamp = Date.now();
  const campusExternalName = `TEST_DAYS_${stamp}`;
  const datedId = `test_days_dated_${stamp}`;
  const undatedId = `test_days_undated_${stamp}`;
  const title = `Stage jours ${stamp}`;
  let campusId = '';

  const days = async () =>
    prisma.event.findUniqueOrThrow({
      where: { externalId: datedId },
      select: { date: true, endDate: true },
    });

  beforeAll(async () => {
    assertTestDatabase();
    const campus = await prisma.campus.create({
      data: {
        name: `Test Days ${stamp}`,
        externalName: campusExternalName,
        timezone: 'Indian/Reunion',
      },
      select: { id: true },
    });
    campusId = campus.id;
  });

  afterAll(async () => {
    try {
      await prisma.event.deleteMany({
        where: { externalId: { in: [datedId, undatedId] } },
      });
      await prisma.campus.delete({ where: { id: campusId } });
    } catch {
      // ignore: the test database is disposable
    }
  });

  it('stores the start day at campus midnight and the end day at 23:59', async () => {
    const result = await syncEvents([
      {
        external_id: datedId,
        title,
        campus_ext_name: campusExternalName,
        start_date: '2026-07-06',
        end_date: '2026-07-10',
      },
    ]);
    expect(result).toMatchObject({ created: 1, skipped: 0 });

    const { date, endDate } = await days();
    expect(date.toISOString()).toBe('2026-07-05T20:00:00.000Z');
    expect(endDate?.toISOString()).toBe('2026-07-10T19:59:00.000Z');
  });

  it('follows a day changed in Salesforce, and clears an end day it no longer has', async () => {
    const moved = await syncEvents([
      {
        external_id: datedId,
        title,
        campus_ext_name: campusExternalName,
        start_date: '2026-07-07',
        end_date: '2026-07-11',
      },
    ]);
    expect(moved).toMatchObject({ updated: 1 });
    expect((await days()).date.toISOString()).toBe('2026-07-06T20:00:00.000Z');
    expect((await days()).endDate?.toISOString()).toBe(
      '2026-07-11T19:59:00.000Z',
    );

    const singleDay = await syncEvents([
      {
        external_id: datedId,
        title,
        campus_ext_name: campusExternalName,
        start_date: '2026-07-07',
        end_date: null,
      },
    ]);
    expect(singleDay).toMatchObject({ updated: 1 });
    expect((await days()).endDate).toBeNull();
  });

  it('keeps the stored days when the worker sends none, or one that is not a day', async () => {
    await syncEvents([
      {
        external_id: datedId,
        title,
        campus_ext_name: campusExternalName,
        start_date: '2026-07-07',
        end_date: '2026-07-11',
      },
    ]);
    const before = await days();

    // A worker that predates the two fields sends neither key.
    const older = await syncEvents([
      { external_id: datedId, title, campus_ext_name: campusExternalName },
    ]);
    // Matches the shape but is no calendar day: skipped, not refused.
    const malformed = await syncEvents([
      {
        external_id: datedId,
        title,
        campus_ext_name: campusExternalName,
        start_date: '2026-02-30',
        end_date: '2026-02-31',
      },
    ]);
    expect(older).toMatchObject({ updated: 0 });
    expect(malformed).toMatchObject({ updated: 0 });
    expect(await days()).toEqual(before);
  });

  it('skips a new campaign with no start day and names it, instead of dating it today', async () => {
    const result = await syncEvents([
      {
        external_id: undatedId,
        title: `Sans date ${stamp}`,
        campus_ext_name: campusExternalName,
        start_date: null,
        end_date: '2026-07-10',
      },
    ]);
    expect(result).toMatchObject({ created: 0, skipped: 1 });
    expect(result.undated).toEqual([undatedId]);
    expect(
      await prisma.event.findUnique({ where: { externalId: undatedId } }),
    ).toBeNull();
  });
});
