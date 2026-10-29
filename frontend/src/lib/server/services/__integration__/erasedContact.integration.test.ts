/**
 * A talent erased at their request stays erased, whatever Salesforce sends.
 *
 * The erasure nulls `Talent.externalId`, the one key the sync matches on, and
 * Salesforce keeps the contact, so the worker keeps pushing it. Before
 * `Sync_ErasedContact`, the next push re-created the talent, its mirror and its
 * login as a first sight: the person's decision was undone within the
 * quarter-hour, with nothing in Jump saying so (security audit run-1, #436).
 *
 * What each test pins:
 *  - a fulfilled request bars the contact from the talents push, and nothing of
 *    it is written, not even a `Sync_Error`;
 *  - a full roster carrying the erased contact still proves its deletions, and
 *    the erased talent's kept enrolment is not pruned;
 *  - readmitting the contact lets the next push import them from scratch;
 *  - the inactivity sweep's erasure bars nothing, since a swept talent who
 *    enrols again is the return Jump exists for.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { prisma } from '$lib/server/db';
import { syncEvents, syncParticipations, syncTalents } from '../syncService';
import { anonymizeTalent } from '../anonymizationService';
import {
  fulfillTalentDeletion,
  readmitSalesforceContact,
  requestTalentDeletion,
} from '../talentDeletionService';
import { assertTestDatabase } from './testDatabase';

vi.mock('$lib/server/email/actionMail', () => ({
  sendActionEmail: vi.fn(async () => ({ ok: true })),
}));
vi.mock('$lib/server/infra/storage', () => ({
  getStorage: () => ({ delete: async () => {} }),
}));

describe('a talent erased at their request (integration)', () => {
  const stamp = Date.now();
  const campusExternalName = `TEST_ERASED_${stamp}`;
  const eventExternalId = `test_erased_event_${stamp}`;

  const erasedContact = {
    external_id: `test_erased_${stamp}`,
    first_name: 'Eden',
    last_name: 'Efface',
    email: `eden.${stamp}@example.test`,
    phone: '0612345678',
  };
  const stayingContact = {
    external_id: `test_staying_${stamp}`,
    first_name: 'Sacha',
    last_name: 'Reste',
    email: `sacha.${stamp}@example.test`,
  };
  const sweptContact = {
    external_id: `test_swept_${stamp}`,
    first_name: 'Noa',
    last_name: 'Inactif',
    email: `noa.${stamp}@example.test`,
  };
  const contacts = [erasedContact, stayingContact, sweptContact];

  let campusId = '';
  let erasedTalentId = '';
  const erasedTalentIds: string[] = [];

  beforeAll(async () => {
    assertTestDatabase();
    campusId = (
      await prisma.campus.create({
        data: {
          name: `Test Erased ${stamp}`,
          externalName: campusExternalName,
        },
        select: { id: true },
      })
    ).id;
    await syncEvents([
      {
        external_id: eventExternalId,
        title: `Stage ${stamp}`,
        start_date: '2026-07-08',
        end_date: null,
        campus_ext_name: campusExternalName,
      },
    ]);
    await syncTalents(contacts);
    await syncParticipations(
      eventExternalId,
      {
        [erasedContact.external_id]: 'Met',
        [stayingContact.external_id]: 'Met',
      },
      'full',
    );

    erasedTalentId = (
      await prisma.talent.findUniqueOrThrow({
        where: { externalId: erasedContact.external_id },
        select: { id: true },
      })
    ).id;
    erasedTalentIds.push(erasedTalentId);
    const request = await requestTalentDeletion(erasedTalentId);
    expect(await fulfillTalentDeletion(request.id, 'test-admin')).toBe(true);
  });

  afterAll(async () => {
    try {
      await prisma.sync_ErasedContact.deleteMany({
        where: { externalId: { in: contacts.map((c) => c.external_id) } },
      });
      // Erased talents lost their Salesforce id, so they are tracked by row id;
      // the ones imported since carry it again.
      const talents = await prisma.talent.findMany({
        where: {
          OR: [
            { id: { in: erasedTalentIds } },
            { externalId: { in: contacts.map((c) => c.external_id) } },
          ],
        },
        select: { id: true, userId: true },
      });
      await prisma.talent.deleteMany({
        where: { id: { in: talents.map((t) => t.id) } },
      });
      await prisma.bauth_user.deleteMany({
        where: {
          id: {
            in: talents
              .map((t) => t.userId)
              .filter((id): id is string => id !== null),
          },
        },
      });
      await prisma.event.deleteMany({ where: { externalId: eventExternalId } });
      await prisma.campus.deleteMany({ where: { id: campusId } });
    } catch {
      // ignore: the test database is disposable
    }
  });

  it('never imports the contact again, and writes nothing about it', async () => {
    const result = await syncTalents([erasedContact, stayingContact]);
    expect(result).toMatchObject({ created: 0, erased: 1 });

    expect(
      await prisma.talent.findUnique({
        where: { externalId: erasedContact.external_id },
      }),
    ).toBeNull();
    expect(
      await prisma.bauth_user.findUnique({
        where: { email: erasedContact.email },
      }),
    ).toBeNull();
    expect(
      await prisma.talentSfImport.count({
        where: { sfEmail: erasedContact.email },
      }),
    ).toBe(0);
    // A `Sync_Error` would store the id and the name the erasure removed.
    expect(
      await prisma.sync_Error.count({
        where: { externalId: erasedContact.external_id },
      }),
    ).toBe(0);
  });

  it('bars a nameless push of the contact without logging it', async () => {
    const result = await syncTalents([{ ...erasedContact, first_name: '' }]);
    expect(result).toMatchObject({ invalid: 0, erased: 1 });
    expect(
      await prisma.sync_Error.count({
        where: { externalId: erasedContact.external_id },
      }),
    ).toBe(0);
  });

  it('counts the erased member as resolved, so a full roster still prunes', async () => {
    // The staying talent left the campaign: a complete roster proves it. Were
    // the erased member counted unresolved, the removal would be held forever,
    // since there is no `Sync_Error` to fix for them.
    const result = await syncParticipations(
      eventExternalId,
      { [erasedContact.external_id]: 'Met' },
      'full',
    );
    expect(result).toMatchObject({ erased: 1, held: false, removed: 1 });

    // The erased talent's enrolment is the activity the erasure keeps, and no
    // roster can name them any more, so it is never pruned.
    expect(
      await prisma.participation.count({
        where: {
          talentId: erasedTalentId,
          event: { externalId: eventExternalId },
        },
      }),
    ).toBe(1);
  });

  it('imports the contact from scratch once readmitted', async () => {
    expect(await readmitSalesforceContact(erasedContact.external_id)).toBe(
      true,
    );
    // A mistyped id is told apart from a readmission.
    expect(await readmitSalesforceContact(erasedContact.external_id)).toBe(
      false,
    );

    const result = await syncTalents([erasedContact]);
    expect(result).toMatchObject({ created: 1, erased: 0 });

    const back = await prisma.talent.findUniqueOrThrow({
      where: { externalId: erasedContact.external_id },
      select: { id: true, nom: true, anonymizedAt: true },
    });
    expect(back.id).not.toBe(erasedTalentId);
    expect(back).toMatchObject({ nom: 'Efface', anonymizedAt: null });

    // The erased talent stays anonymised: nothing ties it to the contact.
    expect(
      await prisma.talent.findUniqueOrThrow({
        where: { id: erasedTalentId },
        select: { nom: true, externalId: true },
      }),
    ).toEqual({ nom: 'Anonymisé', externalId: null });
  });

  it('bars nothing when the inactivity sweep is what erased the talent', async () => {
    const swept = await prisma.talent.findUniqueOrThrow({
      where: { externalId: sweptContact.external_id },
      select: { id: true },
    });
    erasedTalentIds.push(swept.id);
    await prisma.$transaction((tx) => anonymizeTalent(tx, swept.id));

    expect(
      await prisma.sync_ErasedContact.count({
        where: { externalId: sweptContact.external_id },
      }),
    ).toBe(0);
    expect(await syncTalents([sweptContact])).toMatchObject({ created: 1 });
  });
});
