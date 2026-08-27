/**
 * The comparison the question bank was designed to make possible, and which no
 * operation served.
 *
 * Three things are worth pinning. `asked` comes from the grids, so a closing
 * conducted with a grid that never carries the question is not a cohort that
 * declined to answer. A ranking exists only where the question declares an order,
 * because one that is silently wrong is worse than one that is absent - nothing in
 * the answer would say so. And grouping by grid has to split ONE bank question
 * back across two formats: that is the whole reason the bank is global.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const questionFindUnique = vi.fn();
const templateQuestionFindMany = vi.fn();
const recordFindMany = vi.fn();

vi.mock('$lib/server/db', () => ({
  prisma: {
    closing_Question: {
      findUnique: (args: unknown) => questionFindUnique(args),
    },
    closing_TemplateQuestion: {
      findMany: (args: unknown) => templateQuestionFindMany(args),
    },
    closing_Record: { findMany: (args: unknown) => recordFindMany(args) },
  },
}));
vi.mock('./cohort', () => ({
  participationWhere: () => Promise.resolve({}),
  scopeLabels: () => ({
    schoolYear: 'toutes',
    campus: 'tous',
    event: 'tous',
  }),
}));

const { getClosingQuestion } = await import('./closingQuestion');

type Option = { id: string; value: string; label: string; tone: string | null };

/** "Ça t'a donné envie d'aller plus loin dans la tech ?", valence declared. */
const TONED: Option[] = [
  { id: 'o_oui', value: 'oui', label: 'Oui carrément', tone: 'positive' },
  { id: 'o_peut', value: 'peut_etre', label: 'Peut-être', tone: 'neutral' },
  {
    id: 'o_non',
    value: 'pas_maintenant',
    label: 'Pas pour le moment',
    tone: 'negative',
  },
];

/** A channel is a set: no channel is "better" than another. */
const UNTONED: Option[] = [
  { id: 'o_site', value: 'site', label: 'Site 1élève1stage', tone: null },
  { id: 'o_ent', value: 'entourage', label: 'Mon entourage', tone: null },
];

function question(
  over: {
    kind?: string;
    max?: number | null;
    options?: Option[];
    key?: string;
  } = {},
) {
  return {
    id: 'q_1',
    key: over.key ?? 'wants_more',
    label: 'Ça t’a donné envie d’aller plus loin dans la tech ?',
    kind: over.kind ?? 'single',
    max: over.max ?? null,
    options: over.options ?? TONED,
  };
}

type Record_ = {
  templateId: string;
  campus: string;
  eventId?: string;
  optionIds?: string[];
  rating?: number | null;
};

function seed(options: {
  question?: ReturnType<typeof question>;
  askedBy?: { id: string; label: string }[];
  records: Record_[];
}) {
  questionFindUnique.mockResolvedValue(options.question ?? question());
  templateQuestionFindMany.mockResolvedValue(
    (options.askedBy ?? [{ id: 'grid_stage', label: 'Stage de seconde' }]).map(
      (template) => ({ template }),
    ),
  );
  recordFindMany.mockResolvedValue(
    options.records.map((r) => ({
      templateId: r.templateId,
      participation: {
        event: {
          id: r.eventId ?? 'evt',
          titre: 'Stage de Seconde',
          publicName: null,
          campus: { name: r.campus },
        },
      },
      answers:
        r.optionIds || r.rating != null
          ? [
              {
                ratingValue: r.rating ?? null,
                selectedOptions: (r.optionIds ?? []).map((optionId) => ({
                  optionId,
                })),
              },
            ]
          : [],
    })),
  );
}

beforeEach(() => {
  questionFindUnique.mockReset();
  templateQuestionFindMany.mockReset();
  recordFindMany.mockReset();
});

describe('getClosingQuestion', () => {
  it('counts as asked only the closings whose grid carries the question', async () => {
    seed({
      askedBy: [{ id: 'grid_stage', label: 'Stage de seconde' }],
      records: [
        { templateId: 'grid_stage', campus: 'Lille', optionIds: ['o_oui'] },
        // Conducted with a grid that does not ask it: never given the chance.
        { templateId: 'grid_club', campus: 'Lille' },
      ],
    });

    const answer = await getClosingQuestion({}, { questionKey: 'wants_more' });

    expect(answer.closings.value).toBe(2);
    expect(answer.asked.value).toBe(1);
    expect(answer.answered.value).toBe(1);
    expect(answer.answeredShare.value).toBe(100);
  });

  it('ranks campuses on the favourable share when the options declare a valence', async () => {
    seed({
      records: [
        { templateId: 'grid_stage', campus: 'Lille', optionIds: ['o_oui'] },
        { templateId: 'grid_stage', campus: 'Lille', optionIds: ['o_non'] },
        { templateId: 'grid_stage', campus: 'Nantes', optionIds: ['o_oui'] },
      ],
    });

    const answer = await getClosingQuestion(
      {},
      { questionKey: 'wants_more', groupBy: 'campus' },
    );

    expect(answer.favourableShare.value).toBe(66.7);
    expect(
      answer.groups?.value.map((g) => [g.group, g.favourableShare, g.rank]),
    ).toEqual([
      ['Nantes', 100, 1],
      ['Lille', 50, 2],
    ]);
  });

  it('leaves an unordered question unranked rather than ordering it on an option', async () => {
    seed({
      question: question({ key: 'discovery_channel', options: UNTONED }),
      records: [
        { templateId: 'grid_stage', campus: 'Lille', optionIds: ['o_site'] },
        { templateId: 'grid_stage', campus: 'Nantes', optionIds: ['o_ent'] },
      ],
    });

    const answer = await getClosingQuestion(
      {},
      { questionKey: 'discovery_channel', groupBy: 'campus' },
    );

    expect(answer.question.value.ordered).toBe(false);
    expect(answer.favourableShare.value).toBeNull();
    expect(answer.groups?.value.map((g) => [g.group, g.rank])).toEqual([
      ['Lille', null],
      ['Nantes', null],
    ]);
  });

  it('ranks a rating question on its average, and reports no favourable share', async () => {
    seed({
      question: question({
        key: 'satisfaction',
        kind: 'rating',
        max: 5,
        options: [],
      }),
      records: [
        { templateId: 'grid_stage', campus: 'Lille', rating: 5 },
        { templateId: 'grid_stage', campus: 'Lille', rating: 3 },
        { templateId: 'grid_stage', campus: 'Nantes', rating: 5 },
      ],
    });

    const answer = await getClosingQuestion(
      {},
      { questionKey: 'satisfaction', groupBy: 'campus' },
    );

    expect(answer.average.value).toBe(4.33);
    expect(answer.favourableShare.value).toBeNull();
    expect(
      answer.groups?.value.map((g) => [g.group, g.average, g.rank]),
    ).toEqual([
      ['Nantes', 5, 1],
      ['Lille', 4, 2],
    ]);
    // One line per level of the scale, so a note reads like any other answer.
    expect(answer.options.value.map((o) => o.count)).toEqual([0, 0, 1, 0, 2]);
  });

  it('splits one bank question back across the formats that ask it', async () => {
    seed({
      askedBy: [
        { id: 'grid_stage', label: 'Stage de seconde' },
        { id: 'grid_club', label: 'Coding Club' },
      ],
      records: [
        { templateId: 'grid_stage', campus: 'Lille', optionIds: ['o_oui'] },
        { templateId: 'grid_stage', campus: 'Lille', optionIds: ['o_non'] },
        { templateId: 'grid_club', campus: 'Lille', optionIds: ['o_oui'] },
      ],
    });

    const answer = await getClosingQuestion(
      {},
      { questionKey: 'wants_more', groupBy: 'grid' },
    );

    expect(answer.question.value.grids).toEqual([
      'Stage de seconde',
      'Coding Club',
    ]);
    expect(
      answer.groups?.value.map((g) => [g.group, g.asked, g.favourableShare]),
    ).toEqual([
      ['Coding Club', 1, 100],
      ['Stage de seconde', 2, 50],
    ]);
  });

  it('refuses a free-text question rather than answering with an empty split', async () => {
    seed({
      question: question({ key: 'one_sentence', kind: 'text', options: [] }),
      records: [],
    });

    await expect(
      getClosingQuestion({}, { questionKey: 'one_sentence' }),
    ).rejects.toThrow(/rédigée/);
  });

  it('refuses a key the bank does not hold, naming where keys come from', async () => {
    questionFindUnique.mockResolvedValue(null);

    await expect(
      getClosingQuestion({}, { questionKey: 'inexistante' }),
    ).rejects.toThrow(/config_closing_questions/);
  });
});
