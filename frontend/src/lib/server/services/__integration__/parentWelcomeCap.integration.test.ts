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
  const talentEmail = `talent.${stamp}@example.test`;
  const address = (label: string) => `${label}.${stamp}@example.test`;
  let talentId = '';

  async function submitParents(parentEmail: string) {
    const talent = await prisma.talent.findUniqueOrThrow({
      where: { id: talentId },
    });
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
      locals: { talent, user: { email: talentEmail } },
    } as unknown as Parameters<typeof actions.validateParents>[0]);
  }

  const savedParentEmail = async () =>
    (await prisma.talent.findUniqueOrThrow({ where: { id: talentId } }))
      .parentEmail;

  beforeAll(async () => {
    assertTestDatabase();
    const talent = await prisma.talent.create({
      data: { nom: 'Test', prenom: 'Talent' },
    });
    talentId = talent.id;
  });

  afterAll(async () => {
    try {
      await prisma.talent.delete({ where: { id: talentId } });
      await prisma.bauth_user.deleteMany({
        where: { email: { endsWith: `.${stamp}@example.test` } },
      });
      await prisma.otpAttempt.deleteMany({ where: { email: talentEmail } });
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
      expect(await submitParents(parentEmail)).toEqual({ success: true });
    }
    expect(sendParentWelcomeEmail).toHaveBeenCalledTimes(3);

    const refused = await submitParents(address('typo'));
    expect(refused).toMatchObject({ status: 429 });
    expect(await savedParentEmail()).toBe(address('first'));
    expect(sendParentWelcomeEmail).toHaveBeenCalledTimes(3);

    // Keeping the address sends nothing, so the cap never blocks the step.
    expect(await submitParents(address('first'))).toEqual({ success: true });
    expect(sendParentWelcomeEmail).toHaveBeenCalledTimes(3);
  });
});
