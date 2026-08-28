import { describe, expect, it } from 'vitest';
import {
  buildHaystack,
  foldForSearch,
  matchesAllTokens,
  searchTokens,
} from './search';

describe('foldForSearch', () => {
  it('strips diacritics and lowercases', () => {
    expect(foldForSearch('Léa ÉLOÏSE')).toBe('lea eloise');
  });

  it('leaves an unaccented value alone', () => {
    expect(foldForSearch('Dupont')).toBe('dupont');
  });
});

describe('searchTokens', () => {
  it('folds and splits on whitespace', () => {
    expect(searchTokens('  Léa   Dupont ')).toEqual(['lea', 'dupont']);
  });

  it('returns nothing for an empty query', () => {
    expect(searchTokens('   ')).toEqual([]);
  });
});

describe('matchesAllTokens', () => {
  const haystack = buildHaystack(['Léa', 'DUPONT', null, 'lea@example.org']);

  it('matches an accented name typed without accents', () => {
    expect(matchesAllTokens(haystack, searchTokens('lea'))).toBe(true);
  });

  it('ignores token order', () => {
    expect(matchesAllTokens(haystack, searchTokens('dupont lea'))).toBe(true);
  });

  it('requires every token', () => {
    expect(matchesAllTokens(haystack, searchTokens('lea martin'))).toBe(false);
  });

  it('matches everything on an empty query', () => {
    expect(matchesAllTokens(haystack, searchTokens(''))).toBe(true);
  });
});

describe('buildHaystack', () => {
  it('drops empty fields instead of joining blanks', () => {
    expect(buildHaystack(['Léa', null, undefined, ''])).toBe('lea');
  });
});
