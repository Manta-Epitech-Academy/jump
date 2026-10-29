import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { recordUsage } from '$lib/server/usage/record';
import { USAGE_FEATURES } from '$lib/domain/usage';
import {
  buildNoteWhere,
  buildNoteOrderBy,
  NOTE_ROW_SELECT,
  projectNoteRow,
  PER_PAGE,
  type NotesCohort,
} from './query';
import { resolveNoteFilters } from './facets';

// Admin is campus-agnostic: this is the global oversight view of every staff
// note across all campuses. Filtering / pagination is server-side and streamed
// behind the shell, mirroring the admin talents directory.
export const load: PageServerLoad = async ({ url }) => {
  // Un-awaited on purpose: the page shell + toolbar paint immediately while the
  // filters' counts, then the row page and the total count, resolve behind the
  // ResultsSkeleton. The counts come first because they decide which ticked
  // values still exist, and so what the rows match.
  const cohort: Promise<NotesCohort> = (async () => {
    const { filters, facets, campuses } = await resolveNoteFilters(
      url.searchParams,
    );
    const where = buildNoteWhere(filters);
    const orderBy = buildNoteOrderBy(filters.sort, filters.dir);

    const [rows, totalItems] = await Promise.all([
      prisma.note_TalentNote.findMany({
        where,
        orderBy,
        skip: (filters.page - 1) * PER_PAGE,
        take: PER_PAGE,
        select: NOTE_ROW_SELECT,
      }),
      prisma.note_TalentNote.count({ where }),
    ]);
    return {
      notes: rows.map(projectNoteRow),
      facets,
      campuses,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / PER_PAGE)),
    };
  })();

  return { cohort };
};

export const actions: Actions = {
  // Admin moderation: an admin is the only actor who can remove a note from
  // here. They can't reach the dev feed (dev-gated) and impersonating the talent
  // doesn't surface staff notes, so this is the global steward's one path to pull
  // an inappropriate note about a minor. The route is already admin-gated by
  // hooks; the role check is defensive.
  delete: async ({ url, locals }) => {
    recordUsage(USAGE_FEATURES.ADMIN_NOTE_DELETE, { locals });
    if (locals.staffProfile?.staffRole !== 'admin') {
      return fail(403, { message: 'Action réservée aux admins.' });
    }
    const noteId = url.searchParams.get('id') ?? '';
    if (!noteId) return fail(400, { message: 'Note manquante.' });
    try {
      // `deleteMany` so a note already removed (double-submit, or another admin
      // got there first) is a no-op success rather than a P2025 → 500: the row is
      // gone either way, which is the intent. The catch still guards real faults.
      await prisma.note_TalentNote.deleteMany({ where: { id: noteId } });
      return { success: true };
    } catch (e) {
      console.error('admin delete note', e);
      return fail(500, { message: 'Suppression impossible.' });
    }
  },
};
