import { describe, it, expect } from 'vitest';
import {
  catalogueDomainOptions,
  catalogueGaps,
  cleanNotions,
  subjectsInDomain,
  thumbnailOf,
  type CatalogueCompleteness,
} from './workshopCatalogue';

const complete: CatalogueCompleteness = {
  enabled: true,
  tagline: 'Programme les fantômes',
  level: 'beginner',
  domainCount: 1,
  pictureCount: 1,
  supervisorCode: 'CODE-2026',
};

describe('catalogueGaps', () => {
  it('shows a complete subject, notions or not', () => {
    expect(catalogueGaps(complete)).toEqual([]);
  });

  it('names every field a subject still lacks', () => {
    expect(
      catalogueGaps({
        enabled: false,
        tagline: null,
        level: null,
        domainCount: 0,
        pictureCount: 0,
        supervisorCode: null,
      }),
    ).toEqual([
      'enabled',
      'tagline',
      'level',
      'domains',
      'picture',
      'supervisorCode',
    ]);
    expect(catalogueGaps({ ...complete, pictureCount: 0 })).toEqual([
      'picture',
    ]);
    expect(catalogueGaps({ ...complete, supervisorCode: null })).toEqual([
      'supervisorCode',
    ]);
  });
});

describe('cleanNotions', () => {
  it('keeps the first spelling of a repeat, where it stood', () => {
    expect(cleanNotions([' FSM ', 'Arbres de décision', 'fsm', '  '])).toEqual([
      'FSM',
      'Arbres de décision',
    ]);
  });
});

describe('thumbnailOf', () => {
  it('draws the mascot, then the still, then the visual', () => {
    const media = { kind: 'media' as const };
    const poster = { kind: 'poster' as const };
    const mascot = { kind: 'mascot' as const };
    expect(thumbnailOf([media, poster, mascot])).toBe(mascot);
    expect(thumbnailOf([media, poster])).toBe(poster);
    expect(thumbnailOf([media])).toBe(media);
    expect(thumbnailOf([])).toBeNull();
  });
});

describe('the domain filter', () => {
  const cyber = { key: 'cybersecurite', label: 'Cybersécurité' };
  const ai = { key: 'ia-data', label: 'IA/DATA' };
  const algo = { key: 'algorithmie', label: 'Algorithmie' };
  const spam = { slug: 'spam', domains: [ai, cyber] };
  const ctf = { slug: 'ctf', domains: [cyber] };
  const pacman = { slug: 'pacman', domains: [algo] };
  const subjects = [spam, ctf, pacman];

  it('files a subject in two domains under both', () => {
    expect(subjectsInDomain(subjects, 'cybersecurite')).toEqual([spam, ctf]);
    expect(subjectsInDomain(subjects, 'ia-data')).toEqual([spam]);
    expect(subjectsInDomain(subjects, null)).toEqual(subjects);
  });

  it('offers only the domains a shown subject carries, with their count', () => {
    expect(catalogueDomainOptions(subjects)).toEqual([
      { ...algo, count: 1 },
      { ...cyber, count: 2 },
      { ...ai, count: 1 },
    ]);
    expect(catalogueDomainOptions([])).toEqual([]);
  });
});
