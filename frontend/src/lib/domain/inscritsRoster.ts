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
  byCount,
  countFacet,
  FACET_NONE_LABEL,
  listFacets,
  matchesListFacets,
  type FacetCount,
  type FacetDef,
  type ListFacet,
} from '$lib/domain/listFacets';
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

/**
 * What the Inscrits table filters and sorts on, kept out of the component so
 * the rules can be read, and tested, on their own. The filter rules are every
 * roster list's (`$lib/domain/listFacets`); what is the Inscrits page's own:
 *
 * - **A facet the campus does not use is not offered**, and its param, if an
 *   address carries one, is ignored: no Statut where the campus does not
 *   onboard.
 * - Every facet is a column of the table. What a roster row does not show is
 *   filtered on the page it belongs to: a closing's state on Closings, a
 *   recommendation on Feedback.
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
export type RosterFacet = ListFacet<InscritsFacet>;

type InscritsFacetDef = FacetDef<InscritRow> & {
  available: (ctx: RosterContext) => boolean;
};

const NOT_FILLED: [string, string] = [INSCRITS_NONE, FACET_NONE_LABEL];

const FACETS: Record<InscritsFacet, InscritsFacetDef> = {
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
 * opens recognises.
 */
export function facetTally(
  rows: readonly InscritRow[],
  facet: InscritsFacet,
): FacetCount[] {
  return countFacet(rows, FACETS[facet]);
}

/** The facets the campus offers, each with its counted values and what the
 *  view ticks in it. */
export function rosterFacets(
  rows: readonly InscritRow[],
  ctx: RosterContext,
  view: InscritsView,
): RosterFacet[] {
  const offered = INSCRITS_FACETS.filter((facet) =>
    FACETS[facet].available(ctx),
  );
  return listFacets(rows, FACETS, offered, view.facets);
}

/** Whether a row survives every active facet. */
export function matchesFacets(
  row: InscritRow,
  facets: readonly RosterFacet[],
): boolean {
  return matchesListFacets(row, facets, FACETS);
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
