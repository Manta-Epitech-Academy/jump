/**
 * Outbound campaigns and the feedback they collect.
 *
 * Both exist here mainly for their failure states. A broadcast that only ever
 * shows as `sent` hides the row a person actually has to act on, and a feedback
 * form with only matched submissions hides the public ones that match nobody.
 *
 * Nothing is ever sent. These are rows describing sends that already happened,
 * on a database no outbound path is pointed at.
 */

import type {
  BroadcastAudience,
  BroadcastChannel,
  BroadcastStatus,
} from '@prisma/client';
import type { World, TalentRef, EventRef, CampusRef, StaffRef } from '../world';
import { id, seq } from '../ids';

export function addBroadcast(
  world: World,
  opts: {
    key: string;
    name: string;
    channel: BroadcastChannel;
    audience: BroadcastAudience;
    status: BroadcastStatus;
    campus: CampusRef;
    event?: EventRef;
    createdBy: StaffRef;
    recipients: readonly TalentRef[];
    /** How many of them failed. Non-zero is what `partial_failed` means. */
    failures?: number;
    sourceFilter?: 'opened' | 'not_opened' | 'all';
  },
): void {
  const template = world.broadcastTemplates.find(
    (candidate) => candidate.channel === opts.channel,
  );
  if (!template) return;

  const clock = world.ctx.clock;
  const broadcastId = id('bcs', opts.key);
  const sent = opts.status === 'sent' || opts.status === 'partial_failed';

  world.buffer.broadcast.push({
    id: broadcastId,
    name: opts.name,
    channel: opts.channel,
    templateId: template.id,
    campusId: opts.campus.id,
    audience: opts.audience,
    eventId: opts.event?.id ?? null,
    sourceFilter: opts.sourceFilter ?? null,
    subjectSnapshot: opts.channel === 'mail' ? opts.name : null,
    bodySnapshot: `${opts.name} - contenu figé au moment de l'envoi.`,
    status: opts.status,
    createdById: opts.createdBy.userId,
    createdAt: clock.days(-14),
  });

  const failures = opts.failures ?? 0;
  for (const [index, talent] of opts.recipients.entries()) {
    const failed = index < failures;
    const toParent = opts.audience === 'parent';
    world.buffer.broadcastRecipient.push({
      id: id('bcr', opts.key, seq(index, 4)),
      broadcastId,
      talentId: toParent ? null : talent.id,
      parentOfTalentId: toParent ? talent.id : null,
      recipientEmail:
        opts.channel === 'mail'
          ? toParent
            ? talent.parentEmail
            : talent.email
          : null,
      recipientPhone: opts.channel === 'sms' ? '+33600000000' : null,
      status: !sent ? 'pending' : failed ? 'failed' : 'sent',
      errorMessage: failed ? 'Numéro invalide' : null,
      sentAt: sent && !failed ? clock.days(-14) : null,
      // Opens are what a retarget filters on, so some have to exist or
      // `sourceFilter: 'opened'` selects nobody and the feature looks broken.
      openedAt:
        sent && !failed && world.ctx.rng.chance(0.4) ? clock.days(-13) : null,
      lastTriedAt: sent ? clock.days(-14) : null,
      retryCount: failed ? 2 : 0,
    });
  }
}

/**
 * A submission against a form.
 *
 * `authenticated` carries the talent and the event; `public` carries neither and
 * identifies the respondent by the fields the form itself asked for. A third of
 * production's submissions are public and none of them are matched to a talent,
 * which is the case every "who answered" screen has to render.
 */
export function addFeedbackSubmission(
  world: World,
  opts: {
    formSlug: string;
    index: number;
    talent?: TalentRef;
    event?: EventRef;
  },
): void {
  const form = world.feedbackForms.get(opts.formSlug);
  if (!form) return;

  const rng = world.ctx.rng;
  const clock = world.ctx.clock;
  const authenticated = Boolean(opts.talent && opts.event);
  const submissionId = id('fbs', opts.formSlug, seq(opts.index, 4));

  world.buffer.feedback_Submission.push({
    id: submissionId,
    formId: form.id,
    source: authenticated ? 'authenticated' : 'public',
    talentId: authenticated ? opts.talent!.id : null,
    eventId: authenticated ? opts.event!.id : null,
    respondentEmail: authenticated
      ? null
      : `public.${seq(opts.index, 4)}@seed.invalid`,
    respondentFirstName: authenticated ? null : 'Visiteur',
    respondentLastName: authenticated ? null : `Anonyme${seq(opts.index, 3)}`,
    submittedAt: clock.days(-7),
  });

  for (const question of form.questions) {
    // Both halves whole, never a suffix: the catalogue's question ids are
    // derived and readable now, so their last characters are no longer the
    // unique part they were when Prisma minted a cuid.
    const answerId = id(
      'fba',
      submissionId.replace(/^sd_/, ''),
      question.id.replace(/^sd_ffq_/, ''),
    );
    const free = question.optionIds.length === 0;
    world.buffer.feedback_Answer.push({
      id: answerId,
      submissionId,
      questionId: question.id,
      freeText: free ? 'Très bonne expérience, merci.' : null,
    });
    if (!free) {
      for (const optionId of rng.sample(question.optionIds, 1)) {
        world.buffer.feedback_AnswerOption.push({ answerId, optionId });
      }
    }
  }
}
