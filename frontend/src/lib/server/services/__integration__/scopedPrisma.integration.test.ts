import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '#lib/server/db.ts';
import { scopedPrisma } from '#lib/server/db/scoped.ts';
import { CampusScopeViolation } from '#lib/server/db/campusScope.ts';
import { assertTestDatabase } from './testDatabase';

/**
 * The campus-scoped client against a real database, campus A reading and
 * writing next to campus B's rows.
 *
 * Each way a model reaches its campus is exercised once: a `campusId` column
 * (Event, Participation), enrolment (Talent, Onboarding_Record) and the event
 * (EventPresence, EventPresenceClosure, Planning_Slot). Closing_Record has its
 * own case in `closingLifecycle.integration.test.ts`. The writes are the ones
 * the old hand-written handlers let through: an upsert whose `where` named
 * another campus's row, an update that moved a row, a create on another
 * campus's event.
 */

const stamp = Date.now();
const day = new Date('2026-09-01T00:00:00.000Z');
const year = '2026-2027';

type Side = {
  campus: string;
  event: string;
  talent: string;
  participation: string;
  dossier: string;
  presence: string;
  closure: string;
  slot: string;
};

async function side(name: string): Promise<Side> {
  const campus = (
    await prisma.campus.create({ data: { name: `Scope ${name} ${stamp}` } })
  ).id;
  const event = (
    await prisma.event.create({
      data: { titre: `Scope ${name}`, campusId: campus, date: day },
    })
  ).id;
  const talent = (
    await prisma.talent.create({ data: { prenom: name, nom: 'Scopée' } })
  ).id;
  const participation = (
    await prisma.participation.create({
      data: { talentId: talent, eventId: event, campusId: campus },
    })
  ).id;
  const dossier = (
    await prisma.onboarding_Record.create({
      data: { talentId: talent, schoolYear: year },
    })
  ).id;
  const presence = (
    await prisma.eventPresence.create({
      data: {
        talentId: talent,
        eventId: event,
        day,
        slot: 'morning',
        status: 'present',
      },
    })
  ).id;
  const closure = (
    await prisma.eventPresenceClosure.create({
      data: { eventId: event, day, slot: 'morning' },
    })
  ).id;
  const slot = (
    await prisma.planning_Slot.create({
      data: {
        eventId: event,
        startTime: day,
        endTime: day,
        nom: 'Atelier',
        activityType: 'atelier',
      },
    })
  ).id;
  return {
    campus,
    event,
    talent,
    participation,
    dossier,
    presence,
    closure,
    slot,
  };
}

let a: Side;
let b: Side;

beforeAll(async () => {
  assertTestDatabase();
  a = await side('A');
  b = await side('B');
});

afterAll(async () => {
  await prisma.event.deleteMany({ where: { id: { in: [a.event, b.event] } } });
  await prisma.talent.deleteMany({
    where: { id: { in: [a.talent, b.talent] } },
  });
  await prisma.campus.deleteMany({
    where: { id: { in: [a.campus, b.campus] } },
  });
});

const both = (key: keyof Side) => ({ id: { in: [a[key], b[key]] } });

describe('a read through campus A', () => {
  it('sees only campus A, for every way a model reaches its campus', async () => {
    const db = scopedPrisma(a.campus);
    const ids = (rows: { id: string }[]) => rows.map((r) => r.id);
    expect(ids(await db.event.findMany({ where: both('event') }))).toEqual([
      a.event,
    ]);
    expect(
      ids(await db.participation.findMany({ where: both('participation') })),
    ).toEqual([a.participation]);
    expect(ids(await db.talent.findMany({ where: both('talent') }))).toEqual([
      a.talent,
    ]);
    expect(
      ids(await db.onboarding_Record.findMany({ where: both('dossier') })),
    ).toEqual([a.dossier]);
    expect(
      ids(await db.eventPresence.findMany({ where: both('presence') })),
    ).toEqual([a.presence]);
    expect(
      ids(await db.eventPresenceClosure.findMany({ where: both('closure') })),
    ).toEqual([a.closure]);
    expect(
      ids(await db.planning_Slot.findMany({ where: both('slot') })),
    ).toEqual([a.slot]);
  });

  it('counts and groups only campus A', async () => {
    const db = scopedPrisma(a.campus);
    expect(await db.participation.count({ where: both('participation') })).toBe(
      1,
    );
    const groups = await db.participation.groupBy({
      by: ['campusId'],
      where: both('participation'),
      _count: { _all: true },
    });
    expect(groups).toEqual([{ campusId: a.campus, _count: { _all: 1 } }]);
  });

  it('keeps the caller filter next to the campus filter', async () => {
    // The dossiers of one event's cohort, as `loadEventDossierSignatures`
    // reads them: a campus filter written over `talent` would return every
    // dossier of the campus instead.
    const other = await prisma.event.create({
      data: { titre: 'Scope A bis', campusId: a.campus, date: day },
    });
    const elsewhere = await prisma.talent.create({
      data: { prenom: 'A2', nom: 'Scopée' },
    });
    await prisma.participation.create({
      data: { talentId: elsewhere.id, eventId: other.id, campusId: a.campus },
    });
    await prisma.onboarding_Record.create({
      data: { talentId: elsewhere.id, schoolYear: year },
    });
    try {
      const dossiers = await scopedPrisma(a.campus).onboarding_Record.findMany({
        where: {
          schoolYear: year,
          talent: { participations: { some: { eventId: a.event } } },
        },
        select: { talentId: true },
      });
      expect(dossiers).toEqual([{ talentId: a.talent }]);
    } finally {
      await prisma.event.delete({ where: { id: other.id } });
      await prisma.talent.delete({ where: { id: elsewhere.id } });
    }
  });
});

describe("campus B's rows, reached by unique key from campus A", () => {
  it('read as absent', async () => {
    const db = scopedPrisma(a.campus);
    expect(await db.event.findUnique({ where: { id: b.event } })).toBeNull();
    expect(await db.talent.findUnique({ where: { id: b.talent } })).toBeNull();
    expect(
      await db.eventPresenceClosure.findUnique({
        where: {
          eventId_day_slot: { eventId: b.event, day, slot: 'morning' },
        },
      }),
    ).toBeNull();
    await expect(
      db.participation.findUniqueOrThrow({ where: { id: b.participation } }),
    ).rejects.toMatchObject({ code: 'P2025' });
  });

  it('are neither updated nor deleted', async () => {
    const db = scopedPrisma(a.campus);
    await expect(
      db.talent.update({ where: { id: b.talent }, data: { nom: 'Volé' } }),
    ).rejects.toMatchObject({ code: 'P2025' });
    await expect(
      db.event.delete({ where: { id: b.event } }),
    ).rejects.toMatchObject({ code: 'P2025' });
    expect(
      await prisma.talent.findUniqueOrThrow({ where: { id: b.talent } }),
    ).toMatchObject({ nom: 'Scopée' });
    expect(await prisma.event.count({ where: { id: b.event } })).toBe(1);
  });

  it('are not updated by an upsert whose where names them', async () => {
    // The hole the hand-written handler left: it checked only the event of the
    // row the upsert would create, so this took the update branch on campus
    // B's closure. The campus now sits in `where`, so B's row is no match and
    // the create branch writes campus A's own row.
    const before = await prisma.eventPresenceClosure.findUniqueOrThrow({
      where: { id: b.closure },
    });
    await scopedPrisma(a.campus).eventPresenceClosure.upsert({
      where: { eventId_day_slot: { eventId: b.event, day, slot: 'morning' } },
      create: { eventId: a.event, day, slot: 'afternoon' },
      update: { closedAt: new Date('2030-01-01T00:00:00.000Z') },
    });
    expect(
      await prisma.eventPresenceClosure.findUniqueOrThrow({
        where: { id: b.closure },
      }),
    ).toEqual(before);
    await prisma.eventPresenceClosure.deleteMany({
      where: { eventId: a.event, slot: 'afternoon' },
    });
  });
});

describe('an upsert sent twice at once', () => {
  it('lands once, and neither caller sees the race', async () => {
    // Two staff closing the same créneau in the same instant. The campus in
    // `where` keeps Prisma off a native `ON CONFLICT`, so both can read "no
    // row" and both insert: the client retries the one that loses.
    //
    // The pool opens its connections lazily, and a burst on a cold pool runs
    // one query after another, so the race never happens. Open them first.
    await Promise.all(
      Array.from(
        { length: 20 },
        () => prisma.$queryRaw`SELECT 1 FROM pg_sleep(0.05)`,
      ),
    );
    const where = {
      eventId_day_slot: { eventId: a.event, day, slot: 'afternoon' as const },
    };
    const db = scopedPrisma(a.campus);
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        db.eventPresenceClosure.upsert({
          where,
          create: { eventId: a.event, day, slot: 'afternoon' },
          update: { closedAt: new Date() },
        }),
      ),
    );
    expect(results.filter((r) => r.status === 'rejected')).toEqual([]);
    expect(
      await prisma.eventPresenceClosure.count({
        where: { eventId: a.event, day, slot: 'afternoon' },
      }),
    ).toBe(1);
    await prisma.eventPresenceClosure.deleteMany({
      where: { eventId: a.event, slot: 'afternoon' },
    });
  });
});

describe('a write campus A may not make', () => {
  it('moves no row to another campus', async () => {
    await expect(
      scopedPrisma(a.campus).participation.updateMany({
        where: { id: a.participation },
        data: { campusId: b.campus },
      }),
    ).rejects.toThrow(CampusScopeViolation);
  });

  it('creates nothing on an event of another campus', async () => {
    const before = await prisma.eventPresence.count();
    await expect(
      scopedPrisma(a.campus).eventPresence.createMany({
        data: [
          {
            talentId: a.talent,
            eventId: a.event,
            day,
            slot: 'afternoon',
            status: 'present',
          },
          {
            talentId: b.talent,
            eventId: b.event,
            day,
            slot: 'afternoon',
            status: 'present',
          },
        ],
      }),
    ).rejects.toThrow(CampusScopeViolation);
    expect(await prisma.eventPresence.count()).toBe(before);
  });

  it('reaches no model the rule does not list', async () => {
    const db = scopedPrisma(a.campus) as unknown as typeof prisma;
    await expect(db.feedback_Form.findMany()).rejects.toThrow(
      CampusScopeViolation,
    );
  });
});
