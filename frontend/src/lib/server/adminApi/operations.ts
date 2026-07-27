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
import { resolveScope } from './scope';
import { getEventsOverview } from '$lib/server/services/adminStats/eventsOverview';
import { getOnboardingFunnel } from '$lib/server/services/adminStats/onboardingFunnel';
import {
  getUnconfiguredEvents,
  UNCONFIGURED_EVENTS_LIMIT,
} from '$lib/server/services/adminStats/unconfiguredEvents';
import { getSyncHealth } from '$lib/server/services/adminStats/syncHealth';

const schoolYear = z
  .string()
  .regex(/^\d{4}-\d{4}$/, 'School year must be formatted as 2026-2027.')
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

const eventId = z
  .string()
  .min(1)
  .optional()
  .describe(
    'Event id, as returned by config_unconfigured_events. Omit for every event.',
  );

/**
 * One catalogue entry, with its params type-erased at the boundary.
 *
 * `defineOperation` keeps each entry strongly typed while it is authored (`run`'s
 * argument is inferred from that entry's own `shape`), then returns this uniform
 * shape so both consumers can walk the catalogue without casting at every call
 * site. The single erasure lives inside `defineOperation`, next to the strict
 * schema that makes it safe.
 */
export type AdminApiOperation = {
  /** French, model-facing: what it answers, what the figures mean, which caps. */
  description: string;
  /** Strict object schema: an unknown param is a refusal, in both consumers. */
  schema: z.ZodObject;
  run: (params: Record<string, unknown>) => Promise<unknown>;
};

function defineOperation<Shape extends z.ZodRawShape>(op: {
  description: string;
  /** Params as a raw Zod shape; the strict schema is derived from it. */
  shape: Shape;
  run: (params: z.output<z.ZodObject<Shape>>) => Promise<unknown>;
}): AdminApiOperation {
  return {
    description: op.description,
    schema: z.strictObject(op.shape),
    run: (params) => op.run(params as z.output<z.ZodObject<Shape>>),
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
      'Where the online sign-up funnel leaks: for each step of the talent onboarding ladder, how many talents are stopped on it, plus how many completed the whole thing. Counts only, no name or contact detail exists in this answer. Can be narrowed to one event or one campus.',
    shape: { eventId, campus },
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
} as const;

export type AdminApiOperationName = keyof typeof ADMIN_API_OPERATIONS;

export const ADMIN_API_OPERATION_NAMES = Object.keys(
  ADMIN_API_OPERATIONS,
) as AdminApiOperationName[];
