import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dynamicEnv: Record<string, string | undefined> = {};
vi.mock('$env/dynamic/private', () => ({ env: dynamicEnv }));

const { getGameCatalog } = await import('./minigameCatalog');

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
