import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dynamicEnv: Record<string, string | undefined> = {};
// Getters, so each test's writes to `dynamicEnv` reach the module's imports.
vi.mock('$app/env/private', () => ({
  get JUMP_GAMES_URL() {
    return dynamicEnv.JUMP_GAMES_URL;
  },
  get JUMP_GAMES_INTERNAL_URL() {
    return dynamicEnv.JUMP_GAMES_INTERNAL_URL;
  },
}));

const { getCatalogPreview, getGameCatalog, parseCatalog } =
  await import('./minigameCatalog');

const fetchMock = vi.fn();

beforeEach(() => {
  for (const key of Object.keys(dynamicEnv)) delete dynamicEnv[key];
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ games: [] }), { status: 200 }),
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="88" height="88" viewBox="0 0 88 88"><rect width="88" height="88" fill="#0f172a"/></svg>';

function entry(overrides: Record<string, unknown> = {}) {
  return {
    name: 'queens',
    displayName: 'Queens',
    description: 'Placer une couronne par région colorée.',
    difficulty: 'medium',
    hasScore: false,
    endMode: 'puzzle',
    levelCount: 200,
    preview: SVG,
    ...overrides,
  };
}

// The talent's training card shows the day's game preview through an <img>,
// so what reaches it must be an SVG data URI or nothing at all: never a broken
// image, never markup from another service inlined into the page.
describe('parseCatalog', () => {
  it('turns a preview into a data URI an <img> can show', () => {
    const [game] = parseCatalog({ games: [entry()] });

    expect(game.previewSrc).toMatch(/^data:image\/svg\+xml,/);
    expect(
      decodeURIComponent(game.previewSrc!.slice('data:image/svg+xml,'.length)),
    ).toBe(SVG);
  });

  it.each([
    ['missing', undefined],
    ['not SVG', '<img src="https://example.com/x.png">'],
    ['over 16 KB', `<svg>${'<rect/>'.repeat(3000)}</svg>`],
    ['not a string', 42],
  ])('keeps the game without a preview when it is %s', (_, preview) => {
    const [game] = parseCatalog({ games: [entry({ preview })] });

    expect(game.name).toBe('queens');
    expect(game.previewSrc).toBeNull();
  });

  // An entry the rotation cannot trust must not reach it: a publication of a
  // game with no slug or no level count would hand talents a level that
  // cannot load.
  it('leaves out an entry jump cannot trust and keeps the others', () => {
    const games = parseCatalog({
      games: [
        entry({ name: '' }),
        entry({ name: 'zip', levelCount: 'many' }),
        entry({ name: 'tango' }),
      ],
    });

    expect(games.map((g) => g.name)).toEqual(['tango']);
  });

  // Left out, a game with no level yet would read on the admin page as one
  // jump-games removed, its rotation config offered for deletion.
  it('keeps a game that has no level yet', () => {
    const [game] = parseCatalog({ games: [entry({ levelCount: 0 })] });

    expect(game.levelCount).toBe(0);
  });
});

// #416: prod's public JUMP_GAMES_URL sits behind Cloudflare's bot challenge,
// which answers a pod with a 403 page and emptied the admin catalogue. The
// fetch has to be able to take the in-cluster address while the browser keeps
// the public one.
describe('getGameCatalog', () => {
  it('fetches from JUMP_GAMES_INTERNAL_URL when it is set', async () => {
    dynamicEnv.JUMP_GAMES_URL = 'https://jump-games.epiboost.fr';
    dynamicEnv.JUMP_GAMES_INTERNAL_URL =
      'http://jump-game-service.jump-game-prod.svc.cluster.local:3000/';

    await getGameCatalog({ force: true });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://jump-game-service.jump-game-prod.svc.cluster.local:3000/api/games',
      expect.anything(),
    );
  });

  it('falls back to JUMP_GAMES_URL when the internal address is empty', async () => {
    dynamicEnv.JUMP_GAMES_URL = 'https://games.jump-dev.epiboost.eu';
    dynamicEnv.JUMP_GAMES_INTERNAL_URL = '';

    await getGameCatalog({ force: true });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://games.jump-dev.epiboost.eu/api/games',
      expect.anything(),
    );
  });

  // Every caller awaits the catalogue: a hung jump-games must cost a bounded
  // wait. The admin page and the cron then ask again on their next call: a
  // failure on the talent home must not cost the day's publication.
  it('bounds the fetch and asks again right after a failure', async () => {
    dynamicEnv.JUMP_GAMES_URL = 'https://jump-games.epiboost.fr';
    await seedCatalog();

    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    vi.setSystemTime(new Date('2026-11-19T08:10:00Z'));
    fetchMock.mockRejectedValueOnce(
      new DOMException('timed out', 'TimeoutError'),
    );
    const stale = await getGameCatalog();
    expect(stale.map((g) => g.name)).toEqual(['queens']);

    vi.setSystemTime(new Date('2026-11-19T08:10:05Z'));
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ games: [entry({ name: 'tango' })] }), {
        status: 200,
      }),
    );
    const fresh = await getGameCatalog();
    expect(fresh.map((g) => g.name)).toEqual(['tango']);
  });

  // A body none of whose entries jump can read is a broken contract, not a
  // catalogue that emptied: cached, it would skip the day's publication.
  it('keeps the last good list when no entry of a fresh body is readable', async () => {
    dynamicEnv.JUMP_GAMES_URL = 'https://jump-games.epiboost.fr';
    await seedCatalog();

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ games: [{ slug: 'queens' }] }), {
        status: 200,
      }),
    );
    const games = await getGameCatalog({ force: true });
    expect(games.map((g) => g.name)).toEqual(['queens']);
  });
});

// The talent home asks on every load, for a picture: after a failure it must
// not wait on jump-games again on each one.
describe('getCatalogPreview', () => {
  it('serves the stale preview for a while after a failure', async () => {
    dynamicEnv.JUMP_GAMES_URL = 'https://jump-games.epiboost.fr';
    await seedCatalog();

    // The cached list has expired and jump-games now times out.
    vi.setSystemTime(new Date('2026-11-19T08:10:00Z'));
    fetchMock.mockRejectedValue(new DOMException('timed out', 'TimeoutError'));
    expect(await getCatalogPreview('queens')).toMatch(/^data:image\/svg\+xml,/);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Within the retry window, no new request: the stale list answers.
    vi.setSystemTime(new Date('2026-11-19T08:10:20Z'));
    expect(await getCatalogPreview('queens')).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Past it, jump-games is asked again.
    vi.setSystemTime(new Date('2026-11-19T08:11:00Z'));
    await getCatalogPreview('queens');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('is null for a game the catalogue does not hold', async () => {
    dynamicEnv.JUMP_GAMES_URL = 'https://jump-games.epiboost.fr';
    await seedCatalog();

    expect(await getCatalogPreview('zip')).toBeNull();
  });
});

/** A good catalogue holding Queens, fetched at 08:00, with `Date` faked. */
async function seedCatalog() {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-19T08:00:00Z'));
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ games: [entry()] }), { status: 200 }),
  );
  await getGameCatalog({ force: true });
}
