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
  Prisma,
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
    /** Null for a campaign whose author has since left. */
    createdBy: StaffRef | null;
    recipients: readonly TalentRef[];
    /** Staff recipients, for a campaign addressed to the team. */
    staffRecipients?: readonly StaffRef[];
    /** The audience filter the composer was left on, frozen with the send. */
    filters?: Prisma.InputJsonValue;
    /** Set when this campaign is a retarget of an earlier one. */
    sourceBroadcastKey?: string;
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
    // The filter the composer was set to, frozen alongside the body. It answers
    // « à qui est-ce parti » after the cohort has moved on, and it was null on
    // every seeded campaign - so the recap that reads it back rendered nothing.
    filters: opts.filters,
    sourceBroadcastId: opts.sourceBroadcastKey
      ? id('bcs', opts.sourceBroadcastKey)
      : null,
    subjectSnapshot: opts.channel === 'mail' ? opts.name : null,
    bodySnapshot: `${opts.name} - contenu figé au moment de l'envoi.`,
    status: opts.status,
    // `SetNull`, not RESTRICT: it was the second once, and anyone who had ever
    // sent a campaign became undeletable behind a bare « Erreur lors de la
    // suppression du membre ». A campaign whose author has left keeps its
    // history and renders `FORMER_STAFF_LABEL`.
    createdById: opts.createdBy?.userId ?? null,
    createdAt: clock.days(-14),
  });

  // A campaign addressed to the team reaches staff accounts, which is the other
  // half of the « exactly one actor » shape on a recipient row: `talentId`,
  // `parentOfTalentId` and `staffUserId` are three columns of which one is set,
  // and the third had no row at all.
  for (const [index, member] of (opts.staffRecipients ?? []).entries()) {
    world.buffer.broadcastRecipient.push({
      id: id('bcr', opts.key, 'staff', seq(index, 4)),
      broadcastId,
      staffUserId: member.userId,
      recipientEmail: member.email,
      status: sent ? 'sent' : 'pending',
      sentAt: sent ? clock.days(-14) : null,
      lastTriedAt: sent ? clock.days(-14) : null,
      retryCount: 0,
    });
  }

  const failures = opts.failures ?? 0;
  const toParent = opts.audience === 'parent';
  // The app's recipient builder only enqueues somebody it holds an address for,
  // so a row here with a null `recipientEmail` on a mail campaign is a row it
  // could never have written. A parent campaign therefore reaches the guardians
  // a dossier actually declared, and nobody else.
  const reachable = opts.recipients.filter(
    (talent) =>
      opts.channel !== 'mail' ||
      (toParent ? talent.parentEmail : talent.email) !== null,
  );

  for (const [index, talent] of reachable.entries()) {
    const failed = index < failures;
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
