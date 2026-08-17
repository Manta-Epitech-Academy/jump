/**
 * The catalogue of curated admin operations. One list, three consumers:
 *
 *   - the HTTP endpoints under `src/routes/api/admin/` (thin wrappers),
 *   - the MCP tools on `POST /api/mcp` (same names, same params, same answers),
 *   - the `operation` value written to `AdminApi_Call` for every call.
 *
 * Curated named operations only: there is no generic query surface here, and no
 * parameter flexible enough to reconstruct row-level data. Adding a question to
 * the API means adding an entry to this list, which is the point (the lesson from
 * the Salesforce MCP: a generic access path gets used generically).
 *
 * Each entry carries ONE strict schema, built here and used by both consumers, so
 * an unknown parameter is refused identically over HTTP and over MCP. It used to
 * be a raw Zod shape that HTTP wrapped in `.strict()` itself, which left the MCP
 * side on the SDK's default object mode: unknown keys were silently stripped, so
 * a misspelled `campusID` returned platform-wide figures over MCP and a 400 over
 * HTTP. One schema, one behaviour.
 *
 * Values are checked as well as shapes: `resolveScope` refuses a campus, event or
 * school year that does not exist instead of answering zero (see `scope.ts`).
 *
 * Two axes cut across this one list, and neither is a second catalogue:
 *
 *   - `kind` tells a read from a write. It decides the HTTP verb, whether a
 *     token needs `writeEnabled`, which quota applies, and whether the answer
 *     lands on the audit row as a before/after.
 *   - `leadership` grants an entry to tier-2 tokens (national leadership). The
 *     default is core-team-only, so the leadership surface only ever grows by an
 *     explicit opt-in here. What qualifies: a figure or a ranking, plus the
 *     verbatim student testimonials, which were collected to be quoted and whose
 *     first reader is precisely this tier. What does not: operational internals
 *     (queues, sync errors, this API's own log), configuration state, and any
 *     free text somebody wrote ABOUT a student.
 *
 *     Ids are judged by what they are, not by being ids. Never one that
 *     identifies a person, and never one only a write could spend; an event id is
 *     a périmètre key five of these reads accept, so withholding it would leave
 *     them with a parameter this tier cannot obtain. A leadership answer
 *     additionally carries `fraicheur` (see `defineOperation`), because its reader
 *     cannot go and check whether the sync is alive.
 *
 * Both are enforced in `guard.ts`, and mirrored in `mcpServer.ts` by simply not
 * registering the tool. The guard is the fence; the filtered tool list is what
 * stops a model walking into it.
 *
 * Descriptions and param docs are in ENGLISH, and carry no definitions.
 *
 * They are prompt text: nobody reads them, a model does, to pick a tool. What a
 * figure MEANS is not their job either, because it already travels with the
 * figure (`metrics.ts`) in French, ready to be quoted. Spelling the counting rule
 * out here as well put the same sentence in two places, free to drift, and made
 * the model choose between two wordings of one truth. So: English says what the
 * tool answers and how it is scoped, French says what the numbers mean, and the
 * standing "quote, never recompute" instruction is declared once on the server
 * (`mcpServer.ts`) rather than restated in every entry.
 */

import { z } from 'zod';
import type { AdminApi_TokenTier } from '@prisma/client';
import { EVENT_MODULE_KEYS } from '$lib/domain/eventModules';
import { isCalendarDay, isWallClock } from '$lib/domain/planningTime';
import { resolveScope } from './scope';
import type { WriteOutcome } from './plan';
import { getEventsOverview } from '$lib/server/services/adminStats/eventsOverview';
import { getOnboardingFunnel } from '$lib/server/services/adminStats/onboardingFunnel';
import {
  getUnconfiguredEvents,
  UNCONFIGURED_EVENTS_LIMIT,
} from '$lib/server/services/adminStats/unconfiguredEvents';
import { getSyncHealth } from '$lib/server/services/adminStats/syncHealth';
import { getDataFreshness } from '$lib/server/services/adminStats/dataFreshness';
import { getScopeVocabulary } from '$lib/server/services/adminStats/scopeVocabulary';
import { getCampusComparison } from '$lib/server/services/adminStats/campusComparison';
import {
  getSchoolChurn,
  CHURN_SCHOOLS_LIMIT,
} from '$lib/server/services/adminStats/schoolChurn';
import {
  getApiUsage,
  API_USAGE_DEFAULT_DAYS,
  API_USAGE_MAX_DAYS,
  type ApiUsage,
} from '$lib/server/services/adminStats/apiUsage';
import { getCohortProfile } from '$lib/server/services/adminStats/cohortProfile';
import {
  getSchoolsReach,
  SCHOOLS_TOP_N,
} from '$lib/server/services/adminStats/schoolsReach';
import {
  getInterestsBreakdown,
  INTERESTS_TOP_N,
} from '$lib/server/services/adminStats/interestsBreakdown';
import { getTalentRetention } from '$lib/server/services/adminStats/talentRetention';
import { getInterviewInsights } from '$lib/server/services/adminStats/interviewInsights';
import {
  getInterviewTestimonials,
  TESTIMONIALS_DEFAULT_LIMIT,
  TESTIMONIALS_MAX_LIMIT,
} from '$lib/server/services/adminStats/interviewTestimonials';
import {
  getFeedbackResults,
  FEEDBACK_FORMS_LIMIT,
} from '$lib/server/services/adminStats/feedbackResults';
import {
  getOnboardingVelocity,
  VELOCITY_DEFAULT_DAYS,
  VELOCITY_MAX_DAYS,
} from '$lib/server/services/adminStats/onboardingVelocity';
import { getComplianceStatus } from '$lib/server/services/adminStats/complianceStatus';
import { getEngagement } from '$lib/server/services/adminStats/engagement';
import {
  getEventDetail,
  getCampusOverview,
  getFeedbackForms,
  getEventTemplates,
} from '$lib/server/services/adminStats/configuration';
import { getSchoolYearReview } from '$lib/server/services/adminStats/schoolYearReview';
import {
  writeEventConfig,
  writeEventActivation,
  writeEventFeedbackForm,
  writeEventTemplate,
} from './writes/events';
import {
  retryPdfJob,
  resolveSyncErrorRows,
  resolveAllSyncErrorRows,
  resolveSchools,
  resetInterviewById,
  SCHOOL_RESOLVE_LIMIT,
} from './writes/ops';
import {
  bulkEventModules,
  bulkEventActivation,
  bulkApplyEventTemplate,
  BULK_EVENTS_LIMIT,
} from './writes/bulk';
import {
  getEmargementCoverage,
  EMARGEMENT_EVENTS_LIMIT,
} from '$lib/server/services/adminStats/emargementCoverage';
import {
  getPdfJobsHealth,
  getAccountDeletionQueue,
  getSfConflictsSummary,
  getBroadcastDeliveries,
  PDF_JOBS_LIMIT,
  BROADCASTS_LIMIT,
  BROADCASTS_DEFAULT_DAYS,
  BROADCASTS_MAX_DAYS,
} from '$lib/server/services/adminStats/opsQueues';
import {
  getAttendanceRate,
  ATTENDANCE_EVENTS_LIMIT,
} from '$lib/server/services/adminStats/attendanceRate';

// One format check, two arities. The operations that compare or rank across
// campuses require a year rather than defaulting to all of them, so the required
// form is not an inlined copy of the regex.
const requiredSchoolYear = z
  .string()
  .regex(/^\d{4}-\d{4}$/, 'School year must be formatted as 2026-2027.');

const schoolYear = requiredSchoolYear
  .optional()
  .describe('School year, e.g. "2026-2027". Omit for every year.');

// A name, not an id: it is what the answers print, so it is what can be asked
// back. See `scope.ts` for why this replaced `campusId`.
const campus = z
  .string()
  .min(1)
  .optional()
  .describe(
    'Campus name as it appears in the answers, e.g. "Lille". Omit for every campus.',
  );

// Both sources are named on purpose. Pointing only at config_unconfigured_events
// left the parameter unusable for a leadership token, which is offered five reads
// that accept it and no configuration answer to obtain one from.
const eventId = z
  .string()
  .min(1)
  .optional()
  .describe(
    'Event id, as returned by stats_attendance_rate for a past event or by config_unconfigured_events for an upcoming one. Omit for every event.',
  );

/**
 * Which tier the caller belongs to, mirrored from the token
 * (`AdminApi_Token.tier`). An admin browser session is always `core`.
 */
export type AdminApiTier = AdminApi_TokenTier;

/**
 * What an operation is told about its caller.
 *
 * `tier` decides what a read may describe (see `meta_operations`).
 * `actorUserId` is the `bauth_user.id` behind the call - the token's owner, or
 * the signed-in admin - which the writes that record accountability elsewhere
 * need: an interview reset stamps its own audit row with a staff profile, and
 * that profile has to be a real person, not "the API".
 */
export type OperationContext = {
  tier: AdminApiTier;
  actorUserId: string;
};

/**
 * One catalogue entry, with its params type-erased at the boundary.
 *
 * `defineOperation` / `defineWrite` keep each entry strongly typed while it is
 * authored (`run`'s argument is inferred from that entry's own `shape`), then
 * return this uniform shape so all consumers can walk the catalogue without
 * casting at every call site. The single erasure lives inside those helpers,
 * next to the strict schema that makes it safe.
 */
export type AdminApiOperation = {
  /** English, model-facing: what it answers and how it is scoped. */
  description: string;
  /** Strict object schema: an unknown param is a refusal, in every consumer. */
  schema: z.ZodObject;
  /** Reads answer a question; writes change a row and record what they changed. */
  kind: 'read' | 'write';
  /**
   * Also callable by a leadership (tier 2) token.
   *
   * An opt-in flag rather than a level number, so `core ⊇ leadership` holds by
   * construction: adding an operation never widens what leadership can reach,
   * it has to be granted here, one entry at a time. `defineWrite` does not
   * accept it at all, which is how "tier 2 is read-only" stops being a rule
   * somebody has to remember.
   */
  leadership: boolean;
  /** Bulk: a dry run first, then an apply echoing that plan's digest. */
  twoStep: boolean;
  run: (
    params: Record<string, unknown>,
    ctx: OperationContext,
  ) => Promise<unknown>;
};

function defineOperation<Shape extends z.ZodRawShape>(op: {
  description: string;
  /** Params as a raw Zod shape; the strict schema is derived from it. */
  shape: Shape;
  /** Grant this read to leadership tokens too. Absent = core team only. */
  leadership?: true;
  run: (
    params: z.output<z.ZodObject<Shape>>,
    ctx: OperationContext,
  ) => Promise<unknown>;
}): AdminApiOperation {
  const leadership = op.leadership ?? false;
  return {
    description: op.description,
    schema: z.strictObject(op.shape),
    kind: 'read',
    leadership,
    twoStep: false,
    run: async (params, ctx) => {
      const answer = await op.run(params as z.output<z.ZodObject<Shape>>, ctx);
      return leadership ? withDataFreshness(answer) : answer;
    },
  };
}

/**
 * Stamp a leadership answer with the age of the data behind it.
 *
 * Granted here rather than in each aggregate, and only for the leadership tier,
 * because the two facts are the same fact: what makes an answer reachable by
 * national leadership is exactly what obliges it to carry its own freshness. A
 * core caller can open `stats_sync_health` or the admin sync page; a leadership
 * token can call neither, so a dead worker would let it read last week's platform
 * with no cue at all. Doing it in the helper also makes it impossible to forget on
 * a future leadership entry, the same reason `defineWrite` refuses `leadership`
 * rather than trusting an author to remember the rule.
 *
 * Throws rather than skipping quietly on an answer that is not a plain object: the
 * integration test runs every read, so a shape this cannot stamp fails there
 * instead of shipping an answer that silently lost its caveat.
 */
async function withDataFreshness(answer: unknown): Promise<unknown> {
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) {
    throw new Error(
      'A leadership operation must answer with an object, so its freshness can travel with it.',
    );
  }
  return { ...answer, fraicheur: await getDataFreshness() };
}

/**
 * A mutating entry. Deliberately a different helper rather than a `kind` flag on
 * the one above: it takes no `leadership` (tier 2 cannot write, and the type
 * system is a better place to say that than a runtime assertion), and its `run`
 * must return a {@link WriteOutcome}, so recording what changed is not something
 * an author can forget.
 *
 * Every write description states its idempotency, because a model retries on
 * timeout and has to know whether that is safe.
 */
function defineWrite<Shape extends z.ZodRawShape>(op: {
  description: string;
  shape: Shape;
  /** Bulk: dry run, then apply with the plan digest (see `plan.ts`). */
  twoStep?: true;
  run: (
    params: z.output<z.ZodObject<Shape>>,
    ctx: OperationContext,
  ) => Promise<WriteOutcome>;
}): AdminApiOperation {
  return {
    description: op.description,
    schema: z.strictObject(op.shape),
    kind: 'write',
    leadership: false,
    twoStep: op.twoStep ?? false,
    run: (params, ctx) => op.run(params as z.output<z.ZodObject<Shape>>, ctx),
  };
}

export const ADMIN_API_OPERATIONS = {
  stats_events_overview: defineOperation({
    description:
      'Where the events stand: how many are visible in the dev workspace, ready to publish or still to configure, and how many enrolments they total. Broken down per campus and per enabled dev-workspace section. Also lists the school years that have events.',
    shape: { schoolYear, campus },
    run: async (params) => getEventsOverview(await resolveScope(params)),
  }),

  stats_onboarding_funnel: defineOperation({
    description:
      'Where the online sign-up funnel leaks: for each step of the talent onboarding ladder, how many talents are stopped on it, plus how many completed the whole thing. Counts only, no name or contact detail exists in this answer. Can be narrowed to one event, one campus or one school year.',
    shape: { eventId, campus, schoolYear },
    run: async (params) => getOnboardingFunnel(await resolveScope(params)),
  }),

  config_unconfigured_events: defineOperation({
    description: `Events, upcoming or ongoing, that are not visible in the dev workspace yet, soonest first, with what each one is still missing. Configuration state only, no personal data. Capped at ${UNCONFIGURED_EVENTS_LIMIT} events; the "truncated" field tells you whether the cap was reached.`,
    shape: { schoolYear, campus },
    run: async (params) => getUnconfiguredEvents(await resolveScope(params)),
  }),

  stats_sync_health: defineOperation({
    description:
      'Whether Salesforce is still feeding Jump: when the last sync landed and how old it is, how many sync errors are waiting, their breakdown by kind, and the age of the oldest. Takes no parameter.',
    shape: {},
    run: () => getSyncHealth(),
  }),

  config_event_detail: defineOperation({
    description:
      'Everything configured on one event: its Salesforce and public names, dates, campus, readiness state and what it is still missing, every dev-workspace section with its sub-options, the feedback form attached to it, and how many people are enrolled.',
    shape: {
      eventId: z
        .string()
        .min(1)
        .describe('Event id, as returned by config_unconfigured_events.'),
    },
    run: (params) => getEventDetail(params.eventId),
  }),

  config_campus_overview: defineOperation({
    description:
      'Per campus: how many events, how many are visible in the dev workspace, how many still need work, total enrolments, the staff by role, and which dev-workspace sections are in use.',
    shape: { schoolYear, campus },
    run: async (params) => getCampusOverview(await resolveScope(params)),
  }),

  config_feedback_forms: defineOperation({
    description:
      'The feedback form catalogue: title, status (draft, published, archived), question count, response count, how many events use it, and whether it accepts public responses. Returns the form ids the other feedback operations take.',
    shape: {},
    run: () => getFeedbackForms(),
  }),

  config_event_templates: defineOperation({
    description:
      'Saved event-configuration presets and exactly what each one applies: sections, sub-options, public name, cohort noun, arrival time and default feedback form. Returns the names the bulk apply operation takes.',
    shape: {},
    run: () => getEventTemplates(),
  }),

  stats_school_year_review: defineOperation({
    leadership: true,
    description:
      'One school year summarised for a steering review: events run, cohort size and make-up, high-school and territorial reach, real show-up rate, whether talents came back, and what they said in their interviews. Pass compareTo to also get every headline figure as a movement against another year, already computed. Also returns "limites", stating in French what these figures cannot be read as. The school year is required.',
    shape: {
      schoolYear: requiredSchoolYear.describe(
        'School year, e.g. "2026-2027". Required for this operation.',
      ),
      compareTo: requiredSchoolYear
        .optional()
        .describe(
          'Another school year to measure against, e.g. "2025-2026". Omit for no comparison.',
        ),
      campus,
    },
    run: async ({ schoolYear, compareTo, ...rest }) => {
      const scope = await resolveScope(rest);
      return getSchoolYearReview({ ...scope, schoolYear }, { compareTo });
    },
  }),

  stats_campus_comparison: defineOperation({
    leadership: true,
    description:
      'The same figure across every campus, already ranked: cohort size, share of women, completed sign-ups, real show-up rate, how many high schools each one reaches, and whether talents came back. One ranking per figure, sorted highest first, so nothing has to be ordered or divided afterwards. The school year is required and no campus filter exists: this operation IS the cross-campus view, narrow it and you get one row.',
    shape: {
      schoolYear: requiredSchoolYear.describe(
        'School year, e.g. "2026-2027". Required: comparing campuses across every year folds the programme growth into the comparison.',
      ),
    },
    run: async ({ schoolYear }) =>
      getCampusComparison({ ...(await resolveScope({})), schoolYear }),
  }),

  stats_schools_churn: defineOperation({
    leadership: true,
    description: `Which high schools are new, which came back and which sent nobody this year, between two school years. Names the schools, most-represented first, capped at ${CHURN_SCHOOLS_LIMIT} per list. Both school years are required; there is no implicit previous year.`,
    shape: {
      schoolYear: requiredSchoolYear.describe(
        'The school year being looked at, e.g. "2026-2027".',
      ),
      compareTo: requiredSchoolYear.describe(
        'The school year it is measured against, e.g. "2025-2026".',
      ),
      campus,
    },
    run: async ({ schoolYear, compareTo, ...rest }) =>
      getSchoolChurn(await resolveScope(rest), { schoolYear, compareTo }),
  }),

  meta_scope: defineOperation({
    leadership: true,
    description:
      'The values the campus and schoolYear filters accept: every campus name with how many events it has, and every school year that has events, newest first. Call it before a filtered question rather than guessing a name, since an unknown one is refused, not answered. Takes no parameter.',
    shape: {},
    run: () => getScopeVocabulary(),
  }),

  // ── Writes ─────────────────────────────────────────────────────────────────
  // Idempotency is stated in every description below, because a model retries
  // on timeout and has to know whether that is safe.

  write_event_config: defineWrite({
    description:
      "Change one event's configuration. Patch semantics: only the fields you pass change, everything else is left exactly as it is, so you never have to restate the rest. Safe to repeat, it sets values rather than adjusting them. Answers with the state before and after.",
    shape: {
      eventId: z
        .string()
        .min(1)
        .describe('Event id, from config_event_detail.'),
      publicName: z
        .string()
        .optional()
        .describe('Friendly name shown to teams and talents.'),
      cohortNoun: z
        .string()
        .optional()
        .describe('What one participant is called, e.g. "stagiaire".'),
      // Both go through the domain predicates rather than a regex copied to
      // here: `isCalendarDay` also rules out a day that does not exist, which a
      // shape check accepts and the date parser downstream would only throw on.
      startTime: z
        .string()
        .refine(isWallClock, 'Use HH:MM on a 24h clock, e.g. "09:30".')
        .optional()
        .describe('Arrival time of day, HH:MM. Salesforce never sends one.'),
      endDate: z
        .string()
        .refine(
          isCalendarDay,
          'Use a real calendar day as YYYY-MM-DD (there is no 2026-06-31).',
        )
        .optional()
        .describe('Last day of the event, YYYY-MM-DD.'),
      modules: z
        .array(z.string())
        .optional()
        .describe(
          `The complete set of dev-workspace sections this event exposes; sections left out are turned off. One of: ${EVENT_MODULE_KEYS.join(', ')}.`,
        ),
    },
    run: (params) => writeEventConfig(params),
  }),

  write_event_activation: defineWrite({
    description:
      'Show or hide one event in the dev workspace. Refused, with what is missing, if the event is not ready to be shown. Safe to repeat. Answers with the state before and after.',
    shape: {
      eventId: z
        .string()
        .min(1)
        .describe('Event id, from config_event_detail.'),
      visible: z
        .boolean()
        .describe('True to show it in the dev workspace, false to hide it.'),
    },
    run: (params) => writeEventActivation(params),
  }),

  write_event_feedback_form: defineWrite({
    description:
      'Attach a feedback form to one event, or detach the current one by omitting formId. Authors no content, only points at an existing form. Safe to repeat. Answers with the state before and after.',
    shape: {
      eventId: z
        .string()
        .min(1)
        .describe('Event id, from config_event_detail.'),
      formId: z
        .string()
        .optional()
        .describe(
          'Form id from config_feedback_forms. Omit to detach the current form.',
        ),
    },
    run: (params) => writeEventFeedbackForm(params),
  }),

  write_event_template: defineWrite({
    description:
      "Save one event's current configuration as a reusable named preset. An existing name is replaced, which is how a preset is edited. Safe to repeat: saving the same event under the same name twice leaves one preset.",
    shape: {
      eventId: z
        .string()
        .min(1)
        .describe('The event whose configuration is captured.'),
      name: z
        .string()
        .min(1)
        .describe('Preset name. An existing one is overwritten.'),
      description: z.string().optional(),
    },
    run: (params) => writeEventTemplate(params),
  }),

  ops_retry_pdf_job: defineWrite({
    description:
      'Regenerate one onboarding document that failed or got stuck. Sends no message to anyone, it only rebuilds a file. Safe to repeat: a document already generated is refused rather than rebuilt. Answers with the resulting state, including the error if it failed again.',
    shape: {
      jobId: z
        .string()
        .min(1)
        .describe('Job id, as returned by ops_pdf_jobs_health.'),
    },
    run: (params) => retryPdfJob(params),
  }),

  ops_resolve_sync_errors: defineWrite({
    description:
      'Mark Salesforce sync errors as handled, either a specific list of ids or every unresolved one of a given kind. Resolving is a flag, nothing is deleted. Safe to repeat: a second call finds nothing left to resolve and reports zero. Requires one of the two filters.',
    shape: {
      ids: z.array(z.string()).optional().describe('Specific error row ids.'),
      errorType: z
        .string()
        .optional()
        .describe(
          'Resolve every unresolved error of this kind. Kinds come from stats_sync_health.',
        ),
    },
    run: (params) => resolveSyncErrorRows(params),
  }),

  ops_resolve_all_sync_errors: defineWrite({
    description:
      'Mark every unresolved Salesforce sync error as handled, with no filter at all. Separate from the filtered operation on purpose: emptying the whole queue is its own decision. Safe to repeat.',
    shape: {},
    run: () => resolveAllSyncErrorRows(),
  }),

  ops_resolve_schools: defineWrite({
    description: `Retry the national directory lookup for high schools Jump only knows by a fallback name, so they stop being invisible in the reach figures. Touches at most ${SCHOOL_RESOLVE_LIMIT} per call. Safe to repeat: a school that resolves drops out of the queue, one the directory still does not know is simply retried.`,
    shape: {
      limit: z.coerce
        .number()
        .int()
        .min(1)
        .max(SCHOOL_RESOLVE_LIMIT)
        .optional()
        .describe(`How many to attempt. Defaults to ${SCHOOL_RESOLVE_LIMIT}.`),
    },
    run: (params) => resolveSchools(params),
  }),

  ops_reset_interview: defineWrite({
    description:
      'Discard one orientation interview so a fresh one can be conducted. NOT safe to repeat and NOT reversible: the answers are deleted, not archived. The interview id is read off the admin interviews page; no operation returns one. A reason is required and is kept in the trail.',
    shape: {
      interviewId: z
        .string()
        .min(1)
        .describe('Interview id, read from the admin interviews page.'),
      reason: z
        .string()
        .min(3)
        .describe('Why it is being discarded. Kept in the audit trail.'),
    },
    run: (params, ctx) =>
      resetInterviewById({ ...params, actorUserId: ctx.actorUserId }),
  }),

  bulk_event_modules: defineWrite({
    twoStep: true,
    description: `Set the same dev-workspace sections on every event matching a filter. Call it WITHOUT planDigest first: it answers with the list of events that would change and a planDigest. Show that list to the human, then call again with the digest to apply. The apply is refused if anything moved in between. At most ${BULK_EVENTS_LIMIT} events per call. Retrying an apply after it has landed is refused rather than repeated, since the digest no longer matches the world.`,
    shape: {
      modules: z
        .array(z.string())
        .describe(
          `The complete set of sections every matching event will expose. One of: ${EVENT_MODULE_KEYS.join(', ')}.`,
        ),
      campus,
      schoolYear,
      onlyUpcoming: z
        .boolean()
        .optional()
        .describe('Leave past events alone. Recommended.'),
      planDigest: z
        .string()
        .optional()
        .describe('Digest returned by the dry run. Omit to get a dry run.'),
    },
    run: (params) => bulkEventModules(params),
  }),

  bulk_event_activation: defineWrite({
    twoStep: true,
    description: `Show or hide every event matching a filter in the dev workspace. Dry run first (no planDigest), then apply with the digest it returns. Events that are not ready to be shown are listed as skipped in the plan rather than silently failing. At most ${BULK_EVENTS_LIMIT} events per call. Retrying an apply after it has landed is refused rather than repeated, since the digest no longer matches the world.`,
    shape: {
      visible: z.boolean().describe('True to show, false to hide.'),
      campus,
      schoolYear,
      onlyUpcoming: z
        .boolean()
        .optional()
        .describe('Leave past events alone. Recommended.'),
      planDigest: z
        .string()
        .optional()
        .describe('Digest returned by the dry run. Omit to get a dry run.'),
    },
    run: (params) => bulkEventActivation(params),
  }),

  bulk_apply_event_template: defineWrite({
    twoStep: true,
    description: `Apply a saved preset's sections to every event matching a filter. Only the sections are applied in bulk, not the preset's names or times. Dry run first (no planDigest), then apply with the digest it returns. At most ${BULK_EVENTS_LIMIT} events per call. Retrying an apply after it has landed is refused rather than repeated, since the digest no longer matches the world.`,
    shape: {
      templateName: z
        .string()
        .min(1)
        .describe('Preset name, from config_event_templates.'),
      campus,
      schoolYear,
      onlyUpcoming: z
        .boolean()
        .optional()
        .describe('Leave past events alone. Recommended.'),
      planDigest: z
        .string()
        .optional()
        .describe('Digest returned by the dry run. Omit to get a dry run.'),
    },
    run: (params) => bulkApplyEventTemplate(params),
  }),

  meta_operations: defineOperation({
    leadership: true,
    description:
      'The catalogue of operations you can call, with each one description and the exact shape of its parameters as a JSON Schema. Use it to discover what is available; it only ever lists what your own credentials may call.',
    shape: {},
    // Annotated, and reading the catalogue it is itself part of: TypeScript
    // cannot infer a return type through that self-reference.
    run: async (_params, ctx): Promise<{ operations: unknown[] }> => ({
      operations: operationsForTier(ctx.tier).map(([name, operation]) => ({
        name,
        kind: operation.kind,
        description: operation.description,
        parameters: z.toJSONSchema(operation.schema),
        ...(operation.twoStep
          ? { twoStep: 'Call without planDigest first to obtain a plan.' }
          : {}),
      })),
    }),
  }),

  ops_api_usage: defineOperation({
    description: `This API's own call log, aggregated: how many calls over the window, how many were refused or failed, and the breakdown per operation, per token and per day. Also lists the catalogue operations nobody called. Window defaults to ${API_USAGE_DEFAULT_DAYS} days, ${API_USAGE_MAX_DAYS} maximum.`,
    shape: {
      days: z.coerce
        .number()
        .int()
        .min(1)
        .max(API_USAGE_MAX_DAYS)
        .optional()
        .describe(
          `How many days back to read. Defaults to ${API_USAGE_DEFAULT_DAYS}.`,
        ),
    },
    // The catalogue's own key list, read at call time. Annotated because the
    // reference is back into the object being defined, which TypeScript cannot
    // infer a return type through.
    run: (params): Promise<ApiUsage> =>
      getApiUsage(params, Object.keys(ADMIN_API_OPERATIONS)),
  }),

  stats_cohort_profile: defineOperation({
    leadership: true,
    description:
      'Who the talents in scope are: how many, the split by declared civilité and by school level, the share who finished the online sign-up, and the share who ever logged in. Every proportion is returned computed, with the denominator it used. Counts only, nobody is named.',
    shape: { schoolYear, campus, eventId },
    run: async (params) => getCohortProfile(await resolveScope(params)),
  }),

  stats_schools_reach: defineOperation({
    leadership: true,
    description: `Which high schools the platform reaches: how many distinct ones, how many départements they cover, the ${SCHOOLS_TOP_N} most represented with their share of the cohort, and how much of the cohort is attached to no identified school at all.`,
    shape: { schoolYear, campus, eventId },
    run: async (params) => getSchoolsReach(await resolveScope(params)),
  }),

  stats_interests_breakdown: defineOperation({
    leadership: true,
    description: `What the cohort says it is interested in, tech and non-tech ranked separately, capped at ${INTERESTS_TOP_N} each. Counts are declarations, not people: one talent can appear in several rows.`,
    shape: { schoolYear, campus, eventId },
    run: async (params) => getInterestsBreakdown(await resolveScope(params)),
  }),

  stats_talent_retention: defineOperation({
    leadership: true,
    description:
      'Whether talents come back: how many enrolled in one, two, three or more events of the scope, how many came more than once, and the average number of events per talent. Takes no event filter, since inside one event the answer can only be one.',
    shape: { schoolYear, campus },
    run: async (params) => getTalentRetention(await resolveScope(params)),
  }),

  stats_onboarding_velocity: defineOperation({
    description: `Whether the sign-up funnel is draining or stalling: completions per day over a window, the busiest day, and the median time a talent takes from being registered to finishing. Window defaults to ${VELOCITY_DEFAULT_DAYS} days, ${VELOCITY_MAX_DAYS} maximum.`,
    shape: {
      schoolYear,
      campus,
      eventId,
      days: z.coerce
        .number()
        .int()
        .min(1)
        .max(VELOCITY_MAX_DAYS)
        .optional()
        .describe(
          `How many days back to measure. Defaults to ${VELOCITY_DEFAULT_DAYS}.`,
        ),
    },
    run: async ({ days, ...scope }) =>
      getOnboardingVelocity(await resolveScope(scope), { days }),
  }),

  stats_compliance_status: defineOperation({
    description:
      'Where the paperwork stands: data charter accepted, internal rules signed by the talent and co-signed by their guardian, and the image-rights decision in three states. A refusal is a settled answer, not a missing signature, so the three states are never merged.',
    shape: { schoolYear, campus, eventId },
    run: async (params) => getComplianceStatus(await resolveScope(params)),
  }),

  stats_engagement: defineOperation({
    description:
      'How much the cohort uses the platform: how many earned experience points and their median, the split by internal XP tier, minigame attempts and how many talents ever played, plus which games are in the daily rotation.',
    shape: { schoolYear, campus, eventId },
    run: async (params) => getEngagement(await resolveScope(params)),
  }),

  ops_emargement_coverage: defineOperation({
    description: `Whether the attendance register is being kept: for events that expose the émargement section, how many half-days exist, how many were closed, and the tally of recorded marks. Capped at ${EMARGEMENT_EVENTS_LIMIT} events in the per-event list.`,
    shape: { schoolYear, campus, eventId },
    run: async (params) => getEmargementCoverage(await resolveScope(params)),
  }),

  ops_pdf_jobs_health: defineOperation({
    description: `State of the onboarding document queue: pending, processing, failed and succeeded, plus the jobs an admin can retry with their ids and ages. A job id identifies a document, never a person. Capped at ${PDF_JOBS_LIMIT} jobs. Takes no parameter.`,
    shape: {},
    run: () => getPdfJobsHealth(),
  }),

  ops_account_deletion_queue: defineOperation({
    description:
      'Account deletion requests waiting for a decision, how many are past the delay Jump commits to, the age of the oldest, and how many were fulfilled or rejected in the last 30 days. Counts only, nobody is named. Takes no parameter.',
    shape: {},
    run: () => getAccountDeletionQueue(),
  }),

  ops_sf_conflicts_summary: defineOperation({
    description:
      'Unresolved disagreements between Jump and Salesforce, grouped by the field they concern, split between real conflicts (both sides claim a value) and values Salesforce is simply missing. Counts only, no talent is identified. Takes no parameter.',
    shape: {},
    run: () => getSfConflictsSummary(),
  }),

  ops_broadcast_deliveries: defineOperation({
    description: `How bulk sends landed: recipients, sent, failed, pending and opens per broadcast, with delivery and open rates. Counts only, never a recipient. Window defaults to ${BROADCASTS_DEFAULT_DAYS} days; capped at ${BROADCASTS_LIMIT} broadcasts in the list.`,
    shape: {
      days: z.coerce
        .number()
        .int()
        .min(1)
        .max(BROADCASTS_MAX_DAYS)
        .optional()
        .describe(
          `How many days back to read. Defaults to ${BROADCASTS_DEFAULT_DAYS}.`,
        ),
    },
    run: (params) => getBroadcastDeliveries(params),
  }),

  stats_interview_insights: defineOperation({
    leadership: true,
    description:
      'What the orientation interviews say: how they heard about us, what motivates them, which school specialities and tech domains they are heading for, how satisfied they were, whether they want to come back, and the team verdict. One distribution per question of the interview grid, plus how much of the cohort was interviewed at all. No free text, nobody named.',
    shape: { schoolYear, campus, eventId },
    run: async (params) => getInterviewInsights(await resolveScope(params)),
  }),

  stats_interview_testimonials: defineOperation({
    leadership: true,
    description: `Sentences students wrote about the event, word for word, from the interview question "le stage en une phrase". Most recent first, no student identified. Default ${TESTIMONIALS_DEFAULT_LIMIT}, ${TESTIMONIALS_MAX_LIMIT} maximum.`,
    shape: {
      schoolYear,
      campus,
      eventId,
      limit: z.coerce
        .number()
        .int()
        .min(1)
        .max(TESTIMONIALS_MAX_LIMIT)
        .optional()
        .describe(
          `How many quotes to return. Defaults to ${TESTIMONIALS_DEFAULT_LIMIT}.`,
        ),
    },
    run: async ({ limit, ...scope }) =>
      getInterviewTestimonials(await resolveScope(scope), { limit }),
  }),

  stats_feedback_results: defineOperation({
    leadership: true,
    description: `How the feedback forms of a périmètre were answered: per questionnaire, how many responses, how many came from a Jump account against the public link, the response rate over the enrolments of the events it is attached to, and the distribution of every closed question. Free-text answers are counted, never returned. Omit formId to get every questionnaire used in the périmètre, capped at ${FEEDBACK_FORMS_LIMIT}; pass one to narrow to it.`,
    shape: {
      formId: z
        .string()
        .min(1)
        .optional()
        .describe(
          'Narrow to one questionnaire, by the id this operation returns for each of them. Omit for all of them.',
        ),
      schoolYear,
      campus,
      eventId,
    },
    run: async ({ formId, ...scope }) =>
      getFeedbackResults(await resolveScope(scope), { formId }),
  }),

  stats_attendance_rate: defineOperation({
    leadership: true,
    description: `Of the people who signed up for an event that has already happened, how many actually turned up, overall and event by event. Only past events count. Capped at ${ATTENDANCE_EVENTS_LIMIT} events in the per-event list.`,
    shape: { schoolYear, campus, eventId },
    run: async (params) => getAttendanceRate(await resolveScope(params)),
  }),
} as const;

export type AdminApiOperationName = keyof typeof ADMIN_API_OPERATIONS;

export const ADMIN_API_OPERATION_NAMES = Object.keys(
  ADMIN_API_OPERATIONS,
) as AdminApiOperationName[];

const entries = () =>
  Object.entries(ADMIN_API_OPERATIONS) as [
    AdminApiOperationName,
    AdminApiOperation,
  ][];

/**
 * Whether a tier may call an operation at all. The single expression of
 * `core ⊇ leadership`, read by the guard (which refuses) and by the MCP server
 * (which simply does not register the tool). Both, on purpose: hiding a tool is
 * how a model avoids asking, refusing the call is what makes it true.
 */
export function isOperationAllowedForTier(
  operation: AdminApiOperation,
  tier: AdminApiTier,
): boolean {
  return tier === 'core' || operation.leadership;
}

/** The operations a tier can call, in catalogue order. */
export function operationsForTier(
  tier: AdminApiTier,
): [AdminApiOperationName, AdminApiOperation][] {
  return entries().filter(([, op]) => isOperationAllowedForTier(op, tier));
}

/**
 * The operations a credential is *offered*: what the MCP server registers as
 * tools.
 *
 * Deliberately not the same question as "may they call it" (`guard.ts`), which
 * also weighs quotas and can only be answered per call. This one is about what
 * a model is shown, and the rule is that it is never shown something it would
 * only ever be refused: a write tool on a read-only token is noise that invites
 * a failed attempt.
 */
export function operationsOfferedTo(credential: {
  tier: AdminApiTier;
  writeEnabled: boolean;
}): [AdminApiOperationName, AdminApiOperation][] {
  return operationsForTier(credential.tier).filter(
    ([, op]) => op.kind !== 'write' || credential.writeEnabled,
  );
}

/**
 * Names of the mutating operations. The write quota counts audit rows by
 * operation name rather than by a `kind` column on `AdminApi_Call`: the name
 * already resolves to its entry here, and a stored marker for a derivable fact
 * is exactly the duplication the schema conventions forbid.
 */
export const ADMIN_API_WRITE_NAMES = entries()
  .filter(([, op]) => op.kind === 'write')
  .map(([name]) => name);
