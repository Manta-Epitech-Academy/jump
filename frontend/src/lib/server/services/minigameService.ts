import { prisma } from '$lib/server/db';
import { mintGameJwt } from '$lib/server/jwt';
import type {
  MinigameAttempt,
  MinigamePublication,
  MinigameConfig,
  Prisma,
} from '@prisma/client';

export interface CallbackPayload {
  playerId: string;
  game: string;
  level: number;
  score: number | null;
  chrono: number;
  valid: boolean;
}

/**
 * Minigames are intrinsic to the platform — eligibility no longer depends on
 * an event. A talent is eligible as soon as there's an active publication they
 * haven't played. `eventId`/`campusId` are optional context snapshotted from
 * the talent's closest event (null when they have no participations at all):
 * `campusId` scopes the talent-facing leaderboard (global fallback when null),
 * `eventId` feeds the staff per-event board.
 */
export type EligibilityReason = 'no_publication' | 'already_played';

export type EligibilityResult =
  | {
      ok: true;
      eventId: string | null;
      campusId: string | null;
      publication: MinigamePublication;
    }
  | {
      ok: false;
      reason: EligibilityReason;
      publication?: MinigamePublication;
      lastAttempt?: MinigameAttempt;
    };

export async function getActivePublication(): Promise<MinigamePublication | null> {
  return prisma.minigamePublication.findFirst({
    orderBy: { publishedAt: 'desc' },
  });
}

/**
 * Pick the event "closest" to the talent — its `eventId` tags a new
 * `MinigameAttempt` (feeding the staff per-event board) and its `campusId`
 * scopes the talent-facing leaderboard.
 *
 *   1. An event spanning today (multi-day or single-day): prefer that.
 *   2. Otherwise, the next upcoming event.
 *   3. Otherwise, the most recent past event.
 *
 * Returns `null` when the talent has zero participations ever. That's no
 * longer fatal: `MinigameAttempt.eventId`/`campusId` are nullable, so the
 * play still mints with null context and the leaderboard falls back to global.
 */
export async function getClosestEventForTalent(
  talentId: string,
): Promise<{ eventId: string; campusId: string } | null> {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  // 1. Event spanning today.
  const ongoing = await prisma.participation.findFirst({
    where: {
      talentId,
      event: {
        date: { lte: endOfDay },
        OR: [
          { endDate: { gte: startOfDay } },
          { endDate: null, date: { gte: startOfDay } },
        ],
      },
    },
    orderBy: { event: { date: 'desc' } },
    select: { eventId: true, campusId: true },
  });
  if (ongoing) return ongoing;

  // 2. Next upcoming event.
  const upcoming = await prisma.participation.findFirst({
    where: {
      talentId,
      event: { date: { gt: endOfDay } },
    },
    orderBy: { event: { date: 'asc' } },
    select: { eventId: true, campusId: true },
  });
  if (upcoming) return upcoming;

  // 3. Most recent past event (null when the talent has no participations).
  return prisma.participation.findFirst({
    where: {
      talentId,
      event: { date: { lt: startOfDay } },
    },
    orderBy: { event: { date: 'desc' } },
    select: { eventId: true, campusId: true },
  });
}

export async function checkTalentEligibility(
  talentId: string,
): Promise<EligibilityResult> {
  const publication = await getActivePublication();
  if (!publication) return { ok: false, reason: 'no_publication' };

  const existing = await prisma.minigameAttempt.findUnique({
    where: {
      talentId_publicationId: { talentId, publicationId: publication.id },
    },
  });
  // Only a *finalized* attempt counts as played. A leftover `pending` row
  // (e.g. the talent opened the play page but never finished, or a stray
  // mint) is recoverable — they can still play, reusing that row.
  if (existing && existing.status !== 'pending') {
    return {
      ok: false,
      reason: 'already_played',
      publication,
      lastAttempt: existing,
    };
  }

  // Optional context — null when the talent has no participations at all.
  const closest = await getClosestEventForTalent(talentId);
  return {
    ok: true,
    eventId: closest?.eventId ?? null,
    campusId: closest?.campusId ?? null,
    publication,
  };
}

export interface MintAttemptResult {
  token: string;
  attempt: MinigameAttempt;
  publication: MinigamePublication;
}

export async function mintAttempt(
  talentId: string,
  publicationId: string,
): Promise<
  | { ok: true; result: MintAttemptResult }
  | { ok: false; reason: EligibilityReason }
> {
  const eligibility = await checkTalentEligibility(talentId);
  if (!eligibility.ok) return { ok: false, reason: eligibility.reason };
  if (eligibility.publication.id !== publicationId) {
    // The publication the talent is asking for is no longer active.
    return { ok: false, reason: 'no_publication' };
  }
  const publication = eligibility.publication;
  const { token, jti } = await mintGameJwt(
    talentId,
    publication.game,
    publication.level,
  );
  // Upsert: reuse a leftover pending row (refreshing token + start time)
  // rather than colliding with the @@unique([talentId, publicationId]).
  // A finalized attempt can't reach here — eligibility blocks it above.
  const attempt = await prisma.minigameAttempt.upsert({
    where: {
      talentId_publicationId: { talentId, publicationId: publication.id },
    },
    update: {
      eventId: eligibility.eventId,
      campusId: eligibility.campusId,
      jti,
      status: 'pending',
      startedAt: new Date(),
    },
    create: {
      talentId,
      publicationId: publication.id,
      eventId: eligibility.eventId,
      campusId: eligibility.campusId,
      jti,
      status: 'pending',
    },
  });
  return { ok: true, result: { token, attempt, publication } };
}

export async function applyCallback(payload: CallbackPayload): Promise<void> {
  // Find the active pending attempt for this (talent, game, level).
  const attempt = await prisma.minigameAttempt.findFirst({
    where: {
      talentId: payload.playerId,
      publication: { game: payload.game, level: payload.level },
    },
    orderBy: { startedAt: 'desc' },
  });
  if (!attempt) return; // Unknown attempt: silently ignore (idempotent on retry of a deleted attempt).
  if (attempt.status !== 'pending') return; // Already finalized — idempotent.

  await prisma.minigameAttempt.update({
    where: { id: attempt.id },
    data: {
      status: payload.valid ? 'done' : 'invalid',
      score: payload.score,
      chrono: payload.chrono,
      valid: payload.valid,
      finishedAt: new Date(),
    },
  });
}

export async function pickNextPublication(): Promise<MinigamePublication | null> {
  const configs = await prisma.minigameConfig.findMany({
    where: { enabled: true, levelCount: { gt: 0 } },
  });
  if (configs.length === 0) {
    console.warn('[minigames] No eligible game config — skipping publication.');
    return null;
  }

  const active = await getActivePublication();
  const candidates = active
    ? configs.filter((c) => c.game !== active.game)
    : configs;
  if (candidates.length === 0) {
    console.warn(
      '[minigames] All games excluded by current publication — skipping.',
    );
    return null;
  }

  const game = weightedPick(candidates);
  const level = Math.floor(Math.random() * game.levelCount) + 1;

  return prisma.minigamePublication.create({
    data: { game: game.game, level },
  });
}

export async function forcePublication(
  game: string,
  level: number,
  forcedById: string | null,
): Promise<MinigamePublication> {
  return prisma.minigamePublication.create({
    data: { game, level, forcedById },
  });
}

export interface LeaderboardRow {
  rank: number;
  talentId: string;
  prenom: string;
  nom: string;
  score: number | null;
  chrono: number | null;
  finishedAt: Date | null;
}

async function buildLeaderboard(
  publicationId: string,
  scopeWhere: Prisma.MinigameAttemptWhereInput,
): Promise<{ rows: LeaderboardRow[]; scoringType: 'score' | 'chrono' }> {
  const publication = await prisma.minigamePublication.findUnique({
    where: { id: publicationId },
    include: { config: true },
  });
  if (!publication) return { rows: [], scoringType: 'score' };

  const attempts = await prisma.minigameAttempt.findMany({
    where: {
      publicationId,
      status: 'done',
      valid: true,
      ...scopeWhere,
    },
    include: {
      talent: { select: { id: true, prenom: true, nom: true } },
    },
  });

  const sorted = [...attempts].sort((a, b) => {
    if (publication.config.scoringType === 'score') {
      const scoreDiff = (b.score ?? -Infinity) - (a.score ?? -Infinity);
      if (scoreDiff !== 0) return scoreDiff;
      return (a.chrono ?? Infinity) - (b.chrono ?? Infinity);
    }
    return (a.chrono ?? Infinity) - (b.chrono ?? Infinity);
  });

  const rows: LeaderboardRow[] = sorted.map((a, i) => ({
    rank: i + 1,
    talentId: a.talentId,
    prenom: a.talent.prenom,
    nom: a.talent.nom,
    score: a.score,
    chrono: a.chrono,
    finishedAt: a.finishedAt,
  }));

  return { rows, scoringType: publication.config.scoringType };
}

/**
 * Talent-facing leaderboard: scoped to the talent's campus when known, or
 * global (everyone who played today's publication) when `campusId` is null.
 */
export async function getCampusLeaderboard(
  publicationId: string,
  campusId: string | null,
): Promise<{ rows: LeaderboardRow[]; scoringType: 'score' | 'chrono' }> {
  return buildLeaderboard(publicationId, campusId ? { campusId } : {});
}

/** Staff per-event leaderboard: ranks attempts made during a given event. */
export async function getEventLeaderboard(
  publicationId: string,
  eventId: string,
): Promise<{ rows: LeaderboardRow[]; scoringType: 'score' | 'chrono' }> {
  return buildLeaderboard(publicationId, { eventId });
}

function weightedPick(candidates: MinigameConfig[]): MinigameConfig {
  const total = candidates.reduce((acc, c) => acc + Math.max(1, c.weight), 0);
  let pick = Math.random() * total;
  for (const c of candidates) {
    pick -= Math.max(1, c.weight);
    if (pick <= 0) return c;
  }
  return candidates[candidates.length - 1];
}
