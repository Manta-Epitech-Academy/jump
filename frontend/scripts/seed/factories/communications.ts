/**
 * Outbound campaigns and the feedback they collect.
 *
 * Both exist here mainly for their failure states. A broadcast that only ever
 * shows as `sent` hides the row a person actually has to act on, and a feedback
 * form with only matched submissions hides the public ones that match nobody.
 *
 * Nothing here is ever sent, and that is now a property of the rows rather than
 * of the environment: every campaign is written in a TERMINAL status, so
 * `processNextQueuedBroadcast` has nothing to claim. `assert/inertness.ts`
 * carries the rule, and `AGENTS.md` what it cost to learn.
 *
 * This header used to make the same claim on the grounds that no outbound path
 * was pointed at this database, which was untrue. Asserting it is what let four
 * `queued` / `sending` campaigns sit here unquestioned.
 */

import type {
  BroadcastAudience,
  BroadcastChannel,
  Prisma,
} from '@prisma/client';
import {
  BROADCAST_MAX_RETRIES,
  type BroadcastTerminalStatus,
} from '../../../src/lib/domain/broadcasts';
import type { World, TalentRef, EventRef, CampusRef, StaffRef } from '../world';
import { id, seq } from '../ids';

export function addBroadcast(
  world: World,
  opts: {
    key: string;
    name: string;
    channel: BroadcastChannel;
    audience: BroadcastAudience;
    /**
     * Terminal only, and the type is the enforcement: a `queued` or `sending`
     * campaign is outstanding work for the queue worker, not a fact about a
     * send that happened. `bun run check` refuses the call site.
     */
    status: BroadcastTerminalStatus;
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
    /** How many of them failed. Non-zero is what `partial_failed` means; a
     *  `failed` campaign is every recipient failing, so it needs no count. */
    failures?: number;
    /**
     * How the send failed, when it did not fail one address at a time. Defaults
     * to a bad address on the recipient's own channel, which is the common
     * case; pass one when the campaign failed as a whole, where a per-address
     * message would be nonsense (the seeded staff note fails on a provider
     * outage).
     *
     * `kind` is not decoration, it is what decides where `retryCount` stops:
     * the sender classifies a 429 or any 5xx as retryable and everything else
     * as permanent (`broadcast/providers/mail.ts`), and only a permanent
     * rejection lands `failed` on its first attempt.
     */
    failure?: { message: string; kind: 'permanent' | 'transient' };
    sourceFilter?: 'opened' | 'not_opened' | 'all';
  },
): void {
  const template = world.broadcastTemplates.find(
    (candidate) => candidate.channel === opts.channel,
  );
  if (!template) return;

  const clock = world.ctx.clock;
  const broadcastId = id('bcs', opts.key);
  // A `failed` campaign is every recipient having failed, because that is the
  // only way the orchestrator's finalizer concludes `failed` (`tally.sent === 0`
  // with nothing left pending). It used to leave them `pending`, which is a
  // state no run can produce and, worse, the exact row the worker pages.
  const allFailed = opts.status === 'failed';
  const failure = opts.failure ?? {
    message:
      opts.channel === 'sms' ? 'Numéro invalide' : 'Adresse e-mail invalide',
    kind: 'permanent' as const,
  };
  // Where the sender actually leaves the counter, which is the whole reason the
  // failure carries its kind: a permanent rejection is never retried, so the row
  // lands `failed` on its first attempt; a transient one is retried until
  // `BROADCAST_MAX_RETRIES` and lands on that. Anything in between is a count no
  // path reaches: this factory wrote a flat `2` for a while, and replacing it
  // with a flat `1` only moved the same mistake onto the 5xx outage below.
  const failedRetryCount =
    failure.kind === 'transient' ? BROADCAST_MAX_RETRIES : 1;

  /**
   * A recipient as the sender actually leaves it, in one of the two terminal
   * shapes and never in between. `lastTriedAt` is always set, because the sender
   * stamps it on every outcome.
   */
  const outcome = (failed: boolean) => ({
    status: failed ? ('failed' as const) : ('sent' as const),
    errorMessage: failed ? failure.message : null,
    sentAt: failed ? null : clock.days(-14),
    lastTriedAt: clock.days(-14),
    retryCount: failed ? failedRetryCount : 0,
  });

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
      ...outcome(allFailed),
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
    const failed = allFailed || index < failures;
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
      ...outcome(failed),
      // Opens are what a retarget filters on, so some have to exist or
      // `sourceFilter: 'opened'` selects nobody and the feature looks broken.
      openedAt: !failed && world.ctx.rng.chance(0.4) ? clock.days(-13) : null,
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
 *
 * The two halves are a union rather than four optional fields, because they are
 * keyed differently and that is not a detail. An authenticated submission is
 * keyed on `(event, talent)`, which is its natural key and what the database's
 * own `@@unique([formId, eventId, talentId])` says it is; a public one has
 * neither, so it keeps a caller-chosen index. Keying BOTH on the index made the
 * number a global namespace across scenarios - `operations.ts` already had to
 * step around it by starting at 2000 - and the first caller to run the same
 * block on a second event would have collided on the primary key, silently,
 * since `createMany` here has no `skipDuplicates`.
 */
export function addFeedbackSubmission(
  world: World,
  opts:
    | { formSlug: string; talent: TalentRef; event: EventRef }
    | { formSlug: string; index: number },
): void {
  const form = world.feedbackForms.get(opts.formSlug);
  if (!form) return;

  const rng = world.ctx.rng;
  const clock = world.ctx.clock;
  const authenticated = 'talent' in opts;
  const submissionId = authenticated
    ? id(
        'fbs',
        opts.event.id.replace(/^sd_/, ''),
        opts.talent.id.replace(/^sd_/, ''),
      )
    : id('fbs', opts.formSlug, seq(opts.index, 4));

  world.buffer.feedback_Submission.push({
    id: submissionId,
    formId: form.id,
    source: authenticated ? 'authenticated' : 'public',
    talentId: authenticated ? opts.talent.id : null,
    eventId: authenticated ? opts.event.id : null,
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
