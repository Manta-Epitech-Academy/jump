import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { prisma } from '$lib/server/db';
import { assertTestDatabase } from './testDatabase';

const sendParentWelcomeEmail = vi.hoisted(() =>
  vi.fn(async (..._args: unknown[]) => {}),
);
vi.mock('$lib/server/otp', () => ({ sendParentWelcomeEmail }));

const { actions } =
  await import('../../../../routes/(talent)/onboarding/+page.server');

/**
 * Every new parent-1 address the wizard saves mails a welcome link to it, and a
 * talent chooses the address. Security audit run-1: nothing bounded it, so a
 * talent could mail any list of addresses, or flood one by alternating two.
 * Driven through the real action, since the cap sits in the route.
 */
describe('parent welcome cap (integration)', () => {
  const stamp = Date.now();
  const address = (label: string) => `${label}.${stamp}@example.test`;
  // One talent per test, each with its own login, so each starts with the
  // whole day's budget.
  const talents = new Map<string, string>();

  /**
   * Submit the parents step as `who`. `staleParentEmail` hands the action the
   * address `locals` held when the request began, which a concurrent submit
   * has since changed under it.
   */
  async function submitParents(
    who: string,
    parentEmail: string,
    staleParentEmail?: string,
  ) {
    const talent = await prisma.talent.findUniqueOrThrow({
      where: { id: talents.get(who)! },
    });
    if (staleParentEmail !== undefined) talent.parentEmail = staleParentEmail;
    const body = new FormData();
    for (const [key, value] of Object.entries({
      parentType: 'mere',
      parentCivilite: 'femme',
      parentNom: 'Dupont',
      parentPrenom: 'Marie',
      parentEmail,
      parentPhone: '+33612345678',
    })) {
      body.set(key, value);
    }
    return actions.validateParents({
      request: new Request('http://localhost/onboarding?/validateParents', {
        method: 'POST',
        body,
      }),
      locals: { talent, user: { email: address(who) } },
    } as unknown as Parameters<typeof actions.validateParents>[0]);
  }

  const savedParentEmail = async (who: string) =>
    (
      await prisma.talent.findUniqueOrThrow({
        where: { id: talents.get(who)! },
      })
    ).parentEmail;

  const claims = (who: string) =>
    prisma.otpAttempt.count({
      where: { bucket: 'parent_welcome', email: address(who) },
    });

  beforeAll(async () => {
    assertTestDatabase();
    for (const who of ['alternating', 'refused', 'stale']) {
      const talent = await prisma.talent.create({
        data: { nom: 'Test', prenom: who },
      });
      talents.set(who, talent.id);
    }
  });

  afterAll(async () => {
    try {
      await prisma.talent.deleteMany({
        where: { id: { in: [...talents.values()] } },
      });
      await prisma.bauth_user.deleteMany({
        where: { email: { endsWith: `.${stamp}@example.test` } },
      });
      await prisma.otpAttempt.deleteMany({
        where: { email: { endsWith: `.${stamp}@example.test` } },
      });
    } catch {
      // ignore - the test database is disposable
    }
  });

  it('refuses a fourth address change within a day, and still lets the talent keep the one saved', async () => {
    // The first address, then two corrections, one of them going back.
    for (const parentEmail of [
      address('first'),
      address('typo'),
      address('first'),
    ]) {
      expect(await submitParents('alternating', parentEmail)).toEqual({
        success: true,
      });
    }
    expect(sendParentWelcomeEmail).toHaveBeenCalledTimes(3);

    const refused = await submitParents('alternating', address('typo'));
    expect(refused).toMatchObject({ status: 429 });
    expect(await savedParentEmail('alternating')).toBe(address('first'));
    expect(sendParentWelcomeEmail).toHaveBeenCalledTimes(3);

    // Keeping the address sends nothing, so the cap never blocks the step.
    expect(await submitParents('alternating', address('first'))).toEqual({
      success: true,
    });
    expect(sendParentWelcomeEmail).toHaveBeenCalledTimes(3);
  });

  it('gives the claim back when the address is refused', async () => {
    // No welcome goes to a refused address, so it spends nothing: a talent
    // corrected for typing a staff address keeps the day's whole budget.
    for (let i = 0; i < 4; i++) {
      expect(
        await submitParents('refused', `prof${i}.${stamp}@epitech.eu`),
      ).toMatchObject({ status: 400 });
    }
    expect(await claims('refused')).toBe(0);
    expect(await submitParents('refused', address('parent'))).toEqual({
      success: true,
    });
  });

  it('decides on the saved address, not on the one the request began with', async () => {
    // Two submits racing: the second read `locals` before the first saved a
    // new address, so it took its own for unchanged and spent no claim, then
    // changed it back and mailed a welcome the cap never counted.
    expect(await submitParents('stale', address('a'))).toEqual({
      success: true,
    });
    await prisma.talent.update({
      where: { id: talents.get('stale')! },
      data: { parentEmail: address('b') },
    });
    const before = await claims('stale');
    sendParentWelcomeEmail.mockClear();

    expect(await submitParents('stale', address('a'), address('a'))).toEqual({
      success: true,
    });
    expect(sendParentWelcomeEmail).toHaveBeenCalledTimes(1);
    expect(await claims('stale')).toBe(before + 1);
  });
});
