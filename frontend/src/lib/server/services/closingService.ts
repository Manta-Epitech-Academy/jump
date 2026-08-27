import type { ClosingRecommendation, Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import { gridQuestions, type ClosingGrid } from '$lib/domain/closing';
import type { ClosingConductForm } from '$lib/validation/closings';

/**
 * Writing a closing: the transaction behind the three lifecycle actions.
 *
 * The payload is always the WHOLE form, never a delta, which is what makes
 * clôture safe (it cannot drop an edit the last autosave had not yet sent). So
 * this reconciles: every question of the grid is either written or, once the
 * staff has cleared it, removed. An answer row that holds nothing is deleted
 * rather than kept blank, so "answered" stays a question about rows and not
 * about contents. What is never touched either way is a field the composition
 * no longer owns - see `ownsNote` below.
 *
 * Ids reaching here are already validated by the caller (the participation
 * belongs to this talent and campus, its event exposes the surface, and the grid
 * is the one the record pinned), so this file does no authorisation of its own.
 */

export type ClosingMode = 'start' | 'save' | 'close';

export type PersistClosingInput = {
  participationId: string;
  talentId: string;
  campusId: string;
  staffId: string;
  /** Pinned on create, never re-read off the event afterwards. */
  templateId: string;
  grid: ClosingGrid;
  form: ClosingConductForm;
  mode: ClosingMode;
};

/** Does this answer hold anything worth a row? */
function isEmpty(a: {
  selectedIds: string[];
  ratingValue: number | null;
  freeText: string;
  note: string;
}): boolean {
  return (
    a.selectedIds.length === 0 &&
    a.ratingValue == null &&
    a.freeText.trim() === '' &&
    a.note.trim() === ''
  );
}

export async function persistClosing(
  input: PersistClosingInput,
): Promise<void> {
  const { form, grid, mode } = input;

  const createStatus = mode === 'close' ? 'done' : 'in_progress';
  // `save` leaves the status untouched; the other modes set it explicitly.
  const setStatus =
    mode === 'close'
      ? ('done' as const)
      : mode === 'start'
        ? ('in_progress' as const)
        : undefined;

  // `conductedAt` defaults to row-creation time, i.e. when the closing is first
  // started or autosaved as `in_progress`. Re-stamp it at clôture so it marks
  // when the closing was FINALISED, not when the form was first opened.
  // Everything downstream treats a `done` closing's `conductedAt` as its
  // completion date (the admin archive orders and windows by it, each admin's
  // export high-water mark compares against it, the reset audit snapshots it),
  // so a just-closed closing must carry "now" even if it sat in progress a while.
  const conductedAt = mode === 'close' ? new Date() : undefined;

  const recommendation = (form.recommendation ??
    null) as ClosingRecommendation | null;
  const verdictNote = form.verdictNote.trim() || null;

  const questions = gridQuestions(grid);

  await prisma.$transaction(async (tx) => {
    const record = await tx.closing_Record.upsert({
      where: { participationId: input.participationId },
      create: {
        participationId: input.participationId,
        talentId: input.talentId,
        campusId: input.campusId,
        staffId: input.staffId,
        templateId: input.templateId,
        status: createStatus,
        recommendation,
        verdictNote,
        ...(conductedAt ? { conductedAt } : {}),
      },
      update: {
        recommendation,
        verdictNote,
        ...(setStatus ? { status: setStatus } : {}),
        ...(conductedAt ? { conductedAt } : {}),
      },
      select: { id: true },
    });

    const keep: {
      questionId: string;
      data: Prisma.Closing_AnswerUncheckedCreateInput;
      optionIds: string[];
      /** Whether the note on this row is the grid's to write. See below. */
      ownsNote: boolean;
    }[] = [];
    // A composition decides what may be ASKED and EDITED; it does not decide
    // what a record already holds. `withNote` is a write affordance - whether a
    // note may be entered now - so a grid that stops inviting one must neither
    // write a note nor erase the one the team wrote while it did. That is the
    // field-level half of the rule the delete below states at row level, and
    // `ownsNote` carries it to the upsert.
    //
    // Emptiness still reads the WHOLE answer, note included, so a row left
    // holding only such a note is not reconciled away as cleared: the staff
    // member has no input for it, so they cannot have cleared it.
    for (const q of questions) {
      const a = form.answers[q.id];
      if (!a || isEmpty(a)) continue;
      const ownsNote = q.note !== null;
      keep.push({
        questionId: q.id,
        data: {
          recordId: record.id,
          questionId: q.id,
          ratingValue: q.kind === 'rating' ? a.ratingValue : null,
          freeText: q.kind === 'text' ? a.freeText.trim() || null : null,
          note: ownsNote ? a.note.trim() || null : null,
        },
        optionIds:
          q.kind === 'single' || q.kind === 'multi' ? a.selectedIds : [],
        ownsNote,
      });
    }

    // Only answers this grid ASKS and the staff CLEARED go. Named positively
    // rather than as "everything we did not keep", because the difference is
    // what a question dropped from the composition falls into: `notIn(keep)`
    // deleted it, and it is precisely what must survive. An answer references
    // the bank question, so a composition can stop asking it without the record
    // losing it, and the synthesis prints it under "Questions retirées".
    const keptIds = new Set(keep.map((k) => k.questionId));
    const cleared = questions.map((q) => q.id).filter((id) => !keptIds.has(id));

    if (cleared.length) {
      await tx.closing_Answer.deleteMany({
        where: { recordId: record.id, questionId: { in: cleared } },
      });
    }

    for (const k of keep) {
      const answer = await tx.closing_Answer.upsert({
        where: {
          recordId_questionId: {
            recordId: record.id,
            questionId: k.questionId,
          },
        },
        create: k.data,
        update: {
          ratingValue: k.data.ratingValue,
          freeText: k.data.freeText,
          // Omitted, not nulled, when the grid no longer invites a note: an
          // update that names the column erases what it does not carry.
          ...(k.ownsNote ? { note: k.data.note } : {}),
        },
        select: { id: true },
      });

      // Selections are replaced wholesale rather than diffed: the set is at most
      // a handful of rows and a diff would only add a way to get it wrong.
      await tx.closing_AnswerOption.deleteMany({
        where: {
          answerId: answer.id,
          ...(k.optionIds.length ? { optionId: { notIn: k.optionIds } } : {}),
        },
      });
      if (k.optionIds.length) {
        await tx.closing_AnswerOption.createMany({
          data: k.optionIds.map((optionId) => ({
            answerId: answer.id,
            optionId,
          })),
          skipDuplicates: true,
        });
      }
    }
  });
}

/**
 * How many of a closing's questions the student actually answered.
 *
 * Counts rows carrying a real answer - a picked option, a rating, or the
 * student's own text - and deliberately not rows that hold only the team's note,
 * which is the staff writing rather than the student answering. One helper, so
 * the number the reset audit records cannot disagree with the number anything
 * else reports.
 */
export function answeredCount(record: {
  answers: {
    ratingValue: number | null;
    freeText: string | null;
    selectedOptions: unknown[];
  }[];
}): number {
  return record.answers.filter(
    (a) =>
      a.selectedOptions.length > 0 ||
      a.ratingValue != null ||
      a.freeText != null,
  ).length;
}
