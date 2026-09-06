import { env } from '$env/dynamic/private';
import type { MinigameScoring } from '@prisma/client';

/**
 * The minigame catalogue is owned by the external jump-games service and read
 * live from its public `GET /api/games` endpoint. jump never hand-maintains a
 * game's slug, level count, display name or scoring mode: those are facts of
 * jump-games. The host only curates rotation (see `MinigameConfig`).
 *
 * The fetch is cached in-memory with a short TTL; on a transient failure we
 * fall back to the last good snapshot so a brief jump-games hiccup doesn't
 * empty the admin panel or stall the cron.
 */
export interface CatalogGame {
  /** Slug: the key shared across the JWT, callback and `MinigameConfig`. */
  name: string;
  displayName: string;
  description: string;
  difficulty: 'easy' | 'medium' | 'hard';
  /** When false, runs are ranked by chrono alone. */
  hasScore: boolean;
  endMode: 'puzzle' | 'infinite';
  /** Valid levels are the contiguous range 1..levelCount. */
  levelCount: number;
}

const TTL_MS = 5 * 60_000;

let cache: { games: CatalogGame[]; at: number } | null = null;

/** Map a catalogue game to the publication's snapshotted scoring mode. */
export function scoringTypeFor(game: CatalogGame): MinigameScoring {
  return game.hasScore ? 'score' : 'chrono';
}

function gamesUrl(): string | null {
  const url = env.JUMP_GAMES_URL;
  return url ? url.replace(/\/$/, '') : null;
}

/**
 * Resolve the catalogue. Returns `[]` when JUMP_GAMES_URL is unset or the
 * service is unreachable and nothing was ever cached: callers must treat an
 * empty catalogue as "no games available", never as an error.
 */
export async function getGameCatalog(
  opts: { force?: boolean } = {},
): Promise<CatalogGame[]> {
  const base = gamesUrl();
  if (!base) return [];

  if (!opts.force && cache && Date.now() - cache.at < TTL_MS) {
    return cache.games;
  }

  try {
    const res = await fetch(`${base}/api/games`, {
      headers: { accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const body = (await res.json()) as { games?: CatalogGame[] };
    const games = body.games ?? [];
    cache = { games, at: Date.now() };
    return games;
  } catch (err) {
    console.error('[minigames] catalogue fetch failed:', err);
    // Stale-while-error: better a slightly old list than an empty panel.
    return cache?.games ?? [];
  }
}

export async function getCatalogGame(
  name: string,
): Promise<CatalogGame | null> {
  const games = await getGameCatalog();
  return games.find((g) => g.name === name) ?? null;
}
