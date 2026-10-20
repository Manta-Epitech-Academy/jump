import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { EVENT_MODULES } from '$lib/domain/eventModules';
import { loadEventOr404 } from '$lib/server/services/stageContext';
import { assertTestDatabase } from './testDatabase';

/**
 * The gate every dev event route goes through. A route names the surface it
 * serves, and the load answers 404 for another campus's event or for a module
 * the event has turned off, so no endpoint can serve a section the event does
 * not expose (four once did, because the module check was a second call).
 */
describe('loading an event for a dev surface (integration)', () => {
  const stamp = Date.now();
  let campusId = '';
  let otherCampusId = '';
  let eventId = '';

  beforeAll(async () => {
    assertTestDatabase();
    campusId = (
      await prisma.campus.create({ data: { name: `Gate Campus ${stamp}` } })
    ).id;
    otherCampusId = (
      await prisma.campus.create({ data: { name: `Gate Other ${stamp}` } })
    ).id;
    eventId = (
      await prisma.event.create({
        data: {
          titre: 'Gate Event',
          campusId,
          date: new Date('2026-09-01T09:00:00.000Z'),
          modules: { create: { moduleKey: EVENT_MODULES.INSCRITS } },
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.event.deleteMany({ where: { id: eventId } });
    await prisma.campus.deleteMany({
      where: { id: { in: [campusId, otherCampusId] } },
    });
  });

  it('serves a module the event exposes', async () => {
    const event = await loadEventOr404(
      eventId,
      campusId,
      EVENT_MODULES.INSCRITS,
    );
    expect(event.id).toBe(eventId);
  });

  it('answers 404 for a module the event has off', async () => {
    await expect(
      loadEventOr404(eventId, campusId, EVENT_MODULES.EMARGEMENT),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('answers 404 for another campus, whatever the surface', async () => {
    await expect(
      loadEventOr404(eventId, otherCampusId, EVENT_MODULES.INSCRITS),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('leaves a surface that is no module to its own load', async () => {
    const event = await loadEventOr404(eventId, campusId, 'planning');
    expect(event.modules.has(EVENT_MODULES.INSCRITS)).toBe(true);
  });
});
