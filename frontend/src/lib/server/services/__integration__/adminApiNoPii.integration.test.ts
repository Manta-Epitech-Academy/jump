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

/** Seeded as a student's own sentence, and quoted back by the exception below. */
const SELF_NAMING_QUOTE = `Semaine géniale, merci à tous. ${IDENTITY.prenom} ${IDENTITY.nom}`;

/**
 * The one operation allowed to carry a talent's own words, and therefore the one
 * exempted from the string search below.
 *
 * `stats_closing_testimonials` returns what a student wrote about an event,
 * verbatim and unattributed, because that question exists to collect a quotable
 * line. Verbatim means unfiltered: a student who signs his own sentence is
 * republished signing it. That residual risk was weighed and accepted rather
 * than overlooked, and it is pinned by its own test at the bottom of this file.
 *
 * The structural check still applies to this operation, so a `nom` reappearing
 * in its select fails here like anywhere else. Only the free text is exempt.
 */
const VERBATIM_OPERATIONS = new Set<AdminApiOperationName>([
  'stats_closing_testimonials',
]);

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
  let staffUserId = '';
  /**
   * Values the parameterised operations are exercised with, plus the closing
   * id no read may hand out (see the assertion that hunts for it).
   */
  const seeded = {
    eventId: '',
    formId: '',
    questionKey: 'satisfaction',
    closingQuestionKey: '',
    schoolYear: '',
    closingId: '',
  };

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

    // A form with a real scale question and real options, because the operations
    // that aggregate one walk the question graph: a form with no question at all
    // asserted nothing about the path that reads answers.
    const form = await prisma.feedback_Form.create({
      data: {
        slug: `pii-form-${stamp}`,
        title: 'Bilan de test',
        status: 'published',
        questions: {
          create: {
            key: seeded.questionKey,
            position: 0,
            prompt: 'Les conférences du matin, tu en as pensé quoi ?',
            type: 'scale',
            options: {
              create: [
                { position: 0, label: "J'ai adoré" },
                { position: 1, label: 'Intéressant' },
                { position: 2, label: 'Sympa sans plus' },
                { position: 3, label: "Ça m'a pas parlé" },
              ],
            },
          },
        },
      },
      include: { questions: { include: { options: true } } },
    });
    seeded.formId = form.id;
    const question = form.questions[0];

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

    const participation = await prisma.participation.create({
      data: {
        talentId: talent.id,
        eventId: event.id,
        campusId,
        sfMemberStatus: 'MEET',
      },
    });

    // A conducted closing, so the two operations that read one are exercised
    // on real rows instead of passing over an empty list, which is how the only
    // free-text answer in this catalogue used to assert nothing at all.
    const staff = await prisma.bauth_user.create({
      data: {
        email: `pii.staff.${stamp}@epitech.eu`,
        staffProfile: { create: { staffRole: 'dev', campusId } },
      },
      select: { id: true, staffProfile: { select: { id: true } } },
    });
    staffUserId = staff.id;

    // The grid the closing is conducted with. Seeded here rather than reused
    // from the migration so the suite does not depend on production content: one
    // quotable question (the testimonial) and one rating, which is what the two
    // operations under test read.
    const template = await prisma.closing_Template.create({
      data: {
        key: `pii-grid-${stamp}`,
        label: 'Grille test',
        sections: { create: { position: 0, title: 'Retour' } },
      },
      select: { id: true, sections: { select: { id: true } } },
    });
    const quotable = await prisma.closing_Question.create({
      data: {
        key: `pii-quote-${stamp}`,
        label: "L'événement en une phrase",
        kind: 'text',
        testimonial: true,
      },
    });
    const rating = await prisma.closing_Question.create({
      data: {
        key: `pii-rating-${stamp}`,
        label: 'Satisfaction globale',
        kind: 'rating',
        max: 5,
      },
    });
    seeded.closingQuestionKey = rating.key;
    await prisma.closing_TemplateQuestion.createMany({
      data: [
        {
          templateId: template.id,
          sectionId: template.sections[0].id,
          questionId: quotable.id,
          position: 0,
        },
        {
          templateId: template.id,
          sectionId: template.sections[0].id,
          questionId: rating.id,
          position: 1,
        },
      ],
    });

    const closing = await prisma.closing_Record.create({
      data: {
        talentId: talent.id,
        staffId: staff.staffProfile!.id,
        campusId,
        participationId: participation.id,
        templateId: template.id,
        status: 'done',
        recommendation: 'bon_profil',
        // Staff prose about a named minor, which no tier may ever read. Seeded
        // precisely so the string search has something to catch if it does.
        verdictNote: `Très bon échange avec ${IDENTITY.prenom}.`,
        answers: {
          create: [
            { questionId: quotable.id, freeText: SELF_NAMING_QUOTE },
            {
              questionId: rating.id,
              ratingValue: 5,
              // The team's note under a question: the other half of the prose a
              // closing holds about a minor, and equally out of bounds.
              note: `${IDENTITY.prenom} a beaucoup parlé de sa prof de NSI.`,
            },
          ],
        },
      },
    });
    seeded.closingId = closing.id;

    // A response from the seeded talent, so the feedback answer has a real
    // submission to aggregate rather than an empty one that could not leak, and
    // a real answer on it so the option tally is exercised too.
    await prisma.feedback_Submission.create({
      data: {
        formId: form.id,
        eventId: event.id,
        talentId: talent.id,
        source: 'authenticated',
        answers: {
          create: {
            questionId: question.id,
            selectedOptions: {
              create: { optionId: question.options[0].id },
            },
          },
        },
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
      // The staff account too: its profile, and the closing hanging off it,
      // cascade away with it.
      await prisma.bauth_user.deleteMany({
        where: { id: { in: [userId, staffUserId] } },
      });
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

  it('has reads to check and rows to find, so nothing here passes vacuously', () => {
    expect(reads.length).toBeGreaterThan(15);
    // An empty needle is found in every haystack, which would turn the closing
    // assertion below into a permanent, baffling failure.
    expect(seeded.closingId).not.toBe('');
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
        origin: 'http://localhost',
      });
      const serialized = JSON.stringify(answer);

      expect(
        offendingKeys(answer),
        `${name} exposes an identity field`,
      ).toEqual([]);
      if (!VERBATIM_OPERATIONS.has(name)) {
        for (const [field, value] of Object.entries(IDENTITY)) {
          expect(
            serialized.includes(value),
            `${name} leaked the seeded ${field}`,
          ).toBe(false);
        }
      }

      // A different rule from the identity ones, and it holds for every read,
      // exempt or not. `ops_reset_closing` is an irreversible delete and is
      // allowed to be a tool for exactly one reason: no read hands out an
      // closing id, so a model can carry out a reset on an id a human gave it
      // and can never choose the target itself. That was doctrine with nothing
      // enforcing it, so an id slipped into a select would have quietly moved
      // the write into "never a tool" (see the class C table in AGENTS.md).
      expect(
        serialized.includes(seeded.closingId),
        `${name} returns a closing id, which only an irreversible write can spend`,
      ).toBe(false);

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

  // Pinned rather than left implicit. This is the single hole in "no identity at
  // any tier", it was opened knowingly, and it also proves the seeded closing
  // reaches this operation: the check above is exempt here, so without this the
  // one answer carrying free text would be asserting on an empty list again.
  it('returns a self-naming testimonial whole, the one documented exception', async () => {
    const answer = (await ADMIN_API_OPERATIONS.stats_closing_testimonials.run(
      {},
      { tier: 'leadership', actorUserId: 'test', origin: 'http://localhost' },
    )) as { testimonials: { value: { quote: string }[] } };

    expect(answer.testimonials.value.map((row) => row.quote)).toContain(
      SELF_NAMING_QUOTE,
    );
  });
});

/**
 * Arguments for the operations that require one. Deliberately explicit and
 * exhaustive: a new operation with a required parameter throws here until
 * somebody decides how it should be exercised, rather than quietly dropping out
 * of coverage.
 */
function requiredArgsFor(
  name: AdminApiOperationName,
  seeded: {
    eventId: string;
    formId: string;
    questionKey: string;
    closingQuestionKey: string;
    schoolYear: string;
  },
): Record<string, unknown> {
  switch (name) {
    case 'config_event_detail':
      return { eventId: seeded.eventId };
    // The seeded certificate. This one really renders a browser page, which is
    // slower than the rest of this suite and worth it: the preview is the answer
    // most likely to carry something it should not, being an image of a document
    // with a name on it. It must be a placeholder name, never a seeded talent.
    case 'config_diploma_template_preview':
      return { code: 'stage' };
    // Grouped by campus on purpose: the grouped branch is the one that ranks, and
    // a ranking is where a name would surface if a group were ever labelled by a
    // person rather than by a campus.
    case 'stats_feedback_question':
      return {
        formId: seeded.formId,
        question: seeded.questionKey,
        groupBy: 'campus',
      };
    // Grouped by grid, the axis this operation has and the feedback one does
    // not: it is also the branch that labels a row with something read out of
    // the database rather than with a campus name, which is where a leak would
    // show up first.
    case 'stats_closing_question':
      return { questionKey: seeded.closingQuestionKey, groupBy: 'grid' };
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
