import type { Prisma } from '@prisma/client';

// Admin is campus-agnostic, so the notes oversight directory is global across
// every campus. Filter parsing / where building / row projection live here (not
// in the page) so the page and any future export can't drift, mirrors
// `admin/talents/query.ts`.

export const PER_PAGE = 50;

export type NoteSortKey = 'date' | 'talent';

export type NoteFilters = {
  q: string;
  campusIds: string[];
  /** A StaffProfile id, or '' for all authors. */
  author: string;
  /** Sortable column (header click); defaults to creation date. */
  sort: NoteSortKey;
  dir: 'asc' | 'desc';
  page: number;
};

export function parseNoteFilters(sp: URLSearchParams): NoteFilters {
  const campusIds = (sp.get('campus') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    q: (sp.get('q') ?? '').trim(),
    campusIds,
    author: sp.get('author') ?? '',
    sort: sp.get('sort') === 'talent' ? 'talent' : 'date',
    dir: sp.get('dir') === 'asc' ? 'asc' : 'desc',
    page: Math.max(1, Number(sp.get('page') ?? '1') || 1),
  };
}

export function buildNoteWhere(
  f: NoteFilters,
): Prisma.Note_TalentNoteWhereInput {
  const and: Prisma.Note_TalentNoteWhereInput[] = [];

  // Search the note body AND the talent it's about (name / email), so one box
  // finds "what was written" or "about whom".
  if (f.q) {
    and.push({
      OR: [
        { body: { contains: f.q, mode: 'insensitive' } },
        {
          talent: {
            OR: [
              { nom: { contains: f.q, mode: 'insensitive' } },
              { prenom: { contains: f.q, mode: 'insensitive' } },
              { user: { email: { contains: f.q, mode: 'insensitive' } } },
            ],
          },
        },
      ],
    });
  }

  // Campus = the talent participates on one of the selected campuses (talents
  // carry no direct campus FK), same resolution as the talents directory.
  if (f.campusIds.length) {
    and.push({
      talent: { participations: { some: { campusId: { in: f.campusIds } } } },
    });
  }

  if (f.author) {
    and.push({ authorId: f.author });
  }

  return and.length ? { AND: and } : {};
}

export function buildNoteOrderBy(
  sort: NoteSortKey,
  dir: 'asc' | 'desc',
): Prisma.Note_TalentNoteOrderByWithRelationInput[] {
  // `id` tiebreaker keeps pagination stable when many notes share a sort key.
  if (sort === 'talent') {
    return [
      { talent: { nom: dir } },
      { talent: { prenom: dir } },
      { id: 'desc' },
    ];
  }
  return [{ createdAt: dir }, { id: 'desc' }];
}

export const NOTE_ROW_SELECT = {
  id: true,
  body: true,
  createdAt: true,
  updatedAt: true,
  editedById: true,
  author: { select: { user: { select: { name: true, image: true } } } },
  editedBy: { select: { user: { select: { name: true } } } },
  event: { select: { titre: true } },
  talent: {
    select: {
      id: true,
      prenom: true,
      nom: true,
      user: { select: { email: true } },
      civilite: true,
      // Effective campus = most-recent participation's campus, same as the
      // other admin talent views; disambiguates same-name talents. Its timezone
      // rides along so each row's date renders in its own campus wall clock (the
      // gallery is global, spanning campuses, and is SSR'd under a UTC server).
      participations: {
        take: 1,
        orderBy: { event: { date: 'desc' } },
        select: { campus: { select: { name: true, timezone: true } } },
      },
    },
  },
} satisfies Prisma.Note_TalentNoteSelect;

type NoteRow = Prisma.Note_TalentNoteGetPayload<{
  select: typeof NOTE_ROW_SELECT;
}>;

export function projectNoteRow(n: NoteRow) {
  return {
    id: n.id,
    body: n.body,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
    edited: n.editedById !== null,
    author: n.author
      ? { name: n.author.user.name, image: n.author.user.image }
      : null,
    editedByName: n.editedBy?.user.name ?? null,
    eventTitre: n.event?.titre ?? null,
    talent: {
      id: n.talent.id,
      prenom: n.talent.prenom,
      nom: n.talent.nom,
      email: n.talent.user?.email ?? null,
      civilite: n.talent.civilite,
    },
    campus: n.talent.participations[0]?.campus?.name ?? null,
    // IANA tz of that campus (defaulted, matching getCampusTimezone), used to
    // format this row's dates in the campus wall clock rather than the server's.
    timezone: n.talent.participations[0]?.campus?.timezone ?? 'Europe/Paris',
  };
}

export type NoteDirectoryRow = ReturnType<typeof projectNoteRow>;

export type NotesCohort = {
  notes: NoteDirectoryRow[];
  campuses: { id: string; name: string }[];
  authors: { id: string; name: string }[];
  totalItems: number;
  totalPages: number;
};
