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
 *     token needs `writeEnabled`, and whether the answer lands on the audit row
 *     as a before/after.
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
 *     a périmètre key many of these reads accept, so withholding it would leave
 *     them with a parameter this tier cannot obtain. Which operation hands out
 *     which id is declared in `handles.ts` and checked per tier, rather than
 *     counted by hand here: the count this sentence used to carry had drifted to
 *     less than half the real one. A leadership answer
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
import {
  EVENT_MODULES,
  EVENT_MODULE_KEYS,
  type EventModuleKey,
} from '$lib/domain/eventModules';
import { isCalendarDay, isWallClock } from '$lib/domain/planningTime';
import {
  HIGHLIGHT_SUMMARY_MAX,
  HIGHLIGHT_TITLE_MAX,
  TALENT_HOME_NOTE_MAX,
  TALENT_HOME_NOTE_MAX_IMAGES,
} from '$lib/domain/talentHome';
import { resolveScope, UnknownScopeError } from './scope';
import { handleDescribe, handleProvenanceFr } from './handles';
import type { WriteOutcome } from './plan';
import { getOnboardingFunnel } from '$lib/server/services/adminStats/onboardingFunnel';
import {
  getEventsConfigList,
  getEventsDirectory,
  EVENTS_LIST_LIMIT,
  EVENTS_LIST_STATES,
} from '$lib/server/services/adminStats/eventsList';
import {
  getSyncHealth,
  getSyncRuns,
  getSyncSources,
  SYNC_RUNS_LIMIT,
} from '$lib/server/services/adminStats/syncHealth';
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
import { getClosingInsights } from '$lib/server/services/adminStats/closingInsights';
import {
  getClosingQuestion,
  CLOSING_QUESTION_GROUPS_LIMIT,
} from '$lib/server/services/adminStats/closingQuestion';
import {
  getClosingQuestions,
  getClosingTemplates,
} from '$lib/server/services/adminStats/closingConfiguration';
import {
  getClosingTestimonials,
  TESTIMONIALS_DEFAULT_LIMIT,
  TESTIMONIALS_MAX_LIMIT,
} from '$lib/server/services/adminStats/closingTestimonials';
import {
  getFeedbackResults,
  FEEDBACK_FORMS_LIMIT,
} from '$lib/server/services/adminStats/feedbackResults';
import {
  getFeedbackQuestion,
  FEEDBACK_QUESTION_GROUPS_LIMIT,
} from '$lib/server/services/adminStats/feedbackQuestion';
import {
  getOnboardingVelocity,
  VELOCITY_DEFAULT_DAYS,
  VELOCITY_MAX_DAYS,
} from '$lib/server/services/adminStats/onboardingVelocity';
import { getComplianceStatus } from '$lib/server/services/adminStats/complianceStatus';
import { getEngagement } from '$lib/server/services/adminStats/engagement';
import {
  getDiplomaTemplates,
  getEventDetail,
  getCampusOverview,
  getFeedbackForms,
  getEventTemplates,
  getWorkshops,
  getTalentHomeContent,
} from '$lib/server/services/adminStats/configuration';
import { getDiplomaTemplatePreview } from '$lib/server/diplomaTemplates';
import { WORKSHOP_XP_PER_MINUTE } from '$lib/domain/xp';
import { getSchoolYearReview } from '$lib/server/services/adminStats/schoolYearReview';
import { writeDiplomaTemplate } from './writes/diplomas';
import { writeWorkshop, writeWorkshopInstance } from './writes/workshops';
import {
  writeTalentHomeHighlight,
  writeTalentHomeNote,
} from './writes/talentHome';
import { writeEventConfig, writeEventTemplate } from './writes/events';
import {
  retryPdfJob,
  resolveSyncErrorRows,
  resolveAllSyncErrorRows,
  resolveSchools,
  resetClosingById,
  SCHOOL_RESOLVE_LIMIT,
} from './writes/ops';
import {
  releasePruneHold,
  requestSync,
  writeSyncCadence,
  writeSyncMemberStatus,
  writeSyncSource,
} from './writes/sync';
import { writeClosingQuestion, writeClosingTemplate } from './writes/closings';
import { writeFeedbackForm, copyFeedbackForm } from './writes/feedbackForms';
import {
  formFields,
  optionFields,
  questionFields,
  sectionFields,
  withQuestionRules,
} from '$lib/validation/feedbackForms';
import { bulkEventConfig, BULK_EVENTS_LIMIT } from './writes/bulk';
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
  getFeatureUsage,
  getFeatureAdoptionGaps,
  getCampusFeatureCoverage,
} from '$lib/server/services/adminStats/featureUsage';
import { getStaffActivity } from '$lib/server/services/adminStats/staffActivity';
import {
  USAGE_FEATURE_KEYS,
  USAGE_RAW_RETENTION_MONTHS,
} from '$lib/domain/usage';

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

// The lifecycle axis, kept apart from the configuration one: an event is upcoming,
// ongoing or past by the calendar, and configured or not by what an admin did.
/**
 * The window, in days. Closed rather than free so a caller cannot ask for a span
 * the raw rows no longer cover without being told which store answered; the
 * answer's `source` field says which one did.
 */
const usageDays = z
  .enum(['7', '30', '90', '365'])
  .optional()
  .describe(
    `Window in days. Beyond ${USAGE_RAW_RETENTION_MONTHS} months the answer comes from the monthly rollup, which knows only whole months: the window is then rounded outward to the months it touches, and the answer's "source" says so. Omit for 30.`,
  );

const usageAudience = z
  .enum(['staff', 'talent'])
  .optional()
  .describe(
    'Restrict to features used by the team, or by talents. Omit for both.',
  );

const usageSpace = z
  .enum(['dev', 'admin', 'talent'])
  .optional()
  .describe('Restrict to one workspace. Omit for all of them.');

const usageFeature = z
  .string()
  .min(1)
  .optional()
  .describe(`${handleDescribe('usageFeatureKey')} Omit for every feature.`);

const eventStatus = z
  .enum(['upcoming', 'ongoing', 'past'])
  .optional()
  .describe(
    'Keep only events at this point of their life: upcoming, ongoing or past. Omit for every event.',
  );

// Generated from `handles.ts`, which names the sources that return every event
// for each tier. This describe used to name one operation that by construction
// excludes anything already visible, which left the parameter unusable for the
// commonest state an event can be in - and unusable outright for a leadership
// token, whose only source returned past events.
const eventId = z
  .string()
  .min(1)
  .optional()
  .describe(`${handleDescribe('eventId')} Omit for every event.`);

/**
 * Which tier the caller belongs to, mirrored from the token
 * (`AdminApi_Token.tier`). An admin browser session is always `core`.
 */
export type AdminApiTier = AdminApi_TokenTier;

/**
 * What an operation is told about its caller.
 *
 * `tier` is the tier of the credential that called.
 * `actorUserId` is the `bauth_user.id` behind the call - the token's owner, or
 * the signed-in admin - which the writes that record accountability elsewhere
 * need: a closing reset stamps its own audit row with a staff profile, and
 * that profile has to be a real person, not "the API".
 */
export type OperationContext = {
  tier: AdminApiTier;
  actorUserId: string;
  /**
   * Origin of the request being answered, for an answer that has to link back to
   * this instance (the certificate preview does).
   *
   * From the request, never from `env.ORIGIN`: a self-referencing link built from
   * config points wherever config says regardless of which instance replied. Two
   * dev servers on two ports is enough to break it, and it broke exactly that way
   * once, handing out :5173 links from the instance on :3030.
   */
  origin: string;
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

/**
 * A feature key the catalogue does not know is a refusal, not an empty answer.
 *
 * Same rule as an unknown campus in `scope.ts`, and it matters more here: the
 * honest answer for a real feature nobody used is a zero, so a typo returning a
 * zero would be indistinguishable from the finding this whole operation exists
 * to produce.
 */
function assertUsageFeature(value: string | undefined) {
  if (value === undefined) return undefined;
  const known = USAGE_FEATURE_KEYS.find((key) => key === value);
  if (!known) {
    throw new UnknownScopeError(
      `Fonctionnalité « ${value} » inconnue. ${handleProvenanceFr('usageFeatureKey')}`,
    );
  }
  return known;
}

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

/**
 * What every picture-taking write accepts, said once so the operations cannot
 * describe the same copy in different words (`images/remote.ts`).
 */
const PICTURE_RULES =
  'Any proportion and any size: Jump downloads the picture (following redirects), keeps it whole and lays it out itself, never cropping or stretching it. PNG, JPEG, WebP or GIF, animated or not, up to 20 MB (an animated GIF up to 6 MB, since talents load it as it is on their phones); Jump shows a still of an animation to talents who asked for reduced motion. Refused, with the reason: an address that is not public, a file that is not one of those formats (an SVG, AVIF or HEIC is named as such), a picture over about 16 megapixels. An address the call already holds a copy of is not downloaded again, so restating it is free and never fails; to replace a picture, give its new address.';

/**
 * An https address of a picture Jump is to download and copy. The scheme is
 * checked here, at the boundary, so every write that takes a picture refuses
 * the same thing in the same words, and the service under it can be exercised
 * against a local test server.
 */
const httpsPictureUrl = z
  .string()
  .url()
  .refine((value) => value.startsWith('https://'), {
    message:
      'An https address is required: Jump downloads the picture from it.',
  });

function pictureUrl(describe: string) {
  return httpsPictureUrl.optional().describe(describe);
}

/**
 * One answer option of a feedback form, as `write_feedback_form` takes it and
 * `config_feedback_forms` returns it. Strict at every depth: a misspelt
 * `optionId` silently dropped would turn a rename into a new option.
 */
const feedbackOption = z
  .strictObject({
    optionId: z
      .string()
      .min(1)
      .nullish()
      .describe(
        'The id config_feedback_forms returned for this option. Keep it to edit the option: a renamed option keeps the answers already given to it. Omit it to create an option.',
      ),
    label: optionFields.label.describe(
      'French, what the respondent picks. Unique within its question: answers are matched on it.',
    ),
    kind: optionFields.kind.describe(
      '"choice" for an ordinary option. "extra" only on a scale question, for an answer outside the scale such as "Je ne sais pas".',
    ),
    reaction: optionFields.reaction.describe(
      'French line the persona says right after this option is picked. Omit for none.',
    ),
  })
  // Named, so the JSON Schema a client reads defines it once and references it,
  // rather than inlining it in every question that carries options.
  .meta({ id: 'FeedbackOption' });

const feedbackQuestion = withQuestionRules(
  z.strictObject({
    key: questionFields.key.describe(
      'Stable identifier of the question in this form, lowercase letters, digits and _ only. It is what identifies the question: keep it to edit the question, a new key is a new question.',
    ),
    prompt: questionFields.prompt.describe(
      'French, what the persona asks. May cite {prenom}, {nom}, {campus}, {civilite}.',
    ),
    type: questionFields.type.describe(
      'single, multiple or scale take options (a scale lists them best first); text and textarea take a free answer and no options.',
    ),
    required: questionFields.required.describe('Defaults to true.'),
    identityField: questionFields.identityField.describe(
      "Makes this a question that collects the respondent's identity, asked to public respondents only (a connected talent is already known). At most one question per field, never on a multiple choice. Omit for an ordinary question.",
    ),
    inputKind: questionFields.inputKind.describe(
      'Text questions only: checks the answer as an e-mail or a phone number. An identity question derives it from its field.',
    ),
    minSelections: questionFields.minSelections.describe(
      'Multiple choice only: fewest options to pick.',
    ),
    maxSelections: questionFields.maxSelections.describe(
      'Multiple choice only: most options to pick, no more than it has options.',
    ),
    placeholder: questionFields.placeholder.describe(
      'French hint shown in an empty text field.',
    ),
    options: z
      .array(feedbackOption)
      .default([])
      .describe('The options, in display order.'),
  }),
)
  // Named for the same reason as the option: a form takes questions in two
  // places (outside any section, and inside each one), and inlined twice the
  // question was two thirds of this tool's whole schema.
  .meta({ id: 'FeedbackQuestion' });

/** A dev-workspace section's settings when it has no sub-option to set. */
const noSubOptions = z.strictObject({}).optional();

export const ADMIN_API_OPERATIONS = {
  stats_events: defineOperation({
    leadership: true,
    description: `Every event of a périmètre, one row each: its id, the name teams and students see, its campus, its dates, whether it is upcoming, ongoing or past, and how many enrolments the dev workspace shows for it. Answers "what is running right now", and is where an event id comes from for the operations that take one. Capped at ${EVENTS_LIST_LIMIT} rows.`,
    shape: { schoolYear, campus, status: eventStatus },
    run: async ({ status, ...scope }) =>
      getEventsDirectory(await resolveScope(scope), { status }),
  }),

  stats_onboarding_funnel: defineOperation({
    description:
      'Where the online sign-up funnel leaks: for each step of the talent onboarding ladder, how many talents are stopped on it, plus how many completed the whole thing. Counts only, no name or contact detail exists in this answer. Can be narrowed to one event, one campus or one school year.',
    shape: { eventId, campus, schoolYear },
    run: async (params) => getOnboardingFunnel(await resolveScope(params)),
  }),

  config_events: defineOperation({
    description: `Every event of a périmètre, one row each: its id, its public and Salesforce names, its campus, its dates, how many enrolments Jump holds, how many of them the dev workspace shows and how many it masks, which dev-workspace sections are on, the feedback form attached to it, its configuration state, and both what is still unset and what actually stops it from being made visible. This is where an event id comes from. Filter by campus, school year, point of life or configuration state. Capped at ${EVENTS_LIST_LIMIT} rows; "truncated" tells you whether the cap was reached.`,
    shape: {
      schoolYear,
      campus,
      status: eventStatus,
      state: z
        .enum(EVENTS_LIST_STATES)
        .optional()
        .describe(
          'Keep only events in this configuration state: unconfigured (no section enabled), ready (configured but hidden), shown (live in the dev workspace), or to_prepare for anything not past that is not shown yet. Omit for every state.',
        ),
    },
    run: async ({ status, state, ...scope }) =>
      getEventsConfigList(await resolveScope(scope), { status, state }),
  }),

  stats_sync_health: defineOperation({
    description:
      'Whether Salesforce is still feeding Jump: when each pass last succeeded and how old that is, the configured cadences, what the worker will do next, whether one is running, how many sync errors are waiting, their breakdown by kind, and the age of the oldest, and every Salesforce member status Jump holds with what the dev workspace does with it, naming the events that carry a status Jump does not know. The two passes are reported apart because only the full one detects a deletion in Salesforce. Takes no parameter.',
    shape: {},
    run: () => getSyncHealth(),
  }),

  config_sync_sources: defineOperation({
    description:
      'Which Salesforce campaigns Jump synchronises, on which campus, and whether each is actually served to the worker. A "parent" source expands to every child campaign on each run, so new events under it are discovered without editing anything. This is where a Salesforce campaign id comes from for write_sync_source. Takes no parameter.',
    shape: {},
    run: () => getSyncSources(),
  }),

  stats_sync_runs: defineOperation({
    description: `What the synchronisation worker actually did, run by run, newest first: which pass, whether it succeeded, how long it took, what it pushed, and the error if it failed. This is the only trace of a run that exists, the worker being ephemeral. A tick with nothing due writes no row. Capped at ${SYNC_RUNS_LIMIT} runs.`,
    shape: {
      limit: z.coerce
        .number()
        .int()
        .min(1)
        .max(SYNC_RUNS_LIMIT)
        .optional()
        .describe(
          `How many runs to return, newest first. Defaults to 20, capped at ${SYNC_RUNS_LIMIT}.`,
        ),
    },
    run: (params) => getSyncRuns(params),
  }),

  config_event_detail: defineOperation({
    description:
      'Everything configured on one event: its Salesforce and public names, dates, campus, readiness state and what it is still missing, every dev-workspace section with its sub-options, the feedback form attached to it, and how many enrolments Jump holds, how many of them the dev workspace shows and how many it masks.',
    shape: {
      eventId: z.string().min(1).describe(handleDescribe('eventId')),
    },
    run: (params) => getEventDetail(params.eventId),
  }),

  config_campus_overview: defineOperation({
    description:
      'Where the events stand, in total and per campus (every campus, even one with no event in scope): how many are visible in the dev workspace, ready to publish or still to configure, how many still need work, how many enrolments the dev workspace shows, which dev-workspace sections are in use, and the staff by role.',
    shape: { schoolYear, campus },
    run: async (params) => getCampusOverview(await resolveScope(params)),
  }),

  config_diploma_templates: defineOperation({
    description:
      "The certificates Jump can issue at the end of an event, plus everything needed to write a new one: the placeholders a design may use and the constraints of the template it is inserted into. Pass a code to also get that certificate's current design, which is what you edit from rather than rewriting it.",
    shape: {
      code: z
        .string()
        .min(1)
        .optional()
        .describe(
          `${handleDescribe('diplomaCode')} Pass one to also return its design; omit for the catalogue alone.`,
        ),
    },
    run: (params) => getDiplomaTemplates(params),
  }),

  config_diploma_template_preview: defineOperation({
    description:
      'What one certificate actually looks like: its first page, rendered as an image by the same engine as the real export, with placeholder names so it shows no real person. Reply by quoting the "apercu" sentence, which carries a link to that image, and quote it every time even when you also display the image: you cannot tell whether the reader\'s client renders one, and a reply that shows nothing and describes the design instead is worse than useless. Never say how a certificate looks in your own words, neither from its HTML nor from the image: send the link and let it be seen.',
    shape: {
      code: z.string().min(1).describe(handleDescribe('diplomaCode')),
    },
    run: (params, ctx) =>
      getDiplomaTemplatePreview({ ...params, origin: ctx.origin }),
  }),

  config_closing_questions: defineOperation({
    description:
      'The bank of questions a closing grid can ask, with the options each offers and how many answers it already holds. A question belongs to the bank, not to one grid: the same question asked at a stage and at a Coding Club is one row, which is what lets a distribution span both. Also returns what an author needs to know before writing one, including the accepted valence and pictogram vocabularies.',
    shape: {},
    run: () => getClosingQuestions(),
  }),

  config_closing_templates: defineOperation({
    description:
      "The closing grids that exist, how many questions each asks and how many events use it. Pass templateKey to also get that grid's composition, section by section, which is what you edit from rather than rewriting it. Returns the ids the other closing operations take.",
    shape: {
      templateKey: z
        .string()
        .min(1)
        .optional()
        .describe(
          `${handleDescribe('closingTemplateKey')} Pass one to also return its composition; omit for the catalogue alone.`,
        ),
    },
    run: (params) => getClosingTemplates(params),
  }),

  config_feedback_forms: defineOperation({
    description:
      'The feedback form catalogue: title, status (draft, published, archived), question count, response count, how many events use it, and whether it accepts public responses. Returns the form ids the other feedback operations take. Pass formId to also get that form whole, in the exact shape write_feedback_form takes, which is what you edit from rather than rewriting it, and the authoring rules a write enforces.',
    shape: {
      formId: z
        .string()
        .min(1)
        .optional()
        .describe(
          `${handleDescribe('formId')} Pass one to also return the whole form; omit for the catalogue alone.`,
        ),
    },
    run: (params) => getFeedbackForms(params),
  }),

  config_workshops: defineOperation({
    description:
      'The online activities Jump can send a talent to, and the CTFd instances that serve them. An activity is one content an instance serves: its slug (the name the instance gives that content), the French name a talent reads, the instance serving it, whether it is offered today, how many events offer it, how many talents have entered it, and how it presents itself on the talent dashboard (tagline, and each picture with the address it was copied from, which write_workshop takes back as its cover). An instance is a host: its slug, its address and the activities declared on it, retired ones included. The subject itself (steps, wording) lives in the instance. Also returns how an activity turns into XP. Returns the slugs write_workshop, write_workshop_instance and the workshops of write_event_config take.',
    shape: {},
    run: () => getWorkshops(),
  }),

  config_talent_home: defineOperation({
    description:
      "What each campus shows on its talents' home besides their own enrolments: the campus note (Markdown, in the news card) and the highlighted event to sign up for (title, text, day, sign-up link, the address its picture was copied from if it has one, and whether it is still shown, since it hides itself once its day has passed). Lists every campus, including those with neither, so it answers which campuses are still empty. Pass campus to read one. This is what to read before rewriting either with write_talent_home_note or write_talent_home_highlight.",
    shape: {
      campus: z
        .string()
        .optional()
        .describe('Campus name, e.g. "Lille". Omit to list every campus.'),
    },
    run: async (params) => getTalentHomeContent(await resolveScope(params)),
  }),

  config_event_templates: defineOperation({
    description:
      'Saved event-configuration presets and exactly what each one holds: sections and their sub-options, shown Salesforce statuses, public name, cohort noun, arrival time, and the feedback form, certificate and closing grid it points at. A preset is applied by copying its values: to write_event_config for one event, or its modules and shownStatuses to bulk_event_config for many.',
    shape: {},
    run: () => getEventTemplates(),
  }),

  stats_school_year_review: defineOperation({
    leadership: true,
    description:
      'One school year summarised for a steering review: events run, cohort size and make-up, high-school and territorial reach, whether talents came back, and what they said in their closings. Pass compareTo to also get every headline figure as a movement against another year, already computed. Also returns "limites", stating in French what these figures cannot be read as. The school year is required.',
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
      'The same figure across every campus, already ranked: cohort size, share of women, completed sign-ups, how many high schools each one reaches, whether talents came back, how much of the closing work is done, and the share of profiles the team judged favourably. One ranking per figure, sorted highest first, so nothing has to be ordered or divided afterwards. A campus the figure cannot be computed for is unranked rather than last - a campus that conducted no closing is not a campus without a compatible profile. The school year is required and no campus filter exists: this operation IS the cross-campus view, narrow it and you get one row.',
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
      "Change anything about one event's configuration in one call: names, dates, dev-workspace sections and their options, shown Salesforce statuses, the feedback form, certificate and closing grid it uses, the online activities it offers, and whether the dev workspace shows it. Patch semantics: only the fields you pass change, null clears a reference, everything else is left exactly as it is. All of it is saved together or not at all, and the rules are judged on the result, so the missing pieces and visible: true can come in the same call. Safe to repeat, it sets values rather than adjusting them. Answers with the state before and after.",
    shape: {
      eventId: z.string().min(1).describe(handleDescribe('eventId')),
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
      shownStatuses: z
        .array(z.string())
        .optional()
        .describe(
          `${handleDescribe('sfStatus')} The complete set of Salesforce member statuses whose enrolments the dev workspace shows for this event; statuses left out are masked (still synced and in Jump). Enrolments with no status at all are always shown.`,
        ),
      moduleSettings: z
        .strictObject({
          [EVENT_MODULES.INSCRITS]: z
            .strictObject({
              showStatutColumn: z
                .boolean()
                .optional()
                .describe(
                  "Show the dossier progress column (connexion, règlement, droit à l'image) on the Inscrits table.",
                ),
            })
            .optional(),
          // A section with no sub-option still has its key, holding nothing:
          // the reads return every enabled section's settings that way, so
          // what a preset or this write's own answer holds goes back as it is.
          [EVENT_MODULES.EMARGEMENT]: noSubOptions,
          [EVENT_MODULES.BILAN]: noSubOptions,
          [EVENT_MODULES.CLOSINGS]: noSubOptions,
        } satisfies Record<EventModuleKey, z.ZodType>)
        .optional()
        .describe(
          'Sub-options per section, only those you pass change. A section must be in the saved modules, so enable it in the same call if it is not.',
        ),
      visible: z
        .boolean()
        .optional()
        .describe(
          'True to show it in the dev workspace, false to hide it. Showing needs a public name, an end date and at least one section, as saved by this call.',
        ),
      feedbackFormId: z
        .string()
        .min(1)
        .nullable()
        .optional()
        .describe(
          `${handleDescribe('formId')} The form its bilan section uses. Null detaches it.`,
        ),
      diplomaTemplateId: z
        .string()
        .min(1)
        .nullable()
        .optional()
        .describe(
          `${handleDescribe('diplomaTemplateId')} The certificate its Inscrits export issues. Null so it issues none.`,
        ),
      closingTemplateId: z
        .string()
        .min(1)
        .nullable()
        .optional()
        .describe(
          `${handleDescribe('closingTemplateId')} The grid its closings use. Null so it holds none.`,
        ),
      workshops: z
        .array(
          z.strictObject({
            slug: z.string().min(1).describe(handleDescribe('workshopSlug')),
            durationMinutes: z
              .number()
              .int()
              .positive()
              .describe(
                `How long the activity runs at this event, in minutes. It is the scale: finishing it whole is worth durationMinutes x ${WORKSHOP_XP_PER_MINUTE} XP. Changing it changes nobody retroactively, since a talent's scale is pinned when they first enter.`,
              ),
            labelOverride: z
              .string()
              .optional()
              .describe(
                'The words this event reads the activity aloud with, when the catalogue name does not fit the format. Wording only: every figure keeps the catalogue label.',
              ),
          }),
        )
        .optional()
        .describe(
          'The complete ordered list of online activities this event offers, in the order a talent sees them; anything left out is no longer offered, an empty list offers none.',
        ),
    },
    run: (params) => writeEventConfig(params),
  }),

  write_feedback_form: defineWrite({
    twoStep: true,
    description:
      'Create a feedback form, or replace one whole. Read it first with config_feedback_forms and its formId, change what must change, and send everything back: whatever is left out is removed. Without planDigest it answers with the form as it stands, the form that would replace it, and a planDigest; the apply is refused if the form was edited or answered in between. Once a form has responses its structure is frozen: wording and settings still change, but adding, removing or reordering a section, question or option, or changing what a question collects (key, type, required, identity field, input kind, selection bounds) is refused; copy it with write_feedback_form_copy, write the copy, then archive the original. A defect a frozen structure already carries is not refused, so wording, settings and archiving stay possible. The rules stated on the parameters are checked together and every refusal comes back at once. Retire a form by setting status to archived; nothing deletes one. Safe to repeat on an existing form, since a retried apply no longer matches its digest; creating (no formId) is NOT, so keep the formId it answers with. Answers with the form as written, ids included.',
    shape: {
      formId: z
        .string()
        .min(1)
        .optional()
        .describe(`${handleDescribe('formId')} Omit to create a new form.`),
      title: formFields.title.describe(
        'French, the name staff see in the catalogue.',
      ),
      intro: formFields.intro.describe(
        "French opening line the persona speaks, may cite {prenom}. Omit for Jump's default greeting.",
      ),
      outro: formFields.outro.describe(
        "French closing line the persona speaks. Omit for Jump's default goodbye.",
      ),
      personaName: formFields.personaName.describe(
        'Name the persona introduces itself by. Omit for the default mascot.',
      ),
      personaIconUrl: httpsPictureUrl
        .nullable()
        .optional()
        .describe(
          'https address of the persona avatar. Jump downloads it and keeps a 256 px still: PNG, JPEG or WebP up to 20 MB, or a GIF up to 6 MB whose first frame is kept, from a public address. Restating the address the icon came from downloads nothing. Null puts the default mascot back. Omit to leave the icon as it is, which is the only way to keep one uploaded in the builder.',
        ),
      status: formFields.status.describe(
        'draft while it is being written, published to accept responses, archived to retire it.',
      ),
      allowsAuthenticatedAccess: formFields.allowsAuthenticatedAccess.describe(
        'Connected talents can answer it from Jump.',
      ),
      allowsPublicAccess: formFields.allowsPublicAccess.describe(
        'Anybody with the public link can answer it. Requires an e-mail identity question once published.',
      ),
      dashboardNudge: formFields.dashboardNudge.describe(
        'The talent dashboard reminds connected talents to answer it. Requires allowsAuthenticatedAccess.',
      ),
      questions: z
        .array(feedbackQuestion)
        .describe('Questions outside any section, asked first, in order.'),
      sections: z
        .array(
          z.strictObject({
            sectionId: z
              .string()
              .min(1)
              .nullish()
              .describe(
                'The id config_feedback_forms returned for this section. Keep it to edit the section, omit it to create one.',
              ),
            title: sectionFields.title.describe(
              'French heading of this part of the form.',
            ),
            intro: sectionFields.intro.describe(
              'French line the persona says when the section starts. Omit for none.',
            ),
            questions: z
              .array(feedbackQuestion)
              .describe('The questions of this section, in order.'),
          }),
        )
        .describe('The sections, in order, each with its questions.'),
      planDigest: z
        .string()
        .optional()
        .describe('Digest returned by the dry run. Omit to get a dry run.'),
    },
    run: (params, ctx) => writeFeedbackForm(params, ctx.actorUserId),
  }),

  write_feedback_form_copy: defineWrite({
    description:
      'Copy a feedback form whole into a new draft: the same sections, questions, options, persona and icon, none of its responses. The copy starts as a draft, closed to the public, with no dashboard nudge, and its title ends in « (copie) ». NOT safe to repeat: every call makes another copy, so keep the formId it answers with. Answers with the copy, ids included.',
    shape: {
      formId: z
        .string()
        .min(1)
        .describe(`${handleDescribe('formId')} The form to copy.`),
    },
    run: (params, ctx) => copyFeedbackForm(params, ctx.actorUserId),
  }),

  write_diploma_template: defineWrite({
    description:
      'Create or replace a certificate design, identified by its code: a code that does not exist yet creates one, an existing code replaces it. Refused, saying what is wrong, if it uses an unknown placeholder, references anything remote, carries markup that cannot be printed, or does not render. Safe to repeat: the same code and the same design leave one certificate. Answers with what was stored (code, label, page size), whether anything changed, what a printed page weighs (reported, never refused), and an "apercu" sentence carrying a link to its preview, to quote as the preview operation says. The design itself is not repeated: config_diploma_templates returns it.',
    shape: {
      code: z
        .string()
        // A slug, because it is not only a key: it names the downloaded file, so
        // it reaches a `Content-Disposition` header. Constrained here, where the
        // value is created, rather than escaped at each place it is read.
        .regex(
          /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
          'lowercase letters, digits and single hyphens only',
        )
        .describe(
          `${handleDescribe('diplomaCode')} Creates or replaces by it, so a code that does not exist yet is a new certificate. Lowercase letters, digits and hyphens only.`,
        ),
      label: z
        .string()
        .min(1)
        .describe(
          'French name teams see and that names the downloaded file, e.g. "Certificat de participation".',
        ),
      styleCss: z
        .string()
        .describe(
          'The stylesheet, inserted once in the document head. No @import and no remote url().',
        ),
      bodyHtml: z
        .string()
        .describe(
          'The markup of ONE page, repeated per recipient, with {placeholders}. No <style> tag: put CSS in styleCss. Inline <svg> is welcome for drawings and ornaments, text included.',
        ),
      pageWidthPx: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Page width in CSS pixels. 1123 for A4 landscape.'),
      pageHeightPx: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Page height in CSS pixels. 794 for A4 landscape.'),
    },
    run: (params, ctx) =>
      writeDiplomaTemplate({ ...params, origin: ctx.origin }),
  }),

  write_workshop_instance: defineWrite({
    description:
      'Declare or update one CTFd instance, the host online activities run on, identified by its slug: a slug that does not exist yet creates one, an existing slug updates its address. It says where Jump sends a talent and nothing else; what the instance serves is write_workshop. Safe to repeat: the same slug and the same address leave one instance. Answers with the instance before and after.',
    shape: {
      instance: z
        .string()
        .min(1)
        .regex(
          /^[a-z0-9-]+$/,
          'Lowercase letters, digits and hyphens only, e.g. "camps-2026".',
        )
        .describe(
          `${handleDescribe('workshopInstanceSlug')} It is the slug set on the instance's own CTFd admin page (/admin/workshop/jump), which the instance checks every entry against. Creates or updates by it. It names the host only, so it stays the same when the instance moves on to another content.`,
        ),
      baseUrl: z
        .string()
        .min(1)
        .describe(
          'Address of the CTFd instance, origin only with no path, e.g. "https://pacman.epiboost.fr". Jump appends the entry path itself.',
        ),
    },
    run: (params) => writeWorkshopInstance(params),
  }),

  write_workshop: defineWrite({
    description: `Declare or update one online activity, the content a CTFd instance serves, identified by its slug: what a talent reads (its French name), the instance serving it, whether it is offered, and how it presents itself on the talent dashboard (its cover). A slug that does not exist yet creates one; on an existing one only the fields you pass change. When an instance moves on to another content, declare that content as a new activity on the same instance and retire the old one with enabled false: every talent keeps the XP of the content they walked, filed under its own slug. It authors no subject content. The cover is a tagline (the one line its hero leads with, in place of the activity's name) and up to three pictures given as https addresses, which Jump downloads and copies so a talent's browser never loads anything from another host: media is the main visual, poster an optional still shown in its place to talents who reduce motion (without one, an animated visual shows its own first frame), mascot the subject's character. ${PICTURE_RULES} All or nothing: if one picture cannot be copied, nothing changes and the refusal says which and why. Safe to repeat: the same call leaves the same activity. Answers with the activity before and after.`,
    shape: {
      slug: z
        .string()
        .min(1)
        // The longest content name the instance accepts in an entry ticket.
        .max(128)
        .regex(
          /^[a-z0-9-]+$/,
          'Lowercase letters, digits and hyphens only, e.g. "pacman-ia".',
        )
        .describe(
          `${handleDescribe('workshopSlug')} It must be exactly the content the instance's own CTFd admin page (/admin/workshop/jump) shows as synced there: the instance refuses an entry for any other, so a typo fails at the first entry rather than losing anyone's XP. Creates or updates by it. Never rename one: it is what every past XP grant is filed under.`,
        ),
      instance: z
        .string()
        .min(1)
        .optional()
        .describe(
          `${handleDescribe('workshopInstanceSlug')} The instance serving this content. Required to create one. It can be changed only while no talent has entered the activity: another instance would start them over on fresh accounts and take back their XP. An instance that only changes address is updated with write_workshop_instance.`,
        ),
      label: z
        .string()
        .min(1)
        .optional()
        .describe(
          'French name a talent reads on their dashboard, e.g. "Pacman IA". Required to create one. An event may read it differently without changing it, see the workshops of write_event_config.',
        ),
      enabled: z
        .boolean()
        .optional()
        .describe(
          'Whether it is offered today. Omit to leave it as it stands, which is what keeps a label fix from putting a retired activity back in front of a cohort.',
        ),
      cover: z
        .strictObject({
          tagline: z
            .string()
            .trim()
            .min(1)
            .max(90)
            .optional()
            .describe(
              'French, one line a talent reads big, e.g. "Apprends à un fantôme à te traquer". Omit to lead with the activity name.',
            ),
          mediaUrl: pictureUrl(
            'https address of the main visual, a still or an animated GIF, any proportion. Omit for none.',
          ),
          posterUrl: pictureUrl(
            'https address of a still chosen for the visual, shown in its place to talents who reduce motion and when the visual fails to load. Optional even for an animated visual, whose first frame is used otherwise. Omit for none.',
          ),
          mascotUrl: pictureUrl(
            "https address of the subject's character, drawn small above the tagline (pixel art stays crisp). Omit for none.",
          ),
        })
        .nullable()
        .optional()
        .describe(
          'The WHOLE cover: anything it omits is removed, so to change one part read config_workshops first and pass the rest back as it stands. Null removes the cover; omit it to leave the cover as it is.',
        ),
    },
    run: (params) => writeWorkshop(params),
  }),

  write_talent_home_note: defineWrite({
    description: `Set or clear one campus's note on its talents' home (« le mot du campus »), the one message in the news card (« Actualités ») of every talent whose campus it is (a talent's campus is the one of their latest-dated event, upcoming ones included): welcome words, the next dates, a Discord link, pictures. The page adds no label or title of its own, so open with a heading when the message needs one. Markdown: headings, lists, emphasis, links to https:// or mailto:, and pictures written ![what it shows](https://…), at most ${TALENT_HOME_NOTE_MAX_IMAGES}. Jump copies each picture and talents see the copy, drawn whole and bounded in size in the card, larger when they open the message; the note keeps the address as written. ${PICTURE_RULES} Raw HTML is refused rather than stripped, so what is stored is exactly what talents read. At most ${TALENT_HOME_NOTE_MAX} characters, not counting the pictures' addresses. All or nothing: if one picture cannot be copied, nothing changes and the refusal says which and why. Pass markdown null to remove it. Safe to repeat: the same text leaves the same note. Answers with the note before and after.`,
    shape: {
      campus: z.string().min(1).describe('Campus name, e.g. "Lille".'),
      markdown: z
        .string()
        .nullable()
        .describe(
          'The whole note in Markdown, replacing the previous one; null removes it. Write it in French, addressing the talent as « tu ».',
        ),
    },
    run: (params) => writeTalentHomeNote(params),
  }),

  write_talent_home_highlight: defineWrite({
    description: `Set or clear the one event a campus puts forward on its talents' home, with a button that opens the sign-up form in a new tab: a JPO, the next Coding Club, a camp. It leads the home's blue hero on any day the talent has no activity, and sits as a compact line under the activity on a day they have one. It is chosen by hand, never taken from Salesforce. Give all four of title, summary, date and url to set it, all four null to remove it; anything in between is refused. imageUrl is optional: an https picture Jump copies. ${PICTURE_RULES} Omitted, the highlight has none, and a picture that cannot be copied refuses the whole write. It hides itself once its day has passed on the campus clock, so nothing has to be cleaned up afterwards, and a day already past is refused. Safe to repeat: the same values leave the same highlight. Answers with the highlight before and after.`,
    shape: {
      campus: z.string().min(1).describe('Campus name, e.g. "Lille".'),
      title: z
        .string()
        .max(HIGHLIGHT_TITLE_MAX)
        .nullable()
        .describe(
          'What the event is, in French, at most 80 characters, e.g. "Recode le jeu Snake en JS".',
        ),
      summary: z
        .string()
        .max(HIGHLIGHT_SUMMARY_MAX)
        .nullable()
        .describe(
          'What happens there and why come, in French addressing the talent as « tu », at most 300 characters.',
        ),
      date: z
        .string()
        .refine(isCalendarDay, 'A real calendar day, e.g. "2026-10-07".')
        .nullable()
        .describe(
          'The day the event takes place, YYYY-MM-DD. It is shown until the end of that day.',
        ),
      url: z
        .string()
        .nullable()
        .describe(
          'The sign-up form, https only, e.g. "https://www.epitech.eu/inscription-atelier-programmation-informatique/?CampaignId=701Sm00000xAuQMIA0".',
        ),
      imageUrl: pictureUrl(
        'https address of a picture of the event, shown in the hero beside its title. Omit for none, and always omit it when clearing.',
      ),
    },
    run: (params) => writeTalentHomeHighlight(params),
  }),

  write_closing_question: defineWrite({
    description:
      'Create or replace one question of the closing bank, identified by its key: a key that does not exist yet creates one, an existing key replaces it. Refused, saying what is wrong, if it uses an unknown valence or pictogram, or if it changes the type or drops an option of a question students have already answered. Wording stays editable on purpose. Safe to repeat: the same key and the same content leave one question. Answers with the question before and after.',
    shape: {
      questionKey: z
        .string()
        .min(1)
        .describe(
          `${handleDescribe('closingQuestionKey')} Creates or replaces by it, so a key that does not exist yet is a new question. A question whose meaning changes needs a NEW key, never an edit to this one.`,
        ),
      label: z
        .string()
        .min(1)
        .describe(
          'The canonical French wording, and the name every figure is quoted under. A grid that needs to phrase it differently overrides the prompt, not this.',
        ),
      kind: z
        .enum(['single', 'multi', 'rating', 'text'])
        .optional()
        .describe(
          'How it is answered. Required when creating; on an existing question it can only change while nobody has answered it.',
        ),
      hint: z
        .string()
        .optional()
        .describe('A line under the question, for the person asking it.'),
      max: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('rating only: the top of the scale.'),
      maxLength: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('text only: the character ceiling of the answer.'),
      placeholder: z
        .string()
        .optional()
        .describe('text only: what the input invites the team to type.'),
      notePlaceholder: z
        .string()
        .optional()
        .describe(
          "What the team's note under this question invites, in the grids that offer one.",
        ),
      testimonial: z
        .boolean()
        .optional()
        .describe(
          "Its free text is the student's own words and is meant to be quoted. At most one per grid.",
        ),
      retired: z
        .boolean()
        .optional()
        .describe(
          'Retire it: it stays readable on past closings but can no longer enter a new grid.',
        ),
      options: z
        .array(
          z.object({
            value: z
              .string()
              .min(1)
              .describe(
                'Stable stored value, quoted by analytics. Never renamed.',
              ),
            label: z.string().min(1).describe('French wording of the option.'),
            tone: z
              .string()
              .optional()
              .describe('Valence, on ordinal answers only.'),
            icon: z
              .string()
              .optional()
              .describe('Pictogram token, where one exists.'),
          }),
        )
        .optional()
        .describe(
          'The choices offered, in order. single and multi only. Omit to leave the current options untouched.',
        ),
    },
    run: (params) => writeClosingQuestion(params),
  }),

  write_closing_template: defineWrite({
    twoStep: true,
    description:
      'Create or replace a closing grid, identified by its key: which bank questions it asks, in which sections, in what order. Call it WITHOUT planDigest first: it answers with the grid as it stands, the composition that would replace it, and a planDigest. Show that to the human, then call again with the digest to apply. The apply is refused if the grid has been recomposed in between, because a grid is replaced whole and the other edit would be lost without a trace. Refused too if it names a question that does not exist or has been retired, asks the same one twice, marks more than one as quotable, or asks nothing at all. Composing a grid never touches an answer already recorded. Retrying an apply after it has landed is refused rather than repeated, since the digest no longer matches the world. Answers with the composition before and after.',
    shape: {
      templateKey: z
        .string()
        .min(1)
        .describe(
          `${handleDescribe('closingTemplateKey')} Creates or replaces by it, so a key that does not exist yet is a new grid.`,
        ),
      label: z
        .string()
        .min(1)
        .describe('French name teams see, e.g. "Closing Coding Club".'),
      sections: z
        .array(
          z.object({
            title: z
              .string()
              .min(1)
              .describe('Section heading, one step of the flow.'),
            synthesisPosition: z
              .number()
              .int()
              .min(0)
              .optional()
              .describe(
                'Where this section sits when the closing is read back, if that differs from the order it is conducted in. Omit to follow the conduct order.',
              ),
            questions: z
              .array(
                z.object({
                  questionKey: z
                    .string()
                    .min(1)
                    .describe(handleDescribe('closingQuestionKey')),
                  labelOverride: z
                    .string()
                    .optional()
                    .describe(
                      'What THIS grid reads aloud, when the canonical wording does not fit the format. Changes the prompt only: the figure keeps the bank name and stays comparable.',
                    ),
                  withNote: z
                    .boolean()
                    .optional()
                    .describe(
                      'Offer the team a free-text note under this question here. A short closing usually wants none.',
                    ),
                }),
              )
              .describe('The questions of this section, in order.'),
          }),
        )
        .describe('The whole composition, replacing the current one.'),
      planDigest: z
        .string()
        .optional()
        .describe('Digest returned by the dry run. Omit to get a dry run.'),
    },
    run: (params) => writeClosingTemplate(params),
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
        .describe(
          `${handleDescribe('templateName')} An existing one is overwritten.`,
        ),
      description: z.string().optional(),
    },
    run: (params) => writeEventTemplate(params),
  }),

  ops_retry_pdf_job: defineWrite({
    description:
      'Regenerate one onboarding document that failed or got stuck. Sends no message to anyone, it only rebuilds a file. Safe to repeat: a document already generated is refused rather than rebuilt. Answers with the resulting state, including the error if it failed again.',
    shape: {
      jobId: z.string().min(1).describe(handleDescribe('pdfJobId')),
    },
    run: (params) => retryPdfJob(params),
  }),

  ops_resolve_sync_errors: defineWrite({
    description:
      'Mark every unresolved Salesforce sync error of one kind as handled. Resolving is a flag, nothing is deleted. Safe to repeat: a second call finds nothing left to resolve and reports zero. The kind is required: emptying the whole queue is ops_resolve_all_sync_errors, deliberately a separate act.',
    shape: {
      errorType: z
        .string()
        .min(1)
        .describe(
          `Resolve every unresolved error of this kind. Required: emptying the whole queue without naming a kind is ops_resolve_all_sync_errors, deliberately a separate act. ${handleDescribe('syncErrorType')}`,
        ),
    },
    run: (params) => resolveSyncErrorRows(params),
  }),

  write_sync_source: defineWrite({
    description:
      'Add a Salesforce campaign to the synchronised perimeter, move it to another campus, rename it, or switch it off. Switching off sets a flag, it deletes nothing, so it can be switched back on. Safe to repeat: this is an upsert on the campaign id, so the same call twice leaves the same row. Adding one requires both campus and kind; changing an existing one only sends what changes. Takes effect at the worker next wake-up, within fifteen minutes.',
    shape: {
      salesforceCampaignId: z
        .string()
        .min(1)
        .describe(
          `Salesforce campaign id, 15 or 18 alphanumeric characters, copied from the campaign URL in Salesforce. ${handleDescribe('salesforceCampaignId')}`,
        ),
      kind: z
        .enum(['parent', 'orphan'])
        .optional()
        .describe(
          'How to expand this campaign. "parent" syncs every child campaign under it, re-resolved on every run, so a new event created under it in Salesforce appears on its own; "orphan" syncs this campaign alone. Required when adding a campaign, optional when changing one.',
        ),
      campus: z
        .string()
        .min(1)
        .optional()
        .describe(
          'Campus name as it appears in the answers, e.g. "Lille". Required when adding a campaign, optional when changing one.',
        ),
      enabled: z
        .boolean()
        .optional()
        .describe(
          'Whether the worker is served this campaign. Set false to stop syncing it without losing the configuration.',
        ),
      label: z
        .string()
        .optional()
        .describe(
          'What a human calls this campaign, so the list reads as something other than a column of Salesforce ids. Never sent to the worker.',
        ),
    },
    run: (params) => writeSyncSource(params),
  }),

  write_sync_member_status: defineWrite({
    description:
      'Add a Salesforce member status to the words Jump knows, or change whether newly created events show it. A word Jump does not know is masked everywhere and reported by stats_sync_health; adding it stops the report but shows it on no existing event: write_event_config or bulk_event_config does that. Safe to repeat: an upsert on the word. Nothing is ever deleted.',
    shape: {
      memberStatus: z
        .string()
        .min(1)
        .describe(
          `${handleDescribe('sfStatus')} Stored trimmed and upper-cased, the way the sync stores it.`,
        ),
      shownByDefault: z
        .boolean()
        .optional()
        .describe(
          'Whether an event the sync creates from now on starts by showing this status. Defaults to false for a new word; existing events are never changed by it.',
        ),
    },
    run: (params) => writeSyncMemberStatus(params),
  }),

  write_sync_cadence: defineWrite({
    description:
      'Set how often one synchronisation pass runs, in minutes. The incremental pass keeps data fresh; the full pass is the only one that detects a member removed in Salesforce, so spacing it out means deletions arrive later. Safe to repeat: writing the same value twice leaves the same row. Takes effect at the worker next wake-up, within fifteen minutes, with nothing to redeploy.',
    shape: {
      mode: z
        .enum(['full', 'incremental'])
        .describe(
          'Which pass to set. "incremental" pulls only the campaigns Salesforce reports as changed; "full" pulls the whole perimeter and is what notices a deletion.',
        ),
      intervalMinutes: z.coerce
        .number()
        .int()
        .min(15)
        .max(20160)
        .describe(
          'Minutes between two passes of this kind. The floor is 15 because the worker is only woken every 15 minutes, so asking for less changes nothing.',
        ),
    },
    run: (params) => writeSyncCadence(params),
  }),

  ops_request_sync: defineWrite({
    description:
      'Ask the synchronisation worker for one pass of the given kind at its next wake-up (within fifteen minutes), without changing any cadence. Use it when someone needs a change made in Salesforce to reach Jump now rather than at the next scheduled pass. The request is satisfied by the first successful pass that starts after it, after which the configured cadences apply again with nothing to restore; a pass that fails leaves it pending. stats_sync_health shows whether a request is pending and what the worker will do next. Safe to repeat: asking again before it runs still yields one pass.',
    shape: {
      mode: z
        .enum(['full', 'incremental'])
        .describe(
          'Which pass to ask for. "incremental" pulls only the campaigns Salesforce reports as changed, and is enough to see a modification; "full" pulls the whole perimeter and is the only pass that notices a member removed in Salesforce.',
        ),
    },
    run: (params) => requestSync(params),
  }),

  ops_release_prune_hold: defineWrite({
    description:
      'Confirm that the enrolments a full synchronisation pass held back on one event really are gone, so the next full pass deletes them. A full pass only deletes enrolments missing from Salesforce when the roster it received is complete; otherwise it keeps them and lists the event in stats_sync_health (prunesHeld). Use this when the campaign was genuinely emptied in Salesforce. Only a hold over an empty roster can be released: one over members Jump could not match is lifted by fixing their sync errors, after which the next full pass prunes by itself. It deletes nothing by itself: the next full pass applies the deletions if the roster it receives is still empty. That pass comes at the full cadence; ops_request_sync with mode "full" brings it forward to the next wake-up, within fifteen minutes. Safe to repeat: releasing an already released hold changes nothing. Refused when the event has no held deletions, or when the held roster was not empty.',
    shape: {
      eventId: z.string().min(1).describe(handleDescribe('eventId')),
    },
    run: (params) => releasePruneHold(params),
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

  ops_reset_closing: defineWrite({
    description:
      'Discard one closing so a fresh one can be conducted. NOT safe to repeat and NOT reversible: the answers are deleted, not archived. The closing id is read off the admin closings page; no operation returns one. A reason is required and is kept in the trail.',
    shape: {
      closingId: z.string().min(1).describe(handleDescribe('closingId')),
      reason: z
        .string()
        .min(3)
        .describe('Why it is being discarded. Kept in the audit trail.'),
    },
    run: (params, ctx) =>
      resetClosingById({ ...params, actorUserId: ctx.actorUserId }),
  }),

  bulk_event_config: defineWrite({
    twoStep: true,
    description: `Change the configuration of every event matching a filter, in one plan: their dev-workspace sections, the Salesforce statuses they show, and whether the dev workspace shows them. Patch semantics: only the fields you pass change. Call it without planDigest for the list of events that would change and how (events that cannot be shown are listed with what they lack, judged after the sections this call sets), then with the planDigest to apply it all in one transaction. At most ${BULK_EVENTS_LIMIT} events per call. Retrying an apply after it has landed is refused rather than repeated, since the digest no longer matches the world.`,
    shape: {
      campus,
      schoolYear,
      onlyUpcoming: z
        .boolean()
        .optional()
        .describe(
          'Leave past events alone. Recommended for sections and visibility; usually NOT wanted for a renamed status, whose old enrolments Salesforce rewrites too.',
        ),
      modules: z
        .array(z.string())
        .optional()
        .describe(
          `The complete set of sections every matching event will expose. One of: ${EVENT_MODULE_KEYS.join(', ')}. New sections get their default options; kept ones keep theirs.`,
        ),
      shownStatuses: z
        .array(z.string())
        .optional()
        .describe(
          `${handleDescribe('sfStatus')} The complete set of statuses every matching event will show, e.g. a preset's from config_event_templates. Not with showStatuses or hideStatuses.`,
        ),
      showStatuses: z
        .array(z.string())
        .optional()
        .describe(
          `${handleDescribe('sfStatus')} Statuses every matching event will show, on top of what each already shows. Made for a word Salesforce renamed: show the new one and hide the old one in one call.`,
        ),
      hideStatuses: z
        .array(z.string())
        .optional()
        .describe(
          `${handleDescribe('sfStatus')} Statuses every matching event will stop showing. Their enrolments stay synced and in Jump.`,
        ),
      visible: z
        .boolean()
        .optional()
        .describe(
          'True to show them in the dev workspace, false to hide them.',
        ),
      planDigest: z
        .string()
        .optional()
        .describe('Digest returned by the dry run. Omit to get a dry run.'),
    },
    run: (params) => bulkEventConfig(params),
  }),

  ops_api_usage: defineOperation({
    description: `This API's own call log, aggregated: how many calls over the window, how many were refused or failed, and the breakdown per operation, per token and per day. Also lists the catalogue operations nobody called, the ones with the highest refusal rate, and the operation names callers reached for that do not exist - the last two being where a question this API answers badly, or not at all, shows up. Window defaults to ${API_USAGE_DEFAULT_DAYS} days, ${API_USAGE_MAX_DAYS} maximum.`,
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

  stats_feature_usage: defineOperation({
    leadership: true,
    description:
      'Which features of Jump are actually used: per feature, the number of uses, the distinct people who used it in its busiest calendar month, the share of the population that could have, the last month it served, and its movement against the same months a year earlier. Every catalogued feature is listed whether or not it was used, because naming the ones nobody touches is the point. Ranked on distinct people, not on uses. Counts only, nobody is named.',
    shape: {
      schoolYear,
      campus,
      eventId,
      audience: usageAudience,
      space: usageSpace,
      days: usageDays,
      feature: usageFeature,
    },
    run: async ({ audience, space, days, feature, ...scope }) =>
      getFeatureUsage(await resolveScope(scope), {
        audience,
        space,
        days: days ? Number(days) : undefined,
        feature: assertUsageFeature(feature),
      }),
  }),

  stats_feature_adoption_gaps: defineOperation({
    leadership: true,
    description:
      'The actionable half of feature adoption: the features nobody used over the window, the features that served a year ago and serve nobody now, and the features exactly one campus uses. Three lists, because the three decisions differ. The second is the strong retire signal, since a feature that was never used may simply never have been found, while one that stopped being used was found and then abandoned; the third is a training question, not a removal one. The campus filter narrows the first two lists only: how many campuses use a feature is a national fact, so narrowing it to one campus would make it true of everything that campus uses.',
    shape: { schoolYear, campus, days: usageDays },
    run: async ({ days, ...scope }) =>
      getFeatureAdoptionGaps(await resolveScope(scope), {
        days: days ? Number(days) : undefined,
      }),
  }),

  stats_campus_feature_coverage: defineOperation({
    leadership: true,
    description:
      'Which campus uses what, ranked: one row per campus with how many of the measurable features it used, out of how many available, and its adoption rate. Pass a feature to compare that one feature across every campus, which is also the only way an actor count is returned, since people who use several features cannot be added up. Only features attached to a campus or an event appear, since an admin-space feature is national.',
    shape: { schoolYear, days: usageDays, feature: usageFeature },
    run: async ({ days, feature, ...scope }) =>
      getCampusFeatureCoverage(await resolveScope(scope), {
        days: days ? Number(days) : undefined,
        feature: assertUsageFeature(feature),
      }),
  }),

  ops_staff_activity: defineOperation({
    description:
      'Whether the team logs in at all: headcount with a role, accounts never opened, active in the last 7 days, inactive for over 30, and the median days since last activity, broken down per campus and per role. Nobody is named; open the members page for that.',
    shape: { campus },
    run: async (params) => getStaffActivity(await resolveScope(params)),
  }),

  stats_schools_reach: defineOperation({
    leadership: true,
    description: `Which high schools the platform reaches: how many distinct ones, how many départements they cover, the ${SCHOOLS_TOP_N} most represented with their share of the cohort, and how much of the cohort is attached to no identified school at all - split into the ones who named a school Jump could not match and the ones who named none, because those two are chased differently.`,
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

  stats_closing_insights: defineOperation({
    leadership: true,
    description:
      'What the closings say: how they heard about us, what motivates them, which school specialities and tech domains they are heading for, how satisfied they were, whether they want to come back, and the team verdict. One distribution per question, plus how much of the cohort had a closing at all. A périmètre can mix several grids: a question several of them ask is aggregated once, and each carries the number of closings that actually asked it. No free text, nobody named.',
    shape: { schoolYear, campus, eventId },
    run: async (params) => getClosingInsights(await resolveScope(params)),
  }),

  stats_closing_question: defineOperation({
    leadership: true,
    description: `One question of the closing bank, in full: every answer with a count and a share, how many closings actually asked it against how many answered, and - when its answers carry a declared order - the share of favourable ones. Pass groupBy to get the same figures per campus, per event or per grid, already ranked. Grouping by grid is how a stage and a Coding Club are compared on the same question: the bank holds it once, so both formats fall into one distribution and this is what splits it back apart. A question whose options carry no order comes back unranked rather than ordered on an invented best, and a free-text question is refused. Capped at ${CLOSING_QUESTION_GROUPS_LIMIT} groups.`,
    shape: {
      // `questionKey`, not `question`: the handle registry is keyed by parameter
      // name across the whole catalogue, and `question` is already the feedback
      // form's question key. Spelling this one the same way published that this
      // read needs a value produced by `stats_feedback_results`. It is also the name the closing writes already
      // use for a bank key.
      questionKey: z
        .string()
        .min(1)
        .describe(handleDescribe('closingQuestionKey')),
      groupBy: z
        .enum(['campus', 'event', 'grid'])
        .optional()
        .describe(
          'Break the figures down per campus, per event or per closing grid, ranked. Omit to answer for the whole périmètre at once.',
        ),
      schoolYear,
      campus,
      eventId,
    },
    run: async ({ questionKey, groupBy, ...scope }) =>
      getClosingQuestion(await resolveScope(scope), { questionKey, groupBy }),
  }),

  stats_closing_testimonials: defineOperation({
    leadership: true,
    description: `Sentences students wrote about the event, word for word, from the one question each closing grid marks as quotable. Most recent first, no student identified. Default ${TESTIMONIALS_DEFAULT_LIMIT}, ${TESTIMONIALS_MAX_LIMIT} maximum.`,
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
      getClosingTestimonials(await resolveScope(scope), { limit }),
  }),

  stats_feedback_results: defineOperation({
    leadership: true,
    description: `How the feedback forms of a périmètre were answered: per questionnaire, its id, how many responses, how many came from a Jump account against the public link, the response rate over the enrolments of the events it is attached to, and then every closed question with its stable key, its wording, and each of its answer options with a count and a share. Free-text answers are counted, never returned: student sentences meant to be quoted live in stats_closing_testimonials instead. Omit formId to get every questionnaire used in the périmètre, capped at ${FEEDBACK_FORMS_LIMIT}; pass one to narrow to it.`,
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

  stats_feedback_question: defineOperation({
    leadership: true,
    description: `One question of one feedback form, in full: every answer option in the form's own order with a count and a share, how many people answered it against how many answered the questionnaire, and - for a scale question, whose options run best to worst - the share of favourable answers. Pass groupBy to get the same figures per campus or per event, already ranked on that share. A question whose options carry no order returns no favourable share and no ranking, rather than an invented one. Capped at ${FEEDBACK_QUESTION_GROUPS_LIMIT} groups.`,
    shape: {
      formId: z.string().min(1).describe(handleDescribe('formId')),
      question: z.string().min(1).describe(handleDescribe('questionKey')),
      groupBy: z
        .enum(['campus', 'event'])
        .optional()
        .describe(
          'Break the figures down per campus or per event, ranked. Omit to answer for the whole périmètre at once.',
        ),
      schoolYear,
      campus,
      eventId,
    },
    run: async ({ formId, question, groupBy, ...scope }) =>
      getFeedbackQuestion(await resolveScope(scope), {
        formId,
        question,
        groupBy,
      }),
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
 * is answered per call. This one is about what a model is shown, and the rule is
 * that it is never shown something it would only ever be refused: a write tool
 * on a read-only token is noise that invites a failed attempt.
 */
export function operationsOfferedTo(credential: {
  tier: AdminApiTier;
  writeEnabled: boolean;
}): [AdminApiOperationName, AdminApiOperation][] {
  return operationsForTier(credential.tier).filter(
    ([, op]) => op.kind !== 'write' || credential.writeEnabled,
  );
}
