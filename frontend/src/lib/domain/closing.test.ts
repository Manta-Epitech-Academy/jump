import { describe, it, expect } from 'vitest';
import {
  toClosingGrid,
  gridQuestions,
  testimonialQuestion,
  CLOSING_NOTE_LIMIT,
  CLOSING_FAVOURABLE_RECOMMENDATIONS,
  CLOSING_RECOMMENDATION_DISPLAY_ORDER,
  type StoredClosingTemplate,
} from './closing';
import { closingAnswersIssues } from '$lib/validation/closings';
import type { ClosingConductForm } from '$lib/validation/closings';

/**
 * The projection between a stored grid and every surface that renders one.
 *
 * It is the seam the whole refactor turns on: the questionnaire is data now, so
 * a renderer that guessed wrong here would not fail, it would quietly render an
 * empty closing. These assertions are what make that loud.
 */

const question = (
  over: Partial<
    StoredClosingTemplate['sections'][0]['questions'][0]['question']
  > = {},
) => ({
  id: 'q1',
  key: 'discovery_channel',
  label: 'Comment as-tu connu cet événement ?',
  hint: null,
  kind: 'single' as const,
  max: null,
  maxLength: null,
  placeholder: null,
  notePlaceholder: 'Une précision…',
  testimonial: false,
  options: [
    { id: 'o1', value: 'site', label: 'Site', tone: 'positive', icon: null },
    { id: 'o2', value: 'autre', label: 'Autre', tone: null, icon: null },
  ],
  ...over,
});

const stored = (
  over: Partial<StoredClosingTemplate> = {},
): StoredClosingTemplate => ({
  id: 't1',
  key: 'stage_seconde',
  label: 'Closing stage',
  sections: [
    {
      id: 's1',
      position: 0,
      synthesisPosition: null,
      title: 'Motivation',
      questions: [
        {
          sectionId: 's1',
          position: 0,
          labelOverride: null,
          withNote: true,
          question: question(),
        },
      ],
    },
  ],
  ...over,
});

describe('toClosingGrid', () => {
  it('should read a grid aloud with its own wording while keeping the canonical name', () => {
    // Arrange: the grid phrases the bank question its own way, which is what
    // lets a Coding Club ask a stage question in its own words.
    const template = stored();
    template.sections[0].questions[0].labelOverride =
      'Comment as-tu connu ce stage ?';
    // Act
    const grid = toClosingGrid(template);
    // Assert
    const [q] = gridQuestions(grid);
    expect(q.label).toBe('Comment as-tu connu ce stage ?');
    expect(q.canonicalLabel).toBe('Comment as-tu connu cet événement ?');
  });

  it('should offer a note only where the grid asks for one', () => {
    const withNote = toClosingGrid(stored());
    expect(gridQuestions(withNote)[0].note).toEqual({
      placeholder: 'Une précision…',
      maxLength: CLOSING_NOTE_LIMIT,
    });

    // A three-hour afternoon wants none, and that is the grid's call, not the
    // question's.
    const template = stored();
    template.sections[0].questions[0].withNote = false;
    expect(gridQuestions(toClosingGrid(template))[0].note).toBeNull();
  });

  it('should drop a tone or icon token the components cannot resolve', () => {
    // Arrange: a token retired from the closed vocabulary after the row was
    // written. Passing it through would index a closed map to `undefined` and
    // render an unstyled chip.
    const template = stored();
    template.sections[0].questions[0].question.options = [
      { id: 'o1', value: 'a', label: 'A', tone: 'chartreuse', icon: 'sparkle' },
      { id: 'o2', value: 'b', label: 'B', tone: 'positive', icon: 'dev' },
    ];
    // Act
    const [q] = gridQuestions(toClosingGrid(template));
    // Assert
    expect(q.options[0].tone).toBeUndefined();
    expect(q.options[0].icon).toBeUndefined();
    expect(q.options[1]).toMatchObject({ tone: 'positive', icon: 'dev' });
  });

  it('should read a grid back in its synthesis order, not its conduct order', () => {
    // Arrange: the stage grid opens on Motivation to warm the student up and
    // reads back "Retour" first, because the freshest takeaway is the useful one.
    const template = stored({
      sections: [
        {
          id: 's1',
          position: 0,
          synthesisPosition: 1,
          title: 'Motivation',
          questions: [],
        },
        {
          id: 's2',
          position: 1,
          synthesisPosition: 0,
          title: 'Retour',
          questions: [],
        },
      ],
    });
    // Act
    const grid = toClosingGrid(template);
    // Assert
    expect(grid.sections.map((s) => s.title)).toEqual(['Motivation', 'Retour']);
    expect(grid.synthesisSections.map((s) => s.title)).toEqual([
      'Retour',
      'Motivation',
    ]);
  });

  it('should follow the conduct order when a grid states no preference', () => {
    const grid = toClosingGrid(stored());
    expect(grid.synthesisSections.map((s) => s.id)).toEqual(
      grid.sections.map((s) => s.id),
    );
  });

  /**
   * The claim this whole refactor makes: a new closing costs a composition over
   * the existing bank, and no migration. Asserted rather than demonstrated by
   * inventing a Coding Club question set, which is the team's to write.
   */
  it('should resolve a second grid composed purely over existing bank questions', () => {
    // Arrange: the same bank rows, a shorter composition, its own wording.
    const shared = question();
    const codingClub = stored({
      id: 't2',
      key: 'coding_club',
      label: 'Closing Coding Club',
      sections: [
        {
          id: 's9',
          position: 0,
          synthesisPosition: null,
          title: 'Retour',
          questions: [
            {
              sectionId: 's9',
              position: 0,
              labelOverride: "Comment as-tu connu l'après-midi ?",
              withNote: false,
              question: shared,
            },
          ],
        },
      ],
    });
    // Act
    const grid = toClosingGrid(codingClub);
    // Assert: same question row, so a distribution legitimately spans both.
    const [q] = gridQuestions(grid);
    expect(q.id).toBe('q1');
    expect(q.key).toBe('discovery_channel');
    expect(q.label).toBe("Comment as-tu connu l'après-midi ?");
    expect(q.note).toBeNull();
  });

  it('should name the one question a grid marks quotable', () => {
    expect(testimonialQuestion(toClosingGrid(stored()))).toBeNull();

    const template = stored();
    template.sections[0].questions[0].question = question({
      id: 'q2',
      key: 'one_sentence',
      kind: 'text',
      testimonial: true,
      options: [],
    });
    expect(testimonialQuestion(toClosingGrid(template))?.key).toBe(
      'one_sentence',
    );
  });
});

describe('closingAnswersIssues', () => {
  const form = (
    answers: ClosingConductForm['answers'],
  ): ClosingConductForm => ({
    participationId: 'p1',
    answers,
    recommendation: null,
    verdictNote: '',
  });
  const answer = (
    over: Partial<ClosingConductForm['answers'][string]> = {},
  ) => ({
    selectedIds: [],
    ratingValue: null,
    freeText: '',
    note: '',
    ...over,
  });

  it('should accept an answer the grid actually offers', () => {
    const grid = toClosingGrid(stored());
    expect(
      closingAnswersIssues(form({ q1: answer({ selectedIds: ['o1'] }) }), grid),
    ).toEqual([]);
  });

  it('should refuse a question the grid does not ask', () => {
    const grid = toClosingGrid(stored());
    const issues = closingAnswersIssues(form({ nope: answer() }), grid);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("grille de l'événement");
  });

  it('should refuse an option the question does not offer', () => {
    const grid = toClosingGrid(stored());
    const issues = closingAnswersIssues(
      form({ q1: answer({ selectedIds: ['from-another-question'] }) }),
      grid,
    );
    expect(issues[0].message).toContain('Réponse inconnue');
  });

  it('should refuse two answers to a single-choice question', () => {
    const grid = toClosingGrid(stored());
    const issues = closingAnswersIssues(
      form({ q1: answer({ selectedIds: ['o1', 'o2'] }) }),
      grid,
    );
    expect(issues[0].message).toContain("qu'une seule réponse");
  });

  it('should refuse a rating off the question own scale', () => {
    const template = stored();
    template.sections[0].questions[0].question = question({
      id: 'q3',
      key: 'satisfaction',
      kind: 'rating',
      max: 5,
      options: [],
    });
    const grid = toClosingGrid(template);
    expect(
      closingAnswersIssues(form({ q3: answer({ ratingValue: 5 }) }), grid),
    ).toEqual([]);
    expect(
      closingAnswersIssues(form({ q3: answer({ ratingValue: 6 }) }), grid)[0]
        .message,
    ).toContain('hors barème');
  });

  it('should refuse a note on a question this grid invites none for', () => {
    const template = stored();
    template.sections[0].questions[0].withNote = false;
    const grid = toClosingGrid(template);
    const issues = closingAnswersIssues(
      form({ q1: answer({ note: 'une note' }) }),
      grid,
    );
    expect(issues[0].message).toContain("n'attend pas de note");
  });
});

describe('CLOSING_FAVOURABLE_RECOMMENDATIONS', () => {
  // Derived from the display order, so this pins the derivation rather than the
  // list: the point is that nobody has to decide twice what a good verdict is.
  it('is the two most compatible verdicts, in display order', () => {
    expect(CLOSING_FAVOURABLE_RECOMMENDATIONS).toEqual([
      'tres_compatible',
      'bon_profil',
    ]);
  });

  it('takes them from the front of the display order', () => {
    expect(CLOSING_RECOMMENDATION_DISPLAY_ORDER.slice(0, 2)).toEqual([
      ...CLOSING_FAVOURABLE_RECOMMENDATIONS,
    ]);
  });
});
