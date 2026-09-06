import { prisma } from '$lib/server/db';
import type { Prisma } from '@prisma/client';
import { toClosingGrid, type ClosingGrid } from '$lib/domain/closing';

/**
 * Which closing grid an event uses, resolved from the one explicit FK on the
 * event, and which grid a record was conducted with, resolved from the one it
 * pinned. Mirrors `feedbackForms.ts` and `diplomaTemplates.ts` in having a
 * narrow resolver (name it) and a full one (load the graph), so the nav, the
 * list page and the conduct flow can never disagree about which grid is in play.
 *
 * There is no fallback. An event with no `closingTemplateId` holds no closings,
 * and that null IS the gate the surface reads, exactly as a null
 * `feedbackFormId` hides the bilan. A caller holding the FK asks the gate itself
 * rather than through a query, which is why only the narrow resolver takes an
 * event: a grid graph is always fetched BY ID, and the id is the record's as
 * soon as one exists.
 */

/** Minimal event shape the resolver reads. */
export type EventClosingRef = {
  closingTemplateId: string | null;
};

/** What names the grid: the picker's label and the page's heading. */
const IDENTITY_SELECT = {
  id: true,
  key: true,
  label: true,
} as const satisfies Prisma.Closing_TemplateSelect;

export type ClosingTemplateIdentity = Prisma.Closing_TemplateGetPayload<{
  select: typeof IDENTITY_SELECT;
}>;

/**
 * The whole grid: sections, the questions each asks, and every option.
 *
 * Ordered in the query rather than in the projection so the two cannot disagree,
 * and `question.options` is ordered here for the same reason.
 */
const TEMPLATE_GRAPH_INCLUDE = {
  sections: {
    orderBy: { position: 'asc' },
    include: {
      questions: {
        orderBy: { position: 'asc' },
        include: {
          question: {
            include: { options: { orderBy: { position: 'asc' } } },
          },
        },
      },
    },
  },
} as const satisfies Prisma.Closing_TemplateInclude;

export type ClosingTemplateGraph = Prisma.Closing_TemplateGetPayload<{
  include: typeof TEMPLATE_GRAPH_INCLUDE;
}>;

/**
 * Just enough to name the grid, for a page that only decides whether to offer
 * the surface and what to call it. Deliberately does not load the graph: that is
 * three joins a list page has no use for.
 */
export function resolveEventClosingIdentity(
  event: EventClosingRef,
): Promise<ClosingTemplateIdentity | null> {
  if (!event.closingTemplateId) return Promise.resolve(null);
  return prisma.closing_Template.findUnique({
    where: { id: event.closingTemplateId },
    select: IDENTITY_SELECT,
  });
}

/**
 * The full grid: for conducting a closing, and for reading one back.
 *
 * The id is the record's `templateId` wherever a record exists, and the event's
 * `closingTemplateId` only for a closing not yet started. Retargeting an event
 * must never change how a closing already conducted reads back, which is why
 * this takes an id and not an event: a resolver that accepted an event was an
 * open invitation to hand it the wrong one, and the conduct page's `load` had
 * accepted it.
 */
export async function resolveClosingGridById(
  templateId: string,
): Promise<ClosingGrid | null> {
  const graph = await prisma.closing_Template.findUnique({
    where: { id: templateId },
    include: TEMPLATE_GRAPH_INCLUDE,
  });
  return graph ? toClosingGrid(graph) : null;
}

/**
 * Several grids at once, keyed by id.
 *
 * The bulk archive renders hundreds of records that between them use a handful
 * of grids, so resolving one per record would be the same three joins over and
 * over. Resolved once per distinct grid instead.
 */
export async function resolveClosingGrids(
  templateIds: string[],
): Promise<Map<string, ClosingGrid>> {
  const unique = [...new Set(templateIds)];
  if (unique.length === 0) return new Map();
  const graphs = await prisma.closing_Template.findMany({
    where: { id: { in: unique } },
    include: TEMPLATE_GRAPH_INCLUDE,
  });
  return new Map(graphs.map((g) => [g.id, toClosingGrid(g)]));
}

/**
 * The catalogue, for the event-config picker and the curated API.
 * Ordered by label so the dropdown reads alphabetically.
 */
export function listClosingTemplates(): Promise<ClosingTemplateIdentity[]> {
  return prisma.closing_Template.findMany({
    select: IDENTITY_SELECT,
    orderBy: { label: 'asc' },
  });
}
