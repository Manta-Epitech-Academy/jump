import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { syncParticipations, syncTalents } from '../syncService';
import { isVisibleInDevSpace } from '$lib/domain/sfMemberStatus';
import { assertTestDatabase } from './testDatabase';

describe('Salesforce member status sync (integration)', () => {
  // Unique per run so re-runs never collide and cleanup targets exactly what
  // this suite created: the test owns its own event, it never reuses existing
  // data.
  const stamp = Date.now();
  const eventExternalId = `test_sf_event_${stamp}`;
  // Identity and enrolment are two pushes now, as the worker sends them: the
  // talent payload carries no status at all, the roster does.
  const talents = [
    {
      external_id: `test_ready_${stamp}`,
      first_name: 'Jean',
      last_name: 'Ready',
      email: `jean.ready.${stamp}@example.test`,
    },
    {
      external_id: `test_meet_${stamp}`,
      first_name: 'Claire',
      last_name: 'Meet',
      email: `claire.meet.${stamp}@example.test`,
    },
    {
      external_id: `test_connected_${stamp}`,
      first_name: 'Lucas',
      last_name: 'Connected',
      email: `lucas.connected.${stamp}@example.test`,
    },
    {
      external_id: `test_desisted_${stamp}`,
      first_name: 'Emma',
      last_name: 'Desisted',
      email: `emma.desisted.${stamp}@example.test`,
    },
  ];
  const roster: Record<string, string> = {
    [talents[0].external_id]: 'READY',
    [talents[1].external_id]: 'MEET',
    [talents[2].external_id]: 'CONNECTED',
    [talents[3].external_id]: 'DESISTED',
  };

  let eventId = '';
  let campusId = '';

  beforeAll(async () => {
    assertTestDatabase();
    const campus = await prisma.campus.create({
      data: {
        name: `Test Campus ${stamp}`,
        externalName: `TEST_CAMPUS_${stamp}`,
      },
    });
    campusId = campus.id;
    const event = await prisma.event.create({
      data: {
        titre: 'Test SF Status Event',
        externalId: eventExternalId,
        campusId,
        date: new Date('2026-01-01T09:00:00.000Z'),
      },
    });
    eventId = event.id;
  });

  afterAll(async () => {
    // Disposable DB, but leave it clean anyway (TESTING.md §3.2). Deleting the
    // talents cascades their TalentSfImport + Participation; deleting the event
    // cascades any remainder. The login accounts are SetNull on the talent, so
    // they must be removed explicitly. Best-effort: never fail the suite on
    // cleanup of a throwaway DB.
    const externalIds = talents.map((t) => t.external_id);
    try {
      const created = await prisma.talent.findMany({
        where: { externalId: { in: externalIds } },
        select: { userId: true },
      });
      await prisma.talent.deleteMany({
        where: { externalId: { in: externalIds } },
      });
      if (eventId) {
        await prisma.event.delete({ where: { id: eventId } }).catch(() => {});
      }
      const userIds = created
        .map((t) => t.userId)
        .filter((id): id is string => id != null);
      if (userIds.length) {
        await prisma.bauth_user.deleteMany({ where: { id: { in: userIds } } });
      }
      if (campusId) {
        await prisma.campus.delete({ where: { id: campusId } }).catch(() => {});
      }
    } catch {
      // ignore: the test database is disposable
    }
  });

  it('stores the normalized SF status per participation and updates it on re-sync', async () => {
    const identities = await syncTalents(talents);
    expect((identities as { error?: string }).error).toBeUndefined();
    const enrolments = await syncParticipations(
      eventExternalId,
      roster,
      'full',
    );
    expect((enrolments as { error?: string }).error).toBeUndefined();

    const statusByExtId = async () => {
      const rows = await prisma.participation.findMany({
        where: { eventId },
        select: {
          sfMemberStatus: true,
          talent: { select: { externalId: true } },
        },
      });
      return new Map(rows.map((p) => [p.talent.externalId, p.sfMemberStatus]));
    };

    // Ingested as-is, normalized to upper-case, whatever the status.
    let statuses = await statusByExtId();
    expect(statuses.get(talents[0].external_id)).toBe('READY');
    expect(statuses.get(talents[1].external_id)).toBe('MEET');
    expect(statuses.get(talents[2].external_id)).toBe('CONNECTED');
    expect(statuses.get(talents[3].external_id)).toBe('DESISTED');

    // Dev-space visibility follows isVisibleInDevSpace: READY/MEET shown, the
    // rest hidden: the whole point of ingesting the status.
    expect(
      isVisibleInDevSpace(statuses.get(talents[0].external_id) ?? null),
    ).toBe(true);
    expect(
      isVisibleInDevSpace(statuses.get(talents[1].external_id) ?? null),
    ).toBe(true);
    expect(
      isVisibleInDevSpace(statuses.get(talents[2].external_id) ?? null),
    ).toBe(false);
    expect(
      isVisibleInDevSpace(statuses.get(talents[3].external_id) ?? null),
    ).toBe(false);

    // Re-sync with a status transition: the status is upserted in place, not
    // appended (mutable external state, not a ledger). Sent as an incremental,
    // so the two members the roster omits keep their enrolment: absence proves
    // nothing outside a full pass.
    await syncParticipations(
      eventExternalId,
      {
        [talents[0].external_id]: 'MEET', // READY -> MEET
        [talents[1].external_id]: 'DESISTED', // MEET -> DESISTED
      },
      'incremental',
    );
    statuses = await statusByExtId();
    expect(statuses.get(talents[0].external_id)).toBe('MEET');
    expect(statuses.get(talents[1].external_id)).toBe('DESISTED');
    expect(statuses.size).toBe(4);

    // The same partial roster as a FULL pass is a complete one by definition,
    // so the two it omits are gone. This is the only pass that may say that.
    const pruned = await syncParticipations(
      eventExternalId,
      {
        [talents[0].external_id]: 'MEET',
        [talents[1].external_id]: 'DESISTED',
      },
      'full',
    );
    expect(pruned).toMatchObject({ removed: 2 });
    expect((await statusByExtId()).size).toBe(2);
  });
});
