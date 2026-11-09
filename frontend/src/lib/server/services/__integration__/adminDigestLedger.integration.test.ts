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
  recordDigestSend,
} from '$lib/server/services/adminDigest/ledger';

const MINUTE = 60 * 1000;

/** A claim for `recipients` admins, carrying adoption or not. */
const claim = (at: Date, recipients: number, includedAdoption = false) =>
  claimDigestWeek(at, { recipients, includedAdoption });

/** Sends a claimed run's mails, `delivered` of them leaving, and closes it. */
async function deliver(runId: string, delivered: number, refused = 0) {
  for (let i = 0; i < delivered; i++) await recordDigestSend(runId, true);
  for (let i = 0; i < refused; i++) await recordDigestSend(runId, false);
  await finishDigestRun(runId);
}

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
    const first = await claim(MONDAY, 2, true);
    expect(first).not.toBeNull();
    await deliver(first!.runId, 2);

    expect(await claim(new Date(MONDAY.getTime() + 60 * MINUTE), 2)).toBeNull();
    expect(await claim(NEXT_MONDAY, 2)).not.toBeNull();
  });

  it('holds a week while a send is under way, and frees it once that send has died', async () => {
    expect(await claim(MONDAY, 1)).not.toBeNull();

    expect(await claim(new Date(MONDAY.getTime() + 5 * MINUTE), 1)).toBeNull();
    expect(
      await claim(new Date(MONDAY.getTime() + 20 * MINUTE), 1),
    ).not.toBeNull();
    expect(await prisma.adminDigest_Run.count()).toBe(1);
  });

  // Taking the week over would mail again the admins the dead run had reached.
  it('keeps the week of a run that died after reaching somebody', async () => {
    const first = await claim(MONDAY, 2);
    await recordDigestSend(first!.runId, true);

    expect(await claim(new Date(MONDAY.getTime() + 20 * MINUTE), 2)).toBeNull();
    // It did reach that inbox, so the next digest counts "nouveau" from it.
    expect(await digestBaseline(NEXT_MONDAY)).toEqual({
      since: MONDAY,
      previous: true,
    });
  });

  it('claims again a week whose every send failed, since nothing reached anybody', async () => {
    const first = await claim(MONDAY, 2, true);
    await deliver(first!.runId, 0, 2);

    const retry = await claim(new Date(MONDAY.getTime() + MINUTE), 2);
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

    const delivered = await claim(MONDAY, 1, true);
    await deliver(delivered!.runId, 1);
    // A run of the same week is not "the last one" for that week's digest.
    expect((await digestBaseline(MONDAY)).previous).toBe(false);
    expect(await digestBaseline(NEXT_MONDAY)).toEqual({
      since: MONDAY,
      previous: true,
    });

    // A later week that reached nobody does not move the start: its recipients
    // saw nothing, so nothing was announced to them.
    const failed = await claim(NEXT_MONDAY, 1);
    await deliver(failed!.runId, 0, 1);
    expect(
      (await digestBaseline(new Date('2031-03-24T07:00:00.000Z'))).since,
    ).toEqual(MONDAY);
  });

  it('carries adoption in the first delivered digest of each Paris month', async () => {
    expect(await adoptionDue(MONDAY)).toBe(true);

    const run = await claim(MONDAY, 1, true);
    await deliver(run!.runId, 1);

    expect(await adoptionDue(NEXT_MONDAY)).toBe(false);
    // 00:30 on 1 April in Paris is still 31 March in UTC.
    expect(await adoptionDue(new Date('2031-03-31T22:30:00.000Z'))).toBe(true);
  });
});
