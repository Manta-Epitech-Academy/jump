/**
 * Badges as data (#448), on a real database. Pinned here: `write_badge` says
 * how many talents a badge would reach before it awards it, then awards exactly
 * them, dated that day; its refusals say in French what to fix; a rule is fixed
 * once written; a visit counts as the rest of Jump counts it, on an event that
 * is over; a talent's own act awards on the spot (a game finished first, a run
 * of days) and the sweep awards the rest; an award outlives the counter going
 * back down and the badge being archived, and an archived badge reaches nobody.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { RequestEvent, RequestHandler } from '@sveltejs/kit';
import { prisma } from '#lib/server/db.ts';
import { fromWallClock } from '#lib/domain/planningTime.ts';
import { dateKeyToDbDate } from '#lib/domain/eventPresence.ts';
import { adminApiWrite } from '#lib/server/adminApi/route.ts';
import { mintToken } from '#lib/server/adminApi/tokens.ts';
import { getBadges } from '#lib/server/services/adminStats/configuration.ts';
import { getBadgeStickerPreview } from '#lib/server/services/badgeStickerPreview.ts';
import { awardDueBadges } from '#lib/server/services/badgeAwards.ts';
import { applyCallback } from '#lib/server/services/minigameService.ts';
import { recordSignInDay } from '#lib/server/services/signInStreak.ts';
import { createAdminAccount } from './adminApiAccount';
import { assertTestDatabase } from './testDatabase';

const postBadge = adminApiWrite('write_badge');

/** Calls a handler the way SvelteKit would, with a bearer and a JSON body. */
async function call(
  handler: RequestHandler,
  secret: string,
  body: unknown,
): Promise<{ status: number; payload: Record<string, unknown> }> {
  const request = new Request('http://localhost/api/admin/write/badge', {
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

const stamp = Date.now();
const TZ = 'Europe/Paris';
const at = (day: string) => fromWallClock(day, '00:00', TZ);

/** A badge's drawing, the same for every badge here. */
const DISC =
  '<circle cx="40" cy="40" r="36" fill="#013afb" stroke="#ffffff" stroke-width="5"></circle>';

/** A badge's family and drawing, the same for every badge here. */
const look = { group: 'parcours', art: DISC };

describe('badges (integration)', () => {
  let adminUserId = '';
  let secret = '';
  let campusId = '';
  const categoryKey = `bdg-club-${stamp}`;
  const eventIds: Record<
    'march' | 'april' | 'nocategory' | 'upcoming',
    string
  > = { march: '', april: '', nocategory: '', upcoming: '' };
  const talent = { regular: '', once: '', runner: '', player: '' };
  const badgeKeys: string[] = [];
  const publicationGame = `bdg-game-${stamp}`;

  /** A badge written directly, for the tests about awarding rather than authoring. */
  async function badge(
    key: string,
    rule: { counterKey: string; threshold: number },
  ): Promise<string> {
    const badgeKey = `${key}-${stamp}`;
    badgeKeys.push(badgeKey);
    await prisma.badge_Definition.create({
      data: {
        key: badgeKey,
        label: `${key} ${stamp}`,
        condition: 'Test',
        groupKey: 'wtf',
        art: DISC,
        ...rule,
      },
    });
    return badgeKey;
  }

  const awardsOf = (badgeKey: string) =>
    prisma.badge_Award.findMany({
      where: { badgeKey },
      select: { talentId: true, awardedAt: true },
      orderBy: { talentId: 'asc' },
    });

  beforeAll(async () => {
    assertTestDatabase();
    const admin = await createAdminAccount(`badges.${stamp}@epitech.eu`);
    adminUserId = admin.id;
    secret = (
      await mintToken(adminUserId, { label: 'Badges', writeEnabled: true })
    ).secret;

    campusId = (
      await prisma.campus.create({
        data: { name: `Badges Campus ${stamp}`, timezone: TZ },
      })
    ).id;
    await prisma.eventConfig_Category.create({
      data: { key: categoryKey, label: `Club ${stamp}`, color: '#013afb' },
    });
    const event = async (
      day: string,
      category: string | null,
    ): Promise<string> =>
      (
        await prisma.event.create({
          data: {
            titre: `Badges ${day} ${stamp}`,
            date: at(day),
            campusId,
            categoryKey: category,
            devActivatedAt: new Date(),
            modules: { create: { moduleKey: 'inscrits' } },
          },
        })
      ).id;
    eventIds.march = await event('2026-03-04', categoryKey);
    eventIds.april = await event('2026-04-01', categoryKey);
    eventIds.nocategory = await event('2026-03-11', null);
    eventIds.upcoming = await event('2099-06-03', categoryKey);

    for (const key of Object.keys(talent) as (keyof typeof talent)[]) {
      talent[key] = (
        await prisma.talent.create({ data: { prenom: 'Badge', nom: key } })
      ).id;
    }
    // The projections the dev space reads, as their writers leave them: shown
    // in the dev space, and attested where a proof exists.
    const enrol = (talentId: string, eventId: string, came: boolean) =>
      prisma.participation.create({
        data: {
          talentId,
          eventId,
          campusId,
          shownInDevSpace: true,
          attendanceAttested: came,
        },
      });
    await enrol(talent.regular, eventIds.march, true);
    await enrol(talent.regular, eventIds.april, true);
    await enrol(talent.regular, eventIds.nocategory, true);
    await enrol(talent.once, eventIds.march, true);
    // Attested, but the event has not happened: not a visit yet.
    await enrol(talent.once, eventIds.upcoming, true);
  });

  afterAll(async () => {
    try {
      await prisma.badge_Award.deleteMany({
        where: { badgeKey: { in: badgeKeys } },
      });
      await prisma.badge_Definition.deleteMany({
        where: { key: { in: badgeKeys } },
      });
      await prisma.minigameAttempt.deleteMany({
        where: { publication: { game: publicationGame } },
      });
      await prisma.minigamePublication.deleteMany({
        where: { game: publicationGame },
      });
      await prisma.xpGrant.deleteMany({
        where: { talentId: { in: Object.values(talent) } },
      });
      await prisma.participation.deleteMany({ where: { campusId } });
      await prisma.event.deleteMany({ where: { campusId } });
      await prisma.eventConfig_Category.deleteMany({
        where: { key: categoryKey },
      });
      await prisma.talent.deleteMany({
        where: { id: { in: Object.values(talent) } },
      });
      await prisma.campus.deleteMany({ where: { id: campusId } });
      await prisma.adminApi_Call.deleteMany({
        where: { actorUserId: adminUserId },
      });
      await prisma.bauth_user.delete({ where: { id: adminUserId } });
    } catch {
      // ignore - the test database is disposable
    }
  });

  it('counts who would receive a badge, then awards exactly them, dated that day', async () => {
    const badgeKey = `bdg-addict-${stamp}`;
    badgeKeys.push(badgeKey);
    const body = {
      badgeKey,
      label: `Addict ${stamp}`,
      condition: 'A participé à 2 Coding Clubs',
      ...look,
      counter: 'attended',
      threshold: 2,
      categoryKeys: [categoryKey],
    };

    const dryRun = await call(postBadge, secret, body);
    expect(dryRun.status).toBe(200);
    expect(dryRun.payload.applied).toBe(false);
    const plan = dryRun.payload.plan as {
      newHolders: { value: number; definition: string };
    };
    // The regular came to both club events; the other came to one, and is
    // enrolled on a club that has not happened yet.
    expect(plan.newHolders.value).toBe(1);
    expect(plan.newHolders.definition).toContain('datés de ce jour');
    expect(
      await prisma.badge_Definition.count({ where: { key: badgeKey } }),
    ).toBe(0);

    const applied = await call(postBadge, secret, {
      ...body,
      planDigest: dryRun.payload.planDigest,
    });
    expect(applied.status).toBe(200);
    expect(applied.payload.applied).toBe(true);
    // A receipt without the drawing the caller has just sent, and the link to
    // see it, which is what it needs next.
    expect(applied.payload.after).not.toHaveProperty('art');
    expect(applied.payload.apercu).toContain(
      `/api/admin/config/badge-preview?badgeKey=${badgeKey}`,
    );
    const awards = await awardsOf(badgeKey);
    expect(awards.map((a) => a.talentId)).toEqual([talent.regular]);
    expect(Date.now() - awards[0].awardedAt.getTime()).toBeLessThan(60_000);

    // The catalogue lists it without its drawing; read by its key, it comes
    // back in the shape the write takes, drawing included, with its holders,
    // and sent back as read, nothing moves.
    const listed = (await getBadges()).badges.value.find(
      (b) => b.badgeKey === badgeKey,
    )!;
    expect(listed).not.toHaveProperty('art');
    const [read] = (await getBadges({ badgeKey })).badges.value;
    expect(read).toMatchObject({
      art: DISC,
      counter: 'attended',
      categoryKeys: [categoryKey],
      eventIds: [],
      periodFrom: null,
      holders: 1,
    });
    const { holders: _holders, ...echo } = read;
    const echoed = await call(postBadge, secret, echo);
    expect(echoed.status).toBe(200);
    expect(
      (echoed.payload.plan as { newHolders: { value: number } }).newHolders
        .value,
    ).toBe(0);
  });

  it('keeps counting on a category once it is archived, and the sweep awards it', async () => {
    const badgeKey = await badge('bdg-archived-category', {
      counterKey: 'attended',
      threshold: 2,
    });
    await prisma.badge_RuleCategory.create({ data: { badgeKey, categoryKey } });
    await prisma.eventConfig_Category.update({
      where: { key: categoryKey },
      data: { archivedAt: new Date() },
    });
    // The talent who came once comes to the April club: the staff's émargement,
    // which no act of the talent writes, so the sweep is what awards it.
    await prisma.participation.create({
      data: {
        talentId: talent.once,
        eventId: eventIds.april,
        campusId,
        shownInDevSpace: true,
        attendanceAttested: true,
      },
    });
    await awardDueBadges(prisma, {
      now: new Date(),
      talentIds: [talent.regular, talent.once],
    });
    expect((await awardsOf(badgeKey)).map((a) => a.talentId).sort()).toEqual(
      [talent.regular, talent.once].sort(),
    );
    await prisma.eventConfig_Category.update({
      where: { key: categoryKey },
      data: { archivedAt: null },
    });
  });

  it("reads a period on the event's first day, in its campus", async () => {
    const badgeKey = await badge('bdg-march', {
      counterKey: 'attended',
      threshold: 2,
    });
    await prisma.badge_Definition.update({
      where: { key: badgeKey },
      data: {
        periodFrom: dateKeyToDbDate('2026-03-01'),
        periodTo: dateKeyToDbDate('2026-03-31'),
      },
    });
    await awardDueBadges(prisma, {
      now: new Date(),
      badgeKeys: [badgeKey],
      talentIds: [talent.regular, talent.once],
    });
    // The regular came to two events in March (the club and the uncategorised
    // one); the April club, at Paris midnight on 1 April, is outside.
    expect((await awardsOf(badgeKey)).map((a) => a.talentId)).toEqual([
      talent.regular,
    ]);
  });

  it('refuses in French what cannot be written, and says what to fix', async () => {
    const refused = async (body: Record<string, unknown>) => {
      const { status, payload } = await call(postBadge, secret, {
        badgeKey: `bdg-refused-${stamp}`,
        label: `Refusé ${stamp}`,
        condition: 'Test',
        ...look,
        threshold: 1,
        ...body,
      });
      expect(status).toBe(400);
      return String(payload.error);
    };

    expect(await refused({ counter: 'logins' })).toContain(
      "Le compteur « logins » n'existe pas",
    );
    expect(
      await refused({ counter: 'attended', domains: ['cyber'] }),
    ).toContain('ne se filtre pas par domaines');
    expect(
      await refused({ counter: 'enrolments', categoryKeys: ['no-such-kind'] }),
    ).toContain('Catégorie introuvable : no-such-kind');
    const missing = await call(postBadge, secret, {
      badgeKey: `bdg-incomplete-${stamp}`,
      label: 'Incomplet',
    });
    expect(String(missing.payload.error)).toContain('pour le créer');

    // A written rule stays the rule its holders met.
    const fixed = await call(postBadge, secret, {
      badgeKey: `bdg-addict-${stamp}`,
      threshold: 5,
    });
    expect(fixed.status).toBe(400);
    expect(String(fixed.payload.error)).toContain('ne change plus');
  });

  // A drawing lands in talents' pages with nothing behind it to contain a
  // script, so the write refuses one before it counts anybody, and names it.
  it('refuses a drawing that could run in a talent page, before any dry run', async () => {
    const badgeKey = `bdg-script-${stamp}`;
    const { status, payload } = await call(postBadge, secret, {
      badgeKey,
      label: `Script ${stamp}`,
      condition: 'Test',
      group: 'wtf',
      art: `${DISC}<circle r="4" onclick="alert(1)"></circle>`,
      counter: 'xp',
      threshold: 1,
    });
    expect(status).toBe(400);
    expect(String(payload.error)).toContain('onclick');
    expect(
      await prisma.badge_Definition.count({ where: { key: badgeKey } }),
    ).toBe(0);
  });

  // How a badge is drawn before anybody receives it: created archived, it is
  // awarded to nobody, previewed, redrawn, and unarchiving it is what counts
  // and awards its holders.
  it('drafts a badge archived, previews it, then awards it on unarchiving', async () => {
    const badgeKey = `bdg-draft-${stamp}`;
    badgeKeys.push(badgeKey);
    const draft = {
      badgeKey,
      label: `Brouillon ${stamp}`,
      condition: 'A participé à 2 Coding Clubs',
      group: 'succes',
      art: DISC,
      counter: 'attended',
      threshold: 2,
      categoryKeys: [categoryKey],
      archived: true,
    };
    const dry = await call(postBadge, secret, draft);
    expect(
      (dry.payload.plan as { newHolders: { value: number } }).newHolders.value,
    ).toBe(0);
    await call(postBadge, secret, {
      ...draft,
      planDigest: dry.payload.planDigest,
    });
    expect(await awardsOf(badgeKey)).toEqual([]);

    const preview = await getBadgeStickerPreview({
      badgeKey,
      origin: 'https://jump.example',
    });
    const bytes = Buffer.from(preview.image.base64, 'base64');
    expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([
      preview.widthPx,
      preview.heightPx,
    ]);
    expect(preview.apercu).toContain(
      `https://jump.example/api/admin/config/badge-preview?badgeKey=${badgeKey}`,
    );

    // Redrawn while archived: still nobody receives it.
    const redraw = {
      badgeKey,
      art: `${DISC}<text x="40" y="48" text-anchor="middle" fill="#ffffff" font-family="Anton" font-size="24">1</text>`,
    };
    const redrawn = await call(postBadge, secret, redraw);
    await call(postBadge, secret, {
      ...redraw,
      planDigest: redrawn.payload.planDigest,
    });
    expect(await awardsOf(badgeKey)).toEqual([]);

    // Both talents who came to two clubs by now (the one who came once came
    // to the April club in an earlier test).
    const live = await call(postBadge, secret, { badgeKey, archived: false });
    expect(
      (live.payload.plan as { newHolders: { value: number } }).newHolders.value,
    ).toBe(2);
    await call(postBadge, secret, {
      badgeKey,
      archived: false,
      planDigest: live.payload.planDigest,
    });
    expect((await awardsOf(badgeKey)).map((a) => a.talentId).sort()).toEqual(
      [talent.regular, talent.once].sort(),
    );
  });

  it('awards a run of days on the day it is reached, and keeps it when the run restarts', async () => {
    const badgeKey = await badge('bdg-streak', {
      counterKey: 'signInStreak',
      threshold: 2,
    });
    const now = new Date('2026-11-26T10:00:00Z');
    await prisma.talent.update({
      where: { id: talent.runner },
      data: { streakDays: 1, streakLastDay: dateKeyToDbDate('2026-11-25') },
    });
    await recordSignInDay(
      { id: talent.runner, streakLastDay: dateKeyToDbDate('2026-11-25') },
      TZ,
      now,
    );
    const [award] = await awardsOf(badgeKey);
    expect(award).toEqual({ talentId: talent.runner, awardedAt: now });

    // Three days away: the run starts again at 1, the badge stays, with its day.
    const later = new Date('2026-11-30T10:00:00Z');
    await recordSignInDay(
      { id: talent.runner, streakLastDay: dateKeyToDbDate('2026-11-26') },
      TZ,
      later,
    );
    expect(
      (await prisma.talent.findUniqueOrThrow({ where: { id: talent.runner } }))
        .streakDays,
    ).toBe(1);
    expect(await awardsOf(badgeKey)).toEqual([award]);

    // Archived over the API, then swept: it stays with those who earned it.
    const archive = { badgeKey, archived: true };
    const dryRun = await call(postBadge, secret, archive);
    const archived = await call(postBadge, secret, {
      ...archive,
      planDigest: dryRun.payload.planDigest,
    });
    expect(archived.payload.applied).toBe(true);
    await awardDueBadges(prisma, { now: later, talentIds: [talent.runner] });
    expect(await awardsOf(badgeKey)).toEqual([award]);
  });

  it('awards a first place with the game that won it, and an archived badge to nobody', async () => {
    const firsts = await badge('bdg-first', {
      counterKey: 'dailyFirstPlaces',
      threshold: 1,
    });
    const archived = await badge('bdg-archived-xp', {
      counterKey: 'xp',
      threshold: 1,
    });
    await prisma.badge_Definition.update({
      where: { key: archived },
      data: { archivedAt: new Date() },
    });
    const publication = await prisma.minigamePublication.create({
      data: {
        game: publicationGame,
        gameName: 'Badges',
        level: 1,
        scoringType: 'score',
      },
    });
    await prisma.minigameAttempt.create({
      data: {
        talentId: talent.player,
        publicationId: publication.id,
        status: 'pending',
        jti: randomUUID(),
      },
    });

    await applyCallback({
      playerId: talent.player,
      game: publicationGame,
      level: 1,
      score: 42,
      chrono: 30,
      valid: true,
    });

    const attempt = await prisma.minigameAttempt.findFirstOrThrow({
      where: { talentId: talent.player, publicationId: publication.id },
    });
    expect(attempt.rankAtFinish).toBe(1);
    expect((await awardsOf(firsts)).map((a) => a.talentId)).toEqual([
      talent.player,
    ]);
    // The game's XP reached the archived badge's threshold: nobody earns it.
    expect(await awardsOf(archived)).toEqual([]);
  });

  it('removes a badge nobody holds, freeing its key, and refuses one somebody holds', async () => {
    const badgeKey = `bdg-halloween-${stamp}`;
    badgeKeys.push(badgeKey);
    const body = {
      badgeKey,
      label: `Halloween ${stamp}`,
      condition: 'A fait le camp à venir',
      ...look,
      counter: 'attended',
      threshold: 1,
      eventIds: [eventIds.upcoming],
    };
    const twoStep = async (payload: Record<string, unknown>) => {
      const dryRun = await call(postBadge, secret, payload);
      expect(dryRun.status).toBe(200);
      return call(postBadge, secret, {
        ...payload,
        planDigest: dryRun.payload.planDigest,
      });
    };
    expect((await twoStep(body)).status).toBe(200);

    // A rule written wrong on an event to come: nobody can hold it yet, so the
    // refusal points at the removal rather than at a new name.
    const fixed = await call(postBadge, secret, { badgeKey, threshold: 2 });
    expect(String(fixed.payload.error)).toContain('supprimez-le (remove)');

    const removed = await twoStep({ badgeKey, remove: true });
    expect(removed.status).toBe(200);
    expect(removed.payload.after).toBeNull();
    expect(
      await prisma.badge_Definition.count({ where: { key: badgeKey } }),
    ).toBe(0);
    // Written again under the same key and label, with the right rule.
    expect((await twoStep({ ...body, threshold: 2 })).status).toBe(200);

    const held = await call(postBadge, secret, {
      badgeKey: `bdg-addict-${stamp}`,
      remove: true,
    });
    expect(held.status).toBe(400);
    expect(String(held.payload.error)).toContain('ne peut pas être supprimé');
    expect(
      await prisma.badge_Definition.count({
        where: { key: `bdg-addict-${stamp}` },
      }),
    ).toBe(1);
  });
});
