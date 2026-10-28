/**
 * A minigame board names other talents by peer name only.
 *
 * The rows used to carry each player's full surname and talent id, and only
 * the Svelte component cut the name to an initial, so the full name of every
 * ranked minor sat in the page data of any talent who opened the board
 * (security audit run-1). The board now leaves the server already reduced.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '$lib/server/db';
import { getCampusLeaderboard } from '$lib/server/services/minigameService';
import { assertTestDatabase } from './testDatabase';

describe('minigame leaderboard (integration)', () => {
  let publicationId = '';
  let viewerId = '';
  let peerId = '';

  beforeAll(async () => {
    assertTestDatabase();
    const publication = await prisma.minigamePublication.create({
      data: {
        game: 'board',
        gameName: 'Board',
        level: 1,
        scoringType: 'score',
      },
    });
    publicationId = publication.id;
    const viewer = await prisma.talent.create({
      data: { prenom: 'Camille', nom: 'Deschamps' },
    });
    const peer = await prisma.talent.create({
      data: { prenom: 'Inès', nom: 'Benali' },
    });
    viewerId = viewer.id;
    peerId = peer.id;
    for (const [talentId, score] of [
      [viewerId, 10],
      [peerId, 20],
    ] as const) {
      await prisma.minigameAttempt.create({
        data: {
          talentId,
          publicationId,
          status: 'done',
          valid: true,
          score,
          jti: randomUUID(),
          finishedAt: new Date(),
        },
      });
    }
  });

  afterAll(async () => {
    try {
      await prisma.minigameAttempt.deleteMany({ where: { publicationId } });
      await prisma.minigamePublication.deleteMany({
        where: { id: publicationId },
      });
      await prisma.talent.deleteMany({
        where: { id: { in: [viewerId, peerId] } },
      });
    } catch {
      // ignore - the test database is disposable
    }
  });

  it('sends a peer name and no surname or talent id', async () => {
    const { rows } = await getCampusLeaderboard(publicationId, null, viewerId);

    expect(rows.map((r) => [r.rank, r.displayName, r.isViewer])).toEqual([
      [1, 'Inès B.', false],
      [2, 'Camille D.', true],
    ]);
    const shipped = JSON.stringify(rows);
    expect(shipped).not.toContain('Benali');
    expect(shipped).not.toContain('Deschamps');
    expect(shipped).not.toContain(peerId);
  });
});
