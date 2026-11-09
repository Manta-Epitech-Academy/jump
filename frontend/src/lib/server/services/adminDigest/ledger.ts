/**
 * The digest's own record of having gone out: one `AdminDigest_Run` per week.
 *
 * Three questions read it, and each used to have no answer but a pod log:
 * - **May this trigger send?** Only if it claims the week first. A second
 *   trigger in the same week (a manual re-run, a CronJob retry) finds the week
 *   claimed and mails nobody, unless the run holding it reached nobody.
 * - **New since when?** Since the last digest that reached somebody, which is
 *   what a recipient means by "depuis la semaine dernière". A missed Monday
 *   widens the window rather than hiding a week; with no such digest yet, the
 *   last seven days.
 * - **Is adoption due?** Adoption appears in the first digest of each month, read
 *   off the rows rather than off the calendar, so a missed first Monday does not
 *   skip the month.
 *
 * "Reached somebody" is `sent > 0`, and `sent` is counted as each mail leaves
 * rather than once at the end: a run that dies half-way still says who it
 * reached, so its week is not mailed a second time and the next digest counts
 * "nouveau" from it.
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
 * seconds, so a run still open after this died (a pod killed, a database error
 * between two mails), and if it reached nobody the week is claimed again.
 */
const CLAIM_TIMEOUT_MS = 15 * 60 * 1000;

/** The window "nouveau" covers when no digest has reached anybody yet. */
const FALLBACK_WINDOW_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Claims `now`'s week for a digest addressed to `recipients` admins, or says it
 * is taken. Called once the mail is built and before it is sent, so a read that
 * fails leaves the week free for the next trigger.
 *
 * The insert is `ON CONFLICT DO NOTHING` on the unique week, so two triggers
 * racing each other cannot both win it. A week already claimed is taken over
 * only when its run reached nobody: it finished with every send failed, or it
 * died before its first mail left (open longer than {@link CLAIM_TIMEOUT_MS}).
 * A run that reached somebody keeps its week even if it died afterwards, since
 * taking it over would mail those admins twice. The take-over is one
 * conditional `UPDATE`, the claim pattern the broadcast orchestrator uses, so it
 * too has a single winner.
 */
export async function claimDigestWeek(
  now: Date,
  run: { recipients: number; includedAdoption: boolean },
): Promise<{ runId: string } | null> {
  const weekOf = digestWeekOf(now);
  const fresh = { startedAt: now, ...run };

  const inserted = await prisma.adminDigest_Run.createMany({
    data: [{ weekOf, ...fresh }],
    skipDuplicates: true,
  });
  if (inserted.count === 0) {
    const retaken = await prisma.adminDigest_Run.updateMany({
      where: {
        weekOf,
        sent: 0,
        OR: [
          { finishedAt: { not: null } },
          { startedAt: { lt: new Date(now.getTime() - CLAIM_TIMEOUT_MS) } },
        ],
      },
      data: { ...fresh, finishedAt: null, failed: 0 },
    });
    if (retaken.count === 0) return null;
  }

  const claimed = await prisma.adminDigest_Run.findUniqueOrThrow({
    where: { weekOf },
    select: { id: true },
  });
  return { runId: claimed.id };
}

/** Counts one mail of a claimed run, the moment the mail service answered. */
export async function recordDigestSend(
  runId: string,
  delivered: boolean,
): Promise<void> {
  await prisma.adminDigest_Run.update({
    where: { id: runId },
    data: delivered ? { sent: { increment: 1 } } : { failed: { increment: 1 } },
  });
}

/** Closes a claimed run once every mail has been tried. */
export async function finishDigestRun(
  runId: string,
  now: Date = new Date(),
): Promise<void> {
  await prisma.adminDigest_Run.update({
    where: { id: runId },
    data: { finishedAt: now },
  });
}

/**
 * A digest that reached at least one admin, finished or not: a run that died
 * after its first mail still put the mail in that inbox.
 */
const DELIVERED = { sent: { gt: 0 } } as const;

/**
 * Where "nouveau" starts for the digest of `at`'s week: when the last delivered
 * digest of an earlier week read its figures, or seven days back when there is
 * none. `previous` says which, because the mail words the two differently.
 *
 * A pure reading of the ledger for that week, so it answers the same whenever it
 * is asked: a run only ever claims its own week, so no earlier week changes
 * once it is over. `config_admin_digest` relies on it to say which window the
 * last digest counted "nouveau" over.
 */
export async function digestBaseline(
  at: Date,
): Promise<{ since: Date; previous: boolean }> {
  const last = await prisma.adminDigest_Run.findFirst({
    where: { ...DELIVERED, weekOf: { lt: digestWeekOf(at) } },
    orderBy: { startedAt: 'desc' },
    select: { startedAt: true },
  });
  return last
    ? { since: last.startedAt, previous: true }
    : {
        since: new Date(at.getTime() - FALLBACK_WINDOW_DAYS * DAY_MS),
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
