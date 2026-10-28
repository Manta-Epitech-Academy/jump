/**
 * One Salesforce person, one talent, through the talents push itself.
 *
 * The shape every case here comes from is real (October 2026): a student met at
 * salons got a Lead at each, then applied, and Salesforce converted every Lead
 * into one Contact. Jump had keyed a talent on each Lead, so the person had
 * four, the first one held the address, and the one carrying the current
 * enrolment could never get a login. The worker now sends the contact with the
 * Leads converted into it, and the push folds them back into one.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { syncTalents } from '../syncService';
import { loadOpenSyncErrors } from '../syncErrorQueue';
import { assertTestDatabase } from './testDatabase';

describe('one Salesforce person, one talent (integration)', () => {
  const stamp = Date.now();
  const lead = (n: number) => `test_sp_lead${n}_${stamp}`;
  const contact = (n: number) => `test_sp_contact${n}_${stamp}`;
  const address = (label: string) => `${label}.${stamp}@person.test`;
  let campusId = '';
  let eventId = '';

  const member = (externalId: string, email: string, converted?: string[]) => ({
    external_id: externalId,
    ...(converted ? { converted_lead_ids: converted } : {}),
    first_name: 'Charlie',
    last_name: 'Mougey',
    email,
  });
  const talentsOf = (externalIds: string[]) =>
    prisma.talent.findMany({
      where: { externalId: { in: externalIds } },
      select: {
        id: true,
        externalId: true,
        user: { select: { email: true } },
      },
    });

  beforeAll(async () => {
    assertTestDatabase();
    campusId = (
      await prisma.campus.create({ data: { name: `Person ${stamp}` } })
    ).id;
    eventId = (
      await prisma.event.create({
        data: {
          titre: 'Salon',
          campusId,
          date: new Date('2025-11-15T09:00:00.000Z'),
        },
      })
    ).id;
  });

  afterAll(async () => {
    const ids = [1, 2, 3, 4, 5, 6].flatMap((n) => [lead(n), contact(n)]);
    await prisma.sync_Error.deleteMany({ where: { externalId: { in: ids } } });
    await prisma.talent.deleteMany({ where: { externalId: { in: ids } } });
    await prisma.bauth_user.deleteMany({
      where: { email: { endsWith: `.${stamp}@person.test` } },
    });
    await prisma.event.deleteMany({ where: { id: eventId } });
    await prisma.campus.deleteMany({ where: { id: campusId } });
  });

  it('rekeys the talent of a converted Lead to its contact, keeping it whole', async () => {
    await syncTalents([member(lead(1), address('solo'))]);
    const [before] = await talentsOf([lead(1)]);
    await prisma.participation.create({
      data: { talentId: before!.id, eventId, campusId },
    });

    await syncTalents([member(contact(1), address('solo'), [lead(1)])]);

    expect(await talentsOf([lead(1), contact(1)])).toEqual([
      {
        id: before!.id,
        externalId: contact(1),
        user: { email: address('solo') },
      },
    ]);
    expect(
      await prisma.participation.count({ where: { talentId: before!.id } }),
    ).toBe(1);
  });

  it('folds the talents of every Lead into one that can log in', async () => {
    // Three salons, three Leads: the first took the address, the third was
    // left without a login, as on production.
    await syncTalents([
      member(lead(2), address('charlie')),
      member(lead(3), address('celine')),
      member(lead(4), address('charlie')),
    ]);
    const [third] = await talentsOf([lead(4)]);
    expect(
      await prisma.sync_Error.findUnique({
        where: { talentId: third!.id },
        select: { kind: true },
      }),
    ).toEqual({ kind: 'ADDRESS_TAKEN' });
    await prisma.participation.create({
      data: { talentId: third!.id, eventId, campusId },
    });

    const result = await syncTalents([
      member(contact(2), address('charlie'), [lead(2), lead(3), lead(4)]),
    ]);

    const left = await talentsOf([lead(2), lead(3), lead(4), contact(2)]);
    expect(left).toEqual([
      expect.objectContaining({
        externalId: contact(2),
        user: { email: address('charlie') },
      }),
    ]);
    // The enrolment of the record left without a login came along.
    expect(
      await prisma.participation.count({ where: { talentId: left[0]!.id } }),
    ).toBe(1);
    // Nothing is left in the queue for any of them.
    expect(
      await prisma.sync_Error.count({ where: { talentId: left[0]!.id } }),
    ).toBe(0);
    // The record holding a mother's address took its unused login with it.
    expect(
      await prisma.bauth_user.findUnique({
        where: { email: address('celine') },
      }),
    ).toBeNull();
    expect(result.invalid).toBe(0);
  });

  describe('a person whose records were each used', () => {
    beforeAll(async () => {
      await syncTalents([
        member(lead(5), address('first')),
        member(lead(6), address('second')),
      ]);
      await prisma.talent.updateMany({
        where: { externalId: { in: [lead(5), lead(6)] } },
        data: { firstLoginAt: new Date('2026-03-01T10:00:00.000Z') },
      });
    });

    it('merges nothing, says so, and reconciles the rest of the batch', async () => {
      const result = await syncTalents([
        member(contact(5), address('first'), [lead(5), lead(6)]),
        member(contact(6), address('other')),
      ]);

      expect(result.invalid).toBe(1);
      expect(
        (await talentsOf([lead(5), lead(6)])).map((t) => t.externalId).sort(),
      ).toEqual([lead(5), lead(6)].sort());
      expect(
        await prisma.sync_Error.findUnique({
          where: { externalId: contact(5) },
          select: { kind: true, convertedLeadIds: true },
        }),
      ).toEqual({
        kind: 'MERGE_REFUSED',
        convertedLeadIds: [lead(5), lead(6)],
      });
      expect(await talentsOf([contact(6)])).toHaveLength(1);
    });

    it('names every record in cause on the queue', async () => {
      const error = (await loadOpenSyncErrors()).find(
        (e) => e.subject.externalId === contact(5),
      );
      expect(error?.explanation.remedy.who).toBe('developer');
      expect(error?.records.map((r) => r.externalId).sort()).toEqual(
        [lead(5), lead(6)].sort(),
      );
    });

    it('merges them and clears the error once only one of them was used', async () => {
      await prisma.talent.updateMany({
        where: { externalId: lead(6) },
        data: { firstLoginAt: null },
      });

      await syncTalents([
        member(contact(5), address('first'), [lead(5), lead(6)]),
      ]);

      expect(await talentsOf([lead(5), lead(6), contact(5)])).toEqual([
        expect.objectContaining({ externalId: contact(5) }),
      ]);
      expect(
        await prisma.sync_Error.findUnique({
          where: { externalId: contact(5) },
        }),
      ).toBeNull();
    });
  });
});
