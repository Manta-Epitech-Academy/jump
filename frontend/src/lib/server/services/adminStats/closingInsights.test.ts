/**
 * The coverage base, which is the figure this file was rewritten for.
 *
 * It had no test at all, and that is why it could be quoted and wrong at the same
 * time for a release: the denominator counted every enrolment in the périmètre,
 * so 255 events that conduct no closing sat in it and a national rate of 78 %
 * reported as 18 %. Nothing failed, because nothing looked.
 *
 * Two halves are pinned separately on purpose, because only one of them is
 * obvious. That an event without the Closings section is out is easy to keep
 * right. That an event WITH the section and no grid is also out is the half that
 * looks redundant and is not: those events exist on the real data, they are
 * exactly the configuration gap the rate was mistaken for, and the difference
 * between `!== ''` and `!= null` on the view model silently readmits every one of
 * them.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AdminEventVM } from '$lib/server/services/events';

const participationCount = vi.fn();
const recordFindMany = vi.fn();
const templateFindMany = vi.fn();

vi.mock('$lib/server/db', () => ({
  prisma: {
    participation: { count: (args: unknown) => participationCount(args) },
    closing_Record: { findMany: (args: unknown) => recordFindMany(args) },
    closing_Template: { findMany: (args: unknown) => templateFindMany(args) },
  },
}));

const scopedEvents = vi.fn();
vi.mock('./cohort', () => ({
  scopedEvents: (scope: unknown) => scopedEvents(scope),
  participationWhere: () => Promise.resolve({}),
  scopeLabels: () => ({
    schoolYear: 'toutes',
    campus: 'tous',
    event: 'tous',
  }),
}));

const { getClosingInsights } = await import('./closingInsights');

/**
 * Both gate halves are always spelled out, never defaulted.
 *
 * `campusComparison.test.ts` left `closingTemplateId` off its fixture, so it was
 * `undefined`, and `undefined !== ''` is true: every test there passed on the
 * module half alone and the grid half was never exercised.
 */
function event(over: Partial<AdminEventVM> = {}): AdminEventVM {
  return {
    id: 'evt',
    campusName: 'Lille',
    campusId: 'campus_lille',
    schoolYearLabel: '2025-2026',
    status: 'past',
    participations: 0,
    modules: [],
    closingTemplateId: '',
    ...over,
  } as AdminEventVM;
}

/** An event that actually conducts closings: section on AND a grid named. */
const runsClosings = (over: Partial<AdminEventVM> = {}) =>
  event({ modules: ['closings'], closingTemplateId: 'clt', ...over });

type Enrolment = { eventId: string };
type Closing = {
  eventId: string;
  status?: 'done' | 'in_progress';
  recommendation?: string | null;
};

/** The `eventId: { in: [...] }` the concerned count carries, absent on the total. */
function narrowedTo(where: unknown): Set<string> | null {
  const and = ((where as { AND?: unknown[] }).AND ?? []) as {
    eventId?: { in?: string[] };
  }[];
  const ids = and.find((clause) => clause.eventId?.in)?.eventId?.in;
  return ids ? new Set(ids) : null;
}

function seed(options: {
  events: AdminEventVM[];
  enrolments: Enrolment[];
  closings?: Closing[];
}) {
  scopedEvents.mockResolvedValue({
    events: options.events,
    availableSchoolYears: ['2025-2026'],
  });
  // The service takes two counts off one `where`: every visible enrolment, then
  // the ones on the events it named. Answered by filtering the same fixture, so a
  // test cannot pass by agreeing with a denominator it did not pick.
  participationCount.mockImplementation((args: { where: unknown }) => {
    const ids = narrowedTo(args.where);
    return Promise.resolve(
      ids
        ? options.enrolments.filter((e) => ids.has(e.eventId)).length
        : options.enrolments.length,
    );
  });
  recordFindMany.mockResolvedValue(
    (options.closings ?? []).map((c) => ({
      status: c.status ?? 'done',
      recommendation: c.recommendation ?? null,
      templateId: 'clt',
      participation: { eventId: c.eventId },
      answers: [],
    })),
  );
  // No grid graph: the per-question distributions have their own tests, and this
  // file is about the base every one of them is read against.
  templateFindMany.mockResolvedValue([]);
}

beforeEach(() => {
  participationCount.mockReset();
  recordFindMany.mockReset();
  templateFindMany.mockReset();
  scopedEvents.mockReset();
});

describe('getClosingInsights, the coverage base', () => {
  it('divides by the enrolments of the events that run closings, not the périmètre', async () => {
    seed({
      events: [
        runsClosings({ id: 'stage' }),
        // No section: its 8 enrolments are a configuration fact about the format,
        // not a team that failed to conduct closings.
        event({ id: 'club' }),
      ],
      enrolments: [
        { eventId: 'stage' },
        { eventId: 'stage' },
        { eventId: 'stage' },
        { eventId: 'stage' },
        ...Array.from({ length: 8 }, () => ({ eventId: 'club' })),
      ],
      closings: [
        { eventId: 'stage' },
        { eventId: 'stage' },
        { eventId: 'stage' },
      ],
    });

    const insights = await getClosingInsights();

    // 3 of the 4 concerned enrolments. Over the whole périmètre it would read 25 %.
    expect(insights.coverage.value).toBe(75);
    expect(insights.enrolments.value).toBe(12);
    expect(insights.enrolmentsConcerned.value).toBe(4);
  });

  it('leaves out an event whose section is on but which names no grid', async () => {
    seed({
      events: [
        runsClosings({ id: 'stage' }),
        // The half a `!= null` on the view model would silently readmit: the
        // section is enabled, so it looks configured, but it holds no grid and
        // therefore no closing.
        event({ id: 'sans-grille', modules: ['closings'] }),
      ],
      enrolments: [
        { eventId: 'stage' },
        { eventId: 'sans-grille' },
        { eventId: 'sans-grille' },
        { eventId: 'sans-grille' },
      ],
      closings: [{ eventId: 'stage' }],
    });

    const insights = await getClosingInsights();

    expect(insights.eventsRunningClosings.value).toBe(1);
    expect(insights.enrolmentsConcerned.value).toBe(1);
    expect(insights.coverage.value).toBe(100);
  });

  it('reports the configuration gap as its own figure rather than as a low rate', async () => {
    seed({
      events: [
        runsClosings({ id: 'stage' }),
        event({ id: 'club' }),
        event({ id: 'jpo' }),
        event({ id: 'sans-grille', modules: ['closings'] }),
      ],
      enrolments: [{ eventId: 'stage' }],
      closings: [{ eventId: 'stage' }],
    });

    const insights = await getClosingInsights();

    expect(insights.events.value).toBe(4);
    expect(insights.eventsRunningClosings.value).toBe(1);
    expect(insights.eventsRunningClosingsShare.value).toBe(25);
    expect(insights.coverage.value).toBe(100);
  });

  it('keeps the numerator on the same events, so a grid removed afterwards cannot pass 100 %', async () => {
    seed({
      events: [
        runsClosings({ id: 'stage' }),
        // Its grid was detached after the fact. The closings conducted with it
        // still exist, and counting them against the remaining denominator is
        // what would report more closings than inscriptions.
        event({ id: 'retire' }),
      ],
      enrolments: [{ eventId: 'stage' }, { eventId: 'retire' }],
      closings: [
        { eventId: 'stage' },
        { eventId: 'retire' },
        { eventId: 'retire' },
      ],
    });

    const insights = await getClosingInsights();

    expect(insights.coverage.value).toBe(100);
    // The closings themselves are never hidden: three were conducted, and the
    // count says so even though only one of them bears on the rate.
    expect(insights.closings.value).toBe(3);
  });

  it('counts « à faire » on the same base as the coverage rate', async () => {
    seed({
      events: [runsClosings({ id: 'stage' }), event({ id: 'club' })],
      enrolments: [
        { eventId: 'stage' },
        { eventId: 'stage' },
        { eventId: 'stage' },
        { eventId: 'stage' },
        { eventId: 'club' },
      ],
      closings: [{ eventId: 'stage' }],
    });

    const insights = await getClosingInsights();

    const todo = insights.byStatus.value.find((row) => row.value === 'todo');
    // 3 of the 4 concerned inscriptions, and the club's is in neither half.
    expect(todo).toMatchObject({ count: 3, share: 75 });
  });

  it('is unmeasured, never zero, when nothing in the périmètre runs closings', async () => {
    seed({
      events: [event({ id: 'club' })],
      enrolments: [{ eventId: 'club' }, { eventId: 'club' }],
    });

    const insights = await getClosingInsights();

    expect(insights.eventsRunningClosings.value).toBe(0);
    expect(insights.enrolmentsConcerned.value).toBe(0);
    expect(insights.coverage.value).toBeNull();
  });
});

/**
 * The verdict share, which is the addition a director was making out loud from
 * the four separate shares.
 */
describe('getClosingInsights, the favourable verdict share', () => {
  it('shares the two most compatible verdicts against the verdicts given', async () => {
    seed({
      events: [runsClosings({ id: 'stage' })],
      enrolments: [{ eventId: 'stage' }],
      closings: [
        { eventId: 'stage', recommendation: 'tres_compatible' },
        { eventId: 'stage', recommendation: 'bon_profil' },
        { eventId: 'stage', recommendation: 'indecis' },
        { eventId: 'stage', recommendation: 'pas_interesse' },
        // Still open. Counting it would read as an unfavourable verdict when no
        // verdict has been reached at all.
        { eventId: 'stage', status: 'in_progress', recommendation: null },
      ],
    });

    const insights = await getClosingInsights();

    expect(insights.favourableVerdictShare.value).toBe(50);
    // And it agrees with the detailed split beside it, which is why both read the
    // same rows rather than one being derived from the other's output.
    const detailed = insights.recommendation.value;
    const favourable = detailed
      .filter((row) => ['tres_compatible', 'bon_profil'].includes(row.value))
      .reduce((sum, row) => sum + (row.share ?? 0), 0);
    expect(favourable).toBe(50);
  });

  it('is null when no verdict has been recorded anywhere', async () => {
    seed({
      events: [runsClosings({ id: 'stage' })],
      enrolments: [{ eventId: 'stage' }],
      closings: [
        { eventId: 'stage', status: 'in_progress', recommendation: null },
      ],
    });

    const insights = await getClosingInsights();

    expect(insights.favourableVerdictShare.value).toBeNull();
  });
});
