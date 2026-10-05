/**
 * What a campus puts on its talents' home, from the write that sets it to the
 * home that shows it.
 *
 * The writes go through the wrapper, as in `adminApiWrites.integration.test.ts`,
 * so the refusals are the ones a caller actually receives and the audit row is
 * the one that makes « remettre l'ancien texte » possible.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { RequestEvent, RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { assertTestDatabase } from './testDatabase';
import { createAdminAccount } from './adminApiAccount';
import { mintToken } from '$lib/server/adminApi/tokens';
import { adminApiRead, adminApiWrite } from '$lib/server/adminApi/route';
import { writeTalentHomeHighlight } from '$lib/server/adminApi/writes/talentHome';
import { getTalentHome } from '$lib/server/services/talentHomeService';
import { toDateKey } from '$lib/domain/planningTime';

const postNote = adminApiWrite('write_talent_home_note');
const postHighlight = adminApiWrite('write_talent_home_highlight');
const getContent = adminApiRead('config_talent_home');

async function post(
  handler: RequestHandler,
  secret: string,
  body: unknown,
): Promise<{ status: number; payload: Record<string, unknown> }> {
  const request = new Request('http://localhost/api/admin/write/talent-home', {
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

async function read(
  secret: string,
  query: string,
): Promise<Record<string, unknown>> {
  const request = new Request(
    `http://localhost/api/admin/config/talent-home?${query}`,
    { headers: { authorization: `Bearer ${secret}` } },
  );
  const response = await getContent({
    request,
    url: new URL(request.url),
    locals: {} as App.Locals,
  } as RequestEvent);
  return response.json();
}

/** The day `offset` days from today, as the API takes it. */
const dayFromToday = (offset: number) =>
  toDateKey(new Date(Date.now() + offset * 86_400_000), 'Europe/Paris');

describe('the campus content on a talent’s home (integration)', () => {
  const stamp = Date.now();
  const campusName = `HomeCampus-${stamp}`;
  let adminUserId = '';
  let secret = '';
  let campusId = '';

  const highlight = {
    campus: campusName,
    title: 'Recode le jeu Snake en JS',
    summary: 'Deux heures pour coder ton propre Snake.',
    date: dayFromToday(10),
    url: 'https://www.epitech.invalid/inscription-atelier-programmation-informatique/?CampaignId=701Sm00000xAuQMIA0',
  };

  beforeAll(async () => {
    assertTestDatabase();
    const admin = await createAdminAccount(`home.admin.${stamp}@epitech.eu`);
    adminUserId = admin.id;
    secret = (
      await mintToken(adminUserId, { label: 'Écriture', writeEnabled: true })
    ).secret;
    campusId = (
      await prisma.campus.create({
        data: { name: campusName, timezone: 'Europe/Paris' },
      })
    ).id;
  });

  afterAll(async () => {
    try {
      await prisma.adminApi_Call.deleteMany({
        where: { actorUserId: adminUserId },
      });
      await prisma.campus.deleteMany({ where: { id: campusId } });
      await prisma.bauth_user.delete({ where: { id: adminUserId } });
    } catch {
      // ignore - the test database is disposable
    }
  });

  it('sets the note, and repeating it changes nothing', async () => {
    const body = {
      campus: campusName,
      markdown:
        '## Bonne rentrée\n\nRejoins [le Discord](https://discord.gg/x).',
    };
    const first = await post(postNote, secret, body);
    expect(first.status).toBe(200);
    expect(first.payload.before).toBeNull();
    expect(first.payload.after).toEqual({
      campus: campusName,
      markdown: body.markdown,
    });

    const again = await post(postNote, secret, body);
    expect(again.payload.before).toEqual(again.payload.after);

    const audit = await prisma.adminApi_Call.findFirst({
      where: { actorUserId: adminUserId, operation: 'write_talent_home_note' },
      orderBy: { createdAt: 'asc' },
    });
    expect(audit?.after).toMatchObject({ markdown: body.markdown });
  });

  it('refuses a note carrying an image or HTML, and keeps the previous one', async () => {
    for (const markdown of [
      '![affiche](https://tracker.example/a.png)',
      '<script>alert(1)</script>',
    ]) {
      const { status } = await post(postNote, secret, {
        campus: campusName,
        markdown,
      });
      expect(status).toBe(400);
    }
    expect(
      (await prisma.talentHome_Note.findUnique({ where: { campusId } }))
        ?.markdown,
    ).toContain('Bonne rentrée');
  });

  it('refuses an unknown campus by naming the ones that exist', async () => {
    const { status, payload } = await post(postNote, secret, {
      campus: 'Atlantide',
      markdown: 'Salut',
    });
    expect(status).toBe(400);
    expect(String(payload.error)).toContain(campusName);
  });

  it('sets the highlight, and refuses an http link, a past day or a half-filled one', async () => {
    const set = await post(postHighlight, secret, highlight);
    expect(set.status).toBe(200);
    expect(set.payload.after).toEqual(highlight);

    for (const body of [
      { ...highlight, url: 'http://www.epitech.invalid/form' },
      { ...highlight, date: dayFromToday(-1) },
      { ...highlight, url: null },
      { ...highlight, summary: 'x'.repeat(301) },
    ]) {
      const { status } = await post(postHighlight, secret, body);
      expect(status).toBe(400);
    }
  });

  it('shows the rendered note and the open highlight on the campus home', async () => {
    const home = await getTalentHome(campusId);
    expect(home.note).toContain('<h2>Bonne rentrée</h2>');
    expect(home.note).toContain('rel="noopener noreferrer"');
    expect(home.highlight).toEqual({
      title: highlight.title,
      summary: highlight.summary,
      date: highlight.date,
      url: highlight.url,
    });
  });

  it('stops showing the highlight once its day has passed', async () => {
    const afterTheDay = new Date(Date.now() + 12 * 86_400_000);
    expect((await getTalentHome(campusId, afterTheDay)).highlight).toBeNull();

    // Still before its day by the real clock, so the admin read says shown.
    const payload = await read(
      secret,
      `campus=${encodeURIComponent(campusName)}`,
    );
    const [row] = (payload.campuses as { value: { highlight: unknown }[] })
      .value;
    expect(row?.highlight).toMatchObject({ shown: true });
  });

  it('refuses a day already past on the campus clock', async () => {
    const tomorrowMorning = new Date(
      new Date(`${highlight.date}T00:00:00Z`).getTime() + 86_400_000,
    );
    await expect(
      writeTalentHomeHighlight(highlight, tomorrowMorning),
    ).rejects.toThrow(/déjà passé/);
  });

  it('clears both blocks with nulls', async () => {
    await post(postNote, secret, { campus: campusName, markdown: null });
    const cleared = await post(postHighlight, secret, {
      campus: campusName,
      title: null,
      summary: null,
      date: null,
      url: null,
    });
    expect(cleared.status).toBe(200);
    expect(cleared.payload.after).toBeNull();
    expect(await getTalentHome(campusId)).toEqual({
      note: null,
      highlight: null,
    });
  });

  it('gives a talent with no campus nothing', async () => {
    expect(await getTalentHome(null)).toEqual({ note: null, highlight: null });
  });
});
