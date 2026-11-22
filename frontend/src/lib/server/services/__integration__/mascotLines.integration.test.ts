/**
 * What EpiDuck says, written over the admin API (#539). Pinned here: a line is
 * refused before it could print a `{token}` nobody fills or overflow its bubble,
 * it keeps the moment it was created at, its window is a real one, and the
 * read hands back each line in the exact shape the write takes, so echoing a
 * read changes nothing.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { RequestEvent, RequestHandler } from '@sveltejs/kit';
import { prisma } from '#lib/server/db.ts';
import { assertTestDatabase } from './testDatabase';
import { createAdminAccount } from './adminApiAccount';
import { mintToken } from '#lib/server/adminApi/tokens.ts';
import { adminApiWrite } from '#lib/server/adminApi/route.ts';
import { getMascotLines } from '#lib/server/services/adminStats/configuration.ts';
import { MASCOT_LINE_MAX, MASCOT_MOMENT_KEYS } from '#lib/domain/mascot.ts';

const postLine = adminApiWrite('write_mascot_line');

/** Calls a handler the way SvelteKit would, with a bearer and a JSON body. */
async function call(
  handler: RequestHandler,
  secret: string,
  body: unknown,
): Promise<{ status: number; payload: Record<string, unknown> }> {
  const request = new Request('http://localhost/api/admin/write/x', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(body),
  });
  const response = await handler({
    request,
    url: new URL(request.url),
    locals: {} as App.Locals,
  } as RequestEvent);
  return { status: response.status, payload: await response.json() };
}

type LineState = {
  mascotLineId: string;
  moment: string;
  text: string;
  startsOn: string | null;
  endsOn: string | null;
  archived: boolean;
};

describe('write_mascot_line (integration)', () => {
  const stamp = Date.now();
  let adminUserId = '';
  let secret = '';
  const lineIds: string[] = [];

  beforeAll(async () => {
    assertTestDatabase();
    const admin = await createAdminAccount(`canard.${stamp}@epitech.eu`);
    adminUserId = admin.id;
    secret = (
      await mintToken(adminUserId, { label: 'Écriture', writeEnabled: true })
    ).secret;
  });

  afterAll(async () => {
    try {
      await prisma.mascot_Line.deleteMany({ where: { id: { in: lineIds } } });
      await prisma.adminApi_Call.deleteMany({
        where: { actorUserId: adminUserId },
      });
      await prisma.bauth_user.delete({ where: { id: adminUserId } });
    } catch {
      // ignore - the test database is disposable
    }
  });

  async function create(body: Record<string, unknown>): Promise<LineState> {
    const created = await call(postLine, secret, body);
    expect(created.status).toBe(200);
    const after = created.payload.after as LineState;
    lineIds.push(after.mascotLineId);
    return after;
  }

  it('creates a seasonal line, rewrites it, and archives it', async () => {
    const line = await create({
      moment: 'hello',
      text: `Joyeux Noël {prenom} ! ${stamp}`,
      startsOn: '2026-12-01',
      endsOn: '2026-12-24',
    });
    expect(line).toMatchObject({
      moment: 'hello',
      startsOn: '2026-12-01',
      endsOn: '2026-12-24',
      archived: false,
    });

    const rewritten = await call(postLine, secret, {
      mascotLineId: line.mascotLineId,
      text: `Bonnes fêtes {prenom} ! ${stamp}`,
      endsOn: null,
    });
    expect(rewritten.payload.after).toMatchObject({
      text: `Bonnes fêtes {prenom} ! ${stamp}`,
      startsOn: '2026-12-01',
      endsOn: null,
    });

    const archived = await call(postLine, secret, {
      mascotLineId: line.mascotLineId,
      archived: true,
    });
    expect(archived.payload.after).toMatchObject({ archived: true });
  });

  it('lists every moment, the silent ones too, and a line comes back as the write takes it', async () => {
    const line = await create({
      moment: 'away',
      text: `{jours} jours sans toi, {prenom} ! ${stamp}`,
    });
    const { moments } = await getMascotLines();
    expect(moments.value.map((m) => m.moment)).toEqual(MASCOT_MOMENT_KEYS);

    const away = moments.value.find((m) => m.moment === 'away')!;
    expect(away.tokens.map((t) => t.token)).toContain('jours');
    const read = away.lines.find((l) => l.mascotLineId === line.mascotLineId)!;

    const echoed = await call(postLine, secret, {
      ...read,
      moment: 'away',
    });
    expect(echoed.status).toBe(200);
    expect(echoed.payload.after).toEqual(echoed.payload.before);
  });

  it('refuses, in French, a token its moment does not offer, a text past the bubble, a moved line and a reversed window', async () => {
    const unknownToken = await call(postLine, secret, {
      moment: 'poke',
      text: '{jours} jours !',
    });
    expect(unknownToken.status).toBe(400);
    expect(String(unknownToken.payload.error)).toContain('{jours}');
    expect(String(unknownToken.payload.error)).toContain('{prenom}');

    const tooLong = await call(postLine, secret, {
      moment: 'poke',
      text: 'Coin '.repeat(MASCOT_LINE_MAX),
    });
    expect(tooLong.status).toBe(400);
    expect(String(tooLong.payload.error)).toContain(String(MASCOT_LINE_MAX));

    const line = await create({ moment: 'poke', text: `Coin ${stamp}` });
    const moved = await call(postLine, secret, {
      mascotLineId: line.mascotLineId,
      moment: 'wake',
    });
    expect(moved.status).toBe(400);
    expect(String(moved.payload.error)).toContain('archivez');

    const reversed = await call(postLine, secret, {
      mascotLineId: line.mascotLineId,
      startsOn: '2026-12-24',
      endsOn: '2026-12-01',
    });
    expect(reversed.status).toBe(400);

    const nothing = await call(postLine, secret, { text: 'Coin' });
    expect(nothing.status).toBe(400);
    expect(String(nothing.payload.error)).toContain('config_mascot_lines');
  });
});
