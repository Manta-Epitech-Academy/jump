import type { Prisma } from '@prisma/client';
import {
  containsToken,
  everyTokenMatches,
  talentIdentityMatches,
} from '$lib/server/db/textSearch';
import { FACET_NONE, type CountedFacet } from '$lib/domain/listFacets';
import type { SortDir } from '$lib/domain/listView';
import type { NoteFilters, NotesFacet, NotesSortKey } from './view';

// Admin is campus-agnostic, so the notes oversight directory is global across
// every campus. Where building / row projection live here (not in the page) so
// the page and any future export can't drift, mirrors `admin/talents/query.ts`;
// the view it reads is parsed in `./view` and resolved in `./facets`.

export const PER_PAGE = 50;

export function buildNoteWhere(
  f: NoteFilters,
): Prisma.Note_TalentNoteWhereInput {
  const and: Prisma.Note_TalentNoteWhereInput[] = [];

  // Search the note body AND the talent it's about (name / email), so one box
  // finds "what was written" or "about whom". Per word, so the two combine:
  // "retard dupont" finds the notes about Dupont that mention a lateness.
  and.push(
    ...everyTokenMatches(f.q, (token) => [
      { body: containsToken(token) },
      { talent: { OR: talentIdentityMatches(token) } },
    ]),
  );

  const { campus, auteur } = f.facets;

  // Campus = the talent participates on one of the selected campuses (talents
  // carry no direct campus FK), same resolution as the talents directory.
  if (campus.length) {
    and.push({
      talent: { participations: { some: { campusId: { in: campus } } } },
    });
  }

  // Several authors widen; `aucun` is a note whose author's account is gone.
  if (auteur.length) {
    const ids = auteur.filter((a) => a !== FACET_NONE);
    and.push({
      OR: [
        ...(ids.length ? [{ authorId: { in: ids } }] : []),
        ...(auteur.includes(FACET_NONE) ? [{ authorId: null }] : []),
      ],
    });
  }

  return and.length ? { AND: and } : {};
}

export function buildNoteOrderBy(
  sort: NotesSortKey,
  dir: SortDir,
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
  /** The Auteur column's counts over every note (`./facets`); the page ticks
   *  them from its address. */
  facetCounts: CountedFacet<NotesFacet>[];
  /** The campus select's options: a campus has no column to filter from. */
  campuses: { id: string; name: string }[];
  totalItems: number;
  totalPages: number;
};
