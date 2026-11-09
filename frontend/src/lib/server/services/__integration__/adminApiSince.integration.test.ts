/**
 * "New since" on the reads the weekly digest marks (#493).
 *
 * Each figure is asked twice, around rows placed on either side of the instant,
 * and judged on what changed: the sync, document and deletion figures are
 * platform-wide, so a row another suite left behind would move an absolute
 * count, never the difference these fixtures make.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { resolveScope } from '$lib/server/adminApi/scope';
import { getEventsConfigList } from '$lib/server/services/adminStats/eventsList';
import { getSyncHealth } from '$lib/server/services/adminStats/syncHealth';
import {
  getAccountDeletionQueue,
  getPdfJobsHealth,
} from '$lib/server/services/adminStats/opsQueues';
import { assertTestDatabase } from './testDatabase';

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const since = new Date(now - 7 * DAY);
const before = new Date(now - 30 * DAY);
const after = new Date(now - 2 * DAY);

describe('figures asked since an instant (integration)', () => {
  const stamp = Date.now();
  const campusName = `Since Campus ${stamp}`;
  let campusId = '';
  let talentId = '';
  // A talent holds one open sync error at most, so the second error needs one.
  let otherTalentId = '';
  const eventIds: string[] = [];

  beforeAll(async () => {
    assertTestDatabase();
    campusId = (
      await prisma.campus.create({
        data: { name: campusName, timezone: 'Europe/Paris' },
      })
    ).id;
    talentId = (
      await prisma.talent.create({ data: { prenom: 'Lou', nom: 'Depuis' } })
    ).id;
    otherTalentId = (
      await prisma.talent.create({ data: { prenom: 'Sam', nom: 'Depuis' } })
    ).id;
  });

  afterAll(async () => {
    await prisma.sync_Error.deleteMany({
      where: { talentId: { in: [talentId, otherTalentId] } },
    });
    await prisma.onboardingPdfJob.deleteMany({ where: { talentId } });
    await prisma.talentDeletionRequest.deleteMany({ where: { talentId } });
    await prisma.sync_PruneHold.deleteMany({
      where: { eventId: { in: eventIds } },
    });
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.talent.deleteMany({
      where: { id: { in: [talentId, otherTalentId] } },
    });
    await prisma.campus.deleteMany({ where: { id: campusId } });
  });

  /** An upcoming event to prepare, that arrived in Jump at `createdAt`. */
  async function eventArrived(createdAt: Date): Promise<string> {
    const event = await prisma.event.create({
      data: {
        campusId,
        titre: `Since ${createdAt.toISOString()}`,
        date: new Date(now + 30 * DAY),
        createdAt,
      },
    });
    eventIds.push(event.id);
    return event.id;
  }

  it('counts the events to prepare that arrived since, and dates every row', async () => {
    const oldId = await eventArrived(before);
    const newId = await eventArrived(after);

    const answer = await getEventsConfigList(
      await resolveScope({ campus: campusName }),
      { state: 'to_prepare' },
      { since },
    );

    expect(answer.events.value).toBe(2);
    expect(answer.addedSince.value).toBe(1);
    const addedAt = new Map(
      answer.list.value.map((row) => [row.eventId, row.addedAt]),
    );
    expect(addedAt.get(oldId)).toBe(before.toISOString());
    expect(addedAt.get(newId)).toBe(after.toISOString());

    // Asked without an instant, the answer is the one it always was.
    const plain = await getEventsConfigList(
      await resolveScope({ campus: campusName }),
      { state: 'to_prepare' },
    );
    expect('addedSince' in plain).toBe(false);
  });

  it('counts the sync errors and held prunes that first appeared since', async () => {
    const read = () => getSyncHealth({ since });
    const start = await read();

    await prisma.sync_Error.createMany({
      data: [
        { kind: 'LOGIN_FAILURE', talentId, firstOccurredAt: before },
        {
          kind: 'ADDRESS_TAKEN',
          talentId: otherTalentId,
          firstOccurredAt: after,
        },
      ],
    });
    const heldEvent = await eventArrived(before);
    await prisma.sync_PruneHold.create({
      data: {
        eventId: heldEvent,
        pendingRemovals: 3,
        sentCount: 0,
        resolvedCount: 0,
        firstHeldAt: after,
        lastHeldAt: after,
      },
    });

    const end = await read();
    expect(end.openErrors.value - start.openErrors.value).toBe(2);
    expect(end.openErrorsSince.value - start.openErrorsSince.value).toBe(1);
    expect(end.prunesHeldSince.value - start.prunesHeldSince.value).toBe(1);
  });

  it('counts the generations that failed since, and not the older failures', async () => {
    const read = () => getPdfJobsHealth({ since });
    const start = await read();

    await prisma.onboardingPdfJob.createMany({
      data: [
        {
          talentId,
          documentType: 'rules',
          schoolYear: '2026-2027',
          status: 'error',
          processedAt: before,
        },
        {
          talentId,
          documentType: 'charter',
          schoolYear: '2026-2027',
          status: 'error',
          processedAt: after,
        },
      ],
    });

    const end = await read();
    expect(end.failed.value - start.failed.value).toBe(2);
    expect(end.failedSince.value - start.failedSince.value).toBe(1);
  });

  // The deletion delay is a legal clock: what the digest has to say is which
  // requests crossed it this week, not only how many are over it.
  it('counts the requests that arrived since and the ones that went over the delay since', async () => {
    const read = () => getAccountDeletionQueue({ since });
    const start = await read();

    await prisma.talentDeletionRequest.createMany({
      data: [
        // Over the delay already at `since`.
        { talentId, requestedAt: new Date(now - 40 * DAY) },
        // Crossed the 21 days between `since` and now.
        { talentId, requestedAt: new Date(now - 25 * DAY) },
        // Arrived since, still within the delay.
        { talentId, requestedAt: after },
      ],
    });

    const end = await read();
    expect(end.overdue.value - start.overdue.value).toBe(2);
    expect(end.overdueSince.value - start.overdueSince.value).toBe(1);
    expect(end.pendingSince.value - start.pendingSince.value).toBe(1);
  });
});
