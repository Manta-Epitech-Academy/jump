import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dynamicEnv: Record<string, string | undefined> = {};
vi.mock('$env/dynamic/private', () => ({ env: dynamicEnv }));

const { getGameCatalog, parseCatalog } = await import('./minigameCatalog');

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
});
