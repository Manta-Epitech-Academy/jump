import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { assertTestDatabase } from './testDatabase';
import {
  buildTalentWhere,
  parseTalentFilters,
} from '../../../../routes/(staff)/staff/admin/talents/query';
import {
  buildNoteWhere,
  parseNoteFilters,
} from '../../../../routes/(staff)/staff/admin/notes/query';

/**
 * A multi-word search matches word by word (#360).
 *
 * The directory matched the whole query against one column at a time, so
 * "Léa Dupont" was contained in neither `prenom` nor `nom` and the admin read
 * "Aucun talent ne correspond" for a talent the first word alone had just found.
 * Pinned against Postgres rather than as a `where` shape, because the shape is
 * not the claim: what matters is which rows an `ILIKE` per word returns.
 */
describe('multi-word staff search (integration)', () => {
  // A surname no other suite writes, so the assertions can read the matches
  // without being narrowed by id and still not see another suite's rows.
  const surname = `Dupont${Date.now()}`;
  const talentIds: string[] = [];
  let lea = '';
  let noteId = '';

  const directory = async (q: string) => {
    const { where } = buildTalentWhere(
      parseTalentFilters(new URLSearchParams({ q })),
    );
    const rows = await prisma.talent.findMany({
      where: { AND: [where, { id: { in: talentIds } }] },
      select: { id: true },
    });
    return rows.map((r) => r.id).sort();
  };

  const notes = async (q: string) => {
    const rows = await prisma.note_TalentNote.findMany({
      where: {
        AND: [
          buildNoteWhere(parseNoteFilters(new URLSearchParams({ q }))),
          { talentId: { in: talentIds } },
        ],
      },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  };

  beforeAll(async () => {
    assertTestDatabase();
    const talents = await Promise.all(
      ['Léa', 'Marc'].map((prenom) =>
        prisma.talent.create({ data: { prenom, nom: surname } }),
      ),
    );
    talentIds.push(...talents.map((t) => t.id));
    lea = talents[0].id;
    const note = await prisma.note_TalentNote.create({
      data: { talentId: lea, body: 'Arrivée en retard le deuxième jour.' },
    });
    noteId = note.id;
  });

  afterAll(async () => {
    await prisma.note_TalentNote.deleteMany({
      where: { talentId: { in: talentIds } },
    });
    await prisma.talent.deleteMany({ where: { id: { in: talentIds } } });
  });

  it('finds a talent by first name then surname, and the other way round', async () => {
    expect(await directory(`Léa ${surname}`)).toEqual([lea]);
    expect(await directory(`${surname} léa`)).toEqual([lea]);
  });

  it('requires every word, so a second word narrows instead of widening', async () => {
    expect(await directory(surname)).toHaveLength(2);
    expect(await directory(`Léa Martin${surname}`)).toEqual([]);
  });

  it('ignores the spacing around and between words', async () => {
    expect(await directory(`  Léa   ${surname} `)).toEqual([lea]);
  });

  it('reads % and _ as the characters typed, not as LIKE wildcards', async () => {
    // "L_a" would otherwise find Léa, and a lone "%" every talent there is.
    expect(await directory(`L_a ${surname}`)).toEqual([]);
    expect(await directory(`% ${surname}`)).toEqual([]);
  });

  it('matches a note on its text and its talent at once', async () => {
    // One word from what was written, one from whom it is about: the words are
    // matched separately, so they may land in different places.
    expect(await notes(`retard ${surname}`)).toEqual([noteId]);
    expect(await notes(`${surname} léa`)).toEqual([noteId]);
    expect(await notes(`retard Marc`)).toEqual([]);
  });
});
