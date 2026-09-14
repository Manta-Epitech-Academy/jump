import { z } from 'zod';

/**
 * What the Salesforce worker is allowed to send at `/api/worker/*`, and what
 * Jump is allowed to answer.
 *
 * These payloads drive destructive writes - the participations one prunes every
 * enrolment it does not mention - and until this existed the routes handed the
 * body to the service unread, so a malformed one reached the prune before
 * anything had checked it was even an array.
 *
 * Deliberately loose about the CONTENT of a member: every field but the ones
 * the service actually keys on is optional and untyped beyond its primitive,
 * because Salesforce owns that shape and a stricter schema here would reject a
 * whole campaign over one unexpected column. What is strict is the ENVELOPE.
 */

/** The two passes, spelled exactly as the worker spells them. */
export const workerSyncModeSchema = z.enum(['full', 'incremental']);

// ── What the worker sends ───────────────────────────────────────────────────

export const workerEventSchema = z.object({
  external_id: z.string().min(1),
  title: z.string().min(1),
  /**
   * `YYYY/MM/DD`, parsed by the worker out of the campaign name. Absent, never
   * null, when the name carries no date: the worker builds the key as
   * `undefined` and `JSON.stringify` drops it.
   */
  date: z.string().optional(),
  /** `Campus.externalName`. Can be the empty string, which resolves to nothing. */
  campus_ext_name: z.string(),
});

export const workerEventsPayloadSchema = z.object({
  // An incremental tick with nothing touched still posts `{"events": []}`.
  // That is a no-op, not a bad request.
  events: z.array(workerEventSchema),
});

export const workerTalentSchema = z.object({
  external_id: z.string().min(1),
  /**
   * Deliberately not `.min(1)`, unlike `external_id` beside it, and the
   * asymmetry is the point. `Contact.FirstName` is optional in Salesforce, so an
   * empty one is ordinary data; refusing it here would refuse the whole page of
   * 50 that carried it, the run would close in error, the watermark would not
   * move and the next tick would replay the identical page. `syncTalents` skips
   * the row and logs a `SyncError` instead. `external_id` is different: with no
   * id there is nothing to key the row on and nothing to tell an admin to go
   * look at, so the envelope is the right place to refuse it.
   */
  first_name: z.string(),
  last_name: z.string(),
  email: z.string().nullish(),
  phone: z.string().nullish(),
  gender: z.string().nullish(),
  school: z.string().nullish(),
  school_uai: z.string().nullish(),
  class_level: z.string().nullish(),
});

export const workerTalentsPayloadSchema = z.object({
  talents: z.array(workerTalentSchema),
});

export const workerParticipationsPayloadSchema = z.object({
  /**
   * `external_id` -> raw `CampaignMember.Status`. The value can be the empty
   * string: the worker maps a null Salesforce status to `""` rather than
   * dropping the member.
   */
  participations: z.record(z.string().min(1), z.string()),
  /**
   * Which pass produced this roster, and the only thing that authorises the
   * prune.
   *
   * A `full` pass carries every member of the campaign, so an enrolment absent
   * from it is an enrolment that no longer exists. An `incremental` one carries
   * only the campaigns Salesforce reports as touched, and a deletion moves no
   * modstamp at all, so absence there means nothing. Jump cannot tell the two
   * apart from the roster itself, and inferring it from whichever run happens
   * to be open would be shared mutable state across horizontally-scaled pods.
   * So the worker states it, per call.
   */
  mode: workerSyncModeSchema,
});

export const workerRunOpenSchema = z.object({
  mode: workerSyncModeSchema,
});

export const workerRunCloseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    counters: z.object({
      events: z.number().int().nonnegative(),
      talents: z.number().int().nonnegative(),
      participations: z.number().int().nonnegative(),
    }),
  }),
  z.object({
    status: z.literal('error'),
    // The worker truncates the body it quotes to 300 characters before sending.
    error: z.string().max(2000).optional(),
  }),
]);

export type WorkerEvent = z.infer<typeof workerEventSchema>;
export type WorkerTalent = z.infer<typeof workerTalentSchema>;
export type WorkerSyncMode = z.infer<typeof workerSyncModeSchema>;

// ── What Jump answers, as the worker will read it ───────────────────────────

/**
 * The mirror of `parseWorkerConfig` in jump-sf-worker, transcribed once.
 *
 * Nothing on this side consumes it at runtime: it exists so a test can assert
 * that the body Jump emits is a body the worker accepts, without a network hop
 * and without waiting for a Salesforce round trip to find out. That gap is what
 * let six routes be renamed on one side of the contract and stay unimplemented
 * on the other until production stopped syncing.
 *
 * It is the same posture `domain/niveau.ts` already takes toward the worker's
 * `ClassLevel` enum: one place that says out loud "this is pinned to the other
 * repo", so a divergence is a failing test rather than a 404 in a pod log.
 *
 * Transcribed rules, in the worker's own order:
 *  - the body is an object, not an array and not null;
 *  - `shouldSync` is strictly boolean;
 *  - `mode` is one of the two literals, and is checked BEFORE `shouldSync`, so
 *    a heartbeat answer still has to carry a real one;
 *  - `since` is a string or null, and the key has to be present: `undefined`
 *    passes neither branch and throws;
 *  - `sources` is an array, possibly empty;
 *  - each source carries a non-empty `salesforceCampaignId`, a `kind` of
 *    `parent` or `orphan`, and a `campusExtName` string, where `""` is allowed.
 */
export const workerConfigAnswerSchema = z.object({
  sources: z.array(
    z.object({
      salesforceCampaignId: z.string().min(1),
      kind: z.enum(['parent', 'orphan']),
      campusExtName: z.string(),
    }),
  ),
  shouldSync: z.boolean(),
  mode: workerSyncModeSchema,
  since: z.string().nullable(),
});

export type WorkerConfigAnswer = z.infer<typeof workerConfigAnswerSchema>;
