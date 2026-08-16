/**
 * The tier's first rule, enforced by running it: no read operation returns a
 * talent's name, email or phone.
 *
 * Plan 06 checked this with a `grep` for suspicious `select` clauses. That
 * catches the obvious mistake and misses every interesting one: a relation
 * included wholesale, a service reused from a page that does show identities, a
 * free-text field that happens to contain a name. So this seeds a talent whose
 * identity is unmistakable, calls every operation, and looks for it in the
 * answers.
 *
 * It also fails when somebody adds an operation and forgets it exists: the
 * catalogue is walked, not a hand-written list.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { schoolYearOf } from '$lib/domain/schoolYear';
import { assertTestDatabase } from './testDatabase';
import {
  ADMIN_API_OPERATIONS,
  type AdminApiOperation,
  type AdminApiOperationName,
} from '$lib/server/adminApi/operations';

/** Values seeded onto a real talent, then hunted for in every answer. */
const IDENTITY = {
  nom: 'Pii-Nom-Zzqx',
  prenom: 'Pii-Prenom-Zzqx',
  email: 'pii.zzqx@example.test',
  phone: '+33600000042',
};

/** Keys that must not appear anywhere in a payload, at any depth. */
const FORBIDDEN_KEYS = ['nom', 'prenom', 'email', 'phone', 'talentId'];

function offendingKeys(value: unknown, path = ''): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => offendingKeys(item, `${path}[${i}]`));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) => {
      const here = path ? `${path}.${key}` : key;
      const bad = FORBIDDEN_KEYS.includes(key) ? [here] : [];
      return [...bad, ...offendingKeys(child, here)];
    });
  }
  return [];
}

describe('no read operation leaks a talent identity (integration)', () => {
  const stamp = Date.now();
  const TIMEZONE = 'Europe/Paris';
  let campusId = '';
  let talentId = '';
  let userId = '';
  /** Values the parameterised operations are exercised with. */
  const seeded = { eventId: '', formId: '', schoolYear: '' };

  beforeAll(async () => {
    assertTestDatabase();
    const campus = await prisma.campus.create({
      data: { name: `PiiCampus-${stamp}`, timezone: TIMEZONE },
    });
    campusId = campus.id;

    const user = await prisma.bauth_user.create({
      data: { email: IDENTITY.email },
    });
    userId = user.id;

    const talent = await prisma.talent.create({
      data: {
        nom: IDENTITY.nom,
        prenom: IDENTITY.prenom,
        phone: IDENTITY.phone,
        civilite: 'femme',
        niveau: 'seconde',
        userId: user.id,
      },
    });
    talentId = talent.id;

    const form = await prisma.feedback_Form.create({
      data: {
        slug: `pii-form-${stamp}`,
        title: 'Bilan de test',
        status: 'published',
      },
    });
    seeded.formId = form.id;

    const event = await prisma.event.create({
      data: {
        titre: `PiiEvent-${stamp}`,
        publicName: 'Événement de test',
        date: new Date(Date.now() - 30 * 86_400_000),
        endDate: new Date(Date.now() - 29 * 86_400_000),
        campusId,
        feedbackFormId: form.id,
      },
    });
    seeded.eventId = event.id;
    // The year the seeded event actually falls in, not the year today falls in:
    // the two diverge every 31 July, and `stats_school_year_review` refuses a
    // year with no event, so a clock-derived label would fail the test for a
    // reason that has nothing to do with identities.
    seeded.schoolYear = schoolYearOf(event.date, TIMEZONE).label;

    await prisma.participation.create({
      data: {
        talentId: talent.id,
        eventId: event.id,
        campusId,
        sfMemberStatus: 'MEET',
      },
    });
    // A response from the seeded talent, so the feedback answer has a real
    // submission to aggregate rather than an empty one that could not leak.
    await prisma.feedback_Submission.create({
      data: {
        formId: form.id,
        eventId: event.id,
        talentId: talent.id,
        source: 'authenticated',
      },
    });
  });

  afterAll(async () => {
    try {
      await prisma.feedback_Submission.deleteMany({
        where: { formId: seeded.formId },
      });
      await prisma.participation.deleteMany({ where: { talentId } });
      await prisma.talent.deleteMany({ where: { id: talentId } });
      await prisma.bauth_user.deleteMany({ where: { id: userId } });
      await prisma.event.deleteMany({ where: { campusId } });
      await prisma.campus.deleteMany({ where: { id: campusId } });
      await prisma.feedback_Form.deleteMany({ where: { id: seeded.formId } });
    } catch {
      // ignore - the test database is disposable
    }
  });

  // One test per operation rather than a loop with one assertion, so a failure
  // names the operation that leaked instead of the first one that did.
  const reads = Object.entries(ADMIN_API_OPERATIONS).filter(
    ([, operation]) => operation.kind === 'read',
  ) as [AdminApiOperationName, AdminApiOperation][];

  it('has reads to check, so an empty catalogue cannot pass silently', () => {
    expect(reads.length).toBeGreaterThan(15);
  });

  for (const [name, operation] of reads) {
    it(`${name} returns no identity`, async () => {
      // Operations with a required parameter cannot be called blind. They are
      // still exercised, with the seeded ids, rather than dropped from cover.
      const blind = operation.schema.safeParse({});
      const args = blind.success ? blind.data : requiredArgsFor(name, seeded);

      const answer = await operation.run(args as Record<string, unknown>, {
        tier: 'core',
        actorUserId: 'test',
      });
      const serialized = JSON.stringify(answer);

      expect(
        offendingKeys(answer),
        `${name} exposes an identity field`,
      ).toEqual([]);
      for (const [field, value] of Object.entries(IDENTITY)) {
        expect(
          serialized.includes(value),
          `${name} leaked the seeded ${field}`,
        ).toBe(false);
      }

      // Checked here rather than in a unit test because it is the composition in
      // `defineOperation` that has to hold, on every entry, for real answers: a
      // leadership reader cannot open the sync page, so a figure that does not
      // say how old it is lets them quote last week's platform as today's.
      if (operation.leadership) {
        expect(
          answer,
          `${name} answers without its data freshness`,
        ).toHaveProperty('fraicheur.definition');
      }
    });
  }
});

/**
 * Arguments for the operations that require one. Deliberately explicit and
 * exhaustive: a new operation with a required parameter throws here until
 * somebody decides how it should be exercised, rather than quietly dropping out
 * of coverage.
 */
function requiredArgsFor(
  name: AdminApiOperationName,
  seeded: { eventId: string; schoolYear: string },
): Record<string, unknown> {
  switch (name) {
    case 'config_event_detail':
      return { eventId: seeded.eventId };
    case 'stats_school_year_review':
      return { schoolYear: seeded.schoolYear };
    case 'stats_campus_comparison':
      return { schoolYear: seeded.schoolYear };
    // Compared against itself: only one school year is seeded, and an unknown one
    // is refused. Every lycée then reads as retained, which is a fine answer for a
    // test about identities and keeps the churn path exercised end to end.
    case 'stats_schools_churn':
      return {
        schoolYear: seeded.schoolYear,
        compareTo: seeded.schoolYear,
      };
    default:
      throw new Error(
        `${name} requires parameters this guard does not know how to supply. ` +
          'Add them to requiredArgsFor so the operation stays covered.',
      );
  }
}
