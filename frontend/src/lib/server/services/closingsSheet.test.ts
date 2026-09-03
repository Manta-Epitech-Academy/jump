import { describe, it, expect } from 'vitest';
import {
  buildClosingsSheet,
  type ClosingForSheet,
  type ClosingsSheetRosterRow,
} from './closingsSheet';
import {
  toClosingGrid,
  type ClosingGrid,
  type StoredClosingQuestion,
  type StoredClosingTemplate,
} from '$lib/domain/closing';

/**
 * The column algebra of the closings export.
 *
 * Two things here can be silently wrong and neither shows up in a render: which
 * rows exist, and what a blank cell means. A closing outlives its enrolment on
 * purpose (the Salesforce sync prunes participations), so a sheet built off the
 * roster alone hides work that was done; and a question one grid asks and
 * another does not has to read as "not asked" rather than as an empty answer.
 */

const CHOICE: StoredClosingQuestion = {
  id: 'q_choice',
  key: 'tech_projection',
  label: 'Vers quels métiers tu te projettes ?',
  hint: null,
  kind: 'multi' as const,
  max: null,
  maxLength: null,
  placeholder: null,
  notePlaceholder: 'Une nuance…',
  testimonial: false,
  options: [
    { id: 'o_dev', value: 'dev', label: 'Dev', tone: null, icon: 'dev' },
    { id: 'o_cyber', value: 'cyber', label: 'Cyber', tone: null, icon: null },
  ],
};

const RATING: StoredClosingQuestion = {
  ...CHOICE,
  id: 'q_rating',
  key: 'satisfaction',
  label: 'Satisfaction globale',
  kind: 'rating' as const,
  max: 5,
  options: [],
};

/** A question only the club grid asks, so it can never be on the stage grid. */
const CLUB_ONLY: StoredClosingQuestion = {
  ...CHOICE,
  id: 'q_club',
  key: 'club_format',
  label: 'Le format du club te convient ?',
  kind: 'text' as const,
  options: [],
};

const templateWith = (
  id: string,
  questions: {
    question: StoredClosingQuestion;
    labelOverride?: string | null;
    /** Whether this grid offers the team a note under the question. */
    withNote?: boolean;
  }[],
): StoredClosingTemplate => ({
  id,
  key: `grid_${id}`,
  label: `Grille ${id}`,
  sections: [
    {
      id: `${id}_s1`,
      position: 0,
      synthesisPosition: null,
      title: 'Orientation',
      questions: questions.map((q, position) => ({
        sectionId: `${id}_s1`,
        position,
        labelOverride: q.labelOverride ?? null,
        withNote: q.withNote ?? true,
        question: q.question,
      })),
    },
  ],
});

const stageGrid = toClosingGrid(
  templateWith('t_stage', [
    { question: CHOICE },
    { question: RATING, labelOverride: 'Satisfaction globale du stage' },
  ]),
);
const clubGrid = toClosingGrid(
  templateWith('t_club', [{ question: CHOICE }, { question: CLUB_ONLY }]),
);

const grids = (...list: ClosingGrid[]): Map<string, ClosingGrid> =>
  new Map(list.map((g) => [g.templateId, g]));

const person = (n: string): ClosingsSheetRosterRow => ({
  talentId: `talent_${n}`,
  prenom: n,
  nom: n.toUpperCase(),
  externalId: `SF-${n}`,
});

const record = (over: Partial<ClosingForSheet>): ClosingForSheet =>
  ({
    id: 'c1',
    talentId: 'talent_lucie',
    status: 'done',
    conductedAt: new Date('2026-03-02T10:00:00Z'),
    recommendation: 'bon_profil',
    verdictNote: null,
    templateId: stageGrid.templateId,
    answers: [],
    talent: { prenom: 'lucie', nom: 'BARTOLETTI', externalId: 'SF-lucie' },
    staff: { user: { name: 'Marie' } },
    campus: { name: 'Paris' },
    event: { titre: 'Stage' },
    ...over,
  }) as ClosingForSheet;

/** An answer row in the shape `closingPdfSelect` returns. */
const answer = (
  question: StoredClosingQuestion,
  over: Partial<ClosingForSheet['answers'][number]> = {},
): ClosingForSheet['answers'][number] => ({
  ratingValue: null,
  freeText: null,
  note: null,
  question: {
    id: question.id,
    label: question.label,
    kind: question.kind,
    max: question.max,
  },
  selectedOptions: [],
  ...over,
});

const sheet = (over: Partial<Parameters<typeof buildClosingsSheet>[0]> = {}) =>
  buildClosingsSheet({
    roster: [],
    records: [],
    grids: grids(stageGrid),
    currentGrid: stageGrid,
    timezone: 'Europe/Paris',
    ...over,
  });

/** Index of a header, so an assertion names a column rather than a position. */
const col = (headers: string[], startsWith: string): number => {
  const i = headers.findIndex((h) => h.startsWith(startsWith));
  expect(i, `no column starting with "${startsWith}"`).toBeGreaterThanOrEqual(
    0,
  );
  return i;
};

describe('buildClosingsSheet', () => {
  it('should list every enrolment, with empty answer cells when no closing was conducted', () => {
    // Arrange: two enrolments, neither with a closing.
    const built = sheet({ roster: [person('lucie'), person('sam')] });
    // Act
    const statuts = built.rows.map((r) => r[col(built.headers, 'Statut')]);
    const answers = built.rows.map((r) => r[col(built.headers, 'Vers quels')]);
    // Assert: the roster IS the coverage question, so a row exists per enrolment
    // and its answer cells are blank rather than absent.
    expect(built.rows).toHaveLength(2);
    expect(statuts).toEqual(['À faire', 'À faire']);
    expect(answers).toEqual([null, null]);
  });

  it('should keep a closing whose enrolment has been pruned, and say so', () => {
    // Arrange: the Salesforce sync deleted the participation, the closing stayed.
    const built = sheet({
      roster: [person('sam')],
      records: [record({ talentId: 'talent_lucie' })],
    });
    // Act
    const rows = built.rows.map((r) => ({
      nom: r[col(built.headers, 'Nom')],
      statut: r[col(built.headers, 'Statut')],
    }));
    // Assert: an export that dropped it would hide work that was done.
    expect(rows).toEqual([
      { nom: 'SAM', statut: 'À faire' },
      { nom: 'BARTOLETTI', statut: 'Finalisé (inscription retirée)' },
    ]);
  });

  it('should append the questions of another grid, blank for the closings never asked them', () => {
    // Arrange: the event names the stage grid today, but one closing was
    // conducted before it was retargeted, under the club grid.
    const built = sheet({
      roster: [person('lucie'), person('sam')],
      grids: grids(stageGrid, clubGrid),
      records: [
        record({
          talentId: 'talent_lucie',
          templateId: clubGrid.templateId,
          answers: [answer(CLUB_ONLY, { freeText: 'Oui, très bien' })],
        }),
      ],
    });
    // Act
    const clubCol = col(built.headers, 'Le format du club');
    const stageCol = col(built.headers, 'Satisfaction globale du stage');
    // Assert: the off-grid question is marked and trails the current grid's own,
    // and the enrolment never asked it reads blank, not zero.
    expect(built.headers[clubCol]).toContain('[hors grille actuelle]');
    expect(clubCol).toBeGreaterThan(stageCol);
    expect(built.rows[0][clubCol]).toBe('Oui, très bien');
    expect(built.rows[1][clubCol]).toBeNull();
  });

  it('should name a rating column with its ceiling and keep the cell numeric', () => {
    // Arrange
    const built = sheet({
      roster: [person('lucie')],
      records: [record({ answers: [answer(RATING, { ratingValue: 4 })] })],
    });
    // Act
    const i = col(built.headers, 'Satisfaction globale du stage');
    // Assert: a number, so a spreadsheet can sort and average it; the ceiling
    // rides the header rather than every cell.
    expect(built.headers[i]).toBe('Satisfaction globale du stage (sur 5)');
    expect(built.rows[0][i]).toBe(4);
  });

  it('should read a grid question under the wording that grid gives it', () => {
    // The bank calls it "Satisfaction globale"; this grid reads it aloud as
    // "Satisfaction globale du stage". The column follows the grid, the identity
    // stays the bank's - which is what lets two grids share one column.
    const built = sheet({ roster: [person('lucie')] });
    expect(built.headers).toContain('Satisfaction globale du stage (sur 5)');
    expect(built.headers).not.toContain('Satisfaction globale (sur 5)');
  });

  it('should join a multi answer in the option order, not the picking order', () => {
    // Arrange: picked cyber first.
    const built = sheet({
      roster: [person('lucie')],
      records: [
        record({
          answers: [
            answer(CHOICE, {
              selectedOptions: [
                { option: { id: 'o_cyber', label: 'Cyber', position: 1 } },
                { option: { id: 'o_dev', label: 'Dev', position: 0 } },
              ],
            }),
          ],
        }),
      ],
    });
    // Act
    const cell = built.rows[0][col(built.headers, 'Vers quels')];
    // Assert: two students who picked the same things read the same way.
    expect(cell).toBe('Dev, Cyber');
  });

  it("should put a team note in its own column, beside the student's answer", () => {
    // Arrange: a note on the rating, none on the choice.
    const built = sheet({
      roster: [person('lucie')],
      records: [
        record({
          answers: [
            answer(CHOICE),
            answer(RATING, { ratingValue: 5, note: '  très motivée  ' }),
          ],
        }),
      ],
    });
    // Act
    const answerAt = col(built.headers, 'Satisfaction globale du stage (');
    const noteAt = col(built.headers, "Note de l'équipe : Satisfaction");
    // Assert: the team's words trimmed, in the column right after the
    // student's, and never mixed into the answer cell. One aggregate cell would
    // have to separate notes with a newline, which a spreadsheet does not show
    // without a `wrapText` style `buildXlsx` deliberately does not write.
    expect(noteAt).toBe(answerAt + 1);
    expect(built.rows[0][answerAt]).toBe(5);
    expect(built.rows[0][noteAt]).toBe('très motivée');
  });

  it('should give no note column to a question the grid takes no note on', () => {
    // Arrange: same grid with the note field withdrawn from both questions.
    const noNotes = toClosingGrid(
      templateWith('t_plain', [
        { question: CHOICE, withNote: false },
        {
          question: RATING,
          labelOverride: 'Satisfaction globale du stage',
          withNote: false,
        },
      ]),
    );
    // Act
    const built = sheet({
      roster: [person('lucie')],
      grids: grids(noNotes),
      currentGrid: noNotes,
    });
    // Assert: no empty note column widening the sheet for nothing.
    expect(built.headers.some((h) => h.startsWith("Note de l'équipe :"))).toBe(
      false,
    );
  });

  it('should keep a note whose grid has since withdrawn its note field', () => {
    // Arrange: the note was taken, then the grid stopped offering one. The
    // integration suite pins that the note survives in the database; here the
    // column has to survive too, or the export hides what the team wrote.
    const withdrawn = toClosingGrid(
      templateWith('t_withdrawn', [
        {
          question: RATING,
          labelOverride: 'Satisfaction globale du stage',
          withNote: false,
        },
      ]),
    );
    // Act
    const built = sheet({
      roster: [person('lucie')],
      grids: grids(withdrawn),
      currentGrid: withdrawn,
      records: [
        record({
          templateId: withdrawn.templateId,
          answers: [answer(RATING, { ratingValue: 3, note: 'à revoir' })],
        }),
      ],
    });
    // Assert
    const noteAt = col(built.headers, "Note de l'équipe :");
    expect(built.rows[0][noteAt]).toBe('à revoir');
  });

  it('should name the current grid columns even when nothing has been conducted', () => {
    // A question nobody has answered yet is an empty column, never a missing
    // one: the sheet describes the grid, not only what happens to be in it.
    const built = sheet({ roster: [person('lucie')] });
    expect(built.headers).toContain('Vers quels métiers tu te projettes ?');
  });
});
