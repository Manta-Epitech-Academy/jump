import { z } from 'zod';

/**
 * What the Salesforce worker is allowed to POST at the sync endpoints.
 *
 * These payloads drive destructive writes - the talents one prunes every
 * enrolment it does not mention - and until this existed the route handed
 * `body.talents` to the service unread, so a malformed body reached the prune
 * before anything had checked it was even an array.
 *
 * Deliberately loose about the CONTENT of a member: every field but the three
 * the service actually keys on is optional and untyped beyond its primitive,
 * because Salesforce owns that shape and a stricter schema here would reject a
 * whole campaign over one unexpected column. What is strict is the ENVELOPE.
 */
export const workerTalentSchema = z.object({
  external_id: z.string().min(1),
  first_name: z.string(),
  last_name: z.string(),
  email: z.string().nullish(),
  phone: z.string().nullish(),
  gender: z.string().nullish(),
  school: z.string().nullish(),
  school_uai: z.string().nullish(),
  class_level: z.string().nullish(),
  status: z.string().nullish(),
});

export const workerTalentsPayloadSchema = z.object({
  talents: z.array(workerTalentSchema),
});

export type WorkerTalent = z.infer<typeof workerTalentSchema>;
