import type { Prisma } from '@prisma/client';

/**
 * Token-AND search, as Prisma `where` fragments: the server-side twin of
 * `components/staff/datatable/search.ts`, which the in-memory staff lists use.
 *
 * Every search box here used to match the whole query against one column at a
 * time, so "Léa Dupont" was contained in neither `prenom` nor `nom` and found
 * nobody, while "Léa" alone did. A query is a set of words instead: each one
 * has to match at least one of the searched fields, in any order.
 *
 * What the twin does and this does not: fold diacritics. `mode: 'insensitive'`
 * is an `ILIKE`, which ignores case and nothing else, so folding the query here
 * would only stop "Léa" from finding "Léa". Matching "Lea" to "Léa" in SQL takes
 * `unaccent`, which Prisma cannot express in a `where`.
 *
 * There is no character whitelist either. The ones this replaced were written
 * for the PocketBase filter strings the query was once interpolated into; Prisma
 * binds its parameters, so a whitelist only ever dropped legitimate letters
 * (`œ` is outside `À-ÿ`). Binding is not escaping, though: Prisma hands a
 * `contains` value to `LIKE` as a pattern, so `%` and `_` in it are wildcards,
 * and `containsToken` escapes them so a word is only ever matched literally.
 */

/** Whitespace-separated words of a query, order-free. Empty means no search. */
export function queryTokens(query: string): string[] {
  return query.trim().split(/\s+/).filter(Boolean);
}

/**
 * The `contains` filter every searched text field takes a token through, with
 * the `LIKE` metacharacters escaped. Without it "jean_d" also finds "jeanad",
 * and a lone "%" finds everybody. The backslash is escaped too, being the
 * escape character itself.
 */
export function containsToken(token: string) {
  const literal = token.replace(/[\\%_]/g, (c) => `\\${c}`);
  return { contains: literal, mode: 'insensitive' as const };
}

/**
 * One `{ OR }` clause per token, to spread into the caller's `AND` array:
 * `fieldsMatching(token)` lists every way a single word may match a row. An
 * empty query yields no clause, which is what an empty search box means.
 */
export function everyTokenMatches<W>(
  query: string,
  fieldsMatching: (token: string) => W[],
): { OR: W[] }[] {
  return queryTokens(query).map((token) => ({ OR: fieldsMatching(token) }));
}

/**
 * The fields a talent is found by, wherever staff look one up by who they are:
 * first name, last name, login e-mail. Shared so a talent findable in one list
 * is findable by the same words in the next.
 */
export function talentIdentityMatches(
  token: string,
): Prisma.TalentWhereInput[] {
  const contains = containsToken(token);
  return [
    { prenom: contains },
    { nom: contains },
    { user: { email: contains } },
  ];
}

/** `everyTokenMatches` over a talent's identity, as one `TalentWhereInput`. */
export function talentSearchWhere(query: string): Prisma.TalentWhereInput {
  const clauses = everyTokenMatches(query, talentIdentityMatches);
  return clauses.length ? { AND: clauses } : {};
}
