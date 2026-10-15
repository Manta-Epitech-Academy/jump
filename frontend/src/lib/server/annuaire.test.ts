import { describe, it, expect } from 'vitest';
import { annuaireSearchWhere } from './annuaire';

describe('annuaireSearchWhere', () => {
  it('asks for every word in the name or the commune, not the whole query in one', () => {
    // "hugo paris" put both words in one search() per field, so a lycée whose
    // name holds one and whose town holds the other was never returned (#360).
    expect(annuaireSearchWhere(' hugo   paris ')).toBe(
      'type_etablissement="Lycée"' +
        " AND (search(nom_etablissement, 'hugo') OR search(nom_commune, 'hugo'))" +
        " AND (search(nom_etablissement, 'paris') OR search(nom_commune, 'paris'))",
    );
  });

  it('escapes a quote with a backslash, the only form ODSQL parses', () => {
    // Doubling it, as SQL does, is a syntax error the dataset answers with a
    // 400, so "l'isle" used to find nothing at all.
    expect(annuaireSearchWhere("l'isle")).toContain(
      "search(nom_commune, 'l\\'isle')",
    );
  });

  it('drops a token with no letter or digit, which search() would match nowhere', () => {
    // "henri -" as one phrase finds the Henri lycées; a clause of its own for
    // "-" made every result disappear.
    expect(annuaireSearchWhere('henri - paris')).toBe(
      annuaireSearchWhere('henri paris'),
    );
    expect(annuaireSearchWhere("n° d'")).toContain("'n°'");
    expect(annuaireSearchWhere(' - . ')).toBeNull();
  });

  it('escapes a backslash first, so a trailing one cannot swallow the quote', () => {
    expect(annuaireSearchWhere('a\\')).toContain(
      "search(nom_commune, 'a\\\\')",
    );
  });
});
