/**
 * The comparison a director asked for and the platform could not answer.
 *
 * Two things are worth pinning above all. A favourable share exists only where the
 * answers are ordered, and returning one for a `single` question would be a
 * ranking that is silently wrong - which is worse than one that is absent, because
 * nothing in the answer would say so. And the leftover bucket of public responses
 * that named neither campus nor event must never take a position: an unmeasurable
 * group given a rank reads as the worst campus.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const answerFindMany = vi.fn();
const submissionCount = vi.fn();
const getFormGraphById = vi.fn();

vi.mock('$lib/server/db', () => ({
  prisma: {
    feedback_Answer: { findMany: (args: unknown) => answerFindMany(args) },
    feedback_Submission: { count: (args: unknown) => submissionCount(args) },
  },
}));
vi.mock('$lib/server/feedbackForms', () => ({
  getFormGraphById: (id: string) => getFormGraphById(id),
}));

const { getFeedbackQuestion } = await import('./feedbackQuestion');

/** The four options of the stage bilan's conference question, best first. */
const CONFERENCE_OPTIONS = [
  "J'ai adoré, ça m'a donné envie",
  "Intéressant, j'ai appris des trucs",
  'Sympa sans plus',
  "Ça m'a pas parlé",
];

function form(
  over: { type?: string; labels?: string[]; extra?: boolean } = {},
) {
  const labels = over.labels ?? CONFERENCE_OPTIONS;
  return {
    id: 'form_1',
    title: 'Bilan du stage de seconde',
    questions: [
      {
        id: 'q_conf',
        key: 'conferences',
        prompt: 'Le matin, il y avait les conférences. Tu en as pensé quoi ?',
        type: over.type ?? 'scale',
        identityField: null,
        options: [
          ...labels.map((label, i) => ({
            id: `o${i}`,
            label,
            kind: 'choice',
          })),
          ...(over.extra
            ? [{ id: 'oX', label: 'Absent ce matin', kind: 'extra' }]
            : []),
        ],
      },
      {
        id: 'q_mail',
        key: 'email',
        prompt: 'Ton email ?',
        type: 'text',
        identityField: 'email',
        options: [],
      },
    ],
  };
}

/** One answer row in the shape the service selects. */
function answer(
  optionId: string,
  group: { campus?: string; event?: string } = {},
) {
  return {
    selectedOptions: [{ optionId }],
    submission: {
      respondentCampusLabel: group.campus && !group.event ? group.campus : null,
      event: group.event
        ? {
            titre: `sf-${group.event}`,
            publicName: group.event,
            campus: { name: group.campus ?? 'Lille' },
          }
        : null,
    },
  };
}

beforeEach(() => {
  answerFindMany.mockReset();
  submissionCount.mockReset();
  getFormGraphById.mockReset();
  getFormGraphById.mockResolvedValue(form());
  submissionCount.mockResolvedValue(0);
});

describe('the whole périmètre', () => {
  it('returns the options in the form order, not by popularity', async () => {
    answerFindMany.mockResolvedValue([
      answer('o1'),
      answer('o1'),
      answer('o2'),
      answer('o0'),
    ]);
    submissionCount.mockResolvedValue(4);

    const result = await getFeedbackQuestion(
      {},
      { formId: 'form_1', question: 'conferences' },
    );

    expect(result.options.value.map((o) => o.label)).toEqual(
      CONFERENCE_OPTIONS,
    );
    expect(result.options.value.map((o) => o.count)).toEqual([1, 2, 1, 0]);
  });

  it('computes the answered share so nobody divides downstream', async () => {
    answerFindMany.mockResolvedValue([answer('o0'), answer('o1')]);
    submissionCount.mockResolvedValue(8);

    const result = await getFeedbackQuestion(
      {},
      { formId: 'form_1', question: 'conferences' },
    );

    expect(result.answered.value).toBe(2);
    expect(result.answeredShare.value).toBe(25);
  });

  // Positions 0 and 1 of a four-level scale are the favourable ones.
  it('reads the favourable share off the authored order of a scale', async () => {
    answerFindMany.mockResolvedValue([
      answer('o0'),
      answer('o1'),
      answer('o2'),
      answer('o3'),
    ]);

    const result = await getFeedbackQuestion(
      {},
      { formId: 'form_1', question: 'conferences' },
    );

    expect(result.question.value.ordered).toBe(true);
    expect(result.favourableShare.value).toBe(50);
  });

  it('withholds it for a single-choice question, whose options carry no order', async () => {
    getFormGraphById.mockResolvedValue(form({ type: 'single' }));
    answerFindMany.mockResolvedValue([answer('o0'), answer('o3')]);

    const result = await getFeedbackQuestion(
      {},
      { formId: 'form_1', question: 'conferences' },
    );

    expect(result.question.value.ordered).toBe(false);
    expect(result.favourableShare.value).toBeNull();
    expect(result.favourableShare.definition).toContain('choix unique');
  });

  // An `extra` is a legitimate answer beside the scale, not a level of it, so it
  // must not shift where the favourable third ends.
  it('keeps an extra option out of the scale it sits beside', async () => {
    getFormGraphById.mockResolvedValue(form({ extra: true }));
    answerFindMany.mockResolvedValue([answer('o0'), answer('oX')]);

    const result = await getFeedbackQuestion(
      {},
      { formId: 'form_1', question: 'conferences' },
    );

    expect(result.options.value).toHaveLength(5);
    expect(result.options.value.at(-1)?.kind).toBe('extra');
    // One favourable answer out of two answered, and the extra is not favourable.
    expect(result.favourableShare.value).toBe(50);
  });

  it('answers with no groups block when no grouping was asked for', async () => {
    answerFindMany.mockResolvedValue([answer('o0')]);

    const result = await getFeedbackQuestion(
      {},
      { formId: 'form_1', question: 'conferences' },
    );

    expect(result.groups).toBeNull();
  });
});

describe('grouped by campus', () => {
  it('ranks the campuses on the favourable share, in one call', async () => {
    answerFindMany.mockResolvedValue([
      // Lille: both favourable.
      answer('o0', { campus: 'Lille', event: 'Stage Lille' }),
      answer('o1', { campus: 'Lille', event: 'Stage Lille' }),
      // Lyon: one of two.
      answer('o0', { campus: 'Lyon', event: 'Stage Lyon' }),
      answer('o3', { campus: 'Lyon', event: 'Stage Lyon' }),
      // Nice: none.
      answer('o3', { campus: 'Nice', event: 'Stage Nice' }),
    ]);

    const result = await getFeedbackQuestion(
      {},
      { formId: 'form_1', question: 'conferences', groupBy: 'campus' },
    );

    expect(
      result.groups?.value.map((g) => [g.group, g.favourableShare, g.rank]),
    ).toEqual([
      ['Lille', 100, 1],
      ['Lyon', 50, 2],
      ['Nice', 0, 3],
    ]);
  });

  it('gives tied campuses the same rank', async () => {
    answerFindMany.mockResolvedValue([
      answer('o0', { campus: 'Lille', event: 'Stage Lille' }),
      answer('o0', { campus: 'Nantes', event: 'Stage Nantes' }),
      answer('o3', { campus: 'Nice', event: 'Stage Nice' }),
    ]);

    const result = await getFeedbackQuestion(
      {},
      { formId: 'form_1', question: 'conferences', groupBy: 'campus' },
    );

    expect(result.groups?.value.map((g) => g.rank)).toEqual([1, 1, 3]);
  });

  // A public response that named no campus is not a campus that did badly.
  it('never ranks the leftover bucket', async () => {
    answerFindMany.mockResolvedValue([
      answer('o0', { campus: 'Lille', event: 'Stage Lille' }),
      answer('o0'),
    ]);

    const result = await getFeedbackQuestion(
      {},
      { formId: 'form_1', question: 'conferences', groupBy: 'campus' },
    );

    const leftover = result.groups?.value.find((g) => g.group.includes('non'));
    expect(leftover?.rank).toBeNull();
    expect(leftover?.answered).toBe(1);
  });

  it('reads a public response through its self-reported campus', async () => {
    answerFindMany.mockResolvedValue([answer('o0', { campus: 'Marseille' })]);

    const result = await getFeedbackQuestion(
      {},
      { formId: 'form_1', question: 'conferences', groupBy: 'campus' },
    );

    expect(result.groups?.value.map((g) => g.group)).toEqual(['Marseille']);
  });

  it('leaves every group unranked when the question carries no order', async () => {
    getFormGraphById.mockResolvedValue(form({ type: 'single' }));
    answerFindMany.mockResolvedValue([
      answer('o0', { campus: 'Lille', event: 'Stage Lille' }),
      answer('o3', { campus: 'Lyon', event: 'Stage Lyon' }),
    ]);

    const result = await getFeedbackQuestion(
      {},
      { formId: 'form_1', question: 'conferences', groupBy: 'campus' },
    );

    expect(result.groups?.value.every((g) => g.rank === null)).toBe(true);
  });
});

describe('grouped by event', () => {
  it('names each event as teams and students see it', async () => {
    answerFindMany.mockResolvedValue([
      answer('o0', { campus: 'Lille', event: 'Stage Web Été' }),
    ]);

    const result = await getFeedbackQuestion(
      {},
      { formId: 'form_1', question: 'conferences', groupBy: 'event' },
    );

    expect(result.groups?.value.map((g) => g.group)).toEqual(['Stage Web Été']);
  });
});

describe('refusals', () => {
  it('refuses an unknown form rather than answering zero', async () => {
    getFormGraphById.mockResolvedValue(null);

    await expect(
      getFeedbackQuestion({}, { formId: 'nope', question: 'conferences' }),
    ).rejects.toThrow(/introuvable/);
  });

  // "An unknown scope is a refusal, never a zero", and the refusal has to name
  // the values that would have worked.
  it('refuses an unknown question key and lists the ones that exist', async () => {
    answerFindMany.mockResolvedValue([]);

    await expect(
      getFeedbackQuestion({}, { formId: 'form_1', question: 'conferance' }),
    ).rejects.toThrow(/conferences/);
  });

  // Identity questions never produce an answer row, so they are not askable.
  it('does not offer an identity question as a key', async () => {
    await expect(
      getFeedbackQuestion({}, { formId: 'form_1', question: 'email' }),
    ).rejects.toThrow(/absente du questionnaire/);
  });
});
