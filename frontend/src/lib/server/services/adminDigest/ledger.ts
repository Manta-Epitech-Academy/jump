/**
 * The digest's own record of having gone out: one `AdminDigest_Run` per week.
 *
 * Three questions read it, and each used to have no answer but a pod log:
 * - **May this trigger send?** Only if it claims the week first. A second
 *   trigger in the same week (a manual re-run, a CronJob retry after a 500)
 *   finds the week claimed and mails nobody.
 * - **New since when?** Since the last digest that reached somebody, which is
 *   what a recipient means by "depuis la semaine dernière". A missed Monday
 *   widens the window rather than hiding a week; with no such digest yet, the
 *   last seven days.
 * - **Is adoption due?** Adoption appears in the first digest of each month, read
 *   off the rows rather than off the calendar, so a missed first Monday does not
 *   skip the month.
 *
 * Weeks and months are counted in Europe/Paris (`$lib/domain/adminDigestCalendar`).
 */

import { prisma } from '$lib/server/db';
import {
  digestMonthStart,
  digestWeekOf,
} from '$lib/domain/adminDigestCalendar';

/**
 * How long an unfinished run holds its week. A send to a handful of admins takes
 * seconds, so a run still open after this died mid-way (a pod killed, a crash
 * before the last send) and the week is claimed again.
 */
const CLAIM_TIMEOUT_MS = 15 * 60 * 1000;

/** The window "nouveau" covers when no digest has reached anybody yet. */
const FALLBACK_WINDOW_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Claims `now`'s week for a send to `recipients` admins, or says it is taken.
 *
 * The insert is `ON CONFLICT DO NOTHING` on the unique week, so two triggers
 * racing each other cannot both win it. A week already claimed is taken over
 * only when its run delivered nothing: it died before finishing (open longer
 * than {@link CLAIM_TIMEOUT_MS}), or it finished with every send failed. The
 * take-over is one conditional `UPDATE`, the claim pattern the broadcast
 * orchestrator uses, so it too has a single winner.
 */
export async function claimDigestWeek(
  now: Date,
  recipients: number,
): Promise<{ runId: string } | null> {
  const weekOf = digestWeekOf(now);
  const fresh = { startedAt: now, recipients };

  const inserted = await prisma.adminDigest_Run.createMany({
    data: [{ weekOf, ...fresh }],
    skipDuplicates: true,
  });
  if (inserted.count === 0) {
    const retaken = await prisma.adminDigest_Run.updateMany({
      where: {
        weekOf,
        OR: [
          {
            finishedAt: null,
            startedAt: { lt: new Date(now.getTime() - CLAIM_TIMEOUT_MS) },
          },
          { finishedAt: { not: null }, sent: 0 },
        ],
      },
      data: {
        ...fresh,
        finishedAt: null,
        sent: 0,
        failed: 0,
        includedAdoption: false,
      },
    });
    if (retaken.count === 0) return null;
  }

  const run = await prisma.adminDigest_Run.findUniqueOrThrow({
    where: { weekOf },
    select: { id: true },
  });
  return { runId: run.id };
}

/** Closes a claimed run with what it delivered. */
export async function finishDigestRun(
  runId: string,
  outcome: { sent: number; failed: number; includedAdoption: boolean },
  now: Date = new Date(),
): Promise<void> {
  await prisma.adminDigest_Run.update({
    where: { id: runId },
    data: { ...outcome, finishedAt: now },
  });
}

/** A digest that reached at least one admin. */
const DELIVERED = { finishedAt: { not: null }, sent: { gt: 0 } } as const;

/**
 * Where "nouveau" starts for the digest of `now`'s week: when the last delivered
 * digest of an earlier week read its figures, or seven days back when there is
 * none. `previous` says which, because the mail words the two differently.
 */
export async function digestBaseline(
  now: Date,
): Promise<{ since: Date; previous: boolean }> {
  const last = await prisma.adminDigest_Run.findFirst({
    where: { ...DELIVERED, weekOf: { lt: digestWeekOf(now) } },
    orderBy: { startedAt: 'desc' },
    select: { startedAt: true },
  });
  return last
    ? { since: last.startedAt, previous: true }
    : {
        since: new Date(now.getTime() - FALLBACK_WINDOW_DAYS * DAY_MS),
        previous: false,
      };
}

/** True until a delivered digest of `now`'s Paris month carried adoption. */
export async function adoptionDue(now: Date): Promise<boolean> {
  const carried = await prisma.adminDigest_Run.count({
    where: {
      ...DELIVERED,
      includedAdoption: true,
      startedAt: { gte: digestMonthStart(now) },
    },
  });
  return carried === 0;
}

/** The last digest that finished, delivered or not: what `config_admin_digest` reports. */
export async function lastDigestRun() {
  return prisma.adminDigest_Run.findFirst({
    where: { finishedAt: { not: null } },
    orderBy: { startedAt: 'desc' },
    select: {
      weekOf: true,
      startedAt: true,
      finishedAt: true,
      recipients: true,
      sent: true,
      failed: true,
    },
  });
}
