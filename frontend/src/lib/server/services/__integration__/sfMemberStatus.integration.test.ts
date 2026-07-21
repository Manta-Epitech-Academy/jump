import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { syncTalents } from '../syncService';
import {
  isVisibleInDevSpace,
  SF_VISIBLE_STATUSES,
} from '$lib/domain/sfMemberStatus';

describe('Salesforce Member Status Integration Test', () => {
  let event: { id: string; externalId: string | null };

  beforeAll(async () => {
    // Find any existing event in DB to run integration tests against
    const existing = await prisma.event.findFirst({
      select: { id: true, externalId: true },
    });
    if (!existing || !existing.externalId) {
      // Create a test campus and event if none exists
      const campus = await prisma.campus.create({
        data: { name: 'Test Campus', externalName: 'TEST_CAMPUS' },
      });
      const created = await prisma.event.create({
        data: {
          titre: 'Test SF Status Event',
          externalId: 'TEST_SF_EVENT_001',
          campusId: campus.id,
          date: new Date(),
        },
      });
      event = { id: created.id, externalId: created.externalId };
    } else {
      event = { id: existing.id, externalId: existing.externalId };
    }
  });

  it('syncs talents with mixed statuses and stores sfMemberStatus', async () => {
    const extId = event.externalId!;
    const testTalents = [
      {
        external_id: 'test_sf_ready_' + Date.now(),
        first_name: 'Jean',
        last_name: 'Ready',
        email: `jean.ready.${Date.now()}@example.com`,
        status: 'READY',
      },
      {
        external_id: 'test_sf_meet_' + Date.now(),
        first_name: 'Claire',
        last_name: 'Meet',
        email: `claire.meet.${Date.now()}@example.com`,
        status: 'MEET',
      },
      {
        external_id: 'test_sf_connected_' + Date.now(),
        first_name: 'Lucas',
        last_name: 'Connected',
        email: `lucas.connected.${Date.now()}@example.com`,
        status: 'CONNECTED',
      },
      {
        external_id: 'test_sf_desisted_' + Date.now(),
        first_name: 'Emma',
        last_name: 'Desisted',
        email: `emma.desisted.${Date.now()}@example.com`,
        status: 'DESISTED',
      },
    ];

    // 1. Ingest via syncTalents
    const result = await syncTalents(extId, testTalents);
    expect(
      (result?.created ?? 0) + (result?.updated ?? 0),
    ).toBeGreaterThanOrEqual(4);

    // 2. Query participations for this event
    const participations = await prisma.participation.findMany({
      where: { eventId: event.id },
      select: {
        sfMemberStatus: true,
        talent: { select: { externalId: true, prenom: true, nom: true } },
      },
    });

    const statusByExtId = new Map(
      participations.map((p) => [p.talent.externalId, p.sfMemberStatus]),
    );

    expect(statusByExtId.get(testTalents[0].external_id)).toBe('READY');
    expect(statusByExtId.get(testTalents[1].external_id)).toBe('MEET');
    expect(statusByExtId.get(testTalents[2].external_id)).toBe('CONNECTED');
    expect(statusByExtId.get(testTalents[3].external_id)).toBe('DESISTED');

    // 3. Query filtered inscrits cohort (dev workspace view)
    const visibleParticipations = await prisma.participation.findMany({
      where: {
        eventId: event.id,
        OR: [
          { sfMemberStatus: { in: [...SF_VISIBLE_STATUSES] } },
          { sfMemberStatus: null },
        ],
      },
      select: {
        sfMemberStatus: true,
        talent: { select: { externalId: true } },
      },
    });

    const visibleExtIds = new Set(
      visibleParticipations.map((p) => p.talent.externalId),
    );

    // 4. Test re-sync with status transitions (READY -> MEET, MEET -> DESISTED)
    const transitionTalents = [
      {
        ...testTalents[0],
        status: 'MEET', // Jean promoted from READY to MEET
      },
      {
        ...testTalents[1],
        status: 'DESISTED', // Claire changed from MEET to DESISTED
      },
    ];

    await syncTalents(extId, transitionTalents);

    const updatedParticipations = await prisma.participation.findMany({
      where: {
        eventId: event.id,
        talent: {
          externalId: {
            in: [testTalents[0].external_id, testTalents[1].external_id],
          },
        },
      },
      select: {
        sfMemberStatus: true,
        talent: { select: { externalId: true } },
      },
    });

    const updatedMap = new Map(
      updatedParticipations.map((p) => [p.talent.externalId, p.sfMemberStatus]),
    );

    expect(updatedMap.get(testTalents[0].external_id)).toBe('MEET');
    expect(updatedMap.get(testTalents[1].external_id)).toBe('DESISTED');
  });
});
