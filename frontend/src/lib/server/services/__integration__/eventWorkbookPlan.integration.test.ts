import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { EVENT_MODULES, type EventModuleKey } from '$lib/domain/eventModules';
import { loadEventOr404 } from '$lib/server/services/stageContext';
import {
  planEventWorkbook,
  workbookSections,
} from '$lib/server/services/eventSheets';
import { assertTestDatabase } from './testDatabase';

/**
 * Which sections the event home's whole export carries. The route itself has
 * no module of its own (it is the home's), so this plan is the only gate
 * between a section that is off and its data in a downloaded file: a sheet
 * only where the section's own page would answer, its module on and its data
 * gate passed (a live form for Feedback, a grid for Closings).
 */
describe("the event's whole export (integration)", () => {
  const stamp = Date.now();
  let campusId = '';
  let formId = '';
  let gridId = '';
  const eventIds: string[] = [];

  async function eventWith(
    modules: EventModuleKey[],
    refs: { form?: boolean; grid?: boolean } = {},
  ) {
    const event = await prisma.event.create({
      data: {
        titre: `Workbook ${stamp} ${eventIds.length}`,
        campusId,
        date: new Date('2026-09-01T09:00:00.000Z'),
        feedbackFormId: refs.form ? formId : null,
        closingTemplateId: refs.grid ? gridId : null,
        modules: { create: modules.map((moduleKey) => ({ moduleKey })) },
      },
    });
    eventIds.push(event.id);
    return loadEventOr404(event.id, campusId, 'home');
  }

  beforeAll(async () => {
    assertTestDatabase();
    campusId = (
      await prisma.campus.create({ data: { name: `Workbook ${stamp}` } })
    ).id;
    formId = (
      await prisma.feedback_Form.create({
        data: {
          slug: `workbook-${stamp}`,
          title: `Workbook ${stamp}`,
          status: 'published',
          allowsAuthenticatedAccess: true,
        },
      })
    ).id;
    gridId = (
      await prisma.closing_Template.create({
        data: { key: `workbook_${stamp}`, label: 'Grille du classeur' },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.feedback_Form.deleteMany({ where: { id: formId } });
    await prisma.closing_Template.deleteMany({ where: { id: gridId } });
    await prisma.campus.deleteMany({ where: { id: campusId } });
  });

  it('carries every section an event runs, in the order of its menu', async () => {
    const event = await eventWith(Object.values(EVENT_MODULES), {
      form: true,
      grid: true,
    });
    expect(workbookSections(await planEventWorkbook(event))).toEqual([
      'Inscrits',
      'Émargement',
      'Feedback',
      'Closings',
    ]);
  });

  it('leaves out a section that is off, even when it names its form or grid', async () => {
    const event = await eventWith([EVENT_MODULES.INSCRITS], {
      form: true,
      grid: true,
    });
    expect(workbookSections(await planEventWorkbook(event))).toEqual([
      'Inscrits',
    ]);
  });

  it('leaves out a section that is on with nothing to read', async () => {
    const event = await eventWith([
      EVENT_MODULES.BILAN,
      EVENT_MODULES.CLOSINGS,
    ]);
    expect(workbookSections(await planEventWorkbook(event))).toEqual([]);
  });
});
