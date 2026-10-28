import { CIVILITE_OPTIONS } from '$lib/domain/profile';
import { compareNiveaux, niveauLabel } from '$lib/domain/niveau';
import {
  INSCRIT_STATUS_LABELS,
  type InscritStatus,
  type RulesStatus,
} from '$lib/domain/dossierCompliance';
import type { ImageRightsStatus } from '$lib/domain/imageRights';
import {
  PARCOURS_BUCKETS,
  PARCOURS_BUCKET_LABELS,
  parcoursBucket,
} from '$lib/domain/enrolmentHistory';
import {
  INSCRITS_FACETS,
  INSCRITS_NONE,
  type InscritsFacet,
  type InscritsSortKey,
  type InscritsView,
} from '$lib/domain/inscritsView';

/** An interest as a row carries it: enough for a chip and a filter value. */
export type InscritInterest = { id: string; nom: string; emoji: string | null };

/** One roster row of an event, as the Inscrits page lists it and the event
 *  home counts it. `id` is the participation id (stable row key). */
export type InscritRow = {
  id: string;
  talentId: string;
  nom: string;
  prenom: string;
  civilite: string | null;
  niveau: string | null;
  schoolId: string | null;
  schoolName: string | null;
  // Cumulative XP, drives the sortable XP column + its explainer tooltip.
  xp: number;
  // Enrolments on the campus at earlier events: the Parcours column
  // (`$lib/domain/enrolmentHistory`).
  priorEnrolments: number;
  // Declared tech interests, in the catalogue's own order.
  techInterests: InscritInterest[];
  // Folded three-state funnel status (jamais / en cours / prêt); see
  // `inscritStatus`. Drives the badge, the statut filter and the sort.
  status: InscritStatus;
  // Whether the talent ever genuinely logged in: gates the status above and
  // drives the tooltip's Connexion line.
  connected: boolean;
  // Per-document dossier states behind the status badge: drive its tooltip
  // breakdown and feed the fold above.
  rulesStatus: RulesStatus;
  imageStatus: ImageRightsStatus;
  // The student's own online signature (`rulesSignedAt != null`), the act that
  // invites the guardian. Splits an undecided image into "awaiting parent" vs
  // "pending" in the tooltip; distinct from `rulesStatus === 'signed'`, which a
  // staff offline attestation can reach without ever inviting a parent.
  studentSigned: boolean;
  // Search haystack extras (not shown as columns).
  email: string | null;
  sfMemberStatus: string | null;
};

/** The cohort payload streamed behind the Inscrits page shell's `{#await}`:
 *  everything that needs the DB. */
export type InscritsCohort = {
  rows: InscritRow[];
};

/** One value of a facet with how many inscrits carry it. The shape a column's
 *  filter menu lists, and the one a card of the event home draws. */
export type FacetCount = { value: string; label: string; count: number };

/**
 * What the Inscrits table filters and sorts on, kept out of the component so
 * the rules can be read, and tested, on their own:
 *
 * - **A facet's values are the cohort's.** A value shows in a filter only when
 *   some inscrit carries it, with how many do. The count is over the whole
 *   cohort, not over what the other filters left, so it reads the same however
 *   the list is narrowed: it describes the event.
 * - **Several values of one facet widen, several facets narrow.** An inscrit is
 *   kept when, for every active facet, it carries one of the values ticked.
 * - **A value the cohort does not carry is ignored**, so a stale or hand-edited
 *   address filters on what still exists instead of emptying the list.
 * - **A facet the campus does not use is not offered**, and its param, if an
 *   address carries one, is ignored: no Statut where the campus does not
 *   onboard. A facet whose cohort carries a single value keeps its column,
 *   with no filter, since it could not narrow the list.
 *
 * Every facet is a column of the table. What a roster row does not show is
 * filtered on the page it belongs to: a closing's state on Closings, a
 * recommendation on Feedback.
 */

/** The statut filter's order: the rows still needing a chase first (never
 *  connected before in progress before ready). `no_dossier` comes last, past
 *  ready: there is nothing to do about it. */
export const INSCRIT_STATUS_ORDER: Record<InscritStatus, number> = {
  never_connected: 0,
  in_progress: 1,
  ready: 2,
  no_dossier: 3,
};

/** What the campus uses, which decides the facets on offer. */
export type RosterContext = {
  showStatut: boolean;
};

/** One facet as the table offers it, with the values the view ticks in it. */
export type RosterFacet = {
  facet: InscritsFacet;
  /** The column's label, and the chip's "Clé :". */
  title: string;
  /** Empty when the facet cannot narrow the list (one value or none). */
  options: FacetCount[];
  /** The ticked values the cohort carries (see "ignored" above). */
  selected: string[];
};

type FacetDef = {
  title: string;
  available: (ctx: RosterContext) => boolean;
  /** The values one row carries; several for the interests. */
  valuesOf: (row: InscritRow) => string[];
  /** The facet's values with their labels, in the order the menu lists them,
   *  before the ones no inscrit carries are dropped. */
  vocabulary: (rows: InscritRow[]) => [string, string][];
};

/** "Most carried first, then by name", for the open vocabularies. */
function byCount(
  rows: InscritRow[],
  valuesOf: (row: InscritRow) => [string, string][],
): [string, string][] {
  const tally = new Map<string, { label: string; count: number }>();
  for (const row of rows)
    for (const [value, label] of valuesOf(row)) {
      const entry = tally.get(value) ?? { label, count: 0 };
      entry.count += 1;
      tally.set(value, entry);
    }
  return [...tally.entries()]
    .sort(
      ([, a], [, b]) =>
        b.count - a.count || a.label.localeCompare(b.label, 'fr'),
    )
    .map(([value, { label }]) => [value, label]);
}

const NOT_FILLED: [string, string] = [INSCRITS_NONE, 'Non renseigné'];

const FACETS: Record<InscritsFacet, FacetDef> = {
  genre: {
    title: 'Genre',
    available: () => true,
    valuesOf: (r) => [r.civilite ?? INSCRITS_NONE],
    vocabulary: () => [
      ...CIVILITE_OPTIONS.map((o): [string, string] => [o.value, o.label]),
      NOT_FILLED,
    ],
  },
  parcours: {
    title: 'Parcours',
    available: () => true,
    valuesOf: (r) => [parcoursBucket(r.priorEnrolments)],
    vocabulary: () =>
      PARCOURS_BUCKETS.map((b) => [b, PARCOURS_BUCKET_LABELS[b]]),
  },
  tech: {
    title: 'Tech',
    available: () => true,
    valuesOf: (r) => {
      const ids = r.techInterests.map((i) => i.id);
      return ids.length > 0 ? ids : [INSCRITS_NONE];
    },
    vocabulary: (rows) => [
      ...byCount(rows, (r) => r.techInterests.map((i) => [i.id, i.nom])),
      [INSCRITS_NONE, 'Aucun'],
    ],
  },
  lycee: {
    title: 'Lycée',
    available: () => true,
    valuesOf: (r) => [r.schoolId ?? INSCRITS_NONE],
    vocabulary: (rows) => [
      ...byCount(rows, (r) =>
        r.schoolId && r.schoolName ? [[r.schoolId, r.schoolName]] : [],
      ),
      NOT_FILLED,
    ],
  },
  niveau: {
    title: 'Niveau',
    available: () => true,
    valuesOf: (r) => [r.niveau ?? INSCRITS_NONE],
    vocabulary: (rows) => [
      ...[...new Set(rows.map((r) => r.niveau).filter((n) => n !== null))]
        .sort(compareNiveaux)
        .map((n): [string, string] => [n, niveauLabel(n)]),
      NOT_FILLED,
    ],
  },
  statut: {
    title: 'Statut',
    available: (ctx) => ctx.showStatut,
    valuesOf: (r) => [r.status],
    vocabulary: () =>
      (Object.keys(INSCRIT_STATUS_LABELS) as InscritStatus[])
        .sort((a, b) => INSCRIT_STATUS_ORDER[a] - INSCRIT_STATUS_ORDER[b])
        .map((s) => [s, INSCRIT_STATUS_LABELS[s]]),
  },
};

/**
 * Every value of a facet the cohort carries, with how many inscrits carry it,
 * in the order its menu lists them. The one count the Inscrits filters and the
 * event home's cards share, so a card's part always names a value the filter it
 * opens recognises. Unlike a filter, it keeps a facet whose cohort carries a
 * single value: a card still has that one part to show.
 */
export function facetTally(
  rows: InscritRow[],
  facet: InscritsFacet,
): FacetCount[] {
  const def = FACETS[facet];
  const counts = new Map<string, number>();
  for (const row of rows)
    for (const value of def.valuesOf(row))
      counts.set(value, (counts.get(value) ?? 0) + 1);
  return def
    .vocabulary(rows)
    .filter(([value]) => (counts.get(value) ?? 0) > 0)
    .map(([value, label]) => ({ value, label, count: counts.get(value) ?? 0 }));
}

/** The facets the campus offers, each with its counted values and what the
 *  view ticks in it. */
export function rosterFacets(
  rows: InscritRow[],
  ctx: RosterContext,
  view: InscritsView,
): RosterFacet[] {
  return INSCRITS_FACETS.filter((facet) => FACETS[facet].available(ctx)).map(
    (facet) => {
      const options = facetTally(rows, facet);
      // One value cannot narrow anything (every inscrit has it), so such a
      // facet is not offered as a filter and its param is ignored.
      const offered = new Set(
        options.length > 1 ? options.map((o) => o.value) : [],
      );
      return {
        facet,
        title: FACETS[facet].title,
        options: options.length > 1 ? options : [],
        selected: view.facets[facet].filter((v) => offered.has(v)),
      };
    },
  );
}

/** Whether a row survives every active facet. */
export function matchesFacets(row: InscritRow, facets: RosterFacet[]): boolean {
  return facets.every(
    ({ facet, selected }) =>
      selected.length === 0 ||
      FACETS[facet].valuesOf(row).some((v) => selected.includes(v)),
  );
}

export function compareRows(
  a: InscritRow,
  b: InscritRow,
  key: InscritsSortKey,
): number {
  switch (key) {
    case 'prenom':
      return a.prenom.localeCompare(b.prenom, 'fr');
    case 'nom':
      return a.nom.localeCompare(b.nom, 'fr');
    case 'xp':
      return a.xp - b.xp;
  }
}
