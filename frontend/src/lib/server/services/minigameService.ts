import { prisma } from '$lib/server/db';
import { mintGameJwt } from '$lib/server/jwt';
import { MINIGAME_XP_REWARD } from '$lib/domain/xp';
import { grantXp } from '$lib/server/services/xpService';
import {
  getGameCatalog,
  scoringTypeFor,
  type CatalogGame,
} from '$lib/server/services/minigameCatalog';
import type {
  MinigameAttempt,
  MinigamePublication,
  MinigameConfig,
  MinigameScoring,
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
  if (attempt.status !== 'pending') return; // Already finalized — idempotent: never re-pay XP.

  // A valid run earns flat XP; the talent sees the "+XP" float on their next
  // dashboard visit (gated by xpSeenAt). Invalid runs finalize without reward.
  // Increment + finalize together so the grant and the audit trail can't drift.
  const xpAwarded = payload.valid ? MINIGAME_XP_REWARD : null;

  await prisma.$transaction(async (tx) => {
    await tx.minigameAttempt.update({
      where: { id: attempt.id },
      data: {
        status: payload.valid ? 'done' : 'invalid',
        score: payload.score,
        chrono: payload.chrono,
        valid: payload.valid,
        finishedAt: new Date(),
        xpAwarded,
      },
    });
    if (xpAwarded) {
      await grantXp(tx, {
        talentId: attempt.talentId,
        source: 'minigame',
        sourceId: attempt.id,
        amount: xpAwarded,
        campusId: attempt.campusId,
      });
    }
  });
}

/** An enabled config paired with its live catalogue entry. */
interface RotationCandidate {
  config: MinigameConfig;
  game: CatalogGame;
}

export async function pickNextPublication(): Promise<MinigamePublication | null> {
  const catalog = await getGameCatalog();
  if (catalog.length === 0) {
    console.warn(
      '[minigames] Catalogue unavailable or empty — skipping publication.',
    );
    return null;
  }
  const byName = new Map(catalog.map((g) => [g.name, g]));

  const configs = await prisma.minigameConfig.findMany({
    where: { enabled: true },
  });
  // A config is only a rotation candidate if it still maps to a catalogue game
  // that has at least one level (a slug removed from jump-games is skipped).
  const candidates: RotationCandidate[] = configs
    .map((config) => ({ config, game: byName.get(config.game) }))
    .filter((c): c is RotationCandidate => !!c.game && c.game.levelCount > 0);
  if (candidates.length === 0) {
    console.warn('[minigames] No eligible game config — skipping publication.');
    return null;
  }

  const active = await getActivePublication();
  const pool = active
    ? candidates.filter((c) => c.config.game !== active.game)
    : candidates;
  if (pool.length === 0) {
    console.warn(
      '[minigames] All games excluded by current publication — skipping.',
    );
    return null;
  }

  const pick = weightedPick(pool);
  const level = Math.floor(Math.random() * pick.game.levelCount) + 1;

  return prisma.minigamePublication.create({
    data: {
      game: pick.game.name,
      gameName: pick.game.displayName,
      level,
      scoringType: scoringTypeFor(pick.game),
    },
  });
}

/**
 * Publish a specific game/level on demand. The caller (admin) has already
 * validated `game` against the catalogue, so the resolved snapshot is passed
 * in — keeping this a pure write and avoiding a second catalogue fetch.
 */
export async function forcePublication(input: {
  game: string;
  gameName: string;
  level: number;
  scoringType: MinigameScoring;
  forcedById: string | null;
}): Promise<MinigamePublication> {
  return prisma.minigamePublication.create({
    data: {
      game: input.game,
      gameName: input.gameName,
      level: input.level,
      scoringType: input.scoringType,
      forcedById: input.forcedById,
    },
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
  });
  if (!publication) return { rows: [], scoringType: 'chrono' };

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
    if (publication.scoringType === 'score') {
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

  return { rows, scoringType: publication.scoringType };
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

export interface LeaderboardPreview {
  rows: LeaderboardRow[];
  /** The talent's own row, set only when they rank *below* the previewed top. */
  ownRow: LeaderboardRow | null;
  total: number;
  scoringType: 'score' | 'chrono';
}

/**
 * Compact campus leaderboard for the dashboard: the top `limit` rows plus the
 * talent's own row pinned when they fall outside that top. Same campus scope
 * (global fallback) as {@link getCampusLeaderboard}.
 */
export async function getCampusLeaderboardPreview(
  publicationId: string,
  campusId: string | null,
  talentId: string,
  limit = 5,
): Promise<LeaderboardPreview> {
  const { rows, scoringType } = await getCampusLeaderboard(
    publicationId,
    campusId,
  );
  const own = rows.find((r) => r.talentId === talentId) ?? null;
  return {
    rows: rows.slice(0, limit),
    ownRow: own && own.rank > limit ? own : null,
    total: rows.length,
    scoringType,
  };
}

function weightedPick(candidates: RotationCandidate[]): RotationCandidate {
  const total = candidates.reduce(
    (acc, c) => acc + Math.max(1, c.config.weight),
    0,
  );
  let pick = Math.random() * total;
  for (const c of candidates) {
    pick -= Math.max(1, c.config.weight);
    if (pick <= 0) return c;
  }
  return candidates[candidates.length - 1];
}
