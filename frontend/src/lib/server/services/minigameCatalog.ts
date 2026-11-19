import { env } from '$env/dynamic/private';
import type { MinigameScoring } from '@prisma/client';
import { z } from 'zod';

/**
 * The minigame catalogue is owned by the external jump-games service and read
 * live from its public `GET /api/games` endpoint. jump never hand-maintains a
 * game's slug, level count, display name, scoring mode or picture: those are
 * facts of jump-games. The host only curates rotation (see `MinigameConfig`).
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
  /**
   * The game's 88×88 preview as a `data:` URI, ready for an `<img src>`, or
   * null when jump-games sent none jump can show (see `previewSchema`).
   */
  previewSrc: string | null;
}

const TTL_MS = 5 * 60_000;

// Every caller awaits the fetch, the cron and the talent home included, so a
// hung jump-games must cost a bounded wait. The list is static and served from
// memory: a jump-games that takes longer than this is not answering.
const FETCH_TIMEOUT_MS = 2_000;

// The talent home asks on every load, for a picture. After a failure it is
// served the stale snapshot without asking again until this window has passed
// (`getCatalogPreview`). The admin page and the cron ask on every call: they
// need the real answer, and they are rare.
const RETRY_AFTER_FAILURE_MS = 30_000;

/** jump-games holds its previews under this size; anything heavier is dropped. */
const PREVIEW_MAX_BYTES = 16 * 1024;

let cache: { games: CatalogGame[]; at: number } | null = null;
let failedAt: number | null = null;

/**
 * A preview arrives as SVG markup and leaves as a `data:` URI. It is shown
 * through `<img>`, never inlined: an SVG loaded as an image runs no script and
 * fetches nothing, so markup from another service needs no sanitising, and the
 * CSP already allows `data:` images. A preview that is not SVG, or is too heavy
 * to inline in every home page, becomes null: the card shows without one, and
 * the game itself stays in the catalogue.
 */
const previewSchema = z
  .string()
  .refine(
    (svg) =>
      svg.trimStart().startsWith('<svg') &&
      new TextEncoder().encode(svg).length <= PREVIEW_MAX_BYTES,
  )
  .transform((svg) => `data:image/svg+xml,${encodeURIComponent(svg)}`)
  .nullable()
  .catch(null);

const catalogGameSchema = z
  .object({
    name: z.string().min(1),
    displayName: z.string().min(1),
    description: z.string(),
    difficulty: z.enum(['easy', 'medium', 'hard']),
    hasScore: z.boolean(),
    endMode: z.enum(['puzzle', 'infinite']),
    levelCount: z.int().positive(),
    preview: previewSchema,
  })
  .transform(({ preview, ...game }): CatalogGame => ({
    ...game,
    previewSrc: preview,
  }));

/**
 * Read the `/api/games` body entry by entry. An entry jump cannot trust (a
 * missing slug, a level count that is not a number) is left out and logged,
 * rather than reaching the rotation and publishing a level that cannot load.
 */
export function parseCatalog(body: unknown): CatalogGame[] {
  const entries = z.object({ games: z.array(z.unknown()) }).safeParse(body);
  if (!entries.success) {
    throw new Error('catalogue body has no `games` array');
  }
  return entries.data.games.flatMap((entry) => {
    const game = catalogGameSchema.safeParse(entry);
    if (game.success) return [game.data];
    console.error(
      '[minigames] catalogue entry left out:',
      z.prettifyError(game.error),
    );
    return [];
  });
}

/** Map a catalogue game to the publication's snapshotted scoring mode. */
export function scoringTypeFor(
  game: Pick<CatalogGame, 'hasScore'>,
): MinigameScoring {
  return game.hasScore ? 'score' : 'chrono';
}

/**
 * Where THIS server reaches jump-games, which is not always where a talent's
 * browser does. `JUMP_GAMES_URL` stays the public address: the iframe, the CSP
 * `frame-src` and the `postMessage` origin check all read it. The catalogue
 * fetch is server to server, and on a domain behind Cloudflare's bot challenge
 * the public address answers a pod with a 403 page, which is how prod lost its
 * catalogue. `JUMP_GAMES_INTERNAL_URL` names the in-cluster Service instead;
 * unset, the public address is used, as before.
 */
function gamesUrl(): string | null {
  const url = env.JUMP_GAMES_INTERNAL_URL || env.JUMP_GAMES_URL;
  return url ? url.replace(/\/$/, '') : null;
}

/**
 * Resolve the catalogue. Returns `[]` when no address is configured (see
 * `gamesUrl`) or the service is unreachable and nothing was ever cached:
 * callers must treat an empty catalogue as "no games available", never as an
 * error.
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
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const games = parseCatalog(await res.json());
    cache = { games, at: Date.now() };
    failedAt = null;
    return games;
  } catch (err) {
    console.error('[minigames] catalogue fetch failed:', err);
    failedAt = Date.now();
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

/**
 * A game's preview for the talent home, or null. The home asks on every load,
 * so within the retry window after a failed fetch it reads the stale snapshot
 * instead of waiting on jump-games again.
 */
export async function getCatalogPreview(name: string): Promise<string | null> {
  const backingOff =
    failedAt !== null && Date.now() - failedAt < RETRY_AFTER_FAILURE_MS;
  const games = backingOff ? (cache?.games ?? []) : await getGameCatalog();
  return games.find((g) => g.name === name)?.previewSrc ?? null;
}
