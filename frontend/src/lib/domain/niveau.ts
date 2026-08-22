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
 * Collège levels: the first four rungs of the progression above.
 *
 * Derived by slicing `NIVEAUX` rather than re-listing the values, so a rename
 * or an insertion in the catalogue can't leave the two lists disagreeing.
 */
export const COLLEGE_NIVEAUX: readonly Niveau[] = NIVEAUX.slice(0, 4);

const COLLEGE_NIVEAU_SET = new Set<string>(COLLEGE_NIVEAUX);

/**
 * Whether a talent at this level goes through the onboarding wizard.
 *
 * Collégiens do not: the seminar settled that Jump has no reliable guardian
 * contact for them, so they reach the app without a dossier. Everyone from
 * seconde up does.
 *
 * **Unknown levels fail open** - both `null` and `'autre'` are eligible. An
 * unset level is far more likely a lycée-age prospect whose sync has not landed
 * than a collégien, and `'autre'` is a catch-all that already holds post-bac
 * profiles. Refusing onboarding on a fuzzy value would silently deny a talent
 * their dossier, and nothing would report it; the opposite error just shows
 * them a wizard they can complete. Do not "fix" `'autre'` into the collège
 * bucket without a case that outweighs that asymmetry.
 */
export function isOnboardingEligible(
  niveau: string | null | undefined,
): boolean {
  if (niveau == null) return true;
  return !COLLEGE_NIVEAU_SET.has(niveau);
}
