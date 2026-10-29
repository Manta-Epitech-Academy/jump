import { describe, it, expect } from 'vitest';
import { buildNoteWhere } from './query';
import { parseNoteFilters } from './view';

describe('buildNoteWhere', () => {
  const where = (query: string) =>
    buildNoteWhere(parseNoteFilters(new URLSearchParams(query)));

  it('keeps the notes of a deleted account under « Auteur inconnu »', () => {
    // A deleted staff account leaves its notes with no author, and `aucun` is
    // the only way to reach them: dropping it would answer the menu's « Auteur
    // inconnu » with an empty list.
    expect(where('auteur=aucun')).toEqual({
      AND: [{ OR: [{ authorId: null }] }],
    });
    expect(where('auteur=staff-1,aucun')).toEqual({
      AND: [{ OR: [{ authorId: { in: ['staff-1'] } }, { authorId: null }] }],
    });
  });
});
