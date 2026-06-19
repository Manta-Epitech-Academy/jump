import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import {
  parseNoteFilters,
  buildNoteWhere,
  buildNoteOrderBy,
  NOTE_ROW_SELECT,
  projectNoteRow,
  PER_PAGE,
  type NotesCohort,
} from './query';

// Admin is campus-agnostic: this is the global oversight view of every staff
// note across all campuses. Filtering / pagination is server-side and streamed
// behind the shell, mirroring the admin talents directory.
export const load: PageServerLoad = async ({ url }) => {
  const filters = parseNoteFilters(url.searchParams);
  const where = buildNoteWhere(filters);
  const orderBy = buildNoteOrderBy(filters.sort, filters.dir);

  // Un-awaited on purpose: the page shell + toolbar paint immediately while the
  // row page, the total count, and the filter option lists resolve behind the
  // ResultsSkeleton.
  const cohort: Promise<NotesCohort> = (async () => {
    const [rows, totalItems, campuses, authorProfiles] = await Promise.all([
      prisma.note_TalentNote.findMany({
        where,
        orderBy,
        skip: (filters.page - 1) * PER_PAGE,
        take: PER_PAGE,
        select: NOTE_ROW_SELECT,
      }),
      prisma.note_TalentNote.count({ where }),
      prisma.campus.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
      // Only staff who have actually authored a note populate the author filter.
      prisma.staffProfile.findMany({
        where: { notesAuthored: { some: {} } },
        orderBy: { user: { name: 'asc' } },
        select: { id: true, user: { select: { name: true } } },
      }),
    ]);
    return {
      notes: rows.map(projectNoteRow),
      campuses,
      authors: authorProfiles.map((a) => ({
        id: a.id,
        name: a.user.name ?? 'Staff',
      })),
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / PER_PAGE)),
    };
  })();

  return { filters, cohort };
};

export const actions: Actions = {
  // Admin moderation: an admin is the only actor who can remove a note from
  // here. They can't reach the dev feed (dev-gated) and impersonating the talent
  // doesn't surface staff notes, so this is the global steward's one path to pull
  // an inappropriate note about a minor. The route is already admin-gated by
  // hooks; the role check is defensive.
  delete: async ({ url, locals }) => {
    if (locals.staffProfile?.staffRole !== 'admin') {
      return fail(403, { message: 'Action réservée aux admins.' });
    }
    const noteId = url.searchParams.get('id') ?? '';
    if (!noteId) return fail(400, { message: 'Note manquante.' });
    try {
      await prisma.note_TalentNote.delete({ where: { id: noteId } });
      return { success: true };
    } catch (e) {
      console.error('admin delete note', e);
      return fail(500, { message: 'Suppression impossible.' });
    }
  },
};
