import { defineListView, type SortedListView } from '$lib/domain/listView';

/**
 * The notes gallery's view, in the address every staff list shares
 * (`$lib/domain/listView`). Client-safe, unlike `./query`: the page reads it to
 * write its filters and sort, the server to read them back.
 *
 * Who wrote the note (`auteur`, a staff profile id, `aucun` for an author whose
 * account was deleted since) filters from the Auteur column, counted in the
 * database over every note (`./facets`). The campus (`campus`, campus ids) has
 * no column, a talent's campus being only a line under their name, so it keeps
 * its own select on the page.
 */

export const NOTES_FACETS = ['auteur', 'campus'] as const;

export type NotesFacet = (typeof NOTES_FACETS)[number];

/** The talent alphabetically, the most recent note first. */
export const NOTES_SORT_DEFAULT_DIR = {
  talent: 'asc',
  date: 'desc',
} as const;

export type NotesSortKey = keyof typeof NOTES_SORT_DEFAULT_DIR;

export const NOTES_VIEW = defineListView({
  facets: NOTES_FACETS,
  sort: { firstDir: NOTES_SORT_DEFAULT_DIR, defaultKey: 'date' },
});

/** What narrows and orders the gallery: its view, the search and the page. */
export type NoteFilters = SortedListView<NotesFacet, NotesSortKey> & {
  q: string;
  page: number;
};

/** Parse the gallery filters off the URL; nothing in it can break the read. */
export function parseNoteFilters(params: URLSearchParams): NoteFilters {
  return {
    ...NOTES_VIEW.parse(params),
    q: (params.get('q') ?? '').trim(),
    page: Math.max(1, Number(params.get('page')) || 1),
  };
}
