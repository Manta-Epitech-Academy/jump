import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { assertTestDatabase } from './testDatabase';
import { settleLoginError } from '../syncErrorService';

/**
 * A talent's login error is settled on every pass, so what it says has to
 * track the latest pass exactly: the cause it shows, since when, and whether it
 * is there at all. An admin reads « depuis » to judge urgency, and a row that
 * outlived its cause is the queue that lied before this rework.
 */
describe('syncErrorService (integration)', () => {
  const stamp = Date.now();
  let talentId = '';

  const stored = () =>
    prisma.sync_Error.findUnique({
      where: { talentId },
      select: { kind: true, detail: true, firstOccurredAt: true },
    });

  beforeAll(async () => {
    assertTestDatabase();
    talentId = (
      await prisma.talent.create({
        data: { externalId: `test_se_${stamp}`, nom: 'Test', prenom: 'Erreur' },
      })
    ).id;
  });

  afterAll(async () => {
    // The talent's error goes with it (cascade).
    await prisma.talent.deleteMany({ where: { id: talentId } });
  });

  it('keeps the start of a cause the next passes reproduce', async () => {
    await settleLoginError(talentId, null, {
      kind: 'LOGIN_FAILURE',
      detail: 'first',
    });
    const first = await stored();

    await settleLoginError(talentId, 'LOGIN_FAILURE', {
      kind: 'LOGIN_FAILURE',
      detail: 'second',
    });
    const again = await stored();

    expect(again?.firstOccurredAt).toEqual(first?.firstOccurredAt);
    expect(again?.detail).toBe('second');
  });

  it('restarts « depuis » when the cause changes', async () => {
    const before = await stored();
    await new Promise((r) => setTimeout(r, 5));
    await settleLoginError(talentId, 'LOGIN_FAILURE', {
      kind: 'ADDRESS_TAKEN',
      detail: null,
    });
    const after = await stored();

    expect(after?.kind).toBe('ADDRESS_TAKEN');
    expect(after?.detail).toBeNull();
    expect(after!.firstOccurredAt.getTime()).toBeGreaterThan(
      before!.firstOccurredAt.getTime(),
    );
  });

  it('deletes the error once a pass finds nothing wrong', async () => {
    await settleLoginError(talentId, 'ADDRESS_TAKEN', null);
    expect(await stored()).toBeNull();
  });

  it('refuses a row that mixes a talent with a nameless contact', async () => {
    // The CHECK in the migration: a login error reads its address and name off
    // the talent, so a copy beside it would be a second truth to drift.
    await expect(
      prisma.sync_Error.create({
        data: { kind: 'ADDRESS_TAKEN', talentId, email: 'copy@example.test' },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.sync_Error.create({
        data: { kind: 'MISSING_NAME', talentId },
      }),
    ).rejects.toThrow();
  });
});
