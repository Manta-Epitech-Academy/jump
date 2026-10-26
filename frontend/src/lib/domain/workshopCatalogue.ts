import type { WorkshopLevel } from '@prisma/client';
import type { WorkshopCoverKind } from './workshops';

// ─── Subject catalogue ─────────────────────────────────────────────────────
//
// The dev space's catalogue presents the online activities (`Workshop_Activity`)
// to the staff as subjects to offer an event: a card each, filed under domains,
// with a level and the notions it practises. All of it is authored over the
// admin API, with the activity (`write_workshop`) and, for the domains
// themselves, `write_workshop_domain`.
//
// A subject is shown only once it is complete. A card with no tagline or no
// picture tells a team nothing to choose on, and the catalogue is better empty
// than filled with blanks, so the rule is decided here, once, and read twice:
// the page keeps the complete subjects, and `config_workshops` tells the admin
// what each other one lacks.

/** The levels, in the order a person reads them. */
export const WORKSHOP_LEVELS = [
  'beginner',
  'intermediate',
  'expert',
  'all_levels',
] as const satisfies readonly WorkshopLevel[];

export const WORKSHOP_LEVEL_LABELS: Record<WorkshopLevel, string> = {
  beginner: 'Débutant',
  intermediate: 'Intermédiaire',
  expert: 'Expert',
  all_levels: 'Tous niveaux',
};

/** Ceiling on a domain's label: a chip and a filter entry, not a sentence. */
export const WORKSHOP_DOMAIN_LABEL_MAX = 40;

/** Ceiling on a domain's key (shaped by `CATALOGUE_KEY_PATTERN`): it spells a label. */
export const WORKSHOP_DOMAIN_KEY_MAX = WORKSHOP_DOMAIN_LABEL_MAX;

/**
 * Why an archived domain is refused as a new one for a subject, in the one
 * wording the write uses.
 */
export function archivedDomainRefusal(label: string): string {
  return `Le domaine « ${label} » est archivé : il n'est plus donné à un sujet. Désarchivez-le, ou choisissez-en un autre.`;
}

/**
 * Ceilings on the notions, there to bound what one call can store, not to
 * shape what an admin writes: the card wraps whatever it is given.
 */
export const NOTION_LABEL_MAX = 80;
export const NOTIONS_MAX = 20;

/**
 * The notions as stored: trimmed, the empty ones dropped, and a repeat dropped
 * whatever its case, the first spelling kept where it stood. A list is written
 * whole, so a model restating it with one entry twice should get the list it
 * meant rather than a refusal.
 */
export function cleanNotions(notions: readonly string[]): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const raw of notions) {
    const notion = raw.trim();
    const folded = notion.toLocaleLowerCase('fr');
    if (!notion || seen.has(folded)) continue;
    seen.add(folded);
    kept.push(notion);
  }
  return kept;
}

/** What a subject can lack, named after the field of `write_workshop` that fills it. */
export type CatalogueGap =
  'enabled' | 'tagline' | 'level' | 'domains' | 'picture';

export type CatalogueCompleteness = {
  enabled: boolean;
  tagline: string | null;
  level: WorkshopLevel | null;
  domainCount: number;
  pictureCount: number;
};

/**
 * What keeps a subject out of the catalogue; empty when it is shown. Offered,
 * with a tagline, a level, at least one domain and at least one picture. The
 * notions are not asked for: a card without them drops that line.
 */
export function catalogueGaps(subject: CatalogueCompleteness): CatalogueGap[] {
  const gaps: CatalogueGap[] = [];
  if (!subject.enabled) gaps.push('enabled');
  if (!subject.tagline) gaps.push('tagline');
  if (!subject.level) gaps.push('level');
  if (subject.domainCount === 0) gaps.push('domains');
  if (subject.pictureCount === 0) gaps.push('picture');
  return gaps;
}

/**
 * Which picture a card draws, in this order: the mascot, drawn for a small
 * square, then the chosen still, then the visual. Always shown still: a grid of
 * moving cards is noise, so an animation shows its first frame.
 */
const THUMBNAIL_ORDER: readonly WorkshopCoverKind[] = [
  'mascot',
  'poster',
  'media',
];

export function thumbnailOf<T extends { kind: WorkshopCoverKind }>(
  pictures: readonly T[],
): T | null {
  for (const kind of THUMBNAIL_ORDER) {
    const picture = pictures.find((p) => p.kind === kind);
    if (picture) return picture;
  }
  return null;
}

export type CatalogueDomain = { key: string; label: string };

/** A subject as its catalogue card shows it. */
export type CatalogueSubject = {
  slug: string;
  label: string;
  tagline: string;
  level: WorkshopLevel;
  domains: CatalogueDomain[];
  notions: string[];
  /** Always a still: the mascot, the chosen still or the visual's first frame. */
  thumbnail: { url: string; width: number; height: number };
};

export type CatalogueDomainOption = CatalogueDomain & {
  /** Subjects shown under it. */
  count: number;
};

/**
 * The domains the filter offers: those at least one shown subject carries,
 * archived or not, alphabetical, each with how many subjects it keeps. Never one
 * no subject carries, so no choice empties the page.
 */
export function catalogueDomainOptions(
  subjects: readonly { domains: readonly CatalogueDomain[] }[],
): CatalogueDomainOption[] {
  const options = new Map<string, CatalogueDomainOption>();
  for (const subject of subjects) {
    for (const domain of subject.domains) {
      const option = options.get(domain.key);
      if (option) option.count += 1;
      else options.set(domain.key, { ...domain, count: 1 });
    }
  }
  return [...options.values()].sort((a, b) =>
    a.label.localeCompare(b.label, 'fr'),
  );
}

/** The subjects a domain keeps, a subject in two domains under both; all of them for null. */
export function subjectsInDomain<
  T extends { domains: readonly CatalogueDomain[] },
>(subjects: readonly T[], domainKey: string | null): T[] {
  if (domainKey === null) return [...subjects];
  return subjects.filter((subject) =>
    subject.domains.some((domain) => domain.key === domainKey),
  );
}
