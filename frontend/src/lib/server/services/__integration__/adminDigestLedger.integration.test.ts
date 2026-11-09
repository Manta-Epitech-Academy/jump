/**
 * The digest's ledger (#493): one run per Paris week, claimed before anything is
 * sent.
 *
 * What is pinned is what the rows decide: a second trigger in a claimed week
 * mails nobody, a week whose run delivered nothing is claimed again, "nouveau"
 * starts at the last digest that reached somebody, and adoption comes once a
 * month. Every date is fixed and far from today, so the send suite's own claim
 * on the current week cannot interfere.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { assertTestDatabase } from './testDatabase';
import {
  adoptionDue,
  claimDigestWeek,
  digestBaseline,
  finishDigestRun,
} from '$lib/server/services/adminDigest/ledger';

const MINUTE = 60 * 1000;

/** Monday 2031-03-10, 08:00 in Paris (UTC+1 in March before the change). */
const MONDAY = new Date('2031-03-10T07:00:00.000Z');
const NEXT_MONDAY = new Date('2031-03-17T07:00:00.000Z');

describe('admin digest ledger (integration)', () => {
  beforeEach(async () => {
    assertTestDatabase();
    await prisma.adminDigest_Run.deleteMany({});
  });

  afterAll(async () => {
    await prisma.adminDigest_Run.deleteMany({});
  });

  // A manual re-run, or a CronJob retry after a 500, used to mail every admin
  // a second time with nothing to stop it.
  it('lets only one trigger claim a week', async () => {
    const first = await claimDigestWeek(MONDAY, 2);
    expect(first).not.toBeNull();
    await finishDigestRun(first!.runId, {
      sent: 2,
      failed: 0,
      includedAdoption: true,
    });

    expect(
      await claimDigestWeek(new Date(MONDAY.getTime() + 60 * MINUTE), 2),
    ).toBeNull();
    expect(await claimDigestWeek(NEXT_MONDAY, 2)).not.toBeNull();
  });

  it('holds a week while a send is under way, and frees it once that send has died', async () => {
    expect(await claimDigestWeek(MONDAY, 1)).not.toBeNull();

    expect(
      await claimDigestWeek(new Date(MONDAY.getTime() + 5 * MINUTE), 1),
    ).toBeNull();
    expect(
      await claimDigestWeek(new Date(MONDAY.getTime() + 20 * MINUTE), 1),
    ).not.toBeNull();
    expect(await prisma.adminDigest_Run.count()).toBe(1);
  });

  it('claims again a week whose every send failed, since nothing reached anybody', async () => {
    const first = await claimDigestWeek(MONDAY, 2);
    await finishDigestRun(first!.runId, {
      sent: 0,
      failed: 2,
      includedAdoption: true,
    });

    const retry = await claimDigestWeek(new Date(MONDAY.getTime() + MINUTE), 2);
    expect(retry).toEqual(first);
    const row = await prisma.adminDigest_Run.findUniqueOrThrow({
      where: { id: retry!.runId },
    });
    expect(row).toMatchObject({ finishedAt: null, sent: 0, failed: 0 });
  });

  it('starts "nouveau" at the last digest that reached somebody', async () => {
    expect(await digestBaseline(NEXT_MONDAY)).toEqual({
      since: new Date(NEXT_MONDAY.getTime() - 7 * 24 * 60 * MINUTE),
      previous: false,
    });

    const delivered = await claimDigestWeek(MONDAY, 1);
    await finishDigestRun(delivered!.runId, {
      sent: 1,
      failed: 0,
      includedAdoption: true,
    });
    // A run of the same week is not "the last one" for that week's digest.
    expect((await digestBaseline(MONDAY)).previous).toBe(false);
    expect(await digestBaseline(NEXT_MONDAY)).toEqual({
      since: MONDAY,
      previous: true,
    });

    // A later week that reached nobody does not move the start: its recipients
    // saw nothing, so nothing was announced to them.
    const failed = await claimDigestWeek(NEXT_MONDAY, 1);
    await finishDigestRun(failed!.runId, {
      sent: 0,
      failed: 1,
      includedAdoption: false,
    });
    expect(
      (await digestBaseline(new Date('2031-03-24T07:00:00.000Z'))).since,
    ).toEqual(MONDAY);
  });

  it('carries adoption in the first delivered digest of each Paris month', async () => {
    expect(await adoptionDue(MONDAY)).toBe(true);

    const run = await claimDigestWeek(MONDAY, 1);
    await finishDigestRun(run!.runId, {
      sent: 1,
      failed: 0,
      includedAdoption: true,
    });

    expect(await adoptionDue(NEXT_MONDAY)).toBe(false);
    // 00:30 on 1 April in Paris is still 31 March in UTC.
    expect(await adoptionDue(new Date('2031-03-31T22:30:00.000Z'))).toBe(true);
  });
});
