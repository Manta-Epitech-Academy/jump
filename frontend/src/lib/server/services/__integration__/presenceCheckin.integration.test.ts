import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { prisma } from '$lib/server/db';
import { EVENT_MODULES } from '$lib/domain/eventModules';
import { dateKeyToDbDate, toDateKey } from '$lib/domain/eventPresence';
import { assertTestDatabase } from './testDatabase';

// The token's signature is not what is under test: it decodes to the créneau it
// names, so each case below is about what the scan does with a valid one.
vi.mock('$lib/server/presence/checkinToken', () => ({
  verifyCheckinToken: async (token: string) => JSON.parse(token),
}));

const { load } =
  await import('../../../../routes/(talent)/presence/[token]/+page.server');

/**
 * A talent scanning the émargement code writes on the sheet the émargement page
 * shows, so the scan follows that sheet. The section has to be on, since a code
 * minted before it was switched off is dead, and the talent has to be on the
 * roster the dev space lists: a masked enrolment (withdrawn in Salesforce, say)
 * would otherwise leave a mark no staff member can see on the sheet or correct.
 */
describe('a talent scanning the émargement code (integration)', () => {
  const stamp = Date.now();
  const tz = 'Europe/Paris';
  let campusId = '';
  const eventIds: string[] = [];
  const talents: { id: string; prenom: string }[] = [];

  // A Monday a few weeks out, so the morning créneau is open whatever the day
  // the suite runs on.
  const monday = new Date();
  monday.setUTCDate(monday.getUTCDate() + 21 + ((8 - monday.getUTCDay()) % 7));
  monday.setUTCHours(7, 0, 0, 0);
  const day = toDateKey(monday, tz);

  async function eventWith(modules: string[]) {
    const event = await prisma.event.create({
      data: {
        titre: `Scan ${stamp}`,
        campusId,
        date: monday,
        modules: { create: modules.map((moduleKey) => ({ moduleKey })) },
      },
    });
    eventIds.push(event.id);
    return event.id;
  }

  async function talentOn(eventId: string, shown: boolean) {
    const talent = await prisma.talent.create({
      data: { prenom: 'Lou', nom: shown ? 'Inscrite' : 'Masquée' },
      select: { id: true, prenom: true },
    });
    talents.push(talent);
    await prisma.participation.create({
      data: {
        talentId: talent.id,
        eventId,
        campusId,
        sfMemberStatus: shown ? 'READY' : 'DESISTED',
        shownInDevSpace: shown,
      },
    });
    return talent;
  }

  async function scan(talent: { id: string; prenom: string }, eventId: string) {
    const result = (await load({
      params: {
        token: JSON.stringify({ eventId, day, slot: 'morning' }),
      },
      locals: { talent },
    } as unknown as Parameters<typeof load>[0])) as { state: string };
    const marks = await prisma.eventPresence.count({
      where: { talentId: talent.id, eventId, day: dateKeyToDbDate(day) },
    });
    return { state: result.state, marks };
  }

  beforeAll(async () => {
    assertTestDatabase();
    campusId = (
      await prisma.campus.create({
        data: { name: `Scan Campus ${stamp}`, timezone: tz },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.talent.deleteMany({
      where: { id: { in: talents.map((t) => t.id) } },
    });
    await prisma.campus.deleteMany({ where: { id: campusId } });
  });

  it('marks a talent the sheet lists present', async () => {
    const eventId = await eventWith([EVENT_MODULES.EMARGEMENT]);
    const talent = await talentOn(eventId, true);
    expect(await scan(talent, eventId)).toEqual({ state: 'present', marks: 1 });
  });

  it('turns away a talent whose enrolment the dev space masks', async () => {
    const eventId = await eventWith([EVENT_MODULES.EMARGEMENT]);
    const talent = await talentOn(eventId, false);
    expect(await scan(talent, eventId)).toEqual({
      state: 'not_registered',
      marks: 0,
    });
  });

  it('reads a code as dead once the event has its émargement off', async () => {
    const eventId = await eventWith([EVENT_MODULES.INSCRITS]);
    const talent = await talentOn(eventId, true);
    expect(await scan(talent, eventId)).toEqual({ state: 'invalid', marks: 0 });
  });
});
