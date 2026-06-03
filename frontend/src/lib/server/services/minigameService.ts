import { prisma } from '$lib/server/db';
import { mintGameJwt } from '$lib/server/jwt';
import { MINIGAME_XP_REWARD, minigameRankBonus } from '$lib/domain/xp';
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
  // Find the active pending attempt for this (talent, game, level). The
  // publication's scoringType rides along so the rank bonus below ranks this run
  // the same way the board displays it.
  const attempt = await prisma.minigameAttempt.findFirst({
    where: {
      talentId: payload.playerId,
      publication: { game: payload.game, level: payload.level },
    },
    orderBy: { startedAt: 'desc' },
    include: { publication: { select: { scoringType: true } } },
  });
  if (!attempt) return; // Unknown attempt: silently ignore (idempotent on retry of a deleted attempt).
  if (attempt.status !== 'pending') return; // Already finalized — idempotent: never re-pay XP.

  // Decide the board this run belongs to at FINISH, not mint. Mint context is
  // provisional: a talent can open the game before they have any participation
  // (campusId null ⇒ they'd rank on, and be shown, the global board), then gain
  // one before they finish. Re-resolving here puts the run on the campus board
  // they actually belong to when the result counts. No-clobber on null: a
  // resolvable campus wins, but an unresolvable one keeps the mint value rather
  // than downgrading a known campus to null. The same `campusId` then drives the
  // grant, the rank, and (via the attempt row) the board the talent is shown:
  // one value, so the board you place on can't diverge from the board you see.
  const resolved = payload.valid
    ? await getClosestEventForTalent(attempt.talentId)
    : null;
  const eventId = resolved?.eventId ?? attempt.eventId;
  const campusId = resolved?.campusId ?? attempt.campusId;

  // A valid run earns flat XP; the talent sees the "+XP" float on the training
  // page right after the win, or on the next dashboard visit (gated by xpSeenAt).
  // Invalid runs finalize without reward. Finalize + grant together so the grant
  // and the audit trail can't drift.
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
        eventId,
        campusId,
        xpAwarded,
      },
    });
    if (!xpAwarded) return;

    await grantXp(tx, {
      talentId: attempt.talentId,
      source: 'minigame',
      sourceId: attempt.id,
      amount: xpAwarded,
      campusId,
    });

    // Rank bonus, paid the instant you finish: rank this run against the board so
    // far (this attempt included, since it was just marked done), and pay a
    // layered `minigame_rank` fact on top of the flat finish reward for a top-N
    // place. The pool is cohort-relative (the top {@link MINIGAME_RANK_BONUS_FRACTION}
    // of the field, floored at the podium), so it scales with the campus rather
    // than handing every campus the same flat three. No clawback (a later, better
    // run never demotes a bonus already paid), so the bonus means "you held a
    // top-N spot the moment you finished", and an early leader keeps it even once
    // overtaken. Two finishes racing under READ COMMITTED may briefly tie a rank
    // and double-pay one slot: harmless, and on-brand with rewarding broadly.
    const { rank, fieldSize } = await rankOnCampusBoard(
      tx,
      attempt.publicationId,
      campusId,
      attempt.publication.scoringType,
      attempt.id,
    );
    const rankBonus = minigameRankBonus(rank, fieldSize);
    if (rankBonus > 0) {
      await tx.minigameAttempt.update({
        where: { id: attempt.id },
        data: { rankXpAwarded: rankBonus },
      });
      await grantXp(tx, {
        talentId: attempt.talentId,
        source: 'minigame_rank',
        sourceId: attempt.id,
        amount: rankBonus,
        campusId,
      });
    }
  });
}

/**
 * Stamp `xpSeenAt` on the talent's awarded-but-unseen attempts so the "+XP"
 * float fires exactly once — whether it played on the daily-training page (right
 * after the win) or on the next dashboard visit. Idempotent: a double-fire or a
 * stale tab is harmless.
 */
export async function markMinigameRewardsSeen(talentId: string): Promise<void> {
  await prisma.minigameAttempt.updateMany({
    where: { talentId, xpAwarded: { not: null }, xpSeenAt: null },
    data: { xpSeenAt: new Date() },
  });
}

/**
 * Stamp `rankXpSeenAt` on the talent's rank-bonus-awarded-but-unseen attempts so
 * the podium "+XP" float fires exactly once. The play page floats only the base
 * finish reward, so the rank bonus is celebrated separately on the next dashboard
 * visit; this flag is its own one-shot gate, kept apart from
 * {@link markMinigameRewardsSeen} (different field) so the two floats can never
 * stamp each other.
 */
export async function markMinigameRankRewardsSeen(
  talentId: string,
): Promise<void> {
  await prisma.minigameAttempt.updateMany({
    where: { talentId, rankXpAwarded: { not: null }, rankXpSeenAt: null },
    data: { rankXpSeenAt: new Date() },
  });
}

/**
 * The talent's most recent rank bonus not yet celebrated, or null. Drives the
 * one-shot podium float on whichever page the player lands on after a game (the
 * dashboard or the leaderboard), gated by `rankXpSeenAt`. Shared by both loads so
 * the celebration follows the player either way.
 */
export async function getUnseenMinigameRankReward(
  talentId: string,
): Promise<{ xp: number } | null> {
  const attempt = await prisma.minigameAttempt.findFirst({
    where: { talentId, rankXpAwarded: { not: null }, rankXpSeenAt: null },
    orderBy: { finishedAt: 'desc' },
    select: { rankXpAwarded: true },
  });
  return attempt?.rankXpAwarded != null ? { xp: attempt.rankXpAwarded } : null;
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
  let pool = active
    ? candidates.filter((c) => c.config.game !== active.game)
    : candidates;

  // The inaugural publication is a newcomer's very first daily challenge, so it
  // must never open on a `hard` game (e.g. the Démineur — deductive and fiddly
  // on touch). Once a publication exists, the normal weighted rotation resumes
  // and every enabled game is back in play.
  if (!active) {
    const approachable = pool.filter((c) => c.game.difficulty !== 'hard');
    if (approachable.length > 0) pool = approachable;
  }

  if (pool.length === 0) {
    console.warn(
      '[minigames] All games excluded by current publication — skipping.',
    );
    return null;
  }

  const pick = weightedPick(pool);
  const level = Math.floor(Math.random() * pick.game.levelCount) + 1;

  const published = await prisma.minigamePublication.create({
    data: {
      game: pick.game.name,
      gameName: pick.game.displayName,
      level,
      scoringType: scoringTypeFor(pick.game),
    },
  });

  return published;
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
  const published = await prisma.minigamePublication.create({
    data: {
      game: input.game,
      gameName: input.gameName,
      level: input.level,
      scoringType: input.scoringType,
      forcedById: input.forcedById,
    },
  });

  return published;
}

export interface LeaderboardRow {
  rank: number;
  talentId: string;
  prenom: string;
  nom: string;
  score: number | null;
  chrono: number | null;
  finishedAt: Date | null;
  // The rank bonus this talent actually locked in at finish (null = none). Their
  // displayed `rank` can drift below it as others play (no clawback), so this is
  // the truthful per-talent figure, not `minigameRankBonus(rank, fieldSize)`.
  rankXpAwarded: number | null;
}

/**
 * Leaderboard ordering, shared by the displayed board and the at-finish rank
 * bonus ({@link rankOnCampusBoard}) so the rank that earns a bonus is exactly the
 * rank the board shows. Score games: highest score first, shortest chrono breaks
 * ties. Chrono games: fastest first. Nulls sort last in either mode.
 */
function compareAttempts(
  a: { score: number | null; chrono: number | null },
  b: { score: number | null; chrono: number | null },
  scoringType: MinigameScoring,
): number {
  if (scoringType === 'score') {
    const scoreDiff = (b.score ?? -Infinity) - (a.score ?? -Infinity);
    if (scoreDiff !== 0) return scoreDiff;
    return (a.chrono ?? Infinity) - (b.chrono ?? Infinity);
  }
  return (a.chrono ?? Infinity) - (b.chrono ?? Infinity);
}

/**
 * The 1-based rank of a just-finalized attempt on its leaderboard, plus the size
 * of the field it ranked against, both read from the same query so the
 * cohort-relative bonus pool ({@link minigameRankBonus}) is sized off exactly the
 * board the rank came from. Reads through the caller's transaction so it sees this
 * attempt already marked done. The caller passes the `campusId` it just stamped
 * on the attempt (the talent's campus at finish, or null ⇒ the global board),
 * which is the very value {@link resolveLeaderboardScope} reads back to scope the
 * board the talent sees, so the rank that earns the bonus is the rank shown on
 * that board. Same {@link compareAttempts} ordering for the same reason.
 */
async function rankOnCampusBoard(
  tx: Prisma.TransactionClient,
  publicationId: string,
  campusId: string | null,
  scoringType: MinigameScoring,
  attemptId: string,
): Promise<{ rank: number; fieldSize: number }> {
  const peers = await tx.minigameAttempt.findMany({
    where: {
      publicationId,
      status: 'done',
      valid: true,
      ...(campusId ? { campusId } : {}),
    },
    select: { id: true, score: true, chrono: true },
  });
  peers.sort((a, b) => compareAttempts(a, b, scoringType));
  return {
    rank: peers.findIndex((p) => p.id === attemptId) + 1,
    fieldSize: peers.length,
  };
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

  const sorted = [...attempts].sort((a, b) =>
    compareAttempts(a, b, publication.scoringType),
  );

  const rows: LeaderboardRow[] = sorted.map((a, i) => ({
    rank: i + 1,
    talentId: a.talentId,
    prenom: a.talent.prenom,
    nom: a.talent.nom,
    score: a.score,
    chrono: a.chrono,
    finishedAt: a.finishedAt,
    rankXpAwarded: a.rankXpAwarded,
  }));

  return { rows, scoringType: publication.scoringType };
}

/**
 * The board scope a talent is shown for a publication: the single source of
 * truth shared with the rank bonus. Once they've played, it's the `campusId`
 * stamped on their own attempt (the board their bonus was ranked and paid on in
 * {@link applyCallback}), so the board they see can never diverge from the board
 * they placed on. Before they've played, there's no attempt and so no bonus to
 * agree with, so we preview where they'd land from their closest event. Null in
 * either case ⇒ the global board.
 */
export async function resolveLeaderboardScope(
  talentId: string,
  publicationId: string,
): Promise<{ campusId: string | null }> {
  const attempt = await prisma.minigameAttempt.findUnique({
    where: { talentId_publicationId: { talentId, publicationId } },
    select: { campusId: true },
  });
  if (attempt) return { campusId: attempt.campusId };
  const closest = await getClosestEventForTalent(talentId);
  return { campusId: closest?.campusId ?? null };
}

/**
 * Talent-facing leaderboard: scoped to the talent's campus when known, or
 * global (everyone who played today's publication) when `campusId` is null.
 * Pass the `campusId` from {@link resolveLeaderboardScope} so the rows match the
 * board the viewer was ranked on.
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
