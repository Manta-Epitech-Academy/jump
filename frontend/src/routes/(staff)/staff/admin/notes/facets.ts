import { prisma } from '$lib/server/db';
import {
  FACET_NONE,
  offerFacets,
  type FacetCount,
  type ListFacet,
} from '$lib/domain/listFacets';
import { parseNoteFilters, type NoteFilters, type NotesFacet } from './view';

/**
 * The gallery's filters as the address asks for them, with every value the
 * gallery does not carry dropped, plus what the page offers: the Auteur
 * column's filter and the campus select's options.
 *
 * The gallery is paged on the server, so the author facet is counted in the
 * database, over every note like every list counts its own, and goes through
 * `offerFacets`, the rules every staff list follows (`$lib/domain/listFacets`).
 * The campus has no column, so it is no column filter: only a ticked campus
 * that no longer exists is dropped.
 */
export async function resolveNoteFilters(params: URLSearchParams): Promise<{
  filters: NoteFilters;
  facets: ListFacet<NotesFacet>[];
  campuses: { id: string; name: string }[];
}> {
  const parsed = parseNoteFilters(params);
  const [byAuthor, authors, campuses] = await Promise.all([
    prisma.note_TalentNote.groupBy({
      by: ['authorId'],
      _count: { _all: true },
    }),
    prisma.staffProfile.findMany({
      where: { notesAuthored: { some: {} } },
      orderBy: { user: { name: 'asc' } },
      select: { id: true, user: { select: { name: true } } },
    }),
    prisma.campus.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ]);

  const counts = new Map(byAuthor.map((a) => [a.authorId, a._count._all]));
  const auteur: FacetCount[] = [
    ...authors.map((a) => ({
      value: a.id,
      label: a.user.name ?? 'Staff',
      count: counts.get(a.id) ?? 0,
    })),
    {
      value: FACET_NONE,
      label: 'Auteur inconnu',
      count: counts.get(null) ?? 0,
    },
  ];

  const [auteurFacet] = offerFacets(
    [{ facet: 'auteur', title: 'Auteur', counts: auteur }],
    parsed.facets,
  );
  const campusIds = new Set(campuses.map((c) => c.id));

  return {
    filters: {
      ...parsed,
      facets: {
        auteur: auteurFacet.selected,
        campus: parsed.facets.campus.filter((id) => campusIds.has(id)),
      },
    },
    facets: [auteurFacet],
    campuses,
  };
}
