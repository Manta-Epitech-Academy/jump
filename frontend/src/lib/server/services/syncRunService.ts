/**
 * The ledger of Salesforce synchronisation runs, and the watermarks derived
 * from it.
 *
 * The worker is ephemeral and its pod logs go with it, while nobody on the team
 * has kubectl: without this, "did the sync run last night, and what did it do"
 * has no answer at all. It replaced a single `AppSetting` row overwritten on
 * every pass, which could say what the last call did and nothing else.
 *
 * A row is written for a REAL run only. A tick with nothing due exits on
 * `GET /api/worker/config` without opening one, so the table follows syncs
 * performed rather than times the CronJob fired.
 */

import { prisma } from '$lib/server/db';
import type { SyncMode, SyncRunStatus } from '@prisma/client';
import type { SyncRunMark } from '$lib/domain/syncSchedule';

/**
 * How long a run report is kept.
 *
 * Long enough to investigate an incident weeks later and to look back over a
 * season's cadence. Trimmed on close rather than by a cron job: the only path
 * that grows this table is the one that closes a run, so that is where it pays
 * for itself, and a job would mean a CronJob manifest in another repository
 * that nothing here could keep honest. `AdminApi_Call` keeps its own
 * `gc-api-audit` job for the opposite reason: it grows on every call, not on
 * every run.
 */
const RETENTION_DAYS = 180;

export type RunCounters = {
  events: number;
  talents: number;
  participations: number;
};

/** Open a run. The worker holds the id and closes it, whatever the outcome. */
export async function openRun(mode: SyncMode): Promise<{ id: string }> {
  const run = await prisma.sync_Run.create({
    data: { mode, status: 'running' },
    select: { id: true },
  });
  return run;
}

export type CloseRunResult =
  { ok: true } | { ok: false; reason: 'not_found' | 'already_closed' };

/**
 * Close a run, and trim the tail while we are here.
 *
 * Closing an already-closed run is refused rather than silently applied: the
 * worker's error path fires a second PATCH for the same id when the success
 * PATCH itself fails, and letting that rewrite an `ok` run as `error` would
 * make the watermark go backwards over data that did land.
 */
export async function closeRun(
  id: string,
  outcome:
    | { status: 'ok'; counters: RunCounters }
    | { status: 'error'; error?: string },
): Promise<CloseRunResult> {
  const existing = await prisma.sync_Run.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!existing) return { ok: false, reason: 'not_found' };
  if (existing.status !== 'running')
    return { ok: false, reason: 'already_closed' };

  await prisma.sync_Run.update({
    where: { id },
    data:
      outcome.status === 'ok'
        ? {
            status: 'ok',
            finishedAt: new Date(),
            eventsCount: outcome.counters.events,
            talentsCount: outcome.counters.talents,
            participationsCount: outcome.counters.participations,
          }
        : {
            status: 'error',
            finishedAt: new Date(),
            error: outcome.error ?? null,
          },
  });

  await trimOldRuns();
  return { ok: true };
}

async function trimOldRuns(): Promise<void> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
  await prisma.sync_Run.deleteMany({ where: { startedAt: { lt: cutoff } } });
}

/**
 * The last run of a mode that actually succeeded, which is the only kind that
 * moves a watermark.
 *
 * That is the whole failure story: a run closed in `error` leaves the previous
 * mark standing, so the next tick asks for the same window again instead of
 * stepping over it. Nothing else has to remember that a run failed.
 */
export async function lastOkRun(mode: SyncMode): Promise<SyncRunMark | null> {
  const run = await prisma.sync_Run.findFirst({
    where: { mode, status: 'ok', finishedAt: { not: null } },
    orderBy: { finishedAt: 'desc' },
    select: { startedAt: true, finishedAt: true },
  });
  if (!run?.finishedAt) return null;
  return { startedAt: run.startedAt, finishedAt: run.finishedAt };
}

export type SyncRunRow = {
  id: string;
  mode: SyncMode;
  status: SyncRunStatus;
  startedAt: Date;
  finishedAt: Date | null;
  durationSeconds: number | null;
  events: number | null;
  talents: number | null;
  participations: number | null;
  error: string | null;
};

/** The most recent runs, newest first. Feeds the operational read. */
export async function recentRuns(limit: number): Promise<SyncRunRow[]> {
  const rows = await prisma.sync_Run.findMany({
    orderBy: { startedAt: 'desc' },
    take: limit,
  });

  return rows.map((r) => ({
    id: r.id,
    mode: r.mode,
    status: r.status,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    durationSeconds: r.finishedAt
      ? Math.round((r.finishedAt.getTime() - r.startedAt.getTime()) / 1000)
      : null,
    events: r.eventsCount,
    talents: r.talentsCount,
    participations: r.participationsCount,
    error: r.error,
  }));
}

/** A run still open, if any. One means the worker is mid-pass, or died mid-pass. */
export async function openRunSnapshot(): Promise<{
  id: string;
  mode: SyncMode;
  startedAt: Date;
} | null> {
  return prisma.sync_Run.findFirst({
    where: { status: 'running' },
    orderBy: { startedAt: 'desc' },
    select: { id: true, mode: true, startedAt: true },
  });
}

/**
 * When data last landed, whatever pass brought it. Both modes write real rows,
 * so freshness is the more recent of the two rather than the incremental alone.
 */
export async function lastSuccessfulLanding(): Promise<Date | null> {
  const run = await prisma.sync_Run.findFirst({
    where: { status: 'ok', finishedAt: { not: null } },
    orderBy: { finishedAt: 'desc' },
    select: { finishedAt: true },
  });
  return run?.finishedAt ?? null;
}
