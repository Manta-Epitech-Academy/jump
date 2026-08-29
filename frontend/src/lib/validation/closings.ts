import { z } from 'zod';
import {
  CLOSING_NOTE_LIMIT,
  CLOSING_TEXT_LIMIT_DEFAULT,
  CLOSING_VERDICT_NOTE_LIMIT,
  gridQuestions,
  isClosingRecommendation,
  type ClosingGrid,
} from '$lib/domain/closing';

/**
 * The closing conduct payload.
 *
 * One schema backs every lifecycle action (`start` / the `save` autosave /
 * `close`) with the same payload, so clôture never drops unsaved edits.
 * `status` and `staffId` are NOT in it: the action owns the status transition,
 * so an autosave can never accidentally finalise a closing.
 *
 * The shape is grid-independent - a map keyed by bank question id - because the
 * questionnaire is data now. What the grid decides (which questions exist, which
 * options they offer, whether a note is invited) is checked by
 * {@link closingAnswersIssues} against the grid the record was conducted with,
 * not against this schema. That split is deliberate: the schema is a static wire
 * contract, and only the server knows which grid a given record pinned.
 */

/** Free text stays a string in the form (empty = '') for clean binding; the
 *  action maps '' -> null before persisting so the DB never stores "". */
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Le texte ne peut pas dépasser ${max} caractères`)
    .default('');

export const closingAnswerSchema = z.object({
  /** Option ids, in the order picked. A `single` question carries at most one. */
  selectedIds: z.array(z.string()).default([]),
  ratingValue: z.number().int().nullable().default(null),
  freeText: text(CLOSING_TEXT_LIMIT_DEFAULT),
  note: text(CLOSING_NOTE_LIMIT),
});

export type ClosingAnswerForm = z.infer<typeof closingAnswerSchema>;

export const closingConductSchema = z.object({
  /** The talent half of the record's key; the event comes from the route. */
  talentId: z.string().min(1, 'Talent requis'),
  /** Keyed by `Closing_Question.id`, which is what an answer row references. */
  answers: z.record(z.string(), closingAnswerSchema).default({}),
  /** The team's verdict. Not a bank question: staff-only, Jump-wide. */
  recommendation: z
    .string()
    .nullable()
    .default(null)
    .or(z.literal('').transform(() => null)),
  verdictNote: text(CLOSING_VERDICT_NOTE_LIMIT),
});

export type ClosingConductForm = z.infer<typeof closingConductSchema>;

export type ClosingAnswerIssue = { path: string; message: string };

/**
 * Check a submitted payload against the grid it claims to answer.
 *
 * Returns French messages the action attaches to the form, because every one of
 * them is a bug the staff member cannot cause through the UI: a question the grid
 * does not ask, an option it does not offer, a rating off its own scale. They
 * exist so a stale tab or a hand-made POST fails loudly rather than writing an
 * answer nothing can render.
 *
 * What is checked here is what a payload CLAIMS about the grid. What a record
 * already holds is not this function's business: see the note at the end of the
 * loop, and `persistClosing`, which decides what may be written.
 */
export function closingAnswersIssues(
  form: ClosingConductForm,
  grid: ClosingGrid,
): ClosingAnswerIssue[] {
  const issues: ClosingAnswerIssue[] = [];
  const byId = new Map(gridQuestions(grid).map((q) => [q.id, q]));

  if (form.recommendation && !isClosingRecommendation(form.recommendation)) {
    issues.push({
      path: 'recommendation',
      message: 'Avis inconnu.',
    });
  }

  for (const [questionId, answer] of Object.entries(form.answers)) {
    const q = byId.get(questionId);
    if (!q) {
      issues.push({
        path: `answers.${questionId}`,
        message:
          "Cette question ne fait pas partie de la grille de l'événement.",
      });
      continue;
    }

    const allowed = new Set(q.options.map((o) => o.id));
    for (const id of answer.selectedIds) {
      if (!allowed.has(id)) {
        issues.push({
          path: `answers.${questionId}`,
          message: `Réponse inconnue pour « ${q.label} ».`,
        });
        break;
      }
    }

    if (q.kind === 'single' && answer.selectedIds.length > 1) {
      issues.push({
        path: `answers.${questionId}`,
        message: `« ${q.label} » n'accepte qu'une seule réponse.`,
      });
    }

    if (
      q.kind !== 'single' &&
      q.kind !== 'multi' &&
      answer.selectedIds.length
    ) {
      issues.push({
        path: `answers.${questionId}`,
        message: `« ${q.label} » ne se répond pas par un choix.`,
      });
    }

    if (answer.ratingValue != null) {
      const max = q.max ?? 0;
      if (
        q.kind !== 'rating' ||
        answer.ratingValue < 1 ||
        answer.ratingValue > max
      ) {
        issues.push({
          path: `answers.${questionId}`,
          message: `Note hors barème pour « ${q.label} ».`,
        });
      }
    }

    if (answer.freeText && q.kind !== 'text') {
      issues.push({
        path: `answers.${questionId}`,
        message: `« ${q.label} » ne se répond pas par du texte libre.`,
      });
    }

    const limit = q.maxLength ?? CLOSING_TEXT_LIMIT_DEFAULT;
    if (answer.freeText.length > limit) {
      issues.push({
        path: `answers.${questionId}`,
        message: `« ${q.label} » est limitée à ${limit} caractères.`,
      });
    }

    // A note on a question this grid invites none for is deliberately NOT
    // refused, unlike everything above it. The payload is the whole form, and
    // the form is what this server prefilled from the record: a note recorded
    // while the composition still invited one round-trips through every later
    // autosave. Refusing it made that autosave fail for good, so the closing
    // could never be saved or clôturé again. Nothing is written either way -
    // `persistClosing` omits a note the grid does not own - so the refusal
    // guarded a write that cannot happen.
  }

  return issues;
}
