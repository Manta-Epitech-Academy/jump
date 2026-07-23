/**
 * Canonical school-level (« niveau scolaire ») catalogue.
 *
 * Single source of truth shared by:
 *  - dev students list filter (`staff/dev/students`)
 *  - pedago event « inscrits » filter + badges
 *  - broadcast audience targeting (`domain/broadcasts.ts`)
 *  - Salesforce talent sync (`server/services/syncService.ts`)
 *
 * Values match the `ClassLevel` enum emitted by **jump-sf-worker** so the sync
 * payload's `class_level` maps straight onto `Talent.niveau` with no lossy
 * second mapping. The array order is the natural school progression and is
 * reused anywhere a sorted display of levels is needed.
 */
export const NIVEAUX = [
  '6eme',
  '5eme',
  '4eme',
  '3eme',
  '2nde',
  '1ere',
  'terminale',
  'bac_1',
  'bac_2',
  'bac_3',
  'bac_4',
  'bac_5',
  'tech2',
  'coding_academy',
  'wac',
  'autre',
] as const;

export type Niveau = (typeof NIVEAUX)[number];

/** Human-facing French label for each level. */
const NIVEAU_LABELS: Record<Niveau, string> = {
  '6eme': '6ème',
  '5eme': '5ème',
  '4eme': '4ème',
  '3eme': '3ème',
  '2nde': '2nde',
  '1ere': '1ère',
  terminale: 'Terminale',
  bac_1: 'Bac +1',
  bac_2: 'Bac +2',
  bac_3: 'Bac +3',
  bac_4: 'Bac +4',
  bac_5: 'Bac +5',
  tech2: 'Tech2',
  coding_academy: 'Coding Academy',
  wac: 'W@C',
  autre: 'Autre',
};

const NIVEAU_SET = new Set<string>(NIVEAUX);

/** Narrowing guard for inbound values (e.g. the Salesforce sync payload). */
export function isNiveau(value: string | null | undefined): value is Niveau {
  return value != null && NIVEAU_SET.has(value);
}

/**
 * Display label for a stored `niveau`. Falls back to the raw value for legacy
 * rows not yet normalised, and to an empty string when unset.
 */
export function niveauLabel(niveau: string | null | undefined): string {
  if (!niveau) return '';
  return NIVEAU_LABELS[niveau as Niveau] ?? niveau;
}

/**
 * Sort comparator following the school-progression order of `NIVEAUX`.
 * Unknown values sort last, then alphabetically (French collation).
 */
export function compareNiveaux(a: string, b: string): number {
  const ai = NIVEAUX.indexOf(a as Niveau);
  const bi = NIVEAUX.indexOf(b as Niveau);
  if (ai === -1 && bi === -1) return a.localeCompare(b, 'fr');
  if (ai === -1) return 1;
  if (bi === -1) return -1;
  return ai - bi;
}

/**
 * Progression ladder mapping for annual school-year rollover.
 * High school and middle school levels advance by one step:
 *   6eme -> 5eme -> 4eme -> 3eme -> 2nde -> 1ere -> terminale -> bac_1 -> bac_2 -> bac_3 -> bac_4 -> bac_5
 * Terminal & post-bac levels (bac_5, tech2, coding_academy, wac, autre) do not advance.
 * Unknown or empty levels return null or their raw value.
 */
const NIVEAU_ADVANCEMENT_MAP: Partial<Record<Niveau, Niveau>> = {
  '6eme': '5eme',
  '5eme': '4eme',
  '4eme': '3eme',
  '3eme': '2nde',
  '2nde': '1ere',
  '1ere': 'terminale',
  terminale: 'bac_1',
  bac_1: 'bac_2',
  bac_2: 'bac_3',
  bac_3: 'bac_4',
  bac_4: 'bac_5',
  bac_5: 'bac_5',
  tech2: 'tech2',
  coding_academy: 'coding_academy',
  wac: 'wac',
  autre: 'autre',
};

export function advanceNiveau(
  niveau: string | null | undefined,
): string | null {
  if (!niveau) return null;
  if (!isNiveau(niveau)) return niveau;
  return NIVEAU_ADVANCEMENT_MAP[niveau] ?? niveau;
}
