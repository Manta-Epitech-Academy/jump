import { prisma } from '$lib/server/db';
import type { Prisma } from '@prisma/client';
import { toClosingGrid, type ClosingGrid } from '$lib/domain/closing';

/**
 * Which closing grid an event uses, resolved from the one explicit FK on the
 * event. Mirrors `feedbackForms.ts` and `diplomaTemplates.ts`: one private
 * `where` builder, then a narrow and a full resolver over it, so the nav, the
 * list page and the conduct flow can never disagree about which grid an event
 * holds.
 *
 * There is no fallback. An event with no `closingTemplateId` holds no closings,
 * and that null IS the gate the surface reads, exactly as a null
 * `feedbackFormId` hides the bilan.
 */

/** Minimal event shape the resolvers read. */
export type EventClosingRef = {
  closingTemplateId: string | null;
};

function eventTemplateWhere(
  event: EventClosingRef,
): Prisma.Closing_TemplateWhereUniqueInput | null {
  return event.closingTemplateId ? { id: event.closingTemplateId } : null;
}

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
  const where = eventTemplateWhere(event);
  if (!where) return Promise.resolve(null);
  return prisma.closing_Template.findUnique({ where, select: IDENTITY_SELECT });
}

/** The full grid, for conducting a closing and for reading one back. */
export async function resolveEventClosingGrid(
  event: EventClosingRef,
): Promise<ClosingGrid | null> {
  const where = eventTemplateWhere(event);
  if (!where) return null;
  const graph = await prisma.closing_Template.findUnique({
    where,
    include: TEMPLATE_GRAPH_INCLUDE,
  });
  return graph ? toClosingGrid(graph) : null;
}

/**
 * The grid a record was conducted with, which is pinned on the record and NOT
 * re-read off its event. Retargeting an event must never change how a closing
 * already conducted reads back.
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
 * The catalogue, for the event-config picker and the curated API.
 * Ordered by label so the dropdown reads alphabetically.
 */
export function listClosingTemplates(): Promise<ClosingTemplateIdentity[]> {
  return prisma.closing_Template.findMany({
    select: IDENTITY_SELECT,
    orderBy: { label: 'asc' },
  });
}
