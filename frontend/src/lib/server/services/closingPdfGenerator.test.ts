import { describe, it, expect } from 'vitest';
import {
  buildClosingSynthesis,
  closingPdfFilename,
  type ClosingForPdf,
} from './closingPdfGenerator';
import { toClosingGrid, type StoredClosingTemplate } from '$lib/domain/closing';

/**
 * What the synthesis document says about a closing.
 *
 * This is the mapping that used to reach into the row by a catalogue's field
 * name through a `Record<string, unknown>` cast: a renamed column printed "Non
 * renseigné" for every question and dropped every note, and nothing anywhere
 * failed. Everything below exists so that failure is loud.
 */

const CHOICE = {
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
    {
      id: 'o_cyber',
      value: 'cyber',
      label: 'Cyber',
      tone: null,
      icon: 'cyber',
    },
  ],
};

const RATING = {
  ...CHOICE,
  id: 'q_rating',
  key: 'satisfaction',
  label: 'Satisfaction globale',
  kind: 'rating' as const,
  max: 5,
  options: [],
};

const template: StoredClosingTemplate = {
  id: 't1',
  key: 'stage_seconde',
  label: 'Closing stage',
  sections: [
    {
      id: 's1',
      position: 0,
      synthesisPosition: null,
      title: 'Orientation',
      questions: [
        {
          sectionId: 's1',
          position: 0,
          labelOverride: null,
          withNote: true,
          question: CHOICE,
        },
        {
          sectionId: 's1',
          position: 1,
          labelOverride: 'Satisfaction globale du stage',
          withNote: true,
          question: RATING,
        },
      ],
    },
  ],
};

const grid = toClosingGrid(template);

const answerRow = (
  over: Partial<ClosingForPdf['answers'][number]> = {},
): ClosingForPdf['answers'][number] => ({
  ratingValue: null,
  freeText: null,
  note: null,
  question: { id: CHOICE.id, label: CHOICE.label, kind: 'multi', max: null },
  selectedOptions: [],
  ...over,
});

const record = (answers: ClosingForPdf['answers']): ClosingForPdf =>
  ({
    id: 'c1',
    conductedAt: new Date('2026-03-02T10:00:00Z'),
    recommendation: 'bon_profil',
    verdictNote: null,
    templateId: 't1',
    answers,
    talent: { prenom: 'lucie', nom: 'bartoletti', externalId: null },
    staff: { user: { name: 'Marie' } },
    campus: { name: 'Paris' },
    participation: { event: { titre: 'Stage' } },
  }) as ClosingForPdf;

describe('buildClosingSynthesis', () => {
  it('should print the labels a student actually picked, in the option order', () => {
    // Arrange: picked out of order, so the assertion also pins that the document
    // reads them back in the question's own order.
    const sections = buildClosingSynthesis(
      record([
        answerRow({
          selectedOptions: [
            { option: { id: 'o_cyber', label: 'Cyber', position: 1 } },
            { option: { id: 'o_dev', label: 'Dev', position: 0 } },
          ],
          note: 'Hésite entre les deux.',
        }),
      ]),
      grid,
    );
    // Assert
    const [q] = sections[0].questions;
    expect(q.value).toEqual(['Dev', 'Cyber']);
    expect(q.note).toBe('Hésite entre les deux.');
  });

  it('should read the prompt this grid reads aloud, not the bank wording', () => {
    const sections = buildClosingSynthesis(record([]), grid);
    expect(sections[0].questions[1].label).toBe(
      'Satisfaction globale du stage',
    );
  });

  it('should print a rating on its own scale', () => {
    const sections = buildClosingSynthesis(
      record([
        answerRow({
          ratingValue: 4,
          question: {
            id: RATING.id,
            label: RATING.label,
            kind: 'rating',
            max: 5,
          },
        }),
      ]),
      grid,
    );
    const rating = sections[0].questions[1];
    expect(rating).toMatchObject({ kind: 'rating', value: 4, max: 5 });
  });

  it('should leave an unanswered question empty rather than inventing one', () => {
    const sections = buildClosingSynthesis(record([]), grid);
    expect(sections[0].questions[0].value).toEqual([]);
    expect(sections[0].questions[1].value).toBeNull();
  });

  /**
   * The rule that keeps a recomposed grid honest: an answer is a fact about a
   * real conversation, so dropping its question from the grid must never be able
   * to hide it.
   */
  it('should still print an answer whose question the grid no longer asks', () => {
    const sections = buildClosingSynthesis(
      record([
        answerRow({
          question: {
            id: 'q_retired',
            label: 'Une question retirée depuis',
            kind: 'multi',
            max: null,
          },
          selectedOptions: [
            { option: { id: 'o_x', label: 'Sa réponse', position: 0 } },
          ],
        }),
      ]),
      grid,
    );
    const retired = sections.at(-1)!;
    expect(retired.title).toBe('Questions retirées de la grille');
    expect(retired.questions[0]).toMatchObject({
      label: 'Une question retirée depuis',
      value: ['Sa réponse'],
    });
  });
});

describe('closingPdfFilename', () => {
  it('should lead with the verdict so an exported batch sorts by potential', () => {
    expect(
      closingPdfFilename({
        talent: { prenom: 'lucie', nom: 'bartoletti', externalId: '003AB' },
        recommendation: 'tres_compatible',
      }),
    ).toBe('fort_potentiel-closing-lucie_BARTOLETTI-003AB.pdf');
  });

  it('should say so when no verdict was given', () => {
    expect(
      closingPdfFilename({
        talent: { prenom: 'Jean-Pierre', nom: "O'Neil", externalId: null },
        recommendation: null,
      }),
    ).toBe('sans_verdict-closing-JeanPierre_ONEIL.pdf');
  });
});
