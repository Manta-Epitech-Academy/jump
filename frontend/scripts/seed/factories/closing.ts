/**
 * Conducted closings.
 *
 * A closing is the 1:1 a dev-team member runs with a talent at the end of an
 * event. Three properties of the real thing are reproduced here because a
 * dataset without them makes broken screens look correct.
 *
 * The answers reference the BANK question, never the composition row. That is
 * what lets an answer survive being dropped from a grid, and it is the only way
 * the « Questions retirées » rendering ever has anything to render.
 *
 * The grid is pinned on the record. `Closing_Record.templateId` is a fact about
 * what was asked; `Event.closingTemplateId` is configuration that can be
 * retargeted afterwards. A generator that reads the second when writing the
 * first would quietly make them impossible to tell apart.
 *
 * And student words and staff words go in different columns. `freeText` is the
 * talent's, `note` is the team's. The API tier's no-PII rule rests on that
 * split, so a dataset that puts prose in the wrong column would let a leak pass
 * review.
 */

import type { ClosingRecommendation, ClosingStatus } from '@prisma/client';
import type { World, TalentRef, StaffRef, EventRef } from '../world';
import { id } from '../ids';

/**
 * The verdict mix measured in production. Note the fifth entry: 4% of closings
 * carry no recommendation at all, and a screen that assumes one is always there
 * only fails against those.
 */
export const VERDICT_MIX: readonly (readonly [
  ClosingRecommendation | null,
  number,
])[] = [
  ['bon_profil', 34.7],
  ['tres_compatible', 24.0],
  ['indecis', 23.1],
  ['pas_interesse', 14.2],
  [null, 4.0],
];

const TESTIMONIALS = [
  "J'ai découvert que coder c'était surtout résoudre des problèmes, pas retenir des commandes.",
  "Le projet en équipe m'a donné envie de continuer, je ne pensais pas y arriver.",
  "J'hésitais entre plusieurs voies, là j'ai vu concrètement à quoi ressemble le métier.",
  'La semaine est passée trop vite, je reviendrai au Coding Club.',
];

const STAFF_NOTES = [
  'Profil curieux, à relancer pour la session de novembre.',
  'Bonne dynamique de groupe, un peu en retrait à l’oral.',
  'Projet familial encore ouvert, revoir avec les parents.',
  'Très à l’aise techniquement, à orienter vers le parcours avancé.',
];

export function conductClosing(
  world: World,
  opts: {
    talent: TalentRef;
    event: EventRef;
    staff: StaffRef | null;
    templateId: string;
    /** The bank keys this grid composes, in order. */
    questionKeys: readonly string[];
    status?: ClosingStatus;
    /** Forces a verdict. Coverage must not depend on how the dice fell. */
    recommendation?: ClosingRecommendation | null;
    /** Extra bank keys answered but no longer composed into the grid. */
    retiredKeys?: readonly string[];
    conductedOffset?: number;
  },
): void {
  const rng = world.ctx.rng;
  const clock = world.ctx.clock;
  const status = opts.status ?? 'done';
  const recordId = id(
    'clr',
    opts.event.id.replace(/^sd_/, ''),
    opts.talent.id.replace(/^sd_/, ''),
  );

  world.buffer.closing_Record.push({
    id: recordId,
    talentId: opts.talent.id,
    eventId: opts.event.id,
    staffId: opts.staff?.id ?? null,
    campusId: opts.event.campusId,
    templateId: opts.templateId,
    status,
    // `conductedAt` means FINALISED, re-stamped at clôture. An in-progress
    // closing has not been finalised, so it carries the day it was opened.
    conductedAt: clock.days(opts.conductedOffset ?? -10),
    recommendation:
      status !== 'done'
        ? null
        : opts.recommendation !== undefined
          ? opts.recommendation
          : rng.weighted(VERDICT_MIX),
    verdictNote:
      status === 'done' && rng.chance(0.8) ? rng.pick(STAFF_NOTES) : null,
  });

  const answered =
    status === 'done' ? opts.questionKeys : opts.questionKeys.slice(0, 2);
  for (const key of [...answered, ...(opts.retiredKeys ?? [])]) {
    const question = world.bank.get(key);
    if (!question) continue;
    const answerId = id('cla', recordId.replace(/^sd_/, ''), key);

    world.buffer.closing_Answer.push({
      id: answerId,
      recordId,
      questionId: question.id,
      ratingValue: question.kind === 'rating' ? rng.int(3, 5) : null,
      // The talent's own words, on the one question a grid flags as the
      // testimonial. Selected by kind here because the flag lives on the bank.
      freeText:
        question.kind === 'text' && rng.chance(0.9)
          ? rng.pick(TESTIMONIALS)
          : null,
      note: rng.chance(0.45) ? rng.pick(STAFF_NOTES) : null,
    });

    if (
      (question.kind === 'single' || question.kind === 'multi') &&
      question.optionIds.length > 0
    ) {
      const picks =
        question.kind === 'single'
          ? 1
          : rng.int(1, Math.min(3, question.optionIds.length));
      for (const optionId of rng.sample(question.optionIds, picks)) {
        world.buffer.closing_AnswerOption.push({ answerId, optionId });
      }
    }
  }
}
